import { createPreviewShortcutMotion } from './preview-shortcut-motion.js';

const motionAttribute = 'data-dwe-float-motion';
const collapsingAttribute = 'data-dwe-float-collapsing';

export function createPreviewFloatDock({ focus, close, persist }) {
  const windows = new Map();
  const slots = new WeakMap();
  const listeners = new Set();
  let revision = 0;
  let order = Date.now();
  const dockedLabel = entry => entry.host?.querySelector('[data-dwe-docked-preview] .dwe-preview-drag');
  const shortcutMotion = createPreviewShortcutMotion((entry, destination) => destination === 'shortcut'
    ? slots.get(entry)?.querySelector('.dwe-float-dock-button') : dockedLabel(entry), publish);

  function publish() {
    revision++;
    for (const listener of listeners) listener();
  }

  function apply({ entry, element }) {
    const { maximized, dockOrder } = entry.window ?? {};
    element.toggleAttribute('data-dwe-float-maximized', Boolean(maximized));
    element.toggleAttribute('data-dwe-float-minimized', dockOrder !== undefined);
    element.inert = dockOrder !== undefined;
  }

  function cancelMotion(window) {
    cancelAnimationFrame(window.frame);
    window.animation?.cancel();
    window.animation = undefined;
    window.element.removeAttribute(motionAttribute);
    window.slot?.removeAttribute(collapsingAttribute);
  }

  function animate(window, source, destination) {
    if (!source?.width || !source.height || !destination?.width || !destination.height
        || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelMotion(window);
      return;
    }
    const { element } = window;
    const base = element.getBoundingClientRect();
    const animation = element.animate([source, destination].map(rect => ({
      transformOrigin: '0 0',
      transform: `translate(${rect.left - base.left}px, ${rect.top - base.top}px) scale(${rect.width / base.width}, ${rect.height / base.height})`,
    })), {
      duration: 260, easing: 'cubic-bezier(.18, .75, .28, 1)', fill: 'both',
    });
    window.animation = animation;
    animation.onfinish = () => {
      if (window.animation !== animation) return;
      // Keep the last frame at the target until the hide/restore state takes over.
      window.frame = requestAnimationFrame(() => cancelMotion(window));
    };
  }

  function setState(window, state) {
    window.entry.window = state;
    apply(window);
    persist(window.entry);
  }

  function canMinimize(window) {
    return window && window.slot && !window.docking && window.entry.window?.dockOrder === undefined;
  }

  function minimize(window) {
    const { element, entry } = window;
    const source = element.getBoundingClientRect();
    cancelMotion(window);
    element.setAttribute(motionAttribute, '');
    window.slot?.setAttribute(collapsingAttribute, '');
    setState(window, { ...entry.window, dockOrder: ++order,
      minimizedFromInline: entry.window?.restoreToInline || entry.window?.minimizedFromInline });
    window.frame = requestAnimationFrame(() => animate(window, source, window.slot?.getBoundingClientRect()));
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => revision,
    flyShortcut: shortcutMotion.start,
    retractPreviewToShortcut(entry) {
      const source = dockedLabel(entry);
      shortcutMotion.cancel(entry);
      shortcutMotion.start(entry, source, 'shortcut', { holdSource: true });
    },
    shortcutFlightState: shortcutMotion.state,
    cancelShortcutFlight: shortcutMotion.cancel,
    clearShortcutFlights: shortcutMotion.clear,
    installQuickMinimize(getMode) {
      const lifetime = new AbortController();
      const options = { capture: true, signal: lifetime.signal };
      const outside = event => event.isTrusted && event.button === 0 && event.target instanceof Element
        && !event.target.closest('[data-dwe-file-preview-float]');
      document.addEventListener('mousedown', event => {
        if (event.detail > 1 && getMode() === 'anywhere' && outside(event)
            && [...windows.values()].some(canMinimize)) event.preventDefault();
      }, options);
      document.addEventListener('click', event => {
        if (event.detail < 2 || !outside(event)) return;
        const mode = getMode();
        const trigger = mode === 'anywhere' && event.detail === 3
          || mode === 'composer' && event.detail === 2 && event.target.closest('[data-composer-card]');
        if (!trigger) return;
        const opened = [...windows.values()].filter(canMinimize);
        if (!opened.length) return;
        event.preventDefault();
        event.stopPropagation();
        for (const window of opened) minimize(window);
        publish();
      }, options);
      return () => lifetime.abort();
    },
    connect(entry, element) {
      const window = { entry, element, slot: slots.get(entry) };
      windows.set(entry, window);
      const shortcutOrder = entry.window?.shortcutOrder ?? entry.window?.dockOrder ?? ++order;
      order = Math.max(order, shortcutOrder);
      element.setAttribute('data-dwe-file-preview-float', '');
      setState(window, { ...entry.window, shortcutOrder });
      publish();
      return () => {
        if (windows.get(entry) !== window) return;
        cancelMotion(window);
        delete entry.floatControls;
        windows.delete(entry);
        for (const name of ['data-dwe-file-preview-float', 'data-dwe-float-minimized', 'data-dwe-float-maximized']) {
          element.removeAttribute(name);
        }
        element.inert = false;
        publish();
      };
    },
    setShortcutSlot(entry, slot) {
      if (slot) {
        slots.set(entry, slot);
        const shortcutOrder = entry.window?.shortcutOrder ?? ++order;
        order = Math.max(order, shortcutOrder);
        if (entry.window?.shortcutOrder === undefined) {
          entry.window = { ...entry.window, shortcutOrder };
          persist(entry);
        }
      } else slots.delete(entry);
      const window = windows.get(entry);
      if (!window) return;
      window.slot = slot;
      slot?.toggleAttribute(collapsingAttribute, entry.window?.dockOrder !== undefined
        && window.element.hasAttribute(motionAttribute));
    },
    raise: focus,
    refresh(entry) {
      const window = windows.get(entry);
      if (window) {
        cancelMotion(window);
        apply(window);
        publish();
      }
    },
    minimize(entry) {
      const window = windows.get(entry);
      if (!canMinimize(window)) return;
      minimize(window);
      publish();
    },
    maximize(entry, maximized = !entry.window?.maximized) {
      const window = windows.get(entry);
      if (!window || window.docking) return;
      setState(window, { ...entry.window, maximized, restoreToSidebar: maximized && entry.window?.restoreToSidebar,
        restoreToInline: maximized && entry.window?.restoreToInline });
      publish();
    },
    restore(entry, state) {
      const window = windows.get(entry);
      if (!window || window.docking) return;
      if (entry.window?.dockOrder === undefined) {
        focus(entry);
        return;
      }
      const source = window.element.hasAttribute(motionAttribute) ? window.element.getBoundingClientRect()
        : window.slot?.getBoundingClientRect();
      cancelMotion(window);
      window.element.setAttribute(motionAttribute, '');
      setState(window, { ...entry.window, ...state, dockOrder: undefined });
      focus(entry);
      animate(window, source, window.element.getBoundingClientRect());
      publish();
    },
    dockIntoSidebar(entry, transfer) {
      const window = windows.get(entry);
      if (!window || window.docking || !entry.stack.tabs.length) return;
      if (entry.window.dockOrder !== undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        transfer();
        return;
      }
      cancelMotion(window);
      window.docking = true;
      window.element.inert = true;
      const animation = window.element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150, easing: 'ease-out', fill: 'forwards',
      });
      window.animation = animation;
      animation.onfinish = () => {
        if (window.animation !== animation) return;
        let transferred;
        try { transferred = transfer(); }
        finally {
          if (!transferred && windows.get(entry) === window) {
            window.docking = false;
            cancelMotion(window);
            apply(window);
          }
        }
      };
    },
    close(list, entry, mode) {
      const index = list.indexOf(entry);
      if (index < 0) return;
      const targets = mode === 'all' ? list : mode === 'below' ? list.slice(index + 1) : [entry];
      for (const target of targets) {
        shortcutMotion.cancel(target);
        close(target);
      }
    },
    reorder(entries, entry, target, after) {
      const list = [...entries];
      if (entry === target || !list.includes(entry) || !list.includes(target)) return;
      list.splice(list.indexOf(entry), 1);
      list.splice(list.indexOf(target) + Number(after), 0, entry);
      for (const item of list) {
        item.window = { ...item.window, shortcutOrder: ++order };
        persist(item);
      }
      publish();
    },
  };
}
