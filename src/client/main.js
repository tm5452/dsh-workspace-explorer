import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { underPath } from '../ui/navigation.js';
import { renameFavorites } from '../ui/favorites.js';

const id = 'dsh-workspace-explorer';
const inject = ['slots'];
const h = react.createElement;
const instancePrefix = 'dsh-resource://workspace-explorer/tab/';
const occurrence = (sessionId, tabId) => JSON.stringify([sessionId, tabId]);

function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;
  if (!navigator.platform.startsWith('Win')) return;
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session'], (scope) => {
    const sidebar = scope.sidebarRight;
    const views = new Map();
    const folderTabs = new Map();
    const listeners = new Set();
    let viewList = [];
    let activeView;

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function notify() {
      for (const listener of listeners) listener();
    }

    function updateViews() {
      viewList = [...new Set(views.values())];
      notify();
    }

    const openLocal = async (path, action) => {
      const result = await scope.remote.session.openWorkspacePath({ path, action });
      if (!result.ok) throw result.error;
    };

    function openFolderTab(path, paneId) {
      const address = instancePrefix + crypto.randomUUID();
      folderTabs.set(address, path);
      try {
        sidebar.openResource(address, { kind: 'files', paneId });
      } catch (error) {
        folderTabs.delete(address);
        throw error;
      }
    }

    function refreshDirectories(paths, moved = []) {
      const changed = new Set(paths.map(path => path.toLowerCase()));
      for (const view of viewList) {
        if (view.path && (changed.has(view.path.toLowerCase()) || moved.some(root => underPath(view.path, root)))) {
          view.fileActions?.refresh();
        }
      }
    }

    function updateRenamedPath(from, to) {
      if (from === to) return;
      renameFavorites(from, to);
      for (const view of viewList) view.fileActions?.rename(from, to);
    }

    function Anchor({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo();
      const anchor = react.useRef(null);
      const key = occurrence(sessionId, tab.id);
      react.useLayoutEffect(() => {
        if (!tab.visible) return;
        const element = anchor.current;
        let view = views.get(key);
        if (!view) {
          const host = document.createElement('div');
          host.className = 'dwe-host';
          const initialPath = folderTabs.get(tab.contentId);
          folderTabs.delete(tab.contentId);
          view = { host, address: initialPath ? tab.contentId : instancePrefix + crypto.randomUUID(), path: null, initialPath };
          view.getTarget = () => view.target;
          view.onPath = path => {
            if (view.path === path) return;
            view.path = path;
            notify();
          };
          view.bindFileActions = actions => {
            view.fileActions = actions;
            return () => { view.fileActions = undefined; };
          };
          views.set(key, view);
          updateViews();
        }
        const target = { sessionId, actions: tab.actions };
        view.target = target;
        element.appendChild(view.host);
        notify();
        const dispose = tab.actions.bindCommands?.({ refresh: () => view.fileActions?.refresh() });
        return () => {
          dispose?.();
          if (view.target !== target) return;
          view.target = undefined;
          if (view.host.parentNode === element) view.host.remove();
          if (activeView === view && sidebar.mounted.getSnapshot() === sessionId
              && (!sidebar.isExpanded() || sidebar.active()?.kind !== 'files')) {
            activeView = undefined;
          }
          notify();
        };
      }, [key, sessionId, tab.visible, tab.actions]);
      react.useLayoutEffect(() => {
        if (tab.visible && sidebar.active()?.id === tab.id) activeView = views.get(key);
      });
      return h('div', { className: 'dwe-host', ref: anchor });
    }

    function Title({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo();
      const path = react.useSyncExternalStore(subscribe, () => views.get(occurrence(sessionId, tab.id))?.path ?? null);
      return h(ExplorerTitle, { path });
    }

    function View({ view, useSessions }) {
      const target = react.useSyncExternalStore(subscribe, view.getTarget);
      const sessionId = target?.sessionId;
      const cwd = useSessions(state => sessionId ? state.byId[sessionId]?.cwd : undefined);
      return reactDom.createPortal(h(Explorer, {
        sessionId, cwd, initialPath: view.initialPath, getTarget: view.getTarget, bindFileActions: view.bindFileActions,
        onPath: view.onPath, openLocal, openFolderTab, refreshDirectories, updateRenamedPath,
      }), view.host);
    }

    function Keeper({ useSessions }) {
      const sessionId = react.useSyncExternalStore(sidebar.mounted.subscribe, sidebar.mounted.getSnapshot);
      const currentViews = react.useSyncExternalStore(subscribe, () => viewList);
      const previous = react.useRef();
      react.useLayoutEffect(() => {
        if (!sessionId || previous.current === sessionId) return;
        const view = previous.current === undefined ? undefined : activeView;
        previous.current = sessionId;
        if (!view) return;
        // Wait for the new conversation's dock store to be adopted.
        queueMicrotask(() => {
          if (sidebar.mounted.getSnapshot() !== sessionId) return;
          const existing = sidebar.openTabs.getSnapshot().find(tab =>
            tab.sessionId === sessionId && views.get(occurrence(sessionId, tab.tabId)) === view);
          if (existing) {
            if (!sidebar.isExpanded()) sidebar.toggleExpanded();
            sidebar.focus(existing.tabId);
            return;
          }
          sidebar.openResource(view.address, { kind: 'files' });
          const tab = sidebar.active();
          if (tab?.kind !== 'files') return;
          const key = occurrence(sessionId, tab.id);
          if (!views.has(key)) {
            views.set(key, view);
            updateViews();
          }
        });
      }, [sessionId]);
      return currentViews.map(view => h(View, { key: view.address, view, useSessions }));
    }

    scope.effect(() => {
      const style = document.createElement('style');
      style.dataset.dshWorkspaceExplorer = '';
      style.textContent = explorerCss;
      document.head.appendChild(style);
      function wheel(event) {
        if (!(event.target instanceof Element)) return;
        const path = event.target.closest('.dwe-path');
        if (path) scrollHorizontally(event, path);
        else {
          const strip = event.target.closest('[data-dockkit-strip-tabs]');
          if (strip?.querySelector('[data-dwe-tab-title]')) scrollHorizontally(event, strip);
        }
      }
      document.addEventListener('wheel', wheel, { passive: false, capture: true });
      const dispose = sidebar.openTabs.subscribe(() => {
        const inventory = sidebar.openTabs.getSnapshot();
        const live = new Set(inventory.map(tab => occurrence(tab.sessionId, tab.tabId)));
        const addresses = new Set(inventory.map(tab => tab.contentId));
        for (const address of folderTabs.keys()) {
          if (!addresses.has(address)) folderTabs.delete(address);
        }
        let removed = false;
        for (const key of views.keys()) {
          if (live.has(key)) continue;
          views.delete(key);
          removed = true;
        }
        if (removed) {
          updateViews();
          if (!viewList.includes(activeView)) activeView = undefined;
        }
      });
      return () => {
        dispose();
        document.removeEventListener('wheel', wheel, true);
        style.remove();
      };
    });
    for (const [name, key, component] of [
      ['shell.overlay', undefined, Keeper],
      ['sidebar.right.pane.tab', id, Anchor],
      ['sidebar.right.pane.tab.title', id, Title],
    ]) {
      scope.effect(() => scope.slots.inject(name, () =>
        scope.slots.register(key ? { name, key } : { name, id }, component)));
    }
    scope.effect(() => scope.sidebarRightTabs.register({
      id, kind: 'files', priority: 'extension', title: () => '文件浏览', keepMounted: true, multiple: true,
      guide: [{
        id: 'workspace', commandId: 'workspace.files', order: 10, title: () => '文件浏览',
        description: () => '浏览本机磁盘，在下方独立预览文件',
        icon: primitives.GuideArtworkFiles,
      }],
    }));
  });
}

export { apply, inject };
