export function installSidebarFade(sidebar) {
  if (typeof sidebar.mountedSurface !== 'function') return () => {};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const shown = new Map();
  const animations = new Map();
  let sessionId;
  let panel;

  function stopAnimation(paneId) {
    animations.get(paneId)?.cancel();
    animations.delete(paneId);
  }

  function reset() {
    for (const paneId of animations.keys()) stopAnimation(paneId);
    shown.clear();
    sessionId = undefined;
    panel = undefined;
  }

  function sync() {
    const currentSession = sidebar.mounted.getSnapshot();
    const layout = sidebar.mountedSurface()?.layout;
    if (!currentSession || !layout) {
      reset();
      return;
    }
    const currentPanel = document.querySelector(
      '[data-sidebar-right-panel][data-sidebar-right-session="' + CSS.escape(currentSession) + '"]',
    );
    if (!currentPanel) return;
    const first = currentSession !== sessionId || panel !== currentPanel;
    if (first) {
      reset();
      sessionId = currentSession;
      panel = currentPanel;
    }
    for (const paneId of shown.keys()) {
      if (layout.nodes[paneId]?.kind === 'pane') continue;
      stopAnimation(paneId);
      shown.delete(paneId);
    }
    for (const pane of Object.values(layout.nodes)) {
      if (pane.kind !== 'pane' || shown.get(pane.id) === pane.activeTabId) continue;
      if (!pane.activeTabId || first || reducedMotion.matches || (pane.host === 'dock' && !layout.expanded)) {
        stopAnimation(pane.id);
        shown.set(pane.id, pane.activeTabId);
        continue;
      }
      const id = CSS.escape(pane.id);
      const container = panel.querySelector('[data-dockkit-pane="' + id + '"], [data-dockkit-float="' + id + '"]');
      const body = container?.querySelector('div[data-sidebar-right-tab="' + CSS.escape(pane.activeTabId) + '"]');
      if (!body || body.closest('[hidden], [aria-hidden="true"]')) continue;
      shown.set(pane.id, pane.activeTabId);
      stopAnimation(pane.id);
      const animation = body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      animations.set(pane.id, animation);
      animation.onfinish = () => {
        if (animations.get(pane.id) === animation) animations.delete(pane.id);
      };
    }
  }

  const observer = new MutationObserver(records => {
    if (!panel?.isConnected || records.some(record => panel.contains(record.target))) sync();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-selected', 'data-sidebar-right-open'],
  });
  const disposeMounted = sidebar.mounted.subscribe(sync);
  sync();
  return () => {
    observer.disconnect();
    disposeMounted();
    reset();
  };
}
