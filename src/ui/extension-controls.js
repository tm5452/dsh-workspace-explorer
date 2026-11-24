import { icon } from './interface-icon.js';
import { extensionAreas, reportExtensionError } from '../extensions/registry.js';

const { createElement: h, useState, useSyncExternalStore } = react;

export function IconButton({ name, label, onClick, onContextMenu, disabled, pressed, className, toolId, extensionId, title }) {
  return h('button', {
    type: 'button', className: className ? 'dwe-tool ' + className : 'dwe-tool',
    'data-dwe-tool': toolId, 'data-dwe-extension-button': extensionId,
    'aria-label': label, title: title ?? label, 'aria-pressed': pressed, onClick, onContextMenu, disabled,
  }, icon(name));
}

export function folderExtensionContext({ sessionId, path, root, selection, refresh }) {
  return Object.freeze({ sessionId, folder: Object.freeze({ path, workspaceRoot: root,
    selection: Object.freeze(selection.map(({ name, type, size }) => Object.freeze({ name, type, size }))),
  }), actions: Object.freeze({ refreshFiles: refresh }) });
}

export function previewExtensionContext(sessionId, file, mode) {
  return Object.freeze({ sessionId, preview: Object.freeze({ name: file.name, path: file.absolute, size: file.size, mode }) });
}

function evaluate(button, preferences, area, context) {
  const value = preferences.registry.read(button.featureId, preferences.get().extensions);
  if (!button.values.includes(value)) return;
  const input = Object.freeze({ ...context, area, value });
  try {
    if (button.visible && !button.visible(input)) return;
    return { input, disabled: Boolean(button.disabled?.(input)), pressed: button.pressed && Boolean(button.pressed(input)) };
  } catch (error) {
    reportExtensionError(button.featureId, error);
    return undefined;
  }
}

function ExtensionButton({ button, state, preferences, area, context, onError }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function click() {
    if (busy) return;
    const current = evaluate(button, preferences, area, context);
    if (!current || current.disabled) return;
    setBusy(true);
    setFailed(false);
    try { await button.run(current.input); }
    catch (error) {
      reportExtensionError(button.featureId, error);
      setFailed(true);
      onError?.(button.label + '运行失败');
    } finally { setBusy(false); }
  }
  return h(IconButton, {
    name: button.icon, label: button.label, title: failed ? button.label + ' · 运行失败' : undefined,
    extensionId: button.featureId + '/' + button.id, className: 'dwe-extension-button',
    disabled: busy || state.disabled, pressed: state.pressed, onClick: click,
  });
}

function RegionButtons({ area, preferences, context, onError }) {
  useSyncExternalStore(preferences.subscribe, preferences.get);
  const buttons = preferences.registry.buttons(area).flatMap(button => {
    const state = evaluate(button, preferences, area, context);
    return state ? [h(ExtensionButton, { key: button.featureId + '/' + button.id, button, state,
      preferences, area, context, onError })] : [];
  });
  return buttons.length ? h('div', { className: 'dwe-extension-group', 'data-dwe-extension-area': area,
    role: 'group', 'aria-label': '扩展操作' }, buttons) : null;
}

export function ExtensionButtons(props) {
  return props.preferences?.registry.buttons(props.area).length ? h(RegionButtons, props) : null;
}

export function PreviewExtensionButtons({ preferences, sessionId, file, mode }) {
  return file && h(ExtensionButtons, { preferences, area: extensionAreas.previewActions,
    context: previewExtensionContext(sessionId, file, mode) });
}
