$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) { throw 'node_modules bulunamadı. Önce scripts\setup.ps1 çalıştır.' }
Write-Host 'VoxCut Studio web: http://127.0.0.1:1420' -ForegroundColor Cyan
& npm.cmd run dev
if ($LASTEXITCODE -ne 0) { throw 'Vite başlatılamadı.' }
