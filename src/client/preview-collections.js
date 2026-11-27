import { appendStackPreview, emptyPreviewStack, removeStackPreviews } from '../ui/preview-stack.js';
import { localPath, parentOf, pathName, renamePath, resourceAddress, samePath, underPath } from '../ui/navigation.js';

export const PREVIEW_KIND = 'dsh-workspace-explorer-preview';
export const collectionAddress = 'sidebar://' + PREVIEW_KIND;
const collectionPrefix = 'dsh-resource://workspace-explorer/file-previews';
export const isCollectionAddress = address => address === collectionAddress
  || address === collectionPrefix || address?.startsWith(collectionPrefix + '/');
export const collectionKey = address => address === collectionPrefix ? collectionAddress : address;
export const newCollectionAddress = () => collectionPrefix + '/' + crypto.randomUUID();

export const isPreviewTab = tab => Boolean(tab && (isCollectionAddress(tab.contentId)
  || tab.kind === PREVIEW_KIND || tab.kind === 'dsh-workspace-explorer-preview-window'));

function shortcutIndexKey(group) { return 'dsh-workspace-explorer.shortcuts:' + group; }

function shortcutAddresses(group) {
  try {
    const data = JSON.parse(localStorage.getItem(shortcutIndexKey(group)));
    return Array.isArray(data) ? data.filter(isCollectionAddress) : [];
  } catch { return []; }
}

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
      shortcut: typeof data.floating === 'boolean' ? { floating: data.floating, displayed: false } : undefined,
    };
  } catch {
    return;
  }
}

export function createPreviewCollections(sidebar, openBeside, notify) {
  const records = new Map();
  const retiring = new Map();
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
        window: stored?.window, needsOpen: stored?.needsOpen, checkFiles: stored?.needsOpen, shortcut: stored?.shortcut };
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
      if (entry.unpinned) localStorage.removeItem(entry.key);
      else {
        const tabs = stack.tabs.map(({ file, root }) => ({ file: { absolute: file.absolute,
          origin: file.origin, originFolder: file.originFolder, originWorkspace: file.originWorkspace,
          originOutsideFolder: file.originOutsideFolder }, root }));
        const { maximized, restoreToSidebar, minimizedFromInline, shortcutOrder } = entry.window ?? {};
        localStorage.setItem(entry.key, JSON.stringify({ tabs, floating: entry.shortcut?.floating,
          window: { maximized, restoreToSidebar, minimizedFromInline, shortcutOrder } }));
      }
      const index = new Set(shortcutAddresses(entry.group));
      if (stack.tabs.length && !entry.unpinned) index.add(entry.address);
      else index.delete(entry.address);
      saveShortcutIndex(entry.group, [...index]);
    } catch { /* The current window still retains the tabs. */ }
  }

  function saveShortcutIndex(group, addresses) {
    if (addresses.length) localStorage.setItem(shortcutIndexKey(group), JSON.stringify(addresses));
    else localStorage.removeItem(shortcutIndexKey(group));
  }

  function finishRetired(sessionId, inventory, layout) {
    const inventoryIds = new Set(inventory.map(tab => tab.tabId ?? tab.id));
    for (const [id, pending] of retiring) {
      if (pending.sessionId !== sessionId || inventoryIds.has(id) || layout?.tabs[id]) continue;
      retiring.delete(id);
      if (pending.callback) queueMicrotask(pending.callback);
    }
  }

  function withdraw(entry, floating = Boolean(entry.shortcut?.floating)) {
    entry.tabId = entry.sessionId = undefined;
    entry.dockSelected = false;
    entry.shortcut = { floating, displayed: false };
    persist(entry);
  }

  function discard(entry) {
    entry.sessionId = entry.tabId = undefined;
    entry.stack = emptyPreviewStack;
    records.delete(entry.key);
    entry.host?.remove();
    allEntries = allEntries.filter(item => item !== entry);
    try {
      localStorage.removeItem(entry.key);
      saveShortcutIndex(entry.group, shortcutAddresses(entry.group).filter(address => address !== entry.address));
    } catch { /* Storage unavailable. */ }
    publish();
  }

  function storeShortcut(stack, target) {
    stack = appendStackPreview(stack, target.file, target.root);
    if (target.surface || target.pdfPosition) {
      stack = { ...stack, tabs: stack.tabs.map(tab => tab.id === stack.active && !tab.surface
        ? { ...tab, surface: target.surface, pdfPosition: target.pdfPosition ?? tab.pdfPosition } : tab) };
    }
    return stack;
  }

  function remove(entry, ids) {
    change(entry, removeStackPreviews(entry.stack, tab => ids.has(tab.id)));
  }

  function change(entry, stack) {
    if (entry.stack === stack) return;
    if (!entry.tabId && !stack.tabs.length) {
      discard(entry);
      return;
    }
    entry.stack = stack;
    persist(entry);
    publish();
  }

  function find(sessionId) {
    return sidebar.openTabs.getSnapshot().filter(tab =>
      tab.sessionId === sessionId && tab.kind === PREVIEW_KIND && isCollectionAddress(tab.contentId));
  }

  function open(entry, sessionId, targets, paneId, {
    focus = true, allowEmpty = false, floating = false, keepEmptyFloat = false, rebind = false,
  } = {}) {
    if (!sessionId || sidebar.mounted.getSnapshot() !== sessionId || (!allowEmpty && !targets.length)) return false;
    const [target] = targets;
    if (targets.length > 1 || (target && entry.stack.tabs.some(tab => !samePath(tab.file.absolute, target.file.absolute)))) return false;
    const next = target ? storeShortcut(entry.stack, target) : entry.stack;
    function findNativeTab() {
      const layout = rebind && sidebar.mountedSurface?.()?.layout;
      return find(sessionId).find(tab => collectionKey(tab.contentId) === entry.address
        && !retiring.has(tab.tabId ?? tab.id) && (!layout || layout.tabs[tab.tabId ?? tab.id]));
    }
    let existing = findNativeTab();
    try {
      if (!existing) {
        if (floating) sidebar.openResource(entry.address, { kind: PREVIEW_KIND, destination: 'float' });
        else if (entry.address === collectionAddress && sidebar.openTab) sidebar.openTab(PREVIEW_KIND, { paneId });
        else openBeside(entry.address, { kind: PREVIEW_KIND, paneId });
        existing = findNativeTab();
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
    record, open, find, remove, discard, persistWindow: persist, entries: () => allEntries, revision: () => revision,
    restoreShortcuts(group, sessionId, placement) {
      const floating = new Set(placement?.floats.flatMap(pane => pane.tabs));
      const old = [...(placement?.panes ?? []), ...(placement?.floats ?? [])].flatMap(pane => pane.tabs);
      for (const address of new Set([...shortcutAddresses(group), ...old.filter(isCollectionAddress)])) {
        const entry = record(group, sessionId, address);
        if (!entry.stack.tabs.length) {
          discard(entry);
          continue;
        }
        entry.shortcut ??= { floating: floating.has(address), displayed: false };
        persist(entry);
      }
    },
    pin(entry, target) { change(entry, storeShortcut(entry.stack, target)); },
    setPinned(entry, pinned) {
      if (Boolean(entry.unpinned) === !pinned) return;
      entry.unpinned = !pinned;
      persist(entry);
      publish();
    },
    replace(entry, target) {
      const matching = entry.stack.tabs.filter(tab => samePath(tab.file.absolute, target.file.absolute));
      const stack = { ...entry.stack, tabs: matching };
      if (!matching.length) entry.unpinned = false;
      entry.needsOpen = false;
      entry.checkFiles = false;
      change(entry, storeShortcut(stack, target));
    },
    park(entry, floating = false) {
      if (!entry.tabId) return;
      const { sessionId, tabId } = entry;
      const pending = { entry, sessionId };
      retiring.set(tabId, pending);
      if (entry.unpinned) discard(entry);
      else withdraw(entry, floating);
      sidebar.closeIn(sessionId, tabId);
      finishRetired(sessionId, find(sessionId), sidebar.mountedSurface?.()?.layout);
      if (!entry.unpinned) publish();
    },
    afterPark(entry, callback) {
      for (const pending of retiring.values()) {
        if (pending.entry !== entry) continue;
        pending.callback = callback;
        return true;
      }
      return false;
    },
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
    unbind(entry) {
      const id = entry.tabId;
      if (entry.unpinned) {
        discard(entry);
        return id;
      }
      entry.tabId = entry.sessionId = undefined;
      entry.dockSelected = false;
      if (entry.shortcut) entry.shortcut = { ...entry.shortcut, displayed: false };
      return id;
    },
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
      const inventory = find(sessionId);
      const layout = sidebar.mounted.getSnapshot() === sessionId && sidebar.mountedSurface?.()?.layout;
      finishRetired(sessionId, inventory, layout);
      const tabs = inventory.filter(tab => !retiring.has(tab.tabId ?? tab.id));
      const liveAddresses = new Set(layout ? tabs.filter(tab => layout.tabs[tab.tabId ?? tab.id])
        .map(tab => collectionKey(tab.contentId)) : []);
      const duplicates = [];
      const live = new Set();
      const addresses = new Set();
      for (const tab of tabs) {
        const id = tab.tabId ?? tab.id;
        const address = collectionKey(tab.contentId);
        if (liveAddresses.has(address) && !layout.tabs[id]) continue;
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
      const closed = allEntries.filter(entry => entry.sessionId === sessionId && entry.tabId && !live.has(entry));
      for (const entry of closed) {
        if (entry.explicitClose || entry.unpinned || !entry.stack.tabs.length) discard(entry);
        else withdraw(entry);
      }
      if (closed.length) publish();
      scheduleEmptyPreviewCleanup();
    },
  };
}
