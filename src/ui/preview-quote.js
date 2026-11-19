import { previewTopInset } from './preview-zoom.js';
import { quoteExcerpt, quoteMessage } from './quote-message.js';

const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = react;
export function insertPreviewQuote(input, file, { text, location }) {
  const { label, truncated } = quoteExcerpt(text);
  if (!label || !input?.insertQuote?.(quoteMessage(file, location, text), {
    // DSH displays detail in the popover and also renders body inline.
    label, title: file.name, detail: truncated ? `${location}\n原文：${text}` : location, body: '',
  })) return false;
  input.persistDraft?.();
  input.focus?.();
  return true;
}

export function selectionElement(node) {
  return node?.nodeType === 1 ? node : node?.parentElement;
}

export function selectionOffset(element, node, offset) {
  const prefix = element.ownerDocument.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

export function usePreviewQuote(surface, onQuote, readSelection, frame, source) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(false);
  const popup = useRef(null);
  const latest = useRef(readSelection);
  latest.current = readSelection;
  const enabled = Boolean(onQuote);

  useEffect(() => {
    if (!enabled || !surface.current) return;
    const host = surface.current;
    const iframe = frame?.current;
    const lifetime = new AbortController();
    let selectionEvents;
    let timer;
    const hide = () => {
      clearTimeout(timer);
      setQuote(null);
      setError(false);
    };
    const outside = event => {
      if (!event.target.closest?.('.dwe-selection-quote')) hide();
    };
    function bind() {
      selectionEvents?.abort();
      const scope = iframe ? iframe.contentDocument : host;
      if (!scope) return;
      selectionEvents = new AbortController();
      const options = { capture: true, signal: selectionEvents.signal };
      if (iframe) scope.addEventListener('pointerdown', outside, options);
      scope.addEventListener('scroll', hide, options);
      function collect(event) {
        if (event.type === 'pointerup' && (event.button !== 0 || event.target.closest?.('.dwe-selection-quote'))) return;
        if (event.type === 'keyup' && event.key === 'Escape') { hide(); return; }
        if (event.type === 'keyup' && !/^(?:Arrow\w+|Home|End|PageUp|PageDown|Shift|a)$/i.test(event.key)) return;
        // Let Office apply its final selection before reading it.
        clearTimeout(timer);
        timer = setTimeout(() => {
          const selection = (iframe?.contentDocument ?? host.ownerDocument).getSelection();
          const picked = latest.current(selection, event);
          if (!picked?.rect || !picked.text.trim()) { hide(); return; }
          const bounds = host.getBoundingClientRect();
          const parent = iframe?.getBoundingClientRect();
          const rect = picked.rect;
          const inset = previewTopInset(host, bounds.top);
          const left = rect.left + (rect.width / 2) + (parent?.left ?? 0) - bounds.left;
          const top = rect.top + (parent?.top ?? 0) - bounds.top;
          const bottom = top + rect.height;
          if (bottom < inset || top > bounds.height) { hide(); return; }
          setError(false);
          setQuote({
            text: picked.text, location: picked.location,
            center: left, top, bottom, inset,
          });
        }, 0);
      }
      scope.addEventListener('pointerup', collect, options);
      scope.addEventListener('keyup', collect, options);
    }
    bind();
    iframe?.addEventListener('load', bind, { signal: lifetime.signal });
    host.ownerDocument.addEventListener('pointerdown', outside, { capture: true, signal: lifetime.signal });
    return () => {
      lifetime.abort();
      selectionEvents?.abort();
      hide();
    };
  }, [surface, frame, source, enabled]);

  useLayoutEffect(() => {
    if (!popup.current || !surface.current || !quote) return;
    const button = popup.current;
    const { clientWidth, clientHeight } = surface.current;
    const { offsetWidth, offsetHeight } = button;
    const above = quote.top - offsetHeight - 5;
    const top = above >= quote.inset ? above : quote.bottom + 5;
    button.style.left = Math.max(6, Math.min(quote.center - offsetWidth / 2, clientWidth - offsetWidth - 6)) + 'px';
    button.style.top = Math.max(quote.inset, Math.min(top, clientHeight - offsetHeight)) + 'px';
  }, [surface, quote, error, enabled]);

  return enabled && quote && h('button', {
    ref: popup, className: 'dwe-selection-quote', type: 'button',
    onPointerDown: event => event.preventDefault(),
    onClick: () => {
      if (onQuote(quote)) setQuote(null);
      else setError(true);
    },
  }, error ? '暂无法引用' : '引用到对话');
}
