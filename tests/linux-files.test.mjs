import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerDesktopFiles } from '../src/host/files.js';

test('Linux desktop routes preserve names and handle staged moves and workspace boundaries', {
  skip: process.platform !== 'linux',
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dwe-linux-test-'));
  const oldDataHome = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = join(root, 'xdg');
  t.after(async () => {
    if (oldDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = oldDataHome;
    await rm(root, { recursive: true, force: true });
  });
  const workspace = join(root, 'Work');
  const destination = join(workspace, 'target');
  await mkdir(destination, { recursive: true });
  const filename = 'A\\中文 #% .txt';
  const original = join(workspace, filename);
  await writeFile(original, 'preview\n');
  await writeFile(join(workspace, 'a\\中文 #% .txt'), 'separate file\n');
  await symlink(root, join(workspace, 'outside'));

  const routes = new Map();
  registerDesktopFiles({ connection: { fetch: { register: route => routes.set(route.path, route) } } });
  const endpoint = '/api/dsh.workspaceExplorer';
  async function request(operation, path, extra = {}) {
    const response = await routes.get(endpoint).fetch(new Request('http://localhost' + endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-workspace-explorer': '1' },
      body: JSON.stringify({ operation, path, workspace, ...extra }),
    }));
    return { status: response.status, value: await response.json() };
  }

  const listing = await request('list', workspace);
  assert.equal(listing.status, 200);
  assert.ok(listing.value.entries.some(item => item.name === filename));
  assert.ok(listing.value.entries.some(item => item.name === 'a\\中文 #% .txt'));
  assert.equal((await request('list', join(workspace, 'outside'))).status, 403);
  assert.equal((await request('text', original)).value.text, 'preview\n');
  assert.equal((await request('cut', original)).status, 200);
  assert.equal((await request('paste', destination)).value.completed, 1);
  const moved = join(destination, filename);
  assert.equal(await readFile(moved, 'utf8'), 'preview\n');
  await assert.rejects(readFile(original), { code: 'ENOENT' });
  assert.equal((await request('recycle', moved)).value.completed, 1);
  assert.equal(await readFile(join(process.env.XDG_DATA_HOME, 'Trash', 'files', filename), 'utf8'), 'preview\n');
});
