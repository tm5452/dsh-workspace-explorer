import { pdfAssetsPath } from '../document-types.js';
import { PreviewUnavailable } from './preview-unavailable.js';
import { usePreviewZoom } from './preview-zoom.js';

const { createElement: h, useEffect, useRef, useState } = react;

function asset(file) {
  return new URL(pdfAssetsPath + '?file=' + file, location.href).href;
}

const pageBatch = 24;

const PdfPage = react.memo(function PdfPage({ pdf, number, initialSize, width, visible, renderZoom }) {
  const [size, setSize] = useState(initialSize);
  const [failed, setFailed] = useState(false);
  const canvas = useRef(null);
  useEffect(() => {
    if (!visible) return;
    const surface = canvas.current;
    let canceled = false;
    let page;
    let task;
    async function render() {
      try {
        page = await pdf.getPage(number);
        if (canceled) return;
        const natural = page.getViewport({ scale: 1 });
        setSize({ width: natural.width, height: natural.height });
        const pageViewport = page.getViewport({ scale: Math.min(width / natural.width, 2) * renderZoom });
        const pixels = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(pageViewport.width, pageViewport.height));
        surface.width = Math.max(1, Math.floor(pageViewport.width * pixels));
        surface.height = Math.max(1, Math.floor(pageViewport.height * pixels));
        task = page.render({
          canvas: surface, viewport: pageViewport, transform: [pixels, 0, 0, pixels, 0, 0],
        });
        await task.promise;
        if (!canceled) setFailed(false);
      } catch {
        if (!canceled) setFailed(true);
      }
    }
    void render();
    return () => {
      canceled = true;
      task?.cancel();
      page?.cleanup();
    };
  }, [pdf, number, visible, width, renderZoom]);

  const displayWidth = Math.min(width, size.width * 2);
  return h('div', {
    className: 'dwe-pdf-page', 'data-pdf-page': number, 'data-dwe-zoom-surface': '',
    style: { '--dwe-fit-width': displayWidth + 'px', '--dwe-fit-height': displayWidth * size.height / size.width + 'px' },
  }, visible && h('canvas', { ref: canvas, role: 'img', 'aria-label': '文档第 ' + number + ' 页', hidden: failed }),
  failed && h('p', { className: 'dwe-preview-hint' }, '第 ' + number + ' 页无法显示'));
});

function PdfPages({ pdf, initialSize }) {
  const scroll = useRef(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(() => new Set());
  const [count, setCount] = useState(() => Math.min(pdf.numPages, pageBatch));
  const [renderZoom, setRenderZoom] = useState(1);
  usePreviewZoom(scroll, setRenderZoom);
  const measured = width > 0;
  useEffect(() => {
    const viewport = scroll.current;
    const observer = new ResizeObserver(() => setWidth(Math.max(0, viewport.clientWidth - 16)));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!measured) return;
    const viewport = scroll.current;
    const observer = new IntersectionObserver(entries => {
      setVisible(current => {
        const next = new Set(current);
        for (const entry of entries) {
          const number = Number(entry.target.dataset.pdfPage);
          if (!number) continue;
          if (entry.isIntersecting) next.add(number);
          else next.delete(number);
        }
        return next;
      });
      if (entries.some(entry => !entry.target.dataset.pdfPage && entry.isIntersecting)) {
        setCount(current => Math.min(pdf.numPages, current + pageBatch));
      }
    }, { root: viewport, rootMargin: '180px 0px' });
    for (const node of viewport.children) observer.observe(node);
    return () => observer.disconnect();
  }, [count, measured, pdf]);

  return h('div', { className: 'dwe-pdf-scroll', ref: scroll, tabIndex: 0, 'aria-label': '文档预览，共 ' + pdf.numPages + ' 页' },
    measured && Array.from({ length: count }, (_, index) => h(PdfPage, {
      key: index + 1, pdf, number: index + 1, initialSize, width, renderZoom, visible: visible.has(index + 1),
    })),
    measured && count < pdf.numPages && h('div', { key: 'more', className: 'dwe-pdf-more', 'aria-hidden': true }));
}

export function PdfPreview({ data }) {
  const [document, setDocument] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let canceled = false;
    let task;
    async function load() {
      try {
        const { getDocument, GlobalWorkerOptions } = await import(asset('build/pdf.min.mjs'));
        if (canceled) return;
        GlobalWorkerOptions.workerSrc = asset('build/pdf.worker.min.mjs');
        task = getDocument({
          data: data.slice(), cMapPacked: true, useWorkerFetch: false,
          cMapUrl: asset('cmaps/'), standardFontDataUrl: asset('standard_fonts/'), wasmUrl: asset('wasm/'),
          enableXfa: false, isEvalSupported: false,
        });
        const pdf = await task.promise;
        if (canceled) return;
        const first = await pdf.getPage(1);
        if (!canceled) setDocument({ pdf, initialSize: first.getViewport({ scale: 1 }) });
      } catch {
        if (!canceled) setFailed(true);
      }
    }
    void load();
    return () => {
      canceled = true;
      void task?.destroy().catch(() => {});
    };
  }, [data]);

  if (failed) return h(PreviewUnavailable);
  return document ? h(PdfPages, document) : h('p', { className: 'dwe-preview-hint', role: 'status' }, '正在加载文档页面…');
}
