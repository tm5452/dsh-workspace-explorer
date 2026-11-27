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
  const row = element.matches('.dwe-row');
  const elementBox = element.getBoundingClientRect();
  if (!elementBox.width || !elementBox.height) return;
  const icon = element.querySelector(row
    ? '.dwe-thumbnail-frame > img, .dwe-thumbnail > svg, .dwe-name > svg, :scope > svg'
    : ':is(.dwe-preview-icon, .dwe-float-dock-file-icon) > :is(svg, img)');
  const iconBox = icon?.getBoundingClientRect();
  if (!iconBox?.width || !iconBox.height) return;
  const name = element.querySelector(row ? '[data-dwe-shortcut-file-name]' : '.dwe-preview-filename');
  const nameBox = name?.getBoundingClientRect();
  const style = getComputedStyle(element);
  let box = elementBox;
  if (row && !element.classList.contains('dwe-tile')) {
    const left = Math.max(elementBox.left, iconBox.left - 6);
    const right = Math.min(elementBox.right, Math.max(iconBox.right, nameBox?.right ?? 0) + 6);
    box = { left, top: elementBox.top, width: right - left, height: elementBox.height };
  }
  const labelStyle = row && name ? getComputedStyle(name) : style;
  return {
    icon, row, bounds: box, iconBounds: iconBox,
    box: {
      ...geometry(box), borderRadius: style.borderRadius,
      backgroundColor: name && !row ? style.getPropertyValue('--dwe-preview-tab-active').trim() : style.backgroundColor,
      outlineColor: name && !row ? 'transparent' : style.borderTopColor, boxShadow: style.boxShadow,
    },
    iconBox: geometry(iconBox, iconBox.left - box.left, iconBox.top - box.top),
    name: nameBox?.width && nameBox.height ? {
      text: name.textContent, bounds: nameBox,
      box: geometry(nameBox, nameBox.left - box.left, nameBox.top - box.top),
      color: labelStyle.color, font: labelStyle.font, letterSpacing: labelStyle.letterSpacing,
      whiteSpace: labelStyle.whiteSpace, textAlign: labelStyle.textAlign,
    } : undefined,
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

function scaledTransform(base, target) {
  return geometry(target).transform + ' scale(' + target.width / base.width + ', ' + target.height / base.height + ')';
}

function drawCompositedFlight(flight, target) {
  const { source, icon } = flight;
  const overlay = document.createElement('div');
  overlay.className = 'dwe-preview-shortcut-flight dwe-preview-file-shortcut-flight';
  overlay.setAttribute('aria-hidden', 'true');
  flight.visual = { overlay };
  const sourcePlate = document.createElement('div');
  const targetPlate = document.createElement('div');
  Object.assign(sourcePlate.style, source.box);
  Object.assign(targetPlate.style, target.box);
  Object.assign(icon.style, geometry(source.iconBounds));
  overlay.append(sourcePlate, targetPlate, icon);

  const caption = source.name ?? target.name;
  const label = caption && document.createElement('span');
  if (label) {
    label.textContent = caption.text;
    const { color, font, letterSpacing, textAlign, whiteSpace } = caption;
    Object.assign(label.style, geometry(caption.bounds), { color, font, letterSpacing, textAlign, whiteSpace });
    overlay.append(label);
  }
  const fileGlyph = icon.localName === 'img' ? cloneTabIcon(target.icon) : undefined;
  if (fileGlyph) {
    Object.assign(fileGlyph.style, geometry(target.iconBounds));
    icon.style.objectFit = getComputedStyle(source.icon).objectFit;
    overlay.append(fileGlyph);
  }
  document.body.append(overlay);

  const move = (element, base, start, end, from, to) => element.animate([
    { transform: scaledTransform(base, start), opacity: from },
    { transform: scaledTransform(base, end), opacity: to },
  ], animationOptions);
  const animations = [
    move(sourcePlate, source.bounds, source.bounds, target.bounds, 1, 0),
    move(targetPlate, target.bounds, source.bounds, target.bounds, 0, 1),
    move(icon, source.iconBounds, source.iconBounds, target.iconBounds, 1, fileGlyph ? 0 : 1),
  ];
  if (fileGlyph) animations.push(move(fileGlyph, target.iconBounds, source.iconBounds, target.iconBounds, 0, 1));
  if (label) {
    const { width, height, left, top } = caption.bounds;
    const dx = target.bounds.left - source.bounds.left;
    const dy = target.bounds.top - source.bounds.top;
    const start = source.name?.bounds ?? { width, height, left: left - dx, top: top - dy };
    const end = target.name?.bounds ?? { width, height, left: left + dx, top: top + dy };
    animations.push(move(label, caption.bounds, start, end, Number(Boolean(source.name)), Number(Boolean(target.name))));
  }
  return animations;
}

export function createPreviewShortcutMotion(getTarget, publish) {
  const flights = new Map();

  function remove(entry) {
    const flight = flights.get(entry);
    if (!flight) return false;
    flights.delete(entry);
    cancelAnimationFrame(flight.frame);
    clearTimeout(flight.timeout);
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
    returnToInline(entry, button, label, finish) {
      if (!button?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      const source = measure(button);
      const target = measure(label);
      if (!source || !target) return false;
      remove(entry);
      const flight = { destination: 'inline', source, icon: cloneTabIcon(source.icon), finish };
      flights.set(entry, flight);
      flight.animations = drawCompositedFlight(flight, target);
      flight.animations[0].onfinish = () => {
        if (flights.get(entry) !== flight) return;
        remove(entry);
        try { finish(); } finally { publish(); }
      };
      publish();
      return true;
    },
    targetMounted(entry) {
      const flight = flights.get(entry);
      if (!flight?.source.row || flight.frame !== undefined) return;
      // The shortcut ref fires in the commit. Measure once after the rail has been laid out.
      flight.frame = requestAnimationFrame(() => {
        const target = measure(getTarget(entry, flight.destination));
        if (!target) {
          cancel(entry);
          return;
        }
        clearTimeout(flight.timeout);
        flight.animations = drawCompositedFlight(flight, target);
        flight.animations[0].onfinish = () => cancel(entry);
      });
    },
    clear() {
      if (!flights.size) return;
      for (const [entry, flight] of flights) {
        remove(entry);
        flight.finish?.();
      }
      publish();
    },
    start(entry, element, destination, { holdSource = false } = {}) {
      if (!element?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const source = measure(element);
      if (!source) return;
      remove(entry);
      const flight = { destination, holdSource, source, icon: cloneTabIcon(source.icon) };
      // Capture the file label before DockKit clears it from the sidebar.
      if (holdSource) flight.visual = mountOverlay(flight, source.name);
      flights.set(entry, flight);
      if (source.row) {
        flight.timeout = setTimeout(() => cancel(entry), 450);
        publish();
        return;
      }
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
