import { isMac } from './platform.js';

const { useEffect } = react;

function wheelZoom(event, height, zoom) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
  const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
  return Math.max(0.25, Math.min(6, zoom * Math.exp(-delta * 0.002)));
}

function installPointerPan(element, signal, canPan, moveBy) {
  let pointer;

  function start(event) {
    if (event.button !== 0 || pointer || !canPan(event)) return;
    event.preventDefault();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture(pointer.id);
    element.setAttribute('data-dwe-panning', '');
  }

  function move(event) {
    if (pointer?.id !== event.pointerId) return;
    moveBy(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }

  function end(event) {
    if (pointer?.id !== event.pointerId) return;
    pointer = undefined;
    element.removeAttribute('data-dwe-panning');
  }

  element.addEventListener('pointerdown', start, { signal });
  element.addEventListener('pointermove', move, { signal });
  element.addEventListener('lostpointercapture', end, { signal });
}

export function usePreviewZoom(viewport, renderAtZoom) {
  useEffect(() => {
    const element = viewport.current;
    const controller = new AbortController();
    const { signal } = controller;
    let zoom = 1;
    let settle;

    function wheel(event) {
      if (!(event.ctrlKey || (isMac && event.metaKey)) || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const next = wheelZoom(event, element.clientHeight, zoom);
      if (next === zoom) return;

      const surface = event.target instanceof Element && event.target.closest('[data-dwe-zoom-surface]');
      const before = surface ? surface.getBoundingClientRect() : element.getBoundingClientRect();
      const x = event.clientX - before.left;
      const y = event.clientY - before.top;
      const ratio = next / zoom;
      const { scrollLeft, scrollTop } = element;
      zoom = next;
      element.style.setProperty('--dwe-preview-zoom', zoom);
      element.toggleAttribute('data-dwe-pan-ready', zoom > 1);
      if (surface) {
        const after = surface.getBoundingClientRect();
        element.scrollLeft += after.left + x * ratio - event.clientX;
        element.scrollTop += after.top + y * ratio - event.clientY;
      } else {
        element.scrollLeft = (scrollLeft + x) * ratio - x;
        element.scrollTop = (scrollTop + y) * ratio - y;
      }

      if (renderAtZoom) {
        clearTimeout(settle);
        settle = setTimeout(() => renderAtZoom(zoom), 120);
      }
    }

    element.addEventListener('wheel', wheel, { passive: false, signal });
    installPointerPan(element, signal, event => zoom > 1 && event.pointerType === 'mouse', (dx, dy) => {
      element.scrollLeft -= dx;
      element.scrollTop -= dy;
    });
    return () => {
      controller.abort();
      clearTimeout(settle);
    };
  }, [viewport, renderAtZoom]);
}

function topBar(viewport) {
  const header = viewport.closest('.dwe-preview-body')?.previousElementSibling;
  return header?.matches('.dwe-preview-bar') ? header : null;
}

export function previewTopInset(viewport, top = viewport.getBoundingClientRect().top, header = topBar(viewport)) {
  return header ? Math.max(0, header.getBoundingClientRect().bottom - top) : 0;
}

export function useMediaViewport(viewport, fullscreen = false) {
  useEffect(() => {
    const element = viewport.current;
    const controller = new AbortController();
    const { signal } = controller;
    let zoom = 1;
    let x = 0;
    let y = 0;
    const surface = element.firstElementChild;
    const image = surface instanceof HTMLImageElement ? surface : null;
    const header = fullscreen ? null : topBar(element);
    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let fitWidth = 0;
    let fitHeight = 0;
    let appliedX;
    let appliedY;
    let pointer;

    function setOffset() {
      // On each axis, keep the smaller area's center within the larger area's edges.
      const limitX = Math.max(width, fitWidth * zoom) / 2;
      const limitY = Math.max(height, fitHeight * zoom) / 2;
      x = Math.max(-limitX, Math.min(limitX, x));
      y = Math.max(-limitY, Math.min(limitY, y));
      if (appliedX !== x) {
        element.style.setProperty('--dwe-image-x', x + 'px');
        appliedX = x;
      }
      if (appliedY !== y) {
        element.style.setProperty('--dwe-image-y', y + 'px');
        appliedY = y;
      }
    }

    function measurePosition(view = element.getBoundingClientRect(), inset = previewTopInset(element, view.top, header)) {
      centerX = view.left + view.width / 2;
      centerY = view.top + (view.height + inset) / 2;
    }

    function measureGeometry() {
      const view = element.getBoundingClientRect();
      const inset = previewTopInset(element, view.top, header);
      width = view.width;
      height = Math.max(0, view.height - inset);
      measurePosition(view, inset);
      if (image) {
        const ratio = image.naturalWidth / image.naturalHeight || 1;
        fitWidth = Math.min(image.naturalWidth, width, height * ratio);
        fitHeight = fitWidth / ratio;
        image.style.setProperty('--dwe-fit-width', fitWidth + 'px');
      } else {
        const bounds = surface.getBoundingClientRect();
        fitWidth = bounds.width / zoom;
        fitHeight = bounds.height / zoom;
      }
      setOffset();
    }

    function wheel(event) {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const next = wheelZoom(event, height, zoom);
      if (next === zoom) return;
      const ratio = next / zoom;
      // Keep the point under the pointer in place while scaling around the image center.
      x += (event.clientX - centerX - x) * (1 - ratio);
      y += (event.clientY - centerY - y) * (1 - ratio);
      zoom = next;
      element.style.setProperty('--dwe-preview-zoom', zoom);
      setOffset();
    }

    function start(event) {
      if (event.button !== 0 || pointer || event.target.closest('button, input')) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    }

    function move(event) {
      if (pointer?.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { end(); return; }
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        pointer.dragging = true;
        element.setAttribute('data-dwe-panning', '');
        element.setPointerCapture(pointer.id);
      }
      if (event.cancelable) event.preventDefault();
      x += dx;
      y += dy;
      setOffset();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }

    function end(event) {
      if (event?.pointerId !== undefined && pointer?.id !== event.pointerId) return;
      const id = pointer?.id;
      pointer = undefined;
      element.removeAttribute('data-dwe-panning');
      if (id !== undefined && element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }

    element.addEventListener('wheel', wheel, { passive: false, signal });
    element.addEventListener('pointerenter', () => measurePosition(), { signal });
    element.addEventListener('pointerdown', start, { signal });
    element.addEventListener('lostpointercapture', end, { signal });
    window.addEventListener('pointermove', move, { signal });
    window.addEventListener('pointerup', end, { signal });
    window.addEventListener('pointercancel', end, { signal });
    window.addEventListener('blur', end, { signal });
    document.addEventListener('scroll', event => {
      if (event.target === document || event.target.contains?.(element)) measurePosition();
    }, { capture: true, passive: true, signal });
    const observer = new ResizeObserver(measureGeometry);
    observer.observe(element);
    if (header) observer.observe(header);
    image?.addEventListener('load', measureGeometry, { signal });
    measureGeometry();
    return () => {
      end();
      controller.abort();
      observer.disconnect();
      element.style.removeProperty('--dwe-preview-zoom');
      element.style.removeProperty('--dwe-image-x');
      element.style.removeProperty('--dwe-image-y');
    };
  }, [viewport, fullscreen]);
}
