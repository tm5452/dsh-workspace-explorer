import { icon } from './interface-icon.js';

const h = react.createElement;

// Paths and view boxes come from the Explorer media layout SVGs.
const videoPlayPath = 'M132.676 78.0936C131.011 77.0345 128.833 78.2301 128.833 80.2028V85.7972C128.833 87.7699 131.011 88.9655 132.676 87.9064L137.071 85.1092C138.615 84.1268 138.615 81.8732 137.071 80.8908L132.676 78.0936Z';
const musicPlayPath = 'M187.611 106.113C185.613 104.842 183 106.276 183 108.644V115.357C183 117.724 185.613 119.159 187.611 117.888L192.885 114.531C194.738 113.352 194.738 110.648 192.885 109.469L187.611 106.113Z';
const fullscreenPath = 'M244.143 13.496C244.768 12.8709 245.616 12.5197 246.5 12.5197V10.853C245.174 10.853 243.902 11.3798 242.964 12.3175C242.027 13.2552 241.5 14.5269 241.5 15.853H243.167C243.167 14.969 243.518 14.1211 244.143 13.496Z'
  + 'M253.857 13.496C253.232 12.8709 252.384 12.5197 251.5 12.5197V10.853C252.826 10.853 254.098 11.3798 255.036 12.3175C255.973 13.2552 256.5 14.5269 256.5 15.853H254.833C254.833 14.969 254.482 14.1211 253.857 13.496Z'
  + 'M246.5 24.1864C245.616 24.1864 244.768 23.8352 244.143 23.21C243.518 22.5849 243.167 21.7371 243.167 20.853H241.5C241.5 22.1791 242.027 23.4509 242.964 24.3886C243.902 25.3262 245.174 25.853 246.5 25.853V24.1864Z'
  + 'M253.857 23.21C253.232 23.8352 252.384 24.1864 251.5 24.1864V25.853C252.826 25.853 254.098 25.3262 255.036 24.3886C255.973 23.4509 256.5 22.1791 256.5 20.853H254.833C254.833 21.7371 254.482 22.5849 253.857 23.21Z';

const filledArtwork = {
  play: ['126.531 75.5 14 15', videoPlayPath],
  videoPlay: ['119 69 28 28', videoPlayPath],
  musicPlay: ['172 96 31 31', musicPlayPath],
  fullscreen: ['240.5 9.853 17 17', fullscreenPath],
  thumbnailPlay: ['13 68.3 11.5 12', 'M17.8422 69.3949C16.1779 68.3358 14 69.5313 14 71.5041V77.0985C14 79.0712 16.1779 80.2667 17.8422 79.2076L22.2378 76.4104C23.7816 75.428 23.7815 73.1745 22.2378 72.1921L17.8422 69.3949Z'],
};

const outlines = {
  pause: ['19 136.5 14 14', 'M23 139.5V147.5M29 139.5V147.5', 3],
  capsulePause: ['51.5 44 48 48', 'M70.5 62.5V74.5M80.5 62.5V74.5', 5],
  musicPause: ['61 54 29 29', 'M70.5 62.5V74.5M80.5 62.5V74.5', 5],
  exitFullscreen: 'M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5',
};

export function mediaIcon(name, size) {
  if (name === 'replay') return icon('video-replay', size);
  const svg = { width: size, height: size, 'aria-hidden': true, fill: 'none' };
  if (name === 'info') {
    return h('svg', { ...svg, viewBox: '31 26 10 10' },
      h('path', { d: 'M36 33V31', stroke: 'currentColor', strokeLinecap: 'round' }),
      h('circle', { cx: 36, cy: 29.0832, r: 0.583333, fill: 'currentColor' }),
      h('circle', { cx: 36, cy: 31.0002, r: 4.41667, stroke: 'currentColor', strokeWidth: 0.5 }));
  }
  const filled = filledArtwork[name];
  if (filled) {
    const [viewBox, d] = filled;
    return h('svg', { ...svg, viewBox }, h('path', { d, fill: 'currentColor' }));
  }
  const shape = outlines[name];
  const [viewBox, d, strokeWidth] = Array.isArray(shape) ? shape : ['0 0 24 24', shape, 1.7];
  return h('svg', { ...svg, viewBox, stroke: 'currentColor', strokeWidth,
    strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d }));
}

export function mediaButton(name, label, onClick, className, disabled = false) {
  return h('button', { type: 'button', className, title: label, 'aria-label': label, disabled, onClick },
    mediaIcon(name, 20));
}

function timeLabel(value) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(hours ? 2 : 1, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? hours + ':' + minutes + ':' + rest : minutes + ':' + rest;
}

export function MediaProgress({ current, duration, seek }) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const position = Math.min(length, Number.isFinite(current) ? current : 0);
  return h('div', { className: 'dwe-media-progress' },
    h('span', { className: 'dwe-media-time' }, timeLabel(position)),
    h('input', {
      className: 'dwe-media-seek', type: 'range', min: 0, max: length, step: 'any',
      value: position, disabled: !length, 'aria-label': '播放进度',
      'aria-valuetext': timeLabel(position) + ' / ' + timeLabel(length),
      style: { '--dwe-media-progress': (length ? position / length * 100 : 0) + '%' },
      onChange: event => seek(Number(event.currentTarget.value)),
    }));
}
