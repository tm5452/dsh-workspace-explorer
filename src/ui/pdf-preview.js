import { pdfAssetsPath } from '../document-types.js';
import { PreviewUnavailable } from './preview-unavailable.js';
import { previewTopInset, usePreviewZoom } from './preview-zoom.js';
import { previewMovedEvent, previewWillMoveEvent } from './preview-surface.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = react;

function asset(file) {
  return new URL(pdfAssetsPath + '?file=' + file, location.href).href;
}

let runtime;

async function scriptBlob(file) {
  const response = await fetch(asset(file));
  if (!response.ok) throw new Error('PDF runtime request failed (' + response.status + ')');
  return new Blob([await response.arrayBuffer()], { type: 'text/javascript' });
}

function loadRuntime() {
  runtime ??= (async () => {
    // Fetch through the application frame. A module worker on the desktop's
    // custom scheme can otherwise be treated as cross-origin by PDF.js.
    const [main, worker] = await Promise.all([
      scriptBlob('build/pdf.min.mjs'), scriptBlob('build/pdf.worker.min.mjs'),
    ]);
    const url = URL.createObjectURL(main);
    try {
      const { getDocument, GlobalWorkerOptions, PDFDataRangeTransport } = await import(url);
      GlobalWorkerOptions.workerSrc = URL.createObjectURL(worker);
      return { getDocument, PDFDataRangeTransport };
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch(error => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

const pageBatch = 24;

const PdfPage = react.memo(function PdfPage({ pdf, number, initialSize, width, visible, renderZoom, position }) {
  const [size, setSize] = useState(() => position.sizes?.get(number) ?? initialSize);
  const [failed, setFailed] = useState(false);
  const bitmapHost = useRef(null);
  useEffect(() => {
    if (!visible) return;
    const host = bitmapHost.current;
    let canceled = false;
    let page;
    let task;
    async function render() {
      try {
        page = await pdf.getPage(number);
        if (canceled) return;
        const natural = page.getViewport({ scale: 1 });
        const bounds = { width: natural.width, height: natural.height };
        (position.sizes ??= new Map()).set(number, bounds);
        setSize(bounds);
        const pageViewport = page.getViewport({ scale: Math.min(width / natural.width, 2) * renderZoom });
        const pixels = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(pageViewport.width, pageViewport.height));
        // Retain the displayed page during zoom until PDF.js finishes drawing its replacement.
        const bitmap = host.ownerDocument.createElement('canvas');
        bitmap.width = Math.max(1, Math.floor(pageViewport.width * pixels));
        bitmap.height = Math.max(1, Math.floor(pageViewport.height * pixels));
        task = page.render({
          canvas: bitmap, viewport: pageViewport, transform: [pixels, 0, 0, pixels, 0, 0],
        });
        await task.promise;
        if (canceled) return;
        host.replaceChildren(bitmap);
        setFailed(false);
      } catch {
        if (!canceled && !host.firstChild) setFailed(true);
      }
    }
    void render();
    return () => {
      canceled = true;
      task?.cancel();
      page?.cleanup();
    };
  }, [pdf, number, visible, width, renderZoom, position]);

  const displayWidth = Math.min(width, size.width * 2);
  return h('div', {
    className: 'dwe-pdf-page', 'data-pdf-page': number, 'data-dwe-zoom-surface': '',
    style: { '--dwe-fit-width': displayWidth + 'px', '--dwe-fit-height': displayWidth * size.height / size.width + 'px' },
  }, visible && h('div', { ref: bitmapHost, className: 'dwe-pdf-bitmap', role: 'img', 'aria-label': '文档第 ' + number + ' 页', hidden: failed }),
  failed && h('p', { className: 'dwe-preview-hint' }, '第 ' + number + ' 页无法显示'));
});

function rememberPosition(viewport, position) {
  const pages = viewport.children;
  if (!pages[0]?.dataset.pdfPage) return;
  const top = viewport.scrollTop + previewTopInset(viewport);
  let first = 0;
  let last = pages.length - (viewport.lastElementChild.dataset.pdfPage ? 1 : 2);
  while (first < last) {
    const mid = Math.ceil((first + last) / 2);
    if (pages[mid].offsetTop <= top) first = mid;
    else last = mid - 1;
  }
  const page = pages[first];
  if (!page.offsetHeight) return;
  position.page = Number(page.dataset.pdfPage);
  position.offset = (top - page.offsetTop) / page.offsetHeight;
  position.atTop = viewport.scrollTop === 0;
  position.horizontal = viewport.scrollLeft / Math.max(1, viewport.scrollWidth - viewport.clientWidth);
}

function restorePosition(viewport, position) {
  if (!position.page) return true;
  const page = viewport.querySelector('[data-pdf-page="' + position.page + '"]');
  if (!page?.offsetHeight) return false;
  viewport.scrollTop = position.atTop ? 0
    : page.offsetTop + page.offsetHeight * position.offset - previewTopInset(viewport);
  viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) * position.horizontal;
  return true;
}

function PdfPages({ pdf, initialSize, position }) {
  const scroll = useRef(null);
  const committedWidth = useRef(0);
  const restoring = useRef(true);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(() => new Set());
  const page = Math.min(position.page ?? 1, pdf.numPages);
  const [count, setCount] = useState(() => Math.min(pdf.numPages, page + pageBatch - 1));
  const [renderZoom, setRenderZoom] = useState(() => position.zoom ?? 1);
  usePreviewZoom(scroll, setRenderZoom, position);
  const measured = width > 0;

  useLayoutEffect(() => {
    const viewport = scroll.current;
    committedWidth.current = width;
    if (restoring.current && width > 0 && viewport.clientWidth > 16) {
      restoring.current = !restorePosition(viewport, position);
    }
  }, [width, count, position]);

  useLayoutEffect(() => {
    const viewport = scroll.current;
    const controller = new AbortController();
    const { signal } = controller;
    let requestedWidth = 0;
    function capture() {
      if (!restoring.current && committedWidth.current > 0 && viewport.clientHeight
          && viewport.clientWidth - 16 === committedWidth.current) rememberPosition(viewport, position);
    }
    function measure() {
      const next = viewport.clientWidth - 16;
      // A parked tab measures zero. Retain its page elements and reading position.
      if (next <= 0 || !viewport.clientHeight) {
        restoring.current = true;
      } else if (next !== requestedWidth) {
        requestedWidth = next;
        restoring.current = true;
        setWidth(next);
      } else if (restoring.current && committedWidth.current === next) {
        restoring.current = !restorePosition(viewport, position);
      }
    }
    viewport.addEventListener('scroll', capture, { passive: true, signal });
    document.addEventListener(previewWillMoveEvent, event => {
      if (event.target.contains?.(viewport)) capture();
    }, { signal });
    document.addEventListener(previewMovedEvent, event => {
      if (!event.target.contains?.(viewport)) return;
      restoring.current = true;
      measure();
    }, { signal });
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => {
      capture();
      controller.abort();
      observer.disconnect();
    };
  }, [position]);

  useEffect(() => {
    if (!measured) return;
    const viewport = scroll.current;
    const observer = new IntersectionObserver(entries => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
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
      key: index + 1, pdf, number: index + 1, initialSize, width, renderZoom, position, visible: visible.has(index + 1),
    })),
    measured && count < pdf.numPages && h('div', { key: 'more', className: 'dwe-pdf-more', 'aria-hidden': true }));
}

export function PdfPreview({ source, standalone, position }) {
  const localPosition = useRef({});
  const reading = position ?? localPosition.current;
  const [document, setDocument] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let task;
    async function load() {
      try {
        const { getDocument, PDFDataRangeTransport } = await loadRuntime();
        if (signal.aborted) return;
        if (!Number.isSafeInteger(source.size) || source.size <= 0) throw new Error('文档为空');
        const range = new PDFDataRangeTransport(source.size, null);
        range.abort = () => controller.abort();
        range.requestDataRange = (begin, end) => {
          void (async () => {
            const span = begin + '-' + (end - 1);
            const expected = 'bytes ' + span + '/' + source.size;
            const response = await fetch(source.url, { signal, headers: { Range: 'bytes=' + span } });
            if (response.status !== 206 || response.headers.get('content-range') !== expected) {
              await response.body?.cancel();
              throw new Error('无法读取文档分段');
            }
            const chunk = new Uint8Array(await response.arrayBuffer());
            if (chunk.length !== end - begin) throw new Error('文档分段不完整');
            if (!signal.aborted) range.onDataRange(begin, chunk);
          })().catch(() => {
            if (signal.aborted) return;
            setFailed(true);
            controller.abort();
            void task?.destroy().catch(() => {});
          });
        };
        task = getDocument({
          range, disableStream: true, disableAutoFetch: true, cMapPacked: true, useWorkerFetch: false,
          cMapUrl: asset('cmaps/'), standardFontDataUrl: asset('standard_fonts/'), wasmUrl: asset('wasm/'),
          enableXfa: false, isEvalSupported: false,
        });
        const pdf = await task.promise;
        if (signal.aborted) return;
        const first = await pdf.getPage(1);
        if (!signal.aborted) {
          if (reading.page > pdf.numPages) {
            reading.page = pdf.numPages;
            reading.offset = 0;
          }
          setDocument({ pdf, initialSize: first.getViewport({ scale: 1 }) });
        }
      } catch {
        if (!signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => {
      controller.abort();
      void task?.destroy().catch(() => {});
    };
  }, [source, reading]);

  if (failed) return h(PreviewUnavailable, { standalone });
  return document ? h(PdfPages, { ...document, position: reading }) : h('p', { className: 'dwe-preview-hint', role: 'status' }, '正在加载文档页面…');
}
