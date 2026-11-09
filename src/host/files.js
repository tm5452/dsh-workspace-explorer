import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, open, opendir, readlink, realpath, stat } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { officeExtensions } from '../document-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { underPath } from '../ui/navigation.js';
import { registerPdfAssets } from './pdf-assets.js';
import { windowsFileOperation } from './shell-files.js';

const execute = promisify(execFile);
const endpoint = '/api/dsh.workspaceExplorer';
const thumbnailEndpoint = endpoint + '/thumbnail';
const maxEntries = 2000;
const maxMatches = 300;
const maxText = 2 * 1024 * 1024;
const maxBytes = 32 * 1024 * 1024;
const maxFileOperations = 128;
const invalidComponent = /[<>:"|?*\x00-\x1f]|[. ]$|^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³]) *(?:\.|$)/iu;

export function isDesktopHost() {
  return process.platform === 'win32' && Boolean(process.versions.electron) && process.connected === true
    && /[\\/]@deepseek-ai[\\/]dsh-desktop-host[\\/]lib[\\/]index\.js$/i.test(process.argv[1] ?? '');
}

class BrowseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeLocalPath(value) {
  if (typeof value !== 'string' || value.length > 32767 || !/^[a-z]:[\\/]/i.test(value)) {
    throw new BrowseError('请输入盘符开头的绝对路径，例如 D:\\资料');
  }
  const names = value.slice(3).split(/[\\/]/);
  if (names.some(name => name && name !== '.' && name !== '..' && invalidComponent.test(name))) {
    throw new BrowseError('路径中含有 Windows 不支持的名称');
  }
  const absolute = path.normalize(value);
  return absolute[0].toUpperCase() + absolute.slice(1);
}

function operationPaths(input) {
  const paths = Array.isArray(input) ? input : [input];
  if (!paths.length || paths.length > maxFileOperations) {
    throw new BrowseError('一次可操作 1 到 ' + maxFileOperations + ' 个项目');
  }
  return [...new Set(paths.map(normalizeLocalPath))];
}

function fileVersion(info) {
  return JSON.stringify([info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs]);
}

function decodePreviewText(data, eof) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data, { stream: !eof });
  } catch {
    throw new BrowseError('此文件不是 UTF-8 文本');
  }
  if (text.includes('\0')) throw new BrowseError('此格式没有可用的文本预览');
  return text;
}

async function scanDrives() {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -in 'Fixed','Removable','CDRom','Ram' } | ForEach-Object { $_.Name }";
  const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true, timeout: 5000, maxBuffer: 8192,
  });
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(line => /^[a-z]:\\$/i.test(line)).sort();
}

function createDiskAccess() {
  let cachedDrives = [];
  let expires = 0;
  let scanning;
  let cutProgress;
  async function drives(force = false) {
    if (!force && Date.now() < expires) return cachedDrives;
    scanning ??= scanDrives().then(result => {
      cachedDrives = result;
      expires = Date.now() + 5000;
      return result;
    }).finally(() => { scanning = undefined; });
    return scanning;
  }

  function requireWithin(input, root) {
    if (!underPath(input, root)) throw new BrowseError('此位置不在当前会话的工作区内', 403);
  }

  function requireNativeWithin(input, root) {
    const prefix = root.endsWith('\\') ? root : root + '\\';
    if (input !== root && !input.startsWith(prefix)) throw new BrowseError('此位置不在当前会话的工作区内', 403);
  }

  async function resolve(input, signal, workspace) {
    const absolute = normalizeLocalPath(input);
    if (workspace) requireWithin(absolute, workspace.root);
    const localRoots = await drives();
    signal.throwIfAborted();
    async function walk(target, links = 0) {
      const root = path.parse(target).root;
      if (!localRoots.includes(root.toUpperCase())) {
        throw new BrowseError('此盘符当前不可用或属于网络位置', 403);
      }
      if (links >= 32) throw new BrowseError('路径包含循环或过多链接');
      const parts = target.slice(root.length).split('\\').filter(Boolean);
      let current = root;
      for (const [index, name] of parts.entries()) {
        signal.throwIfAborted();
        const next = path.join(current, name);
        if (!(await lstat(next)).isSymbolicLink()) {
          current = next;
          continue;
        }
        // Junctions can return an extended path. Accept only the drive-rooted form.
        const link = (await readlink(next)).replace(/^\\\\\?\\(?=[a-z]:\\)/i, '');
        const destination = normalizeLocalPath(path.isAbsolute(link) ? link : path.join(current, link));
        return walk(normalizeLocalPath(path.join(destination, ...parts.slice(index + 1))), links + 1);
      }
      return current;
    }
    const target = await walk(absolute);
    if (!workspace) return target;
    const native = normalizeLocalPath(await realpath(target));
    requireNativeWithin(native, workspace.nativeRoot);
    return native;
  }

  async function scope(input, signal) {
    const root = normalizeLocalPath(input);
    const nativeRoot = normalizeLocalPath(await realpath(await resolve(root, signal)));
    return { root: root.length > 3 ? root.replace(/\\+$/, '') : root, nativeRoot };
  }

  async function list(input, signal, workspace) {
    if (input === null) {
      if (workspace) throw new BrowseError('此位置不在当前会话的工作区内', 403);
      const roots = await drives(true);
      return { entries: roots.map(root => ({
        name: '磁盘 (' + root.slice(0, 2) + ')', type: 'drive', path: root,
      })), truncated: false };
    }
    const target = await resolve(input, signal, workspace);
    const directory = await opendir(target);
    const entries = [];
    const files = [];
    let truncated = false;
    for await (const item of directory) {
      signal.throwIfAborted();
      if (entries.length === maxEntries) { truncated = true; break; }
      const type = item.isDirectory() ? 'directory' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'link' : 'other';
      const row = { name: item.name, type };
      entries.push(row);
      if (type === 'file' || type === 'link') files.push(row);
    }
    for (let index = 0; index < files.length; index += 32) {
      signal.throwIfAborted();
      await Promise.all(files.slice(index, index + 32).map(async row => {
        try {
          const child = path.join(target, row.name);
          let safe = row.type === 'link' ? await resolve(child, signal) : child;
          if (workspace && row.type === 'link') safe = normalizeLocalPath(await realpath(safe));
          if (workspace) requireNativeWithin(safe, workspace.nativeRoot);
          const info = await stat(safe);
          row.type = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
          if (info.isFile()) row.size = info.size;
        } catch {
          if (row.type === 'link') row.type = 'other';
        }
      }));
    }
    return { entries: workspace ? entries.filter(row => row.type !== 'other') : entries, truncated };
  }

  async function search(workspace, query, signal) {
    const needle = typeof query === 'string' && query.trim().toLowerCase();
    if (!needle || needle.length > 256) throw new BrowseError('请输入 1 到 256 个字符的文件名关键词');
    const matches = [];
    const folders = [''];
    let skipped = 0;
    while (folders.length) {
      signal.throwIfAborted();
      const relative = folders.pop();
      try {
        const expected = path.join(workspace.nativeRoot, relative);
        const folder = normalizeLocalPath(await realpath(expected));
        if (folder !== expected) continue; // A directory may have been replaced with a link during the scan.
        for await (const entry of await opendir(folder)) {
          signal.throwIfAborted();
          const child = path.join(relative, entry.name);
          if (entry.isDirectory()) { folders.push(child); continue; }
          if (!entry.name.toLowerCase().includes(needle)) continue;
          const absolute = path.join(workspace.root, child);
          if (entry.isSymbolicLink()) {
            try {
              const target = await resolve(absolute, signal, workspace);
              if (!(await stat(target)).isFile()) continue;
            } catch {
              signal.throwIfAborted();
              continue;
            }
          } else if (!entry.isFile()) {
            continue;
          }
          if (matches.length === maxMatches) return { matches, truncated: true, skipped };
          matches.push({ name: entry.name, path: absolute, relative: child });
        }
      } catch (error) {
        signal.throwIfAborted();
        if (!relative) throw error;
        skipped++;
      }
    }
    return { matches, truncated: false, skipped };
  }

  async function read(input, limit, signal, workspace, { version, sniffText } = {}) {
    const target = await resolve(input, signal, workspace);
    const info = await stat(target);
    if (!info.isFile()) throw new BrowseError('只能预览普通文件');
    if (limit === maxBytes && info.size > limit) throw new BrowseError('文件超过 32 MB 读取上限', 413);
    const handle = await open(target, 'r');
    try {
      const opened = await handle.stat();
      if (!opened.isFile()) throw new BrowseError('只能预览普通文件');
      if (version && fileVersion(opened) !== version) throw new BrowseError('文件已改变，请重新预览', 409);
      const buffer = Buffer.allocUnsafe(Math.min(opened.size, limit) + 1);
      let length = 0;
      while (length < buffer.length) {
        signal.throwIfAborted();
        const readSize = sniffText && length === 0 ? Math.min(4096, buffer.length) : buffer.length - length;
        const { bytesRead } = await handle.read(buffer, length, readSize, length);
        if (!bytesRead) break;
        if (sniffText && length === 0) decodePreviewText(buffer.subarray(0, bytesRead), false);
        length += bytesRead;
      }
      const eof = length <= limit && length <= opened.size;
      if (limit === maxBytes && (!eof || opened.size > limit)) throw new BrowseError('文件超过 32 MB 读取上限', 413);
      if (version && (!eof || fileVersion(await handle.stat()) !== version)) {
        throw new BrowseError('文件已改变，请重新预览', 409);
      }
      return { data: buffer.subarray(0, Math.min(length, limit)), eof };
    } finally {
      await handle.close();
    }
  }

  async function renderOffice(input, signal, workspace, converter) {
    const absolute = normalizeLocalPath(input);
    const extension = path.extname(absolute).slice(1).toLowerCase();
    if (!officeExtensions.has(extension)) throw new BrowseError('不是可预览的 Office 格式');
    const target = await resolve(absolute, signal, workspace);
    const info = await stat(target);
    if (!info.isFile()) throw new BrowseError('只能预览普通文件');
    if (info.size > maxBytes) throw new BrowseError('文件超过 32 MB 读取上限', 413);
    const version = fileVersion(info);
    const result = await converter.convert({
      extension, priority: 'foreground',
      source: {
        key: JSON.stringify(['dsh-workspace-explorer', workspace?.nativeRoot, target]),
        version, bytes: info.size,
        read: async (readSignal, budget) => {
          const { data } = await read(absolute, Math.min(budget, maxBytes), readSignal, workspace, { version });
          return { bytes: data, version };
        },
      },
    }, signal);
    return result.pdf;
  }

  async function locate(input, signal, workspace) {
    const absolute = normalizeLocalPath(input);
    const target = await resolve(absolute, signal, workspace);
    const info = await stat(target);
    if (info.isDirectory()) return { path: absolute, nativePath: target, type: 'directory' };
    if (info.isFile()) return { path: absolute, nativePath: target, type: 'file', name: path.basename(absolute) };
    throw new BrowseError('该路径不指向普通文件或文件夹');
  }

  async function mutableEntry(input, signal) {
    const absolute = normalizeLocalPath(input);
    const name = path.basename(absolute);
    if (!name) throw new BrowseError('不能对磁盘根目录执行此操作');
    const folder = await realpath(await resolve(path.dirname(absolute), signal));
    const source = path.join(normalizeLocalPath(folder), name);
    const info = await lstat(source);
    if (info.isSymbolicLink()) await resolve(absolute, signal);
    else if (!info.isFile() && !info.isDirectory()) throw new BrowseError('此位置不是普通文件或文件夹');
    return { absolute, source, folder, info };
  }

  async function stage(inputs, cut, signal) {
    const sources = [];
    for (const input of inputs) {
      const { absolute } = await mutableEntry(input, signal);
      sources.push(absolute);
    }
    signal.throwIfAborted();
    try {
      const result = await windowsFileOperation({ action: 'stage', sources, cut });
      cutProgress = undefined;
      return result;
    } catch {
      throw new BrowseError('Windows 剪贴板暂时不可用，请重试', 409);
    }
  }

  async function rename(input, name, signal) {
    if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\\/]/.test(name)
        || invalidComponent.test(name)) throw new BrowseError('请输入有效的 Windows 文件名');
    const { absolute, source, folder } = await mutableEntry(input, signal);
    const destination = path.join(folder, name);
    const renamed = path.join(path.dirname(absolute), name);
    if (destination === source) return { path: renamed, changed: [path.dirname(absolute), folder] };
    signal.throwIfAborted();
    const { code } = await windowsFileOperation({ action: 'rename', source, destination });
    if (code === 80 || code === 183) throw new BrowseError('此文件夹中已有同名项目', 409);
    if (code === 5 || code === 32) throw new BrowseError('没有重命名权限，或文件正在使用', 403);
    if (code !== 0) throw new BrowseError('Windows 无法重命名此项目（' + code + '）', 409);
    return { path: renamed, changed: [path.dirname(absolute), folder] };
  }

  async function recycle(inputs, signal) {
    const items = [];
    for (const input of inputs) {
      const item = await mutableEntry(input, signal);
      if (item.info.isSymbolicLink()) throw new BrowseError('请在 Windows 资源管理器中删除此链接');
      items.push(item);
    }
    signal.throwIfAborted();
    let recycled = [];
    try {
      const { results } = await windowsFileOperation({ action: 'recycle', sources: items.map(item => item.source) });
      recycled = items.filter((_, index) => results[index]);
    } catch { /* The Shell can throw when recycling is refused. */ }
    if (!recycled.length) throw new BrowseError('无法移入 Windows 回收站，请检查权限或回收站设置', 409);
    return {
      completed: recycled.length, failed: items.length - recycled.length,
      changed: recycled.flatMap(item => [path.dirname(item.absolute), item.folder]),
      removed: recycled.flatMap(item => [item.absolute, item.source]),
    };
  }

  async function checkTransferTree(item, signal) {
    const refuseLink = () => new BrowseError('此项目含有链接或目录联接，请在 Windows 资源管理器中处理');
    if (item.info.isSymbolicLink()) throw refuseLink();
    const folders = item.info.isDirectory() ? [item.source] : [];
    while (folders.length) {
      signal.throwIfAborted();
      const folder = folders.pop();
      for await (const entry of await opendir(folder)) {
        signal.throwIfAborted();
        if (entry.isSymbolicLink()) throw refuseLink();
        if (entry.isDirectory()) folders.push(path.join(folder, entry.name));
      }
    }
  }

  async function paste(input, signal) {
    const absolute = normalizeLocalPath(input);
    const destination = normalizeLocalPath(await realpath(await resolve(absolute, signal)));
    if (!(await stat(destination)).isDirectory()) throw new BrowseError('请选择文件夹作为粘贴位置');
    let clipboard;
    try { clipboard = await windowsFileOperation({ action: 'clipboard' }); }
    catch { throw new BrowseError('Windows 剪贴板暂时不可用，请重试', 409); }
    if (!clipboard.paths.length) throw new BrowseError('剪贴板中没有可粘贴的文件或文件夹');
    const paths = operationPaths(clipboard.paths);
    const alreadyMoved = clipboard.cut && cutProgress?.sequence === clipboard.sequence ? cutProgress.paths : new Set();
    const sources = [];
    for (const input of paths) {
      if (alreadyMoved.has(input)) continue;
      const item = await mutableEntry(input, signal);
      const relative = path.relative(item.source.toLowerCase(), destination.toLowerCase());
      if (item.info.isDirectory() && (!relative || (!relative.startsWith('..\\') && relative !== '..' && !path.isAbsolute(relative)))) {
        throw new BrowseError('不能将文件夹粘贴到自身或其子文件夹');
      }
      if (clipboard.cut && item.folder.toLowerCase() === destination.toLowerCase()) {
        throw new BrowseError('剪切项已在目标文件夹');
      }
      // The Shell may follow an NTFS junction when it recursively copies a folder.
      await checkTransferTree(item, signal);
      sources.push(item);
    }
    if (!sources.length) throw new BrowseError('剪贴板中的剪切项已全部移动');
    signal.throwIfAborted();
    const { results } = await windowsFileOperation({
      action: 'transfer', sources: sources.map(item => item.source), destination, cut: clipboard.cut,
    });
    const completed = results.filter(Boolean).length;
    if (clipboard.cut) {
      for (const [index, item] of sources.entries()) {
        if (results[index]) alreadyMoved.add(item.absolute);
      }
      cutProgress = { sequence: clipboard.sequence, paths: alreadyMoved };
      if (completed === sources.length) {
        await windowsFileOperation({ action: 'clearCut', sequence: clipboard.sequence }).catch(() => {});
      }
    }
    return {
      completed, failed: sources.length - completed, cut: clipboard.cut,
      changed: [absolute, destination, ...(clipboard.cut
        ? sources.flatMap(item => [item.folder, path.dirname(item.absolute)]) : [])],
      moved: clipboard.cut ? sources.filter((_, index) => results[index]).flatMap(item => [item.source, item.absolute]) : [],
    };
  }

  async function thumbnail(input, type, request, workspace) {
    const target = await resolve(input, request.signal, workspace);
    const info = await stat(target);
    if (!info.isFile()) throw new BrowseError('只能读取普通文件');
    const file = await open(target, 'r');
    let streaming = false;
    try {
      const { size } = await file.stat();
      if (type.startsWith('image/') && size > 64 * 1024 * 1024) {
        throw new BrowseError('图片超过缩略图读取上限', 413);
      }
      const headers = {
        'accept-ranges': 'bytes', 'cache-control': 'no-store', 'content-type': type,
        'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
      };
      const range = request.headers.get('range');
      const span = range === null ? { start: 0, end: size - 1 } : byteRange(range, size);
      if (!span) {
        return new Response(null, { status: 416, headers: { ...headers, 'content-range': 'bytes */' + size } });
      }
      const { start, end } = span;
      headers['content-length'] = String(end - start + 1);
      if (range !== null) headers['content-range'] = 'bytes ' + start + '-' + end + '/' + size;
      const status = range === null ? 200 : 206;
      if (size === 0 || request.method === 'HEAD') return new Response(null, { status, headers });
      request.signal.throwIfAborted();
      const stream = file.createReadStream({ start, end, signal: request.signal });
      const response = new Response(Readable.toWeb(stream), { status, headers });
      streaming = true;
      return response;
    } finally {
      if (!streaming) await file.close();
    }
  }

  return { list, read, renderOffice, locate, thumbnail, stage, rename, paste, recycle, scope, search };
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || size === 0) return null;
  const [, first, last] = match;
  if (first === '' && (last === '' || Number(last) === 0)) return null;
  const start = first === '' ? Math.max(0, size - Number(last)) : Number(first);
  const end = first === '' || last === '' ? size - 1 : Math.min(size - 1, Number(last));
  return start <= end ? { start, end } : null;
}

const knownErrors = {
  EACCES: ['Windows 拒绝访问此位置', 403],
  EPERM: ['Windows 拒绝访问此位置', 403],
  ENOENT: ['文件或文件夹已不存在', 404],
  ENOTDIR: ['该路径不是文件夹', 400],
  EBUSY: ['该位置暂时不可用', 409],
};

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export function registerDesktopFiles(ctx) {
  const disks = createDiskAccess();
  registerPdfAssets(ctx);
  let writes = Promise.resolve();
  function write(action) {
    const result = writes.then(action);
    writes = result.catch(() => {});
    return result;
  }
  const tickets = new Map();
  ctx.connection.fetch.register({
    path: thumbnailEndpoint,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    async fetch(request) {
      // Owner admission and Desktop's origin normalization still apply. Media
      // elements use a short-lived ticket because they cannot set our POST header.
      const token = new URL(request.url).searchParams.get('ticket');
      const ticket = tickets.get(token);
      if (request.headers.has('origin') || request.headers.has('sec-fetch-site')
          || !ticket || ticket.expires <= Date.now()) {
        return json({ error: '缩略图链接已失效' }, 403);
      }
      try {
        const workspace = ticket.workspace && await disks.scope(ticket.workspace, request.signal);
        return await disks.thumbnail(ticket.path, ticket.type, request, workspace);
      } catch (error) {
        return browseFailure(error);
      }
    },
  });
  ctx.connection.fetch.register({
    path: endpoint,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      // The desktop forwarder inserts its owned Host cookie and strips browser origin headers.
      // Connection admission has already verified the credential and its owner principal.
      if (request.headers.has('origin') || request.headers.has('sec-fetch-site')
          || request.headers.get('x-dsh-workspace-explorer') !== '1') {
        return json({ error: '本机磁盘接口仅供 Harness 桌面端使用' }, 403);
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return json({ error: '无效的请求类型' }, 415);
      }
      try {
        const body = await request.text();
        if (body.length > 65536) throw new BrowseError('路径过长', 413);
        const { operation, path: input, name, query, workspace: root } = JSON.parse(body) ?? {};
        const signal = request.signal;
        if (operation === 'search') return json(await disks.search(await disks.scope(input, signal), query, signal));
        // Thumbnail tickets recheck the workspace when the file is streamed.
        const workspace = root === undefined || operation === 'thumbnail' ? undefined : await disks.scope(root, signal);
        if (operation === 'list') return json(await disks.list(input, signal, workspace));
        if (operation === 'locate') return json(await disks.locate(input, signal, workspace));
        const modify = (action, inputs = [input]) => write(async () => {
          if (workspace) {
            for (const input of inputs) {
              const target = await disks.locate(input, signal, workspace);
              if (operation !== 'paste' && target.path.toLowerCase() === workspace.root.toLowerCase()) {
                throw new BrowseError('不能对工作区根目录执行此操作', 403);
              }
            }
          }
          return action();
        });
        if (operation === 'copy' || operation === 'cut') {
          const inputs = operationPaths(input);
          return json(await modify(() => disks.stage(inputs, operation === 'cut', signal), inputs));
        }
        if (operation === 'rename') return json(await modify(() => disks.rename(input, name, signal)));
        if (operation === 'paste') return json(await modify(() => disks.paste(input, signal)));
        if (operation === 'recycle') {
          const inputs = operationPaths(input);
          return json(await modify(() => disks.recycle(inputs, signal), inputs));
        }
        if (operation === 'thumbnail') {
          const path = normalizeLocalPath(input);
          const type = thumbnailType(path);
          if (!type) throw new BrowseError('此文件类型没有缩略图');
          const now = Date.now();
          for (const [key, ticket] of tickets) if (ticket.expires <= now) tickets.delete(key);
          if (tickets.size >= 128) tickets.delete(tickets.keys().next().value);
          const token = randomUUID();
          tickets.set(token, { path, type, workspace: root === undefined ? undefined : normalizeLocalPath(root), expires: now + 30_000 });
          return json({ url: thumbnailEndpoint + '?ticket=' + token });
        }
        if (operation === 'text') {
          const { data, eof } = await disks.read(input, maxText, signal, workspace, { sniffText: true });
          return json({ text: decodePreviewText(data, eof), eof });
        }
        if (operation === 'bytes' || operation === 'office') {
          const converter = operation === 'office' ? ctx.officeToPdf : undefined;
          if (operation === 'office' && !converter) return json({ error: '当前 DSH 未提供 Office 转换服务' }, 503);
          const data = converter
            ? await disks.renderOffice(input, signal, workspace, converter)
            : (await disks.read(input, maxBytes, signal, workspace)).data;
          return new Response(data, { headers: {
            'content-type': converter ? 'application/pdf' : 'application/octet-stream',
            'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          } });
        }
        throw new BrowseError('无效的文件操作');
      } catch (error) {
        if (error instanceof SyntaxError) return json({ error: '无效的请求内容' }, 400);
        return browseFailure(error);
      }
    },
  });
}

function browseFailure(error) {
  if (error instanceof BrowseError) return json({ error: error.message }, error.status);
  const [message, status] = knownErrors[error?.code] ?? ['无法读取该位置', 500];
  return json({ error: message }, status);
}


