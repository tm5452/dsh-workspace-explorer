import { isDesktopHost, registerDesktopFiles } from '../src/host/files.js';

export function apply(ctx) {
  if (!isDesktopHost()) {
    ctx.logger?.debug?.('workspace-explorer: not a desktop host, local disk routes are not registered');
    return;
  }
  ctx.inject({ connection: true, officeToPdf: { required: false } }, registerDesktopFiles);
}
