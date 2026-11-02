$ErrorActionPreference = "Stop"

$offlineDir = $PSScriptRoot
$root = Split-Path -Parent $offlineDir
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
$archive = Join-Path $offlineDir "runtimes\node-v24.22.2-$architecture.zip"
$runtimeRoot = Join-Path $offlineDir ".runtime\$architecture"
$runtimeDir = Join-Path $runtimeRoot "node-v24.22.2-$architecture"
$node = Join-Path $runtimeDir "node.exe"

if (-not (Test-Path $node)) {
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
}

$env:Path = "$runtimeDir;$env:Path"
& $node (Join-Path $root "scripts\offline.mjs") @args
exit $LASTEXITCODE
