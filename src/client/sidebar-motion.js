const dockItems = ':is([data-dockkit-host="dock"], [data-dockkit-empty], [data-dockkit-divider])';
const panelSelector = '[data-sidebar-right-panel]';
const fullscreenPanel = '[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]';
const toggleButtons = 'button:is([data-sidebar-right-expand], [data-sidebar-right-toggle], [data-dwe-sidebar-toggle-proxy])';

export function installSidebarMotion(sidebar) {
  let allowed;
  let collectFrame;
  const instantFrames = new Map();
  const pushWidths = new WeakMap();
  const fullscreenBounds = new WeakMap();
  let fullscreenMotion;

  function dockFrames(panel) {
    return [...panel.querySelectorAll(dockItems + ':not([hidden])')];
  }

  function measureFullscreen(panel) {
    fullscreenBounds.set(panel, dockFrames(panel).map(item => [item, item.getBoundingClientRect()]));
  }

  const fullscreenResize = new ResizeObserver(records => {
    for (const { target } of records) if (target.matches(fullscreenPanel)) measureFullscreen(target);
  });

  function stopMotion() {
    cancelAnimationFrame(collectFrame);
    if (!allowed) return;
    for (const item of allowed.items) delete item.dataset.dweSidebarToggleMotion;
    allowed = undefined;
  }

  function stopFullscreen() {
    if (!fullscreenMotion) return;
    for (const animation of fullscreenMotion.animations) animation.cancel();
    delete fullscreenMotion.panel.dataset.dweSidebarFullscreenEnter;
    delete fullscreenMotion.panel.dataset.dweSidebarFullscreenExit;
    fullscreenMotion = undefined;
  }

  function trackFullscreen(panel, animations) {
    const motion = fullscreenMotion = { panel, animations };
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (fullscreenMotion === motion) stopFullscreen();
    });
  }

  function enterFullscreen(panel, fromPush) {
    stopFullscreen();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = panel.getBoundingClientRect();
    if (!bounds.width) return;
    measureFullscreen(panel);
    fullscreenResize.observe(panel);
    const startWidth = fromPush ? pushWidths.get(panel) ?? bounds.width / 3 : 0;
    const edge = bounds.right - startWidth;
    panel.dataset.dweSidebarFullscreenEnter = '';
    const animations = [];
    const timing = { duration: 330, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' };
    for (const [item, rect] of fullscreenBounds.get(panel)) {
      const inset = Math.min(rect.width, edge - rect.left);
      if (inset <= 0) continue;
      animations.push(item.animate([{ clipPath: 'inset(0 0 0 ' + inset + 'px)' }, { clipPath: 'inset(0)' }], timing));
    }
    trackFullscreen(panel, animations);
  }

  function leaveFullscreen(panel) {
    stopFullscreen();
    fullscreenResize.unobserve(panel);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const before = fullscreenBounds.get(panel);
    if (!before?.length) return;
    const collapsed = !panel.hasAttribute('data-sidebar-right-open');
    if (collapsed) panel.dataset.dweSidebarFullscreenExit = '';
    const animations = [];
    const timing = { duration: 290, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' };
    for (const [item, previous] of before) {
      if (!item.isConnected || !previous.width) continue;
      if (collapsed) {
        animations.push(item.animate([{ clipPath: 'inset(0)' }, { clipPath: 'inset(0 0 0 100%)' }], timing));
      } else {
        const current = item.getBoundingClientRect();
        if (!current.width) continue;
        const start = 'translateX(' + (previous.left - current.left) + 'px) scaleX(' + previous.width / current.width + ')';
        animations.push(item.animate([{ transform: start, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], timing));
      }
    }
    trackFullscreen(panel, animations);
  }

  function allowButtonMotion(event) {
    const button = event.target instanceof Element && event.target.closest(toggleButtons + ', button[data-sidebar-right-mode]');
    if (!button || button.disabled) return;
    const sessionId = sidebar.mounted.getSnapshot();
    const panel = sessionId && document.querySelector(
      '[data-sidebar-right-panel][data-sidebar-right-session="' + CSS.escape(sessionId) + '"]',
    );
    if (panel?.matches(fullscreenPanel)) {
      measureFullscreen(panel);
      return;
    }
    if (button.hasAttribute('data-sidebar-right-mode')) {
      if (panel?.dataset.sidebarRightPanel === 'push') pushWidths.set(panel, panel.getBoundingClientRect().width);
      return;
    }
    const frame = panel?.closest('[data-rightbar-col]')?.parentElement;
    if (!frame || (panel.dataset.sidebarRightPanel === 'fullscreen' && !sidebar.isExpanded())) return;

    // A tab selected during the slide must not inherit permission to animate.
    stopMotion();
    const items = dockFrames(panel);
    const motion = { frame, items };
    allowed = motion;
    for (const item of items) item.dataset.dweSidebarToggleMotion = '';
    collectFrame = requestAnimationFrame(() => {
      const transitions = [...frame.getAnimations(), ...items.flatMap(item => item.getAnimations())]
        .filter(animation => ['transform', 'grid-template-columns'].includes(animation.transitionProperty));
      Promise.allSettled(transitions.map(animation => animation.finished)).then(() => {
        if (allowed === motion) stopMotion();
      });
    });
  }

  // The shell shares one grid transition between the left and right columns.
  // Snap right-track changes outside the toggle controls so the left controls still animate.
  const track = new MutationObserver(records => {
    for (const frame of new Set(records.map(record => record.target))) {
      if (allowed?.frame === frame || !frame.querySelector(':scope > [data-rightbar-col]')) continue;
      cancelAnimationFrame(instantFrames.get(frame));
      frame.dataset.dweSidebarTrackInstant = '';
      instantFrames.set(frame, requestAnimationFrame(() => {
        instantFrames.set(frame, requestAnimationFrame(() => {
          delete frame.dataset.dweSidebarTrackInstant;
          instantFrames.delete(frame);
        }));
      }));
    }
  });
  track.observe(document.documentElement, { subtree: true, attributeFilter: ['data-rightbar-collapsed'] });
  const fullscreen = new MutationObserver(records => {
    const sessionId = sidebar.mounted.getSnapshot();
    const active = records.filter(({ target }) => target.matches(panelSelector) && target.dataset.sidebarRightSession === sessionId);
    const panel = active[0]?.target;
    if (!panel || panel.closest('[hidden]')) return;
    if (panel.matches(fullscreenPanel)) {
      enterFullscreen(panel, active.some(record => record.oldValue === 'push')
        && !active.some(record => record.attributeName === 'data-sidebar-right-open'));
    } else if (active.some(record => record.oldValue === 'fullscreen'
        || (record.attributeName === 'data-sidebar-right-open' && panel.dataset.sidebarRightPanel === 'fullscreen'))) {
      leaveFullscreen(panel);
    }
  });
  fullscreen.observe(document.body, { subtree: true, attributeOldValue: true,
    attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open'] });
  document.addEventListener('click', allowButtonMotion, true);
  function watchCurrentFullscreen() {
    fullscreenResize.disconnect();
    const sessionId = sidebar.mounted.getSnapshot();
    if (!sessionId) return;
    const panel = document.querySelector(fullscreenPanel + '[data-sidebar-right-session="' + CSS.escape(sessionId) + '"]');
    if (panel) fullscreenResize.observe(panel);
  }
  watchCurrentFullscreen();
  const disposeSwitch = sidebar.mounted.subscribe(() => {
    stopMotion();
    stopFullscreen();
    watchCurrentFullscreen();
  });
  return () => {
    stopMotion();
    stopFullscreen();
    disposeSwitch();
    track.disconnect();
    fullscreen.disconnect();
    fullscreenResize.disconnect();
    for (const [frame, request] of instantFrames) {
      cancelAnimationFrame(request);
      delete frame.dataset.dweSidebarTrackInstant;
    }
    document.removeEventListener('click', allowButtonMotion, true);
  };
}
