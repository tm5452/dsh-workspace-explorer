import { resourceAddress } from './navigation.js';
import { disks } from './workspace.js';
import { audioType } from '../audio-types.js';
import { thumbnailType } from '../thumbnail-types.js';

export function isPlaybackFile(name) {
  return Boolean(audioType(name) || thumbnailType(name)?.startsWith('video/'));
}

export const previewWillMoveEvent = 'dwe-preview-will-move';
export const previewMovedEvent = 'dwe-preview-moved';

// Reparent a connected preview without unloading its iframe or media elements.
export function movePreview(host, destination) {
  if (!destination || host.parentNode === destination) return;
  if (host.isConnected) host.dispatchEvent(new Event(previewWillMoveEvent, { bubbles: true }));
  if (host.isConnected && destination.isConnected && destination.moveBefore) {
    destination.moveBefore(host, null);
  } else destination.appendChild(host);
  if (host.isConnected) host.dispatchEvent(new Event(previewMovedEvent, { bubbles: true }));
}

export async function openNativePreview(file, root, target, isCurrent, openDocument) {
  if (!target?.sessionId || !file) return;
  if (root) await disks.locate(file.absolute, undefined, root);
  if (!isCurrent()) return;
  openDocument(resourceAddress(file.absolute, target.sessionId), {
    paneId: target.paneId, params: file.line ? { line: file.line } : undefined,
  });
}
