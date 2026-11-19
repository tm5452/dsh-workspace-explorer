export function installSidebarWidth(layout, document) {
  let initialized = false;
  const window = document.defaultView;
  const controller = new AbortController();
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.closest?.('[data-side="rightbar"]')) return;
    initialized = true;
    controller.abort();
  }, { capture: true, signal: controller.signal });

  return {
    initialize() {
      // DSH currently exposes its native width action through the layout controller.
      if (initialized || typeof layout?.panels?.setRightbar !== 'function') return;
      const frame = document.querySelector('[data-rightbar-col]')?.parentElement;
      if (!frame || frame.hasAttribute('data-rightbar-fullscreen')) return;
      const width = frame.clientWidth || window.innerWidth;
      if (width <= 0) return;
      initialized = true;
      layout.panels.setRightbar(Math.round(width * 0.3));
      controller.abort();
    },
    dispose: () => controller.abort(),
  };
}
