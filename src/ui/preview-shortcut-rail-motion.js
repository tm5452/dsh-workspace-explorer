import { cloneTabIcon } from './drag-icon.js';

function readSlots(host) {
  return new Map([...host.querySelectorAll(':scope > [data-dwe-float-dock-slot]')]
    .map(slot => [slot.dataset.dweFloatDockSlot, { slot, rect: slot.getBoundingClientRect() }]));
}

function exitSnapshot(slot, rect) {
  const snapshot = cloneTabIcon(slot);
  snapshot.inert = true;
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.removeAttribute('data-dwe-float-dock-slot');
  snapshot.removeAttribute('data-dwe-shortcut-keyboard-focus');
  snapshot.removeAttribute('data-dwe-shortcut-motion-hover');
  snapshot.setAttribute('data-dwe-shortcut-row-ghost', '');
  Object.assign(snapshot.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px' });
  const parts = [
    ['.dwe-float-dock-button', ['transform', 'visibility']],
    ['.dwe-float-dock-label', ['transform', 'scale', 'opacity', 'visibility']],
    ['.dwe-float-dock-label-actions', ['inlineSize', 'visibility']],
    ['.dwe-float-dock-label-close', ['backgroundColor']],
  ];
  for (const [selector, properties] of parts) {
    const computed = getComputedStyle(slot.querySelector(selector));
    const { style } = snapshot.querySelector(selector);
    style.transition = 'none';
    for (const property of properties) style[property] = computed[property];
  }
  return snapshot;
}

function expandedBounds(slot, rect, fullscreen) {
  const label = slot.querySelector('.dwe-float-dock-label');
  const actions = label.querySelector('.dwe-float-dock-label-actions');
  const close = actions.firstElementChild;
  const style = getComputedStyle(slot);
  const scale = parseFloat(style.getPropertyValue('--dwe-float-slot-hover-scale'));
  const gap = parseFloat(style.getPropertyValue('--dwe-float-label-gap'));
  const extra = parseFloat(style.getPropertyValue('--dwe-float-label-close-width'));
  const labelWidth = (label.offsetWidth - actions.offsetWidth + extra) * scale;
  const right = fullscreen ? rect.right + gap + labelWidth : rect.left - gap;
  const labelLeft = right - labelWidth;
  const inset = parseFloat(getComputedStyle(label).borderRightWidth) + parseFloat(getComputedStyle(close).marginRight);
  const width = close.offsetWidth * scale;
  const height = close.offsetHeight * scale;
  return {
    left: Math.min(rect.left, labelLeft), right: Math.max(rect.right, right),
    close: { left: right - inset * scale - width, top: rect.top + (rect.height - height) / 2, width, height },
  };
}

export function createShortcutRailMotion(host) {
  let delay;
  let heldPoint;
  let pending;
  let highlighted;
  let hit;
  const exits = new Set();
  const shifts = new Map();

  function enter(event) {
    if (heldPoint || event.pointerType === 'touch') return;
    clearTimeout(delay);
    delay = setTimeout(() => host.setAttribute('data-dwe-shortcut-labels-open', ''), 100);
  }

  function leave() {
    clearTimeout(delay);
    if (!heldPoint) host.removeAttribute('data-dwe-shortcut-labels-open');
  }

  function clearHandoff() {
    highlighted?.removeAttribute('data-dwe-shortcut-motion-hover');
    highlighted = undefined;
    hit?.remove();
    hit = undefined;
    host.removeAttribute('data-dwe-shortcut-hover-handoff');
  }

  function release() {
    heldPoint = undefined;
    window.removeEventListener('pointermove', resume, true);
    clearHandoff();
  }

  function resume(event) {
    if (!heldPoint || (Math.abs(event.clientX - heldPoint.x) < 1 && Math.abs(event.clientY - heldPoint.y) < 1)) return;
    release();
    if (!host.contains(event.target)) leave();
  }

  function blur() {
    release();
    leave();
  }

  function clearShifts() {
    for (const animation of shifts.values()) animation.cancel();
    shifts.clear();
  }

  function handoff(rows, onClose) {
    clearHandoff();
    if (!heldPoint) return;
    host.setAttribute('data-dwe-shortcut-hover-handoff', '');
    const { x, y } = heldPoint;
    const next = [...rows].find(([, { rect }]) => y >= rect.top && y < rect.bottom);
    if (!next) return;
    const [address, { slot, rect }] = next;
    const bounds = expandedBounds(slot, rect, Boolean(host.closest('[data-dwe-shortcuts-fullscreen]')));
    if (x < bounds.left || x >= bounds.right) return;
    highlighted = slot;
    slot.setAttribute('data-dwe-shortcut-motion-hover', '');
    const { left, top, width, height } = bounds.close;
    if (x < left || x >= left + width || y < top || y >= top + height) return;

    // The cursor sees the next close target in its final place while its row slides in.
    hit = document.createElement('div');
    hit.className = 'dwe-float-dock-close-hit';
    hit.setAttribute('aria-hidden', 'true');
    Object.assign(hit.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
    hit.addEventListener('click', event => onClose(address, event));
    host.append(hit);
  }

  host.addEventListener('pointerenter', enter);
  host.addEventListener('pointerleave', leave);
  window.addEventListener('blur', blur);
  return {
    hold(event) {
      if (!event?.detail || !host.hasAttribute('data-dwe-shortcut-labels-open')) return;
      heldPoint = { x: event.clientX, y: event.clientY };
      window.addEventListener('pointermove', resume, true);
    },
    captureClose(addresses) {
      const rows = readSlots(host);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      pending ??= { closing: new Map() };
      pending.before = rows;
      for (const address of addresses) {
        const row = rows.get(address);
        if (row && !pending.closing.has(address)) {
          pending.closing.set(address, reduced ? null : exitSnapshot(row.slot, row.rect));
        }
      }
    },
    sync(onClose) {
      if (!pending) return;
      const remaining = new Set([...host.querySelectorAll(':scope > [data-dwe-float-dock-slot]')]
        .map(slot => slot.dataset.dweFloatDockSlot));
      const closed = [...pending.closing].filter(([address]) => !remaining.has(address));
      if (!closed.length) return;
      const before = pending.before;
      for (const [address] of closed) pending.closing.delete(address);
      const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      clearShifts();
      const rows = readSlots(host);
      pending.before = rows;
      if (!pending.closing.size) pending = undefined;

      handoff(rows, onClose);
      if (animate) {
        for (const [, snapshot] of closed) {
          if (!snapshot) continue;
          host.append(snapshot);
          const animation = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 115, easing: 'ease-out' });
          exits.add(animation);
          animation.onfinish = animation.oncancel = () => {
            snapshot.remove();
            exits.delete(animation);
          };
        }
        for (const [address, { slot, rect }] of rows) {
          const old = before.get(address);
          if (!old || old.rect.top === rect.top) continue;
          const animation = slot.animate([
            { transform: 'translateY(' + (old.rect.top - rect.top) + 'px)' }, { transform: 'translateY(0)' },
          ], { duration: 230, easing: 'cubic-bezier(.35, 0, .25, 1)' });
          shifts.set(slot, animation);
          animation.onfinish = () => {
            if (shifts.get(slot) !== animation) return;
            shifts.delete(slot);
            if (!shifts.size) hit?.remove();
          };
        }
      }
      if (!shifts.size) hit?.remove();
    },
    dispose() {
      blur();
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', blur);
      clearShifts();
      for (const animation of exits) {
        animation.effect.target.remove();
        animation.cancel();
      }
    },
  };
}
