import { fileIcon } from './file-icon.js';
import { createTabDragIcon } from './drag-icon.js';

const { createElement: h, useEffect, useRef } = react;

export function PreviewFileLabel({ item, canDragOut, startPreviewDrag, contextMenu, labelRef, inFlight }) {
  const strip = useRef(null);
  const dragging = useRef(null);
  const { file } = item;

  function reset() {
    const drag = dragging.current;
    if (!drag) return;
    dragging.current = null;
    drag.listeners.abort();
    drag.external?.cancel();
    drag.badge?.dispose();
    if (drag.badge) document.documentElement.removeAttribute('data-dwe-preview-dragging');
  }

  useEffect(() => reset, []);

  function start(event) {
    if (event.button !== 0 || !event.isPrimary || !canDragOut || dragging.current) return;
    const source = event.currentTarget;
    const { clientX, clientY, pointerId, pointerType, isPrimary } = event;
    const listeners = new AbortController();
    const capture = { capture: true, signal: listeners.signal };
    const drag = { listeners };
    dragging.current = drag;

    window.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      if (!(event.buttons & 1)) { reset(); return; }
      const { clientX: x, clientY: y } = event;
      if (!drag.badge) {
        if (Math.hypot(x - clientX, y - clientY) <= 6) return;
        document.documentElement.setAttribute('data-dwe-preview-dragging', '');
        drag.external = startPreviewDrag?.(strip.current, file, { clientX, clientY, pointerId, pointerType, isPrimary });
        drag.badge = createTabDragIcon(source.querySelector('.dwe-preview-icon :is(svg, img)'));
      }
      drag.external?.move(x, y);
      drag.badge.move(x, y);
    }, capture);
    window.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      drag.external?.finish(event.clientX, event.clientY);
      reset();
    }, capture);
    window.addEventListener('pointercancel', reset, capture);
    window.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); }, capture);
    window.addEventListener('blur', reset, { signal: listeners.signal });
  }

  return h('div', { ref: strip, className: 'dwe-preview-tabs', role: 'group', 'aria-label': '预览文件', 'data-dwe-reference-only': true },
    h('div', { className: 'dwe-preview-name', onContextMenu: event => contextMenu?.(event, item) },
      h('button', {
        ref: labelRef, type: 'button', className: 'dwe-preview-drag', 'data-draggable': canDragOut || undefined,
        'data-dwe-shortcut-flight-target': inFlight || undefined, title: file.absolute, onDragStart: event => event.preventDefault(), onPointerDown: start,
      }, h('span', { className: 'dwe-preview-icon', 'aria-hidden': true }, fileIcon(file.name, 'file')),
      h('span', { className: 'dwe-preview-filename' }, file.name))));
}

export function headerBackdrop() {
  return h(react.Fragment, null,
    h('div', { className: 'dwe-header-blur', 'aria-hidden': true }),
    h('div', { className: 'dwe-header-tint', 'aria-hidden': true }));
}
