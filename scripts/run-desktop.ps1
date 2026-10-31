$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo bulunamadı. Önce docs\WINDOWS_SETUP.md dosyasını oku.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) { throw 'Önce scripts\setup.ps1 çalıştır.' }
Write-Host 'VoxCut Studio Tauri penceresi başlatılıyor...' -ForegroundColor Cyan
& npm.cmd run desktop:dev
if ($LASTEXITCODE -ne 0) { throw 'Tauri dev başlatılamadı; C++ Build Tools ve WebView2 denetle.' }
