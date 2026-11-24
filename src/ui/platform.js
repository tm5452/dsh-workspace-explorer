const platform = globalThis.navigator?.platform ?? '';
export const isMac = platform.startsWith('Mac');
export const isLinux = platform.startsWith('Linux');
export const supportedPlatform = isMac || isLinux || platform.startsWith('Win');
export const localHomeLabel = isMac ? 'Mac 上的位置' : isLinux ? 'Linux 上的位置' : '此电脑';
export const fileManagerLabel = isMac ? '访达' : isLinux ? '文件管理器' : '资源管理器';
export const trashLabel = isMac ? '废纸篓' : '回收站';
export const pathPlaceholder = isMac ? '例如 /Users/你的用户名/项目'
  : isLinux ? '例如 /home/你的用户名/项目' : '例如 D:\\资料';

export function selectionModifier(event) {
  return isMac ? event.metaKey : event.ctrlKey;
}
