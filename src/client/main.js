import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { parentOf, resourceAddress, sessionFilePath, underPath, windowsPath } from '../ui/navigation.js';
import { renameFavorites } from '../ui/favorites.js';
import { installConversationPathDrop } from '../ui/composer-drop.js';
import { FilePreviewTab, FilePreviewTitle, previewTabAddress, previewTabLabel } from '../ui/preview-tab.js';
import { installSidebarMotion } from './sidebar-motion.js';
import { installSidebarClose } from './sidebar-close.js';
import { installSidebarFade } from './sidebar-fade.js';
import { installSidebarTabDrag } from './sidebar-tab-drag.js';
import { installMouseGestures } from './mouse-gestures.js';
import { cardIconMarkup, cardIconRatio, cardIconViewBox } from '../ui/card-icon.js';
import { myPcIconMarkup, myPcIconRatio, myPcIconViewBox } from '../ui/my-pc-icon.js';

import { changedFileButton, installConversationDrop } from './conversation-drop.js';

const id = 'dsh-workspace-explorer';
// The kind our pages are drawn into. DSH's tab registry lets exactly one `extension`
// hold a kind (two in the same band is a wiring mistake and throws), and `files` is
// the kind every files provider wants: claiming it here used to make a second files
// provider register dsh-better-sidebar's `tab kind "files" is already registered
// (extension)`. Our kind is ours alone, so nothing can collide, and the tree, the
// preview and every interaction are identical either way.
const OWN_KIND = 'dsh-workspace-explorer';
const PREVIEW_KIND = 'dsh-workspace-explorer-preview';
const inject = ['slots'];
const h = react.createElement;
const instancePrefix = 'dsh-resource://workspace-explorer/tab/';
const computerPrefix = instancePrefix + 'computer/';
const changesReviewPrefix = 'dsh-resource://changes-review/session/';

/**
 * The guide card's 标志. Guide entries take an icon *component* (`entry.icon` is rendered as
 * `<Icon size={…} />`), so a picture has to arrive as a component too.
 *
 * It is drawn as an inline <svg> rather than an <img>: the vector is rasterised at the 26px it is
 * actually shown at, while a bitmap would be decoded at its own resolution (~167 KiB for the old
 * 233x183 PNG) and only then scaled down to 26. The markup is inlined by
 * scripts/make-card-icon.mjs because the bundle cannot serve files at runtime.
 */
function CardIcon({ size = 26, className, computer = false }) {
  return h('svg', {
    className,
    viewBox: computer ? myPcIconViewBox : cardIconViewBox,
    width: Math.round(size * (computer ? myPcIconRatio : cardIconRatio) * 100) / 100,
    height: size,
    role: 'img',
    'aria-hidden': 'true',
    focusable: 'false',
    style: { display: 'block' },
    dangerouslySetInnerHTML: { __html: computer ? myPcIconMarkup : cardIconMarkup },
  });
}


function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;
  if (!navigator.platform.startsWith('Win')) return;
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session', 'remote.workspaceFiles', 'conversation', 'sessions'], (scope) => {
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
    const tabKind = OWN_KIND;

    function getInput(sessionId) {
      const session = scope.get('sessions').scope(sessionId);
      return session && scope.get('conversation').input.for(session);
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function notify() {
      for (const listener of listeners) listener();
    }

    function filesIn(sessionId) {
      return sidebar.openTabs.getSnapshot().filter(tab => tab.sessionId === sessionId && tab.kind === tabKind);
    }

    function createView(initialPath) {
      const host = document.createElement('div');
      host.className = 'dwe-host';
      const address = (initialPath === null ? computerPrefix : instancePrefix) + crypto.randomUUID();
      const view = { host, address, path: initialPath ?? null, initialPath };
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
        const view = createView(tab.contentId?.startsWith(computerPrefix) ? null : folderTabs.get(tab.contentId) ?? workspace);
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
      sidebar.openResource(view.address, { kind: tabKind, ...options });
      const tab = sidebar.active();
      if (tab?.kind === tabKind && tab.contentId === view.address) bindings.set(tab.id, view);
    }

    function present(sessionId, cwd) {
      workspace = windowsPath(cwd) ?? undefined;
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
              const restoreTab = !fileFocused && nativeActive?.kind !== tabKind ? nativeActive?.id
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
        sidebar.openResource(address, { kind: tabKind, paneId });
        syncTabs();
        const tab = sidebar.active();
        return tab?.contentId === address ? bindings.get(tab.id) : undefined;
      } finally {
        folderTabs.delete(address);
      }
    }

    function openPreviewTab(file, root, paneId, sessionId) {
      if (sidebar.mounted.getSnapshot() !== sessionId) return;
      const address = previewTabAddress(file, root);
      if (!address) return;
      sidebar.openResource(address, { kind: PREVIEW_KIND, paneId, params: file.line ? { line: file.line } : undefined });
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

    function isVisibleExplorer(view) {
      return view?.fileActions && view.target && view.target.sessionId === sidebar.mounted.getSnapshot()
        && (view.target.isFloating || sidebar.isExpanded()) && view.host.getClientRects().length > 0;
    }

    function gestureAction(origin) {
      if (origin.closest('dialog, [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      const visibleViews = viewList.filter(isVisibleExplorer);
      const pane = origin.closest('[data-dockkit-pane]');
      const view = visibleViews.find(view => view.host.contains(origin))
        ?? (pane ? visibleViews.find(view => view.target.paneId === pane.dataset.dockkitPane)
          : [bindings.get(sidebar.active()?.id), activeView, ...visibleViews].find(isVisibleExplorer));
      if (!view) return;
      const { sessionId, paneId } = view.target;
      return direction => {
        if (!isVisibleExplorer(view) || view.target.sessionId !== sessionId || view.target.paneId !== paneId) return;
        if (direction === 'up') view.fileActions.goUp();
        else view.fileActions.historyStep(direction === 'left' ? -1 : 1);
      };
    }

    function gestureBadgeBounds() {
      const sidebarColumn = document.querySelector('[data-rightbar-col]');
      const bounds = sidebarColumn?.getBoundingClientRect();
      if (bounds && bounds.width >= 112 && bounds.height >= 112) return bounds;
    }

    async function openConversationFile(request, signal, { view, onUnavailable }) {
      const { address, sessionId, file, params } = request;
      const metadata = await statFile(sessionId, file, signal);
      if (signal.aborted || sidebar.mounted.getSnapshot() !== sessionId) return;
      if (!metadata) {
        if (onUnavailable) onUnavailable();
        else openDocument(address, { params });
        return;
      }
      const existing = viewList.includes(view) ? view : currentExplorer();
      const tabId = existing && [...bindings].find(([, item]) => item === existing)?.[0];
      if (tabId) {
        sidebar.focus(tabId);
        if (!sidebar.isExpanded() && !existing.target?.isFloating) sidebar.toggleExpanded();
      }
      const target = tabId ? existing : openFolderTab(parentOf(metadata.absolute));
      if (target) revealFile(target, metadata, params?.line);
    }

    function installFileOpener() {
      const openResource = sidebar.openResource;
      let fileClick;
      let dragSource;
      let openingReview = false;
      function openFile(request, onUnavailable) {
        fileClick?.abort();
        fileClick = new AbortController();
        void openConversationFile(request, fileClick.signal, { view: currentExplorer(), onUnavailable });
      }
      function open(address, options) {
        const changed = dragSource?.changed;
        if (changed && address.startsWith(changesReviewPrefix)) {
          if (address.startsWith(changesReviewPrefix + encodeURIComponent(changed.sessionId) + '/')) {
            dragSource.file = { ...changed, review: { address, params: options?.params } };
          }
          return;
        }
        const request = (!options || Object.keys(options).every(key => key === 'params')) && fileRequest(address, options);
        if (!request) return openResource.call(this, address, options);
        if (dragSource) {
          dragSource.file = request;
          return;
        }
        openFile(request);
      }
      function changedFileRequest(button) {
        const card = button.closest('[data-changed-files]');
        const description = document.getElementById(button.getAttribute('aria-describedby'));
        const sessionId = card?.closest('[data-conversation-content]')?.dataset.conversationSession;
        if (sessionId !== sidebar.mounted.getSnapshot() || !card?.contains(description)) return;
        const absolute = windowsPath(description.textContent);
        if (absolute) return fileRequest(resourceAddress(absolute, sessionId));
      }
      function clickChangedFile(event) {
        // Shift-click retains the native change review for an individual file.
        if (openingReview || dragSource?.changed || event.shiftKey || !(event.target instanceof Element)) return;
        const button = event.target.closest(changedFileButton);
        const request = button && changedFileRequest(button);
        if (!request) return;
        event.preventDefault();
        event.stopPropagation();
        openFile(request, () => {
          if (!button.isConnected) return;
          openingReview = true;
          try { button.click(); }
          finally { openingReview = false; }
        });
      }
      function readDragSource(button) {
        const isChanged = button.matches(changedFileButton);
        const changed = isChanged ? changedFileRequest(button) : undefined;
        if (isChanged && !changed) return;
        // Capture Harness's file or review address without opening the tab until drop.
        const capture = { changed };
        dragSource = capture;
        try { button.click(); }
        finally { dragSource = undefined; }
        return capture.file ?? changed;
      }
      sidebar.openResource = open;
      const stopDrop = installConversationDrop(sidebar.mounted, readDragSource, ({ address, sessionId, params, review }, paneId) => {
        if (sidebar.mounted.getSnapshot() !== sessionId) return;
        if (review) sidebar.openResource(review.address, { paneId, params: review.params });
        else openDocument(address, { paneId, params });
      });
      document.addEventListener('click', clickChangedFile, true);
      const stop = sidebar.mounted.subscribe(() => fileClick?.abort());
      return () => {
        document.removeEventListener('click', clickChangedFile, true);
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
        onPath: view.onPath, openLocal, openDocument, openFolderTab, openPreviewTab, refreshDirectories, updateRenamedPath, getInput,
      }), view.host);
    }

    function ExplorerGuide({ kind, title, description, useTabInfo }) {
      const { tab, panel } = useTabInfo();
      return h('div', { className: 'dwe-guide-entry', 'data-sidebar-right-guide-entry': kind },
        h('button', { type: 'button', className: 'dwe-guide-main',
          onClick: () => {
            tab.actions.openTab(tabKind, { replaceTab: true });
            tab.actions.close();
          },
        },
        h(CardIcon, { size: description === undefined ? 22 : 26 }),
        h('span', { className: 'dwe-guide-copy' },
          h('span', { className: 'dwe-guide-title' }, title),
          description !== undefined && h('span', { className: 'dwe-guide-description' }, description))),
        h('button', { type: 'button', className: 'dwe-guide-computer', title: '打开此电脑',
          'aria-label': '打开此电脑',
          onClick: () => sidebar.openResource(computerPrefix + crypto.randomUUID(), {
            kind: tabKind, paneId: panel.id, replaceTab: tab.id,
          }),
        }, h(CardIcon, { computer: true })));
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
        const scroller = event.target.closest('.dwe-path, .dwe-preview-tabs');
        if (scroller) scrollHorizontally(event, scroller);
        else {
          const strip = event.target.closest('[data-dockkit-strip-tabs]');
          if (strip?.querySelector('[data-dwe-tab-title]')) scrollHorizontally(event, strip);
        }
      }
      document.addEventListener('wheel', wheel, { passive: false, capture: true });
      const disposeFileOpener = installFileOpener();
      const disposeConversationPathDrop = installConversationPathDrop(sidebar.mounted, getInput);
      const disposeMouseGestures = installMouseGestures(gestureAction, gestureBadgeBounds);
      const disposeMotion = installSidebarMotion(sidebar);
      const disposeSidebarClose = installSidebarClose(sidebar, () => projecting || detached);
      const disposeSidebarFade = installSidebarFade(sidebar);
      const disposeSidebarTabDrag = installSidebarTabDrag(sidebar.mounted);
      const disposeTabs = sidebar.openTabs.subscribe(syncTabs);
      const disposeSwitch = sidebar.mounted.subscribe(closeDepartingTabs);
      return () => {
        disposeFileOpener();
        disposeConversationPathDrop();
        disposeMouseGestures();
        disposeMotion();
        disposeSidebarClose();
        disposeSidebarFade();
        disposeSidebarTabDrag();
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
      ['sidebar.right.pane.tab', PREVIEW_KIND, FilePreviewTab],
      ['sidebar.right.pane.tab.title', PREVIEW_KIND, FilePreviewTitle],
      ['sidebar.right.tab.guide.entry', id, ExplorerGuide],
    ]) {
      scope.effect(() => scope.slots.inject(name, () =>
        scope.slots.register(key ? { name, key } : { name, id }, component)));
    }
    // We hold our own kind and never claim `files`. A sibling sidebar plugin takes `files`
    // over for its own tree, and two providers racing for one kind makes whichever loses
    // log a registration error — so the `files` row is left to that plugin (or to the
    // built-in page when it steps aside), and file clicks still land on our page through
    // installFileOpener(), which patches the host's openResource whatever kind is in front.
    scope.effect(() => scope.sidebarRightTabs.register({
      id: PREVIEW_KIND, kind: PREVIEW_KIND, priority: 'extension', title: previewTabLabel,
    }));
    scope.effect(() => {
      // The tab strip and the guide row both read 电脑文件资源管理器.
      const label = () => '电脑文件资源管理器';
      const dispose = scope.sidebarRightTabs.register({
        id, kind: OWN_KIND, priority: 'extension', multiple: true, title: label,
        guide: [{
          // Guide entries sort by this number alone (registry `guide()` sorts `left.order - right.order`),
          // so a large negative value puts ours first whether or not a sibling sidebar plugin
          // contributes cards of its own.
          id: 'workspace', commandId: 'workspace.files', order: -1000000,
          title: label,
          description: () => '浏览本机磁盘，在下方独立预览文件',
          icon: CardIcon,
        }],
      });
      syncTabs();
      return () => dispose();
    });
  });
}

export { apply, inject };
