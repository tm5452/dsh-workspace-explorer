import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreferences } from '../src/client/preferences.js';
import { createExtensionRegistry, extensionAreas, installExtensionEffects } from '../src/extensions/registry.js';

const preferenceKey = 'dsh-workspace-explorer.preferences';
const sample = {
  id: 'example', setting: { label: '测试设置' },
  buttons: Object.values(extensionAreas).map(area => ({ id: area, area, label: '测试按钮', icon: 'refresh', run() {} })),
};

function mockStorage(t, seed) {
  const map = new Map([[preferenceKey, JSON.stringify(seed)]]);
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  return storage;
}

test('a toggle can contribute to all regions and persists without replacing existing settings', t => {
  const storage = mockStorage(t, { tabScope: 'session', extensions: { 'other-branch': 'on' } });
  const registry = createExtensionRegistry([sample]);
  for (const area of Object.values(extensionAreas)) {
    assert.deepEqual(registry.buttons(area).map(button => button.values), [[true]]);
  }
  const first = createPreferences(registry);
  assert.equal(registry.read('example', first.get().extensions), false);
  assert.equal(first.setExtension('example', 'true'), false);
  assert.equal(first.setExtension('missing', true), false);
  assert.equal(first.setExtension('example', true), true);
  const second = createPreferences(registry);
  assert.equal(second.get().tabScope, 'session');
  assert.deepEqual(second.get().extensions, { example: true, 'other-branch': 'on' });
  second.onStorage({ storageArea: storage, key: preferenceKey, newValue: '{"extensions":{"example":false}}' });
  assert.equal(registry.read('example', second.get().extensions), false);
});

test('select effects start once, clean up on a mode change, and stop when disposed', t => {
  mockStorage(t, null);
  const calls = [];
  const registry = createExtensionRegistry([{
    id: 'color-mode', setting: { label: '测试设置', options: { off: '关闭', light: '浅色', dark: '深色' }, default: 'off' },
    activate(value) { calls.push('start-' + value); return () => calls.push('stop-' + value); },
  }]);
  const preferences = createPreferences(registry);
  const dispose = installExtensionEffects(preferences);
  preferences.setExtension('color-mode', 'light');
  preferences.update({ gesturesEnabled: false });
  preferences.setExtension('color-mode', 'dark');
  preferences.setExtension('color-mode', 'off');
  preferences.setExtension('color-mode', 'light');
  dispose();
  preferences.setExtension('color-mode', 'dark');
  assert.deepEqual(calls, ['start-light', 'stop-light', 'start-dark', 'stop-dark', 'start-light', 'stop-light']);
});

test('invalid definitions fail before they can be bundled', () => {
  assert.throws(() => createExtensionRegistry([sample, sample]), /duplicate id/);
  assert.throws(() => createExtensionRegistry([{ ...sample, buttons: [{ ...sample.buttons[0], area: 'core' }] }]), /invalid or duplicate button/);
  assert.throws(() => createExtensionRegistry([{ ...sample, buttons: [{ ...sample.buttons[0], icon: 'missing' }] }]), /invalid or duplicate button/);
  assert.throws(() => createExtensionRegistry([{ ...sample, buttons: [{ ...sample.buttons[0], values: ['true'] }] }]), /supported by its setting/);
  assert.throws(() => createExtensionRegistry([{ id: 'select', setting: { label: '颜色', options: { a: 'A', b: 'B' } } }]), /invalid setting default/);
});
