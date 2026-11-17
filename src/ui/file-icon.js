import { isAudioFile } from '../audio-types.js';
import { thumbnailType } from '../thumbnail-types.js';
import { icon } from './interface-icon.js';

const extensionsByIcon = {
  'file-archive': '7z apk bz bz2 cab deb gz iso jar lz lz4 lzma rar rpm tar tbz tbz2 tgz txz war xz zip zst',
  'file-code': 'asm bat c cc cmd cpp cs css diff go h hpp java js json jsonc jsx kt less lua m mjs php pl ps1 py rb rs sass scss sh sql swift toml ts tsx vue xml yaml yml',
  'file-document': 'doc docm docx dot dotx odt pages rtf wps',
  'file-html': 'htm html mht mhtml xhtml',
  'file-image': 'ai dng eps psd raw svg svgz',
  'file-markdown': 'markdown md mdown mdx mkd',
  'file-pdf': 'pdf',
  'file-presentation': 'key odp pot potx pps ppsx ppt pptm pptx',
  'file-spreadsheet': 'csv et numbers ods tsv xls xlsb xlsm xlsx xlt xltx',
  'file-video': 'asf flv m2ts mpegts mts rm rmvb vob',
};
const fileIcons = new Map(Object.entries(extensionsByIcon).flatMap(([name, extensions]) =>
  extensions.split(' ').map(extension => [extension, name])));

const nativeMarkKinds = {
  'file-code': 'code',
  'file-document': 'word',
  'file-html': 'html',
  'file-markdown': 'markdown',
  'file-pdf': 'pdf',
  'file-presentation': 'ppt',
  'file-spreadsheet': 'excel',
  'file-video': 'video',
};

function FileMark({ name, base }) {
  const { FileTypeIcon } = primitives ?? {};
  if (!FileTypeIcon) return null;
  const h = react.createElement;
  const kind = nativeMarkKinds[name];
  const language = name === 'file-code' || name === 'file-default';
  // Keep the DSH mark in its original coordinates over the 34 × 40 file artwork.
  return h('svg', { x: -3, y: 0, width: 40, height: 40, viewBox: '0 0 28 28' },
    language && h('g', { className: 'dwe-file-language', transform: 'translate(8 10.5)' },
      h(FileTypeIcon, { path: base, size: 12 })),
    kind && h(FileTypeIcon, { kind, size: 28, className: 'dwe-file-mark' }));
}

export function fileIcon(name, kind = 'file', size = kind === 'drive' ? 22 : 16) {
  if (kind === 'drive') return icon('drive', size);
  if (kind === 'directory') return icon('file-folder', size);
  const base = name.split(/[\\/]/).at(-1).toLowerCase();
  if (isAudioFile(base)) return icon('audio-file', size);
  const mediaType = thumbnailType(base);
  if (mediaType?.startsWith('image/')) return icon('file-image', size);
  const artwork = mediaType?.startsWith('video/') ? 'file-video'
    : /^(?:readme|changelog|contributing)$/.test(base) ? 'file-markdown'
    : fileIcons.get(/\.([^.]+)$/.exec(base)?.[1]) ?? 'file-default';
  const mark = nativeMarkKinds[artwork] || artwork === 'file-default'
    ? react.createElement(FileMark, { name: artwork, base })
    : undefined;
  return icon(artwork, size, mark);
}
