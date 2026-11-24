import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePreviewFile } from '../src/client/preview-collections.js';
import { savedBrowserState } from '../src/client/sidebar-layout-state.js';
import { joinPath, localPath, parentOf, pathName, resourceAddress, samePath, sessionFilePath, underPath } from '../src/ui/navigation.js';
import { trackKey } from '../src/ui/music-player.js';

test('native path operations preserve POSIX names and Windows drive semantics', () => {
  const root = '/home/Me/Work';
  const file = joinPath(root, '报告 #%.md');
  assert.equal(localPath('/home/Me//./Work/test/../'), root);
  assert.equal(localPath('/home/Me/\0test'), null);
  assert.equal(parentOf(file), root);
  assert.equal(parentOf('/home'), '/');
  assert.equal(parentOf('/'), null);
  assert.equal(pathName('/home/Me/a\\b'), 'a\\b');
  assert.equal(underPath(file, root), true);
  assert.equal(underPath(file, '/home/me/Work'), false);
  assert.equal(underPath(file, '/home/Me/Wor'), false);
  assert.equal(samePath(localPath('c:/Test/one.txt'), 'C:\\TEST\\ONE.TXT'), true);
  assert.equal(sessionFilePath(resourceAddress(file, 'session-1'), 'session-1'), file);
  assert.equal(resourceAddress(file), 'dsh-resource://file/absolute/home/Me/Work/%E6%8A%A5%E5%91%8A%20%23%25.md');
});

test('1.3 preview collections and saved views retain POSIX paths and distinct audio tracks', () => {
  const root = '/home/Me/Work';
  const file = { absolute: root + '/Track.flac', originFolder: root, originWorkspace: root };
  const preview = normalizePreviewFile(file, root);
  assert.equal(preview.root, root);
  assert.equal(preview.file.name, 'Track.flac');
  assert.equal(preview.file.originFolder, root);
  assert.equal(preview.file.originWorkspace, root);
  assert.equal(normalizePreviewFile({ absolute: root + '/../other.txt' }, root), undefined);
  assert.notEqual(trackKey(preview.file), trackKey({ absolute: root + '/track.flac' }));
  const state = savedBrowserState({ path: root, root, preview: { tabs: [{ id: 4, file }], active: 4 } });
  assert.equal(state.path, root);
  assert.equal(state.root, root);
  assert.equal(state.preview.active, 4);
  assert.equal(state.preview.tabs[0].file.absolute, file.absolute);
});
