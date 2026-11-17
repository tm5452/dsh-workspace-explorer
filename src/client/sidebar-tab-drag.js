const tabSelector = '[data-sidebar-right-panel] [data-dockkit-strip-tabs] [data-dockkit-tab]';
const workspaceTabSelector = tabSelector + '[aria-selected="false"]:has([data-dwe-workspace-tab])';
const dragThreshold = 4; // Matches DockKit's per-axis drag threshold.

export function installSidebarTabInteractions(mounted) {
  const lifetime = new AbortController();
  const options = { capture: true, signal: lifetime.signal };
  let drag;
  const anchors = new Map();

  function clearAnchor(state, openWaiting = true) {
    const { tab, strip, waiting } = state;
    clearTimeout(state.timer);
    tab.removeAttribute('data-dwe-tab-expand-left');
    tab.removeAttribute('data-dwe-tab-snap');
    tab.style.removeProperty('--dwe-tab-fit-width');
    strip.style.removeProperty('--dwe-left-expansion-inset');
    anchors.delete(strip);
    waiting?.removeAttribute('data-dwe-tab-wait');
    if (openWaiting && waiting?.matches(workspaceTabSelector + ':hover')) chooseDirection(waiting, strip);
  }

  function clearAnchors() {
    for (const state of anchors.values()) clearAnchor(state, false);
  }

  function settle(state) {
    clearTimeout(state.timer);
    if (state.closing) clearAnchor(state);
    else state.tab.removeAttribute('data-dwe-tab-snap');
  }

  function waitForTransition(state, opening) {
    clearTimeout(state.timer);
    const duration = Number.parseFloat(getComputedStyle(state.tab).getPropertyValue('--dwe-workspace-tab-duration')) || 0;
    state.timer = setTimeout(() => settle(state), duration + (opening ? 50 : 0) + 32);
  }

  function enterTab(event) {
    const tab = event.target instanceof Element && event.target.closest(workspaceTabSelector);
    if (event.pointerType !== 'mouse' || event.buttons || !tab || tab.contains(event.relatedTarget)) return;
    const strip = tab.closest('[data-dockkit-strip-tabs]');
    const state = anchors.get(strip);
    if (!state) {
      chooseDirection(tab, strip);
    } else if (state.tab === tab) {
      state.closing = false;
      waitForTransition(state, true);
    } else {
      state.waiting?.removeAttribute('data-dwe-tab-wait');
      state.waiting = tab;
      tab.setAttribute('data-dwe-tab-wait', '');
    }
  }

  function chooseDirection(tab, strip) {
    const bounds = strip.getBoundingClientRect();
    const scale = bounds.width / strip.offsetWidth;
    if (!scale) return;
    const pane = strip.closest('[data-dockkit-pane]');
    const panel = strip.closest('[data-sidebar-right-panel]').getBoundingClientRect();
    const paneBounds = pane?.getBoundingClientRect() ?? panel;
    const left = Math.max(0, bounds.left, panel.left, paneBounds.left);
    const fill = strip.parentElement.querySelector(':scope > [data-dockkit-strip-fill]');
    const right = Math.min(panel.right, paneBounds.right, document.documentElement.clientWidth,
      bounds.right + (fill?.getBoundingClientRect().width ?? 0));
    if (right <= left) return;

    const chip = tab.getBoundingClientRect();
    const title = tab.querySelector('[data-dwe-workspace-tab]');
    const style = getComputedStyle(tab);
    const font = Number.parseFloat(style.fontSize);
    const minWidth = 5 * font + 59;
    const maxWidth = Math.max(170, minWidth);
    const gap = Number.parseFloat(getComputedStyle(title).columnGap) || 0;
    const naturalWidth = (title.lastElementChild?.scrollWidth ?? 0) + (title.firstElementChild?.getBoundingClientRect().width ?? 0) / scale
      + gap + Number.parseFloat(style.paddingInlineStart) + 27;
    const fullWidth = Math.min(maxWidth, Math.max(minWidth, naturalWidth));
    if (Math.max(chip.left, left) + fullWidth * scale <= right + 0.5) {
      if (chip.left < left - 0.5) strip.scrollBy({ left: (chip.left - left) / scale, behavior: 'instant' });
      return;
    }

    const fitWidth = Math.floor((right - left) / scale);
    const anchor = Math.min(right, Math.max(chip.right, left + Math.min(fullWidth, fitWidth) * scale));
    const inset = Math.max(0, (right - anchor) / scale);
    const state = { tab, strip, closing: false };
    anchors.set(strip, state);
    strip.style.setProperty('--dwe-left-expansion-inset', inset + 'px');
    tab.style.setProperty('--dwe-tab-fit-width', fitWidth + 'px');
    tab.setAttribute('data-dwe-tab-expand-left', '');
    tab.setAttribute('data-dwe-tab-snap', '');
    waitForTransition(state, true);
  }

  function leaveTab(event) {
    const tab = event.target instanceof Element && event.target.closest(tabSelector);
    const state = tab && anchors.get(tab.closest('[data-dockkit-strip-tabs]'));
    if (!state || tab.contains(event.relatedTarget)) return;
    if (state.waiting === tab) {
      tab.removeAttribute('data-dwe-tab-wait');
      state.waiting = undefined;
    } else if (state.tab === tab) {
      if (!tab.hasAttribute('data-dwe-tab-snap')) {
        const bounds = state.strip.getBoundingClientRect();
        const scale = bounds.width / state.strip.offsetWidth || 1;
        const inset = Math.max(0, (bounds.right - tab.getBoundingClientRect().right) / scale);
        state.strip.style.setProperty('--dwe-left-expansion-inset', inset + 'px');
        tab.setAttribute('data-dwe-tab-snap', '');
      }
      state.closing = true;
      waitForTransition(state, false);
    }
  }

  function selectTab(event) {
    if (!(event.target instanceof Element) || event.target.closest('[data-dockkit-tab-close]')) return;
    const tab = event.target.closest(tabSelector);
    const state = tab && anchors.get(tab.closest('[data-dockkit-strip-tabs]'));
    if (state?.tab === tab) clearAnchor(state);
  }

  function reset() {
    drag?.badge?.dispose();
    drag = undefined;
  }

  function start(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    reset();
    const target = event.target;
    if (!(target instanceof Element) || target.closest('button, [role="menu"]')) return;
    const tab = target.closest(tabSelector);
    if (tab) drag = { tab, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function move(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { tab, pointerId, x, y } = drag;
    if (!(event.buttons & 1) || tab.dataset.dockkitPointer !== String(pointerId)) {
      reset();
      return;
    }
    if (!drag.badge && Math.max(Math.abs(event.clientX - x), Math.abs(event.clientY - y)) < dragThreshold) return;
    if (!drag.badge) {
      const state = anchors.get(tab.closest('[data-dockkit-strip-tabs]'));
      if (state?.tab === tab) clearAnchor(state);
    }
    drag.badge ??= createTabDragIcon(tab.querySelector('[data-dockkit-tab-title] :is(svg, img)'));
    drag.badge.move(event.clientX, event.clientY);
  }

  function finish(event) {
    if (drag?.pointerId === event.pointerId) reset();
  }

  const stop = mounted.subscribe(() => {
    reset();
    clearAnchors();
  });
  window.addEventListener('pointerover', enterTab, options);
  window.addEventListener('pointerout', leaveTab, options);
  window.addEventListener('click', selectTab, options);
  window.addEventListener('pointerdown', start, options);
  window.addEventListener('pointermove', move, options);
  window.addEventListener('pointerup', finish, options);
  window.addEventListener('pointercancel', finish, options);
  window.addEventListener('lostpointercapture', finish, options);
  window.addEventListener('blur', event => {
    if (event.target !== window) return;
    reset();
  }, options);
  return () => {
    lifetime.abort();
    stop();
    reset();
    clearAnchors();
  };
}
import { createTabDragIcon } from '../ui/drag-icon.js';
