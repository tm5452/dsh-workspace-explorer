import { appendStackPreview, emptyPreviewStack, removeStackPreviews } from '../ui/preview-stack.js';
import { localPath, parentOf, pathName, renamePath, resourceAddress, samePath, underPath } from '../ui/navigation.js';

export const PREVIEW_KIND = 'dsh-workspace-explorer-preview';
export const collectionAddress = 'sidebar://' + PREVIEW_KIND;
const collectionPrefix = 'dsh-resource://workspace-explorer/file-previews';
export const isCollectionAddress = address => address === collectionAddress
  || address === collectionPrefix || address?.startsWith(collectionPrefix + '/');
export const collectionKey = address => address === collectionPrefix ? collectionAddress : address;
export const newCollectionAddress = () => collectionPrefix + '/' + crypto.randomUUID();

export function canReturnToBrowser(file, view) {
  if (file.origin !== view.address || (view.workspaceRoot && !underPath(file.absolute, view.workspaceRoot))) return false;
  if (samePath(view.path, file.originFolder === undefined ? parentOf(file.absolute) : file.originFolder)) return true;
  if (file.originFolder === undefined) return false;
  if (view.workspaceRoot && !file.originWorkspace) return samePath(view.path, view.workspaceRoot);
  return !view.workspaceRoot && Boolean(file.originWorkspace) && samePath(view.path, file.originOutsideFolder);
}

export function normalizePreviewFile(file, root = null) {
  const absolute = localPath(file?.absolute);
  const scope = root ? localPath(root) : null;
  if (!absolute || (root && !underPath(absolute, scope))) return;
  return {
    root: scope, file: {
      absolute, name: file.name || pathName(absolute), size: file.size,
      line: Number.isSafeInteger(file.line) && file.line > 0 ? file.line : undefined,
      address: resourceAddress(absolute),
      origin: typeof file.origin === 'string' ? file.origin : undefined,
      originFolder: file.originFolder === undefined ? undefined : localPath(file.originFolder),
      originWorkspace: file.originWorkspace === undefined ? undefined : localPath(file.originWorkspace),
      originOutsideFolder: file.originOutsideFolder === undefined ? undefined : localPath(file.originOutsideFolder),
    },
  };
}

function storageKey(group, address = collectionAddress) {
  return 'dsh-workspace-explorer.preview-tabs:' + group + (address === collectionAddress ? '' : ':' + address);
}

function restore(group, address, sessionId) {
  try {
    const key = storageKey(group, address);
    const raw = localStorage.getItem(key) ?? (address === collectionAddress
      ? sessionStorage.getItem(key) ?? (sessionId && sessionStorage.getItem(storageKey(sessionId))) : null);
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.tabs)) return;
    let stack = emptyPreviewStack;
    let active;
    for (const item of data?.tabs ?? []) {
      const target = normalizePreviewFile(item.file, item.root);
      if (!target) continue;
      stack = appendStackPreview(stack, target.file, target.root);
      if (item.id === data.active) active = stack.active;
    }
    const { maximized, dockOrder, restoreToSidebar, restoreToInline, minimizedFromInline } = data.window ?? {};
    return {
      stack: { ...stack, active: active ?? stack.active },
      window: { maximized: maximized === true, dockOrder: Number.isSafeInteger(dockOrder) ? dockOrder : undefined,
        restoreToSidebar: maximized === true && restoreToSidebar === true,
        restoreToInline: maximized === true && restoreToInline === true,
        minimizedFromInline: minimizedFromInline === true,
        shortcutOrder: Number.isSafeInteger(data.window?.shortcutOrder) ? data.window.shortcutOrder
          : Number.isSafeInteger(dockOrder) ? dockOrder : undefined },
      needsOpen: Boolean(stack.tabs.length),
    };
  } catch {
    return;
  }
}

export function createPreviewCollections(sidebar, openBeside, notify) {
  const records = new Map();
  let allEntries = [];
  let reconciling = false;
  let cleanupQueued = false;
  let revision = 0;
  function publish() {
    revision++;
    notify();
    scheduleEmptyPreviewCleanup();
  }

  function scheduleEmptyPreviewCleanup() {
    if (cleanupQueued) return;
    cleanupQueued = true;
    // Opening, transferring and restoring a float can briefly leave it empty.
    queueMicrotask(() => {
      cleanupQueued = false;
      const layout = sidebar.mountedSurface?.()?.layout;
      if (!layout) return;
      const sessionId = sidebar.mounted.getSnapshot();
      const nativeTabs = new Set(Object.values(layout.nodes).flatMap(pane => pane.tabs ?? []));
      for (const entry of allEntries) {
        if (entry.sessionId === sessionId && nativeTabs.has(entry.tabId)
            && !entry.keepEmptyFloat && !entry.stack.tabs.length) sidebar.close(entry.tabId);
      }
    });
  }

  function record(group, sessionId, address = collectionAddress) {
    const key = storageKey(group, address);
    if (!records.has(key)) {
      const stored = restore(group, address, sessionId);
      const entry = { group, address, key, stack: stored?.stack ?? emptyPreviewStack,
        window: stored?.window, needsOpen: stored?.needsOpen, checkFiles: stored?.needsOpen };
      records.set(key, entry);
      allEntries = [...allEntries, entry];
      if (stored && address === collectionAddress) {
        persist(entry);
        try {
          sessionStorage.removeItem(key);
          if (sessionId) sessionStorage.removeItem(storageKey(sessionId));
        } catch { /* Storage unavailable. */ }
      }
    }
    return records.get(key);
  }

  function persist(entry) {
    const { stack } = entry;
    if (stack.tabs.length) entry.keepEmptyFloat = false;
    try {
      const tabs = stack.tabs.map(({ file, root }) => ({ file: { absolute: file.absolute,
        origin: file.origin, originFolder: file.originFolder, originWorkspace: file.originWorkspace,
        originOutsideFolder: file.originOutsideFolder }, root }));
      const { maximized, restoreToSidebar, minimizedFromInline, shortcutOrder } = entry.window ?? {};
      localStorage.setItem(entry.key, JSON.stringify({ tabs,
        window: { maximized, restoreToSidebar, minimizedFromInline, shortcutOrder } }));
    } catch { /* The current window still retains the tabs. */ }
  }

  function remove(entry, ids) {
    change(entry, removeStackPreviews(entry.stack, tab => ids.has(tab.id)));
  }

  function change(entry, stack) {
    if (entry.stack === stack) return;
    entry.stack = stack;
    persist(entry);
    publish();
  }

  function find(sessionId) {
    return sidebar.openTabs.getSnapshot().filter(tab =>
      tab.sessionId === sessionId && tab.kind === PREVIEW_KIND && isCollectionAddress(tab.contentId));
  }

  function open(entry, sessionId, targets, paneId, { focus = true, allowEmpty = false, floating = false, keepEmptyFloat = false } = {}) {
    if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId || (!allowEmpty && !targets.length)) return false;
    const [target] = targets;
    if (targets.length > 1 || (target && entry.stack.tabs.some(tab => !samePath(tab.file.absolute, target.file.absolute)))) return false;
    let next = target ? appendStackPreview(entry.stack, target.file, target.root) : entry.stack;
    if (target?.surface) {
      next = { ...next, tabs: next.tabs.map(tab => tab.id === next.active && !tab.surface
        ? { ...tab, surface: target.surface } : tab) };
    }
    let existing = find(sessionId).find(tab => collectionKey(tab.contentId) === entry.address);
    try {
      if (!existing) {
        if (floating) sidebar.openResource(entry.address, { kind: PREVIEW_KIND, destination: 'float' });
        else if (entry.address === collectionAddress && sidebar.openTab) sidebar.openTab(PREVIEW_KIND, { paneId });
        else openBeside(entry.address, { kind: PREVIEW_KIND, paneId });
        existing = find(sessionId).find(tab => collectionKey(tab.contentId) === entry.address);
        if (!existing) return false;
      }
      entry.tabId = existing.tabId ?? existing.id;
      if (focus) {
        sidebar.focus(entry.tabId);
        const layout = sidebar.mountedSurface?.()?.layout;
        const floating = layout?.floats?.some(id => layout.nodes[id]?.tabs.includes(entry.tabId));
        if (!floating && !sidebar.isExpanded()) sidebar.toggleExpanded();
      }
    } catch (error) {
      console.warn('[dsh-workspace-explorer] Could not open file previews', error);
      return false;
    }
    entry.sessionId = sessionId;
    if (target) entry.needsOpen = false;
    if (keepEmptyFloat && !next.tabs.length) {
      entry.keepEmptyFloat = true;
      persist(entry);
    }
    change(entry, next);
    return true;
  }

  return {
    record, open, find, remove, persistWindow: persist, entries: () => allEntries, revision: () => revision,
    transfer(source, destination, id) {
      const item = source.stack.tabs.find(tab => tab.id === id);
      if (!item || source === destination || destination.stack.tabs.length) return false;
      const appended = appendStackPreview(destination.stack, item.file, item.root);
      const active = appended.active;
      destination.stack = { ...appended, tabs: appended.tabs.map(tab => tab.id === active ? { ...item, id: active } : tab) };
      source.stack = removeStackPreviews(source.stack, tab => tab.id === id);
      persist(source);
      persist(destination);
      publish();
      return true;
    },
    close(entry, id) { change(entry, removeStackPreviews(entry.stack, tab => tab.id === id)); },
    select(entry, id) {
      entry.needsOpen = false;
      change(entry, { ...entry.stack, active: id, suspended: false });
    },
    renewSurface(entry, shouldRenew) {
      const tabs = entry.stack.tabs.map(item => shouldRenew(item)
        ? { ...item, pdfPosition: item.surface?.pdfPosition, surface: undefined } : item);
      if (tabs.some((item, index) => item !== entry.stack.tabs[index])) change(entry, { ...entry.stack, tabs });
    },
    unbind(entry) { const id = entry.tabId; entry.tabId = entry.sessionId = undefined; return id; },
    removePaths(paths) {
      if (!paths.length) return;
      const removed = tab => paths.some(path => underPath(tab.file.absolute, path));
      for (const entry of records.values()) {
        change(entry, removeStackPreviews(entry.stack, removed));
      }
    },
    rename(from, to) {
      for (const entry of records.values()) {
        const tabs = entry.stack.tabs.map(tab => {
          const absolute = renamePath(tab.file.absolute, from, to);
          const root = renamePath(tab.root, from, to);
          if (absolute === tab.file.absolute && root === tab.root) return tab;
          const target = normalizePreviewFile({ ...tab.file, absolute, name: undefined }, root);
          return target ? { ...tab, ...target } : tab;
        });
        if (tabs.some((tab, i) => tab !== entry.stack.tabs[i])) change(entry, { ...entry.stack, tabs });
      }
    },
    sync(group, sessionId) {
      if (reconciling) return;
      const tabs = find(sessionId);
      const duplicates = [];
      const live = new Set();
      const addresses = new Set();
      for (const tab of tabs) {
        const id = tab.tabId ?? tab.id;
        const address = collectionKey(tab.contentId);
        if (addresses.has(address)) { duplicates.push(id); continue; }
        addresses.add(address);
        const entry = record(group, sessionId, address);
        live.add(entry);
        entry.sessionId = sessionId;
        entry.tabId = id;
      }
      reconciling = true;
      try { for (const id of duplicates) sidebar.closeIn?.(sessionId, id); }
      finally { reconciling = false; }
      const closed = allEntries.filter(entry => entry.sessionId === sessionId && !live.has(entry));
      for (const entry of closed) {
        entry.sessionId = entry.tabId = undefined;
        entry.stack = emptyPreviewStack;
        records.delete(entry.key);
        entry.host?.remove();
        try { localStorage.removeItem(entry.key); } catch { /* Storage unavailable. */ }
      }
      if (closed.length) {
        allEntries = allEntries.filter(entry => !closed.includes(entry));
        publish();
      }
      scheduleEmptyPreviewCleanup();
    },
  };
}
