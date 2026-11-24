import { createDragIcon } from '../ui/drag-icon.js';
import { createSidebarDropOverlay } from '../ui/drop-overlay.js';
import { createPreviewPageOverlay, previewPageAt } from './preview-drop.js';

export const changedFileButton = '[data-changed-files] button[aria-describedby]';
const sourceSelector = '[data-presented-file] > button[title], [data-chat-flow] button[class*="_fileMention_"], ' + changedFileButton;
const dragThreshold = 5;

export function installConversationDrop(mounted, readFile, openPreview) {
  const lifetime = new AbortController();
  const overlay = createSidebarDropOverlay();
  const icon = createDragIcon();
  const previewOverlay = createPreviewPageOverlay();
  let gesture;
  let suppressClick = false;

  function reset() {
    const previous = gesture;
    gesture = undefined;
    if (previous && document.body.hasPointerCapture(previous.pointerId)) {
      document.body.releasePointerCapture(previous.pointerId);
    }
    icon.element.remove();
    overlay.hide();
    previewOverlay.hide();
    document.documentElement.removeAttribute('data-dwe-conversation-file-drag');
  }

  function arm(event) {
    if (event.button !== 0 || event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
    suppressClick = false;
    reset();
    const button = event.target.closest(sourceSelector);
    const conversation = button?.closest('[data-conversation-content]');
    const sessionId = conversation?.dataset.conversationSession;
    if (!sessionId || sessionId !== mounted.getSnapshot()) return;
    gesture = { button, conversation, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function layout() {
    if (gesture?.file) overlay.layout(gesture.conversation);
  }

  function move(event) {
    if (gesture?.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      reset();
      return;
    }
    if (!gesture.file) {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < dragThreshold) return;
      const current = gesture;
      const file = readFile(current.button);
      if (gesture !== current || !file) {
        reset();
        return;
      }
      gesture.file = file;
      suppressClick = true;
      // Track at document level even if Chromium releases capture over an embedded preview.
      document.body.setPointerCapture(event.pointerId);
      document.documentElement.setAttribute('data-dwe-conversation-file-drag', '');
      layout();
      document.body.append(icon.element);
      icon.show(file.file);
    }
    event.preventDefault();
    icon.move(event.clientX, event.clientY);
    const label = gesture.file.review ? '拖到此处打开 DSH 差异审阅' : '拖到此处打开文件';
    const page = previewPageAt(document.elementFromPoint(event.clientX, event.clientY), gesture.file.sessionId);
    overlay.show(event.clientX, event.clientY, { label, covered: Boolean(page) });
    previewOverlay.show(page, true, label);
  }

  function release(event) {
    if (gesture?.pointerId !== event.pointerId || event.button !== 0) return;
    const { file } = gesture;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const page = file && previewPageAt(hit, file.sessionId);
    const shouldOpen = file && (page || overlay.contains(event.clientX, event.clientY));
    reset();
    if (!shouldOpen) return;
    const paneId = page?.dataset.dwePreviewPane ?? hit?.closest('[data-sidebar-right-panel] [data-dockkit-pane]')?.dataset.dockkitPane;
    openPreview(file, paneId, page?.dataset.dwePreviewPage);
  }

  function cancelPointer(event) {
    if (gesture?.pointerId === event.pointerId) reset();
  }

  function cancelEscape(event) {
    if (event.key !== 'Escape' || !gesture?.file) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
  }

  function preventDragClick(event) {
    if (!suppressClick || !event.isTrusted || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  const options = { capture: true, signal: lifetime.signal };
  const stop = mounted.subscribe(reset);
  document.addEventListener('pointerdown', arm, options);
  document.addEventListener('pointermove', move, options);
  document.addEventListener('pointerup', release, options);
  document.addEventListener('pointercancel', cancelPointer, options);
  document.addEventListener('dragstart', event => {
    if (gesture?.button.contains(event.target)) event.preventDefault();
  }, options);
  document.addEventListener('keydown', cancelEscape, options);
  document.addEventListener('click', preventDragClick, options);
  window.addEventListener('resize', layout, options);
  window.addEventListener('blur', reset, { signal: lifetime.signal });
  return () => {
    reset();
    overlay.dispose();
    previewOverlay.dispose();
    icon.dispose();
    stop();
    lifetime.abort();
  };
}
