import { HiddenPreviewTabs } from '../ui/preview-pin.js';
import { PreviewFloatControls, PreviewFloatDock } from '../ui/preview-float-dock.js';
import { createPreviewFloatDock } from './preview-float-dock.js';
import { Preview, PreviewBoundary } from '../ui/preview.js';
import { removeStackPreviews } from '../ui/preview-stack.js';
import { loadSidebarLayout, saveSidebarLayout, savedBrowserState } from './sidebar-layout-state.js';
import { Explorer, ExplorerTitle } from '../ui/explorer.js';
import { ExplorerPreferences } from '../ui/preferences.js';
import { explorerCss } from '../ui/styles.js';
import { scrollHorizontally } from '../ui/horizontal-wheel.js';
import { localPath, parentOf, pathKey, pathName, resourceAddress, samePath, sessionFilePath, underPath } from '../ui/navigation.js';
import { localHomeLabel, supportedPlatform } from '../ui/platform.js';
import { renameFavorites } from '../ui/favorites.js';
import { beginPreviewTabDrag, insertPaths, sendComposerFiles, installConversationPathDrop } from '../ui/composer-drop.js';
import { insertPreviewQuote } from '../ui/preview-quote.js';
import { MessageQuote, quoteNodeId, quoteRule } from '../ui/quote-message.js';
import { disks } from '../ui/workspace.js';
import { FilePreviewTab, FilePreviewTitle, readLegacyPreviewAddress } from '../ui/preview-tab.js';
import { isPlaybackFile, movePreview, openNativePreview } from '../ui/preview-surface.js';
import { officeExtensions, previewTicketLifetime } from '../document-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { MusicCapsule } from '../ui/music-preview.js';
import { stopMusic } from '../ui/music-player.js';
import { installSidebarMotion } from './sidebar-motion.js';
import { installSidebarWidth } from './sidebar-width.js';
import { installEmptySidebarRecovery, installSidebarClose, ordinaryTabs, protectedGuides } from './sidebar-close.js';
import { installSidebarFade } from './sidebar-fade.js';
import { installSidebarTabInteractions } from './sidebar-tab-drag.js';
import { installSidebarHeaderControls } from './sidebar-header-controls.js';
import { beginNativePreviewDockDrag, captureSidebarPlacement, restoreSidebarPlacement } from './preview-windows.js';
import { canReturnToBrowser, collectionKey, createPreviewCollections, isCollectionAddress, isPreviewTab, newCollectionAddress, normalizePreviewFile, PREVIEW_KIND } from './preview-collections.js';
import { installDesktopPreviewDrop } from './preview-drop.js';
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
const inject = ['slots'];
const h = react.createElement;
const instancePrefix = 'dsh-resource://workspace-explorer/tab/';
const computerPrefix = instancePrefix + 'computer/';
const PREVIEW_WINDOW_KIND = 'dsh-workspace-explorer-preview-window';
const changesReviewPrefix = 'dsh-resource://changes-review/session/';
const idlePreviewRefreshAfter = previewTicketLifetime - 10 * 60 * 1000;
const defaultPreviewFloatSize = { width: 380, height: 300 };

function browseGroup(tabScope, sessionId, workspace) {
  if (tabScope === 'global') return 'global';
  if (tabScope === 'workspace' && workspace) return 'workspace:' + pathKey(workspace);
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
  if (!supportedPlatform) return;
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
    const previousDockedTabs = new Map();
    const inactiveGroups = new Map();
    const listeners = new Set();
    const previews = createPreviewCollections(sidebar, openNextToActive, notify);
    const floatDockHost = document.createElement('div');
    floatDockHost.className = 'dwe-preview-float-dock';
    const floatDock = createPreviewFloatDock({
      focus: entry => sidebar.focus(entry.tabId),
      close: closePreviewShortcut,
      persist: previews.persistWindow,
      pin: entry => previews.setPinned(entry, true),
    });
    let sidebarPlacement;
    let placingPreview = false;
    let previewSurfacesRevision = 0;
    const parking = document.createElement('div');
    parking.hidden = true;
    const surfaceParking = document.createElement('div');
    surfaceParking.className = 'dwe-parked-preview-surfaces';
    surfaceParking.setAttribute('aria-hidden', 'true');
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
    let legacyMigrationQueued = false;
    let saveTimer;
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

    function saveLayout() {
      if (projecting || detached) return;
      saveSidebarLayout(presentedGroup, { viewList, activeView, sidebarPlacement, expanded, fileFocused });
    }

    function scheduleLayoutSave() {
      if (projecting || detached || !presentedGroup) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveLayout, 150);
    }

    function notify(save = true) {
      if (save) scheduleLayoutSave();
      for (const listener of listeners) listener();
    }

    function filesIn(sessionId) {
      return sidebar.openTabs.getSnapshot().filter(tab => tab.sessionId === sessionId && tab.kind === tabKind);
    }

    function viewPreviewOpen(view) {
      return view?.saved.state?.previewOpen ?? view?.initialPreviewOpen ?? lastPreviewOpen;
    }

    function createView(initialPath, initialWorkspaceRoot = null, initialPreviewOpen = viewPreviewOpen(activeView), savedAddress) {
      const host = document.createElement('div');
      host.className = 'dwe-host';
      const address = savedAddress ?? (initialPath === null ? computerPrefix : instancePrefix) + crypto.randomUUID();
      const previewPane = document.createElement('div');
      previewPane.className = 'dwe-preview-pane-host';
      const view = { host, address, path: initialPath ?? null, initialPath, initialPreviewOpen,
        initialWorkspaceRoot, workspaceRoot: initialWorkspaceRoot, saved: {},
        previewPane, save: scheduleLayoutSave };
      view.getTarget = () => view.target;
      view.withOrigin = file => {
        if (file.origin) return file;
        const local = view.saved.state?.localHistory;
        return {
          ...file, origin: view.address, originFolder: view.path, originWorkspace: view.workspaceRoot,
          originOutsideFolder: local?.paths[local.index],
        };
      };
      view.openPreviewFiles = (files, root, paneId, sessionId, address) =>
        openPreviewFiles(files.map(view.withOrigin), root, paneId, sessionId, address);
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
      view.bindInlinePreview = preview => {
        view.inlinePreview = preview;
        previewSurfacesRevision++;
        notify();
        const returned = previews.entries().find(entry => entry.returningTo === view
          && entry.stack.tabs.some(item => item.surface === preview.item.surface));
        if (returned) queueMicrotask(() => {
          if (view.inlinePreview?.item.surface !== preview.item.surface || returned.returningTo !== view) return;
          returned.returningTo = undefined;
          const item = returned.stack.tabs.find(item => item.surface === preview.item.surface);
          if (item) previews.close(returned, item.id);
        });
        return () => {
          view.inlinePreview = undefined;
          previewSurfacesRevision++;
          notify();
        };
      };
      return view;
    }

    function boundView(sessionId, tabId) {
      return sessionId === presentedSession ? bindings.get(tabId) : undefined;
    }

    function rememberPresentation() {
      if (projecting || detached || !presentedSession || sidebar.mounted.getSnapshot() !== presentedSession) return;
      if (!placingPreview) settleDockedPreviews();
      const tab = sidebar.active();
      const view = tab && bindings.get(tab.id);
      if (view) activeView = view;
      fileFocused = Boolean(view);
      expanded = sidebar.isExpanded();
      const layout = sidebar.mountedSurface?.()?.layout;
      if (layout && layout.nodes[layout.rootId]?.kind !== 'split') {
        for (const entry of previews.entries()) if (entry.sessionId === presentedSession) entry.preferredPaneId = undefined;
      }
      for (const pane of Object.values(layout?.nodes ?? {})) {
        const active = layout.tabs[pane.activeTabId];
        if (pane.host === 'dock' && active && !isPreviewTab(active)) previousDockedTabs.set(pane.id, active.id);
      }
      sidebarPlacement = captureSidebarPlacement(layout, id => {
        const tab = layout.tabs[id];
        return !isPreviewTab(tab) ? bindings.get(id)?.address : undefined;
      });
      scheduleLayoutSave();
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

    function migrateLegacyPreviews() {
      if (legacyMigrationQueued) return;
      legacyMigrationQueued = true;
      queueMicrotask(() => {
        legacyMigrationQueued = false;
        const sessionId = presentedSession;
        if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId) return;
        const tabs = sidebar.openTabs.getSnapshot().filter(tab => tab.sessionId === sessionId);
        const legacy = [];
        for (const tab of tabs) {
          if (![PREVIEW_KIND, PREVIEW_WINDOW_KIND].includes(tab.kind) || isCollectionAddress(tab.contentId)) continue;
          const id = tab.tabId ?? tab.id;
          const file = readLegacyPreviewAddress(tab.contentId);
          const target = file && normalizePreviewFile({ ...file, line: tab.navigation?.params?.line }, file.root);
          if (target) legacy.push({ id, ...target });
          else if (tab.contentId?.startsWith('dsh-resource://workspace-explorer/preview-window/')) sidebar.closeIn?.(sessionId, id);
        }
        const active = sidebar.active()?.id;
        placingPreview = true;
        try {
          for (const target of legacy) {
            const entry = previews.record(presentedGroup, sessionId, newCollectionAddress());
            if (previews.open(entry, sessionId, [target], undefined, { focus: false })) {
              if (target.id === active) sidebar.focus(entry.tabId);
              sidebar.closeIn?.(sessionId, target.id);
            }
          }
          for (const source of previews.entries()) {
            if (source.sessionId !== sessionId || source.stack.tabs.length < 2) continue;
            const pane = previewPaneFor(source);
            if (!pane) continue;
            const activeFile = source.stack.active;
            for (const item of source.stack.tabs.filter(tab => tab.id !== activeFile)) {
              const destination = previews.record(presentedGroup, sessionId, newCollectionAddress());
              const floating = pane.host === 'float';
              if (floating) destination.window = { dockOrder: source.window?.dockOrder ?? Date.now() };
              if (previews.open(destination, sessionId, [], pane.id, { focus: false, floating, allowEmpty: true })) {
                previews.transfer(source, destination, item.id);
              }
            }
          }
        } finally { placingPreview = false; }
        if (legacy.length || sidebar.active()?.id !== active) {
          if (sidebar.mountedSurface?.()?.layout.tabs[active]) sidebar.focus(active);
          previews.sync(presentedGroup, sessionId);
          notify();
          rememberPresentation();
        }
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
        notify();
      }
      if (!placingPreview) {
        const entries = previews.entries();
        previews.sync(presentedGroup, presentedSession);
        if (entries !== previews.entries()) notify();
      }
      if (!placingPreview && (previews.entries().some(entry => entry.sessionId === presentedSession && entry.stack.tabs.length > 1)
          || sidebar.openTabs.getSnapshot().some(tab => tab.sessionId === presentedSession
            && [PREVIEW_KIND, PREVIEW_WINDOW_KIND].includes(tab.kind) && !isCollectionAddress(tab.contentId)))) migrateLegacyPreviews();
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
      saveLayout();
      detached = true;
      floatDock.clearShortcutFlights();
      for (const entry of previews.entries()) {
        if (entry.sessionId !== presentedSession) continue;
        const id = previews.unbind(entry);
        if (id) sidebar.closeIn?.(presentedSession, id);
      }
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

    function restoreGroup(group) {
      const state = loadSidebarLayout(group);
      if (!state) return;
      const restored = state.views.filter(spec => typeof spec.address === 'string' && spec.address.startsWith(instancePrefix)).map(spec => {
        const { path, root, preview } = savedBrowserState(spec);
        const view = createView(path, root, spec.previewOpen !== false, spec.address);
        view.saved.state = { previewOpen: view.initialPreviewOpen, previewStack: preview };
        view.saved.checkPath = Boolean(path);
        return view;
      });
      return { viewList: restored, activeView: restored.find(view => view.address === state.active),
        sidebarPlacement: state.placement, expanded: state.expanded, fileFocused: state.fileFocused };
    }

    function present(sessionId, cwd, tabScope = preferences.get().tabScope) {
      const nextWorkspace = localPath(cwd) ?? undefined;
      const group = browseGroup(tabScope, sessionId, nextWorkspace);
      const first = !presentedSession;
      const groupChanged = !first && group !== presentedGroup;
      const savedGroup = (first || groupChanged) && (inactiveGroups.get(group) ?? restoreGroup(group));
      if (first ? savedGroup : groupChanged) {
        if (!first && !detached) {
          captureDepartingViews();
          saveLayout();
        }
        const previous = { viewList, activeView, sidebarPlacement, expanded, fileFocused };
        const saved = savedGroup;
        const pendingWorkspace = tabScope === 'workspace' && sessionId === presentedSession
          && presentedGroup === browseGroup(tabScope, sessionId);
        if (!first && (!pendingWorkspace || saved)) inactiveGroups.set(presentedGroup, previous);
        inactiveGroups.delete(group);
        const target = saved ?? (pendingWorkspace ? previous : undefined);
        const firstView = !target && tabScope !== 'global' && nextWorkspace && viewList.length
          ? createView(nextWorkspace, activeView?.workspaceRoot ? nextWorkspace : null) : undefined;
        viewList = target?.viewList ?? (firstView ? [firstView] : []);
        activeView = target?.activeView ?? firstView;
        sidebarPlacement = target?.sidebarPlacement;
        expanded = target?.expanded ?? expanded;
        fileFocused = target?.fileFocused ?? Boolean(firstView);
      }
      presentedGroup = group;
      workspace = nextWorkspace;
      for (const view of viewList) view.lastWorkspace = cwd;
      if (first || sessionId !== presentedSession || detached || groupChanged) {
        presentedSession = sessionId;
        detached = false;
        bindings.clear();
        previousDockedTabs.clear();
        previews.restoreShortcuts(group, sessionId, sidebarPlacement);
        if (first && !savedGroup) {
          syncTabs();
        } else {
          const nativeActive = sidebar.active();
          const preserveExpansion = expanded;
          projecting = true;
          try {
            for (const entry of previews.entries()) if (entry.sessionId === sessionId) previews.unbind(entry);
            for (const tab of previews.find(sessionId)) sidebar.close(tab.tabId ?? tab.id);
            for (const tab of filesIn(sessionId)) sidebar.close(tab.tabId);
            const replaceTab = fileFocused && sidebar.active()?.kind === 'guide' ? sidebar.active()?.id : undefined;
            viewList.forEach((view, index) => placeView(view, index === 0 ? { replaceTab } : undefined));
            if (viewList.length) {
              const restoreTab = !fileFocused && nativeActive?.kind !== tabKind ? nativeActive?.id
                : [...bindings].find(([, view]) => view === activeView)?.[0];
              if (restoreTab) sidebar.focus(restoreTab);
            }
            restoreSidebarPlacement(sidebar, sessionId, sidebarPlacement,
              key => [...bindings].find(([, view]) => view.address === key)?.[0]);
            if ((viewList.length || sidebarPlacement?.hasPreview || groupChanged) && preserveExpansion !== undefined
                && sidebar.isExpanded() !== preserveExpansion) sidebar.toggleExpanded();
          } finally {
            projecting = false;
          }
          notify();
          syncTabs();
        }
        sidebarWidth?.initialize();
      }
    }

    const openLocal = async (path, action) => {
      const result = await scope.remote.session.openWorkspacePath({ path, action });
      if (!result.ok) throw result.error;
    };

    function openDocument(address, options) {
      sidebar.openResource(address, { ...options, paneId: dockedPane(options?.paneId), kind: 'text' });
    }

    function dockedPane(paneId) {
      return sidebar.mountedSurface?.()?.layout?.nodes[paneId]?.host === 'float' ? undefined : paneId;
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

    function previewPaneFor(entry) {
      const layout = sidebar.mountedSurface?.()?.layout;
      return Object.values(layout?.nodes ?? {}).find(pane => pane.tabs?.includes(entry.tabId));
    }

    function settleDockedPreviews() {
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        for (const entry of previews.entries()) {
          if (entry.sessionId !== presentedSession || entry.returningTo) continue;
          const layout = sidebar.mountedSurface()?.layout;
          const pane = previewPaneFor(entry);
          if (!layout || pane?.host !== 'dock') continue;
          const active = pane.activeTabId === entry.tabId;
          const hasRegularTab = ordinaryTabs(layout, pane).length > 0;
          if (active && layout.expanded && entry.dockSelected && !entry.needsOpen) {
            if (!hasRegularTab) {
              sidebar.openTab('guide', { paneId: pane.id });
              sidebar.focus(entry.tabId);
            }
            continue;
          }
          // An expanded pane needs a regular tab before its private preview is withdrawn.
          if (active && !layout.expanded && !hasRegularTab) continue;
          if (active && layout.expanded) hideSidebarPreview(pane);
          previews.park(entry);
        }
      } finally {
        placingPreview = previousPlacing;
      }
    }

    function hideSidebarPreview(pane) {
      const layout = sidebar.mountedSurface()?.layout;
      const current = layout?.nodes[pane.id];
      if (!current || current.activeTabId !== pane.activeTabId) return;
      const tabs = ordinaryTabs(layout, current);
      const previous = previousDockedTabs.get(pane.id);
      const target = tabs.includes(previous) ? previous : tabs.at(-1);
      if (target) sidebar.focus(target);
      else sidebar.openTab('guide', { paneId: pane.id });
    }

    function shortcutPresentation(entry) {
      if (detached || projecting || !entry.sessionId || entry.sessionId !== sidebar.mounted.getSnapshot()) return;
      const pane = previewPaneFor(entry);
      if (!pane) return;
      const floating = pane.host === 'float';
      const displayed = !entry.needsOpen && !entry.stack.suspended && entry.stack.tabs.length > 0 && (floating
        ? entry.window?.dockOrder === undefined : sidebar.isExpanded() && pane.activeTabId === entry.tabId);
      return { floating, displayed };
    }

    function closePreviewShortcut(entry) {
      floatDock.cancelShortcutFlight(entry);
      if (!entry.tabId) return previews.discard(entry);
      entry.explicitClose = true;
      sidebar.close(entry.tabId);
    }

    function minimizeDockedPreview(entry) {
      const pane = previewPaneFor(entry);
      if (pane?.host !== 'dock' || pane.activeTabId !== entry.tabId) return;
      previews.setPinned(entry, true);
      floatDock.retractPreviewToShortcut(entry);
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        hideSidebarPreview(pane);
        previews.park(entry);
      } finally {
        placingPreview = previousPlacing;
      }
    }

    function rebindShortcut(entry, floating, paneId, point) {
      if (previewPaneFor(entry)) return true;
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId || presentedSession !== sessionId || detached || projecting
          || entry.group !== presentedGroup || !entry.stack.tabs.length) return false;
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        if (!previews.open(entry, sessionId, [], paneId, {
          focus: false, allowEmpty: true, floating, rebind: true,
        })) return false;
        if (floating) positionPreviewFloat(entry, point, true);
        if (entry.window) {
          entry.window = { ...entry.window, dockOrder: undefined, minimizedFromInline: false };
          floatDock.refresh(entry);
          previews.persistWindow(entry);
        }
      } finally {
        placingPreview = previousPlacing;
      }
      return Boolean(previewPaneFor(entry));
    }

    function togglePreview(entry, shortcutSource) {
      if (!previews.entries().includes(entry) || entry.group !== presentedGroup) return;
      if (previews.afterPark(entry, () => togglePreview(entry, shortcutSource))) return;
      floatDock.cancelShortcutFlight(entry);
      const current = shortcutPresentation(entry);
      if (!current) {
        const floating = entry.window?.minimizedFromInline
          ? preferences.get().fileDoubleClick === 'preview' : entry.shortcut?.floating;
        if (rebindShortcut(entry, floating)) activatePreview(entry, shortcutSource, false);
        return;
      }
      if (current.displayed) {
        if (current.floating) floatDock.minimize(entry);
        else minimizeDockedPreview(entry);
      } else activatePreview(entry, shortcutSource);
    }

    function activatePreview(entry, shortcutSource, refresh = true) {
      if (entry.sessionId !== sidebar.mounted.getSnapshot()) return;
      if (refresh) renewAgedPreview(entry);
      if (entry.needsOpen || entry.stack.suspended) previews.select(entry, entry.stack.active);
      const pane = previewPaneFor(entry);
      if (pane?.host === 'float' && entry.window?.dockOrder !== undefined) {
        if (entry.window.minimizedFromInline) {
          if (preferences.get().fileDoubleClick === 'preview') {
            floatDock.restore(entry, { maximized: false, restoreToInline: false, minimizedFromInline: false });
          } else {
            floatDock.flyShortcut(entry, shortcutSource, 'sidebar');
            if (!movePreviewEntry(entry, false)) floatDock.cancelShortcutFlight(entry);
          }
          return;
        }
        floatDock.restore(entry);
        return;
      }
      const scroller = pane?.host === 'dock' && '[data-sidebar-right-panel] [data-dockkit-strip="' + CSS.escape(pane.id)
        + '"] [data-dockkit-strip-tabs]';
      const left = scroller && document.querySelector(scroller)?.scrollLeft;
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        if (pane?.host === 'dock') {
          const layout = sidebar.mountedSurface()?.layout;
          if (layout && !ordinaryTabs(layout, pane).length) sidebar.openTab('guide', { paneId: pane.id });
          entry.dockSelected = true;
          entry.shortcut = { floating: false, displayed: true };
          previews.persistWindow(entry);
          if (!sidebar.isExpanded()) sidebar.toggleExpanded();
          floatDock.flyShortcut(entry, shortcutSource, 'sidebar');
        } else if (pane?.host === 'float') {
          entry.dockSelected = false;
          entry.shortcut = { floating: true, displayed: true };
          previews.persistWindow(entry);
        }
        sidebar.focus(entry.tabId);
      } finally {
        placingPreview = previousPlacing;
      }
      notify();
      capturePresentation(entry.sessionId);
      if (left) {
        requestAnimationFrame(() => {
          const current = document.querySelector(scroller);
          if (current && previewPaneFor(entry)?.activeTabId === entry.tabId) current.scrollLeft = left;
        });
      }
    }

    function movePreviewEntry(entry, floating, paneId, focus = true, point) {
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId || entry.sessionId !== sessionId || presentedSession !== sessionId || !entry.stack.tabs.length) return false;
      const pane = previewPaneFor(entry);
      if (!pane) return false;
      const layout = sidebar.mountedSurface()?.layout;
      const targetPane = !floating && layout?.nodes[paneId]?.host === 'dock' ? layout.nodes[paneId] : undefined;
      if ((pane.host === 'float') !== floating || (targetPane && targetPane.id !== pane.id)) {
        const actions = sidebar.actionsFor?.(sessionId);
        if (floating) {
          entry.preferredPaneId = layout.nodes[layout.rootId]?.kind === 'split' ? pane.id : undefined;
          if (pane.activeTabId === entry.tabId && pane.tabs.length === 1) hideSidebarPreview(pane);
          const rect = point && previewFloatPlacement(defaultPreviewFloatSize, point, true);
          actions?.floatTab?.(sessionId, entry.tabId, rect);
        } else {
          const target = targetPane ?? [entry.preferredPaneId, layout.activePaneId]
            .map(id => layout.nodes[id]).find(node => node?.host === 'dock')
            ?? Object.values(layout.nodes).find(node => node.host === 'dock');
          if (!target) return false;
          if (pane.host === 'dock' && pane.activeTabId === entry.tabId && pane.tabs.length === 1) hideSidebarPreview(pane);
          const previousPlacing = placingPreview;
          placingPreview = true;
          try {
            actions?.dropTab?.(sessionId, entry.tabId, target.id, 'center');
          } finally {
            placingPreview = previousPlacing;
          }
          if (previewPaneFor(entry)?.id !== target.id) return false;
        }
        if (previewPaneFor(entry)?.host !== (floating ? 'float' : 'dock')) return false;
        if (floating && !point) {
          positionPreviewFloat(entry, undefined, true);
          rememberPresentation();
        }
        if (!floating && entry.window) {
          entry.window = { ...entry.window, dockOrder: undefined, maximized: false,
            restoreToSidebar: false, restoreToInline: false, minimizedFromInline: false };
          previews.persistWindow(entry);
        }
      }
      if (focus) activatePreview(entry);
      return true;
    }

    function maximizeDockedPreview(entry) {
      if (previewPaneFor(entry)?.host !== 'dock') return false;
      const previous = entry.window;
      entry.window = { ...previous, maximized: true, restoreToSidebar: true, restoreToInline: false };
      if (movePreviewEntry(entry, true)) {
        previews.persistWindow(entry);
        return true;
      }
      entry.window = previous;
      return false;
    }

    function previewFloatPlacement(rect, point, initial) {
      const root = document.documentElement;
      const titlebar = root.hasAttribute('data-windows-titlebar') && !root.hasAttribute('data-fullscreen')
        ? (Number.parseFloat(getComputedStyle(root).getPropertyValue('--dsh-windows-titlebar-height')) || 36) : 0;
      const width = initial ? Math.min(rect.width * 2, Math.max(1, root.clientWidth - 24)) : rect.width;
      const height = initial ? Math.min(rect.height * 2, Math.max(1, root.clientHeight - titlebar - 24)) : rect.height;
      const x = Math.max(0, Math.min(point ? point.x - width / 2 : rect.x, root.clientWidth - width));
      const y = Math.max(titlebar, Math.min(point ? point.y - height / 2 : rect.y, root.clientHeight - height));
      return { x, y, width, height };
    }

    function positionPreviewFloat(entry, point, initial = false) {
      const pane = previewPaneFor(entry);
      if (pane?.host !== 'float' || !pane.rect) return;
      const rect = previewFloatPlacement(pane.rect, point, initial);
      const actions = sidebar.actionsFor?.(entry.sessionId);
      if (initial) actions?.resizeFloat?.(entry.sessionId, pane.id, rect);
      else if (rect.x !== pane.rect.x || rect.y !== pane.rect.y) {
        actions?.moveFloat?.(entry.sessionId, pane.id, rect.x, rect.y);
      }
    }

    function openSmallPreview(entry, point) {
      const floating = previewPaneFor(entry)?.host === 'float';
      if (!movePreviewEntry(entry, true, undefined, false, point)) return false;
      if (point && floating) positionPreviewFloat(entry, point);
      if (entry.window?.dockOrder !== undefined) {
        if (entry.needsOpen || entry.stack.suspended) previews.select(entry, entry.stack.active);
        floatDock.restore(entry, { maximized: false, restoreToSidebar: false, restoreToInline: false, minimizedFromInline: false },
          { animate: !point });
      } else {
        if (entry.window?.maximized) {
          entry.window = { ...entry.window, maximized: false, restoreToSidebar: false, restoreToInline: false };
          floatDock.refresh(entry);
          previews.persistWindow(entry);
        }
        activatePreview(entry, undefined, !point);
      }
      return true;
    }

    function estimateShortcutDropPreview(entry, destination, panel) {
      const pane = previewPaneFor(entry);
      const container = panel?.parentElement;
      if (destination.mode === 'window') {
        const existing = pane?.rect;
        const { x, y, width, height } = previewFloatPlacement(existing ?? defaultPreviewFloatSize, destination, !existing);
        return { container, floating: true, movesSurface: pane?.host !== 'float' || Boolean(entry.window?.maximized),
          bounds: { left: x, top: y, width, height } };
      }
      const movesSurface = pane?.host !== 'dock' || !sidebar.isExpanded()
        || Boolean(destination.paneId && destination.paneId !== pane.id);
      const layout = sidebar.mountedSurface()?.layout;
      const active = layout?.nodes[layout.activePaneId];
      const preferred = destination.paneId ?? entry.preferredPaneId ?? (active?.host === 'dock' ? active.id : null);
      const node = destination.node ?? (preferred && panel?.querySelector('[data-dockkit-pane="' + CSS.escape(preferred) + '"]'));
      if (node?.isConnected && panel?.hasAttribute('data-sidebar-right-open')) {
        const element = node.getBoundingClientRect();
        const stripBounds = node.querySelector('[data-dockkit-strip]')?.getBoundingClientRect();
        const top = Math.max(element.top, stripBounds?.bottom ?? element.top);
        if (element.width && element.bottom > top) {
          return { container, movesSurface, bounds: { left: element.left, top, width: element.width, height: element.bottom - top }, stripBounds };
        }
      }
      const root = document.documentElement;
      const rect = panel?.getBoundingClientRect();
      const width = rect?.width || root.clientWidth * .3;
      const left = rect?.width ? rect.left : root.clientWidth - width;
      const top = rect?.top ?? 0;
      const strip = panel?.querySelector('[data-dockkit-strip]')?.getBoundingClientRect();
      const bottom = Math.max(top + 1, strip?.bottom ?? top + 34);
      return { container, movesSurface, bounds: { left, top: bottom, width, height: Math.max(1, (rect?.bottom || root.clientHeight) - bottom) },
        stripBounds: { left, right: left + width, top, bottom, width, height: bottom - top } };
    }

    function getShortcutDropPreview(entry, destination, estimate = false) {
      const sessionId = sidebar.mounted.getSnapshot();
      const panel = sessionId && document.querySelector(
        '[data-sidebar-right-panel][data-sidebar-right-session="' + CSS.escape(sessionId) + '"]');
      if (estimate) return estimateShortcutDropPreview(entry, destination, panel);
      if (!sessionId || entry.sessionId !== sessionId) return;
      const pane = previewPaneFor(entry);
      const floating = destination.mode === 'window';
      if (!pane || pane.activeTabId !== entry.tabId || (pane.host === 'float') !== floating
          || (destination.paneId && pane.id !== destination.paneId)) return;
      if (!panel || (!floating && !panel.hasAttribute('data-sidebar-right-open'))) return;
      const id = CSS.escape(pane.id);
      const element = panel.querySelector(floating ? '[data-dockkit-float="' + id + '"]' : '[data-dockkit-pane="' + id + '"]');
      if (!element || !entry.host?.isConnected || !element.contains(entry.host)
          || entry.host.closest('[hidden], [inert], [aria-hidden="true"]')
          || !entry.host.querySelector('[data-dwe-preview-page]')) return;
      if (floating && element.hasAttribute('data-dwe-float-maximized')) return;
      const rect = element.getBoundingClientRect();
      const strip = floating ? null : element.querySelector('[data-dockkit-strip="' + id + '"]');
      const stripBounds = strip?.getBoundingClientRect();
      const top = Math.max(rect.top, stripBounds?.bottom ?? rect.top);
      if (rect.bottom <= top || !rect.width) return;
      return { stripBounds, bounds: { left: rect.left, top, width: rect.width, height: rect.bottom - top } };
    }

    function openShortcutAt(entry, destination) {
      if (!previews.entries().includes(entry) || entry.group !== presentedGroup) return false;
      if (previews.afterPark(entry, () => openShortcutAt(entry, destination))) return true;
      floatDock.cancelShortcutFlight(entry);
      const floating = destination.mode === 'window';
      const point = floating && Number.isFinite(destination.x) ? destination : undefined;
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        if (!rebindShortcut(entry, floating, destination.paneId, point)) return false;
        if (floating) return openSmallPreview(entry, point);
        if (!movePreviewEntry(entry, false, destination.paneId, false)) return false;
        activatePreview(entry, undefined, false);
        return true;
      } finally {
        placingPreview = previousPlacing;
      }
    }

    function findPreviewFile(sessionId, file) {
      const absolute = localPath(file.absolute);
      if (!absolute) return;
      return previews.entries().find(entry => (entry.sessionId === sessionId ||
          (!entry.tabId && sessionId === presentedSession && entry.group === presentedGroup))
        && entry.stack.tabs.some(item => samePath(localPath(item.file.absolute), absolute)));
    }

    function inlineMediaOwners(file, except) {
      const absolute = localPath(file.absolute);
      if (!absolute || !isPlaybackFile(file.name)) return [];
      return viewList.flatMap(view => {
        if (view === except) return [];
        const item = view.inlinePreview?.item ?? view.saved.state?.previewStack?.tabs[0];
        return samePath(localPath(item?.file.absolute), absolute) ? [{ view, item }] : [];
      });
    }

    function clearInlineMedia(owners) {
      for (const { view, item } of owners) {
        if (view.fileActions) view.fileActions.clearPreviewFile(item.file.absolute);
        else if (view.saved.state?.previewStack) {
          const state = view.saved.state;
          const previewStack = removeStackPreviews(state.previewStack, tab => tab.id === item.id, view.workspaceRoot);
          view.saved.state = { ...state, previewStack };
        }
      }
    }

    function claimInlineMedia(view, file) {
      const entry = findPreviewFile(view.target?.sessionId ?? presentedSession, file);
      if (entry && entry.returningTo !== view) return false;
      const owners = inlineMediaOwners(file, view);
      const surface = owners.find(owner => owner.item.surface)?.item.surface;
      clearInlineMedia(owners);
      return surface;
    }

    function replaceSmallPreview(entry, target, sessionId) {
      const existing = findPreviewFile(sessionId, target.file);
      const preview = existing?.stack.tabs.find(tab => samePath(tab.file.absolute, target.file.absolute));
      const owners = inlineMediaOwners(target.file);
      const surface = preview?.surface ?? owners.find(owner => owner.item.surface)?.item.surface;
      const previousPlacing = placingPreview;
      placingPreview = true;
      try {
        previews.replace(entry, { ...target, surface, pdfPosition: preview?.pdfPosition });
        if (existing && existing !== entry) closePreviewShortcut(existing);
        clearInlineMedia(owners);
      } finally {
        placingPreview = previousPlacing;
      }
      activatePreview(entry, undefined, false);
      return true;
    }

    function openPreviewTargets(targets, sessionId, paneId, address) {
      if (!targets.length || !sessionId || sessionId !== presentedSession || sidebar.mounted.getSnapshot() !== sessionId) return false;
      const hit = address && previews.entries().find(entry => entry.sessionId === sessionId && entry.address === collectionKey(address));
      if (address && !hit) return false;
      const floating = Boolean(hit && previewPaneFor(hit)?.host === 'float');
      if (floating && !hit.window?.maximized) return replaceSmallPreview(hit, targets[0], sessionId);
      let activated;
      placingPreview = true;
      try {
        for (const target of targets) {
          const owners = inlineMediaOwners(target.file);
          const surface = owners.find(owner => owner.item.surface)?.item.surface;
          const next = surface ? { ...target, surface } : target;
          const existing = findPreviewFile(sessionId, target.file);
          const targetPane = dockedPane(paneId);
          if (existing && (!rebindShortcut(existing, floating, targetPane)
              || !movePreviewEntry(existing, floating, targetPane, false))) continue;
          const entry = existing ?? (floating && !hit.stack.tabs.length
            ? hit : previews.record(presentedGroup, sessionId, newCollectionAddress()));
          if (previews.open(entry, sessionId, [next], targetPane, { floating, focus: false })) {
            activated = entry;
            clearInlineMedia(owners);
          }
        }
        if (activated && hit?.keepEmptyFloat && hit !== activated) sidebar.close(hit.tabId);
      } finally { placingPreview = false; }
      previews.sync(presentedGroup, sessionId);
      if (!activated) return false;
      activatePreview(activated);
      notify();
      rememberPresentation();
      return true;
    }

    function openPreviewFloat(sessionId, {
      file, root, maximized = false, fromInline, minimized = false, paneId, shortcutSource,
    } = {}) {
      if (!sessionId || sessionId !== presentedSession || sidebar.mounted.getSnapshot() !== sessionId) return false;
      const target = file && normalizePreviewFile(file, root);
      if (file && !target) return false;
      const owners = target ? inlineMediaOwners(target.file) : [];
      if (owners.length) target.surface = owners.find(owner => owner.item.surface)?.item.surface;
      const finish = opened => {
        if (opened) clearInlineMedia(owners);
        return opened;
      };
      const existing = target && findPreviewFile(sessionId, target.file);
      if (existing) {
        if (minimized || !rebindShortcut(existing, true)) return false;
        if (fromInline && maximized) {
          if (previewPaneFor(existing)?.host === 'dock' && !movePreviewEntry(existing, true, undefined, false)) return false;
          existing.window = { ...existing.window, maximized, restoreToSidebar: false, restoreToInline: true,
            minimizedFromInline: false, dockOrder: undefined };
          if (paneId) existing.preferredPaneId ??= paneId;
          floatDock.refresh(existing);
          previews.persistWindow(existing);
          notify();
          activatePreview(existing);
          return finish(true);
        }
        if (maximized && previewPaneFor(existing)?.host === 'dock') return finish(maximizeDockedPreview(existing));
        if (existing.window?.minimizedFromInline) {
          floatDock.restore(existing, { maximized, restoreToInline: false, minimizedFromInline: false });
        } else if (existing.window?.maximized !== maximized) floatDock.maximize(existing, maximized);
        return finish(movePreviewEntry(existing, true));
      }
      const entry = previews.record(presentedGroup, sessionId, newCollectionAddress());
      if (maximized || minimized) entry.window = { maximized, restoreToInline: fromInline && maximized,
        minimizedFromInline: minimized, dockOrder: minimized ? Date.now() : undefined };
      if (minimized) {
        entry.shortcut = { floating: preferences.get().fileDoubleClick === 'preview', displayed: false };
        floatDock.flyShortcut(entry, shortcutSource, 'shortcut');
        previews.pin(entry, target);
        entry.preferredPaneId = paneId;
        return finish(true);
      }
      entry.shortcut = { floating: true, displayed: true };
      placingPreview = true;
      try {
        if (!previews.open(entry, sessionId, target ? [target] : [], undefined, {
          floating: true, allowEmpty: !target, keepEmptyFloat: !target,
        })) {
          floatDock.cancelShortcutFlight(entry);
          return false;
        }
      } finally { placingPreview = false; }
      positionPreviewFloat(entry, undefined, true);
      previews.sync(presentedGroup, sessionId);
      if (fromInline) entry.preferredPaneId = paneId;
      finish(true);
      notify();
      rememberPresentation();
      return true;
    }

    function openInlinePreviewAs(view, file, root, mode, shortcutSource) {
      const { sessionId, paneId, tabId } = view.target ?? {};
      const minimized = mode === 'minimized';
      if (minimized && sessionId && sessionId === presentedSession && sessionId === sidebar.mounted.getSnapshot()) {
        const existing = findPreviewFile(sessionId, file);
        if (existing) {
          if (existing.unpinned) {
            floatDock.flyShortcut(existing, shortcutSource, 'shortcut');
            previews.setPinned(existing, true);
          } else if (floatDock.shortcutFlightState(existing) !== 'inline') {
            floatDock.retractShortcutToInline(existing, shortcutSource, () => {
              if (!previews.entries().includes(existing)) return;
              if (shortcutPresentation(existing)?.displayed
                  || (existing.tabId && existing.sessionId !== sidebar.mounted.getSnapshot())) {
                previews.setPinned(existing, false);
              } else closePreviewShortcut(existing);
            });
          }
          return true;
        }
      }
      const layout = sidebar.mountedSurface?.()?.layout;
      const splitPane = layout?.nodes[layout.rootId]?.kind === 'split' ? dockedPane(paneId) : undefined;
      if (mode === 'sidebar') {
        const target = normalizePreviewFile(view.withOrigin(file), root);
        return target && openPreviewTargets([target], sessionId, dockedPane(paneId));
      }
      const opened = openPreviewFloat(sessionId, { file: view.withOrigin(file), root, fromInline: true,
        paneId: splitPane, maximized: mode === 'maximized', minimized, shortcutSource });
      if (opened && minimized) sidebar.focus(tabId);
      return opened;
    }

    function openPreviewFiles(files, root, paneId, sessionId, address) {
      return openPreviewTargets(files.map(file => normalizePreviewFile(file, root)).filter(Boolean), sessionId, paneId, address);
    }

    function openPreviewTab(file, root, paneId, sessionId, address) {
      return openPreviewFiles([file], root, paneId, sessionId, address);
    }

    async function statFile(sessionId, file, signal) {
      try {
        const result = await scope.remote.workspaceFiles.stat(sessionId, file, signal);
        const absolute = localPath(result.ok && result.value.absolutePath);
        if (absolute) return { absolute, name: pathName(absolute), size: result.value.bytes };
      } catch { /* The built-in preview can report a failed session file lookup. */ }
    }

    function revealFile(view, file, line, surface) {
      const preview = [file.absolute, file.name, file.size, line, surface];
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
      return bindings.get(tabId) ?? activeView ?? viewList[0];
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

    function restoreMusicPreview(file, surface) {
      const entry = findPreviewFile(sidebar.mounted.getSnapshot(), file);
      if (entry) {
        if (!rebindShortcut(entry, entry.shortcut?.floating)) return false;
        activatePreview(entry);
        return true;
      }
      const owner = inlineMediaOwners(file).find(({ item }) => item.surface === surface);
      return revealInExplorer(file, owner?.view);
    }

    function returnPreviewToBrowser(entry, forceNew = false) {
      const item = entry.stack.tabs.find(tab => tab.id === entry.stack.active);
      if (!item || !entry.target) return;
      const { file } = item;
      const { sessionId, paneId } = entry.target;
      const source = !forceNew && [...bindings].find(([, view]) => file.origin && canReturnToBrowser(file, view));
      let view;
      if (source && filesIn(sessionId).some(tab => tab.tabId === source[0])) {
        view = source[1];
        sidebar.focus(source[0]);
        if (!sidebar.isExpanded() && !view.target?.isFloating) sidebar.toggleExpanded();
      } else view = openFolderTab(parentOf(file.absolute), dockedPane(paneId));
      if (!view) return;
      const inlineItem = view.inlinePreview?.item;
      if (viewPreviewOpen(view) && samePath(inlineItem?.file.absolute, file.absolute)
          && (!isPlaybackFile(file.name) || inlineItem.surface === item.surface)) {
        previews.close(entry, item.id);
        return;
      }
      // Retain the standalone render until the receiving explorer has attached the same surface.
      entry.returningTo = view;
      revealFile(view, file, file.line, item.surface);
      if (!item.surface) previews.close(entry, item.id);
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

    async function validateRestoredFiles(entry, target, signal) {
      const original = entry.stack.tabs;
      const results = await Promise.all(original.map(async tab => {
        try {
          const found = await disks.locate(tab.file.absolute, signal, tab.root);
          return found.type !== 'file' ? tab : undefined;
        } catch (error) { return error.status === 404 ? tab : undefined; }
      }));
      if (signal.aborted || entry.target !== target) return;
      entry.checkFiles = false;
      const missing = new Set(results.filter(tab => tab && entry.stack.tabs.includes(tab)).map(tab => tab.id));
      previews.remove(entry, missing);
    }

    function StandalonePreview({ sessionId, useTabInfo }) {
      const { tab, panel } = useTabInfo();
      const address = tab.navigation.address;
      const host = react.useRef(null);
      const entry = react.useSyncExternalStore(subscribe, () => sessionId === presentedSession && isCollectionAddress(address)
        ? previews.entries().find(item => item.group === presentedGroup && item.address === collectionKey(address)) : null);
      const dockSelected = react.useSyncExternalStore(subscribe, () => Boolean(entry?.dockSelected));
      react.useLayoutEffect(() => {
        if (!tab.visible || !entry || (!panel.isFloating && !dockSelected)) return;
        entry.host ??= document.createElement('div');
        entry.host.className = 'dwe-host';
        const destination = host.current;
        const target = { sessionId, address, paneId: panel.id, floating: panel.isFloating, tabId: tab.id };
        entry.target = target;
        movePreview(entry.host, destination);
        const float = target.floating ? destination.closest('[data-dockkit-float]') : null;
        const header = float?.querySelector('[data-dockkit-float-grip]');
        const windowClose = header?.querySelector(':scope > [data-dockkit-float-close]');
        const markClosed = () => { entry.explicitClose = true; };
        let disconnectFloat;
        let controls;
        function blockMaximizedDrag(event) {
          if (float.hasAttribute('data-dwe-float-maximized')
              && !event.target.closest?.('button')) event.stopPropagation();
        }
        if (header) {
          controls = document.createElement('div');
          controls.className = 'dwe-preview-float-controls';
          controls.dataset.windowDragExclude = '';
          header.insertBefore(controls, windowClose);
          windowClose?.addEventListener('click', markClosed, true);
          header.addEventListener('pointerdown', blockMaximizedDrag);
          entry.floatControls = controls;
          entry.floatTitle = header.querySelector('[data-dockkit-float-title]');
          if (entry.needsOpen) entry.window = { ...entry.window, dockOrder: entry.window?.dockOrder ?? Date.now() };
          disconnectFloat = floatDock.connect(entry, float);
        }
        if (!target.floating) sidebarWidth?.initialize();
        notify();
        capturePresentation(sessionId);
        return () => {
          disconnectFloat?.();
          header?.removeEventListener('pointerdown', blockMaximizedDrag);
          windowClose?.removeEventListener('click', markClosed, true);
          controls?.remove();
          if (header?.contains(entry.floatTitle)) entry.floatTitle = undefined;
          if (entry.host.parentNode === destination && parking.isConnected) movePreview(entry.host, parking);
          if (entry.target === target) entry.target = undefined;
          notify();
          capturePresentation(sessionId);
        };
      }, [tab.visible, tab.id, address, panel.id, panel.isFloating, sessionId, entry, dockSelected]);
      return h('div', { ref: host, className: 'dwe-host' });
    }

    function surfaceFor(item) {
      if (!item.surface) {
        const host = document.createElement('div');
        host.className = 'dwe-preview-surface';
        item.surface = { host, key: crypto.randomUUID(), openedAt: Date.now(),
          pdfPosition: item.pdfPosition ?? (/\.pdf$/i.test(item.file.name) ? {} : undefined) };
      }
      return item.surface;
    }

    function standaloneSurfaceFor(entry, item) {
      return item.surface ?? (!entry.tabId || entry.needsOpen || entry.window?.minimizedFromInline ? undefined : surfaceFor(item));
    }

    function renewAgedPreview(entry, now = Date.now()) {
      previews.renewSurface(entry, ({ file, surface }) => {
        if (!surface || now - surface.openedAt < idlePreviewRefreshAfter) return false;
        const extension = file.name.split('.').at(-1).toLowerCase();
        return extension === 'pdf' || officeExtensions.has(extension) || thumbnailType(file.name)?.startsWith('image/');
      });
    }

    function parkSurface(surface) {
      const { width, height } = surface.host.getBoundingClientRect();
      if (width && height) {
        surface.host.style.setProperty('--dwe-parked-width', width + 'px');
        surface.host.style.setProperty('--dwe-parked-height', height + 'px');
      }
      movePreview(surface.host, surfaceParking);
    }

    function prepareShortcutLoad(entry) {
      const item = entry.stack.tabs.find(tab => tab.id === entry.stack.active);
      if (!item) return;
      const surface = surfaceFor(item);
      let resolve;
      let barrier;
      let start;
      if (!surface.ready) {
        barrier = new Promise(done => { resolve = done; });
        surface.presentation = barrier;
        previewSurfacesRevision++;
        // Give the drop handler a chance to submit the compositor animation first.
        start = setTimeout(() => notify(false), 0);
      }
      let transfer;
      return {
        park() {
          if (!surfaceParking.isConnected || !surface.host.isConnected || surface.host.parentNode === surfaceParking) return;
          transfer = { surface };
          entry.shortcutTransfer = transfer;
          parkSurface(surface);
          notify(false);
        },
        finish() {
          clearTimeout(start);
          if (barrier && surface.presentation === barrier) surface.presentation = undefined;
          if (transfer && entry.shortcutTransfer === transfer) {
            entry.shortcutTransfer = undefined;
            notify(false);
          }
          resolve?.();
        },
      };
    }

    function PreviewSurfaces({ views }) {
      react.useSyncExternalStore(subscribe, () => previewSurfacesRevision);
      react.useSyncExternalStore(subscribe, previews.revision);
      const entries = react.useSyncExternalStore(subscribe, previews.entries);
      const surfaces = new Map();
      for (const entry of entries) {
        for (const item of entry.stack.tabs) {
          if (item.surface || (!entry.stack.suspended && item.id === entry.stack.active)) {
            const surface = standaloneSurfaceFor(entry, item);
            if (surface) surfaces.set(surface, { entry, item });
          }
        }
      }
      for (const view of views) {
        const inline = view.inlinePreview;
        if (!inline) continue;
        const surface = inline.item.surface;
        if (!surfaces.has(surface) || surfaces.get(surface).entry?.returningTo === view) {
          surfaces.set(surface, { item: inline.item, inline });
        }
      }
      return [...surfaces].map(([surface, props]) => h(PreviewSurface, { ...props, key: surface.key, surface }));
    }

    function PreviewSurface({ surface, item, inline }) {
      react.useLayoutEffect(() => () => surface.host.remove(), [surface]);
      const beforePresent = react.useCallback(async () => {
        while (surface.presentation) await surface.presentation;
      }, [surface]);
      const onReady = react.useCallback(() => {
        if (surface.ready) return;
        surface.ready = true;
        notify();
      }, [surface]);
      const mediaSource = react.useRef();
      const { file } = item;
      const root = inline ? inline.root : item.root;
      const media = isPlaybackFile(file.name);
      const key = media ? pathKey(localPath(file.absolute)) ?? file.absolute : file.absolute;
      // Moving to a different preview can change its scope without changing the open media.
      if (media && mediaSource.current?.key !== key) mediaSource.current = { key, file, root };
      const source = media ? mediaSource.current : { file, root };
      return reactDom.createPortal(h(PreviewBoundary, { key, standalone: !inline, onReady },
        h(Preview, {
          file: source.file, root: source.root, openImmediately: !inline, confirmed: !inline || item.confirmed, sendQuote, pdfPosition: surface.pdfPosition,
          onConfirm: inline?.onConfirm, beforePresent, onReady,
          onRestore: () => restoreMusicPreview(file, surface),
        })), surface.host);
    }

    function PreviewTitle({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo();
      const file = react.useSyncExternalStore(subscribe, () => previews.entries().find(entry =>
        entry.sessionId === sessionId && entry.tabId === tab.id)?.stack.tabs[0]?.file);
      return h(FilePreviewTitle, { file });
    }

    function PreviewPresentation({ entry }) {
      const stack = react.useSyncExternalStore(subscribe, () => entry.stack);
      const target = react.useSyncExternalStore(subscribe, () => entry.target);
      const needsOpen = react.useSyncExternalStore(subscribe, () => Boolean(entry.needsOpen));
      const transfer = react.useSyncExternalStore(subscribe, () => entry.shortcutTransfer);
      const ready = react.useSyncExternalStore(subscribe, () => Boolean(entry.stack.tabs.find(tab => tab.id === entry.stack.active)?.surface?.ready));
      const labelInFlight = react.useSyncExternalStore(floatDock.subscribe, () => floatDock.shortcutFlightState(entry) === 'sidebar');
      react.useEffect(() => {
        if (!target || needsOpen || !entry.checkFiles) return;
        const controller = new AbortController();
        void validateRestoredFiles(entry, target, controller.signal);
        return () => controller.abort();
      }, [entry, target, needsOpen]);
      if (!entry.host) return null;
      const { sessionId, paneId, floating, address } = target ?? {};
      const returnInline = forceNew => returnPreviewToBrowser(entry, forceNew);
      const openFloat = () => openSmallPreview(entry);
      return h(react.Fragment, null, floating && h(PreviewFloatControls, { dock: floatDock, entry,
        dockFile: () => movePreviewEntry(entry, false), openFloat, returnInline }),
        reactDom.createPortal(h(FilePreviewTab, {
        sessionId, address, paneId, visible: Boolean(target), floating, floatTitle: entry.floatTitle,
        stack, ready: ready && !transfer, preferences, openLocal, parkSurface, labelInFlight,
        surfaceFor: item => transfer && item.surface === transfer.surface ? undefined : standaloneSurfaceFor(entry, item), openFloat, returnInline,
        minimizeSidebar: () => minimizeDockedPreview(entry),
        maximizeSidebar: () => maximizeDockedPreview(entry),
        closeSidebar: () => closePreviewShortcut(entry),
        renamed: updateRenamedPath,
        send: (items, mode, root) => sendComposerFiles(sessionId, getInput, items, mode, root),
        startPreviewDrag: (source, file, pointer) => {
          const dock = beginNativePreviewDockDrag(source, entry.tabId, pointer);
          const reference = beginPreviewTabDrag(sessionId,
            () => insertPaths(getInput(sessionId), [{ path: file.absolute, name: file.name }]));
          return {
            move: reference.move,
            finish(x, y) {
              if (dock?.finish(x, y)) {
                entry.dockSelected = true;
                reference.cancel();
                notify();
                capturePresentation(sessionId);
              } else reference.finish(x, y);
            },
            cancel() { dock?.cancel(); reference.cancel(); },
          };
        },
        openNative: (file, root) => openNativePreview(file, root, target, () => entry.target === target, openDocument),
      }), entry.host));
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

    async function openConversationFile(request, signal, onUnavailable, destination) {
      const { address, sessionId, file, params } = request;
      const metadata = await statFile(sessionId, file, signal);
      if (signal.aborted || sidebar.mounted.getSnapshot() !== sessionId) return;
      if (!metadata) {
        if (onUnavailable) onUnavailable();
        else openDocument(address, { params });
        return;
      }
      const preview = { ...metadata, line: params?.line };
      if (destination) openPreviewTab(preview, null, destination.paneId, sessionId, destination.address);
      else showConversationFile(preview, sessionId);
    }

    function installFileOpener() {
      const openResource = sidebar.openResource;
      let fileClick;
      const pending = new Set();
      let dragSource;
      let openingReview = false;
      function openFile(request, onUnavailable, destination) {
        const controller = new AbortController();
        if (!destination && preferences.get().conversationFileView !== 'full') {
          fileClick?.abort();
          fileClick = controller;
        }
        pending.add(controller);
        void openConversationFile(request, controller.signal, onUnavailable, destination)
          .finally(() => pending.delete(controller));
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
        const absolute = localPath(description.textContent);
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
      const stopDrop = installConversationDrop(sidebar.mounted, readDragSource, (request, paneId, previewAddress) => {
        const { sessionId, review } = request;
        if (sidebar.mounted.getSnapshot() !== sessionId) return;
        if (review) sidebar.openResource(review.address, { paneId: dockedPane(paneId), params: review.params });
        else openFile(request, () => openDocument(request.address, { paneId, params: request.params }),
          { paneId, address: previewAddress });
      });
      document.addEventListener('click', clickChangedFile, true);
      const cancel = () => {
        for (const controller of pending) controller.abort();
        pending.clear();
      };
      const stop = sidebar.mounted.subscribe(cancel);
      return () => {
        document.removeEventListener('click', clickChangedFile, true);
        stopDrop();
        stop();
        cancel();
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
      previews.removePaths(moved);
      const changed = new Set(paths.map(pathKey));
      for (const view of viewList) {
        if (view.path && (changed.has(pathKey(view.path)) || moved.some(root => underPath(view.path, root)))) {
          view.fileActions?.refresh();
        }
      }
    }

    function updateRenamedPath(from, to) {
      if (from === to) return;
      renameFavorites(from, to);
      previews.rename(from, to);
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
        movePreview(view.host, element);
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
          if (view.host.parentNode === element && parking.isConnected) movePreview(view.host, parking);
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
      const sessionId = target?.sessionId;
      const favoritesDisplay = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().favoritesDisplay);
      const workspaceButtonDisplay = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().workspaceButtonDisplay);
      return reactDom.createPortal(h(Explorer, {
        sessionId, cwd, followWorkspace, saved: view.saved,
        initialPath: view.initialPath, initialWorkspaceRoot: view.initialWorkspaceRoot, initialPreviewOpen: view.initialPreviewOpen,
        favoritesDisplay, workspaceButtonDisplay, preferences,
        getTarget: view.getTarget, bindFileActions: view.bindFileActions,
        onPath: view.onPath, openLocal, openDocument, openFolderTab, refreshDirectories, updateRenamedPath, getInput,
        previewPane: view.previewPane, saveLayout: view.save,
        surfaceFor, parkSurface, bindInlinePreview: view.bindInlinePreview,
        subscribePreviewShortcuts: subscribe,
        previewShortcutStatus: file => {
          const entry = findPreviewFile(sessionId, file);
          if (entry) return entry.unpinned ? 'unpinned' : 'pinned';
        },
        claimInlineMedia: file => claimInlineMedia(view, file),
        openInlinePreviewAs: (file, root, mode, source) => openInlinePreviewAs(view, file, root, mode, source),
        openPreviewFiles: view.openPreviewFiles,
        promotePreview: (file, root) => view.openPreviewFiles([file], root, target?.paneId, sessionId),
        floatPreview: (file, root) => openPreviewFloat(sessionId, { file: view.withOrigin(file), root }),
        fullscreenPreview: (file, root) => openPreviewFloat(sessionId, { file: view.withOrigin(file), root, maximized: true }),
      }), view.host);
    }

    function installGuideComputerShortcut() {
      const cards = new Map();
      const selector = 'div[data-sidebar-right-guide-entry="' + tabKind + '"]:not(.dwe-guide-entry)';
      let frame;

      function openDisks(card) {
        const paneId = card.closest('[data-dockkit-pane], [data-dockkit-float]');
        const id = paneId?.dataset.dockkitPane ?? paneId?.dataset.dockkitFloat;
        const owner = card.closest('[data-sidebar-right-session]');
        if (!id || owner?.dataset.sidebarRightSession !== sidebar.mounted.getSnapshot()) return;
        const layout = sidebar.mountedSurface?.()?.layout;
        const tabId = layout?.nodes[id]?.activeTabId;
        const tab = layout?.tabs[tabId];
        if (tab?.kind !== 'guide') return;
        if (tab.navigation?.params?.dweAddedFromPlus) guidePreviewOpen = preferences.get().newTabPreviewOpen;
        try {
          sidebar.openResource(computerPrefix + crypto.randomUUID(), { kind: tabKind, paneId: id, replaceTab: tabId });
          syncTabs();
        } finally {
          guidePreviewOpen = undefined;
        }
      }

      function sync() {
        frame = undefined;
        for (const [card, button] of cards) {
          if (card.isConnected && button.parentNode === card) continue;
          button.remove();
          cards.delete(card);
        }
        for (const card of document.querySelectorAll(selector)) {
          if (cards.has(card) || !card.querySelector(':scope > button')) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.title = '打开' + localHomeLabel;
          button.setAttribute('aria-label', button.title);
          button.className = 'dwe-guide-compat-computer';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', myPcIconViewBox);
          svg.setAttribute('width', String(26 * myPcIconRatio));
          svg.setAttribute('height', '26');
          svg.setAttribute('aria-hidden', 'true');
          svg.innerHTML = myPcIconMarkup;
          button.append(svg);
          button.addEventListener('click', event => {
            event.stopPropagation();
            openDisks(card);
          });
          cards.set(card, button);
          card.append(button);
        }
      }

      const observer = new MutationObserver(records => {
        if (frame !== undefined || !records.some(({ target, addedNodes, removedNodes }) =>
          target instanceof Element && (target.matches(selector) || [...addedNodes, ...removedNodes].some(node =>
            node instanceof Element && (node.matches(selector) || node.querySelector(selector)))))) return;
        frame = requestAnimationFrame(sync);
      });
      observer.observe(document.body, { subtree: true, childList: true });
      sync();
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        for (const button of cards.values()) button.remove();
      };
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
        h('button', { type: 'button', className: 'dwe-guide-computer', title: '打开' + localHomeLabel,
          'aria-label': '打开' + localHomeLabel,
          onClick: () => openFromGuide(() => sidebar.openResource(computerPrefix + crypto.randomUUID(), {
            kind: tabKind, paneId: panel.id, replaceTab: tab.id,
          })),
        }, h(CardIcon, { computer: true })));
    }

    function Keeper({ useSessions }) {
      const sessionId = react.useSyncExternalStore(sidebar.mounted.subscribe, sidebar.mounted.getSnapshot);
      react.useSyncExternalStore(sidebar.openTabs.subscribe, sidebar.openTabs.getSnapshot);
      react.useSyncExternalStore(floatDock.subscribe, floatDock.getSnapshot);
      react.useSyncExternalStore(subscribe, () => previews.entries().filter(entry => entry.group === presentedGroup)
        .map(entry => {
          const current = shortcutPresentation(entry) ?? entry.shortcut;
          return current ? String(Number(current.floating)) + Number(current.displayed) : '';
        }).join(','));
      const currentViews = react.useSyncExternalStore(subscribe, () => viewList);
      const entries = react.useSyncExternalStore(subscribe, previews.entries);
      const currentGroup = react.useSyncExternalStore(subscribe, () => presentedGroup);
      const currentWorkspace = react.useSyncExternalStore(subscribe, () => workspace);
      const cwd = useSessions(state => sessionId ? state.byId[sessionId]?.cwd : undefined);
      const tabScope = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().tabScope);
      const inlineShortcutWindow = react.useSyncExternalStore(preferences.subscribe, () => preferences.get().fileDoubleClick === 'preview');
      const followsWorkspace = currentGroup !== undefined && currentGroup !== 'global';
      // A departing group must finish with its own workspace before the incoming views mount.
      const viewCwd = sessionId === presentedSession && browseGroup(tabScope, sessionId, localPath(cwd)) === currentGroup
        ? cwd : currentWorkspace;
      react.useLayoutEffect(() => {
        if (sessionId && sidebar.mounted.getSnapshot() === sessionId) present(sessionId, cwd, tabScope);
      }, [sessionId, cwd, tabScope]);
      const shortcuts = currentGroup === undefined ? [] : entries
        .filter(entry => entry.group === currentGroup && entry.stack.tabs.length && !entry.unpinned)
        .map(entry => ({ entry, ...(shortcutPresentation(entry) ?? entry.shortcut) }));
      react.useLayoutEffect(() => {
        for (const { entry, floating, displayed } of shortcuts) {
          if (floating !== undefined) entry.shortcut = { floating, displayed };
        }
      }, [shortcuts]);
      const views = [...new Set([...currentViews, ...[...inactiveGroups.values()].flatMap(group => group.viewList)])];
      return h(react.Fragment, null, h(MusicCapsule, { sessionId }),
        h(PreviewFloatDock, { dock: floatDock, host: floatDockHost, shortcuts, activate: togglePreview, inlineShortcutWindow,
          getSessionId: sidebar.mounted.getSnapshot, drop: openShortcutAt, getDropPreview: getShortcutDropPreview, prepareShortcutLoad,
          move: (entry, floating) => openShortcutAt(entry, { mode: floating ? 'window' : 'sidebar' }),
          openEmpty: sessionId ? () => openPreviewFloat(sessionId) : undefined }),
        h(HiddenPreviewTabs, { tabs: previews.find(sessionId), guides: protectedGuides(sidebar.mountedSurface()?.layout) }),
        views.map(view =>
          h(View, { key: view.address, view,
            cwd: currentViews.includes(view) ? viewCwd : view.lastWorkspace,
            followWorkspace: currentViews.includes(view) && followsWorkspace })),
        entries.map(entry => h(PreviewPresentation, { key: entry.key, entry })), h(PreviewSurfaces, { views }));
    }

    scope.effect(() => {
      const style = document.createElement('style');
      style.dataset.dshWorkspaceExplorer = '';
      style.textContent = explorerCss;
      document.head.appendChild(style);
      document.body.append(parking, surfaceParking);
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
      const disposeGuideComputer = installGuideComputerShortcut();
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
      const disposeSidebarRecovery = installEmptySidebarRecovery(sidebar, () => projecting || detached);
      const disposeSidebarFade = installSidebarFade(sidebar);
      const disposeSidebarTabInteractions = installSidebarTabInteractions(sidebar.mounted, preferences);
      const disposeSidebarHeaderControls = installSidebarHeaderControls(sidebar, preferences, floatDockHost);
      const disposeFloatQuickMinimize = floatDock.installQuickMinimize(() => preferences.get().quickFloatMinimize);
      const disposeExtensions = installExtensionEffects(preferences);
      const disposeTabs = sidebar.openTabs.subscribe(syncTabs);
      const disposeDesktopDrop = installDesktopPreviewDrop(sidebar.mounted, openPreviewFiles);
      const disposeSwitch = sidebar.mounted.subscribe(closeDepartingTabs);
      const snapshotAfterResize = () => queueMicrotask(rememberPresentation);
      let lastActivity = Date.now();
      function refreshIdlePreviews(now = Date.now()) {
        if (document.visibilityState === 'hidden' || now - lastActivity < idlePreviewRefreshAfter) return;
        for (const entry of previews.entries()) {
          if (shortcutPresentation(entry)?.displayed) renewAgedPreview(entry, now);
        }
      }
      function resumePreviews() {
        if (document.visibilityState === 'hidden') return;
        const now = Date.now();
        refreshIdlePreviews(now);
        lastActivity = now;
      }
      const previewRefreshTimer = setInterval(refreshIdlePreviews, 60_000);
      window.addEventListener('pointerup', snapshotAfterResize);
      window.addEventListener('pointerdown', resumePreviews, true);
      window.addEventListener('wheel', resumePreviews, { capture: true, passive: true });
      window.addEventListener('focus', resumePreviews);
      document.addEventListener('visibilitychange', resumePreviews);
      window.addEventListener('pagehide', saveLayout);
      return () => {
        stopMusic();
        disposeFileOpener();
        disposeAddTabOrigin();
        disposeGuideComputer();
        disposeConversationPathDrop();
        disposePreferences();
        disposeMouseGestures?.();
        window.removeEventListener('storage', preferences.onStorage);
        disposeMotion();
        disposeSidebarClose();
        disposeSidebarRecovery();
        disposeSidebarFade();
        disposeSidebarTabInteractions();
        disposeSidebarHeaderControls();
        disposeFloatQuickMinimize();
        floatDock.clearShortcutFlights();
        floatDockHost.remove();
        disposeExtensions();
        disposeTabs();
        disposeDesktopDrop();
        window.removeEventListener('pointerup', snapshotAfterResize);
        window.removeEventListener('pointerdown', resumePreviews, true);
        window.removeEventListener('wheel', resumePreviews, true);
        window.removeEventListener('focus', resumePreviews);
        document.removeEventListener('visibilitychange', resumePreviews);
        window.removeEventListener('pagehide', saveLayout);
        clearTimeout(saveTimer);
        clearInterval(previewRefreshTimer);
        disposeSwitch();
        detached = false;
        finishHandoff();
        document.removeEventListener('wheel', wheel, true);
        parking.remove();
        surfaceParking.remove();
        style.remove();
      };
    });
    scope.inject(['layout'], layoutScope => {
      layoutScope.effect(() => {
        const width = installSidebarWidth(layoutScope.layout, document, preferences, () => presentedGroup);
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
      ['sidebar.right.pane.tab', PREVIEW_KIND, StandalonePreview],
      ['sidebar.right.pane.tab.title', PREVIEW_KIND, PreviewTitle],
      ['sidebar.right.pane.tab', PREVIEW_WINDOW_KIND, StandalonePreview],
      ['sidebar.right.pane.tab.title', PREVIEW_WINDOW_KIND, PreviewTitle],
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
      id: PREVIEW_KIND, kind: PREVIEW_KIND, priority: 'extension', multiple: true, title: () => '文件预览',
    }));
    scope.effect(() => scope.sidebarRightTabs.register({
      id: PREVIEW_WINDOW_KIND, kind: PREVIEW_WINDOW_KIND, priority: 'extension', title: () => '文件预览',
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
