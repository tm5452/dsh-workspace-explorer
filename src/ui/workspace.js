const endpoint = '/api/dsh.workspaceExplorer';
const fileSelection = paths => paths.length === 1 ? paths[0] : paths;

async function request(operation, path, signal, workspace, fields) {
  const response = await fetch(endpoint, {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-dsh-workspace-explorer': '1' },
    body: JSON.stringify({ operation, path, workspace: workspace ?? undefined, ...fields }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || '本机文件服务不可用（' + response.status + '）');
  }
  return operation === 'bytes' || operation === 'office'
    ? new Uint8Array(await response.arrayBuffer()) : response.json();
}

export const disks = {
  list: (path, signal, root) => request('list', path, signal, root),
  locate: (path, signal, root) => request('locate', path, signal, root),
  openBatch: (path, root) => request('open-batch', path, undefined, root),
  read: (path, signal, root) => request('text', path, signal, root),
  readTextWindow: (path, signal, root, cursor, line) => request('text-window', path, signal, root, { cursor, line }),
  readBytes: (path, signal, root) => request('bytes', path, signal, root),
  documentPreview: (path, signal, root) => request('document-preview', path, signal, root),
  imagePreview: (path, signal, root) => request('image-preview', path, signal, root),
  releasePreview: ticket => request('release-preview', ticket).catch(() => {}),
  thumbnail: (path, signal, root) => request('thumbnail', path, signal, root),
  playback: (path, signal, root) => request('playback', path, signal, root),
  stage: (paths, cut, root) => request(cut ? 'cut' : 'copy', fileSelection(paths), undefined, root),
  paste: (path, root) => request('paste', path, undefined, root),
  rename: (path, name, root) => request('rename', path, undefined, root, { name }),
  recycle: (paths, root) => request('recycle', fileSelection(paths), undefined, root),
  search: (root, query, signal) => request('search', root, signal, undefined, { query }),
};
