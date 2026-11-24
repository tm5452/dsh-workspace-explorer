import { samePath, underPath } from './navigation.js';

export const emptyPreviewStack = { tabs: [], active: null, nextId: 1 };

export function appendStackPreview(stack, file, root) {
  const existing = stack.tabs.find(tab => samePath(tab.file.absolute, file.absolute));
  if (existing) {
    const line = file.line ?? existing.file.line;
    const incomingOrigin = !existing.file.origin && file.origin;
    const updated = line !== existing.file.line || incomingOrigin
      ? { ...existing, file: incomingOrigin ? { ...file, line } : { ...existing.file, line } } : existing;
    return {
      ...stack, suspended: false, active: existing.id,
      tabs: updated === existing ? stack.tabs : stack.tabs.map(tab => tab === existing ? updated : tab),
    };
  }
  const id = stack.nextId;
  return {
    ...stack, suspended: false, active: id, nextId: id + 1,
    tabs: [...stack.tabs, { id, file, root, confirmed: true }],
  };
}

export function previewInScope(tab, root) {
  return !root || underPath(tab.file.absolute, root);
}

export function openInlinePreview(stack, file, root, surface) {
  const existing = stack.tabs.find(tab => samePath(tab.file.absolute, file.absolute) && tab.root === root);
  const id = existing?.id ?? stack.nextId;
  return {
    tabs: [{ id, file, root, confirmed: Boolean(surface || existing?.confirmed), surface: surface ?? existing?.surface }],
    active: id, nextId: existing ? stack.nextId : id + 1,
  };
}

export function confirmStackPreview(stack, id, file) {
  const target = stack.tabs.find(tab => tab.id === id && tab.file === file);
  if (!target || target.confirmed) return stack;
  return { ...stack, tabs: stack.tabs.map(tab => tab === target ? { ...tab, confirmed: true } : tab) };
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
