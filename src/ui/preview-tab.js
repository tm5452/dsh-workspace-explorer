import { usePreviewFileMenu } from './preview-file-menu.js';
import { localPath, pathName, underPath } from './navigation.js';
import { icon } from './interface-icon.js';
import { fileIcon } from './file-icon.js';
import { headerBackdrop, PreviewFileLabel } from './preview-tabs.js';
import { audioType } from '../audio-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { movePreview } from './preview-surface.js';
import { PreviewExtensionButtons } from './extension-controls.js';
import { PreviewWindowButtons } from './preview-float-dock.js';

const prefix = 'dsh-resource://workspace-explorer/preview/';
const h = react.createElement;

export function readLegacyPreviewAddress(address) {
  if (!address?.startsWith(prefix)) return;
  const segments = address.slice(prefix.length).split('/');
  if (segments.length !== 2) return;
  try {
    const absolute = localPath(decodeURIComponent(segments[0]));
    const root = segments[1] ? localPath(decodeURIComponent(segments[1])) : null;
    const name = pathName(absolute);
    if (!name || (segments[1] && !underPath(absolute, root))) return;
    return { root, absolute, name };
  } catch { return; }
}

export function FilePreviewTab({
  sessionId, address, paneId, stack, visible, floating, floatTitle, startPreviewDrag,
  surfaceFor, parkSurface, openFloat, returnInline, openLocal, openNative, send, renamed, preferences,
  minimizeSidebar, maximizeSidebar, closeSidebar, labelInFlight,
}) {
  const item = stack.suspended ? undefined : stack.tabs.find(tab => tab.id === stack.active);
  const file = item?.file;
  const media = file && (audioType(file.name) || thumbnailType(file.name)?.startsWith('video/'));
  const surface = item && surfaceFor(item);
  const anchor = react.useRef(null);
  react.useLayoutEffect(() => {
    if (!surface) return;
    const parent = anchor.current;
    movePreview(surface.host, parent);
    return () => { if (surface.host.parentNode === parent) parkSurface(surface); };
  }, [surface, parkSurface]);
  const menu = usePreviewFileMenu(sessionId, { openLocal, openNative, send, renamed });
  react.useEffect(() => {
    if (!floating || !floatTitle || !item) return;
    const contextMenu = event => menu.show(event, item);
    floatTitle.addEventListener('contextmenu', contextMenu);
    return () => floatTitle.removeEventListener('contextmenu', contextMenu);
  }, [floating, floatTitle, item, menu.show]);
  return h('section', {
    className: floating ? 'dwe dwe-preview dwe-preview-collection dwe-floating-preview' : 'dwe dwe-preview dwe-preview-collection',
    'aria-label': '文件预览', 'data-dwe-preview-page': address,
    'data-dwe-preview-session': sessionId, 'data-dwe-preview-pane': paneId,
    'data-dwe-docked-preview': (!floating && visible) || undefined,
  },
  !floating && h('header', { className: 'dwe-preview-bar', 'data-dwe-media-header': Boolean(media) || undefined },
    headerBackdrop(),
    item && h(PreviewFileLabel, { key: item.id, item, canDragOut: Boolean(sessionId),
      inFlight: labelInFlight, startPreviewDrag, contextMenu: menu.show }),
    visible && stack.tabs.length > 0 && h('div', { className: 'dwe-preview-float-controls', role: 'group', 'aria-label': '预览窗口操作' },
      h(PreviewWindowButtons, { minimize: minimizeSidebar, openFloat, returnInline, maximize: maximizeSidebar, close: closeSidebar }))),
  h('div', { className: 'dwe-preview-body' },
    h('div', { className: 'dwe-preview-anchor', ref: anchor, hidden: !file }),
    !file && h('p', { className: 'dwe-preview-hint dwe-preview-placeholder' }, '拖入文件以预览'),
    menu.render,
    visible && h(PreviewExtensionButtons, { preferences, sessionId, file, mode: 'standalone' })));
}

export function FilePreviewTitle({ file }) {
  return h('span', { 'data-dwe-preview-window-title': '', title: file?.name },
    file ? fileIcon(file.name) : icon('preview', 16), h('span', null, file?.name ?? '文件预览'));
}
