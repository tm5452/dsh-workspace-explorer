import { cloneTabIcon } from '../ui/drag-icon.js';

const animationOptions = { duration: 320, easing: 'cubic-bezier(.18, .75, .28, 1)', fill: 'both' };

function geometry(rect, x = rect.left, y = rect.top) {
  return {
    transform: `translate3d(${x}px, ${y}px, 0)`,
    width: rect.width + 'px', height: rect.height + 'px',
  };
}

function measure(element) {
  if (!element?.isConnected) return;
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const icon = element.querySelector(':is(.dwe-preview-icon, .dwe-float-dock-file-icon) > :is(svg, img)');
  const iconBox = icon?.getBoundingClientRect();
  if (!iconBox?.width || !iconBox.height) return;
  const name = element.querySelector('.dwe-preview-filename');
  const nameBox = name?.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    icon,
    box: {
      ...geometry(box), borderRadius: style.borderRadius,
      backgroundColor: name ? style.getPropertyValue('--dwe-preview-tab-active').trim() : style.backgroundColor,
      outlineColor: name ? 'transparent' : style.borderTopColor, boxShadow: style.boxShadow,
    },
    iconBox: geometry(iconBox, iconBox.left - box.left, iconBox.top - box.top),
    name: name && {
      text: name.textContent,
      box: geometry(nameBox, nameBox.left - box.left, nameBox.top - box.top),
      color: style.color, font: style.font, letterSpacing: style.letterSpacing,
    },
  };
}

function mountOverlay({ source, icon }, caption) {
  const overlay = document.createElement('div');
  overlay.className = 'dwe-preview-shortcut-flight';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, source.box);
  Object.assign(icon.style, source.iconBox);
  overlay.append(icon);

  let label;
  if (caption) {
    label = document.createElement('span');
    label.textContent = caption.text;
    Object.assign(label.style, caption.box, {
      color: caption.color, font: caption.font, letterSpacing: caption.letterSpacing,
      opacity: Number(Boolean(source.name)),
    });
    overlay.append(label);
  }
  document.body.append(overlay);
  return { overlay, label };
}

function draw(flight, destination) {
  const { source, icon } = flight;
  const { overlay, label } = flight.visual ??= mountOverlay(flight, source.name ?? destination.name);
  const animations = [
    overlay.animate([source.box, destination.box], animationOptions),
    icon.animate([source.iconBox, destination.iconBox], animationOptions),
  ];
  if (label) animations.push(label.animate([
    { opacity: Number(Boolean(source.name)) }, { opacity: Number(Boolean(destination.name)) },
  ], animationOptions));
  return animations;
}

export function createPreviewShortcutMotion(getTarget, publish) {
  const flights = new Map();

  function remove(entry) {
    const flight = flights.get(entry);
    if (!flight) return false;
    flights.delete(entry);
    cancelAnimationFrame(flight.frame);
    flight.visual?.overlay.remove();
    for (const animation of flight.animations ?? []) animation.cancel();
    return true;
  }

  function cancel(entry) {
    if (remove(entry)) publish();
  }

  return {
    state(entry) {
      const flight = flights.get(entry);
      return flight?.holdSource ? 'retracting' : flight?.destination;
    },
    cancel,
    clear() {
      if (!flights.size) return;
      for (const entry of flights.keys()) remove(entry);
      publish();
    },
    start(entry, element, destination, { holdSource = false } = {}) {
      if (!element?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const source = measure(element);
      if (!source) return;
      remove(entry);
      const flight = { destination, holdSource, source, icon: cloneTabIcon(source.icon) };
      // The docked tab can disappear before the shortcut's new position settles.
      if (holdSource) flight.visual = mountOverlay(flight, source.name);
      flights.set(entry, flight);
      const deadline = performance.now() + 450;
      let previous;
      function locate(now) {
        const target = measure(getTarget(entry, destination));
        // The sidebar and shortcut column can each move when the host lays out the new target.
        if (now < deadline && (!target || !previous || target.box.transform !== previous.box.transform
            || target.box.width !== previous.box.width || target.box.height !== previous.box.height)) {
          previous = target;
          flight.frame = requestAnimationFrame(locate);
          return;
        }
        if (!target) {
          cancel(entry);
          return;
        }
        flight.animations = draw(flight, target);
        flight.animations[0].onfinish = () => cancel(entry);
      }
      flight.frame = requestAnimationFrame(locate);
      publish();
    },
  };
}
