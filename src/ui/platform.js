export const isMac = navigator.platform.startsWith('Mac');
export const isLinux = navigator.platform.startsWith('Linux');
export const supportedPlatform = isMac || isLinux || navigator.platform.startsWith('Win');
export const localHomeLabel = isMac ? 'Mac 上的位置' : isLinux ? 'Linux 上的位置' : '此电脑';

export function selectionModifier(event) {
  return isMac ? event.metaKey : event.ctrlKey;
}
