export function move(history, delta) {
  const index = Math.max(0, Math.min(history.paths.length - 1, history.index + delta));
  return index === history.index ? history : { ...history, index };
}

export function visit(history, path) {
  if (samePath(history.paths[history.index], path)) return history;
  const paths = [...history.paths.slice(0, history.index + 1), path];
  return { paths, index: paths.length - 1 };
}

export function joinPath(parent, name) {
  const sep = parent.startsWith('/') ? '/' : '\\';
  return parent.endsWith(sep) ? parent + name : parent + sep + name;
}

export function localPath(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('/')) return value.replace(/\/+$/, '') || '/';
  if (!/^[a-z]:[\\/]/i.test(value)) return null;
  const normalized = value[0].toUpperCase() + value.slice(1).replace(/\//g, '\\');
  return normalized.length > 3 ? normalized.replace(/\\+$/, '') : normalized;
}

export function isWindowsBatch(path) {
  return /^[a-z]:[\\/].*\.(bat|cmd)$/i.test(path);
}

export function parentOf(path) {
  if (path?.startsWith('/')) return path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/';
  if (path === null || path.length <= 3) return null;
  return path.slice(0, Math.max(3, path.lastIndexOf('\\')));
}

export function pathKey(path) {
  return path?.startsWith('/') ? path : path?.toLowerCase();
}

export function pathName(path) {
  if (path == null) return;
  if (path.startsWith('/')) return path === '/' ? '/' : path.split('/').at(-1);
  return path.length === 3 ? path.slice(0, 2) : path.split('\\').at(-1);
}

export function underPath(path, root) {
  if (!path || !root) return false;
  const sep = root.startsWith('/') ? '/' : '\\';
  const value = pathKey(path);
  const prefix = pathKey(root);
  return value === prefix || value.startsWith(prefix.endsWith(sep) ? prefix : prefix + sep);
}

export function samePath(a, b) {
  return a === b || (a != null && b != null && pathKey(a) === pathKey(b));
}

export function renamePath(path, from, to) {
  return underPath(path, from) ? to + path.slice(from.length) : path;
}

export function resourceAddress(path, sessionId) {
  const posix = path.startsWith('/');
  const source = posix && !sessionId ? path.slice(1) : path;
  const encoded = source.split(posix ? '/' : '\\').map(segment => encodeURIComponent(segment).replace(/%3A/gi, ':')).join('/');
  return 'dsh-resource://file/' + (sessionId ? 'session/' + encodeURIComponent(sessionId) : 'absolute') + '/' + encoded;
}

export function sessionFilePath(address, sessionId) {
  const match = /^dsh-resource:\/\/file\/session\/([^/?#]+)\/([^?#]+)(?:[?#].*)?$/.exec(address);
  if (!match || !sessionId) return null;
  try {
    if (decodeURIComponent(match[1]) !== sessionId) return null;
    return match[2].split('/').map(decodeURIComponent).join('/');
  } catch { return null; }
}
