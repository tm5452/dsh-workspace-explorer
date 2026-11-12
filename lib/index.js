import { isDesktopHost, registerDesktopFiles } from '../src/host/files.js';

export function apply(ctx) {
  if (!isDesktopHost()) {
    ctx.logger?.debug?.('workspace-explorer: not a desktop host, local disk routes are not registered');
    return;
  }
  // 只等真正必需的服务。cordis 4 里 ctx.inject 的对象形态是「服务名 → 配置」，
  // 每个键都算必需服务，{ required: false } 并不会把它降级成可选 ——
  // 而 desktop 0.2.2-rc.2 起没有插件提供 officeToPdf，写进 inject 会让回调永远不触发（404）。
  // officeToPdf 改成用时再取，见 src/host/files.js 的 officeConverter()。
  ctx.inject(['connection'], registerDesktopFiles);
}
