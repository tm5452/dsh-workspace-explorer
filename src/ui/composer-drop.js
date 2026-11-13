import { disks } from './workspace.js';
import { windowsPath } from './navigation.js';
import { createDropOverlay } from './drop-overlay.js';

const { useEffect, useRef } = react;
const dragType = 'application/x-dsh-workspace-explorer-file';
const conversationContent = '[data-conversation-content]';
const editable = '[data-composer-input][contenteditable="true"]';
const imageTypes = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

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

function insertPaths(input, items) {
  if (!input?.addFiles) return false;
  const references = items.map(({ path, name, folder }) => {
    const absolute = path.replaceAll('\\', '/');
    const target = folder && !absolute.endsWith('/') ? absolute + '/' : absolute;
    const ref = /\s/u.test(target) ? '@"' + target + '"' : '@' + target;
    const label = name || absolute.replace(/\/$/, '').split('/').at(-1);
    return { source: 'reference', ref, label, appearance: folder ? 'folder' : 'file', clipboardText: ref };
  });
  // Restore the draft selection before the insertion moves it past the new chips.
  input.focus();
  return input.addFiles(references, []);
}

export function installConversationPathDrop(mounted, getInput) {
  const lifetime = new AbortController();
  const capture = { capture: true, signal: lifetime.signal };
  const frame = document.createElement('div');
  frame.className = 'dwe-path-drop-frame';
  frame.setAttribute('aria-hidden', 'true');
  const { show, hide: reset, dispose } = createDropOverlay(frame);

  function isDesktopDrag(event) {
    const types = event.dataTransfer?.types;
    return event.isTrusted && window.__DSH_HOST_PATHS__?.pathFor
      && types?.includes('Files') && !types.includes('application/x-dsh-file') && !types.includes(dragType);
  }

  function showFrame(area, active) {
    const { left, top, right, bottom } = area.getBoundingClientRect();
    frame.style.inset = [top, innerWidth - right, innerHeight - bottom, left].map(edge => Math.max(0, edge) + 'px').join(' ');
    frame.toggleAttribute('data-active', active);
    show();
  }

  function start(event) {
    if (!event.dataTransfer?.types.includes(dragType)) return;
    const area = conversationDropArea(mounted.getSnapshot())?.area;
    if (area) showFrame(area, false);
  }

  function hover(event) {
    const desktop = isDesktopDrag(event);
    if (!desktop && !event.dataTransfer?.types.includes(dragType)) return;
    const area = conversationDropArea(mounted.getSnapshot())?.area;
    if (!area) { reset(); return; }
    const active = area.contains(event.target);
    showFrame(area, active);
    if (!desktop) return;
    // The host also observes file drags on document. Use only the path drop feedback.
    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = active ? 'copy' : 'none';
  }

  function drop(event) {
    reset();
    if (!isDesktopDrag(event)) return;
    const sessionId = mounted.getSnapshot();
    const area = conversationDropArea(sessionId)?.area;
    if (!area) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!area.contains(event.target)) return;
    const files = event.dataTransfer?.files;
    const bridge = window.__DSH_HOST_PATHS__;
    const input = getInput(sessionId);
    if (!files?.length) return;
    let items;
    try {
      const entries = [...event.dataTransfer.items].filter(item => item.kind === 'file');
      items = [...files].map((file, index) => ({
        path: windowsPath(bridge.pathFor(file)), name: file.name,
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

export function useComposerDrop(sessionId, openFolderTab, reportError, root, getInput) {
  const nativeDrag = useRef(null);
  const sendToComposer = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifetime = new AbortController();
    const { signal } = lifetime;
    const capture = { signal, capture: true };
    let highlighted;
    function highlightStrip(strip) {
      if (strip === highlighted) return;
      highlighted?.classList.remove('dwe-tab-drop-target');
      highlighted = strip;
      highlighted?.classList.add('dwe-tab-drop-target');
    }

    function targetCard(target) {
      return composerCard(target, sessionId);
    }

    function currentCard() {
      const conversation = '[data-conversation-session="' + CSS.escape(sessionId) + '"]';
      return [...document.querySelectorAll(conversation + ' [data-composer-card]')]
        .find(card => card.getClientRects().length && targetCard(card) === card);
    }

    async function insert(items, mode, card = currentCard()) {
      reportError('');
      try {
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
          if (signal.aborted || !card.isConnected || targetCard(card) !== card) return;
          const extension = file.name.split('.').at(-1)?.toLowerCase();
          data.items.add(new File([bytes], file.name, {
            type: imageTypes.get(extension) ?? 'application/octet-stream',
          }));
        }
        // Pass attachments through DSH's existing validation and draft intake.
        card.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      } catch (error) {
        if (!signal.aborted) reportError('无法添加到对话框 · ' + (error?.message || String(error)));
      }
    }
    sendToComposer.current = insert;

    function over(event) {
      const drag = nativeDrag.current;
      if (!drag || !event.dataTransfer?.types.includes(dragType)) return;
      const strip = drag.folder ? tabStrip(event.target) : null;
      highlightStrip(strip);
      if (!strip && !conversationDropArea(sessionId)?.area.contains(event.target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function resetNative() {
      nativeDrag.current = null;
      highlightStrip(null);
    }

    function drop(event) {
      const drag = nativeDrag.current;
      if (!drag || event.dataTransfer?.getData(dragType) !== drag.token) return;
      const strip = drag.folder && tabStrip(event.target);
      const destination = strip ? null : conversationDropArea(sessionId);
      resetNative();
      if (!strip && !destination?.area.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (strip) {
        reportError('');
        openFolderTab(drag.folder, strip.dataset.dockkitStrip);
      } else void insert(drag.items, 'reference', destination.content.querySelector(editable).closest('[data-composer-card]'));
    }

    document.addEventListener('dragover', over, capture);
    document.addEventListener('drop', drop, capture);
    window.addEventListener('dragend', resetNative, { signal });
    return () => {
      lifetime.abort();
      sendToComposer.current = null;
      resetNative();
    };
  }, [sessionId, openFolderTab, reportError, root, getInput]);

  function startDrag(event, items, folder) {
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    const token = crypto.randomUUID();
    nativeDrag.current = { token, items, folder };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(dragType, token);
  }

  return { startDrag, send: (items, mode) => sendToComposer.current?.(items, mode) };
}

function tabStrip(target) {
  return target instanceof Element ? target.closest('[data-dockkit-strip]') : null;
}
