const imageExtensions = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'], ['gif', 'image/gif'], ['bmp', 'image/bmp'],
  ['ico', 'image/x-icon'], ['avif', 'image/avif'], ['apng', 'image/apng'],
  ['jfif', 'image/jpeg'], ['heic', 'image/heic'], ['heif', 'image/heif'],
  ['tif', 'image/tiff'], ['tiff', 'image/tiff'],
]);

const videoExtensions = new Map([
  ['mp4', 'video/mp4'], ['m4v', 'video/mp4'], ['webm', 'video/webm'],
  ['mov', 'video/quicktime'], ['mkv', 'video/x-matroska'], ['ogv', 'video/ogg'],
  ['avi', 'video/x-msvideo'], ['wmv', 'video/x-ms-wmv'], ['mpeg', 'video/mpeg'],
  ['mpg', 'video/mpeg'], ['3gp', 'video/3gpp'],
]);

export function thumbnailType(path) {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase();
  return imageExtensions.get(extension) ?? videoExtensions.get(extension);
}
