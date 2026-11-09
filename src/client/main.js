import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { underPath, windowsPath } from '../ui/navigation.js';
import { renameFavorites } from '../ui/favorites.js';
import { installSidebarMotion } from './sidebar-motion.js';

const id = 'dsh-workspace-explorer';
const inject = ['slots'];
const h = react.createElement;
const instancePrefix = 'dsh-resource://workspace-explorer/tab/';

function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;
  if (!navigator.platform.startsWith('Win')) return;
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session'], (scope) => {
    const sidebar = scope.sidebarRight;
    const bindings = new Map();
    const folderTabs = new Map();
    const listeners = new Set();
    let viewList = [];
    let activeView;
    let presentedSession;
    let workspace;
    let expanded;
    let fileFocused = false;
    let projecting = false;
    let detached = false;
    let captureQueued = false;
    let handoffFrame;
    let handoffAnimation;

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function notify() {
      for (const listener of listeners) listener();
    }

    function filesIn(sessionId) {
      return sidebar.openTabs.getSnapshot().filter(tab => tab.sessionId === sessionId && tab.kind === 'files');
    }

    function createView(initialPath) {
      const host = document.createElement('div');
      host.className = 'dwe-host';
      const view = { host, address: instancePrefix + crypto.randomUUID(), path: initialPath ?? null, initialPath };
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
      return view;
    }

    function boundView(sessionId, tabId) {
      return sessionId === presentedSession ? bindings.get(tabId) : undefined;
    }

    function rememberPresentation() {
      if (projecting || detached || !presentedSession || sidebar.mounted.getSnapshot() !== presentedSession) return;
      const tab = sidebar.active();
      const view = tab && bindings.get(tab.id);
      if (view) activeView = view;
      fileFocused = Boolean(view);
      expanded = sidebar.isExpanded();
    }

    function rememberOrder(sessionId) {
      const selector = '[data-sidebar-right-session="' + CSS.escape(sessionId) + '"] [data-dockkit-tab]';
      const ordered = new Set();
      for (const chip of document.querySelectorAll(selector)) {
        const view = bindings.get(chip.dataset.dockkitTab);
        if (view) ordered.add(view);
      }
      const next = [...ordered, ...viewList.filter(view => !ordered.has(view))];
      if (next.some((view, index) => view !== viewList[index])) {
        viewList = next;
        notify();
      }
    }

    function capturePresentation(sessionId) {
      if (captureQueued) return;
      captureQueued = true;
      queueMicrotask(() => {
        captureQueued = false;
        if (presentedSession !== sessionId || sidebar.mounted.getSnapshot() !== sessionId) return;
        rememberPresentation();
        rememberOrder(sessionId);
      });
    }

    function syncTabs() {
      if (projecting || detached || !presentedSession || sidebar.mounted.getSnapshot() !== presentedSession) return;
      const tabs = filesIn(presentedSession);
      const live = new Set(tabs.map(tab => tab.tabId));
      const added = [];
      const removed = new Set();
      for (const [tabId, view] of bindings) {
        if (live.has(tabId)) continue;
        bindings.delete(tabId);
        removed.add(view);
      }
      for (const tab of tabs) {
        if (bindings.has(tab.tabId)) continue;
        const view = createView(folderTabs.get(tab.contentId) ?? workspace);
        bindings.set(tab.tabId, view);
        added.push(view);
      }
      if (removed.size || added.length) {
        viewList = [...viewList.filter(view => !removed.has(view)), ...added];
        if (removed.has(activeView)) activeView = undefined;
        notify();
      }
      rememberPresentation();
    }

    function closeDepartingTabs() {
      const arriving = sidebar.mounted.getSnapshot();
      if (!arriving || !presentedSession) return;
      if (arriving === presentedSession) {
        if (detached) queueMicrotask(() => {
          if (detached && sidebar.mounted.getSnapshot() === arriving) present(arriving, workspace);
        });
        return;
      }
      if (detached) return;
      rememberOrder(presentedSession);
      detached = true;
      if (expanded && viewList.length) beginHandoff();
      // The old native store is still adopted before React commits the session change.
      for (const tab of filesIn(presentedSession)) sidebar.closeIn?.(presentedSession, tab.tabId);
    }

    function beginHandoff() {
      const frame = document.querySelector('[data-rightbar-col]')?.parentElement;
      if (!frame) return;
      if (handoffFrame !== frame) {
        finishHandoff();
        handoffFrame = frame;
        frame.style.setProperty('--dwe-handoff-columns', getComputedStyle(frame).gridTemplateColumns);
        frame.dataset.dweSidebarHandoff = '';
      }
      cancelAnimationFrame(handoffAnimation);
      handoffAnimation = requestAnimationFrame(() => {
        handoffAnimation = requestAnimationFrame(finishHandoff);
      });
    }

    function finishHandoff() {
      cancelAnimationFrame(handoffAnimation);
      if (!handoffFrame) return;
      delete handoffFrame.dataset.dweSidebarHandoff;
      handoffFrame.style.removeProperty('--dwe-handoff-columns');
      handoffFrame = undefined;
    }

    function placeView(view, options) {
      sidebar.openResource(view.address, { kind: 'files', ...options });
      const tab = sidebar.active();
      if (tab?.kind === 'files' && tab.contentId === view.address) bindings.set(tab.id, view);
    }

    function present(sessionId, cwd) {
      workspace = windowsPath(cwd);
      if (sessionId !== presentedSession || detached) {
        const first = !presentedSession;
        presentedSession = sessionId;
        detached = false;
        bindings.clear();
        if (first) {
          syncTabs();
        } else {
          const nativeActive = sidebar.active();
          const preserveExpansion = expanded;
          projecting = true;
          try {
            for (const tab of filesIn(sessionId)) sidebar.close(tab.tabId);
            const replaceTab = fileFocused && sidebar.active()?.kind === 'guide' ? sidebar.active()?.id : undefined;
            viewList.forEach((view, index) => placeView(view, index === 0 ? { replaceTab } : undefined));
            if (viewList.length) {
              const restoreTab = !fileFocused && nativeActive?.kind !== 'files' ? nativeActive?.id
                : [...bindings].find(([, view]) => view === activeView)?.[0];
              if (restoreTab) sidebar.focus(restoreTab);
              if (preserveExpansion !== undefined && sidebar.isExpanded() !== preserveExpansion) sidebar.toggleExpanded();
            }
          } finally {
            projecting = false;
          }
          notify();
          rememberPresentation();
        }
      }
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
        syncTabs();
      } finally {
        folderTabs.delete(address);
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
      const view = react.useSyncExternalStore(subscribe, () => boundView(sessionId, tab.id));
      react.useLayoutEffect(() => {
        if (!tab.visible || !view) return;
        const element = anchor.current;
        const target = { sessionId, actions: tab.actions };
        view.target = target;
        element.appendChild(view.host);
        notify();
        capturePresentation(sessionId);
        const dispose = tab.actions.bindCommands?.({ refresh: () => view.fileActions?.refresh() });
        return () => {
          dispose?.();
          if (view.target !== target) return;
          view.target = undefined;
          if (view.host.parentNode === element) view.host.remove();
          notify();
          capturePresentation(sessionId);
        };
      }, [view, sessionId, tab.visible, tab.actions]);
      return h('div', { className: 'dwe-host', ref: anchor });
    }

    function Title({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo();
      const path = react.useSyncExternalStore(subscribe, () => boundView(sessionId, tab.id)?.path ?? null);
      react.useLayoutEffect(() => {
        if (tab.visible) capturePresentation(sessionId);
      });
      return h(ExplorerTitle, { path });
    }

    function View({ view, cwd }) {
      const target = react.useSyncExternalStore(subscribe, view.getTarget);
      const sessionId = target?.sessionId;
      return reactDom.createPortal(h(Explorer, {
        sessionId, cwd, initialPath: view.initialPath, getTarget: view.getTarget, bindFileActions: view.bindFileActions,
        onPath: view.onPath, openLocal, openFolderTab, refreshDirectories, updateRenamedPath,
      }), view.host);
    }

    function Keeper({ useSessions }) {
      const sessionId = react.useSyncExternalStore(sidebar.mounted.subscribe, sidebar.mounted.getSnapshot);
      const currentViews = react.useSyncExternalStore(subscribe, () => viewList);
      const cwd = useSessions(state => sessionId ? state.byId[sessionId]?.cwd : undefined);
      react.useLayoutEffect(() => {
        if (sessionId && sidebar.mounted.getSnapshot() === sessionId) present(sessionId, cwd);
      }, [sessionId, cwd]);
      return currentViews.map(view => h(View, { key: view.address, view, cwd }));
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
      const disposeMotion = installSidebarMotion(sidebar);
      const disposeTabs = sidebar.openTabs.subscribe(syncTabs);
      const disposeSwitch = sidebar.mounted.subscribe(closeDepartingTabs);
      return () => {
        disposeMotion();
        disposeTabs();
        disposeSwitch();
        detached = false;
        finishHandoff();
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
      id, kind: 'files', priority: 'extension', title: () => '文件浏览', multiple: true,
      guide: [{
        id: 'workspace', commandId: 'workspace.files', order: 10, title: () => '文件浏览',
        description: () => '浏览本机磁盘，在下方独立预览文件',
        icon: primitives.GuideArtworkFiles,
      }],
    }));
  });
}

export { apply, inject };
