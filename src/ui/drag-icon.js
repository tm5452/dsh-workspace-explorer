export function createDragIcon() {
  const element = document.createElement('div');
  element.className = 'dwe-conversation-drag-icon';
  element.setAttribute('aria-hidden', 'true');
  const root = reactDomClient.createRoot(element);
  return {
    element,
    show(path) {
      root.render(react.createElement(primitives.FileTypeIcon, { path, size: 28 }));
    },
    move(x, y) {
      element.style.setProperty('--dwe-drag-x', x + 12 + 'px');
      element.style.setProperty('--dwe-drag-y', y + 12 + 'px');
    },
    dispose() {
      element.remove();
      root.unmount();
    },
  };
}

export function createTabDragIcon(icon) {
  const badge = document.createElement('div');
  badge.className = 'dwe-sidebar-tab-drag';
  badge.setAttribute('aria-hidden', 'true');
  if (icon) badge.append(icon.cloneNode(true));
  else badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16"/></svg>';
  return {
    move(x, y) {
      badge.style.setProperty('--dwe-drag-x', x + 12 + 'px');
      badge.style.setProperty('--dwe-drag-y', y + 12 + 'px');
      if (!badge.isConnected) document.body.append(badge);
    },
    dispose() { badge.remove(); },
  };
}
