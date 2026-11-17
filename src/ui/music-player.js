import { bufferMediaSource, mediaCanSeek, openMediaSource, releaseMediaSource } from './media-source.js';
import { readAudioTags } from './audio-tags.js';

const tracks = new Map();
const listeners = new Set();
const progressListeners = new Set();
const bufferedAudioLimit = 32 * 1024 ** 2;
export const emptyMusicProgress = { current: 0, duration: 0 };
let audio;
let restorePreview;
let snapshot = { track: null, capsule: false, playing: false, failed: false };
let progress = emptyMusicProgress;
let lastProgressAt = -Infinity;

function publish(update) {
  if (Object.keys(update).every(key => snapshot[key] === update[key])) return;
  snapshot = { ...snapshot, ...update };
  for (const listener of listeners) listener();
}

export function subscribeMusic(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function musicSnapshot() { return snapshot; }

export function subscribeMusicProgress(listener) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function musicProgress() { return progress; }

function publishProgress(current, duration) {
  if (progress.current === current && progress.duration === duration) return;
  progress = { current, duration };
  for (const listener of progressListeners) listener();
}

async function previewArtwork(cover) {
  if (!cover) return;
  try {
    const image = await createImageBitmap(cover);
    try {
      const side = Math.min(image.width, image.height);
      const size = Math.min(256, side);
      if (image.width === size && image.height === size) return cover;
      const canvas = new OffscreenCanvas(size, size);
      canvas.getContext('2d').drawImage(image, (image.width - side) / 2, (image.height - side) / 2,
        side, side, 0, 0, size, size);
      return await canvas.convertToBlob({ type: 'image/webp', quality: .9 });
    } finally { image.close(); }
  } catch { return cover; }
}

export function trackKey(file) {
  return file.absolute.toLowerCase();
}

async function openAudioSource(file, mime, signal, root) {
  // Typical local tracks can use a single bounded read and a browser-local source.
  if (file.size === undefined || file.size <= bufferedAudioLimit) {
    try {
      return await openMediaSource(file.absolute, mime, signal, root, true);
    } catch { signal.throwIfAborted(); }
  }
  return openMediaSource(file.absolute, mime, signal, root);
}

export function retainTrack(file, root, mime) {
  const key = trackKey(file);
  const existing = tracks.get(key);
  if (existing) { existing.refs++; return existing; }
  const controller = new AbortController();
  const track = { key, file, controller, refs: 1, root, mime };
  tracks.set(key, track);
  track.load = openAudioSource(file, mime, controller.signal, root).then(async source => {
    const tags = await readAudioTags(source, mime, controller.signal).catch(() => ({}));
    if (controller.signal.aborted) { releaseMediaSource(source); return; }
    const cover = await previewArtwork(tags.cover);
    if (controller.signal.aborted) { releaseMediaSource(source); return; }
    Object.assign(track, {
      title: tags.title || file.name.replace(/\.[^.]+$/, ''), artist: tags.artist,
      cover: cover && URL.createObjectURL(cover),
      url: source.url,
    });
  }).catch(() => { if (!controller.signal.aborted) track.failed = true; });
  return track;
}

export function releaseTrack(track) {
  if (--track.refs) return;
  tracks.delete(track.key);
  track.controller.abort();
  if (track.cover) URL.revokeObjectURL(track.cover);
  if (track.url) releaseMediaSource(track);
}

function syncProgress(force) {
  if (!snapshot.track || snapshot.track.pendingSeek !== undefined) return;
  const now = performance.now();
  if (!force && now - lastProgressAt < 200) return;
  lastProgressAt = now;
  publishProgress(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
}

function syncPlayback() {
  if (!snapshot.track) return;
  publish({ playing: !audio.paused && !audio.ended, failed: Boolean(snapshot.track.failed) });
  syncProgress(true);
}

async function recoverPlayback() {
  const { track } = snapshot;
  if (!track || track.recovering) return;
  if (!track.url.startsWith('blob:')) {
    track.recovering = true;
    track.pendingSeek ??= progress.current;
    audio.pause();
    try {
      const source = await bufferMediaSource(track.url, track.file.absolute, track.mime, track.controller.signal, track.root);
      if (track.controller.signal.aborted) { releaseMediaSource(source); return; }
      track.url = source.url;
      if (snapshot.track === track) audio.src = track.url;
      else track.pendingSeek = undefined;
      return;
    } catch { if (track.controller.signal.aborted) return; }
    finally { track.recovering = false; }
  }
  track.pendingSeek = undefined;
  track.failed = true;
  if (snapshot.track === track) syncPlayback();
}

function player() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'metadata';
    for (const event of ['play', 'pause', 'ended']) {
      audio.addEventListener(event, syncPlayback);
    }
    audio.addEventListener('timeupdate', () => syncProgress(false));
    audio.addEventListener('loadedmetadata', () => {
      const { track } = snapshot;
      if (!track?.url.startsWith('blob:') || track.pendingSeek === undefined || audio.currentSrc !== track.url) return;
      const time = track.pendingSeek;
      track.pendingSeek = undefined;
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, time);
      if (track.playRequested) void audio.play().catch(() => {});
      syncPlayback();
    });
    for (const event of ['durationchange', 'seeked']) audio.addEventListener(event, () => syncProgress(true));
    audio.addEventListener('error', recoverPlayback);
    audio.addEventListener('ended', () => { if (snapshot.track) snapshot.track.playRequested = false; });
  }
  return audio;
}

export function stopMusic() {
  const { track } = snapshot;
  if (!track) return;
  track.playRequested = false;
  restorePreview = undefined;
  publish({ track: null, capsule: false, playing: false, failed: false });
  publishProgress(0, 0);
  lastProgressAt = -Infinity;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  releaseTrack(track);
}

function selectTrack(track) {
  if (snapshot.track === track) return;
  stopMusic();
  track.refs++;
  player().src = track.url;
  publish({ track });
}

export function primeMusic(track) {
  if (!snapshot.track && track.url && !track.failed) selectTrack(track);
}

export function toggleMusic(track) {
  if (!track?.url || track.failed) return;
  selectTrack(track);
  track.playRequested = track.recovering ? !track.playRequested : audio.paused;
  if (track.playRequested) void audio.play().catch(() => {});
  else audio.pause();
}

export function seekMusic(track, time) {
  if (track !== snapshot.track || !Number.isFinite(time)) return;
  const duration = track.pendingSeek !== undefined ? progress.duration : audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const current = Math.min(duration, Math.max(0, time));
  if (track.pendingSeek !== undefined || (!track.url.startsWith('blob:') && !mediaCanSeek(audio, current))) {
    track.pendingSeek = current;
    publishProgress(current, duration);
    if (!track.url.startsWith('blob:')) void recoverPlayback();
    return;
  }
  audio.currentTime = current;
  syncProgress(true);
}

export function minimizeMusic(track, restore) {
  if (!track?.url || track.failed) return false;
  selectTrack(track);
  restorePreview = restore;
  publish({ capsule: true });
  return true;
}

export function restoreMusic() {
  if (snapshot.capsule && restorePreview?.()) {
    restorePreview = undefined;
    publish({ capsule: false });
  }
}

export function leaveMusicPreview(track) {
  // React may replace a view with another view of the same file in the same commit.
  queueMicrotask(() => {
    if (snapshot.track === track && !snapshot.capsule && track.refs === 1) stopMusic();
  });
}
