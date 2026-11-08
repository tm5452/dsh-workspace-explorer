import { isDesktopHost, registerDesktopFiles } from '../src/host/files.js';

export function apply(ctx) {
  if (isDesktopHost()) ctx.inject(['connection'], registerDesktopFiles);
}
