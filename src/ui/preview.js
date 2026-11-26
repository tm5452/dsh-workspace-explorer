import { PREVIEW_IDS, previewBodies, previewDefinitions } from '../vendor/ui/views.js';
import { officeExtensions } from '../document-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { disks } from './workspace.js';
import { PreviewUnavailable } from './preview-unavailable.js';
import { PdfPreview } from './pdf-preview.js';
import { OfficePreview } from './office-preview.js';
import { useMediaViewport } from './preview-zoom.js';
import { TextFilePreview } from './text-preview.js';
import { formatSize } from './file-size.js';
import { VideoPreview } from './video-preview.js';
import { MusicPreview } from './music-preview.js';
import { audioType } from '../audio-types.js';
import { fileIcon } from './file-icon.js';
import { icon } from './interface-icon.js';

const { createElement: h, useEffect, useRef, useState } = react;
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

export class PreviewBoundary extends react.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onReady?.();
  }

  render() {
    return this.state.failed ? h(PreviewUnavailable, { standalone: this.props.standalone }) : this.props.children;
  }
}

function PreviewCover({ file, root, label, start }) {
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

  return h('div', { className: 'dwe-preview-cover' },
    h('div', { className: 'dwe-cover-content' },
      h('div', { className: 'dwe-cover-action' },
        fileIcon(file.name, 'file', 36),
        h('button', {
          type: 'button', className: 'dwe-cover-open',
          title: label, 'aria-label': label, onClick: start,
        }, label)),
      h('div', { className: 'dwe-cover-details' },
        h('div', { className: 'dwe-cover-file', title: name }, name),
        h('div', { className: 'dwe-cover-size' }, formatSize(size ?? resolvedSize)))));
}

function ImagePreview({ url, name, onError, onReady }) {
  const scroll = useRef(null);
  useMediaViewport(scroll);
  return h('div', { className: 'dwe-image-scroll', ref: scroll, tabIndex: 0, 'aria-label': '图片预览' },
    h('img', {
      className: 'dwe-image', src: url, alt: name, draggable: false, 'data-dwe-zoom-surface': '',
      onLoad: onReady, onError,
    }));
}

export function Preview({ file, root, openImmediately = false, confirmed = openImmediately,
  onConfirm, onRestore, sendQuote, pdfPosition, beforePresent, onReady,
}) {
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  const mediaType = thumbnailType(file.name);
  if (mediaType?.startsWith('video/')) {
    return h(VideoPreview, { file, root, mime: mediaType, onConfirm, beforePresent, onReady });
  }
  const audio = audioType(file.name);
  if (audio) {
    return h(MusicPreview, { file, root, mime: audio, onRestore, beforePresent, onReady });
  }
  return h(FilePreview, { file, root, openImmediately, confirmed, onConfirm, extension, mime: mediaType,
    sendQuote, pdfPosition, beforePresent, onReady });
}

function FilePreview({ file, root, openImmediately, confirmed, onConfirm, extension, mime, sendQuote, pdfPosition, beforePresent, onReady }) {
  const [result, setResult] = useState({ kind: 'loading' });
  const isHtml = extension === 'html' || extension === 'htm';
  const definition = previewDefinitions.find(entry => entry.extensions.includes(extension));
  const isOffice = officeExtensions.has(extension);
  const isDocument = extension === 'pdf' || isOffice;
  const Body = previewBodies[definition?.id];
  const waiting = !isDocument && Boolean(isHtml || Body) && !confirmed;
  const isText = !isHtml && !isDocument && !Body && !mime;
  const onQuote = sendQuote && (selection => sendQuote(file, selection));

  useEffect(() => {
    if (waiting || isText || isOffice) return;
    const controller = new AbortController();
    const signal = controller.signal;
    let objectUrl;
    let previewTicket;
    async function load() {
      try {
        if (isHtml || Body) {
          const data = await disks.readBytes(file.absolute, signal, root);
          await beforePresent?.();
          if (signal.aborted) return;
          if (isHtml) {
            objectUrl = URL.createObjectURL(new Blob([data], { type: 'text/html' }));
            setResult({ kind: 'html', url: objectUrl });
          } else {
            setResult({ kind: 'vendor', Body, data });
          }
        } else {
          const read = isDocument ? disks.documentPreview : disks.imagePreview;
          const source = await read(file.absolute, signal, root);
          if (signal.aborted) {
            void disks.releasePreview(source.ticket);
            return;
          }
          previewTicket = source.ticket;
          if (!isDocument) await beforePresent?.();
          if (!signal.aborted) setResult({ kind: isDocument ? 'pdf' : 'image', source });
        }
      } catch {
        await beforePresent?.();
        if (!signal.aborted) setResult({ kind: 'unavailable' });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (previewTicket) void disks.releasePreview(previewTicket);
    };
  }, [file.absolute, root, waiting, Body, isDocument, isHtml, isText, isOffice, beforePresent]);

  useEffect(() => {
    if (waiting || result.kind === 'vendor' || result.kind === 'unavailable') onReady?.();
  }, [waiting, result.kind, onReady]);

  if (isText) return h(TextFilePreview, {
    key: JSON.stringify([file.absolute, file.line, root]), file, root, standalone: openImmediately, onQuote, beforePresent, onReady,
  });
  if (waiting) {
    const label = isHtml ? '打开网页预览' : coverActions[definition?.id] ?? '查看预览';
    return h(PreviewCover, { file, root, label, start: onConfirm });
  }
  if (isOffice) return h(OfficePreview, {
    key: JSON.stringify([file.absolute, root]), file, root, standalone: openImmediately, onQuote, beforePresent, onReady,
  });
  switch (result.kind) {
    case 'html':
      return h('iframe', {
        className: 'dwe-html-preview', src: result.url, title: file.name, onLoad: onReady,
        sandbox: 'allow-scripts', referrerPolicy: 'no-referrer',
      });
    case 'vendor':
      return h(result.Body, {
        content: { kind: 'bytes', data: result.data }, resourceAddress: file.address, wrap: true,
        detailInitiallyOpen: openImmediately, detailToggleIcon: definition?.id === PREVIEW_IDS.archive ? icon('preview', 18) : undefined,
      });
    case 'pdf':
      return h(PdfPreview, { source: result.source, standalone: openImmediately, position: pdfPosition, beforePresent, onReady });
    case 'image':
      return h(ImagePreview, {
        url: result.source.url, name: file.name, onReady,
        onError: () => setResult({ kind: 'unavailable' }),
      });
    case 'unavailable':
      return h(PreviewUnavailable, { standalone: openImmediately });
    default:
      return h('p', { className: 'dwe-preview-hint', role: 'status' },
        isDocument ? '正在加载文档…' : '正在读取文件…');
  }
}
