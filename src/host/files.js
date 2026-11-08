import { execFile } from 'node:child_process';
import { lstat, open, opendir, readlink, stat } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const endpoint = '/api/dsh.workspaceExplorer';
const maxEntries = 2000;
const maxText = 2 * 1024 * 1024;
const maxBytes = 32 * 1024 * 1024;
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
  async function drives(force = false) {
    if (!force && Date.now() < expires) return cachedDrives;
    scanning ??= scanDrives().then(result => {
      cachedDrives = result;
      expires = Date.now() + 5000;
      return result;
    }).finally(() => { scanning = undefined; });
    return scanning;
  }

  async function resolve(input, signal) {
    const absolute = normalizeLocalPath(input);
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
    return walk(absolute);
  }

  async function list(input, signal) {
    if (input === null) {
      const roots = await drives(true);
      return { entries: roots.map(root => ({
        name: '磁盘 (' + root.slice(0, 2) + ')', type: 'drive', path: root,
      })), truncated: false };
    }
    const target = await resolve(input, signal);
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
          const safe = row.type === 'link' ? await resolve(child, signal) : child;
          const info = await stat(safe);
          row.type = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
          if (info.isFile()) row.size = info.size;
        } catch {
          if (row.type === 'link') row.type = 'other';
        }
      }));
    }
    return { entries, truncated };
  }

  async function read(input, limit, signal) {
    const target = await resolve(input, signal);
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
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const eof = length <= limit && length <= opened.size;
      if (limit === maxBytes && (!eof || opened.size > limit)) throw new BrowseError('文件超过 32 MB 读取上限', 413);
      return { data: buffer.subarray(0, Math.min(length, limit)), eof };
    } finally {
      await handle.close();
    }
  }

  async function locate(input, signal) {
    const absolute = normalizeLocalPath(input);
    const target = await resolve(absolute, signal);
    const info = await stat(target);
    if (info.isDirectory()) return { path: absolute, type: 'directory' };
    if (info.isFile()) return { path: absolute, nativePath: target, type: 'file', name: path.basename(absolute) };
    throw new BrowseError('该路径不指向普通文件或文件夹');
  }

  return { list, read, locate };
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
        const { operation, path: input } = JSON.parse(body) ?? {};
        const signal = request.signal;
        if (operation === 'list') return json(await disks.list(input, signal));
        if (operation === 'locate') return json(await disks.locate(input, signal));
        if (operation === 'text') {
          const { data, eof } = await disks.read(input, maxText, signal);
          let text;
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(data, { stream: !eof });
          } catch {
            throw new BrowseError('此文件不是 UTF-8 文本');
          }
          if (text.includes('\0')) throw new BrowseError('此格式没有可用的文本预览');
          return json({ text, eof });
        }
        if (operation === 'bytes') {
          const { data } = await disks.read(input, maxBytes, signal);
          return new Response(data, { headers: {
            'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          } });
        }
        throw new BrowseError('无效的文件操作');
      } catch (error) {
        if (error instanceof BrowseError) return json({ error: error.message }, error.status);
        if (error instanceof SyntaxError) return json({ error: '无效的请求内容' }, 400);
        const [message, status] = knownErrors[error?.code] ?? ['无法读取该位置', 500];
        return json({ error: message }, status);
      }
    },
  });
}


