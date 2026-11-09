const h = react.createElement;

export function PreviewUnavailable() {
  return h('p', { className: 'dwe-preview-hint dwe-preview-unavailable', role: 'status' },
    '双击文件直接打开文件，或使用右上角的「在 DSH 文档预览中打开」预览此文档');
}
