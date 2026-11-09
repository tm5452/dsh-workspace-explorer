import { PREVIEW_IDS, previewBodies, previewDefinitions } from '../vendor/ui/views.js';
import { officeExtensions } from '../document-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { disks } from './workspace.js';
import { makeThumbnail } from './thumbnail.js';
import { PreviewUnavailable } from './preview-unavailable.js';
import { PdfPreview } from './pdf-preview.js';
import { usePreviewZoom } from './preview-zoom.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = react;
const coverActions = {
  [PREVIEW_IDS.archive]: '解压预览',
  [PREVIEW_IDS.model]: '查看模型',
  [PREVIEW_IDS.font]: '查看字样',
  [PREVIEW_IDS.subtitle]: '查看字幕',
  [PREVIEW_IDS.toml]: '查看配置',
  [PREVIEW_IDS.vcd]: '查看波形',
  [PREVIEW_IDS.jcamp]: '查看光谱',
  [PREVIEW_IDS.kicad]: '查看电路图',
  [PREVIEW_IDS.ihex]: '查看固件',
  [PREVIEW_IDS.dfu]: '查看固件',
};

export function formatSize(bytes) {
  if (typeof bytes !== 'number') return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

export class PreviewBoundary extends react.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? h(PreviewUnavailable) : this.props.children;
  }
}

function PreviewCover({ file, root, videoType, label, archive, start }) {
  const [poster, setPoster] = useState(null);
  const [resolvedSize, setResolvedSize] = useState(undefined);
  const { absolute, name, size } = file;

  useEffect(() => {
    if (size !== undefined) return;
    const controller = new AbortController();
    void disks.locate(absolute, controller.signal, root).then(result => {
      if (!controller.signal.aborted) setResolvedSize(result.size);
    }, () => {});
    return () => controller.abort();
  }, [absolute, size, root]);

  useEffect(() => {
    if (!videoType) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]);
    void makeThumbnail(file.absolute, videoType, signal, root, true).then(image => {
      if (!signal.aborted) setPoster(image);
    }, () => {});
    return () => controller.abort();
  }, [file, root, videoType]);

  const fileIcon = archive
    ? h('svg', { width: 36, height: 36, viewBox: '0 0 36 36', 'aria-hidden': true },
      h('rect', { x: 5, y: 3, width: 26, height: 30, rx: 5, fill: '#7462c4' }),
      h('path', { d: 'M18 5h3v4h-3v4h3v4h-3v4m-2 0h6v6h-6z', fill: 'none', stroke: '#fff', strokeWidth: 1.6, strokeLinejoin: 'round' }))
    : h(primitives.FileTypeIcon, { path: file.name, size: 36 });
  return h('div', {
    className: 'dwe-preview-cover', 'data-video': Boolean(videoType) || undefined,
    'data-poster': Boolean(poster) || undefined,
  },
    poster && h('img', { src: poster, alt: '', draggable: false }),
    h('div', { className: 'dwe-cover-content' },
      h('div', { className: 'dwe-cover-action' },
        !videoType && fileIcon,
        h('button', {
          type: 'button', className: videoType ? 'dwe-cover-play' : 'dwe-cover-open',
          title: label, 'aria-label': label, onClick: start,
        }, videoType ? h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true },
          h('path', { d: 'M9 5v14l11-7z', fill: 'currentColor' })) : label)),
      h('div', { className: 'dwe-cover-details' },
        h('div', { className: 'dwe-cover-file', title: name }, name),
        h('div', { className: 'dwe-cover-size' }, formatSize(size ?? resolvedSize)))));
}

function ImagePreview({ url, name, onError }) {
  const scroll = useRef(null);
  const [size, setSize] = useState(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  usePreviewZoom(scroll);
  useEffect(() => {
    const element = scroll.current;
    const observer = new ResizeObserver(() => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      setViewport(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = size ? Math.min(size.width, viewport.width, viewport.height * size.width / size.height) : 0;
  return h('div', { className: 'dwe-image-scroll', ref: scroll, tabIndex: 0, 'aria-label': '图片预览' },
    h('img', {
      className: 'dwe-image', src: url, alt: name, 'data-dwe-zoom-surface': '',
      style: { '--dwe-fit-width': width + 'px' },
      onLoad: event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }),
      onError,
    }));
}

function TextPreview({ text, eof, file }) {
  const content = useRef(null);
  useLayoutEffect(() => {
    if (!file.line || !text) return;
    let offset = 0;
    for (let line = 1; line < file.line; line++) {
      const end = text.indexOf('\n', offset);
      if (end < 0) return;
      offset = end + 1;
    }
    if (offset === text.length) return;
    const range = document.createRange();
    range.setStart(content.current.firstChild, offset);
    range.setEnd(content.current.firstChild, offset + 1);
    const scroll = content.current.parentElement;
    scroll.scrollTop += range.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
  }, [file, text]);
  return h('pre', { ref: content, className: 'dwe-text' },
    text || '（空文件）', eof ? '' : '\n\n… 仅显示首页，可在原生预览中继续查看');
}

export function Preview({ file, root }) {
  const [result, setResult] = useState({ kind: 'loading' });
  const [started, setStarted] = useState(false);
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  const definition = previewDefinitions.find(entry => entry.extensions.includes(extension));
  const isDocument = extension === 'pdf' || officeExtensions.has(extension);
  const mediaType = thumbnailType(file.name);
  const mime = mediaType?.startsWith('image/') ? mediaType : undefined;
  const videoType = mediaType?.startsWith('video/') ? mediaType : undefined;
  const Body = previewBodies[videoType ? PREVIEW_IDS.media : definition?.id];
  const isAudio = definition?.id === PREVIEW_IDS.media && !videoType;
  const waiting = Boolean(isDocument || videoType || (Body && !isAudio)) && !started;

  useEffect(() => {
    if (waiting) return;
    const controller = new AbortController();
    const signal = controller.signal;
    let objectUrl;
    async function load() {
      try {
        if (Body || mime) {
          const data = await disks.readBytes(file.absolute, signal, root);
          if (signal.aborted) return;
          if (Body) {
            setResult({ kind: 'vendor', Body, data });
          } else {
            objectUrl = URL.createObjectURL(new Blob([data], { type: mime }));
            setResult({ kind: 'image', url: objectUrl });
          }
        } else if (isDocument) {
          const read = extension === 'pdf' ? disks.readBytes : disks.renderOffice;
          const data = await read(file.absolute, signal, root);
          if (!signal.aborted) setResult({ kind: 'pdf', data });
        } else {
          const { text, eof } = await disks.read(file.absolute, signal, root);
          if (signal.aborted) return;
          setResult({ kind: 'text', text, eof });
        }
      } catch {
        if (!signal.aborted) setResult({ kind: 'unavailable' });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, root, waiting, Body, mime, extension, isDocument]);

  if (waiting || (!started && !mime && !Body && result.kind === 'unavailable')) {
    const label = videoType ? '播放视频' : isDocument ? '查看文档' : coverActions[definition?.id] ?? '查看预览';
    return h(PreviewCover, { file, root, videoType, label, archive: definition?.id === PREVIEW_IDS.archive, start: () => setStarted(true) });
  }
  switch (result.kind) {
    case 'vendor':
      return h(result.Body, {
        content: { kind: 'bytes', data: result.data }, resourceAddress: file.address, wrap: true,
        videoType, autoPlay: Boolean(videoType),
      });
    case 'pdf':
      return h(PdfPreview, { data: result.data });
    case 'image':
      return h(ImagePreview, {
        url: result.url, name: file.name,
        onError: () => setResult({ kind: 'unavailable' }),
      });
    case 'text':
      return h(TextPreview, { text: result.text, eof: result.eof, file });
    case 'unavailable':
      return h(PreviewUnavailable);
    default:
      return h('p', { className: 'dwe-preview-hint', role: 'status' }, isDocument ? '正在加载文档…' : '正在读取文件…');
  }
}




