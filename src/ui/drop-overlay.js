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
