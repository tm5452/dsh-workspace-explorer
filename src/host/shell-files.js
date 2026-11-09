import { execFile } from 'node:child_process';
import { win32 as path } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('./ExplorerShell.cs', import.meta.url));
const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Path $env:DSH_EXPLORER_SHELL
$request = ConvertFrom-Json ([Console]::In.ReadToEnd())
if ($request.action -in 'stage', 'clipboard') {
    Add-Type -AssemblyName System.Windows.Forms
}
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
    'recycle' {
        $results = @(foreach ($source in $request.sources) {
            try { [ExplorerShell]::Recycle($source) }
            catch { $false }
        })
        @{ results = $results } | ConvertTo-Json -Compress
    }
}
`;
const encoded = Buffer.from(script, 'utf16le').toString('base64');

export async function windowsFileOperation(request) {
  const powershell = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = execute(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
    windowsHide: true, maxBuffer: 256 * 1024,
    ...(['transfer', 'recycle'].includes(request.action) ? {} : { timeout: 15000 }),
    env: { ...process.env, DSH_EXPLORER_SHELL: helper },
  });
  result.child.stdin.on('error', () => {}); // The process result reports early exit or spawn failure.
  result.child.stdin.end(JSON.stringify(request), 'utf8');
  const { stdout } = await result;
  return JSON.parse(stdout.trim());
}
