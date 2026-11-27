import { spring } from '../vendor/motion-spring/index.js';

const sampleWindow = 55;
const maxSpeed = 3.5;
const flightTimes = [0, 2, 8, 16, 28, 46, 70, 100, 140, 190, 245, 300, 350, 400, 470, 560, 680];
const handoffDuration = 160;

export function shortcutReleaseImpulse({ x, y }) {
  const speed = Math.hypot(x, y);
  const gain = speed ? Math.min(2.4, 4.8 / speed) : 1;
  return { x: x * gain, y: y * gain };
}

export function shortcutReleaseVelocity(samples, now) {
  const last = samples.at(-1);
  if (!last || now - last.time > sampleWindow) return { x: 0, y: 0 };
  const first = samples.find(sample => last.time - sample.time <= sampleWindow);
  if (first === last) return { x: 0, y: 0 };
  const elapsed = last.time - first.time;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const interval = Math.max(elapsed, Math.hypot(dx, dy) / maxSpeed);
  return interval > 0 ? { x: dx / interval, y: dy / interval } : { x: 0, y: 0 };
}

function translate(x, y) {
  return 'translate3d(' + x + 'px, ' + y + 'px, 0)';
}

function rectChannels(rect) {
  return [rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width, rect.height];
}

export function createShortcutSpring(source, target, velocity) {
  const initial = rectChannels(source);
  const goal = rectChannels(target);
  // Pointer samples use px/ms. Motion's spring velocity is expressed in px/s.
  const velocities = [velocity.x * 1000, velocity.y * 1000, 0, 0];
  const axes = initial.map((value, index) => spring({
    keyframes: [value, goal[index]], velocity: velocities[index],
    stiffness: 900, damping: index < 2 ? 55 : 60, mass: 1, restDelta: .18, restSpeed: 9,
  }));

  function sample(time) {
    const values = axes.map(axis => axis.next(time));
    const [x, y, width, height] = values.map(value => value.value);
    return { rect: { left: x - width / 2, top: y - height / 2, width, height },
      done: values.every(value => value.done) };
  }

  return {
    sample,
    keyframes() {
      const frames = [];
      let duration = 0;
      // Sample once at uneven intervals to capture the initial impulse and settle.
      for (const time of flightTimes) {
        const { rect, done } = sample(time);
        duration = time;
        const atRest = (done && time >= 245) || time === flightTimes.at(-1);
        frames.push(atRest ? target : rect);
        if (atRest) break;
      }
      return { frames, duration, offsets: flightTimes.slice(0, frames.length).map(time => time / duration) };
    },
  };
}

function panelTransform(rect, base) {
  return translate(rect.left, rect.top) + ' scale(' + rect.width / base.width + ', ' + rect.height / base.height + ')';
}

function iconTransform(rect, scale) {
  const [x, y] = rectChannels(rect);
  return translate(x, y) + ' translate(-50%, -50%) scale(' + scale + ')';
}

function protectStrip(stage, strip) {
  if (!strip?.width || !strip.height) {
    stage.style.removeProperty('clip-path');
    return;
  }
  const { left, top, right, bottom } = strip;
  const hole = left + 'px ' + top + 'px, ' + right + 'px ' + top + 'px, '
    + right + 'px ' + bottom + 'px, ' + left + 'px ' + bottom + 'px, ' + left + 'px ' + top + 'px';
  stage.style.clipPath = 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' + hole + ')';
}

function animateFlight(face, source, target, impulse) {
  const base = target.bounds;
  const icon = face.querySelector('svg, img');
  const iconWidth = icon?.getBoundingClientRect().width;
  const stage = document.createElement('div');
  stage.className = 'dwe-shortcut-release-stage';
  stage.setAttribute('aria-hidden', 'true');
  const panel = document.createElement('div');
  panel.className = 'dwe-shortcut-release-panel';
  panel.toggleAttribute('data-dwe-window', Boolean(target.floating));
  panel.style.width = base.width + 'px';
  panel.style.height = base.height + 'px';
  panel.style.transform = panelTransform(base, base);
  const iconSize = 40;
  const initialScale = (iconWidth || iconSize) / iconSize;
  if (icon) {
    icon.classList.add('dwe-shortcut-release-icon');
    icon.style.transform = iconTransform(base, 1);
  }
  protectStrip(stage, target.stripBounds);
  stage.append(panel);
  if (icon) stage.append(icon);
  document.body.append(stage);

  const { frames, duration, offsets } = createShortcutSpring(source, base, impulse).keyframes();
  const options = { duration, fill: 'backwards' };
  const launch = panel.animate(frames.map((rect, i) => ({
    offset: offsets[i], transform: panelTransform(rect, base),
  })), options);
  const iconLaunch = icon?.animate(frames.map((rect, i) => ({
    offset: offsets[i], transform: iconTransform(rect, initialScale + (1 - initialScale) * Math.min(1, offsets[i] * 2)),
  })), options);

  return {
    stage, launch, iconLaunch,
    fade(target) {
      const bounds = target?.bounds ?? base;
      if (target) protectStrip(stage, target.stripBounds);
      const handoff = { duration: handoffDuration, easing: 'ease-out', fill: 'forwards' };
      return [
        panel.animate([
          { transform: panelTransform(base, base), opacity: 1 },
          { transform: panelTransform(bounds, base), opacity: 0 },
        ], handoff),
        icon?.animate([
          { transform: iconTransform(base, 1), opacity: 1 },
          { transform: iconTransform(bounds, 1), opacity: 0 },
        ], handoff),
      ];
    },
  };
}

export function releaseShortcut(badge, face, destination, velocity, open, locate, estimate, finished) {
  let visual;
  let observer;
  let probe;
  let deadline;
  let fading;
  let done = false;

  function stopObserving() {
    observer?.disconnect();
    clearTimeout(probe);
    clearTimeout(deadline);
  }

  function cancel() {
    if (done) return;
    done = true;
    stopObserving();
    visual?.launch.cancel();
    visual?.iconLaunch?.cancel();
    for (const animation of fading ?? []) animation?.cancel();
    visual?.stage.remove();
    badge.dispose();
    finished();
  }

  const impulse = shortcutReleaseImpulse(velocity);
  const landing = destination.mode === 'window'
    ? { ...destination, x: destination.x + impulse.x * 90, y: destination.y + impulse.y * 90 }
    : destination;
  try {
    const source = face.getBoundingClientRect();
    const anticipated = estimate(landing);
    if (!source.width || !source.height || !anticipated.bounds.width || !anticipated.bounds.height
        || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { open(landing, anticipated.movesSurface); } finally { cancel(); }
      return cancel;
    }
    visual = animateFlight(face, source, anticipated, impulse);
    badge.dispose();

    function reveal(target) {
      if (done) return;
      stopObserving();
      fading = visual.fade(target);
      fading[0].onfinish = cancel;
    }

    function checkTarget() {
      const target = locate(landing);
      if (target) reveal(target);
      return Boolean(target);
    }

    visual.launch.onfinish = () => {
      try {
        const opened = open(landing, anticipated.movesSurface);
        if (done) return;
        if (!opened) {
          cancel();
          return;
        }
        // DockKit may attach the real window after the open call returns.
        // Keep the landed placeholder until that commit, including when the sidebar was collapsed.
        probe = setTimeout(() => {
          if (checkTarget()) return;
          observer = new MutationObserver(checkTarget);
          observer.observe(anticipated.container?.isConnected ? anticipated.container : document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['hidden', 'inert', 'aria-hidden', 'data-sidebar-right-open', 'data-dwe-preview-page',
              'data-dwe-float-maximized', 'data-dwe-float-minimized'],
          });
          deadline = setTimeout(() => reveal(), 650);
        }, 0);
      } catch (error) {
        cancel();
        throw error;
      }
    };
  } catch (error) {
    cancel();
    throw error;
  }

  return cancel;
}
