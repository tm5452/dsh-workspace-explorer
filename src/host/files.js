import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, open, opendir, readFile, readlink, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { officeAssetsPath, officeExtensions } from '../document-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { audioType } from '../audio-types.js';
import { isWindowsBatch, pathKey, underPath } from '../ui/navigation.js';
import { registerPdfAssets } from './pdf-assets.js';
import { windowsFileOperation } from './shell-files.js';
import { macFileOperation } from './mac-files.js';
import { createLinuxFileOperations, scanLinuxRoots } from './linux-files.js';

const execute = promisify(execFile);
const endpoint = '/api/dsh.workspaceExplorer';
const thumbnailEndpoint = endpoint + '/thumbnail';
const maxEntries = 2000;
const maxMatches = 300;
const maxText = 2 * 1024 * 1024;
const textWindowBytes = 128 * 1024;
const maxBytes = 32 * 1024 * 1024;
const maxFileOperations = 128;
const driveCacheMs = 30_000;
const invalidComponent = /[<>:"|?*\x00-\x1f]|[. ]$|^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³]) *(?:\.|$)/iu;
const mac = process.platform === 'darwin';
const linux = process.platform === 'linux';
const windows = process.platform === 'win32';
const posixPlatform = mac || linux;
const path = posixPlatform ? posix : win32;
const shellFileOperation = mac ? macFileOperation : windowsFileOperation;
const clipboardUnavailable = (mac ? 'Mac' : 'Windows') + ' 剪贴板暂时不可用，请重试';

// The official desktop shell forks dsh-desktop-host as a child process over IPC.
// Asar- or single-process packagings (DSH NEXT and similar) run the host in the
// Electron main process itself, entered through app.asar/lib/host.js, with no IPC
// channel. The entry path is the only signal both packagings share.
const desktopHostEntry = /[\\/](?:@deepseek-ai[\\/]dsh-desktop-host[\\/]lib[\\/]index|lib[\\/]host)\.js$/i;

export function isDesktopHost() {
  const entry = process.argv[1] ?? '';
  if (linux && process.connected && /\/@deepseek-ai\/dsh-desktop-host\/lib\/index\.js$/.test(entry)) return true;
  if (!posixPlatform && !windows) return false;
  if (!process.versions.electron) return false;
  // macOS packagings do not expose a stable argv[1] entry, so the Electron signal is what
  // gates them; Windows keeps the stricter entry match.
  return mac || desktopHostEntry.test(entry);
}

class BrowseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeLocalPath(value) {
  if (posixPlatform) {
    if (typeof value !== 'string' || value.length > 32767 || !value.startsWith('/') || value.includes('\0')) {
      throw new BrowseError(mac ? '请输入 Mac 上的绝对路径，例如 /Users/你的用户名/项目'
        : '请输入 Linux 上的绝对路径，例如 /home/你的用户名/项目');
    }
    const absolute = path.normalize(value);
    return absolute === '/' ? absolute : absolute.replace(/\/+$/, '');
  }
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

function fileIdentity(info) {
  return info.dev + ':' + info.ino;
}

const pythonEncodingAliases = new Map([
  ['utf-8-sig', 'utf-8'], ['cp936', 'gbk'], ['cp932', 'shift_jis'],
  ['cp1252', 'windows-1252'], ['latin-1', 'latin1'], ['iso-8859-1', 'latin1'],
]);

function pythonSourceEncoding(data) {
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return 'utf-8';
  const [first, second = ''] = data.toString('latin1').split(/\r\n?|\n/, 2);
  const cookie = /^[ \t\f]*#.*?coding[=:][ \t]*([-_.a-zA-Z0-9]+)/;
  const declared = cookie.exec(first)?.[1]
    ?? (/^[ \t\f]*(?:#|$)/.test(first) ? cookie.exec(second)?.[1] : undefined);
  const label = declared?.toLowerCase().replaceAll('_', '-') ?? 'utf-8';
  return pythonEncodingAliases.get(label) ?? label;
}

function decodePreviewText(data, eof, encoding) {
  if (!encoding) {
    if (data.includes(0)) throw new BrowseError('此格式没有可用的文本预览');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(data, { stream: !eof }); }
    catch {
      try { return new TextDecoder('gb18030', { fatal: true }).decode(data, { stream: !eof }); }
      catch { throw new BrowseError('无法按 UTF-8 或 GB18030 预览此文件'); }
    }
  }
  let decoder;
  try { decoder = new TextDecoder(encoding, { fatal: true }); }
  catch { decoder = new TextDecoder('utf-8', { fatal: true }); }
  let text;
  try {
    text = encoding === 'latin1' ? data.toString('latin1') : decoder.decode(data, { stream: !eof });
  } catch {
    throw new BrowseError(decoder.encoding === 'utf-8' ? '此文件不是 UTF-8 文本' : '无法按文件声明的编码预览');
  }
  if (text.includes('\0')) throw new BrowseError('此格式没有可用的文本预览');
  return text;
}

async function readAt(handle, buffer, position, signal) {
  let length = 0;
  while (length < buffer.length) {
    signal.throwIfAborted();
    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, position + length);
    if (!bytesRead) break;
    length += bytesRead;
  }
  return buffer.subarray(0, length);
}

async function textLineOffset(handle, line, size, signal) {
  const buffer = Buffer.allocUnsafe(textWindowBytes);
  let position = 0;
  let lastStart = 0;
  let firstLine = 1;
  while (position < size) {
    const data = await readAt(handle, buffer, position, signal);
    if (!data.length) break;
    let newline = data.indexOf(10);
    while (newline >= 0) {
      lastStart = position + newline + 1;
      if (++firstLine === line) return { offset: lastStart, firstLine };
      newline = data.indexOf(10, newline + 1);
    }
    position += data.length;
  }
  return { offset: lastStart, firstLine };
}

function decodeTextWindow(data, labels, offset, eof) {
  if (data.includes(0)) throw new BrowseError('此格式没有可用的文本预览');
  for (const label of labels) {
    let decoder;
    try { decoder = new TextDecoder(label, { fatal: true, ignoreBOM: offset > 0 }); }
    catch { continue; }
    if (label === 'latin1') return { text: data.toString('latin1'), length: data.length, encoding: label };
    // Keep an incomplete multibyte character for the next window.
    for (let tail = 0; tail <= (eof ? 0 : Math.min(4, data.length - 1)); tail++) {
      const length = data.length - tail;
      try {
        return { text: decoder.decode(data.subarray(0, length)), length, encoding: decoder.encoding };
      } catch { /* Try the remaining character boundaries or the fallback encoding. */ }
    }
  }
  throw new BrowseError('此文件没有可用的文本编码');
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
  let cachedDrives;
  let expires = 0;
  let scanning;
  let cutProgress;
  let macClipboard;
  async function drives(force = false) {
    if (!force && cachedDrives && Date.now() < expires) return cachedDrives;
    scanning ??= scanDrives().then(result => {
      cachedDrives = result;
      expires = Date.now() + driveCacheMs;
      return result;
    }).catch(() => {
      throw new BrowseError('无法获取本机盘符，请检查 Windows PowerShell 是否可用', 503);
    }).finally(() => { scanning = undefined; });
    return scanning;
  }

  function requireWithin(input, root) {
    if (!underPath(input, root)) throw new BrowseError('此位置不在当前会话的工作区内', 403);
  }

  function requireNativeWithin(input, root) {
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (input !== root && !input.startsWith(prefix)) throw new BrowseError('此位置不在当前会话的工作区内', 403);
  }

  async function resolve(input, signal, workspace) {
    const absolute = normalizeLocalPath(input);
    if (workspace) requireWithin(absolute, workspace.root);
    if (posixPlatform) {
      signal.throwIfAborted();
      const native = normalizeLocalPath(await realpath(absolute));
      signal.throwIfAborted();
      if (workspace) requireNativeWithin(native, workspace.nativeRoot);
      return native;
    }
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
    return { root: windows && root.length > 3 ? root.replace(/\\+$/, '') : root, nativeRoot };
  }

  async function list(input, signal, workspace) {
    if (input === null) {
      if (workspace) throw new BrowseError('此位置不在当前会话的工作区内', 403);
      if (linux) return { entries: await scanLinuxRoots(), truncated: false };
      if (mac) {
        return { entries: [
          { name: '个人文件夹', type: 'directory', path: homedir() },
          { name: 'Mac 根目录', type: 'drive', path: '/' },
          { name: '已挂载宗卷', type: 'directory', path: '/Volumes' },
        ], truncated: false };
      }
      const roots = await drives(true);
      return { entries: roots.map(root => ({
        name: '磁盘 (' + root.slice(0, 2) + ')', type: 'drive', path: root,
      })), truncated: false };
    }
    const target = await resolve(input, signal, workspace);
    const directory = await opendir(target);
    const entries = [];
    const withMetadata = [];
    let truncated = false;
    for await (const item of directory) {
      signal.throwIfAborted();
      if (entries.length === maxEntries) { truncated = true; break; }
      const type = item.isDirectory() ? 'directory' : item.isFile() ? 'file' : item.isSymbolicLink() ? 'link' : 'other';
      const row = { name: item.name, type };
      entries.push(row);
      if (type !== 'other') withMetadata.push(row);
    }
    for (let index = 0; index < withMetadata.length; index += 32) {
      signal.throwIfAborted();
      await Promise.all(withMetadata.slice(index, index + 32).map(async row => {
        try {
          const child = path.join(target, row.name);
          let safe = row.type === 'link' ? await resolve(child, signal) : child;
          if (workspace && row.type === 'link') safe = normalizeLocalPath(await realpath(safe));
          if (workspace) requireNativeWithin(safe, workspace.nativeRoot);
          const info = await (row.type === 'link' ? stat(safe) : lstat(safe));
          row.type = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
          row.modifiedAt = info.mtimeMs;
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
          let modifiedAt;
          if (entry.isSymbolicLink()) {
            try {
              const target = await resolve(absolute, signal, workspace);
              const info = await stat(target);
              if (!info.isFile()) continue;
              modifiedAt = info.mtimeMs;
            } catch {
              signal.throwIfAborted();
              continue;
            }
          } else if (!entry.isFile()) {
            continue;
          } else {
            try {
              const info = await lstat(path.join(folder, entry.name));
              if (info.isFile()) modifiedAt = info.mtimeMs;
            } catch { signal.throwIfAborted(); }
          }
          if (matches.length === maxMatches) return { matches, truncated: true, skipped };
          matches.push({ name: entry.name, path: absolute, relative: child, modifiedAt });
        }
      } catch (error) {
        signal.throwIfAborted();
        if (!relative) throw error;
        skipped++;
      }
    }
    return { matches, truncated: false, skipped };
  }

  async function read(input, limit, signal, workspace, { sniffText } = {}) {
    const target = await resolve(input, signal, workspace);
    const info = await stat(target);
    if (!info.isFile()) throw new BrowseError('只能预览普通文件');
    if (limit === maxBytes && info.size > limit) throw new BrowseError('文件超过 32 MB 读取上限', 413);
    const handle = await open(target, 'r');
    try {
      const opened = await handle.stat();
      if (!opened.isFile()) throw new BrowseError('只能预览普通文件');
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
      return { data: buffer.subarray(0, Math.min(length, limit)), eof };
    } finally {
      await handle.close();
    }
  }

  async function readTextWindow(input, signal, workspace, cursor, line) {
    const target = await resolve(input, signal, workspace);
    if (!(await stat(target)).isFile()) throw new BrowseError('只能预览普通文件');
    const handle = await open(target, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new BrowseError('只能预览普通文件');
      const version = fileVersion(info);
      if (cursor && (cursor.version !== version || !Number.isSafeInteger(cursor.offset) ||
          cursor.offset <= 0 || cursor.offset >= info.size || typeof cursor.encoding !== 'string' ||
          !Number.isSafeInteger(cursor.firstLine) || cursor.firstLine < 1 ||
          !Number.isSafeInteger(cursor.firstColumn) || cursor.firstColumn < 1)) {
        throw new BrowseError('文本已更新，请重新预览', 409);
      }
      const python = /\.py$/i.test(input);
      let declared = python && (cursor?.encoding ??
        pythonSourceEncoding(await readAt(handle, Buffer.allocUnsafe(4096), 0, signal)));
      if (declared && declared !== 'latin1') {
        try { declared = new TextDecoder(declared).encoding; }
        catch { declared = 'utf-8'; }
      }
      if (declared && /^(?:utf-16[bl]e|iso-2022-jp)$/.test(declared)) {
        const data = await readAt(handle, Buffer.allocUnsafe(Math.min(info.size, maxText)), 0, signal);
        const eof = data.length >= info.size;
        return { text: decodePreviewText(data, eof, declared), eof, legacy: true, next: null };
      }
      const { offset, firstLine, firstColumn = 1 } = cursor ?? (Number.isSafeInteger(line) && line > 1
        ? await textLineOffset(handle, line, info.size, signal) : { offset: 0, firstLine: 1 });
      let data = await readAt(handle, Buffer.allocUnsafe(Math.min(textWindowBytes, info.size - offset)), offset, signal);
      if (offset + data.length < info.size) {
        const newline = data.lastIndexOf(10);
        if (newline > data.length / 2) data = data.subarray(0, newline + 1);
      }
      const labels = declared ? [declared] : cursor?.encoding === 'gb18030' ? ['gb18030'] : ['utf-8', 'gb18030'];
      const { text, length, encoding } = decodeTextWindow(data, labels, offset, offset + data.length >= info.size);
      if (fileVersion(await handle.stat()) !== version) throw new BrowseError('文本已更新，请重新预览', 409);
      const next = offset + length;
      const lines = text.split('\n');
      return { text, firstLine, firstColumn, next: next < info.size ? {
        offset: next, encoding, version, firstLine: firstLine + lines.length - 1,
        firstColumn: (lines.length === 1 ? firstColumn : 1) + lines.at(-1).length,
      } : null };
    } finally {
      await handle.close();
    }
  }

  async function locate(input, signal, workspace, includeVersion = false) {
    const absolute = normalizeLocalPath(input);
    const target = await resolve(absolute, signal, workspace);
    const info = await stat(target);
    if (info.isDirectory()) return { path: absolute, nativePath: target, type: 'directory' };
    if (info.isFile()) return { path: absolute, nativePath: target, type: 'file', name: path.basename(absolute),
      size: info.size, ...(includeVersion ? { version: fileVersion(info) } : {}) };
    throw new BrowseError('该路径不指向普通文件或文件夹');
  }

  async function mutableEntry(input, signal) {
    const absolute = normalizeLocalPath(input);
    const name = path.basename(absolute);
    if (!name) throw new BrowseError('不能对磁盘根目录执行此操作');
    const folder = await realpath(await resolve(path.dirname(absolute), signal));
    const source = path.join(normalizeLocalPath(folder), name);
    const info = await lstat(source);
    if (posixPlatform && info.isDirectory() && info.dev !== (await stat(folder)).dev) {
      throw new BrowseError('不能对宗卷根目录执行此操作');
    }
    if (info.isSymbolicLink()) await resolve(absolute, signal);
    else if (!info.isFile() && !info.isDirectory()) throw new BrowseError('此位置不是普通文件或文件夹');
    return { absolute, source, folder, info };
  }

  async function stage(inputs, cut, signal) {
    const sources = [];
    const originalPaths = [];
    const identities = new Map();
    for (const input of inputs) {
      const { absolute, source, info } = await mutableEntry(input, signal);
      if (mac && info.isSymbolicLink()) throw new BrowseError('请在 Finder 中处理此符号链接');
      sources.push(mac ? source : absolute);
      originalPaths.push(absolute);
      if (mac && cut) identities.set(absolute, fileIdentity(info));
    }
    signal.throwIfAborted();
    try {
      if (mac) macClipboard = undefined;
      const token = mac ? randomUUID() : undefined;
      const result = await shellFileOperation({ action: 'stage', sources, cut, token });
      if (mac) {
        macClipboard = { sequence: result.sequence, token, paths: originalPaths, cut, identities };
      }
      cutProgress = undefined;
      return { ok: result.ok };
    } catch (error) {
      if (error?.code === 'DWE_MAC_OPERATION') throw error;
      throw new BrowseError(clipboardUnavailable, 409);
    }
  }

  async function rename(input, name, signal) {
    const invalid = typeof name !== 'string' || !name.trim() || name.length > 255
      || (mac ? /[\/:\0]/.test(name) || name === '.' || name === '..' : /[\\/]/.test(name) || invalidComponent.test(name));
    if (invalid) throw new BrowseError('请输入有效的 ' + (mac ? 'Mac' : 'Windows') + ' 文件名');
    const { absolute, source, folder, info } = await mutableEntry(input, signal);
    if (mac && info.isSymbolicLink()) throw new BrowseError('请在 Finder 中处理此符号链接');
    const destination = path.join(folder, name);
    const renamed = path.join(path.dirname(absolute), name);
    if (destination === source) return { path: renamed, changed: [path.dirname(absolute), folder] };
    signal.throwIfAborted();
    const { code, result } = await shellFileOperation({ action: 'rename', source, destination });
    if (result === 'missing') throw new BrowseError('文件或文件夹已不存在', 404);
    if (result === 'exists' || code === 80 || code === 183) throw new BrowseError('此文件夹中已有同名项目', 409);
    if (result === 'denied' || code === 5 || code === 32) throw new BrowseError('没有重命名权限，或文件正在使用', 403);
    if (mac ? result !== 'ok' : code !== 0) {
      throw new BrowseError(mac ? 'Mac 无法重命名此项目' : 'Windows 无法重命名此项目（' + code + '）', 409);
    }
    return { path: renamed, changed: [path.dirname(absolute), folder] };
  }

  async function recycle(inputs, signal) {
    const items = [];
    for (const input of inputs) {
      const item = await mutableEntry(input, signal);
      if (item.info.isSymbolicLink()) throw new BrowseError(mac ? '请在 Finder 中删除此符号链接' : '请在 Windows 资源管理器中删除此链接');
      items.push(item);
    }
    signal.throwIfAborted();
    let recycled = [];
    try {
      const { results } = await shellFileOperation({ action: 'recycle', sources: items.map(item => item.source) });
      recycled = items.filter((_, index) => results[index]);
    } catch (error) {
      if (error?.code === 'ETIMEDOUT' || error?.code === 'DWE_MAC_OPERATION') throw error;
      // The Shell can throw when recycling is refused.
    }
    if (!recycled.length) {
      throw new BrowseError(mac ? '无法移入废纸篓，请检查权限或宗卷是否支持此操作'
        : '无法移入 Windows 回收站，请检查权限或回收站设置', 409);
    }
    return {
      completed: recycled.length, failed: items.length - recycled.length,
      changed: recycled.flatMap(item => [path.dirname(item.absolute), item.folder]),
      removed: recycled.flatMap(item => [item.absolute, item.source]),
    };
  }

  async function checkTransferTree(item, signal) {
    const refuseLink = () => new BrowseError(mac ? '此项目含有符号链接，请在 Finder 中处理'
      : '此项目含有链接或目录联接，请在 Windows 资源管理器中处理');
    if (item.info.isSymbolicLink()) throw refuseLink();
    const folders = item.info.isDirectory() ? [item.source] : [];
    while (folders.length) {
      signal.throwIfAborted();
      const folder = folders.pop();
      for await (const entry of await opendir(folder)) {
        signal.throwIfAborted();
        if (entry.isSymbolicLink()) throw refuseLink();
        if (mac && !entry.isDirectory() && !entry.isFile()) throw new BrowseError('此文件夹含有非普通文件，请在 Finder 中处理');
        if (entry.isDirectory()) folders.push(path.join(folder, entry.name));
      }
    }
  }

  async function paste(input, signal, workspace) {
    const absolute = normalizeLocalPath(input);
    let destination;
    let destinationInfo;
    try {
      destination = mac ? await resolve(absolute, signal, workspace)
        : normalizeLocalPath(await realpath(await resolve(absolute, signal)));
      destinationInfo = await stat(destination);
    } catch (error) {
      if (mac && error?.code === 'ENOENT') throw new BrowseError('粘贴目标文件夹已不存在，请重新打开目标文件夹', 404);
      throw error;
    }
    if (!destinationInfo.isDirectory()) throw new BrowseError('请选择文件夹作为粘贴位置');
    let clipboard;
    try { clipboard = await shellFileOperation({ action: 'clipboard', token: macClipboard?.token }); }
    catch (error) {
      if (error?.code === 'DWE_MAC_OPERATION') throw error;
      throw new BrowseError(clipboardUnavailable, 409);
    }
    if (mac && macClipboard) {
      if (clipboard.token === macClipboard.token && clipboard.sequence === macClipboard.sequence) {
        clipboard.paths = macClipboard.paths;
        clipboard.cut = macClipboard.cut;
      } else if (clipboard.token === macClipboard.token) {
        throw new BrowseError('剪贴板已变化，请重新复制或剪切', 409);
      } else {
        macClipboard = undefined;
      }
    }
    if (!clipboard.paths.length) throw new BrowseError('剪贴板中没有可粘贴的文件或文件夹');
    if (mac && clipboard.paths.some(value => value === null)) {
      throw new BrowseError('剪贴板中的源文件已找不到，请在 Finder 中重新复制', 404);
    }
    const paths = operationPaths(clipboard.paths);
    const macCut = macClipboard?.cut ? macClipboard : undefined;
    const alreadyMoved = clipboard.cut && cutProgress?.sequence === clipboard.sequence ? cutProgress.paths : new Set();
    const sources = [];
    const ancestors = new Set();
    if (mac) {
      for (let current = destination; ; current = path.dirname(current)) {
        signal.throwIfAborted();
        ancestors.add(fileIdentity(current === destination ? destinationInfo : await stat(current)));
        if (current === '/') break;
      }
    }
    for (const input of paths) {
      if (alreadyMoved.has(input)) continue;
      let item;
      try {
        if (macCut && workspace) {
          const native = await resolve(input, signal, workspace);
          if (native === workspace.nativeRoot) throw new BrowseError('不能移动工作区根目录', 403);
        }
        item = await mutableEntry(input, signal);
      } catch (error) {
        if (mac && error?.code === 'ENOENT') throw new BrowseError('剪贴板中的源文件已找不到，请重新复制或剪切', 404);
        throw error;
      }
      if (macCut && macCut.identities.get(input) !== fileIdentity(item.info)) {
        throw new BrowseError('剪切的项目已变化，请重新剪切', 409);
      }
      if (item.info.isDirectory() && (mac ? ancestors.has(fileIdentity(item.info)) : underPath(destination, item.source))) {
        throw new BrowseError('不能将文件夹粘贴到自身或其子文件夹');
      }
      if (clipboard.cut && (mac ? fileIdentity(await stat(item.folder)) === fileIdentity(destinationInfo)
        : pathKey(item.folder) === pathKey(destination))) {
        throw new BrowseError('剪切项已在目标文件夹');
      }
      // The Shell may follow an NTFS junction when it recursively copies a folder.
      await checkTransferTree(item, signal);
      sources.push(item);
    }
    if (!sources.length) throw new BrowseError('剪贴板中的剪切项已全部移动');
    if (macCut && sources.some(item => sources.some(other => item !== other
      && (item.source === other.source || (other.info.isDirectory() && underPath(item.source, other.source)))))) {
      throw new BrowseError('请勿同时剪切文件夹及其中的项目');
    }
    if (macCut) {
      let current;
      try { current = await shellFileOperation({ action: 'clipboard', token: macCut.token }); }
      catch (error) {
        if (error?.code === 'DWE_MAC_OPERATION') throw error;
        throw new BrowseError(clipboardUnavailable, 409);
      }
      if (current.sequence !== clipboard.sequence || current.token !== macCut.token) {
        throw new BrowseError('剪贴板已变化，请重新剪切', 409);
      }
    }
    signal.throwIfAborted();
    const { results } = await shellFileOperation({
      action: 'transfer', sources: sources.map(item => item.source), destination, cut: clipboard.cut,
    });
    const completed = results.filter(Boolean).length;
    if (clipboard.cut) {
      for (const [index, item] of sources.entries()) {
        if (results[index]) alreadyMoved.add(item.absolute);
      }
      cutProgress = { sequence: clipboard.sequence, paths: alreadyMoved };
      if (!mac && completed === sources.length) {
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

  async function thumbnail(input, type, request, workspace, { version, preview } = {}) {
    const target = await resolve(input, request.signal, workspace);
    const info = await stat(target);
    if (!info.isFile()) throw new BrowseError('只能读取普通文件');
    const file = await open(target, 'r');
    let streaming = false;
    try {
      const opened = await file.stat();
      const { size } = opened;
      if (version && fileVersion(opened) !== version) throw new BrowseError('文件已改变，请重新预览', 409);
      if (!preview && type.startsWith('image/') && size > 64 * 1024 * 1024) {
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

  return {
    list, read, readTextWindow, locate, thumbnail, stage, rename, paste, recycle, scope, search,
    ...(linux ? createLinuxFileOperations({ BrowseError, mutableEntry, normalizeLocalPath, resolve }) : {}),
  };
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
  EACCES: ['系统拒绝访问此位置，请检查文件权限', 403],
  EPERM: ['系统拒绝访问此位置，请检查文件权限', 403],
  ENOENT: ['文件或文件夹已不存在', 404],
  ENOTDIR: ['该路径不是文件夹', 400],
  EBUSY: ['该位置暂时不可用', 409],
  ELOOP: ['路径包含循环或过多链接', 400],
  EROFS: ['该位置是只读的', 403],
  ENOSPC: ['磁盘空间不足', 507],
};

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

const loopbackHosts = /^(?:127\.0\.0\.1|localhost|\[::1\]|::1)$/iu;

// Desktop forwarders treat Fetch-Metadata differently: the official one strips
// `origin` / `sec-fetch-site` before reaching us, while an asar-packaged host
// (DSH NEXT and similar) writes back `origin: <loopback listener>` and
// `sec-fetch-site: same-origin`. Presence alone therefore proves nothing, so we
// reject only what is demonstrably foreign: a cross-site Fetch-Metadata value, or
// an origin that is neither the in-app scheme nor a loopback address. Keeping the
// loopback check matters, because after a DNS rebinding the browser reports the
// request as same-origin and only the origin reveals the real host.
function crossSiteRequest(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  try {
    const url = new URL(origin);
    if (url.protocol === 'dsh-app:') return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    return !loopbackHosts.test(url.hostname);
  } catch {
    return true;
  }
}

const officeAssets = new Map([
  ['viewer', ['viewer.html', 'text/html; charset=utf-8']],
  ['client', ['viewer.js', 'text/javascript; charset=utf-8']],
  ['engine', ['office-engine.embed.js', 'text/javascript; charset=utf-8']],
]);

function registerOfficeAssets(ctx) {
  ctx.connection.fetch.register({
    path: officeAssetsPath,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      if (crossSiteRequest(request)) return new Response(null, { status: 403 });
      const asset = officeAssets.get(new URL(request.url).searchParams.get('file'));
      if (!asset) return new Response(null, { status: 404 });
      const [file, type] = asset;
      const headers = {
        'content-type': type,
        'cache-control': file === 'office-engine.embed.js' ? 'private, max-age=3600' : 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'cross-origin-resource-policy': 'same-origin',
      };
      if (file === 'viewer.html') {
        headers['content-security-policy'] = "default-src 'none'; script-src 'self'; worker-src blob:; " +
          "connect-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; font-src data: blob:; " +
          "base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
      }
      try {
        const bytes = await readFile(new URL('../../assets/office-engine/' + file, import.meta.url));
        return new Response(bytes, { headers });
      } catch (error) {
        return browseFailure(error);
      }
    },
  });
}

export function registerDesktopFiles(ctx) {
  const disks = createDiskAccess();
  registerPdfAssets(ctx);
  registerOfficeAssets(ctx);
  let writes = Promise.resolve();
  if (disks.clearStaged && typeof ctx.effect === 'function') {
    ctx.effect(() => () => { void writes.then(disks.clearStaged); });
  }
  function write(action) {
    const result = writes.then(action);
    writes = result.catch(() => {});
    return result;
  }
  const tickets = new Map();
  const playbackTickets = new Map();
  const previewTickets = new Map();
  const playbackLifetime = 2 * 60 * 60 * 1000;

  function registerPreview(ticket) {
    const now = Date.now();
    for (const [key, value] of previewTickets) if (value.expires <= now) previewTickets.delete(key);
    if (previewTickets.size >= 64) previewTickets.delete(previewTickets.keys().next().value);
    const key = randomUUID();
    previewTickets.set(key, { ...ticket, expires: now + playbackLifetime });
    return { ticket: key, url: thumbnailEndpoint + '?ticket=' + key, size: ticket.size };
  }

  ctx.connection.fetch.register({
    path: thumbnailEndpoint,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    async fetch(request) {
      // Owner admission and Desktop's origin normalization still apply. Media
      // elements use a short-lived ticket because they cannot set our POST header.
      const token = new URL(request.url).searchParams.get('ticket');
      const playback = playbackTickets.get(token);
      const preview = previewTickets.get(token);
      const ticket = preview ?? playback ?? tickets.get(token);
      const now = Date.now();
      if (crossSiteRequest(request) || !ticket || ticket.expires <= now) {
        return json({ error: '缩略图链接已失效' }, 403);
      }
      try {
        const workspace = ticket.workspace && await disks.scope(ticket.workspace, request.signal);
        const response = await disks.thumbnail(ticket.path, ticket.type, request, workspace, {
          version: ticket.version, preview: Boolean(preview),
        });
        if (preview && response.ok) preview.expires = Date.now() + playbackLifetime;
        if (playback && response.ok && playbackTickets.get(token) === ticket) {
          ticket.expires = Date.now() + playbackLifetime;
          playbackTickets.delete(token);
          playbackTickets.set(token, ticket);
        }
        return response;
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
      // Connection admission has already verified the credential and its owner principal.
      // What remains is telling a same-local-origin caller from a foreign page.
      if (crossSiteRequest(request) || request.headers.get('x-dsh-workspace-explorer') !== '1') {
        return json({ error: '本机磁盘接口仅供 Harness 桌面端使用' }, 403);
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return json({ error: '无效的请求类型' }, 415);
      }
      try {
        const body = await request.text();
        if (body.length > 65536) throw new BrowseError('路径过长', 413);
        const { operation, path: input, name, query, workspace: root, cursor, line } = JSON.parse(body) ?? {};
        const signal = request.signal;
        if (operation === 'release-preview') {
          previewTickets.delete(input);
          return json({ ok: true });
        }
        if (operation === 'search') return json(await disks.search(await disks.scope(input, signal), query, signal));
        // Thumbnail tickets recheck the workspace when the file is streamed.
        const usesTicket = operation === 'thumbnail' || operation === 'playback';
        const workspace = root === undefined || usesTicket ? undefined : await disks.scope(root, signal);
        if (operation === 'list') return json(await disks.list(input, signal, workspace));
        if (operation === 'locate') return json(await disks.locate(input, signal, workspace));
        if (operation === 'open-batch') {
          if (!windows) throw new BrowseError('仅 Windows 支持启动批处理文件', 400);
          await write(async () => {
            const file = await disks.locate(input, signal, workspace);
            if (file.type !== 'file' || !isWindowsBatch(file.nativePath)) {
              throw new BrowseError('请选择 .bat 或 .cmd 批处理文件');
            }
            signal.throwIfAborted();
            const { code } = await windowsFileOperation({ action: 'openBatch', source: file.nativePath });
            if (code !== 0 && code !== 1223) throw new BrowseError('Windows 无法启动此批处理文件（' + code + '）', 409);
          });
          return json({ ok: true });
        }
        if (operation === 'document-preview' || operation === 'image-preview' || operation === 'office-preview') {
          const filePath = normalizeLocalPath(input);
          const extension = path.extname(filePath).slice(1).toLowerCase();
          const image = operation === 'image-preview';
          const office = operation === 'office-preview';
          const type = image ? thumbnailType(filePath) : office ? 'application/octet-stream' : 'application/pdf';
          const supported = image ? type?.startsWith('image/') : office ? officeExtensions.has(extension) : extension === 'pdf';
          if (!supported) throw new BrowseError('此文件类型没有可用的预览');
          const file = await disks.locate(filePath, signal, workspace, true);
          if (file.type !== 'file') throw new BrowseError('只能预览普通文件');
          signal.throwIfAborted();
          return json(registerPreview({ path: filePath, type, size: file.size, version: file.version, workspace: workspace?.root }));
        }
        const modify = (action, inputs = [input]) => write(async () => {
          if (workspace && !(posixPlatform && operation === 'paste')) {
            for (const input of inputs) {
              const target = await disks.locate(input, signal, workspace);
              if (operation !== 'paste' && (posixPlatform ? target.nativePath === workspace.nativeRoot
                : pathKey(target.path) === pathKey(workspace.root))) {
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
        if (operation === 'paste') return json(await modify(() => disks.paste(input, signal, workspace)));
        if (operation === 'recycle') {
          const inputs = operationPaths(input);
          return json(await modify(() => disks.recycle(inputs, signal), inputs));
        }
        if (usesTicket) {
          const path = normalizeLocalPath(input);
          const thumbnail = thumbnailType(path);
          const playback = operation === 'playback';
          const type = playback ? audioType(path) ?? thumbnail : thumbnail;
          if (!type || (playback && type.startsWith('image/'))) throw new BrowseError('此文件类型没有预览媒体');
          const pool = playback ? playbackTickets : tickets;
          const now = Date.now();
          for (const [key, ticket] of pool) if (ticket.expires <= now) pool.delete(key);
          if (pool.size >= (playback ? 32 : 128)) pool.delete(pool.keys().next().value);
          const token = randomUUID();
          pool.set(token, {
            path, type, workspace: root === undefined ? undefined : normalizeLocalPath(root),
            expires: now + (playback ? playbackLifetime : 30_000),
          });
          return json({ url: thumbnailEndpoint + '?ticket=' + token });
        }
        if (operation === 'text-window') return json(await disks.readTextWindow(input, signal, workspace, cursor, line));
        if (operation === 'text') {
          const python = typeof input === 'string' && /\.py$/i.test(input);
          const { data, eof } = await disks.read(input, maxText, signal, workspace, { sniffText: !python });
          return json({ text: decodePreviewText(data, eof, python ? pythonSourceEncoding(data) : undefined), eof });
        }
        if (operation === 'bytes') {
          const { data } = await disks.read(input, maxBytes, signal, workspace);
          // Chromium may discard media responses without their MIME type.
          const videoType = thumbnailType(input);
          const type = audioType(input) ?? (videoType?.startsWith('video/') ? videoType : 'application/octet-stream');
          return new Response(data, { headers: {
            'content-type': type,
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
  if (error?.code === 'DWE_MAC_OPERATION') return json({ error: error.message + '，详情见 Harness 日志' }, 500);
  if (error?.code === 'ETIMEDOUT') return json({ error: error.message }, 504);
  const [message, status] = knownErrors[error?.code] ?? ['无法读取该位置', 500];
  return json({ error: message }, status);
}
