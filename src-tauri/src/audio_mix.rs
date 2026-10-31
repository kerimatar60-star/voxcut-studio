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

/// Çıktı biçimi: (uzantı, "yalnız ses" mi, FFmpeg ses kodlayıcı argümanları).
fn format_spec(format: &str) -> Result<(&'static str, bool, &'static [&'static str]), String> {
    Ok(match format {
        "mp4" => ("mp4", false, &["-c:a", "aac", "-b:a", "192k"]),
        "wav" => ("wav", true, &["-c:a", "pcm_s16le"]),
        "wav24" => ("wav", true, &["-c:a", "pcm_s24le"]),
        "mp3" => ("mp3", true, &["-c:a", "libmp3lame", "-b:a", "192k"]),
        "flac" => ("flac", true, &["-c:a", "flac"]),
        _ => return Err("Desteklenmeyen çıktı biçimi (mp4, wav, wav24, mp3, flac).".into()),
    })
}

/// Miks filtre grafiği. `ducking` (0..1) > 0 ise ek kanallar (müzik) orijinal ses (konuşma) varken otomatik kısılır
/// (`sidechaincompress`); ikinci dönüş değeri kısmanın gerçekten uygulanıp uygulanmadığıdır.
fn build_filters(duration: f64, has_audio: bool, original_gain: f64, tracks: &[Track], ducking: f64) -> (String, bool) {
    let duck = ducking > 0.0 && has_audio && original_gain > 0.0 && !tracks.is_empty();
    let mut filters = vec![format!("[1:a]atrim=duration={duration},asetpts=PTS-STARTPTS[base]")];
    let mut labels = String::from("[base]");
    let mut count = 1;
    if has_audio && original_gain > 0.0 {
        let split = if duck { ",asplit=2[original][orig_sc]" } else { "[original]" };
        filters.push(format!("[0:a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume={original_gain}{split}"));
        labels.push_str("[original]"); count += 1;
    }
    let mut music = String::new();
    for (i, (_, gain, pan, start, source_in, length, fade_in, fade_out)) in tracks.iter().enumerate() {
        let left = if *pan > 0.0 { 1.0 - pan } else { 1.0 };
        let right = if *pan < 0.0 { 1.0 + pan } else { 1.0 };
        let delay = (start * 48000.0).round() as u64;
        filters.push(format!("[{}:a:0]atrim=start={source_in}:duration={length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume={gain},pan=stereo|c0={left}*c0|c1={right}*c1,afade=t=in:d={fade_in},afade=t=out:st={}:d={fade_out},adelay={delay}S:all=1[t{i}]", i + 2, length - fade_out));
        if duck { music.push_str(&format!("[t{i}]")); } else { labels.push_str(&format!("[t{i}]")); count += 1; }
    }
    if duck {
        // Müzik yolları önce tek yolda toplanır, sonra konuşmanın (orig_sc) seviyesine göre sıkıştırılır.
        let ratio = 2.0 + 10.0 * ducking.clamp(0.0, 1.0);
        filters.push(format!("{music}amix=inputs={}:duration=longest:dropout_transition=0:normalize=0[music]", tracks.len()));
        filters.push(format!("[music][orig_sc]sidechaincompress=threshold=0.04:ratio={ratio:.1}:attack=20:release=400:makeup=1[ducked]"));
        labels.push_str("[ducked]"); count += 1;
    }
    filters.push(format!("{labels}amix=inputs={count}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]"));
    (filters.join(";"), duck)
}

fn render(video: String, output: String, original_gain: f64, tracks: Vec<Track>, format: &str, ducking: f64) -> Result<String, String> {
    let (ext, audio_only, codec_args) = format_spec(format)?;
    if !Path::new(&video).is_file() { return Err("Kaynak dosya bulunamadı.".into()); }
    if tracks.len() > 8 || !original_gain.is_finite() || !(0.0..=2.0).contains(&original_gain) { return Err("Geçersiz kanal sayısı veya ses seviyesi.".into()); }
    if !ducking.is_finite() || !(0.0..=1.0).contains(&ducking) { return Err("Otomatik kısma gücü 0 ile 1 arasında olmalı.".into()); }
    let target = Path::new(&output);
    if target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case(ext)) { return Err(format!("Yeni bir .{ext} dosya adı seçin; mevcut dosyalar korunur.")); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (duration, has_audio, has_video) = probe(&video)?;
    if !audio_only && !has_video { return Err("Seçilen kaynak video içermiyor.".into()); }
    if audio_only && !has_video && !has_audio { return Err("Seçilen kaynakta ne ses ne video var.".into()); }
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
    let (graph, ducked) = build_filters(duration, has_audio, original_gain, &tracks, ducking);
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-mix-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join(format!("mix.{ext}"));
    let result = (|| {
        cmd.args(["-filter_complex", &graph]);
        if audio_only { cmd.args(["-map", "[mix]", "-vn"]); } else { cmd.args(["-map", "0:v:0", "-map", "[mix]"]); }
        cmd.args(["-t", &duration.to_string()]);
        if !audio_only { cmd.args(["-c:v", "copy"]); }
        cmd.args(codec_args);
        if !audio_only { cmd.args(["-movflags", "+faststart"]); }
        let result = cmd.arg(&temp).output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !result.status.success() { return Err(format!("Ses miks hatası: {}", String::from_utf8_lossy(&result.stderr).chars().rev().take(1800).collect::<String>().chars().rev().collect::<String>())); }
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if !audio || (!audio_only && !video) || (audio_only && video) || (actual - duration).abs() > 0.25 { return Err("Çıktının ses, video veya süre doğrulaması başarısız.".into()); }
        // Atomic no-clobber publication on the same filesystem.
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        let what = if audio_only { format!("Ses dosyası ({})", ext.to_uppercase()) } else { "Ses miksli MP4".to_string() };
        let note = if ducking > 0.0 && !ducked { " (Otomatik kısma uygulanmadı: orijinal ses veya ek kanal yok.)" } else if ducked { " Müzik, konuşma varken otomatik kısıldı." } else { "" };
        Ok(format!("{what} kaydedildi: {output}.{note}"))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

/// `format`: mp4 (varsayılan), wav, wav24, mp3, flac. `ducking`: 0 = kapalı, 0..1 = müziği konuşma varken kısma gücü.
#[tauri::command]
pub async fn mix_video_audio(input_path: String, output_path: String, original_gain: f64, tracks: Vec<Track>, format: Option<String>, ducking: Option<f64>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || render(input_path, output_path, original_gain, tracks, format.as_deref().unwrap_or("mp4"), ducking.unwrap_or(0.0))).await.map_err(|e| e.to_string())?
}

/// Metadata only; no media bytes cross IPC.
#[tauri::command]
pub async fn inspect_mix_media(path: String) -> Result<(f64, bool, bool), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(&path).is_file() { return Err("Medya dosyası bulunamadı.".into()); }
        probe(&path)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ffmpeg_ok() -> bool { Command::new("ffmpeg").arg("-version").output().is_ok() }
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut miks {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    /// 3 sn test videosu: 440 Hz "konuşma" sesi (genlik ≈ 0,375). `audio=false` sessiz video üretir.
    fn video(path: &Path, audio: bool) {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=3"]);
        if audio { cmd.args(["-f", "lavfi", "-i", "sine=frequency=440:duration=3,volume=3"]); }
        cmd.args(["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
        if audio { cmd.args(["-c:a", "aac", "-shortest"]); }
        assert!(cmd.arg(path).output().unwrap().status.success(), "video fixture üretilemedi");
    }
    /// 3 sn 880 Hz "müzik" (genlik ≈ 0,375).
    fn music(path: &Path) {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3,volume=3"]).arg(path).output().unwrap();
        assert!(out.status.success(), "müzik fixture üretilemedi");
    }
    fn track(path: &Path) -> Track { (path.to_string_lossy().into(), 1.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0) }
    fn codec(path: &str) -> String {
        let out = Command::new("ffprobe").args(["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", path]).output().unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }
    fn mean_volume(path: &str) -> f64 {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-i", path, "-af", "volumedetect", "-f", "null", "-"]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).to_string();
        let line = text.lines().find(|l| l.contains("mean_volume:")).expect("volumedetect çıktısı yok");
        line.split("mean_volume:").nth(1).unwrap().trim().trim_end_matches(" dB").parse().unwrap()
    }

    #[test]
    fn exports_every_audio_format_with_the_right_codec_and_no_video_stream() {
        if !ffmpeg_ok() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let d = dir("bicim");
        let v = d.join("kaynak ğ.mp4"); video(&v, true);
        let m = d.join("müzik.wav"); music(&m);
        for (format, ext, expected) in [("wav", "wav", "pcm_s16le"), ("wav24", "wav", "pcm_s24le"), ("mp3", "mp3", "mp3"), ("flac", "flac", "flac")] {
            let out = d.join(format!("çıktı {format}.{ext}"));
            let msg = render(v.to_string_lossy().into(), out.to_string_lossy().into(), 0.8, vec![track(&m)], format, 0.0).unwrap();
            assert!(msg.contains(&ext.to_uppercase()), "{msg}");
            let (duration, audio, has_video) = probe(out.to_str().unwrap()).unwrap();
            assert!(audio && !has_video, "{format}: yalnız ses akışı olmalı");
            assert!((duration - 3.0).abs() < 0.3, "{format}: süre {duration}");
            assert_eq!(codec(out.to_str().unwrap()), expected, "{format}");
            assert!(fs::metadata(&out).unwrap().len() > 1000);
            // Mevcut dosya ezilmez.
            assert!(render(v.to_string_lossy().into(), out.to_string_lossy().into(), 0.8, vec![], format, 0.0).is_err());
        }
        assert!(fs::read_dir(&d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-mix-")), "geçici klasör kalmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn mp4_export_still_keeps_video_and_aac() {
        if !ffmpeg_ok() { return; }
        let d = dir("mp4");
        let v = d.join("k.mp4"); video(&v, true);
        let m = d.join("m.wav"); music(&m);
        let out = d.join("o.mp4");
        render(v.to_string_lossy().into(), out.to_string_lossy().into(), 1.0, vec![track(&m)], "mp4", 0.0).unwrap();
        let (duration, audio, has_video) = probe(out.to_str().unwrap()).unwrap();
        assert!(audio && has_video && (duration - 3.0).abs() < 0.3);
        assert_eq!(codec(out.to_str().unwrap()), "aac");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ducking_makes_the_music_quieter_while_speech_plays() {
        if !ffmpeg_ok() { return; }
        let d = dir("ducking");
        let v = d.join("konusma.mp4"); video(&v, true);
        let m = d.join("muzik.wav"); music(&m);
        let (plain, ducked, strong) = (d.join("duz.wav"), d.join("kisik.wav"), d.join("guclu.wav"));
        let run = |out: &Path, ducking: f64| render(v.to_string_lossy().into(), out.to_string_lossy().into(), 1.0, vec![track(&m)], "wav", ducking).unwrap();
        assert!(!run(&plain, 0.0).contains("kısıldı"));
        let msg = run(&ducked, 0.5);
        assert!(msg.contains("otomatik kısıldı"), "{msg}");
        run(&strong, 1.0);
        let (a, b, c) = (mean_volume(plain.to_str().unwrap()), mean_volume(ducked.to_str().unwrap()), mean_volume(strong.to_str().unwrap()));
        assert!(b < a - 1.0, "orta kısma düz miksten en az 1 dB sessiz olmalı: düz {a} dB, kısık {b} dB");
        // Güçlü konuşma seviyesinde kısma doygunluğa yakındır (oran 7 → 12 yalnız ~1 dB fark yaratır ve toplam miksi konuşma domine eder).
        assert!(c <= b + 0.05, "güçlü kısma orta kısmadan yüksek olmamalı: orta {b} dB, güçlü {c} dB");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ducking_is_reported_as_not_applied_without_speech_or_music() {
        if !ffmpeg_ok() { return; }
        let d = dir("kisma-yok");
        let silent = d.join("sessiz.mp4"); video(&silent, false);
        let speech = d.join("konusma.mp4"); video(&speech, true);
        let m = d.join("m.wav"); music(&m);
        let a = render(silent.to_string_lossy().into(), d.join("a.wav").to_string_lossy().into(), 1.0, vec![track(&m)], "wav", 1.0).unwrap();
        assert!(a.contains("uygulanmadı"), "orijinal ses yok: {a}");
        let b = render(speech.to_string_lossy().into(), d.join("b.wav").to_string_lossy().into(), 1.0, vec![], "wav", 1.0).unwrap();
        assert!(b.contains("uygulanmadı"), "ek kanal yok: {b}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn invalid_format_ducking_and_extension_are_rejected_without_side_effects() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecersiz");
        let v = d.join("k.mp4"); video(&v, true);
        let src: String = v.to_string_lossy().into();
        let out = |n: &str| d.join(n).to_string_lossy().to_string();
        assert!(render(src.clone(), out("a.ogg"), 1.0, vec![], "ogg", 0.0).unwrap_err().contains("Desteklenmeyen"));
        assert!(render(src.clone(), out("a.wav"), 1.0, vec![], "mp3", 0.0).unwrap_err().contains(".mp3"), "uzantı biçimle uyuşmalı");
        assert!(render(src.clone(), out("b.mp3"), 1.0, vec![], "mp3", 1.5).is_err());
        assert!(render(src.clone(), out("c.mp3"), 1.0, vec![], "mp3", f64::NAN).is_err());
        assert!(render(src.clone(), out("d.mp3"), 3.0, vec![], "mp3", 0.0).is_err());
        assert!(render("yok.mp4".into(), out("e.mp3"), 1.0, vec![], "mp3", 0.0).is_err());
        assert!(fs::read_dir(&d).unwrap().all(|e| e.unwrap().file_name() == "k.mp4"), "hiçbir çıktı/geçici dosya oluşmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn filter_graph_wires_the_sidechain_only_when_ducking_applies() {
        let t = vec![("a".to_string(), 1.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0), ("b".to_string(), 1.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0)];
        let (g, ducked) = build_filters(3.0, true, 1.0, &t, 0.5);
        assert!(ducked && g.contains("asplit=2[original][orig_sc]") && g.contains("[t0][t1]amix=inputs=2") && g.contains("[music][orig_sc]sidechaincompress=threshold=0.04:ratio=7.0"));
        assert!(g.contains("[base][original][ducked]amix=inputs=3"));
        let (plain, d0) = build_filters(3.0, true, 1.0, &t, 0.0);
        assert!(!d0 && !plain.contains("sidechaincompress") && plain.contains("[base][original][t0][t1]amix=inputs=4"));
        let (_, no_audio) = build_filters(3.0, false, 1.0, &t, 1.0);
        assert!(!no_audio);
        let (_, muted) = build_filters(3.0, true, 0.0, &t, 1.0);
        assert!(!muted);
    }
}
