const tabSelector = '[data-sidebar-right-panel] [data-dockkit-strip-tabs] [data-dockkit-tab]';
const dragThreshold = 4; // Matches DockKit's per-axis drag threshold.

export function installSidebarTabDrag(mounted) {
  const lifetime = new AbortController();
  const options = { capture: true, signal: lifetime.signal };
  let drag;

  function reset() {
    drag?.badge?.dispose();
    drag = undefined;
  }

  function start(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    reset();
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button, [role="menu"]')) return;
    const tab = target.closest(tabSelector);
    if (tab) drag = { tab, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function move(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { tab, pointerId, x, y } = drag;
    if (!(event.buttons & 1) || tab.dataset.dockkitPointer !== String(pointerId)) {
      reset();
      return;
    }
    if (!drag.badge && Math.max(Math.abs(event.clientX - x), Math.abs(event.clientY - y)) < dragThreshold) return;
    drag.badge ??= createTabDragIcon(tab.querySelector('[data-dockkit-tab-title] :is(svg, img)'));
    drag.badge.move(event.clientX, event.clientY);
  }

  function finish(event) {
    if (drag?.pointerId === event.pointerId) reset();
  }

  const stop = mounted.subscribe(reset);
  window.addEventListener('pointerdown', start, options);
  window.addEventListener('pointermove', move, options);
  window.addEventListener('pointerup', finish, options);
  window.addEventListener('pointercancel', finish, options);
  window.addEventListener('lostpointercapture', finish, options);
  window.addEventListener('blur', event => {
    if (event.target === window) reset();
  }, options);
  return () => {
    lifetime.abort();
    stop();
    reset();
  };
}
import { createTabDragIcon } from '../ui/drag-icon.js';
