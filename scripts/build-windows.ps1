$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Get-Command 'cargo.exe' -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo yok. docs\WINDOWS_SETUP.md adresindeki kurulumu tamamla.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) { throw 'Önce scripts\setup.ps1 çalıştır.' }
Write-Host '[VoxCut] TypeScript + test' -ForegroundColor Cyan
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck başarısız.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Testler başarısız.' }
Write-Host '[VoxCut] Tauri NSIS release build' -ForegroundColor Cyan
& npm.cmd run desktop:build
if ($LASTEXITCODE -ne 0) { throw 'Windows NSIS build başarısız.' }
Write-Host 'NSIS kurulum dosyası: src-tauri\target\release\bundle\nsis\' -ForegroundColor Green
Write-Host 'Not: Ticari dağıtım öncesinde lisans/kurulum/smoke test zorunlu.'
