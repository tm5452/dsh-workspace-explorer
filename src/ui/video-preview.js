import { disks } from './workspace.js';
import { makeThumbnail } from './thumbnail.js';
import { useMediaViewport } from './preview-zoom.js';
import { MediaProgress, mediaButton, mediaIcon } from './media-controls.js';
import { icon } from './interface-icon.js';
import { formatSize } from './file-size.js';
import { bufferMediaSource, mediaCanSeek, openMediaSource, releaseMediaSource } from './media-source.js';

const { createElement: h, useEffect, useId, useLayoutEffect, useRef, useState } = react;

function FullscreenVideoDock({ playButton, progress, ended, activatePlayback, exit }) {
  const dock = useRef(null);
  const action = useRef(activatePlayback);
  useLayoutEffect(() => { action.current = activatePlayback; }, [activatePlayback]);

  useLayoutEffect(() => {
    const container = dock.current;
    const lifetime = new AbortController();
    const options = { capture: true, signal: lifetime.signal };
    let press;

    function pointerDown(event) {
      if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return;
      press = undefined;
      const button = event.target.closest('.dwe-video-toggle');
      if (!button || !container.contains(button) || !button.closest(':popover-open')) return;
      press = { button, id: event.pointerId, x: event.clientX, y: event.clientY };
      // The fullscreen control belongs to the video, even when its position is outside the host pane.
      event.stopPropagation();
    }

    function pointerUp(event) {
      if (press?.id !== event.pointerId || event.button !== 0) return;
      const { button, x, y } = press;
      press = undefined;
      const releasedOnButton = event.target instanceof Node && button.contains(event.target);
      if (!button.isConnected || (!releasedOnButton && Math.hypot(event.clientX - x, event.clientY - y) > 6)) return;
      event.stopPropagation();
      action.current();
    }

    window.addEventListener('pointerdown', pointerDown, options);
    window.addEventListener('pointerup', pointerUp, options);
    window.addEventListener('pointercancel', () => { press = undefined; }, options);
    return () => lifetime.abort();
  }, []);

  useLayoutEffect(() => {
    if (!ended) dock.current.removeAttribute('data-replay-condensed');
  }, [ended]);

  return h('div', {
    ref: dock, className: 'dwe-video-fullscreen-dock',
    'data-autohide': (progress && !ended) || undefined, 'data-ended': ended || undefined,
    onTransitionEnd: event => {
      if (ended && event.propertyName === 'visibility' && event.target.classList.contains('dwe-media-progress') &&
          getComputedStyle(event.target).visibility === 'hidden') {
        // After the first shrink, only the remaining play button reopens the bar.
        dock.current.setAttribute('data-replay-condensed', '');
      }
    },
  }, h('div', { className: 'dwe-video-fullscreen-row' },
    progress && h('div', { className: 'dwe-video-fullscreen-progress' },
      h('div', { className: 'dwe-video-controls' }, progress),
      playButton),
    mediaButton('exitFullscreen', '退出全屏 (Esc)', exit, 'dwe-video-exit-fullscreen')));
}

export function VideoPreview({ file, root, mime, confirmed, openImmediately, onConfirm }) {
  const viewport = useRef(null);
  const overlay = useRef(null);
  const player = useRef(null);
  const card = useRef(null);
  const details = useRef(null);
  const restorePlayback = useRef(null);
  const infoId = useId();
  const [started, setStarted] = useState(Boolean(confirmed));
  const [poster, setPoster] = useState(null);
  const [source, setSource] = useState(null);
  const [useBuffer, setUseBuffer] = useState(false);
  const [size, setSize] = useState(file.size);
  const [fullscreen, setFullscreen] = useState(false);
  const [smallCard, setSmallCard] = useState(false);
  const [playback, setPlayback] = useState({ current: 0, duration: 0, playing: false, ended: false });
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const compact = smallCard && !fullscreen;
  useMediaViewport(viewport, fullscreen);

  useLayoutEffect(() => {
    if (fullscreen) return;
    const surface = card.current;
    const text = details.current;
    function fit() {
      setSmallCard(surface.clientHeight > 0 && text.offsetHeight * 2 > surface.clientHeight);
    }
    const observer = new ResizeObserver(fit);
    observer.observe(surface);
    observer.observe(text);
    fit();
    return () => observer.disconnect();
  }, [fullscreen]);

  useLayoutEffect(() => {
    if (!fullscreen) return;
    const frame = overlay.current;
    function escape(event) {
      if (event.key !== 'Escape' || !frame.matches(':popover-open')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      frame.hidePopover();
      setFullscreen(false);
    }
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [fullscreen]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]);
    if (!openImmediately) {
      void makeThumbnail(file.absolute, mime, signal, root, true).then(image => {
        if (!signal.aborted) setPoster(image);
      }, () => {});
    }
    if (file.size === undefined) {
      void disks.locate(file.absolute, controller.signal, root).then(info => {
        if (!controller.signal.aborted) setSize(info.size);
      }, () => {});
    }
    return () => controller.abort();
  }, [file.absolute, file.size, root, mime]);

  useEffect(() => {
    if (openImmediately) setStarted(true);
  }, [openImmediately]);

  useEffect(() => {
    if (!started) return;
    const controller = new AbortController();
    let opened;
    const open = useBuffer
      ? bufferMediaSource(restorePlayback.current?.url, file.absolute, mime, controller.signal, root)
      : openMediaSource(file.absolute, mime, controller.signal, root);
    void open.then(result => {
      if (controller.signal.aborted) { releaseMediaSource(result); return; }
      opened = { url: result.url };
      setSource(opened);
    }, () => {
      if (controller.signal.aborted) return;
      restorePlayback.current = null;
      setFailed(true);
    });
    return () => { controller.abort(); releaseMediaSource(opened); };
  }, [file.absolute, mime, root, started, useBuffer]);

  function recover(video, current, playing) {
    restorePlayback.current = { current, playing, url: source?.url };
    video.pause();
    setUseBuffer(true);
  }

  function mediaError(event) {
    const video = event.currentTarget;
    if (!useBuffer && !source?.url.startsWith('blob:')) {
      recover(video, video.currentTime, !ready || playback.playing);
    } else if (source?.url.startsWith('blob:')) {
      restorePlayback.current = null;
      setFailed(true);
    }
  }

  function sync(event) {
    const video = event.currentTarget;
    if (restorePlayback.current) return;
    setPlayback({
      current: video.currentTime, duration: video.duration,
      playing: !video.paused && !video.ended, ended: video.ended,
    });
  }

  function loadedMetadata(event) {
    const video = event.currentTarget;
    const restore = restorePlayback.current;
    if (restore && useBuffer && source?.url.startsWith('blob:')) {
      restorePlayback.current = null;
      video.currentTime = Math.min(restore.current, video.duration);
      if (restore.playing) void video.play().catch(() => {});
    }
    sync(event);
  }

  function seek(time) {
    const video = player.current;
    if (!video || !Number.isFinite(time) || !Number.isFinite(video.duration)) return;
    const current = Math.max(0, Math.min(time, video.duration));
    const restore = restorePlayback.current;
    if (restore) restore.current = current;
    else if (!useBuffer && !source?.url.startsWith('blob:') && !mediaCanSeek(video, current)) {
      recover(video, current, !video.paused && !video.ended);
    } else video.currentTime = current;
    setPlayback(previous => ({ ...previous, current, ended: current === video.duration && previous.ended }));
  }

  function play() {
    if (!started) {
      setStarted(true);
      onConfirm?.();
      return;
    }
    const video = player.current;
    if (!video) return;
    if (restorePlayback.current) {
      const restore = restorePlayback.current;
      restore.playing = !restore.playing;
      setPlayback(previous => ({ ...previous, playing: restore.playing }));
      return;
    }
    if (!video.paused && !video.ended) {
      video.pause();
      return;
    }
    if (video.ended) video.currentTime = 0;
    void video.play().catch(() => {});
  }

  function toggleFullscreen() {
    const frame = overlay.current;
    const entering = !frame.matches(':popover-open');
    if (entering) frame.showPopover();
    else frame.hidePopover();
    setFullscreen(entering);
  }

  const playButton = ready && mediaButton(playback.playing ? 'pause' : playback.ended ? 'replay' : 'play',
    playback.playing ? '暂停' : playback.ended ? '重新播放' : '播放', event => {
      if (!fullscreen || event.detail === 0) play();
    }, 'dwe-video-toggle');
  const progress = ready && h(MediaProgress, { ...playback, seek, inactive: compact });
  const fullscreenButton = !fullscreen && h('button', {
    type: 'button', className: 'dwe-tool dwe-preview-media-action dwe-video-fullscreen',
    'aria-label': '视频全屏', title: '视频全屏', onClick: toggleFullscreen,
  }, icon('video-fullscreen'));

  const view = h('div', {
    ref: overlay, popover: 'manual', className: 'dwe-video-overlay',
  }, h('div', { ref: viewport, className: 'dwe-media-viewport', 'aria-label': '视频预览' },
    h('div', { ref: card, className: 'dwe-video-card', 'data-dwe-zoom-surface': '', 'data-compact': compact || undefined,
        'data-cover': !ready || undefined, 'data-paused': !playback.playing || undefined,
        'data-ended': playback.ended || undefined },
      poster && h('img', { className: 'dwe-video-frame', src: poster, alt: '', draggable: false }),
      source && h('video', {
        ref: player, className: 'dwe-video-frame', src: source.url, playsInline: true, autoPlay: !useBuffer,
        'data-ready': ready || undefined,
        onLoadedMetadata: loadedMetadata, onDurationChange: sync, onTimeUpdate: sync, onSeeked: sync,
        onPlay: sync, onPause: sync, onEnded: sync,
        onLoadedData: () => setReady(true), onError: mediaError,
      }),
      h('div', { className: 'dwe-video-shade' }),
      h('header', { className: 'dwe-video-head' },
        h('div', { ref: details, className: 'dwe-video-details' },
          h('div', { className: 'dwe-video-name', title: file.name }, file.name),
          h('div', { className: 'dwe-video-size' }, h('span', null, formatSize(size)),
            h('button', { type: 'button', className: 'dwe-video-info', 'aria-label': '视频信息', disabled: compact,
              'aria-describedby': infoId }, mediaIcon('info', 10)))),
        h('div', { className: 'dwe-video-tooltip', role: 'tooltip', id: infoId },
          h('span', { className: 'dwe-video-meta-file' }, file.name),
          h('span', null, '视频 · ' + formatSize(size) + ' · ' + mime),
          h('span', null, '由浏览器原生解码，MKV、MOV、FLAC 等格式的支持取决于浏览器。'))),
      failed ? h('span', { className: 'dwe-video-message', role: 'status' }, '无法预览此视频')
        : !started ? mediaButton('videoPlay', '播放视频', play, 'dwe-video-start')
          : useBuffer && restorePlayback.current && ready
            ? h('span', { className: 'dwe-video-message', role: 'status' }, '正在定位播放位置…')
            : !ready && h('span', { className: 'dwe-video-message', role: 'status' }, '正在加载视频…'),
      !fullscreen && ready && h('div', { className: 'dwe-video-controls' }, playButton, progress)),
    fullscreen && h(FullscreenVideoDock, {
      playButton, progress, ended: playback.ended, activatePlayback: play, exit: toggleFullscreen,
    })));
  return h(react.Fragment, null, view, fullscreenButton);
}
