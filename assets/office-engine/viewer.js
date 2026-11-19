(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const ticket = params.get('ticket');
  const name = params.get('name');
  const container = document.getElementById('office-view');
  const send = state => parent.postMessage({ type: 'dwe-office-state', state }, location.origin);

  if (!/^[0-9a-f-]{36}$/i.test(ticket ?? '') || !name || typeof globalThis.OfficeEngine?.mount !== 'function') {
    send('failed');
    return;
  }

  const file = new URL('/api/dsh.workspaceExplorer/thumbnail', location.href);
  file.searchParams.set('ticket', ticket);
  const theme = mode => ({
    mode,
    tokens: { accent: '#3262E9', radius: '8px' },
    light: { bg: '#fff' },
    dark: { bg: '#151517' },
  });
  let viewer;
  let inset = 0;
  let sheetZoom = 1;
  function setAppearance(dark, topInset, outlineTop) {
    const mode = dark ? 'dark' : 'light';
    const html = document.documentElement;
    const nextInset = Number.isFinite(topInset) ? Math.max(0, Math.min(64, topInset)) : 0;
    if (outlineTop > 0 && outlineTop <= 100) html.style.setProperty('--dwe-office-outline-top', outlineTop + 'px');
    if (html.dataset.theme === mode && inset === nextInset) return;
    inset = nextInset;
    html.dataset.theme = mode;
    html.style.setProperty('--dwe-office-inset', inset + 'px');
    html.toggleAttribute('data-dwe-underlay', inset > 0);
    viewer?.update({ theme: theme(mode), previewInset: inset / sheetZoom });
  }

  setAppearance(params.get('theme') === 'dark', Number(params.get('inset')), Number(params.get('outlineTop')));
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'dwe-office-appearance') return;
    setAppearance(event.data.dark === true, event.data.inset, event.data.outlineTop);
  });

  // Avoid navigations away from the local preview when a document contains links.
  container.addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (link && !link.getAttribute('href').startsWith('#')) event.preventDefault();
  });

  let textCell;
  container.addEventListener('mousedown', event => {
    if (textCell?.contains(event.target)) {
      // Keep the browser's text selection, bypassing the grid's range selection.
      event.stopPropagation();
    } else if (textCell) {
      textCell.removeAttribute('data-dwe-sheet-text');
      textCell = undefined;
      document.getSelection().removeAllRanges();
    }
  }, true);
  container.addEventListener('dblclick', event => {
    const cell = event.target.closest('[data-dwe-cell]');
    const value = cell?.firstElementChild;
    if (!value?.textContent) return;
    textCell = cell;
    textCell.setAttribute('data-dwe-sheet-text', '');
    event.preventDefault();
    document.getSelection().removeAllRanges();
  });
  container.addEventListener('dragstart', event => {
    if (textCell?.contains(event.target)) event.preventDefault();
  });
  container.addEventListener('copy', event => {
    const selection = document.getSelection();
    if (textCell?.contains(selection.anchorNode) && !selection.isCollapsed) event.stopPropagation();
  }, true);

  let lastZoom = -Infinity;
  container.addEventListener('wheel', event => {
    if (!event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    if (performance.now() - lastZoom < 45) return;
    lastZoom = performance.now();
    const zoom = container.querySelector('.de-zoom');
    if (zoom) {
      zoom.querySelector(event.deltaY < 0 ? 'button:last-child' : 'button:first-child')?.click();
    } else if (container.querySelector('.de-xlsx')) {
      sheetZoom = Math.max(0.5, Math.min(3, sheetZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      container.style.setProperty('--dwe-sheet-zoom', sheetZoom);
      viewer?.update({ previewInset: inset / sheetZoom });
    }
  }, { passive: false });

  try {
    viewer = globalThis.OfficeEngine.mount(container, {
      src: file.href, name, theme: theme(document.documentElement.dataset.theme), previewInset: inset / sheetZoom,
      editable: false, allowEdit: false, allowSave: false, allowDownload: false, allowOpen: false,
      toolbar: false, fileMenu: false, thumbnails: false, comments: false, captureSelectAll: false,
      onLoad: () => send('loaded'),
      onError: () => send('failed'),
    });
    send('ready');
  } catch {
    send('failed');
  }
})();
