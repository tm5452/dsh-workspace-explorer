import { isDesktopHost, registerDesktopFiles } from '../src/host/files.js';

export function apply(ctx) {
  if (!isDesktopHost()) {
    ctx.logger?.debug?.('workspace-explorer: not a desktop host, local disk routes are not registered');
    return;
  }
  let officeKit;
  let officeToPdf;
  // Track each provider independently so file routes also work without Office conversion.
  ctx.inject(['officeKit'], scope => {
    officeKit = scope.officeKit;
    return () => { officeKit = undefined; };
  });
  ctx.inject(['officeToPdf'], scope => {
    officeToPdf = scope.officeToPdf;
    return () => { officeToPdf = undefined; };
  });
  ctx.inject(['connection'], scope => registerDesktopFiles(scope, () => officeKit ?? officeToPdf));
}
