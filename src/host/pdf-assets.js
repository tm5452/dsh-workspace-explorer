import { readFile } from 'node:fs/promises';
import { pdfAssetsPath } from '../document-types.js';

const bundledAssets = new URL('../../assets/pdf-engine/', import.meta.url);
const assetName = /^(?:build\/pdf(?:\.worker)?\.min\.mjs|cmaps\/[\w.-]+\.bcmap|standard_fonts\/[\w.-]+\.(?:pfb|ttf)|wasm\/[\w.-]+\.(?:wasm|js))$/;

export function registerPdfAssets(ctx) {
  ctx.connection.fetch.register({
    path: pdfAssetsPath,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const file = new URL(request.url).searchParams.get('file');
      if (!file || !assetName.test(file)) return new Response(null, { status: 404 });
      try {
        const data = await readFile(new URL(file, bundledAssets));
        const contentType = file.endsWith('.wasm') ? 'application/wasm'
          : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
        return new Response(data, { headers: {
          'content-type': contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
        } });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  });
}
