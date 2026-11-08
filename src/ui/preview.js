import { previewBodies, previewDefinitions } from '../vendor/ui/views.js';
import { disks } from './workspace.js';
import { PreviewUnavailable } from './preview-unavailable.js';

const { createElement: h, useEffect, useState } = react;
const images = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
};
const nativeFormats = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

export class PreviewBoundary extends react.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? h(PreviewUnavailable) : this.props.children;
  }
}

export function Preview({ file }) {
  const [result, setResult] = useState({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let objectUrl;
    const dot = file.name.lastIndexOf('.');
    const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
    const definition = previewDefinitions.find(entry => entry.extensions.includes(extension));
    const Body = definition && previewBodies[definition.id];
    const mime = Object.hasOwn(images, extension) ? images[extension] : null;
    async function load() {
      try {
        if (Body || mime) {
          const data = await disks.readBytes(file.absolute, signal);
          if (signal.aborted) return;
          if (Body) {
            setResult({ kind: 'vendor', Body, data });
          } else {
            objectUrl = URL.createObjectURL(new Blob([data], { type: mime }));
            setResult({ kind: 'image', url: objectUrl });
          }
        } else if (nativeFormats.has(extension)) {
          setResult({ kind: 'unavailable' });
        } else {
          const { text, eof } = await disks.read(file.absolute, signal);
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
  }, [file]);

  switch (result.kind) {
    case 'vendor':
      return h(result.Body, { content: { kind: 'bytes', data: result.data }, resourceAddress: file.address, wrap: true });
    case 'image':
      return h('img', {
        className: 'dwe-image', src: result.url, alt: file.name,
        onError: () => setResult({ kind: 'unavailable' }),
      });
    case 'text':
      return h('pre', { className: 'dwe-text' },
        result.text || '（空文件）', result.eof ? '' : '\n\n… 仅显示首页，可在原生预览中继续查看');
    case 'unavailable':
      return h(PreviewUnavailable);
    default:
      return h('p', { className: 'dwe-message', role: 'status' }, '正在读取文件…');
  }
}




