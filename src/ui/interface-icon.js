import { interfaceIconAssets } from './interface-icon-assets.js';

function uniqueMarkup(asset, prefix) {
  let { markup } = asset;
  for (const id of asset.ids ?? []) {
    const qualified = prefix + '-' + id;
    markup = markup.replaceAll(`id="${id}"`, `id="${qualified}"`)
      .replaceAll(`url(#${id})`, `url(#${qualified})`)
      .replaceAll(`href="#${id}"`, `href="#${qualified}"`);
  }
  return markup;
}

function InterfaceIcon({ name, size, mark }) {
  const asset = interfaceIconAssets[name];
  const prefix = 'dwe-icon-' + react.useId();
  const artwork = { __html: uniqueMarkup(asset, prefix) };
  const dockGlyph = 'dsw-icon-panel-left-outline-regular';
  const hostIcon = name === 'dock-to-sidebar' && document.getElementById(dockGlyph)
    ? react.createElement('use', { href: '#' + dockGlyph }) : null;
  return react.createElement('svg', {
    className: 'dwe-interface-icon', width: size, height: size,
    viewBox: asset.viewBox, fill: 'none', focusable: 'false', 'aria-hidden': true, 'data-dwe-interface-icon': name,
    dangerouslySetInnerHTML: mark || hostIcon ? undefined : artwork,
  }, mark ? react.createElement(react.Fragment, null,
    react.createElement('g', { dangerouslySetInnerHTML: artwork }), mark) : hostIcon);
}

export function icon(name, size = 22, mark) {
  return react.createElement(InterfaceIcon, { name, size, mark });
}

export function mountIcon(element, name) {
  const asset = interfaceIconAssets[name];
  element.setAttribute('viewBox', asset.viewBox);
  element.innerHTML = asset.ids ? uniqueMarkup(asset, 'dwe-icon-' + crypto.randomUUID()) : asset.markup;
}
