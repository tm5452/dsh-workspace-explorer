export function installSidebarWidth(layout, document, preferences, getGroup) {
  const window = document.defaultView;
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  const prefix = 'dsh-workspace-explorer.width:';
  let applied;
  let resize;
  let frameRequest;

  function frame() { return document.querySelector('[data-rightbar-col]')?.parentElement; }

  function initialize() {
    const group = getGroup();
    const root = frame();
    if (!group || applied === group || !root?.clientWidth || root.hasAttribute('data-rightbar-fullscreen')) return;
    let ratio;
    try { ratio = Number(localStorage.getItem(prefix + group)); } catch { /* Storage unavailable. */ }
    applied = group;
    layout?.panels?.setRightbar?.(Math.round(root.clientWidth * (ratio || preferences.get().initialSidebarPercent / 100)));
  }

  document.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.target.closest?.('[data-side="rightbar"]')) {
      resize = { pointerId: event.pointerId, group: getGroup() };
    }
  }, options);
  window.addEventListener('pointerup', event => {
    if (event.pointerId !== resize?.pointerId) return;
    const { group } = resize;
    resize = undefined;
    if (!group) return;
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      const root = frame();
      const width = root?.querySelector('[data-rightbar-col]')?.getBoundingClientRect().width;
      if (group !== getGroup() || !width || !root.clientWidth || root.hasAttribute('data-rightbar-fullscreen')) return;
      applied = group;
      try { localStorage.setItem(prefix + group, String(width / root.clientWidth)); } catch { /* Storage unavailable. */ }
    });
  }, options);
  window.addEventListener('pointercancel', () => { resize = undefined; }, options);
  return { initialize, dispose() { cancelAnimationFrame(frameRequest); controller.abort(); } };
}
