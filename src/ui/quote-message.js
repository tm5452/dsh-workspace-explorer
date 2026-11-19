import { windowsPath } from './navigation.js';

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const marker = 'Explorer 引用';
const footer = 'Explorer 引用结束';
const h = react.createElement;
export const quoteNodeId = 'dsh-workspace-explorer.quote';

export function quoteExcerpt(text) {
  let label = '';
  let count = 0;
  for (const { segment } of characters.segment(text.trim().replace(/\s+/gu, ' '))) {
    if (count++ === 5) return { label: label + '…', truncated: true };
    label += segment;
  }
  return { label, truncated: false };
}

export function quoteMessage(file, location, text) {
  const body = `文件：${file.absolute}\n位置：${location}\n原文：\n${text}\n${footer}`.replace(/\r\n?/gu, '\n');
  // DSH sends quote nodes as plain Markdown. Frame the payload so text immediately
  // after a quote and consecutive quotes still render as independent message parts.
  const length = body.length + 2 * body.split('\n').length;
  return `${marker} (${length})\n${body}`;
}

export const quoteRule = {
  id: quoteNodeId,
  // This specific format takes precedence over DSH's generic quote rule (-10).
  order: -20,
  match(text, from) {
    const header = /(?:> Explorer 引用 \(([1-9]\d{0,7})\)\n|^)> 文件：([^\n]+)\n> 位置：([^\n]+)\n> 原文：\n/gmu;
    header.lastIndex = from;
    for (let match; (match = header.exec(text)); ) {
      const [, length, path, position] = match;
      const absolute = windowsPath(path);
      if (!absolute) continue;
      const start = header.lastIndex;
      let end;
      let raw;
      if (length) {
        end = match.index + match[0].indexOf('\n') + 1 + Number(length);
        if (end <= start || end > text.length) continue;
        raw = text.slice(start, end);
        if (!raw.endsWith('\n> ' + footer)) continue;
        raw = raw.slice(0, -footer.length - 3);
      } else {
        // beta4 quotes have no boundary marker, but DSH separates their block
        // from adjacent conversation text with a blank line.
        const lines = /(?:> [^\n]*\n)*(?:> [^\n]*)/uy;
        lines.lastIndex = start;
        raw = lines.exec(text)?.[0] ?? '';
        end = start + raw.length;
      }
      if (!raw.startsWith('> ')) continue;
      const original = raw.replace(/^> /gmu, '');
      if (!original.trim()) continue;
      return { id: quoteNodeId, start: match.index, end, data: { absolute, position, original } };
    }
  },
};

export function MessageQuote({ node, interactive, openFile }) {
  const [failed, setFailed] = react.useState(false);
  const { absolute, position, original } = node.data;
  const props = {
    className: 'dwe-message-quote', title: `${absolute}\n${position}`,
  };
  const children = [h('span', { key: 'mark', 'aria-hidden': true }, '❝'), ' ' + original];
  if (!interactive) return h('span', props, children);
  return h('button', {
    ...props, type: 'button', 'aria-label': `在右侧栏打开 ${absolute.split('\\').at(-1)} 的引用：${quoteExcerpt(original).label}`,
    onClick: async () => setFailed(!await openFile(absolute)),
  }, children, failed && h('span', { role: 'status' }, ' · 无法打开'));
}
