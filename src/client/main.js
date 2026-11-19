import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { ExplorerPreferences } from '../ui/preferences.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { parentOf, resourceAddress, samePath, sessionFilePath, underPath, windowsPath } from '../ui/navigation.js';
import { renameFavorites } from '../ui/favorites.js';
import { installConversationPathDrop } from '../ui/composer-drop.js';
import { insertPreviewQuote } from '../ui/preview-quote.js';
import { MessageQuote, quoteNodeId, quoteRule } from '../ui/quote-message.js';
import { disks } from '../ui/workspace.js';
import { FilePreviewTab, FilePreviewTitle, previewTabAddress, previewTabLabel } from '../ui/preview-tab.js';
import { openNativePreview, parkPreview } from '../ui/preview-surface.js';
import { MusicCapsule } from '../ui/music-preview.js';
import { stopMusic } from '../ui/music-player.js';
import { installSidebarMotion } from './sidebar-motion.js';
import { installSidebarWidth } from './sidebar-width.js';
import { installSidebarClose } from './sidebar-close.js';
import { installSidebarFade } from './sidebar-fade.js';
import { installSidebarTabInteractions } from './sidebar-tab-drag.js';
import { installSidebarHeaderControls } from './sidebar-header-controls.js';
import { createPreviewWindows, PREVIEW_WINDOW_KIND, PreviewWindowTitle } from './preview-windows.js';
import { installMouseGestures } from './mouse-gestures.js';
import { createPreferences } from './preferences.js';
import { cardIconMarkup, cardIconRatio, cardIconViewBox } from '../ui/card-icon.js';
import { myPcIconMarkup, myPcIconRatio, myPcIconViewBox } from '../ui/my-pc-icon.js';
import { icon } from '../ui/interface-icon.js';
import { installExtensionEffects } from '../extensions/registry.js';

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

function browseGroup(tabScope, sessionId, workspace) {
  if (tabScope === 'global') return 'global';
  if (tabScope === 'workspace' && workspace) return 'workspace:' + workspace.toLowerCase();
  return tabScope + ':session:' + sessionId;
}

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
  const preferences = createPreferences();
  function Settings() { return h(ExplorerPreferences, { preferences }); }
  function SettingsIcon({ size = 16 }) { return icon('settings-explorer', size); }
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id, label: () => '电脑文件资源管理器', order: 30,
  }, Settings)));
  ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id,
  }, SettingsIcon)));

  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session', 'remote.workspaceFiles', 'conversation', 'sessions'], (scope) => {
    const sidebar = scope.sidebarRight;
    let sidebarWidth;
    const bindings = new Map();
    const folderTabs = new Map();
    const inactiveGroups = new Map();
    const listeners = new Set();
    const enlargedPreviews = new Map();
    const previewParking = document.createElement('div');
    previewParking.className = 'dwe dwe-preview-parking';
    const parkSurface = surface => parkPreview(surface.host, previewParking);
    const previewWindows = createPreviewWindows(sidebar, notify, subscribe, previewParking);
    let viewList = [];
    let activeView;
    let presentedSession;
    let presentedGroup;
    let workspace;
    let guidePreviewOpen;
    let lastPreviewOpen = true;
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

    function sendQuote(file, selection) {
      const sessionId = sidebar.mounted.getSnapshot();
      return Boolean(sessionId && insertPreviewQuote(getInput(sessionId), file, selection));
    }

    scope.inject(['uiConversation'], (conversationScope) => {
      conversationScope.effect(() => conversationScope.uiConversation.userText.register(quoteRule));
      conversationScope.effect(() => scope.slots.inject('conversation.user.text.node', () => scope.slots.register({
        name: 'conversation.user.text.node', key: quoteNodeId,
      }, (props) => h(MessageQuote, { ...props, openFile: openQuotedFile }))));
    });

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

    function viewPreviewOpen(view) {
      return view?.saved.state?.previewOpen ?? view?.initialPreviewOpen ?? lastPreviewOpen;
    }

    function createView(initialPath, initialWorkspaceRoot = null, initialPreviewOpen = viewPreviewOpen(activeView)) {
      const host = document.createElement('div');
      host.className = 'dwe-host';
      const address = (initialPath === null ? computerPrefix : instancePrefix) + crypto.randomUUID();
      const previewPane = document.createElement('div');
      previewPane.className = 'dwe-preview-pane-host';
      const view = { host, address, path: initialPath ?? null, initialPath, initialPreviewOpen,
        initialWorkspaceRoot, workspaceRoot: initialWorkspaceRoot, saved: {},
        previewPane, previewSurfaces: new Map(), promotedSurfaces: new Set() };
      view.bindPreviewSurface = surface => {
        view.previewSurfaces.set(surface.previewKey, surface);
        return () => {
          view.previewSurfaces.delete(surface.previewKey);
          const entry = [...enlargedPreviews.values()].find(item => item.surface === surface);
          if (entry) releaseEnlargedPreview(entry);
          surface.host.remove();
        };
      };
      view.promotePreview = (key, restore, paneId = view.getTarget()?.paneId) => {
        const surface = view.previewSurfaces.get(key);
        const sessionId = view.getTarget()?.sessionId;
        if (!surface || !sessionId || sidebar.mounted.getSnapshot() !== sessionId) return false;
        const address = previewTabAddress(surface.file, surface.root);
        if (!address) return false;
        const entryKey = sessionId + '\n' + address;
        if (enlargedPreviews.has(entryKey)) {
          openPreviewTab(surface.file, surface.root, paneId, sessionId);
          return true;
        }
        const entry = { view, surface, sessionId, entryKey, restore };
        enlargedPreviews.set(entryKey, entry);
        view.promotedSurfaces = new Set(view.promotedSurfaces).add(key);
        parkSurface(surface);
        openPreviewTab(surface.file, surface.root, paneId, sessionId);
        const tab = sidebar.active();
        if (tab?.contentId !== address) {
          releaseEnlargedPreview(entry);
          return false;
        }
        entry.tabId = tab.id;
        notify();
        return true;
      };
      view.getTarget = () => view.target ?? view.previewWindow?.target;
      view.onPath = (path, root) => {
        if (view.path === path && view.workspaceRoot === root) return;
        view.workspaceRoot = root;
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
      const view = tab && (bindings.get(tab.id) ?? previewWindows.owner(presentedSession, tab.id));
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
        const path = tab.contentId?.startsWith(computerPrefix) ? null : folderTabs.get(tab.contentId) ?? workspace;
        const view = createView(path, null, guidePreviewOpen);
        bindings.set(tab.tabId, view);
        added.push(view);
      }
      if (removed.size || added.length) {
        viewList = [...viewList.filter(view => !removed.has(view)), ...added];
        if (removed.has(activeView)) {
          lastPreviewOpen = viewPreviewOpen(activeView);
          activeView = undefined;
        }
        for (const view of removed) previewWindows.close(view);
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
      captureDepartingViews();
      detached = true;
      previewWindows.leave(presentedSession);
      if (expanded && viewList.length) beginHandoff();
      // The old native store is still adopted before React commits the session change.
      for (const tab of filesIn(presentedSession)) sidebar.closeIn?.(presentedSession, tab.tabId);
    }

    function captureDepartingViews() {
      rememberOrder(presentedSession);
      for (const view of viewList) {
        const list = view.host.querySelector('.dwe-list');
        if (list?.getClientRects().length && list.querySelector('.dwe-entries')) {
          view.saved.scroll = { path: view.path, top: list.scrollTop, left: list.scrollLeft };
        }
      }
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

    function openNextToActive(address, options) {
      const sessionId = sidebar.mounted.getSnapshot();
      const layout = sidebar.mountedSurface?.()?.layout;
      const pane = layout?.nodes[options.paneId ?? layout.activePaneId];
      const index = pane?.host === 'dock' ? pane.tabs.indexOf(pane.activeTabId) + 1 : 0;
      sidebar.openResource(address, options);
      if (!index || index === pane.tabs.length) return;
      const tab = sidebar.active();
      // Opening an existing preview only focuses it. Leave it in its original slot.
      if (tab?.kind === options.kind && tab.contentId === address && !layout.tabs[tab.id]) {
        sidebar.actionsFor?.(sessionId)?.placeTab?.(sessionId, tab.id, pane.id, index);
      }
    }

    function placeView(view, options, besideActive = false) {
      const placement = { kind: tabKind, ...options };
      if (besideActive) openNextToActive(view.address, placement);
      else sidebar.openResource(view.address, placement);
      const tab = sidebar.active();
      if (tab?.kind === tabKind && tab.contentId === view.address) bindings.set(tab.id, view);
    }

    function getOrCreateWorkspaceView() {
      if (!fileFocused || !activeView?.workspaceRoot || !workspace) return;
      if (samePath(activeView.workspaceRoot, workspace)) return activeView;
      const existing = viewList.find(view => samePath(view.workspaceRoot, workspace));
      if (existing) return existing;
      const view = createView(workspace, workspace);
      const index = viewList.indexOf(activeView) + 1;
      viewList = [...viewList.slice(0, index), view, ...viewList.slice(index)];
      return view;
    }

    function present(sessionId, cwd, tabScope = preferences.get().tabScope) {
      const nextWorkspace = windowsPath(cwd) ?? undefined;
      const group = browseGroup(tabScope, sessionId, nextWorkspace);
      const first = !presentedSession;
      const groupChanged = !first && group !== presentedGroup;
      if (groupChanged) {
        if (!detached) captureDepartingViews();
        const previous = { viewList, activeView };
        const saved = inactiveGroups.get(group);
        const pendingWorkspace = tabScope === 'workspace' && sessionId === presentedSession
          && presentedGroup === browseGroup(tabScope, sessionId);
        if (!pendingWorkspace || saved) inactiveGroups.set(presentedGroup, previous);
        inactiveGroups.delete(group);
        const target = saved ?? (pendingWorkspace ? previous : undefined);
        const firstView = !target && tabScope !== 'global' && nextWorkspace && viewList.length
          ? createView(nextWorkspace, activeView?.workspaceRoot ? nextWorkspace : null) : undefined;
        viewList = target?.viewList ?? (firstView ? [firstView] : []);
        activeView = target?.activeView ?? firstView;
      }
      presentedGroup = group;
      workspace = nextWorkspace;
      if (first || sessionId !== presentedSession || detached || groupChanged) {
        presentedSession = sessionId;
        detached = false;
        bindings.clear();
        if (first) {
          syncTabs();
        } else {
          if (tabScope === 'global') activeView = getOrCreateWorkspaceView() ?? activeView;
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
            }
            if ((viewList.length || groupChanged) && preserveExpansion !== undefined
                && sidebar.isExpanded() !== preserveExpansion) sidebar.toggleExpanded();
          } finally {
            projecting = false;
          }
          notify();
          rememberPresentation();
        }
        const layout = sidebar.mountedSurface?.()?.layout;
        if (layout) {
          for (const [tabId, view] of bindings) {
            if (!view.previewWindow) continue;
            const pane = Object.values(layout.nodes).find(node => node.tabs?.includes(tabId));
            if (pane) view.previewWindow.target = { sessionId, tabId, paneId: pane.id, isFloating: pane.host === 'float' };
          }
        }
        previewWindows.present(sessionId, viewList);
      } else if (tabScope === 'global') {
        // A newly mounted session's cwd can arrive after its sidebar is available.
        const view = getOrCreateWorkspaceView();
        if (!view || view === activeView) return;
        const preserveExpansion = expanded;
        const tabId = [...bindings].find(([, item]) => item === view)?.[0];
        projecting = true;
        try {
          if (tabId) sidebar.focus(tabId);
          else placeView(view, undefined, true);
          if (preserveExpansion !== undefined && sidebar.isExpanded() !== preserveExpansion) sidebar.toggleExpanded();
        } finally {
          projecting = false;
        }
        notify();
        rememberPresentation();
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
        if (paneId) openNextToActive(address, { kind: tabKind, paneId });
        else sidebar.openResource(address, { kind: tabKind });
        syncTabs();
        const tab = sidebar.active();
        return tab?.contentId === address ? bindings.get(tab.id) : undefined;
      } finally {
        folderTabs.delete(address);
      }
    }

    function openPreviewTab(file, root, paneId, sessionId) {
      if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId) return false;
      const address = previewTabAddress(file, root);
      if (!address) return false;
      openNextToActive(address, { kind: PREVIEW_KIND, paneId, params: file.line ? { line: file.line } : undefined });
      return true;
    }

    function releaseEnlargedPreview(entry) {
      if (enlargedPreviews.get(entry.entryKey) !== entry) return;
      enlargedPreviews.delete(entry.entryKey);
      const { view, surface } = entry;
      view.promotedSurfaces = new Set(view.promotedSurfaces);
      view.promotedSurfaces.delete(surface.previewKey);
      notify();
    }

    function syncEnlargedPreviews() {
      const tabs = sidebar.openTabs.getSnapshot();
      for (const entry of enlargedPreviews.values()) {
        if (entry.tabId && !tabs.some(tab => tab.sessionId === entry.sessionId && tab.tabId === entry.tabId)) {
          releaseEnlargedPreview(entry);
        }
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
      const tabId = sidebar.active()?.id;
      return bindings.get(tabId) ?? previewWindows.owner(presentedSession, tabId) ?? activeView ?? viewList[0];
    }

    function revealInExplorer(file, origin) {
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId) return false;
      const existing = viewList.includes(origin) ? origin : currentExplorer();
      const tab = filesIn(sessionId).find(item => bindings.get(item.tabId) === existing);
      if (tab) {
        sidebar.focus(tab.tabId);
        if (!sidebar.isExpanded() && !existing.target?.isFloating) sidebar.toggleExpanded();
      }
      const target = tab ? existing : openFolderTab(parentOf(file.absolute));
      if (!target) return false;
      revealFile(target, file, file.line);
      return true;
    }

    function showConversationFile(file, sessionId) {
      if (preferences.get().conversationFileView === 'full') {
        return openPreviewTab(file, null, undefined, sessionId);
      }
      return revealInExplorer(file);
    }

    async function openQuotedFile(path) {
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId) return false;
      try {
        const file = await disks.locate(path);
        return sidebar.mounted.getSnapshot() === sessionId && file.type === 'file' &&
          showConversationFile({ absolute: file.path, name: file.name, size: file.size }, sessionId);
      } catch {
        return false;
      }
    }

    function MediaFilePreviewTab(props) {
      const { tab, panel } = props.useTabInfo();
      react.useLayoutEffect(() => {
        if (tab.visible && !panel?.isFloating) sidebarWidth?.initialize();
      }, [tab.visible, panel?.isFloating]);
      const entry = react.useSyncExternalStore(subscribe,
        () => enlargedPreviews.get(props.sessionId + '\n' + tab.navigation.address));
      return h(FilePreviewTab, {
        ...props, surface: entry?.surface, parkPreview: parkSurface, restoreMusicPreview: revealInExplorer, sendQuote, preferences,
        onOpenNative: (file, root) => openNativePreview(file, root, { sessionId: props.sessionId, paneId: panel?.id },
          () => sidebar.mounted.getSnapshot() === props.sessionId && sidebar.openTabs.getSnapshot().some(item =>
            item.sessionId === props.sessionId && (item.tabId ?? item.id) === tab.id && item.contentId === tab.navigation.address), openDocument),
        onExit: file => {
          if (!entry) revealInExplorer(file);
          else {
            parkSurface(entry.surface);
            const origin = filesIn(entry.sessionId).find(item => bindings.get(item.tabId) === entry.view);
            if (origin) {
              entry.restore();
              sidebar.focus(origin.tabId);
            } else revealInExplorer(file);
            releaseEnlargedPreview(entry);
          }
          tab.actions.close();
        },
      });
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
      return action => {
        if (!isVisibleExplorer(view) || view.target.sessionId !== sessionId || view.target.paneId !== paneId) return;
        if (action === 'up') view.fileActions.goUp();
        else view.fileActions.historyStep(action === 'back' ? -1 : 1);
      };
    }

    function gestureBadgeBounds() {
      const sidebarColumn = document.querySelector('[data-rightbar-col]');
      const bounds = sidebarColumn?.getBoundingClientRect();
      if (bounds && bounds.width >= 112 && bounds.height >= 112) return bounds;
    }

    async function openConversationFile(request, signal, onUnavailable) {
      const { address, sessionId, file, params } = request;
      const metadata = await statFile(sessionId, file, signal);
      if (signal.aborted || sidebar.mounted.getSnapshot() !== sessionId) return;
      if (!metadata) {
        if (onUnavailable) onUnavailable();
        else openDocument(address, { params });
        return;
      }
      showConversationFile({ ...metadata, line: params?.line }, sessionId);
    }

    function installFileOpener() {
      const openResource = sidebar.openResource;
      let fileClick;
      let dragSource;
      let openingReview = false;
      function openFile(request, onUnavailable) {
        fileClick?.abort();
        fileClick = new AbortController();
        void openConversationFile(request, fileClick.signal, onUnavailable);
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

    function installAddTabOrigin() {
      const openTab = sidebar.openTab;
      if (typeof openTab !== 'function') return () => {};
      function open(kind, options) {
        // DockKit opens the plus-button guide in a specific pane with revealIfOpened disabled.
        if (kind === 'guide' && options?.paneId !== undefined && options.revealIfOpened === false) {
          options = { ...options, params: { ...options.params, dweAddedFromPlus: true } };
        }
        return openTab.call(this, kind, options);
      }
      sidebar.openTab = open;
      return () => {
        if (sidebar.openTab === open) sidebar.openTab = openTab;
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
        const target = { sessionId, paneId: panel.id, isFloating: panel.isFloating, tabId: tab.id };
        if (!panel.isFloating) sidebarWidth?.initialize();
        view.target = target;
        if (view.previewWindow) view.previewWindow.target = target;
        element.appendChild(view.host);
        const savedScroll = view.saved.scroll;
        if (savedScroll && savedScroll.path === view.path) {
          const list = view.host.querySelector('.dwe-list');
          if (list?.querySelector('.dwe-entries')) {
            list.scrollTop = savedScroll.top;
            list.scrollLeft = savedScroll.left;
            delete view.saved.scroll;
          }
        }
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
      const workspaceMode = react.useSyncExternalStore(subscribe, () => Boolean(boundView(sessionId, tab.id)?.workspaceRoot));
      const autoCollapse = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().workspaceTabsAutoCollapse);
      react.useLayoutEffect(() => {
        if (tab.visible) capturePresentation(sessionId);
      });
      return h(ExplorerTitle, { path, workspaceMode, autoCollapse });
    }

    function View({ view, cwd, followWorkspace }) {
      const target = react.useSyncExternalStore(subscribe, view.getTarget);
      const promotedSurfaces = react.useSyncExternalStore(subscribe, () => view.promotedSurfaces);
      const floatingPreview = react.useSyncExternalStore(subscribe, () => Boolean(view.previewWindow));
      const sessionId = view.previewWindow?.sessionId ?? target?.sessionId;
      const favoritesDisplay = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().favoritesDisplay);
      const workspaceButtonDisplay = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().workspaceButtonDisplay);
      return reactDom.createPortal(h(Explorer, {
        sessionId, cwd, followWorkspace, saved: view.saved,
        initialPath: view.initialPath, initialWorkspaceRoot: view.initialWorkspaceRoot, initialPreviewOpen: view.initialPreviewOpen,
        favoritesDisplay, workspaceButtonDisplay, preferences,
        getTarget: view.getTarget, bindFileActions: view.bindFileActions,
        onPath: view.onPath, openLocal, openDocument, openFolderTab, openPreviewTab, refreshDirectories, updateRenamedPath, getInput, sendQuote,
        restoreMusicPreview: file => revealInExplorer(file, view),
        promotedSurfaces, bindPreviewSurface: view.bindPreviewSurface, promotePreview: view.promotePreview,
        previewPane: view.previewPane, floatingPreview,
        detachPreview: point => previewWindows.open(view, point),
        closeFloatingPreview: () => previewWindows.close(view),
      }), view.host);
    }

    function ExplorerGuide({ kind, title, description, useTabInfo }) {
      const { tab, panel } = useTabInfo();
      function openFromGuide(open) {
        if (tab.navigation?.params?.dweAddedFromPlus) guidePreviewOpen = preferences.get().newTabPreviewOpen;
        try {
          open();
          syncTabs();
        } finally {
          guidePreviewOpen = undefined;
        }
      }
      return h('div', { className: 'dwe-guide-entry', 'data-sidebar-right-guide-entry': kind },
        h('button', { type: 'button', className: 'dwe-guide-main',
          onClick: () => {
            openFromGuide(() => tab.actions.openTab(tabKind, { replaceTab: true }));
            tab.actions.close();
          },
        },
        h(CardIcon, { size: description === undefined ? 22 : 26 }),
        h('span', { className: 'dwe-guide-copy' },
          h('span', { className: 'dwe-guide-title' }, title),
          description !== undefined && h('span', { className: 'dwe-guide-description' }, description))),
        h('button', { type: 'button', className: 'dwe-guide-computer', title: '打开此电脑',
          'aria-label': '打开此电脑',
          onClick: () => openFromGuide(() => sidebar.openResource(computerPrefix + crypto.randomUUID(), {
            kind: tabKind, paneId: panel.id, replaceTab: tab.id,
          })),
        }, h(CardIcon, { computer: true })));
    }

    function Keeper({ useSessions }) {
      const sessionId = react.useSyncExternalStore(sidebar.mounted.subscribe, sidebar.mounted.getSnapshot);
      const currentViews = react.useSyncExternalStore(subscribe, () => viewList);
      const currentGroup = react.useSyncExternalStore(subscribe, () => presentedGroup);
      const currentWorkspace = react.useSyncExternalStore(subscribe, () => workspace);
      const cwd = useSessions(state => sessionId ? state.byId[sessionId]?.cwd : undefined);
      const tabScope = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().tabScope);
      const followsWorkspace = currentGroup !== undefined && currentGroup !== 'global';
      // A departing group must finish with its own workspace before the incoming views mount.
      const viewCwd = sessionId === presentedSession && browseGroup(tabScope, sessionId, windowsPath(cwd)) === currentGroup
        ? cwd : currentWorkspace;
      react.useLayoutEffect(() => {
        if (sessionId && sidebar.mounted.getSnapshot() === sessionId) present(sessionId, cwd, tabScope);
      }, [sessionId, cwd, tabScope]);
      return h(react.Fragment, null, h(MusicCapsule, { sessionId }),
        currentViews.map(view => h(View, { key: view.address, view, cwd: viewCwd, followWorkspace: followsWorkspace })));
    }

    scope.effect(() => {
      const style = document.createElement('style');
      style.dataset.dshWorkspaceExplorer = '';
      style.textContent = explorerCss;
      document.head.appendChild(style);
      document.body.appendChild(previewParking);
      function wheel(event) {
        if (!(event.target instanceof Element)) return;
        const scroller = event.target.closest('.dwe-path, .dwe-preview-tabs, .dwe-toolbar, [data-dwe-extension-area="file-footer"]');
        if (scroller) scrollHorizontally(event, scroller);
        else {
          const strip = event.target.closest('[data-dockkit-strip-tabs]');
          if (strip?.querySelector('[data-dwe-tab-title]')) scrollHorizontally(event, strip);
        }
      }
      document.addEventListener('wheel', wheel, { passive: false, capture: true });
      const disposeFileOpener = installFileOpener();
      const disposeAddTabOrigin = installAddTabOrigin();
      const disposeConversationPathDrop = installConversationPathDrop(sidebar.mounted, getInput);
      let disposeMouseGestures;
      function syncGestures() {
        if (preferences.get().gesturesEnabled) {
          disposeMouseGestures ??= installMouseGestures(gestureAction, gestureBadgeBounds,
            direction => preferences.get().gestures[direction]);
        } else {
          disposeMouseGestures?.();
          disposeMouseGestures = undefined;
        }
      }
      syncGestures();
      const disposePreferences = preferences.subscribe(syncGestures);
      window.addEventListener('storage', preferences.onStorage);
      const disposeMotion = installSidebarMotion(sidebar);
      const disposeSidebarClose = installSidebarClose(sidebar, () => projecting || detached);
      const disposeSidebarFade = installSidebarFade(sidebar);
      const disposeSidebarTabInteractions = installSidebarTabInteractions(sidebar.mounted, preferences);
      const disposeSidebarHeaderControls = installSidebarHeaderControls(sidebar, preferences);
      const disposeExtensions = installExtensionEffects(preferences);
      const disposeTabs = sidebar.openTabs.subscribe(syncTabs);
      const disposePreviewTabs = sidebar.openTabs.subscribe(syncEnlargedPreviews);
      const disposePreviewWindows = sidebar.openTabs.subscribe(previewWindows.sync);
      const disposeSwitch = sidebar.mounted.subscribe(closeDepartingTabs);
      return () => {
        stopMusic();
        disposeFileOpener();
        disposeAddTabOrigin();
        disposeConversationPathDrop();
        disposePreferences();
        disposeMouseGestures?.();
        window.removeEventListener('storage', preferences.onStorage);
        disposeMotion();
        disposeSidebarClose();
        disposeSidebarFade();
        disposeSidebarTabInteractions();
        disposeSidebarHeaderControls();
        disposeExtensions();
        disposeTabs();
        disposePreviewTabs();
        disposePreviewWindows();
        previewWindows.dispose();
        enlargedPreviews.clear();
        previewParking.remove();
        disposeSwitch();
        detached = false;
        finishHandoff();
        document.removeEventListener('wheel', wheel, true);
        style.remove();
      };
    });
    scope.inject(['layout'], layoutScope => {
      layoutScope.effect(() => {
        const width = installSidebarWidth(layoutScope.layout, document);
        sidebarWidth = width;
        if (activeView?.target && !activeView.target.isFloating) width.initialize();
        return () => {
          sidebarWidth = undefined;
          width.dispose();
        };
      });
    });
    for (const [name, key, component] of [
      ['shell.overlay', undefined, Keeper],
      ['sidebar.right.pane.tab', id, Anchor],
      ['sidebar.right.pane.tab.title', id, Title],
      ['sidebar.right.pane.tab', PREVIEW_KIND, MediaFilePreviewTab],
      ['sidebar.right.pane.tab.title', PREVIEW_KIND, FilePreviewTitle],
      ['sidebar.right.pane.tab', PREVIEW_WINDOW_KIND, previewWindows.Anchor],
      ['sidebar.right.pane.tab.title', PREVIEW_WINDOW_KIND, PreviewWindowTitle],
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
    scope.effect(() => scope.sidebarRightTabs.register({
      id: PREVIEW_WINDOW_KIND, kind: PREVIEW_WINDOW_KIND, priority: 'extension', title: () => '预览',
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
