import { underPath } from './navigation.js';

export const emptyPreviewStack = { tabs: [], active: null, nextId: 1 };

export function previewInScope(tab, root) {
  return !root || underPath(tab.file.absolute, root);
}

export function openStackPreview(stack, file, root) {
  const { tabs, nextId } = stack;
  const existing = tabs.find(tab => tab.file.absolute.toLowerCase() === file.absolute.toLowerCase());
  if (existing) {
    const updated = file.line ? tabs.map(tab => tab === existing ? { ...tab, file } : tab) : tabs;
    return { ...stack, tabs: updated, active: existing.id };
  }
  const first = tabs.find(tab => previewInScope(tab, root));
  if (first && !first.pinned) {
    return { ...stack, tabs: tabs.map(tab => tab === first ? { ...tab, file, confirmed: false } : tab), active: first.id };
  }
  return { tabs: [{ id: nextId, file, pinned: false }, ...tabs], active: nextId, nextId: nextId + 1 };
}

export function confirmStackPreview(stack, id, file) {
  const target = stack.tabs.find(tab => tab.id === id && tab.file === file);
  if (!target || target.confirmed) return stack;
  return { ...stack, tabs: stack.tabs.map(tab => tab === target ? { ...tab, confirmed: true } : tab) };
}

export function moveStackPreview(stack, fromId, toId, after) {
  const from = stack.tabs.findIndex(tab => tab.id === fromId);
  const to = stack.tabs.findIndex(tab => tab.id === toId);
  if (from < 0 || to < 0 || from === to) return stack;
  const index = to + Number(after) - Number(from < to);
  if (index === from) return stack;
  const tabs = [...stack.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(index, 0, tab);
  return { ...stack, tabs };
}

export function removeStackPreviews(stack, shouldRemove, root) {
  const tabs = stack.tabs.filter(tab => !shouldRemove(tab));
  if (tabs.length === stack.tabs.length) return stack;
  if (tabs.some(tab => tab.id === stack.active)) return { ...stack, tabs };
  const visible = stack.tabs.filter(tab => previewInScope(tab, root));
  const activeIndex = visible.findIndex(tab => tab.id === stack.active);
  const adjacent = visible.slice(activeIndex + 1).find(tab => tabs.includes(tab))
    ?? visible.slice(0, Math.max(0, activeIndex)).findLast(tab => tabs.includes(tab));
  return { ...stack, tabs, active: adjacent?.id ?? null };
}
