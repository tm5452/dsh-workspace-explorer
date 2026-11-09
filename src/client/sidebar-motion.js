const dockItems = ':is([data-dockkit-host="dock"], [data-dockkit-empty], [data-dockkit-divider])';
const toggleButtons = 'button:is([data-sidebar-right-expand], [data-sidebar-right-toggle])';

export function installSidebarMotion(sidebar) {
  let allowed;
  let collectFrame;
  const instantFrames = new Map();

  function stopMotion() {
    cancelAnimationFrame(collectFrame);
    if (!allowed) return;
    for (const item of allowed.items) delete item.dataset.dweSidebarToggleMotion;
    allowed = undefined;
  }

  function allowButtonMotion(event) {
    const button = event.target instanceof Element && event.target.closest(toggleButtons);
    if (!button || button.disabled) return;
    const sessionId = sidebar.mounted.getSnapshot();
    const panel = sessionId && document.querySelector(
      '[data-sidebar-right-panel][data-sidebar-right-session="' + CSS.escape(sessionId) + '"]',
    );
    const frame = panel?.closest('[data-rightbar-col]')?.parentElement;
    if (!frame) return;

    // A tab selected during the slide must not inherit permission to animate.
    stopMotion();
    const items = [...panel.querySelectorAll(dockItems + ':not([hidden])')];
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
  document.addEventListener('click', allowButtonMotion, true);
  const disposeSwitch = sidebar.mounted.subscribe(stopMotion);
  return () => {
    stopMotion();
    disposeSwitch();
    track.disconnect();
    for (const [frame, request] of instantFrames) {
      cancelAnimationFrame(request);
      delete frame.dataset.dweSidebarTrackInstant;
    }
    document.removeEventListener('click', allowButtonMotion, true);
  };
}
