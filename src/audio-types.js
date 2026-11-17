export const audioTypes = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/ogg',
};

export function audioType(path) {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase();
  return Object.hasOwn(audioTypes, extension) ? audioTypes[extension] : undefined;
}

export function isAudioFile(path) {
  return Boolean(audioType(path))
    || /\.(?:ac3|aif|aifc|aiff|alac|amr|ape|au|caf|dts|m4b|m4p|mid|midi|mka|mp2|spx|weba|wma|wv)$/i.test(path);
}
