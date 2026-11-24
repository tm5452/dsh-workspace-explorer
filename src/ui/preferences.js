import { buttonDisplays, conversationFileViews, fileDoubleClickActions, gestureActions, gestureDirections,
  quickFloatMinimizeActions, tabScopes } from '../client/preferences.js';
import { icon } from './interface-icon.js';

const { createElement: h, useId, useSyncExternalStore } = react;
const scopeDescriptions = {
  global: '切换会话时沿用当前文件浏览标签和浏览位置。',
  workspace: '同一工作区的会话共享标签，切换工作区时恢复各自的浏览位置。',
  session: '每个会话都有自己的标签和浏览位置。',
};

function PreferenceLabel({ id, label, illustration, description }) {
  return h('div', { className: 'dwe-preference-copy' },
    h('label', { htmlFor: id }, label,
      illustration && h('span', { className: 'dwe-preference-icon', 'aria-hidden': true }, icon(illustration, 22))),
    description && h('p', { id: id + '-description', className: 'dwe-preference-description' }, description));
}

function PreferenceRow({ label, illustration, description, value, options, range, change }) {
  const id = useId();
  const control = { id, 'aria-describedby': description ? id + '-description' : undefined };
  return h('div', { className: 'dwe-preference-row' },
    h(PreferenceLabel, { id, label, illustration, description }),
    range ? h('div', { className: 'dwe-preference-range' },
      h('input', { ...control, type: 'range', min: range.min, max: range.max, step: 1, value,
        'aria-valuetext': value + '%', onChange: event => change(event.target.valueAsNumber) }),
      h('output', { htmlFor: id }, value + '%'))
      : options ? h('div', { className: 'dwe-preference-select' },
      h('select', { ...control, value, onChange: event => change(event.target.value) },
        Object.entries(options).map(([id, text]) => h('option', { key: id, value: id }, text))),
      h('span', { className: 'dwe-preference-chevron', 'aria-hidden': true }))
      : h('button', {
        ...control, type: 'button', role: 'switch', className: 'dwe-preference-switch',
        'aria-checked': value, onClick: () => change(!value),
      }, h('svg', { viewBox: '0 0 58 32', 'aria-hidden': true, focusable: 'false' },
        h('rect', { className: 'dwe-preference-switch-track', width: 58, height: 32, rx: 16 }),
        h('circle', { className: 'dwe-preference-switch-thumb', cx: 16, cy: 16, r: 13 }))));
}

export function ExplorerPreferences({ preferences }) {
  const state = useSyncExternalStore(preferences.subscribe, preferences.get);
  const { tabScope, gesturesEnabled, gestures, newTabPreviewOpen, workspaceTabsAutoCollapse,
    favoritesDisplay, workspaceButtonDisplay, conversationFileView, initialSidebarPercent, fileDoubleClick } = state;
  const setting = (name, label, value, options, detail) => h(PreferenceRow, {
    label, value, options, ...detail, change: next => preferences.update({ [name]: next }),
  });
  return h('div', { className: 'dwe-preferences' },
    h('fieldset', null,
      h('legend', null, '右侧栏与会话', h('br'), '交互方式'),
      h('div', { className: 'dwe-preference-rows' },
        setting('tabScope', '文件浏览标签与会话的关系', tabScope, tabScopes, { description: scopeDescriptions[tabScope] }),
        setting('initialSidebarPercent', '初始侧栏占窗口宽度', initialSidebarPercent, undefined,
          { range: { min: 15, max: 80 }, description: '首次使用时生效。已调整过的侧栏宽度会随布局保存。' }),
        setting('fileDoubleClick', '鼠标双击文件时的操作', fileDoubleClick, fileDoubleClickActions),
        setting('quickFloatMinimize', '快速收回所有小窗', state.quickFloatMinimize, quickFloatMinimizeActions),
        setting('conversationFileView', '从会话中打开文件的方式', conversationFileView, conversationFileViews),
        setting('newTabPreviewOpen', '新建标签页时开启预览窗格', newTabPreviewOpen, undefined,
          { description: '仅用于通过顶部「＋」打开开始页后创建的标签。' }),
        setting('workspaceTabsAutoCollapse', '工作区标签页未选中时自动折叠', workspaceTabsAutoCollapse, undefined,
          { illustration: 'file-folder-workspace' }))),
    h('fieldset', null,
      h('legend', null, '工具栏'),
      h('div', { className: 'dwe-preference-rows' },
        setting('favoritesDisplay', '收藏夹按钮', favoritesDisplay, buttonDisplays, { illustration: 'favorites' }),
        setting('workspaceButtonDisplay', '工作区内浏览按钮', workspaceButtonDisplay, buttonDisplays, { illustration: 'workspace-scope' }))),
    h('fieldset', null,
      h('legend', null, '右键手势'),
      h('div', { className: 'dwe-preference-rows' },
        setting('gesturesEnabled', '启用右键手势', gesturesEnabled),
        gesturesEnabled && h('div', { className: 'dwe-gesture-preferences' },
          gestureDirections.map(([direction, label]) => h(PreferenceRow, {
            key: direction, label, value: gestures[direction], options: gestureActions,
            change: action => preferences.update({ gestures: { ...preferences.get().gestures, [direction]: action } }),
          }))))),
    preferences.registry.features.length > 0 && h('fieldset', null,
      h('legend', null, '扩展功能'),
      h('div', { className: 'dwe-preference-rows' }, preferences.registry.features.map(({ id, setting }) => h(PreferenceRow, {
        key: id, label: setting.label, description: setting.description, options: setting.options,
        value: preferences.registry.read(id, state.extensions), change: next => preferences.setExtension(id, next),
      })))));
}
