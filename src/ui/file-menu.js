import { trashLabel } from './platform.js';

const { createElement: h, Fragment, useLayoutEffect, useRef, useState } = react;

export function FileMenu({ menu, groups, close, invoke, label = '文件操作' }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const node = root.current;
    const bounds = node.getBoundingClientRect();
    const rowHeight = node.querySelector('button')?.offsetHeight ?? 0;
    node.style.left = Math.max(4, Math.min(menu.x, window.innerWidth - bounds.width - 4)) + 'px';
    node.style.top = Math.max(4, Math.min(menu.y + rowHeight / 2, window.innerHeight - bounds.height - 4)) + 'px';
    (node.querySelector('button:not(:disabled)') ?? node).focus({ preventScroll: true });
  }, [menu]);

  useLayoutEffect(() => {
    const node = root.current;
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    function outside(event) {
      const panel = event.target.closest?.('.dwe-file-menu-panel');
      if (!panel || !node.contains(panel)) close();
    }
    document.addEventListener('pointerdown', outside, options);
    document.addEventListener('click', outside, options);
    document.addEventListener('focusin', outside, options);
    document.addEventListener('wheel', outside, options);
    // Focus moves to the embedded document when a click lands in a preview iframe.
    window.addEventListener('blur', close, { signal: controller.signal });
    window.addEventListener('resize', close, options);
    return () => controller.abort();
  }, [close]);

  const panels = groups.filter(group => group.items.length).map(({ label, items }) =>
    h('div', { className: 'dwe-file-menu-panel', key: label, role: 'group', 'aria-label': label },
      ...items.map((item, index) => h(Fragment, { key: item.id },
        index > 0 && item.id === 'reveal' && h('div', { className: 'dwe-file-menu-divider', role: 'separator' }),
        h('button', {
          type: 'button', role: 'menuitem', disabled: item.disabled, 'data-dwe-action': item.id,
          'data-dwe-destructive': item.destructive || undefined,
          onClick: () => invoke(item.id),
        }, item.icon, h('span', null, item.label))))));

  return reactDom.createPortal(h('div', {
    ref: root, className: 'dwe-file-menu', role: 'menu', 'aria-label': label, tabIndex: -1,
    onContextMenu: event => event.preventDefault(),
    onKeyDown: event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const buttons = [...root.current.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
      event.preventDefault();
      event.stopPropagation();
    },
  }, ...panels), document.body);
}

export function DeleteDialog({ entries, close, remove }) {
  const root = useRef(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const dialog = root.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return h('dialog', {
    ref: root, className: 'dwe-file-dialog', 'aria-label': '删除项目',
    onKeyDown: event => event.stopPropagation(),
    onCancel: event => { event.preventDefault(); if (!working) close(); },
  }, h('form', {
    onSubmit: async event => {
      event.preventDefault();
      if (working) return;
      setWorking(true);
      setError('');
      try { await remove(); }
      catch (error) { setError(error.message); setWorking(false); }
    },
  },
  h('h2', null, entries.length === 1 ? '移入' + trashLabel + '？' : '将这 ' + entries.length + ' 项移入' + trashLabel + '？'),
  entries.length === 1
    ? h('div', { className: 'dwe-delete-path', title: entries[0].absolute }, entries[0].absolute)
    : h('ul', { className: 'dwe-delete-path dwe-delete-paths' },
      ...entries.map(entry => h('li', { key: entry.absolute, title: entry.absolute }, entry.absolute))),
  error && h('p', { role: 'alert' }, error),
  h('div', { className: 'dwe-dialog-actions' },
    h('button', { type: 'button', autoFocus: true, onClick: close, disabled: working }, '取消'),
    h('button', {
      type: 'submit', 'data-dwe-action': 'delete', disabled: working,
    }, working ? '正在移入…' : '移入' + trashLabel))));
}

export function RenameDialog({ entry, close, rename }) {
  const root = useRef(null);
  const input = useRef(null);
  const [name, setName] = useState(entry.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const dialog = root.current;
    dialog.showModal();
    const dot = entry.type === 'file' ? entry.name.lastIndexOf('.') : -1;
    input.current.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
    return () => dialog.close();
  }, [entry]);

  return h('dialog', {
    ref: root, className: 'dwe-file-dialog', 'aria-label': '重命名',
    onKeyDown: event => event.stopPropagation(),
    onCancel: event => { event.preventDefault(); if (!saving) close(); },
  }, h('form', {
    onSubmit: async event => {
      event.preventDefault();
      if (saving || !name.trim()) return;
      setSaving(true);
      setError('');
      try { await rename(name); }
      catch (error) { setError(error.message); setSaving(false); }
    },
  },
  h('h2', null, '重命名'),
  h('label', null, '新名称', h('input', {
    ref: input, value: name, autoFocus: true, spellCheck: false, readOnly: saving,
    onChange: event => { setName(event.target.value); setError(''); },
  })),
  error && h('p', { role: 'alert' }, error),
  h('div', { className: 'dwe-dialog-actions' },
    h('button', { type: 'button', onClick: close, disabled: saving }, '取消'),
    h('button', { type: 'submit', disabled: saving || !name.trim() }, saving ? '正在重命名…' : '确定'))));
}
