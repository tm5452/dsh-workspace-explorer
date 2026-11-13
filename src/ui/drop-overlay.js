export function createDropOverlay(element, content = element) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let fade;

  function setVisible(show) {
    if (visible === show) return;
    visible = show;
    const opacity = element.isConnected ? getComputedStyle(content).opacity : 0;
    fade?.cancel();
    if (motion.matches) {
      if (show) document.body.append(element);
      else element.remove();
      return;
    }
    if (show && !element.isConnected) document.body.append(element);
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
    show: () => setVisible(true),
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
