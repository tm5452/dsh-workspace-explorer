import { disks } from './workspace.js';
import { makeThumbnail } from './thumbnail.js';
import { MediaProgress, mediaButton, mediaIcon } from './media-controls.js';
import { formatSize } from './file-size.js';
import { bufferMediaSource, mediaCanSeek, openMediaSource, releaseMediaSource } from './media-source.js';

const { createElement: h, useEffect, useId, useLayoutEffect, useRef, useState } = react;

function VideoPlaybackBar({ playback, seek, play }) {
  const dock = useRef(null);
  useLayoutEffect(() => {
    if (!playback.ended) dock.current.removeAttribute('data-replay-condensed');
  }, [playback.ended]);

  const toggle = playback.playing ? 'pause' : playback.ended ? 'replay' : 'play';
  const label = { pause: '暂停', replay: '重新播放', play: '播放' }[toggle];
  return h('div', {
    ref: dock, className: 'dwe-video-dock',
    'data-autohide': !playback.ended || undefined, 'data-ended': playback.ended || undefined,
    onTransitionEnd: event => {
      if (playback.ended && event.propertyName === 'visibility' && event.target.classList.contains('dwe-media-progress')
          && getComputedStyle(event.target).visibility === 'hidden') {
        dock.current.setAttribute('data-replay-condensed', '');
      }
    },
  }, h('div', { className: 'dwe-video-control-row' },
    h('div', { className: 'dwe-video-controls' }, h(MediaProgress, { ...playback, seek })),
    mediaButton(toggle, label, play, 'dwe-video-toggle')));
}

export function VideoPreview({ file, root, mime, onConfirm, beforePresent, onReady }) {
  const player = useRef(null);
  const restorePlayback = useRef(null);
  const infoId = useId();
  const [started, setStarted] = useState(false);
  const [poster, setPoster] = useState(null);
  const [source, setSource] = useState(null);
  const [useBuffer, setUseBuffer] = useState(false);
  const [size, setSize] = useState(file.size);
  const [aspect, setAspect] = useState(16 / 9);
  const [playback, setPlayback] = useState({ current: 0, duration: 0, playing: false, ended: false });
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]);
    void makeThumbnail(file.absolute, mime, signal, root, true, beforePresent).then(image => {
      if (!signal.aborted) setPoster(image);
    }).catch(async () => {
      await beforePresent?.();
      if (!controller.signal.aborted) onReady?.();
    });
    if (file.size === undefined) {
      void disks.locate(file.absolute, controller.signal, root).then(info => {
        if (!controller.signal.aborted) setSize(info.size);
      }, () => {});
    }
    return () => controller.abort();
  }, [file.absolute, file.size, root, mime, beforePresent, onReady]);

  useEffect(() => {
    if (!started) return;
    const controller = new AbortController();
    let opened;
    const open = useBuffer
      ? bufferMediaSource(restorePlayback.current?.url, file.absolute, mime, controller.signal, root)
      : openMediaSource(file.absolute, mime, controller.signal, root);
    void open.then(result => {
      if (controller.signal.aborted) { releaseMediaSource(result); return; }
      opened = result;
      setSource(result);
    }, () => {
      if (controller.signal.aborted) return;
      restorePlayback.current = null;
      setFailed(true);
    });
    return () => { controller.abort(); releaseMediaSource(opened); };
  }, [file.absolute, mime, root, started, useBuffer]);

  function fit(width, height) {
    if (width && height) setAspect(width / height);
  }

  function recover(video, current, playing) {
    restorePlayback.current = { current, playing, url: source?.url };
    video.pause();
    setUseBuffer(true);
  }

  function mediaError(event) {
    if (!useBuffer && !source?.url.startsWith('blob:')) {
      const video = event.currentTarget;
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
    fit(video.videoWidth, video.videoHeight);
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
    if (!video.paused && !video.ended) video.pause();
    else {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => {});
    }
  }

  const message = failed ? '无法预览此视频'
    : restorePlayback.current && ready ? '正在定位播放位置…' : started && !ready ? '正在加载视频…' : null;
  return h('div', { className: 'dwe-video-viewport', 'aria-label': '视频预览', style: { '--dwe-video-aspect': aspect } },
    h('div', { className: 'dwe-video-stage' },
      poster && !ready && h('img', { className: 'dwe-video-frame', src: poster, alt: '', draggable: false,
        onLoad: event => {
          const image = event.currentTarget;
          if (!player.current?.videoWidth) fit(image.naturalWidth, image.naturalHeight);
          onReady?.();
        }, onError: onReady }),
      source && h('video', {
        ref: player, className: 'dwe-video-frame', src: source.url, playsInline: true, autoPlay: !useBuffer,
        'data-ready': ready || undefined,
        onResize: event => fit(event.currentTarget.videoWidth, event.currentTarget.videoHeight),
        onLoadedMetadata: loadedMetadata, onDurationChange: sync, onTimeUpdate: sync, onSeeked: sync,
        onPlay: sync, onPause: sync, onEnded: sync,
        onLoadedData: () => setReady(true), onError: mediaError,
      }),
      !started && h('div', { className: 'dwe-video-intro' },
        mediaButton('videoPlay', '播放视频', play, 'dwe-video-start'),
        h('div', { className: 'dwe-video-details' },
          h('div', { className: 'dwe-video-name', title: file.name }, file.name),
          h('div', { className: 'dwe-video-size' }, h('span', null, formatSize(size)),
            h('button', { type: 'button', className: 'dwe-video-info', 'aria-label': '视频信息',
              'aria-describedby': infoId }, mediaIcon('info', 10))),
          h('div', { className: 'dwe-video-tooltip', role: 'tooltip', id: infoId },
            h('span', { className: 'dwe-video-meta-file' }, file.name),
            h('span', null, '视频 · ' + formatSize(size) + ' · ' + mime)))),
      message && h('span', { className: 'dwe-video-message', role: 'status' }, message),
      ready && !failed && h(VideoPlaybackBar, { playback, seek, play })));
}
