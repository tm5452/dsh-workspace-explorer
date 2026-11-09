import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pdfAssetsPath } from '../document-types.js';

const require = createRequire(import.meta.url);
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
        const root = dirname(require.resolve('pdfjs-dist/package.json'));
        const data = await readFile(join(root, file));
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
