const encodings = ['iso-8859-1', 'utf-16', 'utf-16be', 'utf-8'];
const latin = new TextDecoder('iso-8859-1');
const utf8 = new TextDecoder();
const artworkTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const metadataLimit = 12 * 1024 ** 2;

function syncSafe(bytes, at) {
  return (bytes[at] << 21) | (bytes[at + 1] << 14) | (bytes[at + 2] << 7) | bytes[at + 3];
}

function picture(frame) {
  const mimeEnd = frame.indexOf(0, 1);
  if (mimeEnd < 0) return;
  const mime = latin.decode(frame.subarray(1, mimeEnd)).toLowerCase();
  if (!artworkTypes.includes(mime)) return;
  const step = frame[0] === 1 || frame[0] === 2 ? 2 : 1;
  for (let i = mimeEnd + 2; i + step < frame.length; i += step) {
    if (frame[i] === 0 && (step === 1 || frame[i + 1] === 0)) {
      return { blob: new Blob([frame.subarray(i + step)], { type: mime }), front: frame[mimeEnd + 1] === 3 };
    }
  }
}

function id3Tags(bytes) {
  const tags = {};
  if (bytes.length < 10 || latin.decode(bytes.subarray(0, 3)) !== 'ID3') return tags;
  const version = bytes[3];
  if (![3, 4].includes(version) || (bytes[5] & 0x80)) return tags;
  const end = Math.min(bytes.length, syncSafe(bytes, 6) + 10);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 10;
  if ((bytes[5] & 0x40) && end >= 14) at += version === 4 ? syncSafe(bytes, at) : 4 + view.getUint32(at);
  let front = false;
  while (at + 10 <= end) {
    const id = latin.decode(bytes.subarray(at, at + 4));
    const size = version === 4 ? syncSafe(bytes, at + 4) : view.getUint32(at + 4);
    if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0 || at + 10 + size > end) break;
    const flags = bytes[at + 9];
    const frame = bytes.subarray(at + 10, at + 10 + size);
    at += 10 + size;
    if (flags || !encodings[frame[0]]) continue;
    if ((id === 'TIT2' || id === 'TPE1') && frame.length < 16384) {
      tags[id === 'TIT2' ? 'title' : 'artist'] = new TextDecoder(encodings[frame[0]])
        .decode(frame.subarray(1)).split('\0')[0].trim();
    } else if (id === 'APIC' && !front && frame.length < metadataLimit) {
      const cover = picture(frame);
      if (cover && (!tags.cover || cover.front)) {
        tags.cover = cover.blob;
        front = cover.front;
      }
    }
  }
  return tags;
}

async function prefix(url, length, signal) {
  const response = await fetch(url, { signal, headers: { Range: 'bytes=0-' + (length - 1) } });
  if (response.status !== 206) {
    await response.body?.cancel();
    return new Uint8Array();
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function readId3Tags(source, signal) {
  if (source.bytes) return id3Tags(source.bytes);
  const header = await prefix(source.url, 10, signal);
  if (header.length < 10 || latin.decode(header.subarray(0, 3)) !== 'ID3') return {};
  const length = syncSafe(header, 6) + 10;
  if (length <= 10 || length > metadataLimit) return {};
  return id3Tags(await prefix(source.url, length, signal));
}

function flacBlock(bytes, start) {
  if (start + 4 > bytes.length) return;
  const end = start + 4 + (bytes[start + 1] << 16 | bytes[start + 2] << 8 | bytes[start + 3]);
  return { end, kind: bytes[start] & 127, last: Boolean(bytes[start] & 128) };
}

function flacComments(bytes, tags) {
  if (bytes.length < 8) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 4 + view.getUint32(0, true);
  if (offset + 4 > bytes.length) return;
  const count = Math.min(view.getUint32(offset, true), 2048);
  offset += 4;
  for (let index = 0; index < count && offset + 4 <= bytes.length; index++) {
    const length = view.getUint32(offset, true);
    offset += 4;
    if (offset + length > bytes.length) return;
    if (length < 16384) {
      const field = utf8.decode(bytes.subarray(offset, offset + length));
      const equals = field.indexOf('=');
      const name = field.slice(0, equals).toLowerCase();
      if (equals > 0 && (name === 'title' || name === 'artist') && !tags[name]) tags[name] = field.slice(equals + 1).trim();
    }
    offset += length;
  }
}

function flacCover(bytes) {
  if (bytes.length < 32) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mimeLength = view.getUint32(4);
  const mimeEnd = 8 + mimeLength;
  if (mimeLength > 32 || mimeEnd + 24 > bytes.length) return;
  const type = latin.decode(bytes.subarray(8, mimeEnd)).toLowerCase();
  if (!artworkTypes.includes(type)) return;
  const image = mimeEnd + 24 + view.getUint32(mimeEnd);
  if (image > bytes.length) return;
  const size = view.getUint32(image - 4);
  if (!size || image + size > bytes.length) return;
  return { blob: new Blob([bytes.subarray(image, image + size)], { type }), front: view.getUint32(0) === 3 };
}

async function readFlacTags(source, signal) {
  const tags = {};
  let bytes = source.bytes ?? await prefix(source.url, 64 * 1024, signal);
  if (latin.decode(bytes.subarray(0, 4)) !== 'fLaC') return tags;
  let front = false;
  let at = 4;
  for (let index = 0; index < 128 && at < metadataLimit; index++) {
    let block = flacBlock(bytes, at);
    if (!block || block.end > bytes.length) {
      const needed = block?.end ?? at + 4;
      if (source.bytes || needed > metadataLimit) break;
      const length = Math.min(metadataLimit, Math.max(bytes.length * 2, needed));
      bytes = await prefix(source.url, length, signal);
      block = flacBlock(bytes, at);
      if (!block || block.end > bytes.length) break;
    }
    if (block.kind === 4) flacComments(bytes.subarray(at + 4, block.end), tags);
    if (block.kind === 6 && !front) {
      const cover = flacCover(bytes.subarray(at + 4, block.end));
      if (cover && (!tags.cover || cover.front)) {
        tags.cover = cover.blob;
        front = cover.front;
      }
    }
    if (block.last || (front && tags.title && tags.artist)) break;
    at = block.end;
  }
  return tags;
}

export async function readAudioTags(source, mime, signal) {
  if (mime === 'audio/mpeg') return readId3Tags(source, signal);
  if (mime === 'audio/flac') return readFlacTags(source, signal);
  return {};
}
