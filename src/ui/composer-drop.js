import { disks } from './workspace.js';
import { localPath, pathName, underPath } from './navigation.js';
import { createDropFrame } from './drop-overlay.js';
import { createPreviewPageOverlay, isDesktopFileDrag, previewPageAt, visiblePreviewPage } from '../client/preview-drop.js';

const { useEffect, useRef } = react;
const dragType = 'application/x-dsh-workspace-explorer-file';
const stripSelector = '[data-dockkit-strip]';
const conversationContent = '[data-conversation-content]';
const editable = '[data-composer-input][contenteditable="true"]';
const imageTypes = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

function tabFrameBounds(strip) {
  const { left, top, right, bottom } = strip.getBoundingClientRect();
  return { left: left + 3, top: top + 2, right, bottom: bottom + 8 };
}

function tabStripAt(target, x, y) {
  const strip = target?.closest(stripSelector);
  if (strip) return strip;
  const nearby = target?.closest('[data-dockkit-pane]')?.querySelector(':scope > ' + stripSelector);
  if (!nearby) return null;
  const { left, top, right, bottom } = tabFrameBounds(nearby);
  return x >= left && x < right && y >= top && y < bottom ? nearby : null;
}

export function beginPreviewTabDrag(sessionId, reference, open) {
  const conversation = createDropFrame('conversation');
  const preview = open && createPreviewPageOverlay();
  const destination = element => preview && previewPageAt(element, sessionId);
  function hide() { conversation.hide(); preview?.hide(); }
  return {
    move(x, y) {
      const element = document.elementFromPoint(x, y);
      const page = destination(element);
      preview?.show(page ?? visiblePreviewPage(sessionId), Boolean(page));
      const area = conversationDropArea(sessionId)?.area;
      if (area) conversation.show(conversationFrameBounds(area, sessionId), !page && area.contains(element));
      else conversation.hide();
    },
    finish(x, y) {
      hide();
      const element = document.elementFromPoint(x, y);
      const page = destination(element);
      if (page) open(page.dataset.dwePreviewPane, page.dataset.dwePreviewPage);
      else if (conversationDropArea(sessionId)?.area.contains(element)) reference();
    },
    cancel: hide,
  };
}

function conversationFrameBounds(area, sessionId) {
  const { left, top, right, bottom } = area.getBoundingClientRect();
  const selector = '[data-sidebar-right-panel][data-sidebar-right-session="' + CSS.escape(sessionId) + '"] [data-dockkit-strip]';
  const tabs = [...document.querySelectorAll(selector)].find(strip =>
    strip.getClientRects().length && !strip.closest('[hidden], [inert], [aria-hidden="true"]'));
  return { left, top: tabs ? tabFrameBounds(tabs).top : top + 4, right, bottom };
}

function composerCard(target, sessionId) {
  if (!sessionId || !(target instanceof Element)) return null;
  const conversation = target.closest(conversationContent);
  if (conversation?.dataset.conversationSession !== sessionId) return null;
  const card = target.closest('[data-composer-card]');
  return card?.querySelector(editable) ? card : null;
}

function conversationDropArea(sessionId) {
  if (!sessionId) return;
  const selector = conversationContent + '[data-conversation-session="' + CSS.escape(sessionId) + '"]';
  for (const content of document.querySelectorAll(selector)) {
    if (content.closest('[data-sidebar-right-panel], [hidden], [inert], [aria-hidden="true"]')) continue;
    if (!content.getClientRects().length || !content.querySelector(editable)) continue;
    const parent = content.parentElement;
    const center = document.querySelector('[data-rightbar-col]')?.previousElementSibling;
    const area = center?.contains(content) ? center : content.closest(':has(> header [data-conversation-header-leading])') ?? parent ?? content;
    return { area, content };
  }
}

export function insertPaths(input, items) {
  if (!input?.addFiles) return false;
  if (items.some(({ path }) => path.startsWith('/') && /[\u0000-\u001f\u007f-\u009f"]/u.test(path))) {
    input.notify?.('error', '此文件名无法作为路径引用，可改用附件或复制路径');
    return true;
  }
  const references = items.map(({ path, name, folder }) => {
    const absolute = path.startsWith('/') ? path : path.replaceAll('\\', '/');
    const target = folder && !absolute.endsWith('/') ? absolute + '/' : absolute;
    const ref = /\s/u.test(target) ? '@"' + target + '"' : '@' + target;
    const label = name || pathName(path);
    return { source: 'reference', ref, label, appearance: folder ? 'folder' : 'file', clipboardText: ref };
  });
  // Restore the draft selection before the insertion moves it past the new chips.
  input.focus();
  return input.addFiles(references, []);
}

export function installConversationPathDrop(mounted, getInput) {
  const lifetime = new AbortController();
  const capture = { capture: true, signal: lifetime.signal };
  const { show: showFrame, hide: reset, dispose } = createDropFrame('conversation');

  function start(event) {
    if (!event.dataTransfer?.types.includes(dragType)) return;
    const sessionId = mounted.getSnapshot();
    const area = conversationDropArea(sessionId)?.area;
    if (area) showFrame(conversationFrameBounds(area, sessionId), false);
  }

  function hover(event) {
    const desktop = isDesktopFileDrag(event);
    if (!desktop && !event.dataTransfer?.types.includes(dragType)) return;
    const sessionId = mounted.getSnapshot();
    const area = conversationDropArea(sessionId)?.area;
    if (!area) { reset(); return; }
    const active = area.contains(event.target) && !previewPageAt(event.target, sessionId);
    showFrame(conversationFrameBounds(area, sessionId), active);
    if (!desktop || !active) return;
    // The host also observes file drags on document. Use only the path drop feedback.
    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = 'copy';
  }

  function drop(event) {
    reset();
    if (!isDesktopFileDrag(event)) return;
    const sessionId = mounted.getSnapshot();
    const area = conversationDropArea(sessionId)?.area;
    if (!area?.contains(event.target) || previewPageAt(event.target, sessionId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const files = event.dataTransfer?.files;
    const bridge = window.__DSH_HOST_PATHS__;
    const input = getInput(sessionId);
    if (!files?.length) return;
    let items;
    try {
      const entries = [...event.dataTransfer.items].filter(item => item.kind === 'file');
      items = [...files].map((file, index) => ({
        path: localPath(bridge.pathFor(file)), name: file.name,
        folder: entries[index]?.webkitGetAsEntry?.()?.isDirectory === true,
      }));
    }
    catch { /* The host could not resolve the native file paths. */ }
    if (!items || items.some(item => !item.path) || !insertPaths(input, items)) {
      input?.notify('error', '当前无法引用文件路径');
    }
  }

  const stop = mounted.subscribe(reset);
  document.addEventListener('dragstart', start, { signal: lifetime.signal });
  document.addEventListener('dragenter', hover, capture);
  document.addEventListener('dragover', hover, capture);
  document.addEventListener('dragleave', event => {
    if (!event.relatedTarget) reset();
  }, capture);
  document.addEventListener('drop', drop, capture);
  window.addEventListener('dragend', reset, capture);
  return () => {
    lifetime.abort();
    stop();
    dispose();
  };
}

export async function sendComposerFiles(sessionId, getInput, items, mode, root, signal, target) {
  if (!sessionId || signal?.aborted) return;
  function targetCard(target) {
    return composerCard(target, sessionId);
  }

  function currentCard() {
    const conversation = '[data-conversation-session="' + CSS.escape(sessionId) + '"]';
    return [...document.querySelectorAll(conversation + ' [data-composer-card]')]
      .find(card => card.getClientRects().length && targetCard(card) === card);
  }

  const card = target ?? currentCard();
  if (!card || targetCard(card) !== card) throw new Error('当前会话没有可用的输入框');
  if (mode === 'reference') {
    if (!insertPaths(getInput(sessionId), items)) throw new Error('当前无法引用文件路径');
    return;
  }
  const data = new DataTransfer();
  if (mode === 'text') {
    data.setData('text/plain', items.map(item => item.path).join('\n'));
    const editor = card.querySelector(editable);
    editor.focus({ preventScroll: true });
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    return;
  }
  for (const file of items) {
    const bytes = await disks.readBytes(file.path, signal, root);
    if (signal?.aborted || !card.isConnected || targetCard(card) !== card) return;
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    data.items.add(new File([bytes], file.name, {
      type: imageTypes.get(extension) ?? 'application/octet-stream',
    }));
  }
  // Pass attachments through DSH's existing validation and draft intake.
  card.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
}

export function useComposerDrop(sessionId, openFolderTab, openPreviewFiles, reportError, root, getInput) {
  const nativeDrag = useRef(null);
  const sendToComposer = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifetime = new AbortController();
    const { signal } = lifetime;
    const capture = { signal, capture: true };
    const stripFrame = createDropFrame('tabs');
    const previewFrame = createPreviewPageOverlay();

    async function insert(items, mode, card) {
      reportError('');
      try { await sendComposerFiles(sessionId, getInput, items, mode, root, signal, card); }
      catch (error) { if (!signal.aborted) reportError('无法添加到对话框 · ' + (error?.message || String(error))); }
    }
    sendToComposer.current = insert;

    function start(event) {
      const drag = nativeDrag.current;
      const source = event.target;
      if (!(drag?.folder || drag?.preview) || !event.dataTransfer?.types.includes(drag.type) || !(source instanceof Element)) return;
      const panel = source.closest('[data-sidebar-right-panel]');
      if (panel?.dataset.sidebarRightSession !== sessionId) return;
      const paneId = source.closest('[data-dockkit-pane]')?.dataset.dockkitPane;
      const selector = paneId ? '[data-dockkit-strip="' + CSS.escape(paneId) + '"]' : '[data-dockkit-strip]';
      drag.strip = panel.querySelector(selector);
      if (drag.folder && drag.strip) stripFrame.show(tabFrameBounds(drag.strip), false);
      if (drag.preview) {
        document.documentElement.setAttribute('data-dwe-explorer-file-drag', '');
        previewFrame.show(visiblePreviewPage(sessionId), false);
      }
    }

    function over(event) {
      const drag = nativeDrag.current;
      if (!drag || !event.dataTransfer?.types.includes(drag.type)) return;
      const page = drag.preview && previewPageAt(event.target, sessionId);
      const strip = dropStrip(event, drag);
      if (strip) drag.strip = strip;
      if (drag.folder && !page && drag.strip?.isConnected) stripFrame.show(tabFrameBounds(drag.strip), Boolean(strip));
      else stripFrame.hide();
      if (drag.preview) previewFrame.show(page ?? visiblePreviewPage(sessionId), Boolean(page));
      if (!page && !strip && !conversationDropArea(sessionId)?.area.contains(event.target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function resetNative() {
      if (nativeDrag.current?.preview) document.documentElement.removeAttribute('data-dwe-explorer-file-drag');
      nativeDrag.current = null;
      stripFrame.hide();
      previewFrame.hide();
    }

    function dropStrip({ target, clientX, clientY }, drag) {
      if (!drag.folder || !(target instanceof Element)) return null;
      const strip = tabStripAt(target, clientX, clientY);
      return drag.folder || strip?.closest('[data-sidebar-right-panel]')?.dataset.sidebarRightSession === sessionId
        ? strip : null;
    }

    function drop(event) {
      const drag = nativeDrag.current;
      if (!drag || event.dataTransfer?.getData(drag.type) !== drag.token) return;
      const page = drag.preview && previewPageAt(event.target, sessionId);
      const strip = dropStrip(event, drag);
      const destination = strip || page ? null : conversationDropArea(sessionId);
      resetNative();
      if (!page && !strip && !destination?.area.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (page || strip) {
        reportError('');
        const paneId = page?.dataset.dwePreviewPane ?? strip?.dataset.dockkitStrip;
        if (drag.preview) {
          const files = drag.items.filter(item => !item.folder).map(item => ({ absolute: item.path, name: item.name, size: item.size }));
          openPreviewFiles(files, root, paneId, sessionId, page?.dataset.dwePreviewPage);
        }
        else openFolderTab(drag.folder, paneId);
      } else void insert(drag.items, 'reference', destination.content.querySelector(editable).closest('[data-composer-card]'));
    }

    document.addEventListener('dragstart', start, { signal });
    document.addEventListener('dragenter', over, capture);
    document.addEventListener('dragover', over, capture);
    document.addEventListener('dragleave', event => {
      if (!event.relatedTarget) {
        stripFrame.hide();
        previewFrame.hide();
      }
    }, capture);
    document.addEventListener('drop', drop, capture);
    window.addEventListener('dragend', resetNative, { signal });
    window.addEventListener('blur', resetNative, { signal });
    return () => {
      lifetime.abort();
      sendToComposer.current = null;
      resetNative();
      stripFrame.dispose();
      previewFrame.dispose();
    };
  }, [sessionId, openFolderTab, openPreviewFiles, reportError, root, getInput]);

  function startTransfer(event, type, data) {
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    const token = crypto.randomUUID();
    nativeDrag.current = { token, type, ...data };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(type, token);
  }

  return {
    startDrag: (event, items, tab = {}) => startTransfer(event, dragType, { items, ...tab }),
    startPreviewDrag: (_source, file) => beginPreviewTabDrag(sessionId,
      () => sendToComposer.current?.([{ path: file.absolute, name: file.name }], 'reference'),
      (paneId, address) => openPreviewFiles([file], root, paneId, sessionId, address)),
    send: (items, mode) => sendToComposer.current?.(items, mode),
  };
}
