import { createDropOverlay } from '../ui/drop-overlay.js';
import { localPath } from '../ui/navigation.js';
import { disks } from '../ui/workspace.js';

const pageSelector = '[data-dwe-preview-page]';

function inPreviewSession(page, sessionId) {
  return page?.dataset.dwePreviewSession === sessionId && page.getClientRects().length
    && !page.closest('[hidden], [inert], [aria-hidden="true"]');
}

export function previewPageAt(target, sessionId) {
  const page = target?.closest?.(pageSelector);
  return page && inPreviewSession(page, sessionId) ? page : null;
}

export function visiblePreviewPage(sessionId) {
  return [...document.querySelectorAll(pageSelector)].find(page => inPreviewSession(page, sessionId));
}

export function createPreviewPageOverlay() {
  const frame = document.createElement('div');
  frame.className = 'dwe-conversation-drop dwe-preview-page-drop';
  frame.setAttribute('aria-hidden', 'true');
  const area = document.createElement('div');
  area.className = 'dwe-conversation-drop-area';
  frame.append(area);
  const visibility = createDropOverlay(frame, area);
  function hide() {
    frame.removeAttribute('data-dwe-drop-active');
    visibility.hide();
  }
  return {
    show(page, active, label = '拖到此处打开文件') {
      if (!page) { hide(); return; }
      const { left, top, right, bottom } = page.getBoundingClientRect();
      const floating = page.closest('[data-dockkit-float]');
      const bounds = floating?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      frame.toggleAttribute('data-dwe-floating-drop', Boolean(floating));
      frame.style.inset = [top - bounds.top, bounds.right - right, bounds.bottom - bottom, left - bounds.left]
        .map(value => Math.max(0, value) + 'px').join(' ');
      frame.toggleAttribute('data-dwe-drop-active', active);
      if (area.textContent !== label) area.textContent = label;
      visibility.show(floating ?? document.body);
    },
    hide,
    dispose: visibility.dispose,
  };
}

export function isDesktopFileDrag(event) {
  const types = event.dataTransfer?.types;
  return event.isTrusted && window.__DSH_HOST_PATHS__?.pathFor && types?.includes('Files')
    && !types.includes('application/x-dsh-file') && !types.includes('application/x-dsh-workspace-explorer-file');
}

export function installDesktopPreviewDrop(mounted, openFiles) {
  const lifetime = new AbortController();
  const capture = { signal: lifetime.signal, capture: true };
  const overlay = createPreviewPageOverlay();
  const pending = new Set();

  function cancelPending() {
    for (const lookup of pending) lookup.abort();
    pending.clear();
  }

  function hide() {
    document.documentElement.removeAttribute('data-dwe-desktop-preview-drag');
    overlay.hide();
  }

  function hover(event) {
    if (!isDesktopFileDrag(event)) return;
    const sessionId = mounted.getSnapshot();
    const page = previewPageAt(event.target, sessionId);
    const visible = page ?? visiblePreviewPage(sessionId);
    document.documentElement.toggleAttribute('data-dwe-desktop-preview-drag', Boolean(visible));
    overlay.show(visible, Boolean(page));
    if (!page) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = 'copy';
  }

  async function drop(event) {
    hide();
    if (!isDesktopFileDrag(event)) return;
    const sessionId = mounted.getSnapshot();
    const page = previewPageAt(event.target, sessionId);
    if (!page) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { dwePreviewPane: paneId, dwePreviewPage: address } = page.dataset;
    const paths = [...event.dataTransfer.files].map(file => {
      try { return localPath(window.__DSH_HOST_PATHS__.pathFor(file)); }
      catch { return null; }
    }).filter(Boolean);
    const lookup = new AbortController();
    const { signal } = lookup;
    pending.add(lookup);
    const results = await Promise.allSettled(paths.map(async path => disks.locate(path, signal)));
    pending.delete(lookup);
    if (signal.aborted || mounted.getSnapshot() !== sessionId) return;
    const files = results.flatMap(result => result.status === 'fulfilled' && result.value.type === 'file'
      ? [{ absolute: result.value.path, name: result.value.name, size: result.value.size }] : []);
    if (files.length) openFiles(files, null, paneId, sessionId, address);
  }

  const stop = mounted.subscribe(() => { cancelPending(); hide(); });
  document.addEventListener('dragenter', hover, capture);
  document.addEventListener('dragover', hover, capture);
  document.addEventListener('drop', drop, capture);
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) hide(); }, capture);
  window.addEventListener('dragend', hide, capture);
  window.addEventListener('blur', hide, capture);
  return () => {
    cancelPending();
    lifetime.abort();
    stop();
    hide();
    overlay.dispose();
  };
}
