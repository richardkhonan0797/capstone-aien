$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$backup = Join-Path $root 'backup/before-voice-20261119-091416'
if (!(Test-Path -LiteralPath (Join-Path $backup 'workflow-hashes.json'))) { throw 'Pre-voice backup is missing.' }
$restore = @{
  'src/Chat.tsx' = 'frontend/src/Chat.tsx'
  'src/styles.css' = 'frontend/src/styles.css'
  'README.md' = 'frontend/README.md'
  'frontend-deployment.md' = 'guide/frontend-deployment.md'
  'deploy/Caddyfile.frontend' = 'deploy/Caddyfile.frontend'
  'workflows/AI Sales Agent · Realtime Token.json' = 'workflows/AI Sales Agent · Realtime Token.json'
}
foreach ($entry in $restore.GetEnumerator()) {
  Copy-Item -LiteralPath (Join-Path $backup $entry.Key) -Destination (Join-Path $root $entry.Value) -Force
}
# Delete only the three new source files, never directories or computed globs.
foreach ($name in @('voice.ts', 'voice.test.ts', 'VoicePanel.tsx')) {
  $target = [IO.Path]::GetFullPath((Join-Path $root ('frontend/src/' + $name)))
  if (!$target.StartsWith([IO.Path]::GetFullPath((Join-Path $root 'frontend/src/')), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected target path.' }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
}
Write-Output 'Restored pre-voice local source. Run npm.cmd run build in frontend to replace local build output. Server rollback is separate; see guide/voice-demo.md.'
