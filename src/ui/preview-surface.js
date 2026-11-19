import { Preview, PreviewBoundary } from './preview.js';
import { IconButton } from './extension-controls.js';
import { resourceAddress } from './navigation.js';
import { disks } from './workspace.js';

const h = react.createElement;

export function PreviewWindowHandle({ enabled, detach }) {
  const drag = react.useRef(null);
  function endDrag() {
    const active = drag.current;
    active?.listeners.abort();
    active?.badge?.remove();
    if (active?.badge) document.documentElement.removeAttribute('data-dwe-preview-window-dragging');
    drag.current = null;
  }
  react.useEffect(() => () => { endDrag(); }, []);
  if (!enabled) return h('span', { className: 'dwe-preview-label' }, '预览');
  return h('span', {
    className: 'dwe-preview-label',
    'data-dwe-preview-window-handle': '',
    title: '拖出预览小窗',
    onPointerDown(event) {
      if (!event.isPrimary || event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const { pointerId, clientX, clientY } = event;
      const active = { listeners: new AbortController(), badge: null };
      drag.current = active;
      const options = { capture: true, signal: active.listeners.signal };
      const passedThreshold = point => Math.hypot(point.clientX - clientX, point.clientY - clientY) >= 6;
      window.addEventListener('pointermove', point => {
        if (point.pointerId !== pointerId) return;
        if (!active.badge && passedThreshold(point)) {
          active.badge = document.createElement('div');
          active.badge.className = 'dwe-sidebar-tab-drag dwe-preview-window-drag';
          active.badge.setAttribute('aria-hidden', 'true');
          active.badge.textContent = '预览';
          document.documentElement.setAttribute('data-dwe-preview-window-dragging', '');
          document.body.append(active.badge);
        }
        if (!active.badge) return;
        active.badge.style.setProperty('--dwe-drag-x', point.clientX + 12 + 'px');
        active.badge.style.setProperty('--dwe-drag-y', point.clientY + 12 + 'px');
      }, options);
      window.addEventListener('pointerup', point => {
        if (point.pointerId !== pointerId) return;
        endDrag();
        if (active.badge || passedThreshold(point)) detach({ x: point.clientX, y: point.clientY });
      }, options);
      window.addEventListener('pointercancel', point => {
        if (point.pointerId === pointerId) endDrag();
      }, options);
      window.addEventListener('blur', endDrag, options);
    },
  }, '预览');
}

// Reparent a connected preview without unloading its iframe or media elements.
export function movePreview(host, destination) {
  if (!destination || host.parentNode === destination) return;
  if (host.isConnected && destination.isConnected && destination.moveBefore) {
    destination.moveBefore(host, null);
  } else destination.appendChild(host);
}

export function parkPreview(host, parking) {
  if (host.parentNode === parking) return;
  const { width, height } = host.getBoundingClientRect();
  if (width && height) {
    host.style.setProperty('--dwe-parked-width', width + 'px');
    host.style.setProperty('--dwe-parked-height', height + 'px');
  }
  movePreview(host, parking);
}

export function PreviewFullscreenButton({ exit, onClick }) {
  return h(IconButton, { name: exit ? 'preview-exit-fullscreen' : 'preview-fullscreen',
    className: 'dwe-preview-fullscreen', label: exit ? '退出预览全屏' : '预览全屏', onClick });
}

export function PreviewNativeButton({ onClick, disabled }) {
  return h(IconButton, { name: 'external', toolId: 'external', className: 'dwe-preview-open-native',
    label: '在 DSH 文档预览中打开', onClick, disabled });
}

export async function openNativePreview(file, root, target, isCurrent, openDocument) {
  if (!target?.sessionId || !file) return;
  if (root) await disks.locate(file.absolute, undefined, root);
  if (!isCurrent()) return;
  openDocument(resourceAddress(file.absolute, target.sessionId), {
    paneId: target.paneId, params: file.line ? { line: file.line } : undefined,
  });
}

export function InlinePreview({ previewKey, file, root, inline, full, bind, confirmed, ...props }) {
  const [surface] = react.useState(() => {
    const host = document.createElement('div');
    host.className = 'dwe-preview-surface';
    return { host, file, root, previewKey };
  });
  surface.file = file;
  react.useLayoutEffect(() => {
    if (inline?.isConnected) movePreview(surface.host, inline);
  });
  react.useLayoutEffect(() => bind(surface), [bind, surface]);
  return reactDom.createPortal(h(PreviewBoundary, { standalone: full },
    h(Preview, { file, root, ...props, openImmediately: full, confirmed: full || confirmed })), surface.host);
}
