import { disks } from './workspace.js';

const { useEffect, useRef } = react;
const dragType = 'application/x-dsh-workspace-explorer-file';
const imageTypes = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

export function useComposerDrop(sessionId, reportError) {
  const active = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifetime = new AbortController();
    const signal = lifetime.signal;
    let highlighted;

    function highlight(card) {
      if (card === highlighted) return;
      highlighted?.classList.remove('dwe-drop-target');
      highlighted = card;
      highlighted?.classList.add('dwe-drop-target');
    }

    function targetCard(target) {
      if (!(target instanceof Element)) return null;
      const conversation = target.closest('[data-conversation-content]');
      if (conversation?.dataset.conversationSession !== sessionId) return null;
      const card = conversation.querySelector('[data-composer-card]');
      return card?.querySelector('[data-composer-input][contenteditable="true"]') ? card : null;
    }

    function over(event) {
      if (!active.current || !event.dataTransfer?.types.includes(dragType)) return;
      const card = targetCard(event.target);
      highlight(card);
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
      const card = targetCard(event.target);
      reset();
      if (!card) return;
      event.preventDefault();
      reportError('');
      try {
        const bytes = await disks.readBytes(file.path, signal);
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

    document.addEventListener('dragover', over, { signal });
    document.addEventListener('drop', drop, { signal });
    window.addEventListener('dragend', reset, { signal });
    return () => {
      lifetime.abort();
      reset();
    };
  }, [sessionId, reportError]);

  return (event, path, name) => {
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    const token = crypto.randomUUID();
    active.current = { token, path, name };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(dragType, token);
  };
}
