import { interfaceIconAssets } from '../ui/interface-icon-assets.js';

export const extensionAreas = Object.freeze({
  sidebarShortcuts: 'sidebar-shortcuts',
  previewActions: 'preview-actions',
  fileFooter: 'file-footer',
  fileToolbar: 'file-toolbar',
});

const areas = new Set(Object.values(extensionAreas));
const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const isLabel = value => typeof value === 'string' && value.trim().length > 0;
const matches = (setting, value) => setting.options
  ? typeof value === 'string' && Object.hasOwn(setting.options, value)
  : typeof value === 'boolean';

export function createExtensionRegistry(definitions) {
  const features = new Map();
  const byArea = new Map([...areas].map(area => [area, []]));
  for (const feature of definitions) {
    const { id, setting, buttons = [], activate, activeValues } = feature;
    const invalid = detail => { throw new TypeError(`Explorer extension ${id}: ${detail}`); };
    if (typeof id !== 'string' || !slug.test(id) || features.has(id)) invalid('invalid or duplicate id');
    if (!isLabel(setting?.label) || (setting.description !== undefined && !isLabel(setting.description))) invalid('invalid setting text');
    if (setting.options !== undefined && (!setting.options || typeof setting.options !== 'object' ||
        Array.isArray(setting.options) || Object.keys(setting.options).length < 2 ||
        Object.entries(setting.options).some(([key, label]) => !slug.test(key) || !isLabel(label)))) invalid('invalid options');
    const preference = Object.freeze({
      label: setting.label, description: setting.description,
      options: setting.options && Object.freeze({ ...setting.options }),
      default: setting.default ?? (setting.options ? undefined : false),
    });
    if (!matches(preference, preference.default)) invalid('invalid setting default');
    function validateValues(values) {
      if (!Array.isArray(values) || !values.length || values.some(value => !matches(preference, value))) {
        invalid('expected values supported by its setting');
      }
      return Object.freeze([...values]);
    }
    const enabledValues = validateValues(activeValues ?? (preference.options
      ? Object.keys(preference.options).filter(value => value !== preference.default) : [true]));
    if (activate !== undefined && typeof activate !== 'function') invalid('invalid activation handler');
    if (!Array.isArray(buttons)) invalid('buttons must be an array');
    const buttonIds = new Set();
    for (const button of buttons) {
      if (typeof button.id !== 'string' || !slug.test(button.id) || buttonIds.has(button.id) || !areas.has(button.area) ||
          !isLabel(button.label) || typeof button.icon !== 'string' || !Object.hasOwn(interfaceIconAssets, button.icon) ||
          typeof button.run !== 'function' ||
          ['visible', 'disabled', 'pressed'].some(key => button[key] !== undefined && typeof button[key] !== 'function')) {
        invalid('invalid or duplicate button');
      }
      buttonIds.add(button.id);
      byArea.get(button.area).push(Object.freeze({ ...button, featureId: id,
        values: validateValues(button.values ?? enabledValues) }));
    }
    features.set(id, Object.freeze({ id, setting: preference, activate, activeValues: enabledValues }));
  }
  for (const buttons of byArea.values()) Object.freeze(buttons);
  const empty = Object.freeze([]);
  return Object.freeze({
    features: Object.freeze([...features.values()]),
    buttons: area => byArea.get(area) ?? empty,
    read(id, values) {
      const setting = features.get(id)?.setting;
      const value = values?.[id];
      return setting && (matches(setting, value) ? value : setting.default);
    },
    accepts(id, value) {
      const setting = features.get(id)?.setting;
      return Boolean(setting && matches(setting, value));
    },
  });
}

export function reportExtensionError(id, error) {
  console.error('[workspace-explorer] extension ' + id, error);
}

export function installExtensionEffects(preferences) {
  const { registry } = preferences;
  const effects = registry.features.filter(feature => feature.activate);
  if (!effects.length) return () => {};
  const running = new Map();
  function stop(id, effect) {
    running.delete(id);
    try { effect.cleanup?.(); } catch (error) { reportExtensionError(id, error); }
  }
  function sync() {
    const { extensions } = preferences.get();
    for (const feature of effects) {
      const { id } = feature;
      const value = registry.read(id, extensions);
      const previous = running.get(id);
      if (previous?.value === value) continue;
      if (previous) stop(id, previous);
      if (!feature.activeValues.includes(value)) continue;
      const effect = { value };
      running.set(id, effect);
      try { effect.cleanup = feature.activate(value); }
      catch (error) { reportExtensionError(id, error); }
    }
  }
  sync();
  const unsubscribe = preferences.subscribe(sync);
  return () => {
    unsubscribe();
    for (const [id, effect] of running) stop(id, effect);
  };
}
