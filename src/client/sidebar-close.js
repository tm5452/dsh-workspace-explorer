import { isPreviewTab } from './preview-collections.js';

export function ordinaryTabs(layout, pane) {
  return (pane?.tabs ?? []).filter(id => layout.tabs[id] && !isPreviewTab(layout.tabs[id]));
}

export function protectedGuides(layout) {
  if (!layout) return [];
  return Object.values(layout.nodes).flatMap(pane => {
    if (pane.kind !== 'pane' || pane.host !== 'dock') return [];
    const tabs = ordinaryTabs(layout, pane);
    return tabs.length === 1 && layout.tabs[tabs[0]].kind === 'guide' ? tabs : [];
  });
}

export function hasDockedTabs(layout) {
  return Object.values(layout?.nodes ?? {}).some(pane =>
    pane.kind === 'pane' && pane.host === 'dock' && ordinaryTabs(layout, pane).length > 0);
}

export function openSidebar(sidebar, sessionId, { recover = false } = {}) {
  if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId) return;
  const layout = sidebar.mountedSurface?.()?.layout;
  if (layout && !hasDockedTabs(layout)) sidebar.openTab('guide');
  else if (!sidebar.isExpanded()) sidebar.toggleExpanded();
  else if (recover) sidebar.openTab('guide');
}

export function installSidebarClose(sidebar, isProjecting) {
  const closeIn = sidebar.closeIn;
  if (typeof closeIn !== 'function' || typeof sidebar.mountedSurface !== 'function') return () => {};

  function closeToGuide(sessionId, tabId) {
    if (!isProjecting() && sessionId === this.mounted.getSnapshot()) {
      const layout = this.mountedSurface()?.layout;
      const pane = Object.values(layout?.nodes ?? {}).find(node => node.host === 'dock' && node.tabs?.includes(tabId));
      const tab = layout?.tabs?.[tabId];
      if (pane && tab && !isPreviewTab(tab) && ordinaryTabs(layout, pane).length === 1) {
        if (tab.kind === 'guide') return;
        if (layout.expanded) {
          // A preview uses a private host tab only while displayed. It never replaces a normal tab.
          return this.openTab('guide', { paneId: pane.id, replaceTab: tabId });
        }
      }
    }
    return closeIn.call(this, sessionId, tabId);
  }

  sidebar.closeIn = closeToGuide;
  return () => {
    if (sidebar.closeIn === closeToGuide) sidebar.closeIn = closeIn;
  };
}


// A shell can restore an expanded layout after its last docked pane was removed.
export function installEmptySidebarRecovery(sidebar, isProjecting) {
  const lifetime = new AbortController();
  let attempted;
  let frame;
  let requestedSession;

  function repair() {
    frame = undefined;
    const sessionId = sidebar.mounted.getSnapshot();
    const layout = sidebar.mountedSurface?.()?.layout;
    const requested = sessionId && sessionId === requestedSession;
    requestedSession = undefined;
    if (!sessionId || !layout || isProjecting()) return;
    if (hasDockedTabs(layout) || (!requested && !layout.expanded)) {
      attempted = undefined;
      return;
    }
    if (!requested && attempted === sessionId) return;
    attempted = sessionId;
    sidebar.openTab('guide');
  }

  function schedule() {
    frame ??= requestAnimationFrame(repair);
  }

  // Observe the native request. The native click still runs without our listener.
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('button[data-sidebar-right-expand]:not(:disabled)')) {
      requestedSession = sidebar.mounted.getSnapshot();
      schedule();
    }
  }, { capture: true, signal: lifetime.signal });
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { subtree: true, attributeFilter: ['data-sidebar-right-open'] });
  const stop = sidebar.mounted.subscribe(schedule);
  const stopTabs = sidebar.openTabs?.subscribe(schedule);
  schedule();
  return () => {
    lifetime.abort();
    observer.disconnect();
    stop();
    stopTabs?.();
    cancelAnimationFrame(frame);
  };
}
