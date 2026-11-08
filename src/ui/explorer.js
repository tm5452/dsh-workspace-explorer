import { joinPath, move, parentOf, resourceAddress, visit, windowsPath } from './navigation.js';
import { Preview, PreviewBoundary } from './preview.js';
import { disks } from './workspace.js';
import { useComposerDrop } from './composer-drop.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useCallback } = react;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const followKey = 'dsh-workspace-explorer.follow-session';
const icons = {
  back: 'M19 12H5m7-7-7 7 7 7',
  forward: 'M5 12h14m-7-7 7 7-7 7',
  up: 'M12 19V5m-7 7 7-7 7 7',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.1-5.2L20 9m0-5v5h-5',
  home: 'm3 10 9-7 9 7v10h-6v-6H9v6H3Z',
  edit: 'm13 6 5 5m-14 8 1-5L16 3l5 5L10 19l-6 1Z',
  drive: 'M3 13h18v6H3zm0 0 3-7h12l3 7m-4 3h1',
  follow: 'M8 6h12m-5-4 5 4-5 4M16 18H4m5-4-5 4 5 4',
  close: 'm6 6 12 12M18 6 6 18',
  external: 'M14 4h6v6m0-6-9 9m7-1v7H5V6h7',
  chevron: 'm9 6 6 6-6 6',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  grid: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
  preview: 'M3 4h18v16H3zM3 13h18',
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
    'aria-pressed': pressed,
  }, icon(name));
}

function compareEntries(a, b) {
  return Number(b.type === 'directory') - Number(a.type === 'directory') || collator.compare(a.name, b.name);
}

function formatSize(bytes) {
  if (typeof bytes !== 'number') return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

function entryType(entry) {
  if (entry.type === 'drive') return '磁盘';
  if (entry.type === 'directory') return '文件夹';
  if (entry.type !== 'file') return '其他';
  const dot = entry.name.lastIndexOf('.');
  return dot > 0 && dot < entry.name.length - 1 ? entry.name.slice(dot + 1).toUpperCase() + ' 文件' : '文件';
}

function Breadcrumb({ path, navigate }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    node.scrollLeft = node.scrollWidth;
  }, [path]);
  const crumbs = [];
  for (let item = path; item; item = parentOf(item)) crumbs.unshift(item);
  return h('nav', {
    ref, className: 'dwe-path', 'aria-label': '当前文件夹路径', title: path ?? '此电脑',
  },
  h('button', {
    type: 'button', onClick: () => navigate(null), 'aria-current': path === null ? 'location' : undefined,
  }, icon('drive'), '此电脑'),
  ...crumbs.map(destination => h('span', { key: destination, className: 'dwe-crumb' },
    icon('chevron'),
    h('button', {
      type: 'button', onClick: () => navigate(destination), title: destination,
      'aria-current': destination === path ? 'location' : undefined,
    }, destination.length === 3 ? destination.slice(0, 2) : destination.split('\\').at(-1)))));
}

function readFollowSetting() {
  try { return localStorage.getItem(followKey) !== 'false'; } catch { return true; }
}

function readViewMode(key) {
  try { return localStorage.getItem(key) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
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
      grabOffset.current = event.clientY - divider.getBoundingClientRect().top;
      divider.focus();
      divider.setPointerCapture(event.pointerId);
    },
    onPointerMove: event => {
      const divider = event.currentTarget;
      if (!divider.hasPointerCapture(event.pointerId)) return;
      const bounds = root.current.getBoundingClientRect();
      const available = bounds.height - divider.offsetHeight;
      if (available > 0) setRatio(clampSplit((event.clientY - bounds.top - grabOffset.current) / available));
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

export function Explorer({ cwd, sessionId, bindRefresh, getTarget, openLocal }) {
  const [follow, setFollow] = useState(readFollowSetting);
  const [history, setHistory] = useState(() => ({ paths: [follow ? windowsPath(cwd) : null], index: 0 }));
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState(null);
  const [selection, setSelection] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.55);
  const [editor, setEditor] = useState(null);
  const [pathError, setPathError] = useState('');
  const [actionError, setActionError] = useState('');
  const startFileDrag = useComposerDrop(sessionId, setActionError);
  const [locating, setLocating] = useState(false);
  const [viewModes, setViewModes] = useState(() => new Map());
  const scroll = useRef(null);
  const layout = useRef(null);
  const input = useRef(null);
  const pathRequest = useRef(null);
  const followedSession = useRef();
  const path = history.paths[history.index];
  const viewKey = 'dsh-workspace-explorer.view:' + (path ?? 'home');
  const savedMode = react.useMemo(() => readViewMode(viewKey), [viewKey]);
  const grid = (viewModes.get(viewKey) ?? savedMode) === 'grid';
  const ready = listing?.path === path && listing.revision === revision ? listing : null;
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  const closeEditor = useCallback(() => {
    pathRequest.current?.abort();
    pathRequest.current = null;
    setLocating(false);
    setEditor(null);
    setPathError('');
  }, []);

  const navigate = useCallback(destination => {
    closeEditor();
    if (destination === path) return;
    setSelection(null);
    setActionError('');
    setHistory(value => visit(value, destination));
  }, [closeEditor, path]);

  useLayoutEffect(() => {
    if (!follow) {
      followedSession.current = undefined;
      return;
    }
    const workspace = windowsPath(cwd);
    if (!sessionId || !workspace || sessionId === followedSession.current) return;
    followedSession.current = sessionId;
    navigate(workspace);
  }, [follow, cwd, sessionId, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    disks.list(path, signal).then(({ entries, truncated }) => {
      if (!signal.aborted) setListing({ path, revision, entries: entries.sort(compareEntries), truncated });
    }).catch(error => {
      if (!signal.aborted) setListing({ path, revision, error: error.message });
    });
    return () => controller.abort();
  }, [path, revision]);

  useEffect(() => () => pathRequest.current?.abort(), []);
  useLayoutEffect(() => bindRefresh(refresh), [bindRefresh, refresh]);
  useLayoutEffect(() => { scroll.current.scrollTop = 0; }, [path]);

  const editing = editor !== null;
  useLayoutEffect(() => {
    if (editing) { input.current.focus(); input.current.select(); }
  }, [editing]);

  function toggleFollow() {
    const next = !follow;
    setFollow(next);
    try { localStorage.setItem(followKey, String(next)); } catch { /* Keep the setting for this window. */ }
  }

  function changeView(mode) {
    setViewModes(previous => new Map(previous).set(viewKey, mode));
    try { localStorage.setItem(viewKey, mode); } catch { /* Keep the choice for this window. */ }
  }

  function historyStep(delta) {
    if (move(history, delta) === history) return;
    closeEditor();
    setSelection(null);
    setActionError('');
    setHistory(value => move(value, delta));
  }

  function openPreview(absolute, name) {
    setPreview(current => current?.absolute === absolute ? current : {
      name, absolute, address: resourceAddress(absolute),
    });
  }

  function select(entry) {
    setSelection(entry.name);
    setActionError('');
    if (entry.type === 'file') openPreview(joinPath(path, entry.name), entry.name);
  }

  async function openWithWindows(path) {
    try {
      const file = await disks.locate(path);
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

  async function submitPath(event) {
    event.preventDefault();
    if (locating) return;
    setPathError('');
    const controller = new AbortController();
    const signal = controller.signal;
    pathRequest.current = controller;
    setLocating(true);
    try {
      const target = await disks.locate(editor.trim().replace(/^"(.+)"$/, '$1'), signal);
      if (signal.aborted) return;
      if (target.type === 'directory') navigate(windowsPath(target.path));
      else {
        closeEditor();
        openPreview(target.path, target.name);
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

  function openNative() {
    const target = getTarget();
    if (target) target.actions.openResource(resourceAddress(preview.absolute, target.sessionId));
  }

  function keyboard(event) {
    if (event.defaultPrevented || event.shiftKey) return;
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'l') {
      setEditor(path ?? '');
    } else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowLeft') historyStep(-1);
    else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowRight') historyStep(1);
    else if (!event.ctrlKey && !event.metaKey && event.altKey && event.key === 'ArrowUp' && path) navigate(parentOf(path));
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
    style: { '--dwe-upper': splitRatio + 'fr', '--dwe-lower': (1 - splitRatio) + 'fr' },
  },
    h('div', { className: 'dwe-folder', 'aria-label': '本机文件列表' },
      h('div', { className: 'dwe-toolbar' },
        h('div', { className: 'dwe-nav' },
          tool('back', '后退 (Alt+←)', () => historyStep(-1), history.index === 0),
          tool('forward', '前进 (Alt+→)', () => historyStep(1), history.index === history.paths.length - 1),
          tool('up', '上一级 (Alt+↑)', () => navigate(parentOf(path)), !path),
          tool('refresh', '刷新文件夹', refresh),
          tool('home', '返回此电脑', () => navigate(null), !path)),
        editing ? h('form', { className: 'dwe-address', onSubmit: submitPath },
          h('input', {
            type: 'text', 'aria-label': '输入本机路径', placeholder: '例如 D:\\资料', ref: input,
            value: editor, onChange: event => { setEditor(event.target.value); setPathError(''); },
            readOnly: locating, spellCheck: false,
          }),
          tool('close', '取消编辑路径', closeEditor))
          : h(Breadcrumb, { path, navigate }),
        !editing && tool('edit', '编辑路径 (Ctrl+L)', () => setEditor(path ?? '')),
        tool('follow', '跟随会话工作区', toggleFollow, false, follow)),
      (pathError || actionError) && h('p', { className: 'dwe-message dwe-error', role: 'alert' }, pathError || actionError),
      h('div', { className: 'dwe-list', ref: scroll, tabIndex: -1, 'aria-busy': !ready },
        !grid && h('div', { className: 'dwe-columns dwe-head', 'aria-hidden': true },
          h('span', null, '名称'), h('span', null, '类型'), h('span', null, '大小')),
        !ready ? h('p', { className: 'dwe-message', role: 'status' }, '正在读取…')
          : ready.error ? h('p', { className: 'dwe-message dwe-error', role: 'alert' }, ready.error)
          : ready.entries.length === 0 ? h('p', { className: 'dwe-message' }, path ? '此文件夹为空' : '没有可用的本机磁盘')
          : h('ul', { className: grid ? 'dwe-entries dwe-grid' : 'dwe-entries' },
              ready.entries.map(entry => h('li', { key: entry.name },
                h('button', {
                  type: 'button', className: grid ? 'dwe-row dwe-tile' : 'dwe-columns dwe-row', title: entry.name,
                  'aria-pressed': selection === entry.name,
                  disabled: entry.type === 'other',
                  draggable: entry.type === 'file' && Boolean(sessionId),
                  onDragStart: entry.type === 'file'
                    ? event => startFileDrag(event, joinPath(path, entry.name), entry.name) : undefined,
                  onClick: () => select(entry),
                  onDoubleClick: () => activate(entry),
                  onKeyDown: event => rowKeyboard(event, entry),
                },
                h('span', { className: 'dwe-name' }, fileIcon(entry.name, entry.type, grid ? 44 : 16), h('span', null, entry.name)),
                !grid && h('span', { className: 'dwe-meta' }, entryType(entry)),
                !grid && h('span', { className: 'dwe-meta' }, formatSize(entry.size))))))),
      h('footer', { className: 'dwe-status-bar' },
        h('span', { className: 'dwe-status', role: 'status' },
          ready?.entries ? ready.entries.length + ' 个项目' + (ready.truncated ? ' · 列表已截断' : '') : ' '),
        h('div', { className: 'dwe-nav', role: 'group', 'aria-label': '视图与预览' },
          tool('list', '列表', () => changeView('list'), false, !grid),
          tool('grid', '大图标', () => changeView('grid'), false, grid),
          tool('preview', '预览窗格', () => setPreviewOpen(open => !open), false, previewOpen)))),
    previewOpen && h(PreviewDivider, { root: layout, ratio: splitRatio, setRatio: setSplitRatio }),
    previewOpen && h('section', { className: 'dwe-preview', 'aria-label': '文件预览' },
      h('header', { className: 'dwe-preview-bar' },
        h('span', { className: 'dwe-preview-label' }, '预览'),
        preview && h('span', { className: 'dwe-preview-name', title: preview.absolute }, fileIcon(preview.name, 'file'), h('span', null, preview.name)),
        preview && tool('external', '在 DSH 文档预览中打开', openNative)),
      h('div', { className: 'dwe-preview-body' },
        preview ? h(PreviewBoundary, { key: preview.absolute }, h(Preview, { file: preview }))
          : h('p', { className: 'dwe-message' }, '单击一个文件进行预览。'))),
  );
}

export function ExplorerTitle() {
  return h(react.Fragment, null, fileIcon('', 'directory'), '文件浏览');
}


