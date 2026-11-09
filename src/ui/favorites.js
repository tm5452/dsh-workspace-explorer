import { renamePath, underPath, windowsPath } from './navigation.js';

const key = 'dsh-workspace-explorer.favorites';
const dragType = 'application/x-dwe-favorite';
const { createElement: h, useLayoutEffect, useRef, useSyncExternalStore } = react;
const listeners = new Set();

function unique(paths) {
  const seen = new Set();
  return paths.filter(path => {
    const id = path.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function read() {
  try {
    const paths = JSON.parse(localStorage.getItem(key));
    return Array.isArray(paths) ? unique(paths.map(windowsPath).filter(Boolean)) : [];
  } catch { return []; }
}

let folders = read();

function update(next, persist = true) {
  if (next.length === folders.length && next.every((path, index) => path === folders[index])) return;
  folders = next;
  if (persist) {
    try { localStorage.setItem(key, JSON.stringify(folders)); } catch { /* Keep the current window's favorites. */ }
  }
  for (const listener of listeners) listener();
}

function storageChanged(event) {
  if (event.key === key || event.key === null) update(read(), false);
}

function subscribe(listener) {
  if (!listeners.size) window.addEventListener('storage', storageChanged);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', storageChanged);
  };
}

export function useFavorites() {
  return useSyncExternalStore(subscribe, () => folders);
}

export function removeFavorite(path) {
  update(folders.filter(folder => folder.toLowerCase() !== path.toLowerCase()));
}

export function toggleFavorite(path) {
  if (folders.some(folder => folder.toLowerCase() === path.toLowerCase())) removeFavorite(path);
  else update([...folders, path]);
}

export function clearFavorites() {
  update([]);
}

export function renameFavorites(from, to) {
  update(unique(folders.map(path => renamePath(path, from, to))));
}

function moveFavorite(from, to, after) {
  if (from === to || !folders.includes(from) || !folders.includes(to)) return;
  const next = folders.filter(path => path !== from);
  next.splice(next.indexOf(to) + Number(after), 0, from);
  update(next);
}

export function Favorites({ anchor, close, folders, navigate, currentPath, removeIcon, workspaceMode, root }) {
  const panel = useRef(null);
  const dragged = useRef(null);
  const dropRow = useRef(null);

  function clearDropRow() {
    if (dropRow.current) delete dropRow.current.dataset.dweFavoriteDrop;
    dropRow.current = null;
  }

  function resetDrag() {
    dragged.current = null;
    clearDropRow();
  }

  function isAfter(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY >= bounds.top + bounds.height / 2;
  }

  useLayoutEffect(() => {
    const popup = panel.current;
    const button = anchor.current;
    const parent = popup.offsetParent;
    if (!button || !parent) return;

    function position() {
      const bounds = parent.getBoundingClientRect();
      const trigger = button.getBoundingClientRect();
      popup.style.left = Math.max(4, Math.min(trigger.right - bounds.left - popup.offsetWidth,
        bounds.width - popup.offsetWidth - 4)) + 'px';
      popup.style.top = trigger.bottom - bounds.top + 4 + 'px';
    }

    const observer = new ResizeObserver(position);
    observer.observe(parent);
    observer.observe(popup);
    position();
    const lifetime = new AbortController();
    const options = { capture: true, signal: lifetime.signal };
    function outside(event) {
      if (popup.contains(event.target) || button.contains(event.target)) return;
      close();
    }
    for (const event of ['pointerdown', 'click', 'wheel', 'focusin']) {
      document.addEventListener(event, outside, options);
    }
    window.addEventListener('blur', close, { signal: lifetime.signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (popup.contains(document.activeElement)) button.focus({ preventScroll: true });
        close();
      } else outside(event);
    }, options);
    return () => { observer.disconnect(); lifetime.abort(); };
  }, [anchor, close]);

  return h('section', { ref: panel, className: 'dwe-favorites', 'aria-label': '收藏夹' },
    h('header', null, h('strong', null, '收藏夹'),
      h('button', { type: 'button', className: 'dwe-clear-favorites', disabled: !folders.length, onClick: clearFavorites }, '清空收藏')),
    folders.length ? h('ul', { onDragLeave: event => {
      if (!event.currentTarget.contains(event.relatedTarget)) clearDropRow();
    } }, ...folders.map(path => {
      const name = path.length === 3 ? path.slice(0, 2) : path.split('\\').at(-1);
      return h('li', {
        key: path, draggable: true,
        onDragStart: event => {
          dragged.current = path;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(dragType, path);
        },
        onDragOver: event => {
          if (!dragged.current || !event.dataTransfer.types.includes(dragType)) return;
          if (dropRow.current !== event.currentTarget) clearDropRow();
          if (dragged.current === path) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          dropRow.current = event.currentTarget;
          dropRow.current.dataset.dweFavoriteDrop = isAfter(event) ? 'after' : 'before';
        },
        onDrop: event => {
          const from = dragged.current;
          if (!from || event.dataTransfer.getData(dragType) !== from) return;
          event.preventDefault();
          resetDrag();
          moveFavorite(from, path, isAfter(event));
        },
        onDragEnd: resetDrag,
      },
        h('button', {
          type: 'button', className: 'dwe-favorite-location', title: path, onClick: () => navigate(path),
          disabled: workspaceMode && !underPath(path, root),
          'aria-current': currentPath?.toLowerCase() === path.toLowerCase() ? 'location' : undefined,
        }, h(primitives.FileTypeIcon, { kind: 'folder', size: 16 }),
        h('span', { className: 'dwe-favorite-text' }, name)),
        h('button', {
          type: 'button', className: 'dwe-tool', title: '移除收藏', 'aria-label': '移除收藏 ' + name,
          onClick: () => removeFavorite(path),
        }, removeIcon));
    })) : h('p', null, '点击地址栏右侧的星标收藏当前文件夹。'));
}
