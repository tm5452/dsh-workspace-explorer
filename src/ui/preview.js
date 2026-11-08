import { previewBodies, previewDefinitions } from '../vendor/ui/views.js';
import { disks } from './workspace.js';

const { createElement: h, useEffect, useState } = react;
const images = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
};
const nativeFormats = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class PreviewBoundary extends react.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error
      ? h('p', { className: 'dwe-message dwe-error', role: 'alert' }, '无法渲染预览 · ' + errorMessage(this.state.error))
      : this.props.children;
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
          setResult({ kind: 'native' });
        } else {
          const { text, eof } = await disks.read(file.absolute, signal);
          if (signal.aborted) return;
          setResult({ kind: 'text', text, eof });
        }
      } catch (error) {
        if (!signal.aborted) setResult({ kind: 'error', message: errorMessage(error) });
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
      return h('img', { className: 'dwe-image', src: result.url, alt: file.name });
    case 'text':
      return h('pre', { className: 'dwe-text' },
        result.text || '（空文件）', result.eof ? '' : '\n\n… 仅显示首页，可在原生预览中继续查看');
    case 'native':
      return h('p', { className: 'dwe-message' }, '使用右上角的「在原生预览中打开」查看此文档。');
    case 'error':
      return h('p', { className: 'dwe-message dwe-error', role: 'alert' }, '无法读取预览 · ' + result.message);
    default:
      return h('p', { className: 'dwe-message', role: 'status' }, '正在读取文件…');
  }
}




