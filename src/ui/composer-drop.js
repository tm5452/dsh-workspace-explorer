import { disks } from './workspace.js';

const { useEffect, useRef } = react;
const dragType = 'application/x-dsh-workspace-explorer-file';
const imageTypes = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

export function useComposerDrop(sessionId, openFolderTab, reportError, root) {
  const active = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifetime = new AbortController();
    const signal = lifetime.signal;
    let highlighted;
    let highlightClass;

    function highlight(element, className) {
      if (element === highlighted && className === highlightClass) return;
      if (highlighted) highlighted.classList.remove(highlightClass);
      highlighted = element;
      highlightClass = className;
      if (highlighted) highlighted.classList.add(highlightClass);
    }

    function targetCard(target) {
      if (!(target instanceof Element)) return null;
      const conversation = target.closest('[data-conversation-content]');
      if (conversation?.dataset.conversationSession !== sessionId) return null;
      const card = conversation.querySelector('[data-composer-card]');
      return card?.querySelector('[data-composer-input][contenteditable="true"]') ? card : null;
    }

    function over(event) {
      const drag = active.current;
      if (!drag || !event.dataTransfer?.types.includes(dragType)) return;
      const strip = drag.folder && tabStrip(event.target);
      if (strip) {
        highlight(strip, 'dwe-tab-drop-target');
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        return;
      }
      const card = targetCard(event.target);
      highlight(card, 'dwe-drop-target');
      if (!card) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function reset() {
      active.current = null;
      highlight(null);
    }

    async function drop(event) {
      const file = active.current;
      if (!file || event.dataTransfer?.getData(dragType) !== file.token) return;
      const strip = file.folder && tabStrip(event.target);
      const card = targetCard(event.target);
      reset();
      if (!strip && !card) return;
      event.preventDefault();
      event.stopPropagation();
      reportError('');
      try {
        if (strip) {
          openFolderTab(file.path, strip.dataset.dockkitStrip);
          return;
        }
        if (file.folder) {
          const editor = card.querySelector('[data-composer-input][contenteditable="true"]');
          const data = new DataTransfer();
          data.setData('text/plain', file.path);
          editor.focus({ preventScroll: true });
          editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
          return;
        }
        const bytes = await disks.readBytes(file.path, signal, root);
        // The composer may have switched sessions or become locked during the read.
        if (signal.aborted || !card.isConnected || targetCard(card) !== card) return;
        const extension = file.name.split('.').at(-1)?.toLowerCase();
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File([bytes], file.name, {
          type: imageTypes.get(extension) ?? 'application/octet-stream',
        }));
        // Use the composer's existing attachment intake, including its file checks.
        card.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      } catch (error) {
        if (!signal.aborted) reportError('无法拖入会话 · ' + (error?.message || String(error)));
      }
    }

    document.addEventListener('dragover', over, { signal, capture: true });
    document.addEventListener('drop', drop, { signal, capture: true });
    window.addEventListener('dragend', reset, { signal });
    return () => {
      lifetime.abort();
      reset();
    };
  }, [sessionId, openFolderTab, reportError, root]);

  return (event, path, name, folder = false) => {
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    const token = crypto.randomUUID();
    active.current = { token, path, name, folder };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(dragType, token);
  };
}

function tabStrip(target) {
  return target instanceof Element ? target.closest('[data-dockkit-strip]') : null;
}
