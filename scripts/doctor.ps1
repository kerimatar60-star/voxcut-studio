# VoxCut Studio Windows development preflight (read-only). Windows PowerShell 5.1+.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
function Status($name, $ok, $message) {
  $tag = if ($ok) { '[OK] ' } else { '[!]  ' }
  $color = if ($ok) { 'Green' } else { 'Yellow' }
  Write-Host ($tag + $name + ' - ' + $message) -ForegroundColor $color
}
function VersionOf($commandName) {
  $found = Get-Command $commandName -ErrorAction SilentlyContinue
  if (-not $found) { return $null }
  try { return ((& $commandName --version 2>&1 | Select-Object -First 1) | Out-String).Trim() }
  catch { return 'bulundu; sürüm alınamadı' }
}
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host '   VoxCut Studio | Windows Ortam Kontrolü' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host ('İşletim sistemi: ' + [Environment]::OSVersion.VersionString)
Write-Host ('CPU: ' + [Environment]::ProcessorCount + ' mantıksal iş parçacığı')
try {
  $ram = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory
  if ($ram) { Write-Host ('RAM: ' + [math]::Round($ram / 1GB, 1) + ' GB') }
} catch { Write-Host 'RAM bilgisi okunamadı.' }
if (Get-Command 'Get-CimInstance' -ErrorAction SilentlyContinue) {
  try {
    Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object {
      Write-Host ('GPU: ' + $_.Name)
    }
  } catch { Write-Host 'GPU bilgisi okunamadı.' }
}
$node = VersionOf 'node.exe'
$npm  = VersionOf 'npm.cmd'
Status 'Node.js' ($null -ne $node) $(if ($node) { $node } else { 'Gerekli: Node 20.19+ / 22 LTS+' })
Status 'npm' ($null -ne $npm) $(if ($npm) { $npm } else { 'Node.js ile kurulur' })
$git = VersionOf 'git.exe'
Status 'Git (önerilen)' ($null -ne $git) $(if ($git) { $git } else { 'Sürüm takibi için önerilir' })
$rust = VersionOf 'rustc.exe'
Status 'Rust (Tauri için)' ($null -ne $rust) $(if ($rust) { $rust } else { 'https://rustup.rs / MSVC toolchain' })
$cargo = VersionOf 'cargo.exe'
Status 'Cargo (Tauri için)' ($null -ne $cargo) $(if ($cargo) { $cargo } else { 'Rustup ile kurulur' })
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
  $vs = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
  Status 'C++ Build Tools (Tauri)' ([bool]$vs) $(if ($vs) { $vs } else { 'Desktop development with C++ bileşeni gerekli' })
} else {
  Status 'C++ Build Tools (Tauri)' $false 'vswhere bulunamadı; Visual Studio Installer ile doğrula'
}
$webview = $false
$webviewPaths = @(
 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1D7C16A-0C46-4D7B-B3D0-4F802B837E89}',
 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1D7C16A-0C46-4D7B-B3D0-4F802B837E89}',
 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F1D7C16A-0C46-4D7B-B3D0-4F802B837E89}'
)
foreach ($p in $webviewPaths) { if (Test-Path -LiteralPath $p) { $webview=$true; break } }
Status 'Edge WebView2 (Tauri)' $webview $(if ($webview) { 'Kayıt defterinde tespit edildi' } else { 'Tespit edilemedi; Windows 11 üzerinde zaten bulunabilir. Microsoft installer ile doğrula.' })
$ffmpeg = VersionOf 'ffmpeg.exe'
Status 'FFmpeg (A3 ve sonrası)' ($null -ne $ffmpeg) $(if ($ffmpeg) { $ffmpeg } else { 'İlk UI setup için gerekli değil; sonra lisans denetimi ile kurulacak' })
if (Get-Command 'nvidia-smi.exe' -ErrorAction SilentlyContinue) {
  try {
    $info = & nvidia-smi.exe --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>$null
    Write-Host ('NVIDIA VRAM/sürücü: ' + ($info -join '; '))
  } catch { Write-Host 'NVIDIA VRAM sorgulanamadı.' }
}
Write-Host '---------------------------------------------'
Write-Host 'Bu script yükleme ve sistem ayarı yapmaz.' -ForegroundColor Cyan
Write-Host 'Sadece web UI için Node/npm gerekir; masaüstü için Rust + Build Tools + WebView2.'
