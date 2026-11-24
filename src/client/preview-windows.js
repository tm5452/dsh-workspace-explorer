import { isCollectionAddress } from './preview-collections.js';

export function beginNativePreviewDockDrag(source, tabId, pointer) {
  const surface = source.closest('[data-dockkit-surface]');
  const nativeTab = tabId && surface?.querySelector('[data-dockkit-tab="' + CSS.escape(tabId) + '"]');
  if (!nativeTab) return;
  const root = document.documentElement;
  let dragging = true;
  root.setAttribute('data-dwe-dock-preview-drag', '');
  // Hand the existing pointer to the hidden DockKit tab to reuse its split targets and feedback.
  nativeTab.dispatchEvent(new PointerEvent('pointerdown', {
    ...pointer, bubbles: true, cancelable: true, button: 0, buttons: 1,
  }));

  function stop(cancelNative) {
    if (!dragging) return;
    dragging = false;
    root.removeAttribute('data-dwe-dock-preview-drag');
    if (cancelNative) window.dispatchEvent(new PointerEvent('pointercancel', pointer));
  }
  return {
    finish(x, y) {
      const target = document.elementFromPoint(x, y);
      const pane = target?.closest('[data-dockkit-pane]');
      const dock = pane && surface.contains(pane) && !target.closest('[data-dockkit-strip], [data-dwe-file-preview-float]');
      stop(!dock);
      return dock;
    },
    cancel: () => stop(true),
  };
}

export function captureSidebarPlacement(layout, getKey) {
  if (!layout) return;
  const root = layout.nodes[layout.rootId];
  if (!root) return;
  const panes = root.kind === 'split' ? root.children.map(id => layout.nodes[id]) : [root];
  function capture(pane) {
    return {
      tabs: pane.tabs.map(getKey).filter(Boolean),
      active: getKey(pane.activeTabId), rect: pane.rect,
    };
  }
  return {
    panes: panes.map(capture), floats: layout.floats.map(id => capture(layout.nodes[id])).filter(pane => pane.tabs.length),
    sizes: root.sizes, active: getKey(layout.nodes[layout.activePaneId]?.activeTabId), mode: layout.mode,
    hasPreview: Object.values(layout.tabs).some(tab => isCollectionAddress(tab.contentId)),
  };
}

export function restoreSidebarPlacement(sidebar, sessionId, placement, getTabId, canFocus = () => true) {
  if (!placement) return;
  const actions = sidebar.actionsFor?.(sessionId);
  const current = () => sidebar.mountedSurface?.()?.layout;
  const layout = current();
  if (!layout || !actions) return;
  const dockIds = () => {
    const state = current();
    const root = state.nodes[state.rootId];
    return root.kind === 'split' ? root.children : [root.id];
  };
  let ids = dockIds();
  if (placement.panes.length === 2 && ids.length === 1) {
    const seed = placement.panes[1].tabs.map(getTabId).find(Boolean);
    const pane = layout.nodes[ids[0]];
    if (seed && pane.tabs.length > 1) actions.dropTab?.(sessionId, seed, pane.id, 'right');
    else actions.splitPane?.(sessionId, pane.id);
    ids = dockIds();
  }
  placement.panes.forEach((pane, column) => {
    const paneId = ids[column] ?? ids[0];
    pane.tabs.forEach((key, index) => {
      const id = getTabId(key);
      if (id) actions.placeTab?.(sessionId, id, paneId, index);
    });
    const active = canFocus(pane.active) ? getTabId(pane.active) : pane.tabs.filter(canFocus).map(getTabId).find(Boolean);
    if (active) sidebar.focus(active);
  });
  const root = current().nodes[current().rootId];
  if (root.kind === 'split' && placement.sizes) actions.resizeSplit?.(sessionId, root.id, placement.sizes);
  for (const pane of placement.floats) {
    for (const key of pane.tabs) {
      const id = getTabId(key);
      if (id) actions.floatTab?.(sessionId, id, pane.rect);
    }
  }
  const active = canFocus(placement.active) && getTabId(placement.active);
  if (active) sidebar.focus(active);
  if (placement.mode && current().mode !== placement.mode) actions.setMode?.(sessionId, placement.mode);
}
