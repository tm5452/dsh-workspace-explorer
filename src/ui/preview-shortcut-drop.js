function contains(rect, x, y) {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function shortcutDropTarget({ x, y, width, height, shelf, panes, fullscreen }) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const left = Math.max(0, shelf.left - (fullscreen ? 0 : 10));
  const right = Math.min(width - 6, shelf.right + 10);
  const inColumn = x >= shelf.left && x < shelf.right;
  const pane = panes.length > 1 && panes.find(candidate => contains(candidate.rect, x, y));
  if (pane && !inColumn) return { mode: 'sidebar', paneId: pane.id, node: pane.node };
  if (inColumn || (x >= left && x < right)) {
    if (y >= shelf.top - 10 && y <= shelf.bottom + 10) return { mode: 'reorder' };
    return;
  }
  return { mode: x < left ? 'window' : 'sidebar', x, y };
}
