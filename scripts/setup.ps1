# Installs NPM project dependencies; then checks code. No automatic external runtimes/models.
[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
Write-Host '[VoxCut] Kurulum kontrolü' -ForegroundColor Cyan
$nodeCmd = Get-Command 'node.exe' -ErrorAction SilentlyContinue
$npmCmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $nodeCmd -or -not $npmCmd) {
  throw 'Node.js ve npm bulunamadı. Önce https://nodejs.org adresinden LTS sürümünü kur.'
}
$nodeVersionText = (& node.exe -p 'process.versions.node').Trim()
$nodeVersion = [version]($nodeVersionText -replace '-.*$','')
if ($nodeVersion -lt [version]'20.19.0') { throw "Node.js sürümü yetersiz: $nodeVersionText. Gereken: 20.19.0 veya üstü." }
Write-Host ('[VoxCut] Node: ' + $nodeVersionText)
Write-Host '[VoxCut] NPM bağımlılıkları kuruluyor; ağ gerekli olabilir...'
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install başarısız oldu.' }
Write-Host '[VoxCut] TypeScript doğrulaması'
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'TypeScript kontrolü başarısız.' }
Write-Host '[VoxCut] Birim testleri'
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Birim testleri başarısız.' }
if (-not $SkipBuild) {
  Write-Host '[VoxCut] Web build'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Web build başarısız.' }
}
Write-Host '[VoxCut] Setup başarılı. Web arayüzü için: .\scripts\run-web.ps1' -ForegroundColor Green
Write-Host 'Not: Tauri .exe, FFmpeg ve AI model motorları henüz tamamlanmış değildir.'
