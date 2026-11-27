import { usePreviewFileMenu } from './preview-file-menu.js';
import { isWindowsBatch, joinPath, localPath, move, parentOf, pathKey, pathName, renamePath, resourceAddress, samePath, underPath, visit } from './navigation.js';
import { fileManagerLabel, isMac, localHomeLabel, pathPlaceholder, selectionModifier, trashLabel } from './platform.js';
import { isPlaybackFile, movePreview, openNativePreview } from './preview-surface.js';
import { formatSize } from './file-size.js';
import { disks } from './workspace.js';
import { useComposerDrop } from './composer-drop.js';
import { Thumbnail } from './thumbnail.js';
import { DeleteDialog, FileMenu, RenameDialog } from './file-menu.js';
import { Favorites, toggleFavorite, useFavorites } from './favorites.js';
import { headerBackdrop, PreviewFileLabel } from './preview-tabs.js';
import { icon } from './interface-icon.js';
import { fileIcon } from './file-icon.js';
import { audioType } from '../audio-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { confirmStackPreview, emptyPreviewStack, openInlinePreview, previewInScope, removeStackPreviews } from './preview-stack.js';
import { PreviewWindowButtons } from './preview-float-dock.js';
import { ExtensionButtons, folderExtensionContext, IconButton, PreviewExtensionButtons } from './extension-controls.js';
import { extensionAreas } from '../extensions/registry.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useCallback, useSyncExternalStore } = react;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function tool(name, label, onClick, disabled = false, pressed) {
  return h(IconButton, { name: name === 'star' && pressed ? 'star-on' : name === 'preview' ? 'preview-pane' : name, label, onClick, disabled, pressed, toolId: name });
}

function compareEntries(a, b) {
  return Number(b.type === 'directory') - Number(a.type === 'directory') || collator.compare(a.name, b.name);
}

function compareModified(a, b) {
  const first = a.modifiedAt ?? -Infinity;
  const second = b.modifiedAt ?? -Infinity;
  return first === second ? 0 : second - first;
}

function canModify(entry) {
  return entry?.type === 'file' || entry?.type === 'directory';
}

const emptySelection = { names: new Set(), anchor: null };
const singleSelection = name => ({ names: new Set([name]), anchor: name });

function selectNames(current, name, entries, shift, ctrl) {
  if (shift) {
    const anchor = entries.findIndex(entry => entry.name === current.anchor);
    const target = entries.findIndex(entry => entry.name === name);
    if (anchor < 0 || target < 0) return singleSelection(name);
    const names = new Set(ctrl ? current.names : []);
    for (const entry of entries.slice(Math.min(anchor, target), Math.max(anchor, target) + 1)) {
      if (entry.type !== 'other') names.add(entry.name);
    }
    return { names, anchor: current.anchor };
  }
  if (!ctrl) return singleSelection(name);
  const names = new Set(current.names);
  if (!names.delete(name)) names.add(name);
  return { names, anchor: name };
}

function entryType(entry) {
  if (entry.type === 'drive') return '磁盘';
  if (entry.type === 'directory') return '文件夹';
  if (entry.type !== 'file') return '其他';
  const dot = entry.name.lastIndexOf('.');
  return dot > 0 && dot < entry.name.length - 1 ? entry.name.slice(dot + 1).toUpperCase() + ' 文件' : '文件';
}

function Breadcrumb({ path, navigate, dragFolder, showPathMenu, workspaceMode, root }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    const end = () => Math.max(0, node.scrollWidth - node.clientWidth);
    let previousEnd = end();
    node.scrollLeft = previousEnd;
    const resize = new ResizeObserver(() => {
      const nextEnd = end();
      if (node.scrollLeft >= Math.min(previousEnd, nextEnd) - 1) node.scrollLeft = nextEnd;
      previousEnd = nextEnd;
    });
    resize.observe(node);
    return () => resize.disconnect();
  }, [path, root]);
  const crumbs = [];
  for (let item = path; item && !samePath(item, root); item = parentOf(item)) crumbs.unshift(item);
  const baseLabel = root ? pathName(root) : workspaceMode ? '工作区不可用' : localHomeLabel;
  return h('nav', {
    ref, className: 'dwe-path', 'aria-label': '当前文件夹路径', title: path ?? baseLabel,
  },
  h('button', {
    type: 'button', onClick: () => navigate(root), 'aria-current': crumbs.length === 0 ? 'location' : undefined,
    disabled: workspaceMode && !root,
    onContextMenu: root ? event => showPathMenu(event, root) : undefined,
    draggable: Boolean(root), onDragStart: root ? event => dragFolder(event, root) : undefined,
  }, root ? fileIcon('', 'directory') : icon('drive'), baseLabel),
  ...crumbs.map(destination => h('span', { key: destination, className: 'dwe-crumb' },
    icon('chevron', 16),
    h('button', {
      type: 'button', onClick: () => navigate(destination), title: destination,
      onContextMenu: event => showPathMenu(event, destination),
      draggable: true, onDragStart: event => dragFolder(event, destination),
      'aria-current': destination === path ? 'location' : undefined,
    }, pathName(destination)))));
}

const firstPath = path => ({ paths: [path], index: 0 });

function readViewMode(key) {
  try { return localStorage.getItem(key) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
}

const sortListeners = new Set();
const temporarySortModes = new Map();

function subscribeSortMode(listener) {
  sortListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    sortListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readSortMode(key) {
  if (!key) return false;
  if (temporarySortModes.has(key)) return temporarySortModes.get(key);
  try { return localStorage.getItem(key) === 'modified'; } catch { return false; }
}

function changeSortMode(key, byModified) {
  try {
    if (byModified) localStorage.setItem(key, 'modified');
    else localStorage.removeItem(key);
    temporarySortModes.delete(key);
  } catch {
    temporarySortModes.set(key, byModified);
  }
  for (const listener of sortListeners) listener();
}

const splitMin = 0.16;
const splitMax = 0.86;
const clampSplit = ratio => Math.min(splitMax, Math.max(splitMin, ratio));
const splitPreference = 'dsh-workspace-explorer:preview-split';
const splitListeners = new Set();
let sharedSplit = 0.55;
try {
  const saved = localStorage.getItem(splitPreference);
  if (saved?.trim() && Number.isFinite(Number(saved))) sharedSplit = clampSplit(Number(saved));
} catch { /* Use the default if storage is unavailable. */ }

function subscribeSplit(listener) {
  splitListeners.add(listener);
  return () => splitListeners.delete(listener);
}

function getSplitRatio() { return sharedSplit; }

function setSplitRatio(value) {
  const next = typeof value === 'function' ? value(sharedSplit) : value;
  if (next === sharedSplit) return;
  sharedSplit = next;
  for (const listener of splitListeners) listener();
}

function saveSplitRatio() {
  try { localStorage.setItem(splitPreference, String(sharedSplit)); }
  catch { /* Open tabs still share the current value. */ }
}

function PreviewDivider({ root, ratio, setRatio }) {
  const endDrag = useRef(null);
  useEffect(() => () => endDrag.current?.(), []);
  return h('div', {
    className: 'dwe-divider', role: 'separator', tabIndex: 0,
    'aria-label': '调整文件预览分栏高度', 'aria-orientation': 'horizontal',
    'aria-valuemin': splitMin * 100, 'aria-valuemax': splitMax * 100,
    'aria-valuenow': Math.round(ratio * 100),
    onPointerDown: event => {
      if (event.button !== 0 || endDrag.current) return;
      event.preventDefault();
      const dividerBounds = event.currentTarget.getBoundingClientRect();
      const grabOffset = event.clientY - (dividerBounds.top + dividerBounds.height / 2);
      const pointer = event.pointerId;
      const lifetime = new AbortController();
      const options = { capture: true, signal: lifetime.signal };
      function move(next) {
        if (next.pointerId !== pointer) return;
        if (!(next.buttons & 1)) { finish(); return; }
        const bounds = root.current?.getBoundingClientRect();
        if (bounds?.height) setRatio(clampSplit((next.clientY - bounds.top - grabOffset) / bounds.height));
      }
      function finish(next) {
        if (next?.pointerId !== undefined && next.pointerId !== pointer) return;
        lifetime.abort();
        endDrag.current = null;
        saveSplitRatio();
      }
      endDrag.current = finish;
      window.addEventListener('pointermove', move, options);
      window.addEventListener('pointerup', finish, options);
      window.addEventListener('pointercancel', finish, options);
      window.addEventListener('blur', finish, options);
    },
    onKeyDown: event => {
      if (event.key === 'ArrowUp') setRatio(value => clampSplit(value - 0.05));
      else if (event.key === 'ArrowDown') setRatio(value => clampSplit(value + 0.05));
      else if (event.key === 'Home') setRatio(splitMin);
      else if (event.key === 'End') setRatio(splitMax);
      else return;
      saveSplitRatio();
      event.preventDefault();
      event.stopPropagation();
    },
  });
}

export function Explorer({
  cwd, sessionId, followWorkspace, saved, initialPath, initialWorkspaceRoot, initialPreviewOpen, favoritesDisplay,
  workspaceButtonDisplay, bindFileActions, getTarget, onPath, openLocal,
  openDocument, openFolderTab,
  openPreviewFiles, refreshDirectories, updateRenamedPath, getInput,
  preferences, previewPane, promotePreview, floatPreview, fullscreenPreview, saveLayout,
  surfaceFor, parkSurface, bindInlinePreview, openInlinePreviewAs, subscribePreviewShortcuts, previewShortcutStatus, claimInlineMedia,
}) {
  const workspace = localPath(cwd);
  const [localHistory, setLocalHistory] = useState(() => saved.state?.localHistory
    ?? firstPath(initialPath === undefined ? workspace : initialPath));
  const [scoped, setScoped] = useState(() => {
    if (saved.state?.scoped !== undefined) return saved.state.scoped;
    return initialWorkspaceRoot ? { root: initialWorkspaceRoot, history: firstPath(initialPath ?? initialWorkspaceRoot) } : null;
  });
  const workspaceMode = scoped !== null;
  const root = scoped?.root ?? null;
  const history = scoped?.history ?? localHistory;
  const changeHistory = useCallback(change => {
    if (workspaceMode) setScoped(current => current && { ...current, history: change(current.history) });
    else setLocalHistory(change);
  }, [workspaceMode]);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState(null);
  const [selection, setSelection] = useState(() => saved.state?.selection ?? emptySelection);
  const [previewStack, setPreviewStack] = useState(() => saved.state?.previewStack ?? emptyPreviewStack);
  const [previewOpen, setPreviewOpen] = useState(() => saved.state?.previewOpen ?? initialPreviewOpen);
  const dockedPreview = previewOpen;
  const previewMount = useRef(null);
  const [previewAnchor, setPreviewAnchor] = useState(null);
  useLayoutEffect(() => {
    if (dockedPreview && previewMount.current) movePreview(previewPane, previewMount.current);
    if (!previewOpen) previewPane.remove();
  });
  useLayoutEffect(() => () => previewPane.remove(), [previewPane]);
  const splitRatio = useSyncExternalStore(subscribeSplit, getSplitRatio);
  const [editor, setEditor] = useState(null);
  const [pathError, setPathError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [menu, setMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const favorites = useFavorites();
  const favoritesButton = useRef(null);
  const closeFavorites = useCallback(() => setFavoritesOpen(false), []);
  const { startDrag, startPreviewDrag, send: sendToComposer } = useComposerDrop(
    sessionId, openFolderTab, openPreviewFiles, setActionError, root, getInput,
  );
  const dragFolder = (event, path) => startDrag(event, [{ path, folder: true }], { folder: path });
  const [locating, setLocating] = useState(false);
  const [viewModes, setViewModes] = useState(() => new Map());
  const scroll = useRef(null);
  const layout = useRef(null);
  const input = useRef(null);
  const pathField = useRef(null);
  const pathRequest = useRef(null);
  const resultToReveal = useRef(null);
  const [search, setSearch] = useState(() => saved.state?.search ?? '');
  const [searchResult, setSearchResult] = useState(null);
  const term = root ? search.trim() : '';
  const path = history.paths[history.index];
  const folderLocation = useRef(null);
  useLayoutEffect(() => {
    folderLocation.current = { path, root };
    return () => { folderLocation.current = null; };
  }, [path, root]);
  const favorited = Boolean(path && favorites.some(folder => samePath(folder, path)));
  const viewKey = 'dsh-workspace-explorer.view:' + (path ?? 'home');
  const savedMode = react.useMemo(() => readViewMode(viewKey), [viewKey]);
  const grid = (viewModes.get(viewKey) ?? savedMode) === 'grid';
  const sortKey = path ? 'dsh-workspace-explorer.sort:' + pathKey(path) : null;
  const sortByModified = useSyncExternalStore(subscribeSortMode, () => readSortMode(sortKey));
  const ready = listing?.path === path && listing.root === root && listing.revision === revision ? listing : null;
  const entries = react.useMemo(() => [...(ready?.entries ?? [])].sort((a, b) =>
    (sortByModified ? compareModified(a, b) : 0) || compareEntries(a, b)), [ready, sortByModified]);
  const searchReady = searchResult?.root === root && searchResult.term === term && searchResult.revision === revision
    ? searchResult : null;
  const found = react.useMemo(() => searchReady?.matches ? {
    ...searchReady,
    matches: [...searchReady.matches].sort((a, b) =>
      (sortByModified ? compareModified(a, b) : 0) || collator.compare(a.name, b.name) || collator.compare(a.relative, b.relative)),
  } : searchReady, [searchReady, sortByModified]);
  const selectedPreview = previewStack.tabs.find(tab => previewInScope(tab, root));
  const shortcutStatus = useSyncExternalStore(subscribePreviewShortcuts,
    () => sessionId && selectedPreview ? previewShortcutStatus(selectedPreview.file) : undefined);
  const shortcutAdded = shortcutStatus === 'pinned';
  const activePreview = shortcutStatus && !selectedPreview.surface && isPlaybackFile(selectedPreview.file.name) ? undefined : selectedPreview;
  const shownPreview = activePreview?.file;
  const shownRoot = underPath(shownPreview?.absolute, root) ? root : null;
  const canPreview = shownPreview && sessionId;
  const preferredPreviewMode = useSyncExternalStore(preferences.subscribe, () => preferences.get().inlinePreviewAction);
  const inlineSurface = previewOpen && activePreview ? surfaceFor(activePreview) : null;
  const previewLabel = useRef(null);
  useLayoutEffect(() => {
    if (!inlineSurface || !previewAnchor) return;
    movePreview(inlineSurface.host, previewAnchor);
    return () => { if (inlineSurface.host.parentNode === previewAnchor) parkSurface(inlineSurface); };
  }, [inlineSurface, previewAnchor, parkSurface]);
  useLayoutEffect(() => {
    if (!inlineSurface) return;
    return bindInlinePreview({ item: activePreview, root: shownRoot,
      onConfirm: () => setPreviewStack(stack => confirmStackPreview(stack, activePreview.id, shownPreview)),
    });
  }, [inlineSurface, activePreview, shownPreview, shownRoot, bindInlinePreview]);
  const clearPreviewFile = useCallback(absolute => {
    setPreviewStack(stack => removeStackPreviews(stack, item => samePath(item.file.absolute, absolute), root));
  }, [root]);
  function closePreview() {
    clearPreviewFile(activePreview.file.absolute);
  }
  function openPreviewAs(mode) {
    openInlinePreviewAs(activePreview.file, shownRoot, mode, mode === 'minimized' ? previewLabel.current : undefined);
  }
  const mediaPreview = shownPreview && (audioType(shownPreview.name) || thumbnailType(shownPreview.name)?.startsWith('video/'));
  const selectedEntries = term ? [] : entries.filter(entry => selection.names.has(entry.name));
  const composerItems = entries => entries.map(entry => ({
    name: entry.name, path: entry.path ?? joinPath(path, entry.name), folder: entry.type !== 'file', size: entry.size,
  }));
  function dragEntries(entry) {
    return !term && selection.names.has(entry.name) ? selectedEntries : [entry];
  }
  const modifySelected = selectedEntries.length > 0 && selectedEntries.every(canModify) && !working;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const rename = useCallback((from, to) => {
    const rebase = value => {
      const paths = value.paths.map(path => renamePath(path, from, to));
      return paths.some((path, index) => path !== value.paths[index]) ? { ...value, paths } : value;
    };
    setLocalHistory(rebase);
    setScoped(value => value && underPath(from, value.root) && underPath(to, value.root)
      ? { ...value, history: rebase(value.history) } : value);
    setPreviewStack(stack => ({ ...stack, tabs: stack.tabs.map(tab => {
      const absolute = renamePath(tab.file.absolute, from, to);
      return absolute === tab.file.absolute ? tab : {
        ...tab, file: { ...tab.file, absolute, name: pathName(absolute), address: resourceAddress(absolute) },
      };
    }) }));
  }, []);
  const closeMenu = useCallback((restore = false) => {
    if (restore === true) menu?.focus?.focus({ preventScroll: true });
    setMenu(null);
  }, [menu]);

  useEffect(() => {
    if (sessionId) return;
    setMenu(null);
    setRenaming(null);
    setDeleting(null);
    closeFavorites();
  }, [sessionId, closeFavorites]);

  const closeEditor = useCallback(() => {
    pathRequest.current?.abort();
    pathRequest.current = null;
    setLocating(false);
    setEditor(null);
    setPathError('');
  }, []);

  const resetNavigation = useCallback(() => {
    closeEditor();
    resultToReveal.current = null;
    setSelection(emptySelection);
    setActionError('');
    setActionNotice('');
    setMenu(null);
    setSearch('');
  }, [closeEditor]);

  const navigate = useCallback(destination => {
    if (workspaceMode && !underPath(destination, root)) return;
    if (samePath(destination, path)) {
      closeEditor();
      setSearch('');
      return;
    }
    resetNavigation();
    changeHistory(value => visit(value, destination));
  }, [workspaceMode, root, closeEditor, path, resetNavigation, changeHistory]);

  function toggleWorkspaceMode() {
    if (!workspaceMode && !workspace) return;
    resetNavigation();
    setScoped(workspaceMode ? null : { root: workspace, history: firstPath(workspace) });
  }

  useLayoutEffect(() => {
    if (!followWorkspace || !workspaceMode || !workspace || samePath(root, workspace)) return;
    resetNavigation();
    setScoped({ root: workspace, history: firstPath(workspace) });
  }, [followWorkspace, workspaceMode, root, workspace, resetNavigation]);

  useLayoutEffect(() => { onPath(path, root); }, [onPath, path, root]);
  useLayoutEffect(() => {
    saved.state = { localHistory, scoped, selection, previewStack, previewOpen, search };
    saveLayout();
  }, [saved, localHistory, scoped, selection, previewStack, previewOpen, search, saveLayout]);

  useEffect(() => {
    if (workspaceMode && !root) return;
    const controller = new AbortController();
    const signal = controller.signal;
    disks.list(path, signal, root).then(({ entries, truncated }) => {
      if (!signal.aborted) {
        saved.checkPath = false;
        setListing({ path, root, revision, entries, truncated });
      }
    }).catch(error => {
      if (signal.aborted) return;
      if (saved.checkPath && error.status === 404 && !samePath(path, workspace)) {
        saved.checkPath = false;
        resetNavigation();
        setScoped(null);
        setLocalHistory(firstPath(workspace ?? null));
        setPreviewStack(emptyPreviewStack);
      } else setListing({ path, root, revision, error: error.message });
    });
    return () => controller.abort();
  }, [path, root, revision, workspaceMode]);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => {
      disks.search(root, term, signal).then(result => {
        if (!signal.aborted) setSearchResult({ ...result, root, term, revision });
      }).catch(error => {
        if (!signal.aborted) setSearchResult({ root, term, revision, error: error.message });
      });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [root, term, revision]);

  useEffect(() => () => pathRequest.current?.abort(), []);
  useLayoutEffect(() => { scroll.current.scrollTop = 0; }, [path, term]);
  useLayoutEffect(() => {
    const position = saved.scroll;
    if (!position) return;
    if (position.path !== path) {
      delete saved.scroll;
      return;
    }
    const list = scroll.current;
    if (!list.querySelector('.dwe-entries')) return;
    list.scrollTop = position.top;
    list.scrollLeft = position.left;
    delete saved.scroll;
  }, [saved, path, ready, found]);
  useLayoutEffect(() => {
    const result = resultToReveal.current;
    if (!result || !ready || !samePath(result.folder, path) || !selection.names.has(result.name)) return;
    resultToReveal.current = null;
    scroll.current.querySelector('.dwe-row[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [path, ready, selection]);

  const editing = editor !== null;
  useLayoutEffect(() => {
    if (!editing) return;
    input.current.focus();
    input.current.select();
    function closeOnOutsideClick(event) {
      if (!pathField.current?.contains(event.target)) closeEditor();
    }
    document.addEventListener('pointerdown', closeOnOutsideClick, true);
    document.addEventListener('click', closeOnOutsideClick, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick, true);
      document.removeEventListener('click', closeOnOutsideClick, true);
    };
  }, [editing, closeEditor]);

  function changeView(mode) {
    setViewModes(previous => new Map(previous).set(viewKey, mode));
    try { localStorage.setItem(viewKey, mode); } catch { /* Keep the choice for this window. */ }
  }

  const historyStep = useCallback(delta => {
    if (move(history, delta) === history) return;
    resetNavigation();
    changeHistory(value => move(value, delta));
  }, [history, resetNavigation, changeHistory]);

  const goUp = useCallback(() => {
    if (path && path !== root) navigate(parentOf(path));
  }, [path, root, navigate]);

  const openPreview = useCallback((absolute, name, size, line, surface, previewRoot = root) => {
    const targetLine = Number.isSafeInteger(line) && line > 0 ? line : undefined;
    const file = { name, absolute, size, line: targetLine, address: resourceAddress(absolute) };
    const player = surface ?? (isPlaybackFile(name) ? claimInlineMedia(file) : undefined);
    if (player === false) return;
    setPreviewStack(stack => openInlinePreview(stack, file, underPath(absolute, previewRoot) ? previewRoot : null, player));
  }, [root, claimInlineMedia]);

  const revealFile = useCallback((absolute, name, size, line, surface) => {
    const folder = parentOf(absolute);
    if (workspaceMode && !underPath(folder, root)) {
      resetNavigation();
      setScoped(null);
      setLocalHistory(history => visit(history, folder));
    } else {
      navigate(folder);
      if (samePath(folder, path) && ready && !ready.entries.some(entry => entry.name === name)) refresh();
    }
    resultToReveal.current = { folder, name };
    setSelection(singleSelection(name));
    openPreview(absolute, name, size, line, surface, underPath(folder, root) ? root : null);
    setPreviewOpen(true);
  }, [workspaceMode, root, path, ready, resetNavigation, navigate, refresh, openPreview]);

  useLayoutEffect(() => bindFileActions({ refresh, rename, reveal: revealFile, historyStep, goUp, clearPreviewFile }),
    [bindFileActions, refresh, rename, revealFile, historyStep, goUp, clearPreviewFile]);

  function openSearchHit(match) {
    if (underPath(match.path, root)) revealFile(match.path, match.name);
  }

  function select(event, entry) {
    const { shiftKey } = event;
    const additive = selectionModifier(event);
    setSelection(current => selectNames(current, entry.name, entries, shiftKey, additive));
    setActionError('');
    setActionNotice('');
    if (!shiftKey && !additive && entry.type === 'file') openPreview(joinPath(path, entry.name), entry.name, entry.size);
  }

  async function openWithSystem(path) {
    try {
      const file = await disks.locate(path, undefined, root);
      if (file.type !== 'file') throw new Error('请选择普通文件');
      if (isWindowsBatch(file.nativePath)) await disks.openBatch(path, root);
      else await openLocal(file.nativePath);
    } catch (error) {
      setActionError('无法使用本机程序打开文件 · ' + (error?.message || String(error)));
    }
  }

  function activate(entry, source, action = preferences.get().fileDoubleClick) {
    const destination = entry.path ?? joinPath(path, entry.name);
    if (entry.type === 'directory' || entry.type === 'drive') navigate(destination);
    else if (entry.type === 'file') {
      if (action === 'native') void openWithSystem(destination);
      else if (action === 'reveal') void runAction('reveal', [entry]);
      else {
        const file = { ...entry, absolute: destination };
        if (action === 'shortcut') {
          if (previewShortcutStatus(file) !== 'pinned' && !openInlinePreviewAs(file, root, 'minimized', source)) {
            setActionError('无法添加到侧列快捷键');
          }
          return;
        }
        const open = action === 'sidebar' ? promotePreview : action === 'fullscreen' ? fullscreenPreview : floatPreview;
        if (!open(file, root)) setActionError('无法打开文件预览');
      }
    }
  }

  function showMenu(event, entry) {
    event.preventDefault();
    event.stopPropagation();
    const absolute = entry && (entry.path ?? joinPath(path, entry.name));
    const keepSelection = entry && !term && selection.names.has(entry.name);
    if (entry && !keepSelection) setSelection(singleSelection(entry.name));
    const allowCreateFolder = !entry && path && !term && !event.target.closest?.('.dwe-head');
    setMenu({ entry, absolute, allowCreateFolder, entries: keepSelection ? selectedEntries : entry ? [entry] : [], x: event.clientX, y: event.clientY,
      focus: event.target.closest?.('.dwe-row') ?? scroll.current });
  }

  function showBarMenu(event) {
    if (!event.target.closest?.('button, .dwe-status')) showMenu(event);
  }

  function showPathMenu(event, destination) {
    event.preventDefault();
    event.stopPropagation();
    const entry = { name: pathName(destination), type: 'directory', path: destination };
    setMenu({ source: 'breadcrumb', entry, absolute: destination, entries: [entry],
      x: event.clientX, y: event.clientY, focus: event.currentTarget });
  }

  const folderTarget = menu?.entry?.type === 'directory' || menu?.entry?.type === 'drive';
  const pasteTarget = folderTarget ? menu.absolute : path;
  const mutable = menu?.entries.length > 0 && menu.entries.every(canModify);
  const oneEntry = menu?.entries.length === 1;
  const conversationActions = menu?.entry ? [
    { id: 'composer-path', label: '引用路径文本到对话框', icon: icon('path'), disabled: !menu.absolute },
    { id: 'composer-attach', label: '复制文件到对话框', icon: icon('copy'),
      disabled: !menu.entries.length || !menu.entries.every(entry => entry.type === 'file') },
  ] : [];
  const openActions = menu?.entry?.type === 'file' ? [
    { id: 'preview-file', label: '文件预览中打开', icon: icon('preview-open-sidebar') },
    { id: 'run-native', label: '使用本机程序运行', icon: icon('external') },
  ] : [];
  const actions = menu?.entry ? [
    { id: 'copy', label: '复制', icon: icon('copy'), disabled: !mutable || working },
    { id: 'cut', label: '剪切', icon: icon('cut'), disabled: !mutable || working },
    { id: 'paste', label: '粘贴', icon: icon('paste'), disabled: !pasteTarget || working },
    { id: 'reveal', label: '在' + fileManagerLabel + '中显示', icon: icon('reveal'), disabled: !oneEntry || !menu.absolute },
    { id: 'path', label: '复制文件路径', icon: icon('path'), disabled: !menu.absolute },
    { id: 'rename', label: '重命名', icon: icon('edit'), disabled: !oneEntry || !mutable || working },
    { id: 'delete', label: '删除', icon: icon('delete'), disabled: !mutable || working },
  ] : [
    ...(menu?.allowCreateFolder ? [{ id: 'create-folder', label: '创建文件夹', icon: icon('file-folder'), disabled: working }] : []),
    { id: 'paste', label: '粘贴', icon: icon('paste'), disabled: !pasteTarget || working },
  ];

  function runMenuAction(action) {
    if (action === 'composer-path' || action === 'composer-attach') {
      closeMenu();
      void sendToComposer(composerItems(menu.entries), action === 'composer-attach' ? 'attachment' : 'text');
      return;
    }
    if (action === 'preview-file' || action === 'run-native') {
      const { entry, absolute } = menu;
      closeMenu();
      if (action === 'run-native') void openWithSystem(absolute);
      else if (!promotePreview({ ...entry, absolute }, root)) setActionError('无法打开文件预览');
      return;
    }
    closeMenu(action !== 'rename');
    void runAction(action, menu.entries, pasteTarget);
  }

  async function runAction(action, entries = [], destination = path) {
    const paths = entries.map(entry => entry.path ?? joinPath(path, entry.name));
    const [absolute] = paths;
    setActionError('');
    setActionNotice('');
    if (action === 'rename') {
      setRenaming({ ...entries[0], absolute });
      return;
    }
    if (action === 'delete') {
      setDeleting(entries.map((entry, index) => ({ name: entry.name, absolute: paths[index] })));
      return;
    }
    const writes = action === 'copy' || action === 'cut' || action === 'paste' || action === 'create-folder';
    if (writes) setWorking(true);
    try {
      if (action === 'copy' || action === 'cut') {
        await disks.stage(paths, action === 'cut', root);
        const count = paths.length === 1 ? '' : ' ' + paths.length + ' 项';
        setActionNotice(action === 'cut' ? '已剪切' + count + '，选择目标文件夹后粘贴' : '已复制' + count + '到剪贴板');
      } else if (action === 'path') {
        await navigator.clipboard.writeText(paths.join('\r\n'));
        setActionNotice(paths.length === 1 ? '已复制路径' : '已复制 ' + paths.length + ' 个路径');
      } else if (action === 'reveal') {
        const target = await disks.locate(absolute, undefined, root);
        await openLocal(target.path, 'reveal');
      } else if (action === 'create-folder') {
        const location = folderLocation.current;
        const result = await disks.createFolder(destination, root);
        refreshDirectories(result.changed);
        if (folderLocation.current === location && layout.current?.isConnected) {
          resultToReveal.current = { folder: destination, name: result.name };
          setSelection(singleSelection(result.name));
          setRenaming({ name: result.name, type: 'directory', absolute: result.path });
        }
      } else if (action === 'paste') {
        setActionNotice('正在粘贴…');
        const result = await disks.paste(destination, root);
        refreshDirectories(result.changed, result.moved);
        if (result.failed) throw new Error('已处理 ' + result.completed + ' 项，' + result.failed + ' 项未完成，请检查权限或文件占用');
        setActionNotice((result.cut ? '已移动 ' : '已粘贴 ') + result.completed + ' 项');
      }
    } catch (error) {
      setActionNotice('');
      setActionError(error?.message || String(error));
    } finally {
      if (writes) setWorking(false);
    }
  }

  async function deleteEntry() {
    const result = await disks.recycle(deleting.map(entry => entry.absolute), root);
    const removed = new Set(result.removed);
    const names = new Set(deleting.filter(entry => removed.has(entry.absolute)).map(entry => entry.name));
    setDeleting(null);
    setSelection(current => ({
      names: new Set([...current.names].filter(name => !names.has(name))),
      anchor: names.has(current.anchor) ? null : current.anchor,
    }));
    setPreviewStack(stack => removeStackPreviews(stack, tab => result.removed.some(path => underPath(tab.file.absolute, path)), root));
    refreshDirectories(result.changed, result.removed);
    if (result.failed) {
      setActionError('已移入' + trashLabel + ' ' + result.completed + ' 项，' + result.failed + ' 项未完成');
    } else {
      setActionNotice('已移入' + trashLabel + (deleting.length === 1 ? '' : ' ' + result.completed + ' 项'));
    }
    scroll.current.focus();
  }

  async function renameEntry(name) {
    const { absolute } = renaming;
    const result = await disks.rename(absolute, name, root);
    setRenaming(null);
    setSelection(singleSelection(name));
    updateRenamedPath(absolute, result.path);
    refreshDirectories(result.changed);
    setActionNotice('已重命名');
    scroll.current.focus();
  }

  async function submitPath(event) {
    event.preventDefault();
    if (locating) return;
    setPathError('');
    const controller = new AbortController();
    const signal = controller.signal;
    pathRequest.current = controller;
    setLocating(true);
    try {
      const inputPath = editor.startsWith('/') ? editor : editor.trim().replace(/^"(.+)"$/, '$1');
      const target = await disks.locate(inputPath, signal, root);
      if (signal.aborted) return;
      if (target.type === 'directory') navigate(localPath(target.path));
      else {
        closeEditor();
        openPreview(target.path, target.name, target.size);
      }
      scroll.current.focus();
    } catch (error) {
      if (!signal.aborted) setPathError(error.message);
    } finally {
      if (pathRequest.current === controller) {
        pathRequest.current = null;
        setLocating(false);
      }
    }
  }

  const previewMenu = usePreviewFileMenu(sessionId, {
    openLocal,
    openNative(file, scope) {
      const target = getTarget();
      return openNativePreview(file, scope, target, () => getTarget() === target, openDocument);
    },
    send: sendToComposer,
    renamed: updateRenamedPath,
  });

  function keyboard(event) {
    if (event.defaultPrevented || event.shiftKey || !layout.current?.contains(event.target)) return;
    if (selectionModifier(event) && !event.altKey && !(isMac ? event.ctrlKey : event.metaKey) && event.key.toLowerCase() === 'l') {
      setEditor(path ?? '');
    } else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowLeft') historyStep(-1);
    else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowRight') historyStep(1);
    else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowUp' && path && path !== root) goUp();
    else if (editing && event.key === 'Escape') closeEditor();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function rowKeyboard(event, entry) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(entry, undefined, 'native');
    }
  }

  const folderContext = preferences?.registry.features.length && folderExtensionContext({
    sessionId, path, root, selection: selectedEntries, refresh,
  });
  return h('div', {
    className: 'dwe', onKeyDown: keyboard, ref: layout, 'data-preview-open': dockedPreview || undefined,
    'data-workspace-mode': workspaceMode || undefined,
    style: { '--dwe-upper': splitRatio + 'fr', '--dwe-lower': (1 - splitRatio) + 'fr' },
  },
    h('div', { className: 'dwe-folder', 'aria-label': '本机文件列表' },
      h('div', { className: 'dwe-address-bar' },
        h('div', {
          ref: pathField, className: 'dwe-path-field', 'data-editing': editing || undefined,
          onDoubleClick: event => {
            if (!editing && !event.target.closest('button')) setEditor(path ?? '');
          },
        },
          editing ? h('form', { className: 'dwe-address', onSubmit: submitPath },
            h('input', {
              type: 'text', 'aria-label': '输入本机路径', placeholder: pathPlaceholder, ref: input,
              value: editor, onChange: event => { setEditor(event.target.value); setPathError(''); },
              readOnly: locating, spellCheck: false,
            }))
            : h(Breadcrumb, { path, navigate, dragFolder, showPathMenu, workspaceMode, root }),
          tool('star', favorited ? '取消收藏当前文件夹' : '收藏当前文件夹', () => toggleFavorite(path), !path, favorited)),
        h('button', {
          type: 'button', className: 'dwe-tool dwe-expanding-tool dwe-favorites-tool', 'aria-label': '收藏夹', 'data-dwe-tool': 'favorites',
          'data-dwe-label-display': favoritesDisplay,
          ref: favoritesButton, 'aria-expanded': favoritesOpen, onClick: () => setFavoritesOpen(open => !open),
        }, h('span', { className: 'dwe-expanding-icon' }, icon('favorites')),
        h('span', { className: 'dwe-expanding-label', 'aria-hidden': true }, h('span', null, '收藏夹')))),
      h('div', { className: 'dwe-toolbar', onContextMenu: showBarMenu },
        h('div', { className: 'dwe-nav dwe-toolbar-navigation' },
          tool('back', '后退 (Alt+←)', () => historyStep(-1), history.index === 0),
          tool('forward', '前进 (Alt+→)', () => historyStep(1), history.index === history.paths.length - 1),
          tool('up', '上一级 (Alt+↑)', goUp, !path || path === root),
          tool('refresh', '刷新文件夹', refresh),
          tool('home', workspaceMode ? '返回工作区根目录' : '返回' + localHomeLabel, () => navigate(root), path === root),
          tool('workspace', '跳转至工作区', () => navigate(workspace), !workspace || path === workspace || workspaceMode)),
        h('div', { className: 'dwe-nav' },
          h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
          tool('copy', '复制', () => runAction('copy', selectedEntries), !modifySelected),
          tool('cut', '剪切', () => runAction('cut', selectedEntries), !modifySelected),
          tool('paste', '粘贴', () => runAction('paste'), !path || working),
          tool('delete', '删除', () => runAction('delete', selectedEntries), !modifySelected),
          h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
          h('button', {
            type: 'button', className: 'dwe-tool dwe-expanding-tool dwe-scope-tool', 'aria-label': '工作区内浏览',
            'data-dwe-label-display': workspaceButtonDisplay,
            'aria-pressed': workspaceMode, disabled: !workspace && !workspaceMode,
            onClick: toggleWorkspaceMode,
          }, h('span', { className: 'dwe-expanding-icon' }, icon(workspaceMode ? 'workspace-scope-active' : 'workspace-scope')),
          h('span', { className: 'dwe-expanding-label', 'aria-hidden': true }, h('span', null, '工作区内浏览'))),
          h(ExtensionButtons, { preferences, area: extensionAreas.fileToolbar, context: folderContext, onError: setActionError }))),
      sessionId && favoritesOpen && h(Favorites, {
        anchor: favoritesButton, close: closeFavorites, folders: favorites, currentPath: path, workspaceMode, root,
        navigate: destination => { navigate(destination); closeFavorites(); },
        removeIcon: icon('close', 18),
      }),
      workspaceMode && h('div', { className: 'dwe-search' }, icon('search'),
        h('input', {
          type: 'search', 'aria-label': '搜索工作区文件', placeholder: '搜索工作区文件名',
          value: root ? search : '', disabled: !root, maxLength: 256, spellCheck: false,
          onChange: event => setSearch(event.target.value),
          onKeyDown: event => {
            if (event.key !== 'Escape' || !search) return;
            event.preventDefault();
            event.stopPropagation();
            setSearch('');
          },
        })),
      (pathError || actionError) && h('p', { className: 'dwe-message dwe-error', role: 'alert' }, pathError || actionError),
      h('div', { className: 'dwe-list', ref: scroll, tabIndex: -1, 'aria-busy': term ? !found : Boolean(!ready && (!workspaceMode || root)),
        onClick: event => {
          if (!selectionModifier(event) && !event.shiftKey && !event.target.closest?.('.dwe-row')) setSelection(emptySelection);
        },
        onContextMenu: event => showMenu(event) },
        !term && !grid && h('div', { className: 'dwe-columns dwe-head', 'aria-hidden': true },
          headerBackdrop(), h('span', null, '名称'), h('span', { className: 'dwe-type-column' }, '类型'), h('span', null, '大小')),
        term ? h(SearchResults, { found, select: openSearchHit, canDrag: Boolean(sessionId),
          contextMenu: (event, match) => showMenu(event, { ...match, type: 'file' }),
          activate,
          drag: (event, match) => startDrag(event, [match], { preview: { absolute: match.path, name: match.name } }),
        })
          : workspaceMode && !root ? h('p', { className: 'dwe-message' }, '当前会话没有可浏览的本机工作区。')
          : !ready ? h('p', { className: 'dwe-message', role: 'status' }, '正在读取…')
          : ready.error ? h('p', { className: 'dwe-message dwe-error', role: 'alert' }, ready.error)
          : ready.entries.length === 0 ? h('p', { className: 'dwe-message' }, path ? '此文件夹为空' : '没有可用的本机磁盘')
          : h('ul', { className: grid ? 'dwe-entries dwe-grid' : 'dwe-entries' },
              entries.map(entry => h('li', { key: entry.name, onContextMenu: event => showMenu(event, entry) },
                h('button', {
                  type: 'button', className: grid ? 'dwe-row dwe-tile' : 'dwe-columns dwe-row', title: entry.name,
                  'aria-pressed': selection.names.has(entry.name),
                  disabled: entry.type === 'other',
                  draggable: entry.type !== 'other' && Boolean(sessionId),
                  onDragStart: event => {
                    const absolute = entry.path ?? joinPath(path, entry.name);
                    const tab = entry.type === 'file'
                      ? { preview: { absolute, name: entry.name, size: entry.size } }
                      : { folder: absolute };
                    startDrag(event, composerItems(dragEntries(entry)), tab);
                  },
                  onClick: event => select(event, entry),
                   onDoubleClick: event => { if (!selectionModifier(event) && !event.shiftKey) activate(entry, event.currentTarget); },
                  onKeyDown: event => rowKeyboard(event, entry),
                },
                 h('span', { className: 'dwe-name' },
                  grid ? h(Thumbnail, {
                    path: entry.type === 'file' ? joinPath(path, entry.name) : null,
                    active: Boolean(sessionId), root,
                    fallback: fileIcon(entry.name, entry.type, 44),
                  }) : fileIcon(entry.name, entry.type, 16),
                   h('span', { 'data-dwe-shortcut-file-name': '' }, entry.name)),
                !grid && h('span', { className: 'dwe-meta dwe-type-column' }, entryType(entry)),
                !grid && h('span', { className: 'dwe-meta' }, formatSize(entry.size))))))),
      h('footer', { className: 'dwe-status-bar', onContextMenu: showBarMenu },
        h('span', { className: 'dwe-status', role: 'status', title: actionNotice },
          term ? found?.matches ? found.matches.length + ' 个结果' + (found.truncated ? ' · 请缩小关键词' : '') : ' '
            : actionNotice || (selectedEntries.length > 1 ? '已选择 ' + selectedEntries.length + ' 项'
              : ready?.entries ? ready.entries.length + ' 个项目' + (ready.truncated ? ' · 列表已截断' : '') : ' ')),
        h('div', { className: 'dwe-nav dwe-status-actions', role: 'group', 'aria-label': '排序和文件视图' },
          tool('recent', '按修改时间排序', () => changeSortMode(sortKey, !readSortMode(sortKey)), !path, sortByModified),
          tool('list', '列表', () => changeView('list'), false, !grid),
          tool('grid', '大图标', () => changeView('grid'), false, grid)),
        h(ExtensionButtons, { preferences, area: extensionAreas.fileFooter, context: folderContext, onError: setActionError }),
        h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
        tool('preview', '预览窗格', () => setPreviewOpen(open => !open), false, previewOpen))),
    dockedPreview && h(PreviewDivider, { root: layout, ratio: splitRatio, setRatio: setSplitRatio }),
    previewOpen && h('div', { className: 'dwe-preview-mount', ref: previewMount }),
    previewOpen && reactDom.createPortal(h('section', { className: 'dwe-preview', 'aria-label': '文件预览' },
      h('header', { className: 'dwe-preview-bar', 'data-dwe-media-header': Boolean(mediaPreview) || undefined },
        headerBackdrop(),
        activePreview && h(PreviewFileLabel, {
          key: activePreview.id, item: activePreview, canDragOut: Boolean(sessionId),
          labelRef: previewLabel, startPreviewDrag,
          contextMenu: (event, tab) => previewMenu.show(event, { ...tab, root: shownRoot }),
        }),
        canPreview && h('div', { className: 'dwe-preview-float-controls', role: 'group', 'aria-label': '预览窗口操作' },
          h(PreviewWindowButtons, {
            addShortcut: () => openPreviewAs('minimized'), shortcutAdded, preferredPreviewMode,
            dockFile: () => openPreviewAs('sidebar'), openFloat: () => openPreviewAs('window'),
            maximize: () => openPreviewAs('maximized'), close: closePreview,
          }))),
      h('div', { className: 'dwe-preview-body' },
        h('div', { ref: setPreviewAnchor, className: 'dwe-preview-anchor' }),
        previewMenu.render,
        canPreview && h(PreviewExtensionButtons, { preferences, sessionId, file: shownPreview, mode: 'inline' }),
        !shownPreview && h('p', { className: 'dwe-preview-hint dwe-preview-placeholder' }, '单击一个文件进行预览'))), previewPane),
    sessionId && menu && h(FileMenu, { menu, close: closeMenu, invoke: runMenuAction, groups: [
      { label: '对话框操作', items: menu.source === 'breadcrumb'
        ? conversationActions.filter(({ id }) => id === 'composer-path') : conversationActions },
      { label: '打开方式', items: openActions },
      { label: '文件管理', items: menu.source === 'breadcrumb'
        ? actions.filter(({ id }) => id === 'reveal' || id === 'path') : actions },
    ] }),
    sessionId && renaming && h(RenameDialog, { entry: renaming, close: () => setRenaming(null), rename: renameEntry }),
    sessionId && deleting && h(DeleteDialog, { entries: deleting, close: () => setDeleting(null), remove: deleteEntry }),
  );
}

function SearchResults({ found, select, activate, canDrag, contextMenu, drag }) {
  if (!found) return h('p', { className: 'dwe-message', role: 'status' }, '正在搜索工作区…');
  if (found.error) return h('p', { className: 'dwe-message dwe-error', role: 'alert' }, found.error);
  return h(react.Fragment, null,
    found.skipped > 0 && h('p', { className: 'dwe-message', role: 'status' }, '已跳过无法读取的子文件夹。'),
    found.matches.length === 0 ? h('p', { className: 'dwe-message' }, '未找到匹配的文件。')
      : h('ul', { className: 'dwe-entries', 'aria-label': '工作区搜索结果' },
        ...found.matches.map(match => h('li', { key: match.path, onContextMenu: event => contextMenu(event, { ...match, type: 'file' }) },
          h('button', {
            type: 'button', className: 'dwe-row dwe-search-hit', title: match.path, onClick: () => select(match),
            onDoubleClick: event => {
              if (!selectionModifier(event) && !event.shiftKey) activate({ ...match, type: 'file' }, event.currentTarget);
            },
            draggable: canDrag, onDragStart: event => drag(event, match),
          }, fileIcon(match.name, 'file'),
           h('span', null, h('span', { 'data-dwe-shortcut-file-name': '' }, match.name),
            h('small', null, match.relative.slice(0, -(match.name.length + 1)) || '工作区根目录')))))));
}

export function ExplorerTitle({ path, workspaceMode, autoCollapse }) {
  const name = path === null ? localHomeLabel : pathName(path);
  return h('span', { 'data-dwe-tab-title': '', 'data-dwe-workspace-tab': workspaceMode || undefined,
    'data-dwe-workspace-fold': workspaceMode && autoCollapse || undefined, title: path ?? name },
    workspaceMode ? icon('file-folder-workspace', 16) : fileIcon('', 'directory'), h('span', null, name));
}
