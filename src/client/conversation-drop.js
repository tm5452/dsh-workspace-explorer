import { createDragIcon } from '../ui/drag-icon.js';
import { createDropOverlay } from '../ui/drop-overlay.js';

export const changedFileButton = '[data-changed-files] button[aria-describedby]';
const sourceSelector = '[data-presented-file] > button[title], [data-chat-flow] button[class*="_fileMention_"], ' + changedFileButton;
const dragThreshold = 5;

export function installConversationDrop(mounted, readFile, openPreview) {
  const lifetime = new AbortController();
  const overlay = document.createElement('div');
  overlay.className = 'dwe-conversation-drop';
  overlay.setAttribute('aria-hidden', 'true');
  const area = document.createElement('div');
  area.className = 'dwe-conversation-drop-area';
  const icon = createDragIcon();
  overlay.append(area, icon.element);
  const visibility = createDropOverlay(overlay, area);
  let gesture;
  let suppressClick = false;

  function reset() {
    const previous = gesture;
    gesture = undefined;
    if (previous && document.body.hasPointerCapture(previous.pointerId)) {
      document.body.releasePointerCapture(previous.pointerId);
    }
    icon.element.hidden = true;
    visibility.hide();
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
    if (!gesture?.file) return;
    const rightbar = document.querySelector('[data-rightbar-col]');
    const center = rightbar?.previousElementSibling ?? gesture.conversation;
    const centerBounds = center.getBoundingClientRect();
    const left = Math.max(0, centerBounds.left);
    const right = rightbar?.getBoundingClientRect();
    overlay.style.top = Math.max(0, centerBounds.top) + 'px';
    overlay.style.left = (right?.width && right.left > left ? right.left : (left + innerWidth) / 2) + 'px';
  }

  function inDropArea(x, y) {
    const { left, right, top, bottom } = overlay.getBoundingClientRect();
    return x >= left && x < right && y >= top && y < bottom;
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
      // Keep tracking even when the chat rerenders the file card during the drag.
      document.body.setPointerCapture(event.pointerId);
      layout();
      area.textContent = file.review ? '拖到此处在DSH差异审阅中打开' : '拖到此处在DSH文档预览中打开';
      icon.element.hidden = false;
      icon.show(file.file);
    }
    event.preventDefault();
    icon.move(event.clientX, event.clientY);
    visibility.show();
    overlay.toggleAttribute('data-dwe-drop-active', inDropArea(event.clientX, event.clientY));
  }

  function release(event) {
    if (gesture?.pointerId !== event.pointerId || event.button !== 0) return;
    const { file } = gesture;
    const shouldOpen = file && inDropArea(event.clientX, event.clientY);
    reset();
    if (!shouldOpen) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const paneId = hit?.closest('[data-sidebar-right-panel] [data-dockkit-pane]')?.dataset.dockkitPane;
    openPreview(file, paneId);
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
  document.addEventListener('lostpointercapture', cancelPointer, options);
  document.addEventListener('dragstart', event => {
    if (gesture?.button.contains(event.target)) event.preventDefault();
  }, options);
  document.addEventListener('keydown', cancelEscape, options);
  document.addEventListener('click', preventDragClick, options);
  window.addEventListener('resize', layout, options);
  window.addEventListener('blur', reset, { signal: lifetime.signal });
  return () => {
    reset();
    visibility.dispose();
    icon.dispose();
    stop();
    lifetime.abort();
  };
}
