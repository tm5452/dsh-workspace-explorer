import { FileMenu } from './file-menu.js';
import { fileIcon } from './file-icon.js';
import { icon } from './interface-icon.js';
import { shortcutDropTarget } from './preview-shortcut-drop.js';
import { releaseShortcut, shortcutReleaseVelocity } from './preview-shortcut-release.js';
import { createTabDragIcon } from './drag-icon.js';
import { createShortcutRailMotion } from './preview-shortcut-rail-motion.js';

const { createElement: h, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = react;
const slotSelector = '[data-dwe-float-dock-slot]';
function openSidebar(sessionId) {
  if (!sessionId) return;
  const panel = document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open][data-sidebar-right-session="'
    + CSS.escape(sessionId) + '"]');
  if (panel && !panel.closest('[inert], [hidden], [aria-hidden="true"]')) return panel;
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
    ['preview-add-shortcut', shortcutAdded ? '取消固定' : '添加到侧列快捷键', addShortcut],
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
  return actions.filter(([, , click]) => click).flatMap((action, index) => {
    const [name, label, click, tool] = action;
    const glyph = name === 'preview-add-shortcut' && shortcutAdded ? 'preview-shortcut-added' : name;
    const secondary = action !== preferred && modes.includes(action);
    const button = h('button', {
      key: name, type: 'button', title: label, 'aria-label': label, 'data-dwe-float-action': name,
      'data-dwe-tool': tool, 'data-dwe-preview-secondary': secondary || undefined,
      ...(tool === 'preview-return' && { title: '返回预览窗 · 右键新标签页打开', onContextMenu: contextMenu }),
      onPointerDown: event => {
        event.stopPropagation();
        if (event.button === 0) raise?.();
      },
      onClick: click,
    }, name === 'close' && document.getElementById(closeGlyph)
      ? h('svg', { width: 16, height: 16, 'aria-hidden': true }, h('use', { href: '#' + closeGlyph })) : icon(glyph, 16));
    return name === (preferred ? 'preview-add-shortcut' : 'float-minimize') && index > 0
      ? [h('span', { key: 'divider', className: 'dwe-v-divider', 'aria-hidden': true, 'data-dwe-preview-secondary': true }), button]
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

function DockShortcut({ dock, entry, floating, displayed, windowMode, openMenu, activate, close, drop, reorder, getSessionId, getDropPreview, prepareShortcutLoad }) {
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
    dock.cancelShortcutRelease();
    const button = event.currentTarget;
    const source = button.closest(slotSelector);
    const shelf = source.parentElement;
    const { pointerId, clientX: x, clientY: y } = event;
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    let badge;
    let face;
    let label;
    const samples = [{ x, y, time: event.timeStamp }];
    let highlightedPane;
    let insertion;
    let geometry;
    let geometryDirty = true;
    let labelText = '';
    const invalidateGeometry = () => { geometryDirty = true; };
    const resize = new ResizeObserver(invalidateGeometry);
    const rail = shelf.closest('.dwe-sidebar-header-controls');
    const railChanges = new MutationObserver(invalidateGeometry);
    let watched = new Set();
    let badgeX;
    let badgeY;

    function cancel() {
      drag.current = null;
      controller.abort();
      resize.disconnect();
      railChanges.disconnect();
      highlightedPane?.removeAttribute('data-dwe-shortcut-drop');
      insertion?.node.removeAttribute('data-dwe-float-insert');
      source.removeAttribute('data-dwe-float-dragging');
      badge?.dispose();
      if (document.body.hasPointerCapture(pointerId)) document.body.releasePointerCapture(pointerId);
    }

    function measureTargets(sessionId) {
      const panel = openSidebar(sessionId);
      const panes = [...(panel?.querySelectorAll('[data-dockkit-pane]') ?? [])]
        .filter(node => !node.closest('[data-dockkit-float], [inert], [hidden], [aria-hidden="true"]'))
        .map(node => ({ id: node.dataset.dockkitPane, node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const slots = [...shelf.querySelectorAll(slotSelector)].map(node => ({ node, rect: node.getBoundingClientRect() }));
      const elements = new Set([shelf, ...panes.map(({ node }) => node)]);
      if (panel) elements.add(panel);
      for (const element of watched) if (!elements.has(element)) resize.unobserve(element);
      for (const element of elements) if (!watched.has(element)) resize.observe(element, { box: 'border-box' });
      watched = elements;
      geometry = { sessionId, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight,
        shelf: shelf.getBoundingClientRect(), fullscreen: Boolean(shelf.closest('[data-dwe-shortcuts-fullscreen]')),
        panes, slots };
      geometryDirty = false;
    }

    function destinationAt(event, fresh = false) {
      const session = getSessionId();
      if (fresh || geometryDirty || geometry?.sessionId !== session) measureTargets(session);
      return shortcutDropTarget({ ...geometry, x: event.clientX, y: event.clientY });
    }

    function insertionAt(y) {
      const { slots } = geometry;
      const candidate = slots.find(slot => slot.rect.bottom + 2 > y) ?? slots.at(-1);
      if (!candidate || candidate.node === source) return;
      return { node: candidate.node, after: y > candidate.rect.top + candidate.rect.height / 2 };
    }

    function positionBadge({ clientX, clientY }) {
      const left = Math.max(0, clientX - 14);
      const top = Math.max(0, clientY - 14);
      if (left === badgeX && top === badgeY) return;
      badgeX = left;
      badgeY = top;
      badge.element.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0)';
    }

    function move(event) {
      if (event.pointerId !== pointerId) return;
      while (samples.length && event.timeStamp - samples[0].time > 90) samples.shift();
      const positions = event.getCoalescedEvents?.();
      for (const position of positions?.length ? positions : [event]) {
        samples.push({ x: position.clientX, y: position.clientY, time: position.timeStamp });
      }
      if (!badge && Math.hypot(event.clientX - x, event.clientY - y) < 6) return;
      const destination = destinationAt(event);
      const mode = destination?.mode;
      if (!badge) {
        if (rail) railChanges.observe(rail, { attributes: true,
          attributeFilter: ['style', 'data-dwe-shortcuts-fullscreen', 'data-dwe-shortcuts-detached'] });
        source.setAttribute('data-dwe-float-dragging', '');
        suppressClick.current = true;
        document.body.setPointerCapture(pointerId);
        badge = createTabDragIcon(button.querySelector('.dwe-float-dock-file-icon svg'), 'dwe-float-dock-drag');
        badge.element.toggleAttribute('data-opened', displayed);
        face = document.createElement('span');
        face.className = 'dwe-float-dock-drag-face';
        face.append(...badge.element.childNodes);
        badge.element.append(face);
        label = document.createElement('span');
        label.className = 'dwe-shortcut-drop-label';
        badge.element.append(label);
        document.body.append(badge.element);
      }
      event.preventDefault();
      positionBadge(event);
      badge.element.toggleAttribute('data-dwe-shortcut-open-zone', mode === 'window' || mode === 'sidebar');
      badge.element.toggleAttribute('data-dwe-shortcut-label-right', event.clientX < 150);
      const nextLabel = mode === 'window' ? '小窗打开'
        : mode === 'sidebar' ? (destination.paneId ? '在此窗格打开' : '右侧栏打开')
        : mode === 'reorder' ? '调整顺序' : '';
      if (nextLabel !== labelText) label.textContent = labelText = nextLabel;
      const nextInsertion = mode === 'reorder' ? insertionAt(event.clientY) : undefined;
      if (insertion?.node !== nextInsertion?.node || insertion?.after !== nextInsertion?.after) {
        insertion?.node.removeAttribute('data-dwe-float-insert');
        insertion = nextInsertion;
        insertion?.node.setAttribute('data-dwe-float-insert', insertion.after ? 'after' : 'before');
      }
      if (highlightedPane !== destination?.node) {
        highlightedPane?.removeAttribute('data-dwe-shortcut-drop');
        highlightedPane = destination?.node;
        highlightedPane?.setAttribute('data-dwe-shortcut-drop', '');
      }
    }

    function finish(event) {
      if (event.pointerId !== pointerId) return;
      const destination = badge && event.type === 'pointerup' ? destinationAt(event, true) : undefined;
      const target = destination?.mode === 'reorder' ? insertionAt(event.clientY) : undefined;
      if (destination && destination.mode !== 'reorder') {
        const session = getSessionId();
        const released = badge;
        const last = samples.at(-1);
        if (last.x !== event.clientX || last.y !== event.clientY) {
          samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
          positionBadge(event);
        }
        badge = undefined;
        cancel();
        const velocity = shortcutReleaseVelocity(samples, event.timeStamp);
        dock.startShortcutRelease(finished => {
          const load = prepareShortcutLoad?.(entry);
          const finish = () => {
            try { load?.finish(); } finally { finished(); }
          };
          return releaseShortcut(released, face, destination, velocity, (point, movesSurface) => {
            if (session !== getSessionId()) return false;
            if (movesSurface) load?.park();
            return drop(entry, point);
          }, point => getDropPreview(entry, point), point => getDropPreview(entry, point, true), finish);
        });
        return;
      }
      cancel();
      if (target) reorder(entry, target.node.dataset.dweFloatDockSlot, target.after);
    }

    drag.current = { cancel };
    window.addEventListener('pointermove', move, options);
    window.addEventListener('pointerup', finish, options);
    window.addEventListener('pointercancel', finish, options);
    window.addEventListener('scroll', invalidateGeometry, { ...options, passive: true });
    window.addEventListener('resize', invalidateGeometry, options);
    window.addEventListener('blur', cancel, { signal: controller.signal });
  }

  return h('div', {
    ref: attach, className: 'dwe-float-dock-slot', 'data-dwe-float-dock-slot': entry.address,
    'data-dwe-preview-mode': previewMode,
    onFocus: event => {
      if (event.target.matches(':focus-visible')) event.currentTarget.setAttribute('data-dwe-shortcut-keyboard-focus', '');
    },
    onBlur: event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('data-dwe-shortcut-keyboard-focus');
    },
  }, h('button', {
    type: 'button', className: 'dwe-float-dock-button', title: file.name + ' · ' + mode, 'aria-pressed': Boolean(displayed),
    'aria-label': (displayed ? '最小化' : '显示') + mode + '预览：' + file.name,
    'data-dwe-shortcut-flight-target': (flightState === 'shortcut' || flightState === 'inline') || undefined,
    'data-dwe-shortcut-retracting': flightState === 'retracting' || undefined,
    onClick: event => {
      if (!suppressClick.current || event.detail === 0) activate(entry, event.currentTarget, event);
      suppressClick.current = false;
    },
    onContextMenu: event => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(entry, event);
    },
    onPointerDown: start,
  }, h('span', { className: 'dwe-float-dock-file-icon' }, fileIcon(file.name)), h(ShortcutOutline, { mode: previewMode })),
  h('span', { className: 'dwe-float-dock-label' },
    h('span', { className: 'dwe-float-dock-label-content', 'aria-hidden': true },
      fileIcon(file.name), h('span', { className: 'dwe-float-dock-label-name' }, file.name)),
    h('span', { className: 'dwe-float-dock-label-actions' }, h('button', {
      type: 'button', className: 'dwe-float-dock-label-close', title: '关闭', 'aria-label': '关闭 ' + file.name,
      onClick: event => close(entry, event),
    }, icon('close', 14)))));
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

export function PreviewFloatDock({ dock, host, shortcuts, openEmpty, activate, drop, move, inlineShortcutWindow, getSessionId, getDropPreview, prepareShortcutLoad }) {
  useSyncExternalStore(dock.subscribe, dock.getSnapshot);
  const [menu, setMenu] = useState();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const rail = useRef(null);
  useLayoutEffect(() => {
    rail.current = createShortcutRailMotion(host);
    return () => { rail.current.dispose(); rail.current = null; };
  }, [host]);
  const rows = [...shortcuts].sort((a, b) => (a.entry.window?.shortcutOrder ?? Infinity) - (b.entry.window?.shortcutOrder ?? Infinity));
  const entries = rows.map(({ entry }) => entry);
  function closeShortcut(entry, mode, event) {
    rail.current?.hold(event);
    const targets = mode === 'all' ? entries : mode === 'below' ? entries.slice(entries.indexOf(entry) + 1) : [entry];
    rail.current?.captureClose(targets.map(target => target.address));
    dock.close(entries, entry, mode);
  }
  useLayoutEffect(() => {
    rail.current?.sync((address, event) => {
      const entry = entries.find(item => item.address === address);
      if (entry) closeShortcut(entry, 'one', event);
    });
  });
  const index = entries.indexOf(menu?.entry);
  const windowMode = ({ floating, entry }) => floating && (entry.window?.minimizedFromInline
    ? inlineShortcutWindow : !entry.window?.restoreToSidebar);
  const menuWindowMode = index >= 0 && windowMode(rows[index]);
  return reactDom.createPortal(h(react.Fragment, null,
    ...rows.map(row => h(DockShortcut, { key: row.entry.key, dock, ...row, windowMode: windowMode(row),
      activate: (entry, button, event) => {
        rail.current?.hold(event);
        activate(entry, button);
      },
      close: (entry, event) => closeShortcut(entry, 'one', event),
      drop, getSessionId, getDropPreview, prepareShortcutLoad,
      reorder: (entry, address, after) => dock.reorder(entries, entry, entries.find(target => target.address === address), after),
      openMenu: (entry, event) => setMenu({ entry, x: event.clientX, y: event.clientY }) })),
    openEmpty && h(AddFloatButton, { onClick: openEmpty }),
    index >= 0 && h(FileMenu, {
      menu, close: closeMenu, label: '文件预览操作',
      invoke: mode => {
        closeMenu();
        if (mode === 'switch') move(menu.entry, !menuWindowMode);
        else closeShortcut(menu.entry, mode);
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
