import assert from 'node:assert/strict';
import test from 'node:test';
import { canReturnToBrowser, collectionAddress, createPreviewCollections, newCollectionAddress, normalizePreviewFile } from '../src/client/preview-collections.js';
import { loadSidebarLayout, saveSidebarLayout } from '../src/client/sidebar-layout-state.js';
import { appendStackPreview, emptyPreviewStack, openInlinePreview } from '../src/ui/preview-stack.js';

const file = name => ({ absolute: 'C:\\Test\\' + name, name });

test('inline previews use one file and reuse the viewer when the same file is reopened', () => {
  const surface = {};
  let stack = openInlinePreview(emptyPreviewStack, file('one.txt'), null);
  stack = openInlinePreview(stack, file('two.txt'), null, surface);
  stack = openInlinePreview(stack, file('two.txt'), null);
  assert.deepEqual(stack.tabs.map(tab => tab.file.name), ['two.txt']);
  assert.equal(stack.tabs[0].surface, surface);
  assert.equal(stack.tabs[0].confirmed, true);
  assert.equal(stack.active, stack.tabs[0].id);
});

test('independent previews append, and reopening the same path only activates its tab', () => {
  let stack = appendStackPreview(emptyPreviewStack, file('one.txt'), 'C:\\Test');
  stack = appendStackPreview(stack, file('two.txt'), null);
  stack = appendStackPreview(stack, { ...file('ONE.TXT'), line: 43 }, null);
  assert.equal(stack.tabs.length, 2);
  assert.equal(stack.active, stack.tabs[0].id);
  assert.equal(stack.tabs[0].file.line, 43);
  assert.equal(stack.tabs[0].root, 'C:\\Test');
});

test('standalone previews keep one file per entry and survive rebinding across sessions', t => {
  const stored = new Map();
  const storage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => stored.get(key),
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  };
  t.after(() => {
    if (storage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = storage;
  });
  let allTabs = [];
  let session = 'test-session';
  let opens = 0;
  const sidebar = {
    mounted: { getSnapshot: () => session },
    openTabs: { getSnapshot: () => allTabs },
    focus() {},
    closeIn: (sessionId, id) => { allTabs = allTabs.filter(tab => tab.sessionId !== sessionId || tab.id !== id); },
    isExpanded: () => true,
  };
  const openNative = (address, { kind }) => {
    opens++;
    allTabs.push({ id: 'collection-' + session, contentId: address, kind, sessionId: session });
  };
  const first = createPreviewCollections(sidebar, openNative, () => {});
  const shared = first.record('global');
  assert.equal(first.open(shared, 'other-session', [normalizePreviewFile(file('one.txt'))]), false);
  assert.equal(first.open(shared, session, [normalizePreviewFile(file('one.txt'))]), true);
  assert.equal(first.open(shared, session, [normalizePreviewFile(file('two.txt'))]), false);
  assert.equal(first.open(shared, session, [normalizePreviewFile(file('one.txt')), normalizePreviewFile(file('two.txt'))]), false);
  assert.equal(opens, 1);
  assert.equal(allTabs[0].contentId, collectionAddress);
  allTabs.push({ ...allTabs[0], id: 'duplicate' });
  first.sync('global', session);
  assert.equal(allTabs.length, 1);
  sidebar.closeIn(session, first.unbind(shared));
  session = 'other-session';
  assert.equal(first.open(shared, session, [], undefined, { allowEmpty: true }), true);
  shared.window = { shortcutOrder: 25, dockOrder: 50, maximized: true, restoreToInline: true };
  shared.stack.tabs[0].file.line = 42;
  shared.stack.tabs[0].surface = { key: 'old-viewer' };
  first.persistWindow(shared);
  const serialized = JSON.parse(stored.get(shared.key));
  assert.equal(serialized.active, undefined);
  assert.equal(serialized.tabs[0].file.line, undefined);
  assert.equal(serialized.tabs[0].id, undefined);
  assert.deepEqual(serialized.window, { maximized: true, shortcutOrder: 25 });
  const second = createPreviewCollections(sidebar, openNative, () => {});
  const restoredEntry = second.record('global');
  assert.equal(restoredEntry.needsOpen, true);
  assert.equal(restoredEntry.window.shortcutOrder, 25);
  assert.equal(restoredEntry.stack.tabs[0].surface, undefined);
  const restored = restoredEntry.stack;
  assert.deepEqual(restored.tabs.map(item => item.file.name), ['one.txt']);
  assert.equal(restored.active, restored.tabs[0].id);
  first.removePaths(['C:\\Test\\another.txt']);
  assert.equal(shared.stack.tabs.length, 1);
  assert.equal(shared.stack.active, shared.stack.tabs[0].id);
  allTabs = [];
  first.sync('global', session);
  assert.equal(stored.size, 0);
  const attachedSurface = { key: 'existing-viewer' };
  const incoming = { ...normalizePreviewFile(file('one.txt')), surface: attachedSurface };
  assert.equal(second.open(restoredEntry, session, [incoming], undefined, { focus: false }), true);
  assert.equal(restoredEntry.needsOpen, false);
  assert.equal(restoredEntry.stack.tabs[0].surface, attachedSurface);
  assert.equal(restored.tabs[0].surface, undefined);
  const pdfPosition = { page: 18, offset: 0.25, zoom: 1.2 };
  restoredEntry.stack.tabs[0].surface = { key: 'expired-viewer', pdfPosition };
  second.renewSurface(restoredEntry, item => item.surface?.key === 'expired-viewer');
  assert.equal(restoredEntry.stack.tabs[0].surface, undefined);
  assert.equal(restoredEntry.stack.tabs[0].pdfPosition, pdfPosition);
  assert.equal(restoredEntry.stack.tabs[0].file.absolute, file('one.txt').absolute);
  const address = newCollectionAddress();
  saveSidebarLayout('global', {
    viewList: [], sidebarPlacement: {
      active: address, panes: [{ tabs: ['browser', address], active: address }],
      floats: [{ tabs: [collectionAddress], active: collectionAddress, rect: { x: 20 } }],
    },
  });
  const placement = loadSidebarLayout('global').placement;
  assert.equal(placement.active, undefined);
  assert.deepEqual(placement.panes, [{ tabs: ['browser', address] }]);
  assert.deepEqual(placement.floats, [{ tabs: [collectionAddress], rect: { x: 20 } }]);
});

test('returning to the originating browser checks its path and workspace mode', () => {
  const target = { absolute: 'C:\\Workspace\\Sub\\report.txt', origin: 'source',
    originFolder: 'C:\\Workspace\\Sub', originWorkspace: null, originOutsideFolder: 'C:\\Workspace\\Sub' };
  const view = { address: 'source', path: target.originFolder, workspaceRoot: null };
  assert.equal(canReturnToBrowser(target, view), true);
  assert.equal(canReturnToBrowser(target, { ...view, address: 'another' }), false);
  assert.equal(canReturnToBrowser(target, { ...view, path: 'C:\\Other' }), false);
  const scoped = { ...view, path: 'C:\\Workspace', workspaceRoot: 'C:\\Workspace' };
  assert.equal(canReturnToBrowser(target, scoped), true);
  assert.equal(canReturnToBrowser(target, { ...scoped, workspaceRoot: 'D:\\Workspace', path: 'D:\\Workspace' }), false);
  const startedScoped = { ...target, originWorkspace: scoped.workspaceRoot, originOutsideFolder: 'C:\\Previous' };
  assert.equal(canReturnToBrowser(startedScoped, { ...view, path: 'C:\\Previous' }), true);
  assert.equal(canReturnToBrowser(startedScoped, { ...view, path: 'C:\\Another' }), false);
});

test('transferring a file removes the source item and carries its original viewer into the destination', () => {
  const collections = createPreviewCollections({}, () => {}, () => {});
  const source = collections.record('group');
  const destination = collections.record('group', undefined, 'second');
  const moving = file('one.txt');
  source.stack = appendStackPreview(appendStackPreview(emptyPreviewStack, file('other.txt'), null), moving, null);
  const surface = { marker: 'unchanged' };
  source.stack.tabs[1].surface = surface;
  assert.equal(collections.transfer(source, destination, source.stack.active), true);
  assert.deepEqual(source.stack.tabs.map(tab => tab.file.name), ['other.txt']);
  assert.equal(destination.stack.tabs.length, 1);
  assert.equal(destination.stack.tabs[0].surface, surface);
  assert.equal(destination.stack.tabs[0].file, moving);
  assert.equal(collections.transfer(source, destination, source.stack.active), false);
});

test('a new empty float survives until its first file is removed or transferred', async () => {
  const sessionId = 'session';
  const tabs = [];
  const layout = { floats: [], nodes: {} };
  const closed = [];
  function openNative(address, { kind, destination }) {
    const id = 'tab-' + tabs.length;
    const pane = 'pane-' + id;
    tabs.push({ id, contentId: address, kind, sessionId });
    layout.nodes[pane] = { id: pane, tabs: [id] };
    if (destination === 'float') layout.floats.push(pane);
  }
  const sidebar = {
    mounted: { getSnapshot: () => sessionId },
    mountedSurface: () => ({ layout }),
    openTabs: { getSnapshot: () => tabs },
    openResource: openNative,
    close(id) {
      closed.push(id);
      const pane = Object.values(layout.nodes).find(item => item.tabs.includes(id));
      pane.tabs = pane.tabs.filter(tab => tab !== id);
    },
  };
  const collections = createPreviewCollections(sidebar, openNative, () => {});
  const target = normalizePreviewFile(file('one.txt'));
  const docked = collections.record('global');
  const first = collections.record('global', sessionId, newCollectionAddress());
  const second = collections.record('global', sessionId, newCollectionAddress());
  const blank = { focus: false, floating: true, allowEmpty: true, keepEmptyFloat: true };
  assert.equal(collections.open(docked, sessionId, [], undefined, { focus: false, allowEmpty: true }), true);
  assert.equal(collections.open(first, sessionId, [], undefined, blank), true);
  assert.equal(collections.open(second, sessionId, [], undefined, blank), true);
  await Promise.resolve();
  assert.deepEqual(closed, []);
  collections.open(first, sessionId, [target], undefined, { focus: false });
  collections.open(second, sessionId, [target], undefined, { focus: false });
  collections.transfer(first, docked, first.stack.active);
  collections.close(second, second.stack.active);
  await Promise.resolve();
  assert.deepEqual(closed, [first.tabId, second.tabId]);
  assert.deepEqual(docked.stack.tabs.map(item => item.file.name), ['one.txt']);
  collections.close(docked, docked.stack.active);
  await Promise.resolve();
  assert.deepEqual(closed, [first.tabId, second.tabId, docked.tabId]);
});
