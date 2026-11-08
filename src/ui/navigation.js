export function move(history, delta) {
  const index = Math.max(0, Math.min(history.paths.length - 1, history.index + delta));
  return index === history.index ? history : { ...history, index };
}

export function visit(history, path) {
  if (history.paths[history.index] === path) return history;
  const paths = [...history.paths.slice(0, history.index + 1), path];
  return { paths, index: paths.length - 1 };
}

export function joinPath(parent, name) {
  return parent.endsWith('\\') ? parent + name : parent + '\\' + name;
}

export function windowsPath(value) {
  if (typeof value !== 'string' || !/^[a-z]:[\\/]/i.test(value)) return null;
  const normalized = value[0].toUpperCase() + value.slice(1).replace(/\//g, '\\');
  return normalized.length > 3 ? normalized.replace(/\\+$/, '') : normalized;
}

export function parentOf(path) {
  if (path === null || path.length <= 3) return null;
  return path.slice(0, Math.max(3, path.lastIndexOf('\\')));
}

export function resourceAddress(path, sessionId) {
  const encoded = path.split('\\').map(segment => encodeURIComponent(segment).replace(/%3A/gi, ':')).join('/');
  return 'dsh-resource://file/' + (sessionId ? 'session/' + encodeURIComponent(sessionId) : 'absolute') + '/' + encoded;
}
