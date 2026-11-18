import { buttonDisplays, gestureActions, gestureDirections, tabScopes } from '../client/preferences.js';

const { createElement: h, useSyncExternalStore } = react;
const scopeDescriptions = {
  global: '切换会话时沿用当前文件浏览标签和浏览位置。',
  workspace: '同一工作区的会话共享标签，切换工作区时恢复各自的浏览位置。',
  session: '每个会话都有自己的标签和浏览位置。',
};

function choice(label, value, options, change, key) {
  return h('label', { key, className: 'dwe-preference-row' },
    h('span', null, label),
    h('select', { value, onChange: event => change(event.target.value) },
      Object.entries(options).map(([id, text]) => h('option', { key: id, value: id }, text))));
}

function toggle(label, checked, change) {
  return h('div', { className: 'dwe-preference-row' },
    h('span', null, label),
    h('button', {
      type: 'button', role: 'switch', className: 'dwe-preference-switch',
      'aria-label': label, 'aria-checked': checked, onClick: () => change(!checked),
    }));
}

export function ExplorerPreferences({ preferences }) {
  const state = useSyncExternalStore(preferences.subscribe, preferences.get);
  const { tabScope, gesturesEnabled, gestures, newTabPreviewOpen, favoritesDisplay, workspaceButtonDisplay } = state;
  return h('div', { className: 'dwe-preferences' },
    h('fieldset', null,
      h('legend', null, '右侧栏与会话'),
      choice('文件浏览标签切换', tabScope, tabScopes, tabScope => preferences.update({ tabScope })),
      h('p', { className: 'dwe-preference-description', 'aria-live': 'polite' }, scopeDescriptions[tabScope]),
      toggle('新建标签页时开启预览窗格', newTabPreviewOpen,
        newTabPreviewOpen => preferences.update({ newTabPreviewOpen })),
      h('p', { className: 'dwe-preference-description' }, '仅用于通过顶部「＋」打开开始页后创建的标签。')),
    h('fieldset', null,
      h('legend', null, '文件浏览工具栏'),
      choice('收藏夹按钮', favoritesDisplay, buttonDisplays, favoritesDisplay => preferences.update({ favoritesDisplay })),
      choice('工作区内浏览按钮', workspaceButtonDisplay, buttonDisplays,
        workspaceButtonDisplay => preferences.update({ workspaceButtonDisplay }))),
    h('fieldset', null,
      h('legend', null, '右键手势'),
      toggle('启用右键手势', gesturesEnabled, gesturesEnabled => preferences.update({ gesturesEnabled })),
      gesturesEnabled && h('div', { className: 'dwe-gesture-preferences' },
        gestureDirections.map(([direction, label]) => choice(label, gestures[direction], gestureActions,
          action => preferences.update({ gestures: { ...preferences.get().gestures, [direction]: action } }), direction)))));
}
