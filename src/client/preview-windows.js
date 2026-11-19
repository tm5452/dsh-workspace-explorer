import { movePreview, parkPreview } from '../ui/preview-surface.js';

export const PREVIEW_WINDOW_KIND = 'dsh-workspace-explorer-preview-window';
const h = react.createElement;

function windowRect({ x, y }) {
  const width = Math.min(480, window.innerWidth);
  const height = Math.min(400, window.innerHeight);
  return {
    x: Math.max(0, Math.min(x - 60, window.innerWidth - width)),
    y: Math.max(0, Math.min(y - 14, window.innerHeight - height)),
    width, height,
  };
}

export function createPreviewWindows(sidebar, notify, subscribe, parking) {
  const entries = new Map();

  function nativePane(entry) {
    if (sidebar.mounted.getSnapshot() !== entry.sessionId) return;
    const layout = sidebar.mountedSurface?.()?.layout;
    if (!layout) return;
    return Object.values(layout.nodes).find(pane => pane.tabs?.includes(entry.tabId));
  }

  function closeNative(entry) {
    const { sessionId, tabId } = entry;
    entry.sessionId = entry.tabId = undefined;
    if (tabId) sidebar.closeIn?.(sessionId, tabId);
  }

  function release(entry, restore = false) {
    entries.delete(entry.address);
    entry.view.previewWindow = undefined;
    if (!restore) {
      entry.view.fileActions?.closePreview();
      if (entry.view.saved.state) entry.view.saved.state.previewOpen = false;
    }
    closeNative(entry);
    notify();
  }

  function openNative(entry, sessionId) {
    const actions = sidebar.actionsFor?.(sessionId);
    if (!actions?.resizeFloat || !sidebar.mountedSurface?.() || !sidebar.closeIn) return false;
    entry.sessionId = sessionId;
    try {
      sidebar.openResource(entry.address, { kind: PREVIEW_WINDOW_KIND, destination: 'float' });
      const { layout } = sidebar.mountedSurface();
      entry.tabId = Object.values(layout.tabs).find(tab => tab.contentId === entry.address)?.id;
      const pane = nativePane(entry);
      if (pane?.host !== 'float') return false;
      actions.resizeFloat(sessionId, pane.id, entry.rect);
      return true;
    } catch (error) {
      console.warn('[dsh-workspace-explorer] Could not open floating preview', error);
      return false;
    }
  }

  function open(view, point) {
    const sessionId = view.target?.sessionId;
    if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId || view.previewWindow || !view.previewPane.isConnected) return;
    const entry = {
      view, address: 'dsh-resource://workspace-explorer/preview-window/' + crypto.randomUUID(),
      rect: windowRect(point), target: view.target,
    };
    entries.set(entry.address, entry);
    if (openNative(entry, sessionId)) {
      view.previewWindow = entry;
      notify();
    } else {
      entries.delete(entry.address);
      closeNative(entry);
    }
  }

  function suspend(entry) {
    const native = entry.view.previewPane.closest('[data-dockkit-float]');
    const rect = native?.getBoundingClientRect();
    if (rect?.width && rect.height) entry.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    closeNative(entry);
  }

  function present(sessionId, views) {
    for (const entry of entries.values()) {
      if (!views.includes(entry.view)) {
        if (entry.sessionId) suspend(entry);
      } else if (!entry.sessionId && !openNative(entry, sessionId)) release(entry, true);
    }
  }

  function sync() {
    const sessionId = sidebar.mounted.getSnapshot();
    if (!sidebar.mountedSurface?.()) return;
    for (const entry of entries.values()) {
      if (!entry.tabId || entry.sessionId !== sessionId) continue;
      const pane = nativePane(entry);
      if (!pane) release(entry);
      else if (pane.host !== 'float') {
        release(entry, true);
        const source = entry.view.target ?? entry.target;
        if (source?.tabId) sidebar.focus?.(source.tabId);
      }
    }
  }

  function Anchor({ sessionId, useTabInfo }) {
    const { tab, panel } = useTabInfo();
    const mount = react.useRef(null);
    const entry = react.useSyncExternalStore(subscribe, () => entries.get(tab.navigation.address));
    react.useLayoutEffect(() => {
      if (!tab.visible) return;
      if (!entry) {
        // DSH can restore a native tab after restarting the plugin. Its in-memory preview is gone.
        queueMicrotask(() => {
          if (!entries.has(tab.navigation.address)) sidebar.closeIn?.(sessionId, tab.id);
        });
        return;
      }
      if (entry.sessionId !== sessionId) return;
      if (!panel.isFloating) {
        queueMicrotask(sync);
        return;
      }
      const dock = mount.current;
      const host = entry.view.previewPane;
      movePreview(host, dock);
      return () => {
        if (host.parentNode === dock && parking.isConnected) parkPreview(host, parking);
      };
    }, [entry, panel.isFloating, sessionId, tab.id, tab.visible, tab.navigation.address]);
    return h('div', { ref: mount, className: 'dwe dwe-floating-preview' });
  }

  return {
    open, present, sync, Anchor,
    owner(sessionId, tabId) {
      if (!tabId) return;
      for (const entry of entries.values()) {
        if (entry.sessionId === sessionId && entry.tabId === tabId) return entry.view;
      }
    },
    close(view) { if (view.previewWindow) release(view.previewWindow); },
    leave(sessionId) {
      for (const entry of entries.values()) if (entry.sessionId === sessionId) suspend(entry);
    },
    dispose() {
      for (const entry of entries.values()) closeNative(entry);
      entries.clear();
    },
  };
}

export function PreviewWindowTitle() {
  return h('span', { 'data-dwe-preview-window-title': '' }, '预览');
}
