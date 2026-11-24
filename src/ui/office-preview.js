import { officeAssetsPath } from '../document-types.js';
import { PreviewUnavailable } from './preview-unavailable.js';
import { disks } from './workspace.js';
import { selectionElement, selectionOffset, usePreviewQuote } from './preview-quote.js';
import { previewTopInset } from './preview-zoom.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = react;
const darkTheme = () => document.body.hasAttribute('data-ds-dark-theme');

function wordTablePoint(element) {
  const cell = element.closest('td, th');
  const table = cell?.closest('table.de-tbl');
  if (!table) return;
  const numbered = table.closest('[data-dwe-word-table]');
  const outer = numbered?.querySelector('table.de-tbl');
  const number = numbered?.dataset.dweWordTable;
  const parts = [number ? `正文第 ${number} 个表格` : '表格'];
  const nested = [];
  for (let current = cell; current;) {
    const grid = current.closest('table.de-tbl');
    const parentCell = grid.parentElement.closest('td, th');
    nested.unshift(`第 ${current.parentElement.rowIndex + 1} 行第 ${current.cellIndex + 1} 个单元格`);
    if (grid === outer || !parentCell) break;
    const children = [...parentCell.querySelectorAll('table.de-tbl')]
      .filter(item => item.parentElement.closest('td, th') === parentCell);
    nested.unshift(`第 ${children.indexOf(grid) + 1} 个内嵌表格`);
    current = parentCell;
  }
  const paragraph = element.closest('.de-p');
  const paragraphs = [...cell.querySelectorAll('.de-p')].filter(item => item.closest('td, th') === cell);
  const index = paragraphs.indexOf(paragraph);
  parts.push(...nested);
  if (index >= 0) parts.push(`单元格内第 ${index + 1} 段`);
  return { position: parts.join(' · '), container: index >= 0 ? paragraph : cell };
}

function officePoint(node, offset, end = false) {
  const element = selectionElement(node);
  const page = element?.closest('[data-page], [data-slide]');
  if (!page) return;
  const section = element.closest('[data-pa], [data-sid], [data-top]');
  const { page: pageNumber, slide } = page.dataset;
  const position = pageNumber ? `预览第 ${pageNumber} 页` : `第 ${slide} 张幻灯片`;
  const table = pageNumber && wordTablePoint(element);
  if (table) {
    const character = Math.max(1, selectionOffset(table.container, node, offset) + Number(!end));
    return `${position} · ${table.position} · 第 ${character} 字符`;
  }
  if (!section || !page.contains(section)) return position;
  const { pa, sid, top } = section.dataset;
  const id = pageNumber ? pa : sid ?? top;
  if (id === undefined) return position;
  const character = Math.max(1, selectionOffset(section, node, offset) + Number(!end));
  return `${position} · ${pageNumber ? '段落' : '对象'} ${id} · 第 ${character} 字符`;
}

function columnName(index) {
  let name = '';
  for (let column = index + 1; column > 0; column = Math.floor((column - 1) / 26)) {
    name = String.fromCharCode(65 + (column - 1) % 26) + name;
  }
  return name;
}

function cellAddress(row, col) {
  return columnName(col) + (row + 1);
}

function sheetName(workbook) {
  return workbook?.querySelector('.de-tab[aria-selected="true"]')?.textContent;
}

function sheetTextSelection(selection, event, range) {
  const field = selectionElement(range.startContainer)?.closest('.de-fx-val, [data-dwe-sheet-text]');
  if (!field?.contains(range.endContainer) || !field.contains(event.target)) return;
  const workbook = field.closest('.de-xlsx');
  const name = sheetName(workbook);
  const address = field.dataset.dweCell ?? workbook?.querySelector('.de-grid')?.dataset.dweActiveCell;
  if (!name || !address) return;
  const [row, col] = address.split(',').map(Number);
  return { text: selection.toString(), location: `${name}!${cellAddress(row, col)} · 单元格内文字`,
    rect: range.getClientRects()[0] };
}

function sheetSelection(event) {
  const sheet = event.target.closest?.('.de-grid');
  if (!sheet || event.target.closest('[data-row], [data-col], [data-grip-row], [data-grip-col]')) return;
  // The pinned Office embed exposes its exact grid range on the grid node.
  const range = sheet.dataset.dweSheetRange?.split(',').map(Number);
  if (!range) return;
  const [r0, c0, r1, c1] = range;
  if ((r1 - r0 + 1) * (c1 - c0 + 1) > 1000) return;
  const workbook = sheet.closest('.de-xlsx');
  const name = sheetName(workbook);
  const rect = sheet.querySelector('.de-range, .de-sel')?.getBoundingClientRect();
  if (!name || !rect) return;
  const start = cellAddress(r0, c0);
  const end = cellAddress(r1, c1);
  const view = sheet.ownerDocument.defaultView;
  const clipboardData = new view.DataTransfer();
  sheet.dispatchEvent(new view.ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
  return { text: clipboardData.getData('text/plain'), location: `${name}!${start === end ? start : start + ':' + end}`, rect };
}

function officeAppearance(surface) {
  const body = surface?.closest('.dwe-preview-body');
  const style = body && getComputedStyle(body);
  const start = parseFloat(style?.getPropertyValue('--dwe-preview-action-inset')) || 10;
  return { dark: darkTheme(), inset: surface ? Math.round(previewTopInset(surface)) : 0, outlineTop: start };
}

export function OfficePreview({ file, root, standalone, onQuote }) {
  const surface = useRef(null);
  const frame = useRef(null);
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('loading');
  const { absolute, name } = file;
  const quoteButton = usePreviewQuote(surface, status === 'loaded' && onQuote, (selection, event) => {
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (event.target.closest?.('.de-xlsx')) {
      if (event.target.closest('.de-fx-val, [data-dwe-sheet-text]')) {
        return range && sheetTextSelection(selection, event, range);
      }
      return sheetSelection(event);
    }
    if (!range) return;
    const from = officePoint(range.startContainer, range.startOffset);
    const to = officePoint(range.endContainer, range.endOffset, true);
    if (!from || !to) return;
    return { text: selection.toString(), location: from === to ? from : from + ' 至 ' + to,
      rect: range.getClientRects()[0] };
  }, frame, src);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let ticket;
    void disks.officePreview(absolute, signal, root).then(source => {
      if (signal.aborted) {
        void disks.releasePreview(source.ticket);
        return;
      }
      ticket = source.ticket;
      const url = new URL(officeAssetsPath, location.href);
      const { dark, inset, outlineTop } = officeAppearance(surface.current);
      url.search = new URLSearchParams({ file: 'viewer', ticket, name, theme: dark ? 'dark' : 'light', inset, outlineTop }).toString();
      setSrc(url.href);
    }).catch(() => {
      if (!signal.aborted) setStatus('failed');
    });
    return () => {
      controller.abort();
      if (ticket) void disks.releasePreview(ticket);
    };
  }, [absolute, name, root]);

  useLayoutEffect(() => {
    if (!src) return;
    let ready = false;
    let lastAppearance;
    const controller = new AbortController();
    const update = () => {
      if (!ready || !surface.current?.isConnected) return;
      const appearance = officeAppearance(surface.current);
      if (lastAppearance?.dark === appearance.dark && lastAppearance.inset === appearance.inset &&
          lastAppearance.outlineTop === appearance.outlineTop) return;
      lastAppearance = appearance;
      frame.current?.contentWindow?.postMessage({ type: 'dwe-office-appearance', ...appearance }, location.origin);
    };
    const bootTimer = setTimeout(() => setStatus('failed'), 15_000);
    window.addEventListener('message', event => {
      if (!frame.current || event.source !== frame.current.contentWindow
        || event.origin !== location.origin || event.data?.type !== 'dwe-office-state') return;
      clearTimeout(bootTimer);
      if (event.data.state === 'ready') {
        ready = true;
        update();
      } else if (event.data.state === 'loaded' || event.data.state === 'failed') {
        setStatus(event.data.state);
      }
    }, { signal: controller.signal });
    const theme = new MutationObserver(update);
    theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    const resize = new ResizeObserver(update);
    resize.observe(surface.current);
    return () => {
      clearTimeout(bootTimer);
      controller.abort();
      theme.disconnect();
      resize.disconnect();
    };
  }, [src]);

  if (status === 'failed') return h(PreviewUnavailable, { standalone });
  return h('div', { ref: surface, className: 'dwe-office-preview', 'data-dwe-outline': /\.docx?$/i.test(name) || undefined },
    src && h('iframe', {
      ref: frame, src, title: name, className: 'dwe-office-frame',
      sandbox: 'allow-scripts allow-same-origin', referrerPolicy: 'no-referrer',
      'data-loading': status === 'loading' || undefined,
    }),
    status === 'loading' && h('p', { className: 'dwe-preview-hint', role: 'status' }, '正在打开 Office 文档…'),
    quoteButton);
}
