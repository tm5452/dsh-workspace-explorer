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
      if (!event.ctrlKey || !event.deltaY) return;
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

export function useImageViewport(viewport) {
  useEffect(() => {
    const element = viewport.current;
    const controller = new AbortController();
    const { signal } = controller;
    let zoom = 1;
    let x = 0;
    let y = 0;

    function setOffset() {
      element.style.setProperty('--dwe-image-x', x + 'px');
      element.style.setProperty('--dwe-image-y', y + 'px');
    }

    function wheel(event) {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const { left, top, width, height } = element.getBoundingClientRect();
      const next = wheelZoom(event, height, zoom);
      if (next === zoom) return;
      const ratio = next / zoom;
      // Keep the point under the pointer in place while scaling around the image center.
      x += (event.clientX - left - width / 2 - x) * (1 - ratio);
      y += (event.clientY - top - height / 2 - y) * (1 - ratio);
      zoom = next;
      element.style.setProperty('--dwe-preview-zoom', zoom);
      setOffset();
    }

    element.addEventListener('wheel', wheel, { passive: false, signal });
    installPointerPan(element, signal, () => true, (dx, dy) => {
      x += dx;
      y += dy;
      setOffset();
    });
    return () => controller.abort();
  }, [viewport]);
}
