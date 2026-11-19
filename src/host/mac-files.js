import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('./mac-files.jxa.js', import.meta.url));

export async function macFileOperation(request) {
  const result = execute('/usr/bin/osascript', ['-l', 'JavaScript', helper], {
    maxBuffer: 8 * 1024 * 1024,
    ...(['transfer', 'recycle', 'rename'].includes(request.action) ? {} : { timeout: 15000 }),
  });
  result.child.stdin.on('error', () => {});
  result.child.stdin.end(JSON.stringify(request), 'utf8');
  try {
    const { stdout } = await result;
    return JSON.parse(stdout.trim());
  } catch (error) {
    const diagnostic = String(error?.stderr || error?.message || '').trim().slice(0, 600);
    const reason = error?.signal ?? error?.code;
    console.warn('[dsh-workspace-explorer] macOS ' + request.action, reason ?? '', diagnostic);
    throw Object.assign(new Error('macOS 文件操作失败' + (reason == null ? '' : '（' + reason + '）')), {
      code: 'DWE_MAC_OPERATION',
    });
  }
}
