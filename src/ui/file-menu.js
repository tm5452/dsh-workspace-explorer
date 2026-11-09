const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = react;

export function FileMenu({ menu, items, close, invoke }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const node = root.current;
    const bounds = node.getBoundingClientRect();
    node.style.left = Math.max(4, Math.min(menu.x, window.innerWidth - bounds.width - 4)) + 'px';
    node.style.top = Math.max(4, Math.min(menu.y, window.innerHeight - bounds.height - 4)) + 'px';
    node.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    function outside(event) {
      if (!root.current?.contains(event.target)) close();
    }
    document.addEventListener('pointerdown', outside, options);
    document.addEventListener('wheel', outside, options);
    window.addEventListener('resize', close, options);
    return () => controller.abort();
  }, [close]);

  return reactDom.createPortal(h('div', {
    ref: root, className: 'dwe-file-menu', role: 'menu', 'aria-label': '文件操作',
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
  }, ...items.map(item => h('button', {
    type: 'button', role: 'menuitem', key: item.id, disabled: item.disabled, 'data-dwe-action': item.id,
    onClick: () => invoke(item.id),
  }, item.icon, item.label))), document.body);
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
  h('h2', null, entries.length === 1 ? '移入回收站？' : '将这 ' + entries.length + ' 项移入回收站？'),
  entries.length === 1
    ? h('div', { className: 'dwe-delete-path', title: entries[0].absolute }, entries[0].absolute)
    : h('ul', { className: 'dwe-delete-path dwe-delete-paths' },
      ...entries.map(entry => h('li', { key: entry.absolute, title: entry.absolute }, entry.absolute))),
  error && h('p', { role: 'alert' }, error),
  h('div', { className: 'dwe-dialog-actions' },
    h('button', { type: 'button', autoFocus: true, onClick: close, disabled: working }, '取消'),
    h('button', {
      type: 'submit', 'data-dwe-action': 'delete', disabled: working,
    }, working ? '正在移入…' : '移入回收站'))));
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
