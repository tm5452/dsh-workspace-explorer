const h = react.createElement;

export function HiddenPreviewTabs({ tabs }) {
  if (!tabs.length) return null;
  const strip = '[data-sidebar-right-panel] [data-dockkit-strip-tabs] ';
  const ids = tabs.map(tab => '[data-dockkit-tab="' + CSS.escape(tab.tabId ?? tab.id) + '"]');
  const hidden = ':is(' + ids.join(',') + ')';
  const divider = ':not([data-dockkit-tab], [data-dockkit-caret])';
  return h('style', null, `${strip}${hidden}, ${strip}${hidden}:first-child + ${divider}, ${strip}${divider}:has(+ ${hidden}) {display:none!important}`);
}
