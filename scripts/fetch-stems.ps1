# VoxCut Studio — kurulum paketine girecek yapay zekâ dosyalarını resmî kaynaklardan indirir ve boyut + SHA-256 ile doğrular.
# Çıktı: src-tauri/resources/stems/ (git'e girmez) + src-tauri/resources/licenses/ONNXRUNTIME-LICENSE.txt (git'e girer).
#   - ONNX Runtime 1.31.1 (Microsoft, MIT): onnxruntime.dll, onnxruntime_providers_shared.dll
#   - Demucs htdemucs modeli ONNX biçiminde (Meta, MIT): herkese açık bir indirme adresi yoktur; docs/AI_MODELS.md'deki adımlarla
#     (ml-work: resmî Meta ağırlıklarının ONNX'e çevrilmesi) üretilip `-ModelDir <klasör>` ile verilir; boyut + SHA-256 doğrulanır.
#   - RNNoise modelleri (GregorR/rnnoise-models, telif hakkı yok): sh.rnnn, mp.rnnn
param([switch]$Force, [string]$ModelDir)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'src-tauri\resources\stems'
$lic  = Join-Path $root 'src-tauri\resources\licenses'
$rnn  = 'https://raw.githubusercontent.com/GregorR/rnnoise-models/3eee541a283fd3b8f81b85b1748e3b9ccbefa04d/'
$files = @(
  @{ Name = 'htdemucs.onnx';      Url = $null; Size = 2458228;   Sha = '04680f424ba8232b408e6a7d83d9f12a7cc4a4249176c0ded5d974e5c8e36101' },
  @{ Name = 'htdemucs.onnx.data'; Url = $null; Size = 168293632; Sha = 'e8b687ed0a8506a8b2627b68fc5eb27ce401323f054b1465b5903ae8b7fcd5dc' },
  @{ Name = 'sh.rnnn'; Url = "$($rnn)somnolent-hogwash-2018-09-01/sh.rnnn";     Size = 297646; Sha = '70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0' },
  @{ Name = 'mp.rnnn'; Url = "$($rnn)marathon-prescription-2018-08-29/mp.rnnn"; Size = 296861; Sha = '4e84a448a4baf937992aaf4d10c8258007ec5d24219b6647dfd5fb4b563ad231' }
)
$ort = @{ Url = 'https://github.com/microsoft/onnxruntime/releases/download/v1.31.1/onnxruntime-win-x64-1.31.1.zip'; Size = 82929944; Sha = '5869e26bb25314375f2d5ef1877e3ea06b1543d6c710e6e4a1ec2f7177ab4b2c'; Dir = 'onnxruntime-win-x64-1.31.1' }
$dlls = @('onnxruntime.dll', 'onnxruntime_providers_shared.dll')

function Test-File($path, $size) { (Test-Path $path) -and ((Get-Item $path).Length -eq $size) }
function Get-Verified($url, $out, $size, $sha) {
  Write-Host "İndiriliyor ($([math]::Round($size/1MB,1)) MB): $url"
  & curl.exe --fail --location --silent --show-error --proto '=https' --tlsv1.2 -o $out $url
  if ($LASTEXITCODE -ne 0) { Remove-Item $out -Force -ErrorAction SilentlyContinue; throw "İndirme başarısız: $url" }
  if ((Get-Item $out).Length -ne $size) { Remove-Item $out -Force; throw "Boyut beklenenle uyuşmuyor: $url" }
  $actual = (Get-FileHash -Algorithm SHA256 $out).Hash.ToLower()
  if ($actual -ne $sha) { Remove-Item $out -Force; throw "SHA-256 uyuşmuyor ($url): beklenen $sha, bulunan $actual" }
}

New-Item -ItemType Directory -Path $dest, $lic -Force | Out-Null
$needFiles = $Force -or ($files | Where-Object { -not (Test-File (Join-Path $dest $_.Name) $_.Size) })
$needOrt = $Force -or ($dlls | Where-Object { -not (Test-Path (Join-Path $dest $_)) -or (Get-Item (Join-Path $dest $_)).Length -lt 10000 })
if (-not $needFiles -and -not $needOrt -and (Test-Path (Join-Path $lic 'ONNXRUNTIME-LICENSE.txt'))) { Write-Host "Yapay zekâ dosyaları zaten hazır: $dest"; exit 0 }

foreach ($f in $files) {
  $target = Join-Path $dest $f.Name
  if (-not $Force -and (Test-File $target $f.Size)) { continue }
  if (-not $f.Url) {
    if (-not $ModelDir) { throw "$($f.Name) yok. Model dosyaları önce üretilmeli (docs/AI_MODELS.md), sonra: fetch-stems.ps1 -ModelDir <klasör>" }
    $src = Join-Path $ModelDir $f.Name
    if (-not (Test-File $src $f.Size)) { throw "Boyut beklenenle uyuşmuyor veya dosya yok: $src" }
    if ((Get-FileHash -Algorithm SHA256 $src).Hash.ToLower() -ne $f.Sha) { throw "SHA-256 uyuşmuyor: $src" }
    Copy-Item $src $target -Force
    continue
  }
  $part = "$target.part"
  Get-Verified $f.Url $part $f.Size $f.Sha
  Move-Item $part $target -Force
}
if ($needOrt -or -not (Test-Path (Join-Path $lic 'ONNXRUNTIME-LICENSE.txt'))) {
  $work = Join-Path ([IO.Path]::GetTempPath()) ("voxcut-ort-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $zip = Join-Path $work 'ort.zip'
    Get-Verified $ort.Url $zip $ort.Size $ort.Sha
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      foreach ($d in $dlls) {
        $e = $z.GetEntry("$($ort.Dir)/lib/$d"); if (-not $e) { throw "Arşivde $d yok." }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $dest $d), $true)
      }
      $e = $z.GetEntry("$($ort.Dir)/LICENSE"); if (-not $e) { throw 'Arşivde LICENSE yok.' }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $lic 'ONNXRUNTIME-LICENSE.txt'), $true)
    } finally { $z.Dispose() }
  } finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host "Hazır: $dest"
Get-ChildItem $dest | ForEach-Object { Write-Host ("  {0}  {1:N0} bayt" -f $_.Name, $_.Length) }
