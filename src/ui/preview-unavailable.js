const h = react.createElement;

export function PreviewUnavailable({ standalone = false } = {}) {
  return h('p', { className: 'dwe-preview-hint dwe-preview-unavailable', role: 'status' },
    standalone ? '无法在此预览此文件，可返回文件管理器双击打开。'
      : '无法预览此文件，可在文件浏览中双击直接打开');
}
