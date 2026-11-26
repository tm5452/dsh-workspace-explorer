import { localPath, underPath } from '../ui/navigation.js';
import { emptyPreviewStack } from '../ui/preview-stack.js';
import { isCollectionAddress } from './preview-collections.js';

const keyPrefix = 'dsh-workspace-explorer.layout:';

export function loadSidebarLayout(group) {
  try {
    const layout = JSON.parse(localStorage.getItem(keyPrefix + group));
    if (Array.isArray(layout?.views) && Array.isArray(layout.placement?.panes)) return layout;
  } catch { /* Storage unavailable or malformed. */ }
}

export function saveSidebarLayout(group, { viewList, activeView, sidebarPlacement, expanded, fileFocused }) {
  if (!group || !sidebarPlacement) return;
  const views = viewList.map(view => ({
    address: view.address, path: view.path, root: view.workspaceRoot,
    previewOpen: view.saved.state?.previewOpen ?? view.initialPreviewOpen,
    preview: view.saved.state?.previewStack && {
      active: view.saved.state.previewStack.active,
      tabs: view.saved.state.previewStack.tabs.map(({ id, file, root, confirmed }) => ({ id, file, root, confirmed })),
    },
  }));
  const savedTab = tab => isCollectionAddress(tab) ? undefined : tab;
  const savePane = pane => ({ ...pane, active: savedTab(pane.active), tabs: pane.tabs.filter(savedTab) });
  const placement = { ...sidebarPlacement, active: savedTab(sidebarPlacement.active),
    panes: sidebarPlacement.panes.map(savePane), floats: sidebarPlacement.floats.map(savePane).filter(pane => pane.tabs.length) };
  try {
    localStorage.setItem(keyPrefix + group, JSON.stringify({
      views, active: activeView?.address, placement, expanded, fileFocused,
    }));
  } catch { /* Keep the current in-memory layout. */ }
}

export function savedBrowserState(spec) {
  const path = localPath(spec.path);
  const root = localPath(spec.root);
  const tabs = Array.isArray(spec.preview?.tabs)
    ? spec.preview.tabs.filter(tab => localPath(tab?.file?.absolute)) : [];
  const active = tabs.find(tab => tab.id === spec.preview.active) ?? tabs[0];
  const preview = active ? {
    tabs: [active], nextId: (Number(active.id) || 0) + 1, active: active.id,
  } : emptyPreviewStack;
  return { path, root: underPath(path, root) ? root : null, preview };
}
