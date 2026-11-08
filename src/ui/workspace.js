const endpoint = '/api/dsh.workspaceExplorer';

async function request(operation, path, signal) {
  const response = await fetch(endpoint, {
    method: 'POST', signal, cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-dsh-workspace-explorer': '1' },
    body: JSON.stringify({ operation, path }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || '本机文件服务不可用（' + response.status + '）');
  }
  return operation === 'bytes' ? new Uint8Array(await response.arrayBuffer()) : response.json();
}

export const disks = {
  list: (path, signal) => request('list', path, signal),
  locate: (path, signal) => request('locate', path, signal),
  read: (path, signal) => request('text', path, signal),
  readBytes: (path, signal) => request('bytes', path, signal),
};
