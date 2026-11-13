const tabSelector = '[data-sidebar-right-panel] [data-dockkit-strip-tabs] [data-dockkit-tab]';
const dragThreshold = 4; // Matches DockKit's per-axis drag threshold.

export function installSidebarTabDrag(mounted) {
  const lifetime = new AbortController();
  const options = { capture: true, signal: lifetime.signal };
  const badge = document.createElement('div');
  badge.className = 'dwe-sidebar-tab-drag';
  badge.setAttribute('aria-hidden', 'true');
  let drag;

  function reset() {
    drag = undefined;
    badge.remove();
    badge.replaceChildren();
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
    if (!badge.isConnected && Math.max(Math.abs(event.clientX - x), Math.abs(event.clientY - y)) < dragThreshold) return;
    badge.style.setProperty('--dwe-drag-x', event.clientX + 12 + 'px');
    badge.style.setProperty('--dwe-drag-y', event.clientY + 12 + 'px');
    if (badge.isConnected) return;
    const icon = tab.querySelector('[data-dockkit-tab-title] :is(svg, img)');
    if (icon) badge.append(icon.cloneNode(true));
    else badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16"/></svg>';
    document.body.append(badge);
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
