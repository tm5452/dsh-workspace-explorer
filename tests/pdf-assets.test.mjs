import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { registerPdfAssets } from '../src/host/pdf-assets.js';

test('the PDF route serves the bundled runtime and supporting assets', async () => {
  let route;
  registerPdfAssets({ connection: { fetch: { register: handler => { route = handler; } } } });
  const request = file => {
    const url = new URL(route.path, 'https://example.test');
    url.searchParams.set('file', file);
    return route.fetch(new Request(url));
  };
  for (const [file, type] of [
    ['build/pdf.min.mjs', 'text/javascript'],
    ['build/pdf.worker.min.mjs', 'text/javascript'],
    ['cmaps/Adobe-GB1-UCS2.bcmap', 'application/octet-stream'],
    ['standard_fonts/FoxitSerif.pfb', 'application/octet-stream'],
    ['wasm/openjpeg.wasm', 'application/wasm'],
  ]) {
    const expected = await readFile(new URL('../assets/pdf-engine/' + file, import.meta.url));
    const response = await request(file);
    assert.equal(response.status, 200, file);
    assert.equal(response.headers.get('content-type'), type, file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, file);
  }
  assert.equal((await request('build/missing.mjs')).status, 404);
});
