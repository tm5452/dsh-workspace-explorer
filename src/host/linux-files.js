import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { cp, lstat, mkdir, open, readFile, readlink, realpath, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix as path } from 'node:path';
import { promisify } from 'node:util';
import { underPath } from '../ui/navigation.js';

const execute = promisify(execFile);
const linuxPathHandle = 0o10000000 | fsConstants.O_NOFOLLOW; // Linux O_PATH retains the inode without reading the file.

function fileIdentity(info) {
  return info.dev + ':' + info.ino;
}

const pseudoFileSystems = new Set([
  'proc', 'sysfs', 'devtmpfs', 'devpts', 'tmpfs', 'ramfs', 'cgroup', 'cgroup2', 'securityfs',
  'debugfs', 'tracefs', 'pstore', 'bpf', 'configfs', 'fusectl', 'mqueue', 'hugetlbfs', 'autofs',
  'binfmt_misc', 'rpc_pipefs', 'nsfs', 'efivarfs', 'squashfs', 'selinuxfs', 'overlay',
]);

function unescapeMount(value) {
  return value.replace(/\\([0-7]{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)));
}

export async function scanLinuxRoots() {
  const roots = new Map();
  const home = homedir();
  if (home.startsWith('/')) roots.set(home, { name: '个人文件夹', type: 'directory', path: home });
  roots.set('/', { name: '系统根目录', type: 'drive', path: '/' });
  let mounts = '';
  try { mounts = await readFile('/proc/self/mounts', 'utf8'); }
  catch { /* 没有挂载表时，主目录和根目录仍然可用。 */ }
  for (const line of mounts.split('\n')) {
    const [source = '', target = '', type = ''] = line.split(' ');
    if (!target.startsWith('/')) continue;
    const mount = unescapeMount(target);
    if (roots.has(mount)) continue;
    if (pseudoFileSystems.has(unescapeMount(type))) continue;
    const device = unescapeMount(source);
    if (!device || device === 'none' || device === 'tmpfs' || device === 'overlay') continue;
    // /mnt, /media and /run/media are where a desktop puts user dishes; anything
    // else must be a real block device to be worth listing.
    const userLocation = /^\/(?:mnt|media|run\/media)\//.test(mount);
    if (!device.startsWith('/dev/') && !userLocation) continue;
    roots.set(mount, { name: '磁盘 (' + mount + ')', type: 'drive', path: mount });
  }
  return [...roots.values()];
}

export function createLinuxFileOperations({ BrowseError, mutableEntry, normalizeLocalPath, resolve }) {
  async function moveWithoutOverwrite(source, destination) {
    await execute('mv', ['-nT', '--', source, destination]);
    // GNU mv -n may return success when it skipped an existing destination.
    if (await entryOrNull(source)) throw new BrowseError('此文件夹中已有同名项目', 409);
  }

  let staged;

  async function clearStaged() {
    const previous = staged;
    staged = undefined;
    if (previous?.cut) {
      await Promise.allSettled([...previous.entries.values()].map(({ handle }) => handle.close()));
    }
  }

  async function entryOrNull(target, options) {
    try { return await lstat(target, options); }
    catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
      throw error;
    }
  }

  function validName(name) {
    if (typeof name !== 'string' || !name || name.length > 255 || name === '.' || name === '..'
        || name.includes('/') || name.includes('\0')) {
      throw new BrowseError('请输入有效的文件名');
    }
    return name;
  }

  // A move stays a rename while both ends are on one filesystem; only a real
  // cross-device move needs copy-then-delete.
  async function transfer(source, destination, cut, signal, identity) {
    const info = await entryOrNull(source, { bigint: true });
    if (cut && (!info || fileIdentity(info) !== identity)) {
      throw new BrowseError('剪切的项目已变化，请重新剪切', 409);
    }
    if (!info) throw new BrowseError('文件或文件夹已不存在', 404);
    if (!info.isFile() && !info.isDirectory() && !info.isSymbolicLink()) {
      throw new BrowseError('此位置不是普通文件或文件夹');
    }
    signal.throwIfAborted();
    if (cut && info.dev === (await stat(path.dirname(destination), { bigint: true })).dev) {
      await moveWithoutOverwrite(source, destination);
      return;
    }
    if (info.isSymbolicLink()) {
      await symlink(await readlink(source), destination);
    } else {
      await cp(source, destination, {
        recursive: info.isDirectory(), force: false, errorOnExist: true, verbatimSymlinks: true, preserveTimestamps: true,
      });
    }
    if (!cut) return;
    signal.throwIfAborted();
    const current = await entryOrNull(source, { bigint: true });
    if (!current || fileIdentity(current) !== identity) {
      throw new BrowseError('复制后发现源项目已变化，已保留目标副本，请检查两处文件', 409);
    }
    await rm(source, { recursive: info.isDirectory() });
  }

  async function stagePosix(inputs, cut, signal) {
    await clearStaged();
    const entries = new Map();
    try {
      for (const input of inputs) {
        const { absolute, source } = await mutableEntry(input, signal);
        // Holding an O_PATH descriptor prevents the filesystem from reusing
        // this inode after unlink, without opening the item for reading.
        const handle = cut ? await open(source, linuxPathHandle) : undefined;
        const entry = { source, handle };
        entries.set(absolute, entry);
        if (handle) entry.identity = fileIdentity(await handle.stat({ bigint: true }));
      }
      signal.throwIfAborted();
    } catch (error) {
      if (cut) await Promise.allSettled([...entries.values()].map(({ handle }) => handle.close()));
      throw error;
    }
    staged = { entries, cut };
    return { count: entries.size, cut };
  }

  async function pastePosix(input, signal, workspace) {
    if (!staged?.entries.size) throw new BrowseError('剪贴板中没有可粘贴的文件或文件夹', 409);
    const absolute = normalizeLocalPath(input);
    const destination = await resolve(absolute, signal, workspace);
    if (!(await stat(destination)).isDirectory()) throw new BrowseError('请选择文件夹作为粘贴位置');
    const { entries, cut } = staged;
    const changed = new Set();
    const moved = [];
    let completed = 0;
    let failed = 0;
    let lastError;
    for (const [input, entry] of entries) {
      signal.throwIfAborted();
      try {
        const folder = await realpath(path.dirname(input));
        const source = path.join(folder, path.basename(input));
        if (cut && workspace && (source === workspace.nativeRoot || !underPath(source, workspace.nativeRoot))) {
          throw new BrowseError('不能移动工作区根目录或区外文件', 403);
        }
        if (cut && source !== entry.source) throw new BrowseError('剪切的项目已变化，请重新剪切', 409);
        const target = path.join(destination, path.basename(source));
        if (target === source || underPath(destination, source)) {
          throw new BrowseError('不能将文件夹粘贴到自身或其子文件夹', 409);
        }
        if (await entryOrNull(target)) throw new BrowseError('此文件夹中已有同名项目', 409);
        await transfer(source, target, cut, signal, entry.identity);
        completed += 1;
        changed.add(absolute).add(destination).add(target);
        if (cut) {
          entries.delete(input);
          await entry.handle.close().catch(() => {});
          changed.add(path.dirname(input)).add(folder);
          moved.push(input, ...(input === source ? [] : [source]));
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        failed += 1;
        lastError = error;
      }
    }
    if (cut && !entries.size) staged = undefined;
    if (!completed) throw lastError ?? new BrowseError('没有可粘贴的项目');
    return { completed, failed, cut, changed: [...changed], moved, ...(failed ? { message: lastError?.message } : {}) };
  }

  async function renamePosix(input, name, signal) {
    const value = validName(name);
    const { absolute, source, folder } = await mutableEntry(input, signal);
    if (value === path.basename(source)) return { path: absolute, changed: [path.dirname(absolute), folder] };
    const destination = path.join(folder, value);
    if (await entryOrNull(destination)) throw new BrowseError('此文件夹中已有同名项目', 409);
    signal.throwIfAborted();
    await moveWithoutOverwrite(source, destination).catch(error => {
      if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY' || error?.code === 'ENOTDIR') {
        throw new BrowseError('此文件夹中已有同名项目', 409);
      }
      if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EBUSY') {
        throw new BrowseError('没有重命名权限，或文件正在使用', 403);
      }
      throw error;
    });
    return { path: path.join(path.dirname(absolute), value), changed: [path.dirname(absolute), folder] };
  }

  // The built-in fallback handles the user's home trash. GIO handles external volumes.
  async function trashAtHome(source) {
    const data = process.env.XDG_DATA_HOME;
    const home = data?.startsWith('/') ? data : path.join(homedir(), '.local', 'share');
    const root = path.join(home, 'Trash');
    const files = path.join(root, 'files');
    const info = path.join(root, 'info');
    for (const directory of [root, files, info]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const metadata = await lstat(directory);
      if (!metadata.isDirectory() || metadata.uid !== process.getuid()) {
        throw new BrowseError('回收站目录无效', 409);
      }
    }
    if ((await stat(files)).dev !== (await lstat(source)).dev) {
      await execute('gio', ['trash', '--', source]).catch(error => {
        if (error.code === 'ENOENT') throw new BrowseError('此宗卷需要 gio 提供回收站功能', 503);
        throw error;
      });
      return;
    }

    const base = path.basename(source);
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    const original = source.split('/').map(encodeURIComponent).join('/');
    for (let index = 1; index <= 10000; index++) {
      const name = index === 1 ? base : base + '.' + index;
      const destination = path.join(files, name);
      const record = path.join(info, name + '.trashinfo');
      if (await entryOrNull(destination)) continue;
      try {
        await writeFile(record, '[Trash Info]\nPath=' + original + '\nDeletionDate=' + local + '\n', { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }
      try {
        await moveWithoutOverwrite(source, destination);
        return;
      } catch (error) {
        await unlink(record).catch(() => {});
        if (error.status !== 409) throw error;
      }
    }
    throw new BrowseError('无法为回收站项目分配名称', 409);
  }

  async function recyclePosix(inputs, signal) {
    const items = [];
    for (const input of inputs) items.push(await mutableEntry(input, signal));
    const recycled = [];
    let lastError;
    for (const item of items) {
      signal.throwIfAborted();
      try {
        await trashAtHome(item.source);
        recycled.push(item);
      } catch (error) { lastError = error; }
    }
    if (!recycled.length) {
      if (lastError instanceof BrowseError) throw lastError;
      throw new BrowseError('无法移入回收站，请检查权限或宗卷是否支持此操作', 409);
    }
    return {
      completed: recycled.length, failed: items.length - recycled.length,
      changed: recycled.flatMap(item => [path.dirname(item.absolute), item.folder]),
      removed: recycled.flatMap(item => [item.absolute, item.source]),
    };
  }

  return { stage: stagePosix, paste: pastePosix, rename: renamePosix, recycle: recyclePosix, clearStaged };
}
