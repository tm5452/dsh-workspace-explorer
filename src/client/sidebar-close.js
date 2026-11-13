export function installSidebarClose(sidebar, isProjecting) {
  const closeIn = sidebar.closeIn;
  if (typeof closeIn !== 'function' || typeof sidebar.mountedSurface !== 'function') return () => {};

  function closeToGuide(sessionId, tabId) {
    if (!isProjecting() && sessionId === this.mounted.getSnapshot()) {
      const layout = this.mountedSurface()?.layout;
      const pane = layout?.nodes?.[layout.rootId];
      const tab = layout?.tabs?.[tabId];
      if (layout?.expanded && pane?.kind === 'pane' && pane.host === 'dock'
        && pane.tabs.length === 1 && pane.tabs[0] === tabId && tab && tab.kind !== 'guide') {
        // The native replacement runs the outgoing tab's cleanup and keeps the column open.
        return this.openTab('guide', { replaceTab: tabId });
      }
    }
    return closeIn.call(this, sessionId, tabId);
  }

  sidebar.closeIn = closeToGuide;
  return () => {
    if (sidebar.closeIn === closeToGuide) sidebar.closeIn = closeIn;
  };
}
