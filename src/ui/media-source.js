import { disks } from './workspace.js';

export async function openMediaSource(path, mime, signal, root, buffered = false) {
  if (!buffered) {
    try {
      const { url } = await disks.playback(path, signal, root);
      if (typeof url === 'string' && url) return { url };
    } catch { signal.throwIfAborted(); }
  }
  const bytes = await disks.readBytes(path, signal, root);
  signal.throwIfAborted();
  return { url: URL.createObjectURL(new Blob([bytes], { type: mime })), bytes };
}

export async function bufferMediaSource(url, path, mime, signal, root) {
  try {
    const response = await fetch(url || (await disks.playback(path, signal, root)).url, { signal });
    if (!response.ok || response.status === 206) throw new Error('无法完整读取媒体');
    const blob = await response.blob();
    signal.throwIfAborted();
    return { url: URL.createObjectURL(blob) };
  } catch { signal.throwIfAborted(); }
  return openMediaSource(path, mime, signal, root, true);
}

export function mediaCanSeek(media, time) {
  if (time === 0) return true;
  const { seekable } = media;
  for (let index = 0; index < seekable.length; index++) {
    if (time >= seekable.start(index) && time <= seekable.end(index)) return true;
  }
  return false;
}

export function releaseMediaSource(source) {
  if (source?.url.startsWith('blob:')) URL.revokeObjectURL(source.url);
}
