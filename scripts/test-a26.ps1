$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$inputVideo = Join-Path $projectRoot 'test-output\VoxCut_Test.mp4'
$outputVideo = Join-Path $projectRoot 'test-output\VoxCut_A26_SesMix_Test.mp4'
if (!(Test-Path -LiteralPath $inputVideo -PathType Leaf)) { throw 'A25 test videosu bulunamadı.' }
if (Test-Path -LiteralPath $outputVideo) { throw 'A26 çıktısı zaten mevcut; üzerine yazılmadı.' }
function Find-MediaTool([string]$toolName) {
    $command = Get-Command $toolName -CommandType Application -ErrorAction Stop
    $entry = Get-Item -LiteralPath $command.Source
    if ($entry.Target) { return [string]$entry.Target }
    return $command.Source
}
$ffmpeg = Find-MediaTool 'ffmpeg.exe'
$ffprobe = Find-MediaTool 'ffprobe.exe'
& $ffprobe -v error -show_entries format=duration -of json $inputVideo | Out-String | Set-Variable inputInfoText
if ($LASTEXITCODE -ne 0) { throw 'Kaynak süre bilgisi alınamadı.' }
$duration = [double](ConvertFrom-Json $inputInfoText).format.duration
$durationText = $duration.ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
& $ffmpeg -hide_banner -nostdin -n -i $inputVideo -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=$durationText" -filter_complex '[0:a:0]aresample=48000,aformat=channel_layouts=stereo,volume=0.8[original];[1:a]aformat=channel_layouts=stereo,volume=0.8[tone];[original][tone]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]' -map 0:v:0 -map '[mix]' -t $durationText -c:v copy -c:a aac -b:a 192k -movflags +faststart $outputVideo
if ($LASTEXITCODE -ne 0) { throw 'A26 FFmpeg testi başarısız; oluşmuşsa kısmi çıktıyı inceleyin.' }
$infoText = & $ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name -of json $outputVideo | Out-String
if ($LASTEXITCODE -ne 0) { throw 'A26 çıktı bilgisi okunamadı.' }
$info = ConvertFrom-Json $infoText
if (!($info.streams | Where-Object codec_type -eq 'video') -or !($info.streams | Where-Object codec_type -eq 'audio') -or [Math]::Abs([double]$info.format.duration - $duration) -gt 0.25) { throw 'Ses/video/süre kontrolü başarısız.' }
& $ffmpeg -v error -nostdin -i $outputVideo -f null -
if ($LASTEXITCODE -ne 0) { throw 'Çıktı çözümleme kontrolü başarısız.' }
Write-Output "Teknik kontrol geçti: $outputVideo"
Write-Output 'Son kontrol: videoyu oynatıp orijinal sesi ve 660 Hz tonu birlikte dinleyin.'
