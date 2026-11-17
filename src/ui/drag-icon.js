import { mountIcon } from './interface-icon.js';
import { fileIcon } from './file-icon.js';

export function createDragIcon() {
  const element = document.createElement('div');
  element.className = 'dwe-conversation-drag-icon';
  element.setAttribute('aria-hidden', 'true');
  const root = reactDomClient.createRoot(element);
  return {
    element,
    show(path) {
      root.render(fileIcon(path, 'file', 28));
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

function cloneTabIcon(icon) {
  const copy = icon.cloneNode(true);
  const elementsWithIds = copy.querySelectorAll('[id]');
  if (!elementsWithIds.length) return copy;
  const prefix = 'dwe-drag-' + crypto.randomUUID() + '-';
  const ids = new Map();
  for (const element of elementsWithIds) {
    ids.set(element.id, prefix + element.id);
    element.id = prefix + element.id;
  }
  for (const element of copy.querySelectorAll('*')) {
    for (const attr of element.attributes) {
      if (attr.localName === 'href' && attr.value.startsWith('#')) {
        attr.value = '#' + (ids.get(attr.value.slice(1)) ?? attr.value.slice(1));
      } else if (attr.value.includes('url(#')) {
        attr.value = attr.value.replace(/url\(#([^)]*)\)/g, (_, id) => 'url(#' + (ids.get(id) ?? id) + ')');
      }
    }
  }
  return copy;
}

export function createTabDragIcon(icon) {
  const badge = document.createElement('div');
  badge.className = 'dwe-sidebar-tab-drag';
  badge.setAttribute('aria-hidden', 'true');
  if (icon) badge.append(cloneTabIcon(icon));
  else {
    const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fallback.setAttribute('fill', 'none');
    mountIcon(fallback, 'tab-fallback');
    badge.append(fallback);
  }
  return {
    move(x, y) {
      badge.style.setProperty('--dwe-drag-x', x + 12 + 'px');
      badge.style.setProperty('--dwe-drag-y', y + 12 + 'px');
      if (!badge.isConnected) document.body.append(badge);
    },
    dispose() { badge.remove(); },
  };
}
