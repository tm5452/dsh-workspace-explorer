import { thumbnailType } from '../thumbnail-types.js';
import { disks } from './workspace.js';

const { createElement: h, useEffect, useRef, useState } = react;
const pending = new Set();
let running = 0;

function startNext() {
  while (running < 3 && pending.size) {
    const next = pending.values().next().value;
    pending.delete(next);
    running++;
    void next().finally(() => { running--; startNext(); });
  }
}

function waitForFrame(media, event, signal) {
  return new Promise((resolve, reject) => {
    const handlers = new AbortController();
    function settle(error) {
      handlers.abort();
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    }
    function cancel() { settle(signal.reason); }
    if (signal.aborted) { cancel(); return; }
    const options = { once: true, signal: handlers.signal };
    signal.addEventListener('abort', cancel, { once: true });
    media.addEventListener(event, () => settle(), options);
    media.addEventListener('error', () => settle(new Error('无法解码缩略图')), options);
  });
}

async function makeThumbnail(path, type, signal, root) {
  const { url } = await disks.thumbnail(path, signal, root);
  signal.throwIfAborted();
  const video = type.startsWith('video/');
  const media = document.createElement(video ? 'video' : 'img');
  if (video) { media.preload = 'auto'; media.muted = true; }
  try {
    const firstFrame = waitForFrame(media, video ? 'loadeddata' : 'load', signal);
    media.src = url;
    await firstFrame;
    if (video && Number.isFinite(media.duration) && media.duration > 0.2) {
      const seeked = waitForFrame(media, 'seeked', signal);
      media.currentTime = Math.min(0.7, media.duration * 0.12);
      await seeked;
    }
    const width = video ? media.videoWidth : media.naturalWidth;
    const height = video ? media.videoHeight : media.naturalHeight;
    if (!width || !height) throw new Error('缩略图为空');
    const scale = Math.min(192 / width, 136 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(media, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.85);
  } finally {
    media.removeAttribute('src');
    if (video) media.load();
  }
}

export function Thumbnail({ path, active, fallback, root }) {
  const slot = useRef(null);
  const [result, setResult] = useState(null);
  const type = thumbnailType(path);
  const image = result?.path === path && result?.root === root ? result.image : null;
  useEffect(() => {
    const element = slot.current;
    if (!element || !active || !type || image) return;
    let job;
    let failed = false;
    function cancel() {
      if (!job) return;
      pending.delete(job.run);
      job.controller.abort();
      job = undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { cancel(); return; }
      if (job || failed) return;
      const controller = new AbortController();
      const run = async () => {
        try {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
          const image = await makeThumbnail(path, type, signal, root);
          if (!signal.aborted) setResult({ path, root, image });
        } catch {
          if (!controller.signal.aborted) failed = true;
        }
      };
      job = { controller, run };
      pending.add(run);
      startNext();
    }, { root: element.closest('.dwe-list'), rootMargin: '72px 0px' });
    observer.observe(element);
    return () => { observer.disconnect(); cancel(); };
  }, [active, path, type, image, root]);

  return h('span', { ref: slot, className: 'dwe-thumbnail', 'aria-hidden': true },
    image ? h('img', { src: image, alt: '', draggable: false }) : fallback,
    image && type?.startsWith('video/') && h('span', { className: 'dwe-video-mark' }, '▶'));
}
