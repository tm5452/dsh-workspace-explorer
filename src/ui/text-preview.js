const { createElement: h, useLayoutEffect, useMemo, useRef, useState } = react;
const chunkSize = 2048;
const maxLines = 32;
const lineHeight = 18.6;
const padding = 12;

function textChunks(text) {
  const chunks = [];
  let start = 0;
  let firstLine = 1;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    let lastBreak = -1;
    let breaks = 0;
    for (let i = start; i < end; i++) {
      if (text[i] !== '\n') continue;
      lastBreak = i;
      if (++breaks === maxLines) break;
    }
    const atBreak = lastBreak >= start && (end < text.length || breaks === maxLines);
    if (atBreak) end = lastBreak;
    else if (end < text.length && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
    const value = text.slice(start, end).replace(/\r$/u, '');
    const lengths = value.split('\n').map(line => line.length);
    chunks.push({ value, lengths, firstLine });
    firstLine += lengths.length - Number(!atBreak);
    start = end + Number(atBreak);
  }
  return chunks;
}

function chunkAt(offsets, position) {
  let from = 0;
  let to = offsets.length - 1;
  while (from < to) {
    const middle = Math.floor((from + to + 1) / 2);
    if (offsets[middle] <= position) from = middle;
    else to = middle - 1;
  }
  return from;
}

export function TextPreview({ text, eof, file }) {
  const viewport = useRef(null);
  const heightCache = useRef(new Map());
  const pendingLine = useRef(null);
  const [size, setSize] = useState({ columns: 50, height: 300 });
  const [top, setTop] = useState(0);
  const [revision, setRevision] = useState(0);
  const chunks = useMemo(() => textChunks(text || '（空文件）'), [text]);
  const offsets = useMemo(() => {
    const result = [0];
    for (const chunk of chunks) {
      const estimate = chunk.lengths.reduce((count, length) => count + Math.max(1, Math.ceil(length / size.columns)), 0) * lineHeight;
      result.push(result.at(-1) + (heightCache.current.get(chunk) ?? estimate));
    }
    return result;
  }, [chunks, size.columns, revision]);

  useLayoutEffect(() => {
    const node = viewport.current;
    let width = -1;
    function resize() {
      if (width !== node.clientWidth) {
        width = node.clientWidth;
        heightCache.current.clear();
        setRevision(value => value + 1);
      }
      const columns = Math.max(1, Math.floor((width - 2 * padding) / 7.25));
      const height = node.clientHeight;
      setSize(previous => previous.columns === columns && previous.height === height ? previous : { columns, height });
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!file.line) return;
    const index = chunks.findIndex(chunk => file.line >= chunk.firstLine && file.line < chunk.firstLine + chunk.lengths.length);
    if (index < 0) return;
    pendingLine.current = { index, line: file.line };
    viewport.current.scrollTop = offsets[index];
    setTop(viewport.current.scrollTop);
  }, [chunks, file.line]);

  const first = Math.min(chunks.length - 1, chunkAt(offsets, Math.max(0, top - size.height)));
  const last = Math.min(chunks.length, chunkAt(offsets, top + 2 * size.height) + 1);

  useLayoutEffect(() => {
    const node = viewport.current;
    const anchor = chunkAt(offsets, node.scrollTop);
    let correction = 0;
    let changed = false;
    for (const row of node.querySelectorAll('[data-text-chunk]')) {
      const index = Number(row.dataset.textChunk);
      const measured = row.getBoundingClientRect().height;
      const estimate = offsets[index + 1] - offsets[index];
      if (!measured || Math.abs(measured - estimate) < 0.02) continue;
      heightCache.current.set(chunks[index], measured);
      if (index < anchor) correction += measured - estimate;
      changed = true;
    }
    if (changed) {
      setRevision(value => value + 1);
      if (correction) {
        node.scrollTop += correction;
        setTop(node.scrollTop);
      }
      return;
    }
    const target = pendingLine.current;
    const row = target && node.querySelector('[data-text-chunk="' + target.index + '"]');
    if (row) {
      pendingLine.current = null;
      const chunk = chunks[target.index];
      const offset = chunk.lengths.slice(0, target.line - chunk.firstLine).reduce((sum, length) => sum + length + 1, 0);
      const range = document.createRange();
      range.setStart(row.firstChild, Math.min(offset, chunk.value.length));
      range.collapse(true);
      const lineTop = range.getClientRects().length ? range.getBoundingClientRect().top : row.getBoundingClientRect().top;
      node.scrollTop += lineTop - node.getBoundingClientRect().top - padding;
      setTop(node.scrollTop);
    }
  }, [chunks, first, last, offsets, file.line]);

  return h('div', { ref: viewport, className: 'dwe-text', tabIndex: 0, 'aria-label': '文本预览',
    onScroll: event => setTop(event.currentTarget.scrollTop),
  }, h('div', { style: { height: offsets[first] }, 'aria-hidden': true }),
  ...chunks.slice(first, last).map((chunk, index) => h('div', { key: first + index, 'data-text-chunk': first + index },
    !chunk.value || chunk.value.endsWith('\n') ? chunk.value + '\u200b' : chunk.value)),
  h('div', { style: { height: offsets.at(-1) - offsets[last] }, 'aria-hidden': true }),
  !eof && h('p', { className: 'dwe-text-limit' }, '… 仅显示文件开头，可在原生预览中继续查看'));
}
