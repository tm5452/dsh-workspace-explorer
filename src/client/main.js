import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { parentOf, sessionFilePath, underPath, windowsPath } from '../ui/navigation.js';
import { renameFavorites } from '../ui/favorites.js';
import { installSidebarMotion } from './sidebar-motion.js';
import { installConversationDrop } from './conversation-drop.js';

const id = 'dsh-workspace-explorer';
const inject = ['slots'];
const h = react.createElement;
const instancePrefix = 'dsh-resource://workspace-explorer/tab/';

function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;
  if (!navigator.platform.startsWith('Win')) return;
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session', 'remote.workspaceFiles'], (scope) => {
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
        if (view.pendingPreview) {
          const preview = view.pendingPreview;
          view.pendingPreview = undefined;
          actions.reveal(...preview);
        }
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

    function openDocument(address, options) {
      sidebar.openResource(address, { ...options, kind: 'text' });
    }

    function openFolderTab(path, paneId) {
      const address = instancePrefix + crypto.randomUUID();
      folderTabs.set(address, path);
      try {
        sidebar.openResource(address, { kind: 'files', paneId });
        syncTabs();
        const tab = sidebar.active();
        return tab?.contentId === address ? bindings.get(tab.id) : undefined;
      } finally {
        folderTabs.delete(address);
      }
    }

    async function statFile(sessionId, file, signal) {
      try {
        const result = await scope.remote.workspaceFiles.stat(sessionId, file, signal);
        const absolute = windowsPath(result.ok && result.value.absolutePath);
        if (absolute) return { absolute, name: absolute.split('\\').at(-1), size: result.value.bytes };
      } catch { /* The built-in preview can report a failed session file lookup. */ }
    }

    function revealFile(view, file, line) {
      const preview = [file.absolute, file.name, file.size, line];
      if (view.fileActions) view.fileActions.reveal(...preview);
      else view.pendingPreview = preview;
    }

    function fileRequest(address, options) {
      const sessionId = sidebar.mounted.getSnapshot();
      const file = workspace && sessionId === presentedSession && sessionFilePath(address, sessionId);
      if (file) return { address, sessionId, file, params: options?.params };
    }

    function currentExplorer() {
      return bindings.get(sidebar.active()?.id) ?? activeView ?? viewList[0];
    }

    async function openConversationFile(request, signal, { view, newTab, paneId }) {
      const { address, sessionId, file, params } = request;
      const metadata = await statFile(sessionId, file, signal);
      if (signal.aborted || sidebar.mounted.getSnapshot() !== sessionId) return;
      if (!metadata) {
        openDocument(address, { params, paneId });
        return;
      }
      const existing = newTab ? undefined : viewList.includes(view) ? view : currentExplorer();
      const tabId = existing && [...bindings].find(([, item]) => item === existing)?.[0];
      if (tabId) {
        sidebar.focus(tabId);
        if (!sidebar.isExpanded() && !existing.target?.isFloating) sidebar.toggleExpanded();
      }
      const target = tabId ? existing : openFolderTab(parentOf(metadata.absolute), paneId);
      if (target) revealFile(target, metadata, params?.line);
    }

    function installFileOpener() {
      const openResource = sidebar.openResource;
      let fileClick;
      let dragSource;
      function open(address, options) {
        const request = (!options || Object.keys(options).every(key => key === 'params')) && fileRequest(address, options);
        if (!request) return openResource.call(this, address, options);
        if (dragSource) {
          dragSource.file = request;
          return;
        }
        fileClick?.abort();
        fileClick = new AbortController();
        void openConversationFile(request, fileClick.signal, { view: currentExplorer() });
      }
      function readDragSource(button) {
        // Let Harness resolve the same path and line as a real click, without opening a tab yet.
        const capture = {};
        dragSource = capture;
        try { button.click(); }
        finally { dragSource = undefined; }
        return capture.file;
      }
      sidebar.openResource = open;
      const stopDrop = installConversationDrop(sidebar.mounted, readDragSource, (request, paneId, signal) => {
        void openConversationFile(request, signal, { newTab: true, paneId });
      });
      const stop = sidebar.mounted.subscribe(() => fileClick?.abort());
      return () => {
        stopDrop();
        stop();
        fileClick?.abort();
        if (sidebar.openResource === open) sidebar.openResource = openResource;
      };
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
      const { tab, panel } = useTabInfo();
      const anchor = react.useRef(null);
      const view = react.useSyncExternalStore(subscribe, () => boundView(sessionId, tab.id));
      const navigation = tab.navigation;
      react.useLayoutEffect(() => {
        if (!tab.visible || !view) return;
        const element = anchor.current;
        const target = { sessionId, paneId: panel.id, isFloating: panel.isFloating };
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
      }, [view, sessionId, tab.visible, tab.actions, panel.id, panel.isFloating]);
      react.useEffect(() => {
        if (!tab.visible || !view || view.handledNavigation === navigation) return;
        const { address, params } = navigation;
        const file = sessionFilePath(address, sessionId);
        if (!file) return;

        const controller = new AbortController();
        const { signal } = controller;
        const isCurrent = () => !signal.aborted && !tab.signal?.aborted
          && sidebar.mounted.getSnapshot() === sessionId && boundView(sessionId, tab.id) === view;
        async function reveal() {
          const metadata = await statFile(sessionId, file, signal);
          if (!isCurrent()) return;
          view.handledNavigation = navigation;
          if (metadata) {
            view.revealedFile = true;
            revealFile(view, metadata, params?.line);
          } else {
            openDocument(address, { paneId: panel.id, params, replaceTab: view.revealedFile ? undefined : tab.id });
          }
        }
        void reveal();
        return () => controller.abort();
      }, [view, sessionId, tab.id, tab.visible, navigation, panel.id]);
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
        onPath: view.onPath, openLocal, openDocument, openFolderTab, refreshDirectories, updateRenamedPath,
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
      const disposeFileOpener = installFileOpener();
      const disposeMotion = installSidebarMotion(sidebar);
      const disposeTabs = sidebar.openTabs.subscribe(syncTabs);
      const disposeSwitch = sidebar.mounted.subscribe(closeDepartingTabs);
      return () => {
        disposeFileOpener();
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
