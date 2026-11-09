const { useEffect } = react;

export function usePreviewZoom(viewport, renderAtZoom) {
  useEffect(() => {
    const element = viewport.current;
    let zoom = 1;
    let settle;

    function wheel(event) {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
      const next = Math.max(0.25, Math.min(6, zoom * Math.exp(-delta * 0.002)));
      if (next === zoom) return;

      const surface = event.target instanceof Element && event.target.closest('[data-dwe-zoom-surface]');
      const before = surface ? surface.getBoundingClientRect() : element.getBoundingClientRect();
      const x = event.clientX - before.left;
      const y = event.clientY - before.top;
      const ratio = next / zoom;
      const { scrollLeft, scrollTop } = element;
      zoom = next;
      element.style.setProperty('--dwe-preview-zoom', zoom);
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

    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      clearTimeout(settle);
    };
  }, [viewport, renderAtZoom]);
}
