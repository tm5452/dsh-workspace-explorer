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
