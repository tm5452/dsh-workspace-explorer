import { Preview, PreviewBoundary } from './preview.js';
import { resourceAddress, underPath, localPath, pathName } from './navigation.js';
import { fileIcon } from './file-icon.js';
import { movePreview, PreviewFullscreenButton, PreviewNativeButton } from './preview-surface.js';
import { PreviewExtensionButtons } from './extension-controls.js';

const prefix = 'dsh-resource://workspace-explorer/preview/';
const h = react.createElement;

export function previewTabAddress(file, root) {
  const absolute = localPath(file.absolute);
  const scope = root ? localPath(root) : null;
  if (!absolute || (root && !underPath(absolute, scope))) return;
  return prefix + encodeURIComponent(absolute) + '/' + encodeURIComponent(scope ?? '');
}

function readAddress(address) {
  if (!address?.startsWith(prefix)) return;
  const segments = address.slice(prefix.length).split('/');
  if (segments.length !== 2) return;
  try {
    const absolute = localPath(decodeURIComponent(segments[0]));
    const root = segments[1] ? localPath(decodeURIComponent(segments[1])) : null;
    const name = absolute ? pathName(absolute) : undefined;
    if (!name || (segments[1] && !underPath(absolute, root))) return;
    return { root, absolute, name };
  } catch { return; }
}

export function FilePreviewTab({ useTabInfo, restoreMusicPreview, sendQuote, surface, parkPreview, onExit, onOpenNative, sessionId, preferences }) {
  const { tab } = useTabInfo();
  const address = tab.navigation.address;
  const line = tab.navigation.params?.line;
  const target = react.useMemo(() => readAddress(address), [address]);
  const file = react.useMemo(() => target && {
    absolute: target.absolute, name: target.name, address: resourceAddress(target.absolute),
    line: Number.isSafeInteger(line) && line > 0 ? line : undefined,
  }, [target, line]);
  const anchor = react.useRef(null);
  const [nativeError, setNativeError] = react.useState(null);
  react.useLayoutEffect(() => {
    if (!surface || tab.visible === false) return;
    const destination = anchor.current;
    movePreview(surface.host, destination);
    return () => {
      if (surface.host.parentNode === destination) parkPreview(surface);
    };
  }, [surface, tab.visible, parkPreview]);

  return h('section', { className: 'dwe dwe-preview', 'aria-label': file?.name ?? '文件预览' },
    h('div', { className: 'dwe-preview-body' },
      surface ? h('div', { ref: anchor, className: 'dwe-preview-anchor' }) : file ? h(PreviewBoundary, { key: address, standalone: true },
        h(Preview, { file, root: target.root, openImmediately: true, sendQuote,
          onRestore: restoreMusicPreview ? () => restoreMusicPreview(file) : undefined }))
        : h('p', { className: 'dwe-preview-hint' }, '无法打开文件预览'),
      file && onOpenNative && h(PreviewNativeButton, { disabled: !sessionId || tab.visible === false, async onClick() {
        setNativeError(null);
        try { await onOpenNative(file, target.root); }
        catch (error) { setNativeError({ address, message: error?.message ?? String(error) }); }
      } }),
      file && onExit && h(PreviewFullscreenButton, { exit: true, onClick: () => onExit(file) }),
      nativeError && nativeError.address === address && h('p', { className: 'dwe-preview-action-error dwe-error', role: 'alert' }, nativeError.message),
      tab.visible !== false && h(PreviewExtensionButtons, { preferences, sessionId, file, mode: 'standalone' })));
}

export function previewTabLabel(address) {
  return readAddress(address)?.name ?? '文件预览';
}

export function FilePreviewTitle({ useTabInfo }) {
  const { tab } = useTabInfo();
  const target = readAddress(tab.navigation.address);
  return h('span', { 'data-dwe-tab-title': '', title: target?.absolute },
    fileIcon(target?.name ?? 'file'),
    h('span', null, target?.name ?? '文件预览'));
}
