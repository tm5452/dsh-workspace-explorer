import { spring } from '../vendor/motion-spring/index.js';

const sampleWindow = 55;
const maxSpeed = 3.5;
const maxFrameStep = 24;
const openAfter = 116;

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
  let destination = target;
  function sample(time) {
    const values = axes.map(axis => axis.next(time));
    const [x, y, width, height] = values.map(value => value.value);
    return { rect: { left: x - width / 2, top: y - height / 2, width, height },
      done: values.every(value => value.done) };
  }
  return {
    sample,
    retarget(next, time) {
      const end = rectChannels(next);
      for (const [index, axis] of axes.entries()) {
        axis.retarget([axis.next(time).value, end[index]], axis.velocity(time));
      }
      destination = next;
    },
    keyframes() {
      const frames = [];
      const step = 1000 / 120;
      for (let time = 0; time <= 900; time += step) {
        const { rect, done } = sample(time);
        frames.push(done ? destination : rect);
        if (done && frames.length > 1) break;
      }
      return { frames, duration: step * (frames.length - 1) };
    },
  };
}

function badgeIcon(element) {
  const source = element.querySelector('svg, img');
  if (!source) return;
  const rect = source.getBoundingClientRect();
  source.style.width = rect.width + 'px';
  source.style.height = rect.height + 'px';
  return source;
}

function mountFlight(source, styleElement, icon) {
  const stage = document.createElement('div');
  stage.className = 'dwe-shortcut-release-stage';
  stage.setAttribute('aria-hidden', 'true');
  const overlay = document.createElement('div');
  overlay.className = 'dwe-shortcut-release';
  overlay.style.width = source.width + 'px';
  overlay.style.height = source.height + 'px';
  overlay.style.transform = translate(source.left, source.top);

  const panel = document.createElement('div');
  panel.className = 'dwe-shortcut-release-panel';
  const style = getComputedStyle(styleElement);
  const radius = (parseFloat(style.borderTopLeftRadius) || 0) * source.width / styleElement.offsetWidth;
  Object.assign(panel.style, {
    borderRadius: radius + 'px',
    backgroundColor: style.backgroundColor,
    borderColor: style.borderTopColor,
    boxShadow: style.boxShadow,
  });
  overlay.append(panel);
  if (icon) overlay.append(icon);
  stage.append(overlay);
  document.body.append(stage);
  return { stage, overlay, panel, icon, radius };
}

function protectStrip(stage, strip) {
  if (!strip?.width || !strip.height) return;
  const { left, top, right, bottom } = strip;
  const hole = left + 'px ' + top + 'px, ' + right + 'px ' + top + 'px, '
    + right + 'px ' + bottom + 'px, ' + left + 'px ' + bottom + 'px, ' + left + 'px ' + top + 'px';
  stage.style.clipPath = 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' + hole + ')';
}

function morph(visual, base, target, frames, duration) {
  const { stage, overlay, panel, icon, radius: startRadius } = visual;
  const bounds = target.bounds;
  const targetRadius = target.element
    ? parseFloat(getComputedStyle(target.element).borderTopLeftRadius) || 0 : target.floating ? 15 : 0;
  const motion = [];
  const size = [];
  const windowMotion = [];
  const pending = !target.element;
  protectStrip(stage, target.stripBounds);
  for (const { left, top, width, height } of frames) {
    const scaleX = width / base.width;
    const scaleY = height / base.height;
    const progress = Math.max(0, Math.min(1, (width - base.width) / (bounds.width - base.width || 1)));
    const radius = startRadius + (targetRadius - startRadius) * progress;
    motion.push({ transform: translate(left + (width - base.width) / 2, top + (height - base.height) / 2) });
    size.push({ transform: 'scale(' + scaleX + ', ' + scaleY + ')',
      borderRadius: radius / scaleX + 'px / ' + radius / scaleY + 'px' });
    if (target.floating && !pending) {
      windowMotion.push({ transformOrigin: '0 0',
        transform: translate(left - bounds.left, top - bounds.top) + ' scale(' + width / bounds.width + ', ' + height / bounds.height + ')' });
    }
  }

  const animations = [];
  function play(element, keyframes) {
    if (!element) return;
    const animation = element.animate(keyframes, { duration, fill: 'both' });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  }

  play(overlay, motion);
  play(panel, size);
  const playback = {
    advance(time) {
      for (const animation of animations) animation.currentTime = Math.min(time, duration);
    },
    cancel() {
      for (const animation of animations) animation.cancel();
    },
  };
  if (pending) return playback;
  play(icon, [{ opacity: 1 }, { opacity: 0, offset: .48 }, { opacity: 0 }]);
  play(overlay, [
    { opacity: 1 }, { opacity: 1, offset: target.floating ? .25 : .72 },
    { opacity: 0, offset: target.floating ? .68 : 1 }, { opacity: 0 },
  ]);
  if (target.floating) {
    // Identity at rest leaves the actual window and its native coordinates in charge.
    play(target.element, windowMotion);
  }
  play(target.floating ? target.element : target.reveal,
    [{ opacity: 0 }, { opacity: 0, offset: target.floating ? .18 : .5 }, { opacity: 1 }]);
  return playback;
}

function sameBounds(a, b) {
  return a && ['left', 'top', 'width', 'height'].every(property => Math.abs(a[property] - b[property]) < .5);
}

export function releaseShortcut(badge, face, destination, velocity, open, locate, estimate, finished) {
  const source = face.getBoundingClientRect();
  if (!source.width || !source.height) {
    badge.dispose();
    try { open(destination); } finally { finished(); }
    return;
  }
  const visual = mountFlight(source, face, badgeIcon(face));
  badge.dispose();

  const impulse = shortcutReleaseImpulse(velocity);
  const landing = destination.mode === 'window'
    ? { ...destination, x: destination.x + impulse.x * 90, y: destination.y + impulse.y * 90 }
    : destination;
  const anticipated = estimate(landing);
  const flight = createShortcutSpring(source, anticipated.bounds, impulse);
  const launch = flight.keyframes();
  const initial = morph(visual, source, anticipated, launch.frames, launch.duration);
  const nativeOpenTime = anticipated.deferOpen ? launch.duration : Math.min(openAfter, launch.duration);
  let frame;
  let settled;
  let ending;
  let hold;
  let hidden;
  let lastFrame;
  let launchTime = 0;
  let settledTime = 0;
  let settledDuration;
  let opened = false;
  let landingPainted = false;
  let deadline;
  let previous;
  let done = false;
  function cancel() {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    hold?.cancel();
    ending?.cancel();
    initial.cancel();
    settled?.cancel();
    visual.stage.remove();
    finished();
  }

  function tick(now) {
    // Opening a heavy preview can stall the renderer. Resume from the last displayed spring frame.
    const step = lastFrame === undefined ? 0 : Math.min(maxFrameStep, Math.max(0, now - lastFrame));
    lastFrame = now;
    if (settled) {
      settledTime += step;
      settled.advance(settledTime);
      if (settledTime >= settledDuration) {
        cancel();
        return;
      }
      frame = requestAnimationFrame(tick);
      return;
    }

    launchTime = Math.min(launchTime + step, launch.duration);
    initial.advance(launchTime);
    if (!opened && launchTime >= nativeOpenTime) {
      if (anticipated.deferOpen && !landingPainted) {
        // Finish the moving layer before DockKit replaces the pane and its header.
        landingPainted = true;
        frame = requestAnimationFrame(tick);
        return;
      }
      try {
        opened = open(landing, anticipated.deferOpen);
      } finally {
        if (!opened) cancel();
      }
      if (!opened) return;
      deadline = performance.now() + 650;
    }

    if (opened) {
      const target = locate();
      const ready = target?.bounds?.width > 0 && target.bounds.height > 0;
      const reveal = ready && (target.floating ? target.element : target.reveal);
      if (reveal && hidden !== reveal) {
        hold?.cancel();
        hold = reveal.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'both' });
        hidden = reveal;
      }
      const stable = ready && previous?.element === target.element && sameBounds(previous.bounds, target.bounds);
      if (stable || (ready && now >= deadline)) {
        flight.retarget(target.bounds, launchTime);
        const { frames, duration } = flight.keyframes();
        settledDuration = anticipated.deferOpen ? Math.max(145, duration) : duration;
        settled = morph(visual, source, target, frames, settledDuration);
        initial.cancel();
        hold?.cancel();
      } else if (now >= deadline) {
        ending = visual.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'both' });
        ending.onfinish = cancel;
        return;
      }
      previous = target;
    }
    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);
  return cancel;
}
