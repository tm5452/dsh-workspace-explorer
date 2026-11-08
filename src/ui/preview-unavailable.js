const h = react.createElement;

export function PreviewUnavailable() {
  return h('div', { className: 'dwe-preview-unavailable', role: 'status' },
    h('p', null, '双击文件直接打开文件，或使用右上角的「在 DSH 文档预览中打开」预览此文档。'));
}
