const h = react.createElement;

export function PreviewUnavailable({ standalone = false } = {}) {
  return h('p', { className: 'dwe-preview-hint dwe-preview-unavailable', role: 'status' },
    standalone ? '无法在此预览此文件，可返回文件管理器双击打开。'
      : '双击文件直接打开文件，或使用右上角的「在 DSH 文档预览中打开」预览此文档');
}
