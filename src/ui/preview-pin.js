const h = react.createElement;

export function HiddenPreviewTabs({ tabs, guides = [] }) {
  if (!tabs.length && !guides.length) return null;
  const strip = '[data-sidebar-right-panel] [data-dockkit-strip-tabs] ';
  const tabSelector = id => '[data-dockkit-tab="' + CSS.escape(id) + '"]';
  const hide = [];
  if (tabs.length) {
    const hidden = ':is(' + tabs.map(tab => tabSelector(tab.tabId ?? tab.id)).join(',') + ')';
    const divider = ':not([data-dockkit-tab], [data-dockkit-caret])';
    hide.push(strip + hidden, strip + hidden + ':first-child + ' + divider, strip + divider + ':has(+ ' + hidden + ')');
  }
  for (const id of guides) hide.push(strip + tabSelector(id) + ' [data-dockkit-tab-close]');
  return h('style', null, hide.join(', ') + ' {display:none!important}');
}
