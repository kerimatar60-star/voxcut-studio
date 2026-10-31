use std::{fs, path::Path, process::Command, time::{SystemTime, UNIX_EPOCH}};

// path, gain, pan, timeline start, source in, length, fade in, fade out.
type Track = (String, f64, f64, f64, f64, f64, f64, f64);

pub(crate) fn probe(path: &str) -> Result<(f64, bool, bool), String> {
    let result = Command::new("ffprobe").args(["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "default=noprint_wrappers=1", path])
        .output().map_err(|e| format!("FFprobe başlatılamadı: {e}"))?;
    if !result.status.success() { return Err("Medya bilgisi okunamadı.".into()); }
    let text = String::from_utf8_lossy(&result.stdout);
    let duration = text.lines().find_map(|line| line.strip_prefix("duration=").and_then(|v| v.parse::<f64>().ok()))
        .filter(|v| v.is_finite() && *v > 0.0).ok_or("Medya süresi okunamadı.")?;
    Ok((duration, text.lines().any(|line| line == "codec_type=audio"), text.lines().any(|line| line == "codec_type=video")))
}

fn render(video: String, output: String, original_gain: f64, tracks: Vec<Track>) -> Result<String, String> {
    if !Path::new(&video).is_file() { return Err("Kaynak video bulunamadı.".into()); }
    if tracks.len() > 8 || !original_gain.is_finite() || !(0.0..=2.0).contains(&original_gain) { return Err("Geçersiz kanal sayısı veya ses seviyesi.".into()); }
    let target = Path::new(&output);
    if target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("mp4")) { return Err("Yeni bir MP4 dosya adı seçin; mevcut dosyalar korunur.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (duration, has_audio, has_video) = probe(&video)?;
    if !has_video { return Err("Seçilen kaynak video içermiyor.".into()); }
    for (path, gain, pan, start, source_in, length, fade_in, fade_out) in &tracks {
        if !Path::new(path).is_file() || [gain, pan, start, source_in, length, fade_in, fade_out].iter().any(|n| !n.is_finite())
            || !(0.0..=2.0).contains(gain) || !(-1.0..=1.0).contains(pan) || *start < 0.0 || *start >= duration
            || *source_in < 0.0 || *length <= 0.0 || *fade_in < 0.0 || *fade_out < 0.0 || fade_in + fade_out > *length {
            return Err("Kanal yolu, seviye, pan veya zaman aralığı geçersiz.".into());
        }
        let (source_duration, audio, _) = probe(path)?;
        if !audio || source_in + length > source_duration + 0.05 { return Err("Ses kanalı kaynak süresini aşıyor veya ses içermiyor.".into()); }
    }
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-nostdin", "-n", "-i", &video, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]);
    for track in &tracks { cmd.arg("-i").arg(&track.0); }
    let mut filters = vec![format!("[1:a]atrim=duration={duration},asetpts=PTS-STARTPTS[base]")];
    let mut labels = String::from("[base]");
    let mut count = 1;
    if has_audio && original_gain > 0.0 {
        filters.push(format!("[0:a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume={original_gain}[original]"));
        labels.push_str("[original]"); count += 1;
    }
    for (i, (_, gain, pan, start, source_in, length, fade_in, fade_out)) in tracks.iter().enumerate() {
        let left = if *pan > 0.0 { 1.0 - pan } else { 1.0 };
        let right = if *pan < 0.0 { 1.0 + pan } else { 1.0 };
        let delay = (start * 48000.0).round() as u64;
        filters.push(format!("[{}:a:0]atrim=start={source_in}:duration={length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume={gain},pan=stereo|c0={left}*c0|c1={right}*c1,afade=t=in:d={fade_in},afade=t=out:st={}:d={fade_out},adelay={delay}S:all=1[t{i}]", i+2, length-fade_out));
        labels.push_str(&format!("[t{i}]")); count += 1;
    }
    filters.push(format!("{labels}amix=inputs={count}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]"));
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-mix-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join("mix.mp4");
    let result = (|| {
        let result = cmd.args(["-filter_complex", &filters.join(";"), "-map", "0:v:0", "-map", "[mix]", "-t", &duration.to_string(), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]).arg(&temp).output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !result.status.success() { return Err(format!("Ses miks hatası: {}", String::from_utf8_lossy(&result.stderr).chars().rev().take(1800).collect::<String>().chars().rev().collect::<String>())); }
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if !audio || !video || (actual-duration).abs() > 0.25 { return Err("Çıktının ses veya süre doğrulaması başarısız.".into()); }
        // Atomic no-clobber publication on the same filesystem.
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        Ok(format!("Ses miksli MP4 kaydedildi: {output}"))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

#[tauri::command]
pub async fn mix_video_audio(input_path: String, output_path: String, original_gain: f64, tracks: Vec<Track>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || render(input_path, output_path, original_gain, tracks)).await.map_err(|e| e.to_string())?
}

/// Metadata only; no media bytes cross IPC.
#[tauri::command]
pub async fn inspect_mix_media(path: String) -> Result<(f64, bool, bool), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(&path).is_file() { return Err("Medya dosyası bulunamadı.".into()); }
        probe(&path)
    }).await.map_err(|e| e.to_string())?
}
