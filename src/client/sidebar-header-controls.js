import { extensionAreas } from '../extensions/registry.js';
import { ExtensionButtons } from '../ui/extension-controls.js';

const panelSelector = '[data-sidebar-right-panel]';
const cornerSelector = '[data-conversation-header-corner]';
const stripSelector = '[data-dockkit-strip]';
const toggleSelector = '[data-sidebar-right-toggle]';
const modeSelector = '[data-sidebar-right-mode]';
const splitSelector = '[data-dockkit-split-button]';
const chromeSelector = '[data-dockkit-strip-chrome]';
const sourceSelectors = [
  toggleSelector,
  splitSelector,
  modeSelector,
];
const watched = [panelSelector, cornerSelector, stripSelector].join(', ');

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

export function installSidebarHeaderControls(sidebar, preferences) {
  const group = document.createElement('div');
  group.className = 'dwe-sidebar-header-controls';
  let sources = [];
  let frame = 0;
  let observedHeader;
  let observedStrip;
  let wideStrip;
  const nativeCanSplit = sidebar.canSplitPane;
  function canSplitPane(sessionId, paneId) {
    if (wideStrip && wideStrip.session === sessionId && wideStrip.paneId === paneId && !hasSplitRoom(wideStrip)) return false;
    return nativeCanSplit.call(this, sessionId, paneId);
  }
  if (typeof nativeCanSplit === 'function') sidebar.canSplitPane = canSplitPane;
  const proxies = sourceSelectors.map((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      const source = sources[index];
      if (index === 1 && wideStrip && !hasSplitRoom(wideStrip)) return;
      if (source?.isConnected && sidebar.isExpanded()) source.click();
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

  function clear() {
    group.remove();
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
    const panel = session && document.querySelector(
      panelSelector + '[data-sidebar-right-session="' + CSS.escape(session) + '"]',
    );
    const conversation = panel?.closest('[data-rightbar-col]')?.previousElementSibling;
    const corner = conversation?.querySelector('header ' + cornerSelector);
    const header = corner?.closest('header');
    if (header !== observedHeader) {
      if (observedHeader) resize.unobserve(observedHeader);
      if (header) resize.observe(header);
      observedHeader = header;
    }
    const chrome = panel?.querySelector(chromeSelector);
    const strip = chrome?.closest(stripSelector);
    if (!sidebar.isExpanded() || panel?.dataset.sidebarRightPanel !== 'push' || !strip ||
        !header || header.getBoundingClientRect().width < 180) {
      clear();
      return;
    }

    const next = sourceSelectors.map(selector => strip.querySelector('button' + selector));
    if (!next[0] || !next[2]) {
      clear();
      return;
    }
    for (const source of sources) {
      if (source && !next.includes(source)) source.removeAttribute('data-dwe-header-proxied');
    }
    sources = next;
    for (const source of sources) source?.setAttribute('data-dwe-header-proxied', '');
    const pane = strip.closest('[data-dockkit-pane]');
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
      resize.observe(strip);
      observedStrip = strip;
    }
    const blockedByWidth = wideStrip && !hasSplitRoom(wideStrip);
    const menuIcon = header.querySelector('button[class*="headerMenuButton"] svg');
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
    if (group.parentElement !== corner) corner.append(group);
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
      'data-sidebar-right-open', 'data-dockkit-split-blocked', 'data-sidebar-right-mode'],
  });
  const stop = sidebar.mounted.subscribe(schedule);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    stop();
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
    extensionRoot?.unmount();
    clear();
    if (sidebar.canSplitPane === canSplitPane) sidebar.canSplitPane = nativeCanSplit;
  };
}
