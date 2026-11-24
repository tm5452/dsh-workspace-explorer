export function createDropOverlay(element, content = element) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let fade;

  function setVisible(show, container = document.body) {
    if (show && element.parentNode !== container && element.isConnected) container.append(element);
    if (visible === show && (!show || element.isConnected)) return;
    visible = show;
    const opacity = element.isConnected ? getComputedStyle(content).opacity : 0;
    fade?.cancel();
    if (motion.matches) {
      if (show) container.append(element);
      else element.remove();
      return;
    }
    if (show && !element.isConnected) container.append(element);
    fade = content.animate([{ opacity }, { opacity: show ? 1 : 0 }], { duration: 140, easing: 'ease-out', fill: 'both' });
    const animation = fade;
    animation.onfinish = () => {
      if (fade !== animation) return;
      if (!visible) element.remove();
      fade = undefined;
      animation.cancel();
    };
  }

  return {
    show: container => setVisible(true, container),
    hide: () => setVisible(false),
    dispose() {
      fade?.cancel();
      fade = undefined;
      visible = false;
      element.remove();
    },
  };
}

export function createDropFrame(kind) {
  const frame = document.createElement('div');
  frame.className = 'dwe-path-drop-frame';
  frame.dataset.dropFrame = kind;
  frame.setAttribute('aria-hidden', 'true');
  const overlay = createDropOverlay(frame);

  return {
    show({ left, top, right, bottom }, active) {
      frame.style.inset = [top, innerWidth - right, innerHeight - bottom, left].map(edge => Math.max(0, edge) + 'px').join(' ');
      frame.toggleAttribute('data-active', active);
      overlay.show();
    },
    hide: overlay.hide,
    dispose: overlay.dispose,
  };
}

export function createSidebarDropOverlay() {
  const frame = document.createElement('div');
  frame.className = 'dwe-conversation-drop';
  frame.setAttribute('aria-hidden', 'true');
  const area = document.createElement('div');
  area.className = 'dwe-conversation-drop-area';
  frame.append(area);
  const visibility = createDropOverlay(frame, area);
  let bounds;

  function contains(x, y) {
    if (!frame.isConnected) return false;
    const { left, right, top, bottom } = bounds ??= frame.getBoundingClientRect();
    return x >= left && x < right && y >= top && y < bottom;
  }

  return {
    layout(fallback) {
      const rightbar = document.querySelector('[data-rightbar-col]');
      const center = rightbar?.previousElementSibling ?? fallback;
      const centerBounds = center.getBoundingClientRect();
      const left = Math.max(0, centerBounds.left);
      const right = rightbar?.getBoundingClientRect();
      frame.style.top = Math.max(0, centerBounds.top) + 'px';
      frame.style.left = (right?.width && right.left > left ? right.left : (left + innerWidth) / 2) + 'px';
      bounds = undefined;
    },
    show(x, y, { label = '拖到此处打开文件', covered = false } = {}) {
      if (area.textContent !== label) area.textContent = label;
      area.hidden = covered;
      visibility.show();
      const active = !covered && contains(x, y);
      frame.toggleAttribute('data-dwe-drop-active', active);
      return active;
    },
    contains,
    hide() {
      bounds = undefined;
      visibility.hide();
    },
    dispose: visibility.dispose,
  };
}
