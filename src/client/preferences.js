const preferenceKey = 'dsh-workspace-explorer.preferences';

export const tabScopes = {
  global: '完全独立',
  workspace: '按工作区切换',
  session: '按会话切换',
};

export const buttonDisplays = {
  expanded: '常态展开',
  auto: '自动折叠',
  collapsed: '常态折叠',
};

export const gestureDirections = [
  ['left', '向左'],
  ['right', '向右'],
  ['up', '向上'],
  ['down', '向下'],
];

export const gestureActions = {
  back: '后退',
  forward: '前进',
  up: '返回上一级',
  none: '不执行',
};

const defaultGestures = { left: 'back', right: 'forward', up: 'up', down: 'none' };

function normalize(value) {
  return {
    tabScope: Object.hasOwn(tabScopes, value?.tabScope) ? value.tabScope : 'global',
    newTabPreviewOpen: value?.newTabPreviewOpen !== false,
    favoritesDisplay: Object.hasOwn(buttonDisplays, value?.favoritesDisplay) ? value.favoritesDisplay : 'auto',
    workspaceButtonDisplay: Object.hasOwn(buttonDisplays, value?.workspaceButtonDisplay) ? value.workspaceButtonDisplay : 'auto',
    gesturesEnabled: value?.gesturesEnabled !== false,
    gestures: Object.fromEntries(gestureDirections.map(([direction]) => {
      const action = value?.gestures?.[direction];
      return [direction, Object.hasOwn(gestureActions, action) ? action : defaultGestures[direction]];
    })),
  };
}

function decode(raw) {
  try { return normalize(JSON.parse(raw)); }
  catch { return normalize(null); }
}

export function createPreferences() {
  let raw;
  try { raw = localStorage.getItem(preferenceKey); } catch { /* Storage may be unavailable. */ }
  let value = decode(raw);
  const listeners = new Set();

  function replace(next) {
    value = next;
    for (const listener of listeners) listener();
  }

  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(patch) {
      const next = normalize({ ...value, ...patch });
      try { localStorage.setItem(preferenceKey, JSON.stringify(next)); }
      catch { /* Keep the choice for this window. */ }
      replace(next);
    },
    onStorage(event) {
      if (event.storageArea === localStorage && event.key === preferenceKey) replace(decode(event.newValue));
    },
  };
}
