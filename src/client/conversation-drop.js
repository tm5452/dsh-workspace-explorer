const sourceSelector = '[data-presented-file] > button[title], [data-chat-flow] button[class*="_fileMention_"]';
const dragThreshold = 5;

export function installConversationDrop(mounted, readFile, openTab) {
  const lifetime = new AbortController();
  const overlay = document.createElement('div');
  overlay.className = 'dwe-conversation-drop';
  overlay.setAttribute('aria-hidden', 'true');
  const area = document.createElement('div');
  area.className = 'dwe-conversation-drop-area';
  area.textContent = '拖动到这里以新标签页打开';
  const icon = document.createElement('div');
  icon.className = 'dwe-conversation-drag-icon';
  const iconRoot = reactDomClient.createRoot(icon);
  overlay.append(area, icon);
  let session = new AbortController();
  let gesture;
  let suppressClick = false;

  function reset() {
    const previous = gesture;
    gesture = undefined;
    if (previous && document.body.hasPointerCapture(previous.pointerId)) {
      document.body.releasePointerCapture(previous.pointerId);
    }
    overlay.remove();
    overlay.removeAttribute('data-dwe-drop-active');
    if (previous?.file) iconRoot.render(null);
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
      document.body.append(overlay);
      iconRoot.render(react.createElement(primitives.FileTypeIcon, { path: file.file, size: 28 }));
    }
    event.preventDefault();
    icon.style.setProperty('--dwe-drag-x', event.clientX + 12 + 'px');
    icon.style.setProperty('--dwe-drag-y', event.clientY + 12 + 'px');
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
    openTab(file, paneId, session.signal);
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

  function switchSession() {
    reset();
    session.abort();
    session = new AbortController();
  }

  const options = { capture: true, signal: lifetime.signal };
  const stop = mounted.subscribe(switchSession);
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
    iconRoot.unmount();
    stop();
    session.abort();
    lifetime.abort();
  };
}
