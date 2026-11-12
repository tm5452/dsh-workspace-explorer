import { disks } from './workspace.js';
import { windowsPath } from './navigation.js';
import { createDragIcon } from './drag-icon.js';

const { useEffect, useRef } = react;
const dragType = 'application/x-dsh-workspace-explorer-file';
const editable = '[data-composer-input][contenteditable="true"]';
const imageTypes = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

function composerCard(target, sessionId) {
  if (!sessionId || !(target instanceof Element)) return null;
  const conversation = target.closest('[data-conversation-content]');
  if (conversation?.dataset.conversationSession !== sessionId) return null;
  const card = target.closest('[data-composer-card]');
  return card?.querySelector(editable) ? card : null;
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

export function installDesktopPathDrop(mounted, getInput) {
  function drop(event) {
    const files = event.dataTransfer?.files;
    const bridge = window.__DSH_HOST_PATHS__;
    if (!event.isTrusted || !files?.length || !bridge?.pathFor) return;
    const sessionId = mounted.getSnapshot();
    const card = composerCard(event.target, sessionId);
    if (!card) return;
    let items;
    try {
      const entries = [...event.dataTransfer.items].filter(item => item.kind === 'file');
      items = [...files].map((file, index) => ({
        path: windowsPath(bridge.pathFor(file)), name: file.name,
        folder: entries[index]?.webkitGetAsEntry?.()?.isDirectory === true,
      }));
    }
    catch { return; }
    if (items.some(item => !item.path)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // The attachment overlay also clears on dragend when a drop bypasses its listener.
    window.dispatchEvent(new DragEvent('dragend'));
    const input = getInput(sessionId);
    if (!insertPaths(input, items)) input?.notify('error', '当前无法引用文件路径');
  }
  document.addEventListener('drop', drop, true);
  return () => document.removeEventListener('drop', drop, true);
}

export function useComposerDrop(sessionId, openFolderTab, reportError, root, closeMenu, getInput) {
  const nativeDrag = useRef(null);
  const rightDrag = useRef(null);
  const sendToComposer = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifetime = new AbortController();
    const { signal } = lifetime;
    const capture = { signal, capture: true };
    let highlighted;
    let highlightClass;
    let suppressContextMenu = false;
    let dragIcon;

    function highlight(element, className) {
      if (element === highlighted && className === highlightClass) return;
      highlighted?.classList.remove(highlightClass);
      highlighted = element;
      highlightClass = className;
      highlighted?.classList.add(highlightClass);
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
      const strip = drag.folder && tabStrip(event.target);
      const card = strip ? null : targetCard(event.target);
      highlight(strip || card, strip ? 'dwe-tab-drop-target' : 'dwe-drop-target');
      if (!strip && !card) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function resetNative() {
      nativeDrag.current = null;
      highlight(null);
    }

    function drop(event) {
      const drag = nativeDrag.current;
      if (!drag || event.dataTransfer?.getData(dragType) !== drag.token) return;
      const strip = drag.folder && tabStrip(event.target);
      const card = strip ? null : targetCard(event.target);
      resetNative();
      if (!strip && !card) return;
      event.preventDefault();
      event.stopPropagation();
      if (strip) {
        reportError('');
        openFolderTab(drag.folder, strip.dataset.dockkitStrip);
      } else void insert(drag.items, 'reference', card);
    }

    function move(event) {
      const drag = rightDrag.current;
      if (!drag || drag.id !== event.pointerId) return;
      if (!(event.buttons & 2)) { cancelRight(); return; }
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        drag.started = true;
        closeMenu();
        dragIcon ??= createDragIcon();
        dragIcon.show(drag.items[0].path);
        document.body.append(dragIcon.element);
      }
      event.preventDefault();
      dragIcon.move(event.clientX, event.clientY);
      highlight(targetCard(document.elementFromPoint(event.clientX, event.clientY)), 'dwe-drop-target');
    }

    function cancelRight() {
      const drag = rightDrag.current;
      if (!drag) return;
      rightDrag.current = null;
      if (drag.started) {
        suppressContextMenu = true;
        dragIcon?.element.remove();
        highlight(null);
      }
    }

    function up(event) {
      const drag = rightDrag.current;
      if (!drag || drag.id !== event.pointerId || event.button !== 2) return;
      cancelRight();
      if (!drag.started) return;
      event.preventDefault();
      const card = targetCard(document.elementFromPoint(event.clientX, event.clientY));
      if (card && drag.source.isConnected) void insert(drag.items, 'attachment', card);
    }

    document.addEventListener('dragover', over, capture);
    document.addEventListener('drop', drop, capture);
    window.addEventListener('dragend', resetNative, { signal });
    document.addEventListener('pointerdown', () => { suppressContextMenu = false; }, capture);
    document.addEventListener('pointermove', move, capture);
    document.addEventListener('pointerup', up, capture);
    document.addEventListener('pointercancel', cancelRight, capture);
    document.addEventListener('contextmenu', event => {
      if (event.button !== 2 || (!rightDrag.current?.started && !suppressContextMenu)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressContextMenu = false;
    }, capture);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') cancelRight();
    }, capture);
    window.addEventListener('blur', cancelRight, { signal });
    return () => {
      lifetime.abort();
      sendToComposer.current = null;
      cancelRight();
      resetNative();
      if (dragIcon) queueMicrotask(dragIcon.dispose);
    };
  }, [sessionId, openFolderTab, reportError, root, closeMenu, getInput]);

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

  function startRightDrag(event, items) {
    if (!sessionId || event.button !== 2 || event.pointerType !== 'mouse') return;
    rightDrag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      source: event.currentTarget, items, started: false,
    };
  }

  return { startDrag, startRightDrag, send: (items, mode) => sendToComposer.current?.(items, mode) };
}

function tabStrip(target) {
  return target instanceof Element ? target.closest('[data-dockkit-strip]') : null;
}
