import { extensions } from '../extensions/index.js';
import { fileManagerLabel } from '../ui/platform.js';

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

export const conversationFileViews = {
  split: '文件位置和预览',
  full: '全屏文件预览',
};

export const fileDoubleClickActions = {
  native: '使用本机程序运行',
  preview: '使用小窗打开',
  sidebar: '使用右侧栏打开',
  fullscreen: '使用全屏打开',
  reveal: '在' + fileManagerLabel + '中显示',
};

export const quickFloatMinimizeActions = {
  anywhere: '任意区域三击',
  composer: '对话框双击',
  none: '无',
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
  none: '无',
};

const defaultGestures = { left: 'back', right: 'forward', up: 'up', down: 'none' };

function normalize(value) {
  return {
    tabScope: Object.hasOwn(tabScopes, value?.tabScope) ? value.tabScope : 'global',
    conversationFileView: Object.hasOwn(conversationFileViews, value?.conversationFileView) ? value.conversationFileView : 'split',
    fileDoubleClick: Object.hasOwn(fileDoubleClickActions, value?.fileDoubleClick) ? value.fileDoubleClick : 'preview',
    quickFloatMinimize: Object.hasOwn(quickFloatMinimizeActions, value?.quickFloatMinimize) ? value.quickFloatMinimize : 'composer',
    initialSidebarPercent: Number.isInteger(Number(value?.initialSidebarPercent)) && Number(value.initialSidebarPercent) >= 15 && Number(value.initialSidebarPercent) <= 80
      ? Number(value.initialSidebarPercent) : 30,
    newTabPreviewOpen: value?.newTabPreviewOpen !== false,
    workspaceTabsAutoCollapse: value?.workspaceTabsAutoCollapse !== false,
    favoritesDisplay: Object.hasOwn(buttonDisplays, value?.favoritesDisplay) ? value.favoritesDisplay : 'auto',
    workspaceButtonDisplay: Object.hasOwn(buttonDisplays, value?.workspaceButtonDisplay) ? value.workspaceButtonDisplay : 'auto',
    gesturesEnabled: value?.gesturesEnabled !== false,
    extensions: Object.freeze(Object.fromEntries(Object.entries(value?.extensions ?? {}).filter(
      ([id, option]) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && (typeof option === 'boolean' || typeof option === 'string'),
    ))),
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

export function createPreferences(registry = extensions) {
  let raw;
  try { raw = localStorage.getItem(preferenceKey); } catch { /* Storage may be unavailable. */ }
  let value = decode(raw);
  const listeners = new Set();

  function replace(next) {
    value = next;
    for (const listener of listeners) listener();
  }

  function update(patch) {
    const next = normalize({ ...value, ...patch });
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); }
    catch { /* Keep the choice for this window. */ }
    replace(next);
  }

  return {
    registry,
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update,
    setExtension(id, option) {
      if (!registry.accepts(id, option)) return false;
      update({ extensions: { ...value.extensions, [id]: option } });
      return true;
    },
    onStorage(event) {
      if (event.storageArea === localStorage && event.key === preferenceKey) replace(decode(event.newValue));
    },
  };
}
