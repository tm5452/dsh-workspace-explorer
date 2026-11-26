import assert from 'node:assert/strict';
import test from 'node:test';
import { shortcutDropTarget } from '../src/ui/preview-shortcut-drop.js';
import { createShortcutSpring, shortcutReleaseImpulse, shortcutReleaseVelocity } from '../src/ui/preview-shortcut-release.js';

function drop(x, y, panes = [], shelf = { left: 600, right: 628, top: 100, bottom: 300 }, fullscreen = false) {
  return shortcutDropTarget({ x, y, width: 1200, height: 800, shelf, panes, fullscreen });
}

test('a shortcut drop distinguishes reorder from the two opening directions', () => {
  assert.deepEqual(drop(614, 210), { mode: 'reorder' });
  assert.deepEqual(drop(450, 530), { mode: 'window', x: 450, y: 530 });
  assert.deepEqual(drop(704, 530), { mode: 'sidebar', x: 704, y: 530 });
  assert.equal(drop(620, 500), undefined);
  assert.equal(drop(1200, 250), undefined);
});

test('split panes receive the shortcut in the exact pane under the release point', () => {
  const panes = [
    { id: 'left', rect: { left: 250, right: 550, top: 0, bottom: 800 } },
    { id: 'right', rect: { left: 660, right: 1100, top: 0, bottom: 800 } },
  ];
  assert.equal(drop(540, 200, panes).paneId, 'left');
  assert.equal(drop(680, 200, panes).paneId, 'right');
  assert.equal(drop(100, 200, panes).mode, 'window');
  assert.equal(drop(614, 210, panes).mode, 'reorder');
});

test('the fullscreen rail keeps reorder separate from either split pane', () => {
  const shelf = { left: 12, right: 40, top: 100, bottom: 300 };
  const panes = [
    { id: 'left', rect: { left: 52, right: 600, top: 0, bottom: 800 } },
    { id: 'right', rect: { left: 600, right: 1200, top: 0, bottom: 800 } },
  ];
  assert.equal(drop(8, 180, panes, shelf, true).mode, 'window');
  assert.equal(drop(28, 180, panes, shelf, true).mode, 'reorder');
  assert.equal(drop(55, 180, panes, shelf, true).paneId, 'left');
  assert.equal(drop(900, 180, panes, shelf, true).paneId, 'right');
});

test('the padded reorder zone does not cover either visible split pane', () => {
  const panes = [
    { id: 'left', rect: { left: 300, right: 600, top: 0, bottom: 800 } },
    { id: 'right', rect: { left: 628, right: 1200, top: 0, bottom: 800 } },
  ];
  assert.equal(drop(596, 190, panes).paneId, 'left');
  assert.equal(drop(630, 190, panes).paneId, 'right');
  assert.equal(drop(614, 190, panes).mode, 'reorder');
});

test('release velocity uses recent pointer movement and stops after a pause', () => {
  const samples = [{ x: 500, y: 200, time: 0 }, { x: 460, y: 210, time: 100 }, { x: 440, y: 216, time: 120 }];
  assert.deepEqual(shortcutReleaseVelocity(samples, 126), { x: -1, y: 0.3 });
  assert.deepEqual(shortcutReleaseVelocity(samples, 220), { x: 0, y: 0 });
  assert.deepEqual(shortcutReleaseVelocity([], 120), { x: 0, y: 0 });
});

test('a modest mouse release gets more carry while an unusually fast gesture stays bounded', () => {
  const impulse = shortcutReleaseImpulse({ x: -.5, y: .25 });
  assert.deepEqual(impulse, { x: -1.2, y: .6 });
  assert.ok(Math.hypot(...Object.values(shortcutReleaseImpulse({ x: 4, y: -3 }))) <= 4.8);
  assert.deepEqual(shortcutReleaseImpulse({ x: 0, y: 0 }), { x: 0, y: 0 });
});

test('the spring keeps the release velocity as the preview grows and settles on its exact bounds', () => {
  const source = { left: 420, top: 190, width: 56, height: 56 };
  const target = { left: 430, top: 170, width: 280, height: 170 };
  const center = frame => frame.left + frame.width / 2;
  const flight = createShortcutSpring(source, target, { x: -2, y: .2 });
  const { frames, duration } = flight.keyframes();
  const early = flight.sample(.01).rect;
  assert.ok(Math.abs((center(early) - center(source)) / .01 - (-2)) < .01);
  assert.deepEqual(frames[0], source);
  assert.ok(center(frames[1]) < center(source));
  assert.ok(frames[1].width > source.width && frames[1].height > source.height);
  assert.deepEqual(frames.at(-1), target);
  assert.ok(Math.abs(center(frames.at(-2)) - center(target)) < .5);
  assert.ok(target.width - frames.at(-2).width < .5);
  assert.ok(duration > 200 && duration < 900);
});

test('a stationary shortcut expands toward the dock without overshooting its dimensions', () => {
  const source = { left: 400, top: 85, width: 56, height: 56 };
  const target = { left: 700, top: 75, width: 460, height: 700 };
  const { frames } = createShortcutSpring(source, target, { x: 0, y: 0 }).keyframes();
  const moving = frames[Math.floor(frames.length / 3)];
  assert.ok(moving.width > source.width && moving.width < target.width);
  assert.ok(moving.left > source.left && moving.left < target.left);
  assert.ok(frames.every(({ width, height }) => width <= target.width && height <= target.height));
});

test('Motion keeps position and velocity when the host commits different bounds', () => {
  const source = { left: 400, top: 190, width: 56, height: 56 };
  const predicted = { left: 620, top: 40, width: 580, height: 760 };
  const actual = { left: 700, top: 56, width: 500, height: 744 };
  const flight = createShortcutSpring(source, predicted, { x: 1.4, y: -.3 });
  const before = flight.sample(40).rect;
  const earlier = flight.sample(39.99).rect;
  flight.retarget(actual, 40);
  assert.deepEqual(flight.sample(0).rect, before);
  const next = flight.sample(.01).rect;
  for (const field of ['left', 'top', 'width', 'height']) {
    assert.ok(Math.abs((before[field] - earlier[field]) / .01 - (next[field] - before[field]) / .01) < .01);
  }
  assert.deepEqual(flight.keyframes().frames.at(-1), actual);
});
