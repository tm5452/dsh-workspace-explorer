import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { macFileOperation } from '../src/host/mac-files.js';

test('macOS JXA copies into a temporary directory and handles a missing rename source', {
  skip: process.platform !== 'darwin',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dwe-macos-test-'));
  try {
    const name = '报告 #%.txt';
    const source = join(root, name);
    const destination = join(root, 'target');
    await mkdir(destination);
    await writeFile(source, 'original');
    await writeFile(join(destination, name), 'existing');
    assert.deepEqual(await macFileOperation({ action: 'transfer', sources: [source], destination, cut: false }),
      { results: [true] });
    assert.equal(await readFile(source, 'utf8'), 'original');
    assert.equal(await readFile(join(destination, name), 'utf8'), 'existing');
    assert.equal(await readFile(join(destination, '报告 #% (2).txt'), 'utf8'), 'original');

    assert.deepEqual(await macFileOperation({
      action: 'rename', source: join(root, 'missing.txt'), destination: join(root, 'new.txt'),
    }), { result: 'missing' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
