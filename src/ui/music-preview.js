import { MediaProgress, mediaButton } from './media-controls.js';
import { icon } from './interface-icon.js';
import {
  emptyMusicProgress, leaveMusicPreview, minimizeMusic, musicProgress, musicSnapshot, releaseTrack,
  restoreMusic, primeMusic, retainTrack, seekMusic, subscribeMusic, subscribeMusicProgress, toggleMusic, trackKey,
} from './music-player.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = react;

function useMusicMotion(target, active) {
  useEffect(() => {
    if (!active) return;
    const element = target.current;
    let inView = false;

    function update() {
      element.toggleAttribute('data-dwe-motion', inView && !document.hidden);
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element.parentElement);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      element.removeAttribute('data-dwe-motion');
    };
  }, [target, active]);
}

function Cover({ track, playing, children }) {
  const artwork = useRef(null);
  useMusicMotion(artwork, playing);
  return h('div', { className: 'dwe-music-cover', 'data-playing': playing || undefined },
    h('span', { ref: artwork, className: 'dwe-music-artwork', 'aria-hidden': true },
      track?.cover ? h('img', { src: track.cover, alt: '', draggable: false }) : icon('music-default-cover', 85)),
    children);
}

function MusicTitle({ title, playing }) {
  const container = useRef(null);
  const text = useRef(null);
  const track = useRef(null);
  const [scrollDuration, setScrollDuration] = useState(0);
  useLayoutEffect(() => {
    const element = container.current;
    function measure() {
      const width = Math.ceil(text.current.getBoundingClientRect().width);
      const gap = Number.parseFloat(getComputedStyle(text.current).fontSize) * 1.25;
      setScrollDuration(width > element.clientWidth + 1 ? (width + gap) / 34 : 0);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [title]);
  const scrolling = playing && scrollDuration > 0;
  useMusicMotion(track, scrolling);
  return h('div', { ref: container, className: 'dwe-music-title', title, 'data-scrolling': scrolling || undefined },
    h('span', { ref: track, className: 'dwe-music-title-track', style: { '--dwe-marquee-duration': scrollDuration + 's' } },
      h('span', { ref: text }, title),
      scrolling && h('span', { 'aria-hidden': true }, title)));
}

const subscribeInactive = () => () => {};
const inactiveProgress = () => emptyMusicProgress;

function MusicProgress({ track, active }) {
  const progress = useSyncExternalStore(
    active ? subscribeMusicProgress : subscribeInactive,
    active ? musicProgress : inactiveProgress,
  );
  return h(MediaProgress, { ...progress, seek: time => seekMusic(track, time) });
}

function MusicDetails({ track, file, active, playing, capsule }) {
  return h('div', { className: 'dwe-music-details' },
    h(MusicTitle, { title: track?.title ?? file.name, playing }),
    !capsule && h('div', { className: 'dwe-music-artist', title: track?.artist },
      track?.artist ? 'By ' + track.artist : '未知艺术家'),
    h(MusicProgress, { track, active }));
}

function playButton(track, playing, capsule = false) {
  return mediaButton(playing ? (capsule ? 'capsulePause' : 'musicPause') : 'musicPlay', playing ? '暂停' : '播放',
    () => toggleMusic(track), 'dwe-music-play', !track?.url || track.failed);
}

function MusicAction({ name, label, onClick, disabled }) {
  return h('button', {
    type: 'button', className: 'dwe-tool dwe-music-action dwe-music-' + name +
      (name === 'minimize' ? ' dwe-preview-media-action' : ''),
    title: label, 'aria-label': label, disabled, onClick,
  }, icon(name === 'restore' ? 'preview-return-inline' : 'music-' + name));
}

function MusicCard({ track, file, active, playing }) {
  const cardRef = useRef(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const viewport = card.parentElement;
    const cover = card.querySelector('.dwe-music-cover');
    const details = card.querySelector('.dwe-music-details');
    const parts = [cover, details];
    const motion = matchMedia('(prefers-reduced-motion: no-preference)');
    let animations = [];

    function fit(animate) {
      const coverSize = card.clientWidth * .3003;
      const needed = coverSize + details.offsetHeight + parseFloat(getComputedStyle(card).gap);
      const horizontal = viewport.clientHeight <= needed;
      if (horizontal === card.hasAttribute('data-horizontal')) return;
      const first = animate && motion.matches ? parts.map(part => part.getBoundingClientRect()) : null;
      for (const animation of animations) animation.cancel();
      card.toggleAttribute('data-horizontal', horizontal);
      animations = first ? parts.map((part, index) => {
        const end = part.getBoundingClientRect();
        const dx = first[index].left - end.left;
        const dy = first[index].top - end.top;
        return part.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' },
          { transform: 'translate(0px, 0px)' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }) : [];
    }

    const observer = new ResizeObserver(() => fit(true));
    observer.observe(viewport);
    observer.observe(details);
    fit(false);
    return () => {
      observer.disconnect();
      for (const animation of animations) animation.cancel();
    };
  }, []);

  return h('div', { ref: cardRef, className: 'dwe-music-card' },
    h(Cover, { track, playing }, playButton(track, playing)),
    h(MusicDetails, { track, file, active, playing }),
    track?.failed && h('span', { className: 'dwe-music-error', role: 'status' }, '无法预览此音频'));
}

export function MusicPreview({ file, root, mime, onRestore }) {
  const [loaded, setLoaded] = useState(null);
  const state = useSyncExternalStore(subscribeMusic, musicSnapshot);
  const key = trackKey(file);
  const track = loaded?.key === key ? loaded : null;
  const playback = state.track?.key === key ? state : null;

  useEffect(() => {
    const entry = retainTrack(file, root, mime);
    let active = true;
    void entry.load.then(() => {
      if (!active) return;
      setLoaded(entry);
      primeMusic(entry);
    });
    return () => {
      active = false;
      releaseTrack(entry);
      leaveMusicPreview(entry);
    };
  }, [key, mime, root]);

  if (playback?.capsule) return h('p', { className: 'dwe-preview-hint' }, '单击一个文件进行预览');
  const minimize = onRestore && h(MusicAction, {
    name: 'minimize', label: '缩小为音乐胶囊',
    disabled: !track?.url || track.failed,
    onClick: () => minimizeMusic(track, onRestore),
  });
  return h(react.Fragment, null,
    h('div', { className: 'dwe-music-viewport' },
      h(MusicCard, { track, file, active: Boolean(playback), playing: playback?.playing })),
    minimize);
}

function FloatingMusic({ state, sessionId }) {
  const capsuleRef = useRef(null);
  const placement = useRef(null);
  useLayoutEffect(() => {
    const host = capsuleRef.current;
    const capsule = host.firstElementChild;
    const conversation = document.querySelector('[data-rightbar-col]')?.previousElementSibling;
    const controller = new AbortController();
    const { signal } = controller;
    let previous;
    let frame;
    let pointer;
    let maxX;
    let maxY;

    function measureBounds() {
      maxX = Math.max(0, document.documentElement.clientWidth - host.offsetWidth);
      maxY = Math.max(0, document.documentElement.clientHeight - host.offsetHeight);
    }

    function place(x, y) {
      const left = Math.max(0, Math.min(x, maxX));
      const top = Math.max(0, Math.min(y, maxY));
      if (placement.current?.x === left && placement.current.y === top) return;
      placement.current = { x: left, y: top };
      host.setAttribute('data-dwe-positioned', '');
      host.style.setProperty('--dwe-capsule-x', left + 'px');
      host.style.setProperty('--dwe-capsule-y', top + 'px');
    }

    function position() {
      frame = undefined;
      if (conversation) {
        const rect = conversation.getBoundingClientRect();
        const canFit = rect.width >= 232 && rect.height >= 175;
        const header = canFit ? conversation.querySelector('header:has([data-conversation-header-leading])') : null;
        const right = Math.round(Math.max(16, innerWidth - rect.right + 16));
        const top = Math.round(Math.max(16, (header?.getBoundingClientRect().bottom ?? rect.top) + 12));
        const width = Math.round(rect.width - 32);
        const current = canFit ? right + '/' + top + '/' + width : '';
        if (current !== previous) {
          previous = current;
          host.toggleAttribute('data-dwe-in-conversation', canFit);
          if (canFit) {
            host.style.setProperty('--dwe-capsule-right', right + 'px');
            host.style.setProperty('--dwe-capsule-top', top + 'px');
            host.style.setProperty('--dwe-capsule-width', width + 'px');
          }
        }
      }
      measureBounds();
      if (placement.current) place(placement.current.x, placement.current.y);
    }

    function start(event) {
      if (event.button !== 0 || pointer || event.target.closest('input, .dwe-music-restore')) return;
      measureBounds();
      const { left, top } = host.getBoundingClientRect();
      pointer = { id: event.pointerId, left, top, x: event.clientX, y: event.clientY, dragging: false };
    }

    function move(event) {
      if (pointer?.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { end(event); return; }
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        pointer.dragging = true;
        capsule.setAttribute('data-dwe-dragging', '');
        capsule.setPointerCapture(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      place(pointer.left + dx, pointer.top + dy);
    }

    function end(event) {
      if (!pointer || (event?.pointerId !== undefined && pointer.id !== event.pointerId)) return;
      const { id } = pointer;
      pointer = undefined;
      capsule.removeAttribute('data-dwe-dragging');
      if (capsule.hasPointerCapture(id)) capsule.releasePointerCapture(id);
    }

    function schedulePosition() { frame ??= requestAnimationFrame(position); }
    const observer = new ResizeObserver(schedulePosition);
    if (conversation) observer.observe(conversation);
    else host.removeAttribute('data-dwe-in-conversation');
    window.addEventListener('resize', schedulePosition, { signal });
    capsule.addEventListener('pointerdown', start, { signal });
    capsule.addEventListener('lostpointercapture', end, { signal });
    window.addEventListener('pointermove', move, { signal });
    window.addEventListener('pointerup', end, { signal });
    window.addEventListener('pointercancel', end, { signal });
    window.addEventListener('blur', end, { signal });
    position();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      end();
      controller.abort();
    };
  }, [sessionId]);

  const { track, playing } = state;
  return h('aside', { ref: capsuleRef, className: 'dwe dwe-music-float', 'aria-label': '音乐胶囊' },
    h('div', { className: 'dwe-music-capsule' },
      h(Cover, { track, playing }, playButton(track, playing, true)),
      h(MusicDetails, { track, file: track.file, active: true, playing, capsule: true }),
      h(MusicAction, { name: 'restore', label: '返回预览窗', onClick: restoreMusic })));
}

export function MusicCapsule({ sessionId }) {
  const state = useSyncExternalStore(subscribeMusic, musicSnapshot);
  if (!state.capsule || !state.track) return null;
  return reactDom.createPortal(h(FloatingMusic, { state, sessionId }), document.body);
}
