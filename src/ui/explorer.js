import { joinPath, move, parentOf, renamePath, resourceAddress, underPath, visit, windowsPath } from './navigation.js';
import { formatSize, Preview, PreviewBoundary } from './preview.js';
import { disks } from './workspace.js';
import { useComposerDrop } from './composer-drop.js';
import { Thumbnail } from './thumbnail.js';
import { DeleteDialog, FileMenu, RenameDialog } from './file-menu.js';
import { Favorites, toggleFavorite, useFavorites } from './favorites.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useCallback, useSyncExternalStore } = react;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const icons = {
  back: 'M19 12H5m7-7-7 7 7 7',
  forward: 'M5 12h14m-7-7 7 7-7 7',
  up: 'M12 19V5m-7 7 7-7 7 7',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.1-5.2L20 9m0-5v5h-5',
  home: 'm3 10 9-7 9 7v10h-6v-6H9v6H3Z',
  edit: 'm13 6 5 5m-14 8 1-5L16 3l5 5L10 19l-6 1Z',
  drive: 'M3 13h18v6H3zm0 0 3-7h12l3 7m-4 3h1',
  workspace: 'M3 7h6l2 2h10v11H3Zm9 7h6m-2-2 2 2-2 2',
  close: 'm6 6 12 12M18 6 6 18',
  external: 'M14 4h6v6m0-6-9 9m7-1v7H5V6h7',
  chevron: 'm9 6 6 6-6 6',
  recent: 'M15 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-6-3v3l2 2m8-8v13m-3-3 3 3 3-3',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  grid: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
  preview: 'M3 4h18v16H3zM3 13h18',
  copy: 'M8 8h12v12H8zM16 4H4v12',
  cut: 'm7 8 14 12m-9-8 9-8M8 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0-1 4-4',
  paste: 'M9 5H5v16h14V5h-4M9 3h6v5H9z',
  path: 'M4 7h16M4 12h16M4 17h9',
  star: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z',
  favorites: 'M3 7h7l2 2h9v11H3Zm9 4 .8 1.8 2 .2-1.5 1.4.4 2-1.7-1-1.7 1 .4-2-1.5-1.4 2-.2Z',
  delete: 'M4 6h16m-14 0 1 14h10l1-14M9 6V3h6v3m-5 4v6m4-6v6',
  search: 'M16 16l4 4m-2-9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
};

function icon(name, size = 16) {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }, h('path', { d: icons[name] }));
}

function fileIcon(name, kind, size = 16) {
  if (kind === 'drive') return icon('drive', size);
  return h(primitives.FileTypeIcon, kind === 'directory' ? { kind: 'folder', size } : { path: name, size });
}

function tool(name, label, onClick, disabled = false, pressed) {
  return h('button', {
    type: 'button', className: 'dwe-tool', 'aria-label': label, title: label, onClick, disabled,
    'aria-pressed': pressed, 'data-dwe-tool': name,
  }, icon(name));
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

function pathName(path) {
  return path.length === 3 ? path.slice(0, 2) : path.split('\\').at(-1);
}

function Breadcrumb({ path, navigate, dragFolder, workspaceMode, root }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    node.scrollLeft = node.scrollWidth;
  }, [path, root]);
  const crumbs = [];
  for (let item = path; item && item.toLowerCase() !== root?.toLowerCase(); item = parentOf(item)) crumbs.unshift(item);
  const baseLabel = root ? pathName(root) : workspaceMode ? '工作区不可用' : '此电脑';
  return h('nav', {
    ref, className: 'dwe-path', 'aria-label': '当前文件夹路径', title: path ?? baseLabel,
  },
  h('button', {
    type: 'button', onClick: () => navigate(root), 'aria-current': crumbs.length === 0 ? 'location' : undefined,
    disabled: workspaceMode && !root,
    draggable: Boolean(root), onDragStart: root ? event => dragFolder(event, root) : undefined,
  }, root ? fileIcon('', 'directory') : icon('drive'), baseLabel),
  ...crumbs.map(destination => h('span', { key: destination, className: 'dwe-crumb' },
    icon('chevron'),
    h('button', {
      type: 'button', onClick: () => navigate(destination), title: destination,
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

function PreviewDivider({ root, ratio, setRatio }) {
  const grabOffset = useRef(0);
  return h('div', {
    className: 'dwe-divider', role: 'separator', tabIndex: 0,
    'aria-label': '调整文件预览分栏高度', 'aria-orientation': 'horizontal',
    'aria-valuemin': splitMin * 100, 'aria-valuemax': splitMax * 100,
    'aria-valuenow': Math.round(ratio * 100),
    onPointerDown: event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const divider = event.currentTarget;
      const bounds = divider.getBoundingClientRect();
      grabOffset.current = event.clientY - (bounds.top + bounds.height / 2);
      divider.setPointerCapture(event.pointerId);
    },
    onPointerMove: event => {
      const divider = event.currentTarget;
      if (!divider.hasPointerCapture(event.pointerId)) return;
      const bounds = root.current.getBoundingClientRect();
      if (bounds.height > 0) setRatio(clampSplit((event.clientY - bounds.top - grabOffset.current) / bounds.height));
    },
    onKeyDown: event => {
      if (event.key === 'ArrowUp') setRatio(value => clampSplit(value - 0.05));
      else if (event.key === 'ArrowDown') setRatio(value => clampSplit(value + 0.05));
      else if (event.key === 'Home') setRatio(splitMin);
      else if (event.key === 'End') setRatio(splitMax);
      else return;
      event.preventDefault();
      event.stopPropagation();
    },
  });
}

export function Explorer({
  cwd, sessionId, initialPath, bindFileActions, getTarget, onPath, openLocal, openDocument, openFolderTab,
  refreshDirectories, updateRenamedPath, getInput,
}) {
  const workspace = windowsPath(cwd);
  const [localHistory, setLocalHistory] = useState(() => firstPath(initialPath === undefined ? workspace : initialPath));
  const [scoped, setScoped] = useState(null);
  const workspaceMode = scoped !== null;
  const root = scoped?.root ?? null;
  const history = scoped?.history ?? localHistory;
  const changeHistory = useCallback(change => {
    if (workspaceMode) setScoped(current => current && { ...current, history: change(current.history) });
    else setLocalHistory(change);
  }, [workspaceMode]);
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState(null);
  const [selection, setSelection] = useState(emptySelection);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [splitRatio, setSplitRatio] = useState(0.55);
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
  const { startDrag, send: sendToComposer } = useComposerDrop(
    sessionId, openFolderTab, setActionError, root, getInput,
  );
  const dragFolder = (event, path) => startDrag(event, [{ path, folder: true }], path);
  const [locating, setLocating] = useState(false);
  const [viewModes, setViewModes] = useState(() => new Map());
  const scroll = useRef(null);
  const layout = useRef(null);
  const input = useRef(null);
  const pathRequest = useRef(null);
  const resultToReveal = useRef(null);
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const term = root ? search.trim() : '';
  const path = history.paths[history.index];
  const favorited = Boolean(path && favorites.some(folder => folder.toLowerCase() === path.toLowerCase()));
  const viewKey = 'dsh-workspace-explorer.view:' + (path ?? 'home');
  const savedMode = react.useMemo(() => readViewMode(viewKey), [viewKey]);
  const grid = (viewModes.get(viewKey) ?? savedMode) === 'grid';
  const sortKey = path ? 'dsh-workspace-explorer.sort:' + path.toLowerCase() : null;
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
  const shownPreview = preview && (!workspaceMode || underPath(preview.absolute, root)) ? preview : null;
  const selectedEntries = term ? [] : entries.filter(entry => selection.names.has(entry.name));
  const composerItems = entries => entries.map(entry => ({
    name: entry.name, path: entry.path ?? joinPath(path, entry.name), folder: entry.type !== 'file',
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
    setPreview(current => {
      if (!current) return current;
      const absolute = renamePath(current.absolute, from, to);
      return absolute === current.absolute ? current
        : { ...current, absolute, name: absolute.split('\\').at(-1), address: resourceAddress(absolute) };
    });
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
    if (destination === path) {
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

  useLayoutEffect(() => { onPath(path); }, [onPath, path]);

  useEffect(() => {
    if (workspaceMode && !root) return;
    const controller = new AbortController();
    const signal = controller.signal;
    disks.list(path, signal, root).then(({ entries, truncated }) => {
      if (!signal.aborted) setListing({ path, root, revision, entries, truncated });
    }).catch(error => {
      if (!signal.aborted) setListing({ path, root, revision, error: error.message });
    });
    return () => controller.abort();
  }, [path, root, revision, workspaceMode]);

  useEffect(() => {
    if (!term || !sessionId) return;
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
  }, [root, term, revision, sessionId]);

  useEffect(() => () => pathRequest.current?.abort(), []);
  useLayoutEffect(() => { scroll.current.scrollTop = 0; }, [path, term]);
  useLayoutEffect(() => {
    const result = resultToReveal.current;
    if (!result || !ready || result.folder !== path || !selection.names.has(result.name)) return;
    resultToReveal.current = null;
    scroll.current.querySelector('.dwe-row[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [path, ready, selection]);

  const editing = editor !== null;
  useLayoutEffect(() => {
    if (editing) { input.current.focus(); input.current.select(); }
  }, [editing]);

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

  const openPreview = useCallback((absolute, name, size, line) => {
    const targetLine = Number.isSafeInteger(line) && line > 0 ? line : undefined;
    setPreview(current => current?.absolute === absolute && !targetLine ? current : {
      name, absolute, size, line: targetLine, address: resourceAddress(absolute),
    });
  }, []);

  const revealFile = useCallback((absolute, name, size, line) => {
    const folder = parentOf(absolute);
    if (workspaceMode && !underPath(folder, root)) {
      resetNavigation();
      setScoped(null);
      setLocalHistory(history => visit(history, folder));
    } else {
      navigate(folder);
      if (folder === path && ready && !ready.entries.some(entry => entry.name === name)) refresh();
    }
    resultToReveal.current = { folder, name };
    setSelection(singleSelection(name));
    openPreview(absolute, name, size, line);
    setPreviewOpen(true);
  }, [workspaceMode, root, path, ready, resetNavigation, navigate, refresh, openPreview]);

  useLayoutEffect(() => bindFileActions({ refresh, rename, reveal: revealFile, historyStep, goUp }),
    [bindFileActions, refresh, rename, revealFile, historyStep, goUp]);

  function openSearchHit(match) {
    if (underPath(match.path, root)) revealFile(match.path, match.name);
  }

  function select(event, entry) {
    const { shiftKey, ctrlKey } = event;
    setSelection(current => selectNames(current, entry.name, entries, shiftKey, ctrlKey));
    setActionError('');
    setActionNotice('');
    if (!shiftKey && !ctrlKey && entry.type === 'file') openPreview(joinPath(path, entry.name), entry.name, entry.size);
  }

  async function openWithWindows(path) {
    try {
      const file = await disks.locate(path, undefined, root);
      if (file.type !== 'file') throw new Error('请选择普通文件');
      await openLocal(file.nativePath);
    } catch (error) {
      setActionError('无法用 Windows 打开文件 · ' + (error?.message || String(error)));
    }
  }

  function activate(entry) {
    const destination = entry.path ?? joinPath(path, entry.name);
    if (entry.type === 'directory' || entry.type === 'drive') navigate(destination);
    else if (entry.type === 'file') void openWithWindows(destination);
  }

  function showMenu(event, entry) {
    event.preventDefault();
    event.stopPropagation();
    const absolute = entry && (entry.path ?? joinPath(path, entry.name));
    const keepSelection = entry && !term && selection.names.has(entry.name);
    if (entry && !keepSelection) setSelection(singleSelection(entry.name));
    setMenu({ entry, absolute, entries: keepSelection ? selectedEntries : entry ? [entry] : [], x: event.clientX, y: event.clientY,
      focus: event.target.closest?.('.dwe-row') ?? scroll.current });
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
  const actions = menu?.entry ? [
    { id: 'copy', label: '复制', icon: icon('copy'), disabled: !mutable || working },
    { id: 'cut', label: '剪切', icon: icon('cut'), disabled: !mutable || working },
    { id: 'paste', label: '粘贴', icon: icon('paste'), disabled: !pasteTarget || working },
    { id: 'reveal', label: '在资源管理器中显示', icon: icon('external'), disabled: !oneEntry || !menu.absolute },
    { id: 'path', label: '复制文件路径', icon: icon('path'), disabled: !menu.absolute },
    { id: 'rename', label: '重命名', icon: icon('edit'), disabled: !oneEntry || !mutable || working },
    { id: 'delete', label: '删除', icon: icon('delete'), disabled: !mutable || working },
  ] : [{ id: 'paste', label: '粘贴', icon: icon('paste'), disabled: !pasteTarget || working }];

  function runMenuAction(action) {
    if (action === 'composer-path' || action === 'composer-attach') {
      closeMenu();
      void sendToComposer(composerItems(menu.entries), action === 'composer-attach' ? 'attachment' : 'text');
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
    const writes = action === 'copy' || action === 'cut' || action === 'paste';
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
    setPreview(current => current && result.removed.some(path => underPath(current.absolute, path)) ? null : current);
    refreshDirectories(result.changed, result.removed);
    if (result.failed) {
      setActionError('已移入回收站 ' + result.completed + ' 项，' + result.failed + ' 项未完成');
    } else {
      setActionNotice(deleting.length === 1 ? '已移入 Windows 回收站' : '已移入 Windows 回收站 ' + result.completed + ' 项');
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
      const target = await disks.locate(editor.trim().replace(/^"(.+)"$/, '$1'), signal, root);
      if (signal.aborted) return;
      if (target.type === 'directory') navigate(windowsPath(target.path));
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

  async function openNative() {
    const target = getTarget();
    if (!target || !shownPreview) return;
    try {
      if (root) await disks.locate(shownPreview.absolute, undefined, root);
      if (getTarget() === target) openDocument(resourceAddress(shownPreview.absolute, target.sessionId), {
        paneId: target.paneId, params: shownPreview.line ? { line: shownPreview.line } : undefined,
      });
    } catch (error) {
      setActionError(error?.message || String(error));
    }
  }

  function keyboard(event) {
    if (event.defaultPrevented || event.shiftKey) return;
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'l') {
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
      activate(entry);
    }
  }

  return h('div', {
    className: 'dwe', onKeyDown: keyboard, ref: layout, 'data-preview-open': previewOpen || undefined,
    'data-workspace-mode': workspaceMode || undefined,
    style: { '--dwe-upper': splitRatio + 'fr', '--dwe-lower': (1 - splitRatio) + 'fr' },
  },
    h('div', { className: 'dwe-folder', 'aria-label': '本机文件列表' },
      h('div', { className: 'dwe-address-bar' },
        editing ? h('form', { className: 'dwe-address', onSubmit: submitPath },
          h('input', {
            type: 'text', 'aria-label': '输入本机路径', placeholder: '例如 D:\\资料', ref: input,
            value: editor, onChange: event => { setEditor(event.target.value); setPathError(''); },
            readOnly: locating, spellCheck: false,
          }))
          : h(Breadcrumb, { path, navigate, dragFolder, workspaceMode, root }),
        editing ? tool('close', '取消编辑路径', closeEditor)
          : tool('edit', '编辑路径 (Ctrl+L)', () => setEditor(path ?? '')),
        tool('star', favorited ? '取消收藏当前文件夹' : '收藏当前文件夹', () => toggleFavorite(path), !path, favorited),
        h('button', {
          type: 'button', className: 'dwe-tool dwe-favorites-tool', title: '收藏夹', 'data-dwe-tool': 'favorites',
          ref: favoritesButton, 'aria-expanded': favoritesOpen, onClick: () => setFavoritesOpen(open => !open),
        }, icon('favorites'), '收藏夹')),
      h('div', { className: 'dwe-toolbar' },
        h('div', { className: 'dwe-nav' },
          tool('back', '后退 (Alt+←)', () => historyStep(-1), history.index === 0),
          tool('forward', '前进 (Alt+→)', () => historyStep(1), history.index === history.paths.length - 1),
          tool('up', '上一级 (Alt+↑)', goUp, !path || path === root),
          tool('refresh', '刷新文件夹', refresh),
          tool('home', workspaceMode ? '返回工作区根目录' : '返回此电脑', () => navigate(root), path === root),
          tool('workspace', '跳转至工作区', () => navigate(workspace), !workspace || path === workspace || workspaceMode)),
        h('div', { className: 'dwe-nav' },
          h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
          tool('copy', '复制', () => runAction('copy', selectedEntries), !modifySelected),
          tool('cut', '剪切', () => runAction('cut', selectedEntries), !modifySelected),
          tool('paste', '粘贴', () => runAction('paste'), !path || working),
          tool('delete', '删除', () => runAction('delete', selectedEntries), !modifySelected),
          h('button', {
            type: 'button', className: 'dwe-tool dwe-scope-tool',
            'aria-pressed': workspaceMode, disabled: !workspace && !workspaceMode,
            onClick: toggleWorkspaceMode,
          }, '在工作区内工作'))),
      sessionId && favoritesOpen && h(Favorites, {
        anchor: favoritesButton, close: closeFavorites, folders: favorites, currentPath: path, workspaceMode, root,
        navigate: destination => { navigate(destination); closeFavorites(); },
        removeIcon: icon('close', 14),
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
          if (!event.ctrlKey && !event.shiftKey && !event.target.closest?.('.dwe-row')) setSelection(emptySelection);
        },
        onContextMenu: event => showMenu(event) },
        !term && !grid && h('div', { className: 'dwe-columns dwe-head', 'aria-hidden': true },
          h('span', null, '名称'), h('span', null, '类型'), h('span', null, '大小')),
        term ? h(SearchResults, { found, select: openSearchHit, canDrag: Boolean(sessionId),
          contextMenu: (event, match) => showMenu(event, { ...match, type: 'file' }),
          drag: (event, match) => startDrag(event, [match]),
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
                    startDrag(event, composerItems(dragEntries(entry)), entry.type === 'file' ? undefined : absolute);
                  },
                  onClick: event => select(event, entry),
                  onDoubleClick: event => { if (!event.ctrlKey && !event.shiftKey) activate(entry); },
                  onKeyDown: event => rowKeyboard(event, entry),
                },
                h('span', { className: 'dwe-name' },
                  grid ? h(Thumbnail, {
                    path: entry.type === 'file' ? joinPath(path, entry.name) : null,
                    active: Boolean(sessionId), root,
                    fallback: fileIcon(entry.name, entry.type, 44),
                  }) : fileIcon(entry.name, entry.type),
                  h('span', null, entry.name)),
                !grid && h('span', { className: 'dwe-meta' }, entryType(entry)),
                !grid && h('span', { className: 'dwe-meta' }, formatSize(entry.size))))))),
      h('footer', { className: 'dwe-status-bar' },
        h('span', { className: 'dwe-status', role: 'status', title: actionNotice },
          term ? found?.matches ? found.matches.length + ' 个结果' + (found.truncated ? ' · 请缩小关键词' : '') : ' '
            : actionNotice || (selectedEntries.length > 1 ? '已选择 ' + selectedEntries.length + ' 项'
              : ready?.entries ? ready.entries.length + ' 个项目' + (ready.truncated ? ' · 列表已截断' : '') : ' ')),
        tool('recent', '按修改时间排序', () => changeSortMode(sortKey, !readSortMode(sortKey)), !path, sortByModified),
        h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
        h('div', { className: 'dwe-nav', role: 'group', 'aria-label': '文件视图' },
          tool('list', '列表', () => changeView('list'), false, !grid),
          tool('grid', '大图标', () => changeView('grid'), false, grid)),
        h('span', { className: 'dwe-v-divider', 'aria-hidden': true }),
        tool('preview', '预览窗格', () => setPreviewOpen(open => !open), false, previewOpen))),
    previewOpen && h(PreviewDivider, { root: layout, ratio: splitRatio, setRatio: setSplitRatio }),
    previewOpen && h('section', { className: 'dwe-preview', 'aria-label': '文件预览' },
      h('header', { className: 'dwe-preview-bar' },
        h('span', { className: 'dwe-preview-label' }, '预览'),
        shownPreview && h('span', { className: 'dwe-preview-name', title: shownPreview.absolute },
          fileIcon(shownPreview.name, 'file'),
          h('span', null, shownPreview.name),
          tool('close', '关闭当前文件预览', () => setPreview(null))),
        shownPreview && tool('external', '在 DSH 文档预览中打开', openNative)),
      h('div', { className: 'dwe-preview-body' },
        shownPreview ? h(PreviewBoundary, { key: JSON.stringify([shownPreview.absolute, root]) }, h(Preview, { file: shownPreview, root }))
          : h('p', { className: 'dwe-preview-hint' }, '单击一个文件进行预览'))),
    sessionId && menu && h(FileMenu, { menu, close: closeMenu, invoke: runMenuAction, groups: [
      { label: '对话框操作', items: conversationActions },
      { label: '文件管理', items: actions },
    ] }),
    sessionId && renaming && h(RenameDialog, { entry: renaming, close: () => setRenaming(null), rename: renameEntry }),
    sessionId && deleting && h(DeleteDialog, { entries: deleting, close: () => setDeleting(null), remove: deleteEntry }),
  );
}

function SearchResults({ found, select, canDrag, contextMenu, drag }) {
  if (!found) return h('p', { className: 'dwe-message', role: 'status' }, '正在搜索工作区…');
  if (found.error) return h('p', { className: 'dwe-message dwe-error', role: 'alert' }, found.error);
  return h(react.Fragment, null,
    found.skipped > 0 && h('p', { className: 'dwe-message', role: 'status' }, '已跳过无法读取的子文件夹。'),
    found.matches.length === 0 ? h('p', { className: 'dwe-message' }, '未找到匹配的文件。')
      : h('ul', { className: 'dwe-entries', 'aria-label': '工作区搜索结果' },
        ...found.matches.map(match => h('li', { key: match.path, onContextMenu: event => contextMenu(event, match) },
          h('button', {
            type: 'button', className: 'dwe-row dwe-search-hit', title: match.path, onClick: () => select(match),
            draggable: canDrag, onDragStart: event => drag(event, match),
          }, fileIcon(match.name, 'file'),
          h('span', null, h('span', null, match.name),
            h('small', null, match.relative.slice(0, -(match.name.length + 1)) || '工作区根目录')))))));
}

export function ExplorerTitle({ path }) {
  const name = path === null ? '此电脑' : pathName(path);
  return h('span', { 'data-dwe-tab-title': '', title: path ?? name },
    fileIcon('', 'directory'), h('span', null, name));
}


