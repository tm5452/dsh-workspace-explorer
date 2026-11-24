import { FileMenu } from './file-menu.js';
import { fileIcon } from './file-icon.js';
import { icon } from './interface-icon.js';
import { createSidebarDropOverlay } from './drop-overlay.js';
import { createTabDragIcon } from './drag-icon.js';

const { createElement: h, useCallback, useEffect, useRef, useState, useSyncExternalStore } = react;
const slotSelector = '[data-dwe-float-dock-slot]';
const sidebarSelector = '[data-sidebar-right-panel][data-sidebar-right-session]';
const contains = (rect, x, y) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

function sidebarDropTarget(sessionId) {
  return [...document.querySelectorAll(sidebarSelector)].find(panel =>
    panel.dataset.sidebarRightSession === sessionId && panel.getClientRects().length
    && !panel.closest('[inert], [hidden], [aria-hidden="true"]'));
}

export function PreviewWindowButtons({
  addShortcut, shortcutAdded, preferredPreviewMode, minimize, dockFile, openFloat, returnInline, maximize, close, raise,
}) {
  const closeGlyph = 'dsw-icon-close-outline-regular';
  const modes = [
    ['preview-open-sidebar', '侧栏打开', dockFile, 'preview-dock'],
    ['preview-open-window', '小窗打开', openFloat, 'preview-float'],
    ['float-maximize', '最大化', maximize],
  ];
  const preferred = modes[{ sidebar: 0, window: 1, maximized: 2 }[preferredPreviewMode]];
  const actions = [
    ...modes.filter(action => action !== preferred),
    ['preview-add-shortcut', '添加到侧列快捷键', addShortcut, undefined, shortcutAdded],
    ...(preferred ? [preferred] : []),
    ['float-minimize', '最小化', minimize],
    ['preview-return-inline', '返回预览窗', returnInline && (() => returnInline(false)), 'preview-return'],
    ['close', '关闭', close],
  ];
  const contextMenu = event => {
    event.preventDefault();
    event.stopPropagation();
    returnInline(true);
  };
  return actions.filter(([, , click]) => click).flatMap(([name, label, click, tool, disabled], index) => {
    const button = h('button', {
      key: name, type: 'button', title: label, 'aria-label': label, 'data-dwe-float-action': name, disabled,
      'data-dwe-tool': tool,
      ...(tool === 'preview-return' && { title: '返回预览窗 · 右键新标签页打开', onContextMenu: contextMenu }),
      onPointerDown: event => {
        event.stopPropagation();
        if (event.button === 0) raise?.();
      },
      onClick: click,
    }, name === 'close' && document.getElementById(closeGlyph)
      ? h('svg', { width: 16, height: 16, 'aria-hidden': true }, h('use', { href: '#' + closeGlyph })) : icon(name, 16));
    return name === (preferred ? 'preview-add-shortcut' : 'float-minimize') && index > 0
      ? [h('span', { key: 'divider', className: 'dwe-v-divider', 'aria-hidden': true }), button]
      : [button];
  });
}

export function PreviewFloatControls({ dock, entry, dockFile, openFloat, returnInline }) {
  useSyncExternalStore(dock.subscribe, dock.getSnapshot);
  if (!entry.floatControls) return null;
  const maximized = Boolean(entry.window?.maximized);
  const hasFile = entry.stack.tabs.length > 0;
  return reactDom.createPortal(h(PreviewWindowButtons, {
    minimize: hasFile ? () => dock.minimize(entry) : undefined,
    dockFile: hasFile && dockFile,
    openFloat: maximized && (hasFile ? openFloat : () => dock.maximize(entry, false)),
    returnInline: hasFile && returnInline,
    maximize: !maximized && (() => dock.maximize(entry, true)),
    raise: () => dock.raise(entry),
  }), entry.floatControls);
}

function ShortcutOutline({ mode }) {
  return h('svg', { className: 'dwe-float-dock-outline', viewBox: '0 0 26 26', 'aria-hidden': true, focusable: 'false' },
    mode === 'maximized'
      ? h('rect', { x: 1.5, y: 1.5, width: 23, height: 23, rx: 5.5 })
      : h('path', { strokeLinecap: 'round', d: 'M12.5 1.5H7A5.5 5.5 0 0 0 1.5 7V19A5.5 5.5 0 0 0 7 24.5H12.5' }));
}

function DockShortcut({ dock, entry, floating, displayed, windowMode, openMenu, activate, moveToSidebar, reorder }) {
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const attach = useCallback(node => dock.setShortcutSlot(entry, node), [dock, entry]);
  const { file } = entry.stack.tabs[0];
  const previewMode = floating && entry.window?.maximized ? 'maximized' : windowMode ? 'window' : 'sidebar';
  const mode = { maximized: '全屏', window: '小窗', sidebar: '侧栏' }[previewMode];
  const flightState = dock.shortcutFlightState(entry);

  useEffect(() => () => drag.current?.cancel(), []);

  function start(event) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    drag.current?.cancel();
    const button = event.currentTarget;
    const source = button.closest(slotSelector);
    const shelf = source.parentElement;
    const { pointerId, clientX: x, clientY: y } = event;
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    let slots;
    let bounds;
    let target;
    let after;
    let dropOverlay;
    let sidebar;
    let badge;

    function cancel() {
      drag.current = null;
      controller.abort();
      target?.removeAttribute('data-dwe-float-insert');
      source.removeAttribute('data-dwe-float-dragging');
      badge?.dispose();
      if (document.body.hasPointerCapture(pointerId)) document.body.releasePointerCapture(pointerId);
      dropOverlay?.hide();
    }
    function move(event) {
      if (event.pointerId !== pointerId) return;
      if (!slots) {
        if (Math.hypot(event.clientX - x, event.clientY - y) < 6) return;
        bounds = shelf.getBoundingClientRect();
        slots = [...shelf.querySelectorAll(slotSelector)].map(node => ({ node, bounds: node.getBoundingClientRect() }));
        source.setAttribute('data-dwe-float-dragging', '');
        suppressClick.current = true;
        document.body.setPointerCapture(pointerId);
        badge = createTabDragIcon(button.querySelector('.dwe-float-dock-file-icon svg'), 'dwe-float-dock-drag');
        badge.element.toggleAttribute('data-opened', displayed);
        sidebar = floating && sidebarDropTarget(entry.sessionId);
        if (sidebar) {
          dropOverlay = createSidebarDropOverlay();
          dropOverlay.layout(sidebar);
        }
      }
      event.preventDefault();
      badge.move(event.clientX, event.clientY);
      target?.removeAttribute('data-dwe-float-insert');
      target = undefined;
      if (dropOverlay?.show(event.clientX, event.clientY)) return;
      if (event.clientX < bounds.left - 20 || event.clientX > bounds.right + 20
          || event.clientY < bounds.top - 10 || event.clientY > bounds.bottom + 10) return;
      const candidate = slots.find(slot => slot.bounds.bottom + 2 > event.clientY) ?? slots.at(-1);
      if (!candidate || candidate.node === source) return;
      const rect = candidate.bounds;
      target = candidate.node;
      after = event.clientY > rect.top + rect.height / 2;
      target.setAttribute('data-dwe-float-insert', after ? 'after' : 'before');
    }
    function finish(event) {
      if (event.pointerId !== pointerId) return;
      const address = target?.dataset.dweFloatDockSlot;
      const onSidebar = sidebar?.isConnected && dropOverlay.contains(event.clientX, event.clientY);
      cancel();
      if (event.type !== 'pointerup') return;
      if (onSidebar) {
        const pane = [...sidebar.querySelectorAll('[data-dockkit-pane]')].find(node =>
          contains(node.getBoundingClientRect(), event.clientX, event.clientY));
        dock.dockIntoSidebar(entry, () => moveToSidebar(entry, pane?.dataset.dockkitPane));
        return;
      }
      if (!address) return;
      reorder(entry, address, after);
    }

    drag.current = { cancel };
    window.addEventListener('pointermove', move, options);
    window.addEventListener('pointerup', finish, options);
    window.addEventListener('pointercancel', finish, options);
    window.addEventListener('resize', () => dropOverlay?.layout(sidebar), options);
    window.addEventListener('blur', cancel, { signal: controller.signal });
  }

  return h('div', {
    ref: attach, className: 'dwe-float-dock-slot', 'data-dwe-float-dock-slot': entry.address,
    'data-dwe-preview-mode': previewMode,
  }, h('button', {
    type: 'button', className: 'dwe-float-dock-button', title: file.name + ' · ' + mode, 'aria-pressed': Boolean(displayed),
    'aria-label': (displayed ? '最小化' : '显示') + mode + '预览：' + file.name,
    'data-dwe-shortcut-flight-target': flightState === 'shortcut' || undefined,
    'data-dwe-shortcut-retracting': flightState === 'retracting' || undefined,
    onClick: event => {
      if (!suppressClick.current || event.detail === 0) activate(entry, event.currentTarget);
      suppressClick.current = false;
    },
    onContextMenu: event => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(entry, event);
    },
    onPointerDown: start,
  }, h('span', { className: 'dwe-float-dock-file-icon' }, fileIcon(file.name)), h(ShortcutOutline, { mode: previewMode })),
  h('span', { className: 'dwe-float-dock-label', 'aria-hidden': true },
    fileIcon(file.name), h('span', { className: 'dwe-float-dock-label-name' }, file.name)));
}

function AddFloatButton({ onClick }) {
  const sprite = 'dsw-icon-plus-outline-regular';
  const hasSprite = document.getElementById(sprite);
  return h('button', {
    type: 'button', className: 'dwe-float-dock-add', title: '新建小窗', 'aria-label': '新建小窗', onClick,
  }, h('svg', { width: 14, height: 14, viewBox: hasSprite ? undefined : '0 0 16 16', 'aria-hidden': true },
    hasSprite ? h('use', { href: '#' + sprite })
      : h('path', { d: 'M8 2V14M2 8H14', stroke: 'currentColor', fill: 'none' })));
}

export function PreviewFloatDock({ dock, host, shortcuts, openEmpty, activate, move, inlineShortcutWindow }) {
  useSyncExternalStore(dock.subscribe, dock.getSnapshot);
  const [menu, setMenu] = useState();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const rows = [...shortcuts].sort((a, b) => (a.entry.window?.shortcutOrder ?? Infinity) - (b.entry.window?.shortcutOrder ?? Infinity));
  const entries = rows.map(({ entry }) => entry);
  const index = entries.indexOf(menu?.entry);
  const windowMode = ({ floating, entry }) => floating && (entry.window?.minimizedFromInline
    ? inlineShortcutWindow : !entry.window?.restoreToSidebar);
  const menuWindowMode = index >= 0 && windowMode(rows[index]);
  return reactDom.createPortal(h(react.Fragment, null,
    ...rows.map(row => h(DockShortcut, { key: row.entry.key, dock, ...row, activate, windowMode: windowMode(row),
      moveToSidebar: (entry, paneId) => move(entry, false, paneId),
      reorder: (entry, address, after) => dock.reorder(entries, entry, entries.find(target => target.address === address), after),
      openMenu: (entry, event) => setMenu({ entry, x: event.clientX, y: event.clientY }) })),
    openEmpty && h(AddFloatButton, { onClick: openEmpty }),
    index >= 0 && h(FileMenu, {
      menu, close: closeMenu, label: '文件预览操作',
      invoke: mode => {
        closeMenu();
        if (mode === 'switch') move(menu.entry, !menuWindowMode);
        else dock.close(entries, menu.entry, mode);
      },
      groups: [{ label: '文件预览操作', items: [
        { id: 'switch', label: menuWindowMode ? '侧栏打开' : '小窗打开', icon: icon(menuWindowMode ? 'preview-open-sidebar' : 'preview-open-window') },
        { id: 'one', label: '关闭', icon: icon('close'), destructive: true },
      ] }, { label: '批量关闭', items: [
        { id: 'below', label: '关闭下方所有', icon: icon('close'), disabled: index === entries.length - 1 },
        { id: 'all', label: '关闭全部', icon: icon('close') },
      ] }],
    })), host);
}
