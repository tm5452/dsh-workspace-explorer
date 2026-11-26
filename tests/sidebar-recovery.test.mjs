import assert from 'node:assert/strict';
import test from 'node:test';
import { installSidebarClose, openSidebar, protectedGuides } from '../src/client/sidebar-close.js';
import { createPreviewCollections, newCollectionAddress, normalizePreviewFile, PREVIEW_KIND } from '../src/client/preview-collections.js';

const pane = (host, tabs) => ({ id: host, kind: 'pane', host, tabs });

test('reopening with only floating tabs seeds the dock with a guide', () => {
  const layout = { nodes: { dock: pane('dock', []), floating: pane('float', ['preview']) }, tabs: { preview: {} } };
  const calls = [];
  const sidebar = {
    mounted: { getSnapshot: () => 'session' },
    mountedSurface: () => ({ layout }),
    isExpanded: () => false,
    openTab(kind) { calls.push(kind); },
    toggleExpanded() { calls.push('expand'); },
  };
  openSidebar(sidebar, 'elsewhere');
  openSidebar(sidebar, 'session');
  layout.nodes.dock.tabs.push('preview');
  openSidebar(sidebar, 'session');
  assert.deepEqual(calls, ['guide', 'expand']);
});

test('closing the last docked tab replaces it even when a preview is floating', () => {
  const layout = { rootId: 'dock', expanded: true,
    nodes: { dock: pane('dock', ['file']), floating: pane('float', ['preview']) },
    tabs: { file: { kind: 'explorer' }, preview: { kind: PREVIEW_KIND } } };
  const calls = [];
  const sidebar = {
    mounted: { getSnapshot: () => 'session' },
    mountedSurface: () => ({ layout }),
    openTab(kind, options) { calls.push([kind, options]); },
    closeIn(session, id) { calls.push([session, id]); },
  };
  const dispose = installSidebarClose(sidebar, () => false);
  sidebar.closeIn('session', 'file');
  sidebar.closeIn('session', 'preview');
  assert.deepEqual(calls, [['guide', { paneId: 'dock', replaceTab: 'file' }], ['session', 'preview']]);
  dispose();
});

test('reattaching a preview skips a stale inventory row and reuses the viewer', () => {
  const address = newCollectionAddress();
  const layout = { tabs: {}, nodes: {} };
  const inventory = [{ sessionId: 'session', id: 'old', kind: PREVIEW_KIND, contentId: address }];
  const sidebar = {
    mounted: { getSnapshot: () => 'session' },
    mountedSurface: () => ({ layout }),
    openTabs: { getSnapshot: () => inventory },
  };
  const collections = createPreviewCollections(sidebar, (address, { kind }) => {
    const native = { sessionId: 'session', id: 'new', kind, contentId: address };
    layout.tabs.new = native;
    inventory.push(native);
  }, () => {});
  const entry = collections.record('group', 'session', address);
  const surface = {};
  const target = { ...normalizePreviewFile({ absolute: 'C:/Test/report.pdf', name: 'report.pdf' }), surface };
  assert.ok(collections.open(entry, 'session', [target], undefined, { focus: false }));
  assert.equal(entry.tabId, 'old');
  assert.ok(collections.open(entry, 'session', [], undefined, { focus: false, allowEmpty: true, rebind: true }));
  assert.equal(entry.tabId, 'new');
  collections.sync('group', 'session');
  assert.equal(entry.tabId, 'new');
  assert.equal(entry.stack.tabs[0].surface, surface);
});

test('a private preview cannot consume the last visible tab or make the guide closable', () => {
  const layout = { rootId: 'dock', expanded: true,
    nodes: { dock: pane('dock', ['normal', 'preview']) },
    tabs: { normal: { kind: 'explorer' }, preview: { kind: PREVIEW_KIND } } };
  const calls = [];
  const sidebar = {
    mounted: { getSnapshot: () => 'session' },
    mountedSurface: () => ({ layout }),
    openTab(kind, options) { calls.push([kind, options]); },
    closeIn(session, id) { calls.push([session, id]); },
  };
  const dispose = installSidebarClose(sidebar, () => false);
  sidebar.closeIn('session', 'normal');
  layout.tabs.normal.kind = 'guide';
  assert.deepEqual(protectedGuides(layout), ['normal']);
  sidebar.closeIn('session', 'normal');
  assert.deepEqual(calls, [['guide', { paneId: 'dock', replaceTab: 'normal' }]]);
  dispose();
});

test('a pinned file survives restart and native pane removal without a native tab', t => {
  const original = globalThis.localStorage;
  const stored = new Map();
  globalThis.localStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key) };
  t.after(() => {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  });
  const address = newCollectionAddress();
  const layout = { tabs: {}, nodes: {} };
  let inventory = [];
  let opens = 0;
  const sidebar = {
    mounted: { getSnapshot: () => 'session' },
    mountedSurface: () => ({ layout }),
    openTabs: { getSnapshot: () => inventory },
    closeIn(_session, tabId) {
      delete layout.tabs[tabId];
      inventory = inventory.filter(tab => tab.id !== tabId);
    },
  };
  function openNative(address, { kind }) {
    const id = String(++opens);
    const tab = { id, sessionId: 'session', kind, contentId: address };
    layout.tabs[id] = tab;
    inventory.push(tab);
  }
  const first = createPreviewCollections(sidebar, openNative, () => {});
  const entry = first.record('group', 'session', address);
  const surface = {};
  const target = normalizePreviewFile({ absolute: 'C:/Test/report.pdf', name: 'report.pdf' });
  entry.shortcut = { floating: false, displayed: false };
  first.pin(entry, { ...target, surface });
  assert.equal(opens, 0);
  assert.equal(entry.tabId, undefined);
  const second = createPreviewCollections(sidebar, openNative, () => {});
  second.restoreShortcuts('group', 'session');
  const [restored] = second.entries();
  assert.equal(restored.address, entry.address);
  assert.equal(restored.tabId, undefined);
  assert.equal(restored.needsOpen, true);
  assert.equal(opens, 0);

  assert.ok(first.open(entry, 'session', [], undefined, { focus: false, allowEmpty: true }));
  const tab = entry.tabId;
  first.park(entry);
  assert.equal(layout.tabs[tab], undefined);
  assert.equal(first.afterPark(entry, () => assert.fail('synchronous close is already finished')), false);
  assert.equal(entry.stack.tabs[0].surface, surface);
  assert.ok(first.open(entry, 'session', [], undefined, { focus: false, allowEmpty: true }));
  sidebar.closeIn('session', entry.tabId);
  first.sync('group', 'session');
  assert.equal(entry.tabId, undefined);
  assert.equal(entry.stack.tabs[0].surface, surface);
  assert.equal(opens, 2);
});
