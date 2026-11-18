import { spawn } from 'node:child_process';
import { win32 as path } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const helper = fileURLToPath(new URL('./ExplorerShell.cs', import.meta.url));
const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Path $env:DSH_EXPLORER_SHELL
Add-Type -AssemblyName System.Windows.Forms
function Invoke-ExplorerOperation($request) {
switch ($request.action) {
    'stage' {
        $paths = New-Object System.Collections.Specialized.StringCollection
        foreach ($source in $request.sources) { [void]$paths.Add($source) }
        $data = New-Object System.Windows.Forms.DataObject
        $data.SetFileDropList($paths)
        $effect = if ($request.cut) { 2 } else { 1 }
        $stream = New-Object System.IO.MemoryStream -ArgumentList (,[BitConverter]::GetBytes([int]$effect))
        $data.SetData('Preferred DropEffect', $false, $stream)
        [System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 8, 30)
        @{ ok = $true } | ConvertTo-Json -Compress
    }
    'clipboard' {
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            try {
                $sequence = [ExplorerShell]::GetClipboardSequenceNumber()
                $paths = @([System.Windows.Forms.Clipboard]::GetFileDropList())
                $cut = if ($paths.Count -gt 0) { [ExplorerShell]::ClipboardIsCut() } else { $false }
                if ($sequence -eq [ExplorerShell]::GetClipboardSequenceNumber()) {
                    @{ paths = $paths; cut = $cut; sequence = $sequence } | ConvertTo-Json -Compress
                    return
                }
            } catch {
                if ($attempt -eq 2) { throw }
            }
            Start-Sleep -Milliseconds 40
        }
        throw 'Clipboard changed'
    }
    'clearCut' {
        [ExplorerShell]::ClearClipboardIfUnchanged($request.sequence)
        @{ ok = $true } | ConvertTo-Json -Compress
    }
    'transfer' {
        $results = @(foreach ($source in $request.sources) {
            try { [ExplorerShell]::Transfer($source, $request.destination, $request.cut) }
            catch { $false }
        })
        @{ results = $results } | ConvertTo-Json -Compress
    }
    'rename' {
        @{ code = [ExplorerShell]::Rename($request.source, $request.destination) } | ConvertTo-Json -Compress
    }
    'openBatch' {
        @{ code = [ExplorerShell]::OpenBatch($request.source) } | ConvertTo-Json -Compress
    }
    'recycle' {
        $results = @(foreach ($source in $request.sources) {
            try { [ExplorerShell]::Recycle($source) }
            catch { $false }
        })
        @{ results = $results } | ConvertTo-Json -Compress
    }
}
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
        $response = Invoke-ExplorerOperation (ConvertFrom-Json $line)
        [Console]::WriteLine($response)
    } catch {
        [Console]::WriteLine('{"error":true}')
    }
}
`;
const encoded = Buffer.from(script, 'utf16le').toString('base64');
let worker;

function startWorker() {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, DSH_EXPLORER_SHELL: helper },
  });
  const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let pending;
  let idle;

  function stop(error) {
    if (worker === connection) worker = undefined;
    clearTimeout(idle);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = undefined;
    }
    output.close();
    child.kill();
  }

  const connection = {
    send(request) {
      clearTimeout(idle);
      if (pending) return Promise.reject(new Error('Windows 文件操作仍在进行'));
      const timeout = ['transfer', 'recycle', 'openBatch'].includes(request.action) ? 300_000 : 15_000;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          stop(Object.assign(new Error('Windows 文件操作超时，请检查已有结果后重试'), { code: 'ETIMEDOUT' }));
        }, timeout);
        pending = { resolve, reject, timer };
        child.stdin.write(JSON.stringify(request) + '\n', 'utf8');
      });
    },
  };

  output.on('line', line => {
    if (!pending) return;
    let response;
    try { response = JSON.parse(line); }
    catch (error) { stop(error); return; }
    const { resolve, reject, timer } = pending;
    pending = undefined;
    clearTimeout(timer);
    idle = setTimeout(() => stop(), 60_000);
    idle.unref();
    if (response?.error) reject(new Error('Windows 文件操作失败'));
    else resolve(response);
  });
  child.once('error', stop);
  child.once('close', () => stop(new Error('Windows 文件操作进程已退出')));
  child.stdin.on('error', stop);
  return connection;
}

export function windowsFileOperation(request) {
  worker ??= startWorker();
  return worker.send(request);
}
