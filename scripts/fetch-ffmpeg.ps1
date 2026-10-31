# VoxCut Studio — kurulum paketine girecek FFmpeg'i resmî BtbN derlemesinden indirir ve SHA-256 ile doğrular.
# Çıktı: src-tauri/resources/ffmpeg/ (git'e girmez) + src-tauri/resources/licenses/FFMPEG-LICENSE.txt (git'e girer).
# Kaynak: https://github.com/BtbN/FFmpeg-Builds (FFmpeg resmî sitesinin önerdiği Windows derlemelerinden biri).
# NOT: BtbN eski "autobuild" sürümlerini zamanla siler; adres açılmazsa docs/THIRD_PARTY_NOTICES.md'deki bilgiyle yeni bir
# sürüm seçip $Url/$Sha256 değerlerini birlikte güncelleyin. GPL derlemesidir (libx264 içerir) — bkz. docs/THIRD_PARTY_NOTICES.md.
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$Url    = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n9.0.2-39-g7adfbe40dc-win64-gpl-shared-9.0.zip'
$Sha256 = '1d9823c35c7a7e2f54d1438cf61030d6efabe3278de01c191309d1e828bb74df'
$Size   = 85920857

$root = Split-Path -Parent $PSScriptRoot
$res  = Join-Path $root 'src-tauri\resources'
$dest = Join-Path $res 'ffmpeg'
$lic  = Join-Path $res 'licenses'
if ((Test-Path (Join-Path $dest 'ffmpeg.exe')) -and -not $Force) { Write-Host "FFmpeg zaten hazır: $dest (yeniden indirmek için -Force)"; exit 0 }

$work = Join-Path ([IO.Path]::GetTempPath()) ("voxcut-ffmpeg-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $zip = Join-Path $work 'ffmpeg.zip'
  Write-Host "İndiriliyor ($([math]::Round($Size/1MB)) MB): $Url"
  & curl.exe --fail --location --silent --show-error --proto '=https' --tlsv1.2 -o $zip $Url
  if ($LASTEXITCODE -ne 0) { throw 'İndirme başarısız.' }
  if ((Get-Item $zip).Length -ne $Size) { throw 'Boyut beklenenle uyuşmuyor.' }
  $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
  if ($actual -ne $Sha256) { throw "SHA-256 uyuşmuyor (beklenen $Sha256, bulunan $actual)." }
  Write-Host 'SHA-256 doğrulandı.'
  $ex = Join-Path $work 'x'
  & tar.exe -xf $zip -C $work
  if ($LASTEXITCODE -ne 0) { throw 'Arşiv açılamadı.' }
  $bin = Get-ChildItem $work -Directory | ForEach-Object { Join-Path $_.FullName 'bin' } | Where-Object { Test-Path (Join-Path $_ 'ffmpeg.exe') } | Select-Object -First 1
  if (-not $bin) { throw 'Arşivde bin\ffmpeg.exe bulunamadı.' }
  $pkg = Split-Path -Parent $bin
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Path $dest, $lic -Force | Out-Null
  # ffplay gerekmez; yalnız ffmpeg, ffprobe ve DLL'ler paketlenir.
  Get-ChildItem $bin -File | Where-Object { $_.Name -ne 'ffplay.exe' } | Copy-Item -Destination $dest
  foreach ($name in 'LICENSE.txt') { if (Test-Path (Join-Path $pkg $name)) { Copy-Item (Join-Path $pkg $name) (Join-Path $lic 'FFMPEG-LICENSE.txt') -Force } }
  $v = & (Join-Path $dest 'ffmpeg.exe') -version | Select-Object -First 1
  Write-Host "Hazır: $v"
  Write-Host "Konum: $dest"
} finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
