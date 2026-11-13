import { Preview, PreviewBoundary } from './preview.js';
import { resourceAddress, underPath, windowsPath } from './navigation.js';

const prefix = 'dsh-resource://workspace-explorer/preview/';
const h = react.createElement;

export function previewTabAddress(file, root) {
  const absolute = windowsPath(file.absolute);
  const scope = root ? windowsPath(root) : null;
  if (!absolute || (root && !underPath(absolute, scope))) return;
  return prefix + encodeURIComponent(absolute) + '/' + encodeURIComponent(scope ?? '');
}

function readAddress(address) {
  if (!address?.startsWith(prefix)) return;
  const segments = address.slice(prefix.length).split('/');
  if (segments.length !== 2) return;
  try {
    const absolute = windowsPath(decodeURIComponent(segments[0]));
    const root = segments[1] ? windowsPath(decodeURIComponent(segments[1])) : null;
    const name = absolute?.split('\\').at(-1);
    if (!name || (segments[1] && !underPath(absolute, root))) return;
    return { root, absolute, name };
  } catch { return; }
}

export function FilePreviewTab({ useTabInfo }) {
  const { tab } = useTabInfo();
  const address = tab.navigation.address;
  const line = tab.navigation.params?.line;
  const target = react.useMemo(() => readAddress(address), [address]);
  const file = react.useMemo(() => target && {
    absolute: target.absolute, name: target.name, address: resourceAddress(target.absolute),
    line: Number.isSafeInteger(line) && line > 0 ? line : undefined,
  }, [target, line]);

  return h('section', { className: 'dwe dwe-preview', 'aria-label': file?.name ?? '文件预览' },
    h('div', { className: 'dwe-preview-body' },
      file ? h(PreviewBoundary, { key: address, standalone: true }, h(Preview, { file, root: target.root, openImmediately: true }))
        : h('p', { className: 'dwe-preview-hint' }, '无法打开文件预览')));
}

export function previewTabLabel(address) {
  return readAddress(address)?.name ?? '文件预览';
}

export function FilePreviewTitle({ useTabInfo }) {
  const { tab } = useTabInfo();
  const target = readAddress(tab.navigation.address);
  return h('span', { 'data-dwe-tab-title': '', title: target?.absolute },
    h(primitives.FileTypeIcon, { path: target?.name ?? 'file', size: 16 }),
    h('span', null, target?.name ?? '文件预览'));
}
