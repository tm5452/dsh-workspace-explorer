import { extensionAreas } from '../extensions/registry.js';
import { ExtensionButtons } from '../ui/extension-controls.js';
import { mountIcon } from '../ui/interface-icon.js';
import { hasDockedTabs, openSidebar } from './sidebar-close.js';

const panelSelector = '[data-sidebar-right-panel]';
const cornerSelector = '[data-conversation-header-corner]';
const stripSelector = '[data-dockkit-strip]';
const expandSelector = 'button[data-sidebar-right-expand]:not(:disabled)';
const toggleSelector = '[data-sidebar-right-toggle]';
const modeSelector = '[data-sidebar-right-mode]';
const splitSelector = '[data-dockkit-split-button]';
const chromeSelector = '[data-dockkit-strip-chrome]';
const sourceSelectors = [
  toggleSelector,
  splitSelector,
  modeSelector,
];
const watched = [panelSelector, cornerSelector, stripSelector, '[data-rightbar-col]', '[data-rightbar-collapsed]'].join(', ');

function length(style, property) {
  return Number.parseFloat(style[property]) || 0;
}

function hasSplitRoom({ strip, pane, split, chrome }) {
  const paneWidth = pane.getBoundingClientRect().width;
  const stripWidth = strip.getBoundingClientRect().width;
  if (!paneWidth || !stripWidth) return true;
  const widthOf = selector => strip.querySelector(selector)?.getBoundingClientRect().width ?? 0;
  const gap = length(getComputedStyle(strip), 'columnGap');
  const removedWidth = node => {
    if (!node || getComputedStyle(node).position !== 'absolute') return 0;
    const style = getComputedStyle(node);
    return node.getBoundingClientRect().width + length(style, 'marginLeft') + length(style, 'marginRight') + gap;
  };
  const firstTab = strip.querySelector('[data-dockkit-tab]');
  const tabStyle = firstTab && getComputedStyle(firstTab);
  let minTab = tabStyle ? length(tabStyle, 'minWidth') : 0;
  if (minTab && tabStyle.boxSizing !== 'border-box') {
    minTab += length(tabStyle, 'paddingLeft') + length(tabStyle, 'paddingRight')
      + length(tabStyle, 'borderLeftWidth') + length(tabStyle, 'borderRightWidth');
  }
  // Reconstruct DockKit's strip budget with the native chrome back in the row.
  const fixed = Math.max(0, stripWidth - widthOf('[data-dockkit-strip-tabs]') - widthOf('[data-dockkit-strip-fill]'))
    + removedWidth(split) + removedWidth(chrome);
  return paneWidth / 2 - Math.max(0, paneWidth - stripWidth) >= fixed + (minTab || 100);
}

export function installSidebarHeaderControls(sidebar, preferences, floatDockHost) {
  const group = document.createElement('div');
  group.className = 'dwe-sidebar-header-controls';
  group.setAttribute('data-dwe-shortcuts-detached', '');
  let sources = [];
  let frame = 0;
  let activePanel;
  let fullscreenPanel;
  let observedHeader;
  let observedStrip;
  let anchor;
  let wideStrip;
  const nativeCanSplit = sidebar.canSplitPane;
  function canSplitPane(sessionId, paneId) {
    if (wideStrip && wideStrip.session === sessionId && wideStrip.paneId === paneId && !hasSplitRoom(wideStrip)) return false;
    return nativeCanSplit.call(this, sessionId, paneId);
  }
  if (typeof nativeCanSplit === 'function') sidebar.canSplitPane = canSplitPane;
  function sidebarIsVisible() {
    const layout = sidebar.mountedSurface?.()?.layout;
    return sidebar.isExpanded() && activePanel?.dataset.sidebarRightSession === sidebar.mounted.getSnapshot()
      && activePanel?.hasAttribute('data-sidebar-right-open') && (!layout || hasDockedTabs(layout));
  }

  const proxies = sourceSelectors.map((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    if (index === 0) button.setAttribute('data-dwe-sidebar-toggle-proxy', '');
    button.hidden = true;
    button.addEventListener('click', () => {
      if (index === 0) {
        const session = sidebar.mounted.getSnapshot();
        if (sidebarIsVisible() && sources[0]?.matches(toggleSelector)) sidebar.toggleExpanded();
        else openSidebar(sidebar, session, { recover: true });
        schedule();
        return;
      }
      const source = sources[index];
      if (index === 1 && wideStrip && !hasSplitRoom(wideStrip)) return;
      if (source?.isConnected) source.click();
    });
    group.append(button);
    return button;
  });
  const extensionArea = extensionAreas.sidebarShortcuts;
  let extensionRoot;
  let extensionSession;
  if (preferences?.registry.buttons(extensionArea).length) {
    const host = document.createElement('div');
    host.className = 'dwe-shortcut-extensions';
    group.append(host);
    extensionRoot = reactDomClient.createRoot(host);
  }
  if (floatDockHost) group.append(floatDockHost);
  // Keep the controls mounted while the host swaps the conversation header.
  document.body.append(group);

  function position(corner) {
    if (anchor !== corner) {
      if (anchor) {
        anchor.removeAttribute('data-dwe-shortcut-offset');
        resize.unobserve(anchor);
      }
      anchor = corner;
      if (anchor) {
        anchor.setAttribute('data-dwe-shortcut-offset', '');
        resize.observe(anchor);
      }
    }
    group.toggleAttribute('data-dwe-shortcuts-detached', !anchor);
    if (!anchor) {
      group.style.removeProperty('--dwe-shortcut-available-width');
      return;
    }
    const bounds = anchor.getBoundingClientRect();
    const toolSize = Number.parseFloat(getComputedStyle(group).getPropertyValue('--dwe-tool-size')) || 28;
    const top = bounds.top + (bounds.height - toolSize) / 2;
    const right = document.documentElement.clientWidth - bounds.right;
    group.style.setProperty('--dwe-shortcut-top', top + 'px');
    group.style.setProperty('--dwe-shortcut-right', right + 'px');
    group.style.setProperty('--dwe-shortcut-available-width', Math.max(toolSize, bounds.right - 8) + 'px');
  }

  function showExpand() {
    const button = proxies[0];
    button.hidden = false;
    button.disabled = false;
    button.title = '展开右侧栏';
    button.setAttribute('aria-label', button.title);
    for (const attr of ['aria-pressed', 'aria-expanded', 'aria-keyshortcuts']) button.removeAttribute(attr);
    const glyph = button.firstElementChild?.hasAttribute('data-dwe-expand-fallback') && button.firstElementChild;
    if (!glyph) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('data-dwe-expand-fallback', '');
      mountIcon(svg, 'dock-to-sidebar');
      button.replaceChildren(svg);
    }
  }

  function clear(corner = null) {
    position(corner);
    for (const button of proxies) button.hidden = true;
    for (const source of sources) source?.removeAttribute('data-dwe-header-proxied');
    sources = [];
    wideStrip?.strip.removeAttribute('data-dwe-wide-tabs');
    wideStrip = undefined;
    if (observedStrip) resize.unobserve(observedStrip);
    observedStrip = undefined;
  }

  function sync() {
    frame = 0;
    const session = sidebar.mounted.getSnapshot();
    group.hidden = !session;
    const panel = session && document.querySelector(
      panelSelector + '[data-sidebar-right-session="' + CSS.escape(session) + '"]',
    );
    activePanel = panel;
    const expanded = sidebarIsVisible();
    const fullscreen = expanded && panel?.dataset.sidebarRightPanel === 'fullscreen';
    const railPanel = fullscreen ? panel : undefined;
    if (fullscreenPanel !== railPanel) {
      if (fullscreenPanel) resize.unobserve(fullscreenPanel);
      if (railPanel) resize.observe(railPanel);
      fullscreenPanel = railPanel;
    }
    group.toggleAttribute('data-dwe-shortcuts-fullscreen', Boolean(fullscreen));
    if (railPanel) group.style.setProperty('--dwe-shortcut-panel-left', railPanel.getBoundingClientRect().left + 'px');
    else group.style.removeProperty('--dwe-shortcut-panel-left');
    const conversation = panel?.closest('[data-rightbar-col]')?.previousElementSibling;
    let corner = conversation?.querySelector('header ' + cornerSelector);
    if (session && !expanded && !corner?.querySelector(expandSelector)) {
      corner = [...document.querySelectorAll(cornerSelector)].find(node => node.getClientRects().length
        && !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.querySelector(expandSelector)) ?? corner;
    }
    const header = corner?.closest('header');
    if (header !== observedHeader) {
      if (observedHeader) resize.unobserve(observedHeader);
      if (header) resize.observe(header);
      observedHeader = header;
    }
    const chrome = expanded ? panel?.querySelector(chromeSelector) : null;
    const strip = chrome?.closest(stripSelector);
    if (!session || (expanded && !strip) || (!expanded && !header)) {
      clear(fullscreen ? null : corner);
      if (session && !expanded) showExpand();
      return;
    }

    const next = expanded ? sourceSelectors.map(selector => strip.querySelector('button' + selector))
      : [corner?.querySelector(expandSelector), null, null];
    if (!next[0] || (expanded && !next[2])) {
      clear(fullscreen ? null : corner);
      if (session && !expanded) showExpand();
      return;
    }
    for (const source of sources) {
      if (source && !next.includes(source)) source.removeAttribute('data-dwe-header-proxied');
    }
    sources = next;
    for (const source of sources) source?.setAttribute('data-dwe-header-proxied', '');
    const pane = strip?.closest('[data-dockkit-pane]');
    const splitButton = sources[1];
    if (wideStrip?.strip !== strip) wideStrip?.strip.removeAttribute('data-dwe-wide-tabs');
    wideStrip = undefined;
    if (pane && typeof nativeCanSplit === 'function') {
      wideStrip = { session, strip, pane, paneId: pane.dataset.dockkitPane, chrome,
        split: splitButton?.closest('[data-dockkit-split-control]') ?? splitButton };
      strip.setAttribute('data-dwe-wide-tabs', '');
    }
    if (strip !== observedStrip) {
      if (observedStrip) resize.unobserve(observedStrip);
      if (strip) resize.observe(strip);
      observedStrip = strip;
    }
    const blockedByWidth = wideStrip && !hasSplitRoom(wideStrip);
    const menuIcon = header?.querySelector('button[class*="headerMenuButton"] svg');
    const iconSize = menuIcon?.getBoundingClientRect().width;
    const size = iconSize > 0 ? iconSize + 'px' : '';
    if (group.style.getPropertyValue('--dwe-shortcut-icon-size') !== size) {
      group.style.setProperty('--dwe-shortcut-icon-size', size);
    }
    for (const [index, button] of proxies.entries()) {
      const source = sources[index];
      button.hidden = !source;
      if (!source) continue;
      const label = source.getAttribute('aria-label') || '';
      const shortcut = source.getAttribute('aria-keyshortcuts');
      const reason = source.disabled ? source.parentElement?.getAttribute('aria-label') : null;
      button.disabled = source.disabled || (index === 1 && Boolean(blockedByWidth));
      button.title = [reason || label, shortcut].filter(Boolean).join(' · ');
      button.setAttribute('aria-label', label);
      for (const attribute of ['aria-pressed', 'aria-expanded']) {
        const value = source.getAttribute(attribute);
        if (value !== null) button.setAttribute(attribute, value);
        else button.removeAttribute(attribute);
      }
      if (shortcut) button.setAttribute('aria-keyshortcuts', shortcut);
      else button.removeAttribute('aria-keyshortcuts');
      const glyph = source.querySelector('svg');
      if (glyph && button.firstElementChild?.outerHTML !== glyph.outerHTML) button.replaceChildren(glyph.cloneNode(true));
    }
    position(fullscreen ? null : corner ?? (anchor?.isConnected ? anchor : null));
    if (extensionRoot && session !== extensionSession) {
      extensionSession = session;
      extensionRoot.render(react.createElement(ExtensionButtons, { preferences, area: extensionArea,
        context: Object.freeze({ sessionId: session }) }));
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  const resize = new ResizeObserver(schedule);
  const observer = new MutationObserver(records => {
    if (records.some(({ target, addedNodes, removedNodes }) => target instanceof Element && !group.contains(target) &&
      (target.closest(watched) || [...addedNodes, ...removedNodes].some(node =>
        node instanceof Element && (node.matches(watched) || node.querySelector(watched)))))) schedule();
  });
  observer.observe(document.body, {
    subtree: true, childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden', 'aria-label', 'aria-keyshortcuts', 'aria-pressed', 'aria-expanded', 'data-sidebar-right-panel',
      'data-sidebar-right-open', 'data-dockkit-split-blocked', 'data-sidebar-right-mode',
      'data-rightbar-collapsed', 'data-rightbar-fullscreen', 'aria-hidden', 'inert'],
  });
  const stop = sidebar.mounted.subscribe(schedule);
  const stopTabs = sidebar.openTabs?.subscribe(schedule);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    stop();
    stopTabs?.();
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
    extensionRoot?.unmount();
    clear();
    group.remove();
    if (sidebar.canSplitPane === canSplitPane) sidebar.canSplitPane = nativeCanSplit;
  };
}
