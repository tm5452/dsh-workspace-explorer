import { FileMenu, RenameDialog } from './file-menu.js';
import { icon } from './interface-icon.js';
import { disks } from './workspace.js';
import { fileManagerLabel } from './platform.js';

const h = react.createElement;

export function usePreviewFileMenu(sessionId, { openNative, openLocal, send, renamed }) {
  const [menu, setMenu] = react.useState();
  const [renaming, setRenaming] = react.useState();
  const [error, setError] = react.useState('');
  const close = react.useCallback(() => setMenu(undefined), []);
  react.useEffect(() => {
    close();
    setRenaming(undefined);
    setError('');
  }, [sessionId, close]);

  async function reveal({ file, root }) {
    setError('');
    try {
      const target = await disks.locate(file.absolute, undefined, root);
      await openLocal(target.path, 'reveal');
    } catch (error) { setError(error?.message || String(error)); }
  }

  function show(event, item) {
    if (!sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ item, x: event.clientX, y: event.clientY });
  }

  async function invoke(id) {
    const item = menu.item;
    const { file, root } = item;
    setError('');
    close();
    try {
      if (id === 'reveal') await reveal(item);
      else if (id === 'native') await openNative(file, root);
      else if (id === 'path') await navigator.clipboard.writeText(file.absolute);
      else if (id === 'rename') setRenaming(item);
      else await send([{ path: file.absolute, name: file.name }], id === 'composer-path' ? 'text' : 'attachment', root);
    } catch (error) { setError(error?.message || String(error)); }
  }

  return { show, render: h(react.Fragment, null,
    menu && h(FileMenu, { menu, close, invoke, groups: [
      { label: '对话框操作', items: [
        { id: 'composer-path', label: '引用路径文本到对话框', icon: icon('path') },
        { id: 'composer-attach', label: '复制文件到对话框', icon: icon('copy') },
      ] },
      { label: '文件管理', items: [
        { id: 'native', label: '在 DSH 文档预览中打开', icon: icon('preview-native') },
        { id: 'reveal', label: '在' + fileManagerLabel + '中显示', icon: icon('reveal') },
        { id: 'path', label: '复制文件路径', icon: icon('path') },
        { id: 'rename', label: '重命名', icon: icon('edit') },
      ] },
    ] }),
    renaming && h(RenameDialog, {
      entry: { ...renaming.file, type: 'file' }, close: () => setRenaming(undefined),
      async rename(name) {
        const { file, root } = renaming;
        const result = await disks.rename(file.absolute, name, root);
        renamed(file.absolute, result.path);
        setRenaming(undefined);
      },
    }),
    error && h('p', { className: 'dwe-preview-action-error dwe-error', role: 'alert' }, error)),
  };
}
