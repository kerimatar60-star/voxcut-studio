use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Emitter;

use crate::audio_mix::probe;

/// Birden çok video kesitini sırayla birleştirip tek MP4 üretir (FFmpeg `concat` filtresi). CPU / libx264 + AAC; kaynaklar değişmez.
const MAX_CLIPS: usize = 50;
const FPS_CHOICES: [u32; 5] = [24, 25, 30, 50, 60];
static CANCEL: AtomicBool = AtomicBool::new(false);

/// (yol, kesit başlangıcı sn, kesit bitişi sn)
pub type Clip = (String, f64, f64);

#[cfg(test)]
fn probe_size(path: &str) -> Result<(u32, u32), String> {
    let out = Command::new("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path]).output()
        .map_err(|e| format!("FFprobe başlatılamadı: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (w, h) = text.trim().split_once('x').ok_or("Video boyutu okunamadı.")?;
    Ok((w.parse().map_err(|_| "Video genişliği okunamadı.")?, h.parse().map_err(|_| "Video yüksekliği okunamadı.")?))
}

fn validate(clips: &[Clip], width: u32, height: u32, fps: u32) -> Result<Vec<bool>, String> {
    if clips.is_empty() { return Err("Zaman çizelgesinde klip yok.".into()); }
    if clips.len() > MAX_CLIPS { return Err(format!("En fazla {MAX_CLIPS} klip birleştirilebilir.")); }
    if !(128..=7680).contains(&width) || !(128..=4320).contains(&height) || !width.is_multiple_of(2) || !height.is_multiple_of(2) { return Err("Çıktı boyutu 128–7680 × 128–4320 arasında ve çift sayı olmalı.".into()); }
    if !FPS_CHOICES.contains(&fps) { return Err("Kare hızı 24, 25, 30, 50 veya 60 olmalı.".into()); }
    let mut audio = Vec::new();
    for (i, (path, start, end)) in clips.iter().enumerate() {
        let label = format!("Klip {} ({})", i + 1, Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("?"));
        if !Path::new(path).is_absolute() || !Path::new(path).is_file() { return Err(format!("{label}: dosya bulunamadı.")); }
        if !start.is_finite() || !end.is_finite() || *start < 0.0 || end <= start { return Err(format!("{label}: kesit başlangıcı/bitişi geçersiz.")); }
        let (duration, has_audio, has_video) = probe(path).map_err(|e| format!("{label}: {e}"))?;
        if !has_video { return Err(format!("{label}: dosyada video yok.")); }
        if *end > duration + 0.05 { return Err(format!("{label}: kesit bitişi ({end:.2} sn) kaynak süresini ({duration:.2} sn) aşıyor.")); }
        audio.push(has_audio);
    }
    Ok(audio)
}

/// Ses akışı olmayan klipler için sessizlik üretilir, böylece hepsi aynı biçimde (48 kHz stereo) birleşir.
fn filter_graph(clips: &[Clip], has_audio: &[bool], width: u32, height: u32, fps: u32) -> String {
    let mut parts = Vec::new();
    let mut inputs = String::new();
    for (i, (_, start, end)) in clips.iter().enumerate() {
        parts.push(format!("[{i}:v:0]trim=start={start:.3}:end={end:.3},setpts=PTS-STARTPTS,fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v{i}]"));
        if has_audio[i] {
            parts.push(format!("[{i}:a:0]atrim=start={start:.3}:end={end:.3},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]"));
        } else {
            parts.push(format!("anullsrc=r=48000:cl=stereo,atrim=duration={:.3},asetpts=PTS-STARTPTS[a{i}]", end - start));
        }
        inputs.push_str(&format!("[v{i}][a{i}]"));
    }
    parts.push(format!("{inputs}concat=n={}:v=1:a=1[outv][outa]", clips.len()));
    parts.join(";")
}

/// FFmpeg'i çalıştırır; `-progress` çıktısından yüzde hesaplar ve iptal bayrağını izler. İptalde süreç öldürülür.
fn run_ffmpeg(cmd: &mut Command, total_secs: f64, on_progress: &mut dyn FnMut(f64), cancel: &AtomicBool) -> Result<(), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
    let stderr = child.stderr.take().ok_or("FFmpeg hata çıktısı alınamadı.")?;
    let err_thread = std::thread::spawn(move || { let mut text = String::new(); let _ = BufReader::new(stderr).take(200_000).read_to_string(&mut text); text });
    let stdout = child.stdout.take().ok_or("FFmpeg ilerleme çıktısı alınamadı.")?;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if cancel.load(Ordering::SeqCst) { let _ = child.kill(); let _ = child.wait(); let _ = err_thread.join(); return Err("İşlem iptal edildi.".into()); }
        if let Some(us) = line.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok()) {
            if total_secs > 0.0 { on_progress((us / 1_000_000.0 / total_secs * 100.0).clamp(0.0, 99.0)); }
        }
    }
    let status = child.wait().map_err(|e| format!("FFmpeg beklenemedi: {e}"))?;
    let errors = err_thread.join().unwrap_or_default();
    if cancel.load(Ordering::SeqCst) { return Err("İşlem iptal edildi.".into()); }
    if !status.success() { return Err(format!("FFmpeg hatası: {}", errors.chars().rev().take(1800).collect::<String>().chars().rev().collect::<String>())); }
    Ok(())
}

fn render(clips: &[Clip], output: &str, width: u32, height: u32, fps: u32, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    let has_audio = validate(clips, width, height, fps)?;
    let target = Path::new(output);
    if !target.is_absolute() || target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("mp4")) { return Err("Yeni bir MP4 dosya adı seçin; mevcut dosyalar korunur.".into()); }
    if clips.iter().any(|(p, _, _)| p.eq_ignore_ascii_case(output)) { return Err("Çıktı dosyası bir kaynak klipten farklı olmalı.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let total: f64 = clips.iter().map(|(_, s, e)| e - s).sum();
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir: PathBuf = parent.join(format!(".voxcut-tl-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join("out.mp4");
    let result = (|| {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-hide_banner", "-nostdin", "-n", "-progress", "pipe:1", "-nostats"]);
        for (path, _, _) in clips { cmd.arg("-i").arg(path); }
        cmd.args(["-filter_complex", &filter_graph(clips, &has_audio, width, height, fps), "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]).arg(&temp);
        run_ffmpeg(&mut cmd, total, on_progress, cancel)?;
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        let tolerance = 0.3 + clips.len() as f64 * 0.05;
        if !audio || !video || (actual - total).abs() > tolerance { return Err(format!("Çıktı doğrulaması başarısız (süre {actual:.2} sn, beklenen {total:.2} sn).")); }
        // Aynı dosya sisteminde atomik, üzerine yazmayan yayımlama (hard link yoksa yeniden adlandır).
        if fs::hard_link(&temp, target).is_err() {
            if target.exists() { return Err("Hedef dosya araya girdi; üzerine yazılmadı.".into()); }
            fs::rename(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi: {e}"))?;
        }
        on_progress(100.0);
        Ok(format!("Birleştirilmiş MP4 kaydedildi ({} klip, {total:.1} sn): {output}", clips.len()))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

#[tauri::command]
pub async fn render_timeline(app: tauri::AppHandle, clips: Vec<Clip>, output_path: String, width: u32, height: u32, fps: u32) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let mut last = -1.0f64;
        render(&clips, &output_path, width, height, fps, &CANCEL, &mut |pct| {
            if (pct - last).abs() >= 1.0 { last = pct; let _ = app.emit("timeline-progress", pct.round()); }
        })
    }).await.map_err(|e| e.to_string())?
}

/// Çalışan birleştirmeyi iptal eder (FFmpeg süreci öldürülür, geçici dosyalar temizlenir, mevcut dosyalara dokunulmaz).
#[tauri::command]
pub fn cancel_timeline_render() { CANCEL.store(true, Ordering::SeqCst); }

#[cfg(test)]
mod tests {
    use super::*;

    fn ffmpeg_ok() -> bool { Command::new("ffmpeg").arg("-version").output().is_ok() }
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut zaman {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    /// lavfi ile deneme klibi üretir: (dosya, boyut, fps, saniye, sesli mi)
    fn fixture(path: &Path, size: &str, fps: u32, secs: u32, audio: bool) {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", &format!("testsrc=size={size}:rate={fps}:duration={secs}")]);
        if audio { cmd.args(["-f", "lavfi", "-i", &format!("sine=frequency=440:duration={secs}")]); }
        cmd.args(["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
        if audio { cmd.args(["-c:a", "aac", "-shortest"]); }
        let out = cmd.arg(path).output().unwrap();
        assert!(out.status.success(), "fixture üretilemedi: {}", String::from_utf8_lossy(&out.stderr));
    }
    fn fps_of(path: &str) -> f64 {
        let out = Command::new("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", path]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let (a, b) = text.split_once('/').unwrap();
        a.parse::<f64>().unwrap() / b.parse::<f64>().unwrap()
    }

    #[test]
    fn merges_mixed_resolution_fps_and_missing_audio_into_one_verified_mp4() {
        if !ffmpeg_ok() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let d = dir("birlestir");
        let a = d.join("a 640x360 25fps.mp4"); fixture(&a, "640x360", 25, 3, true);
        let b = d.join("b sessiz 320x240 30fps.mp4"); fixture(&b, "320x240", 30, 2, false);
        let c = d.join("klip ğ üç 1280x720 24fps.mp4"); fixture(&c, "1280x720", 24, 4, true);
        let out = d.join("çıktı ş.mp4");
        let clips: Vec<Clip> = vec![(a.to_string_lossy().into(), 0.5, 2.5), (b.to_string_lossy().into(), 0.0, 2.0), (c.to_string_lossy().into(), 1.0, 3.0)];
        let cancel = AtomicBool::new(false);
        let mut progress = Vec::new();
        let msg = render(&clips, out.to_str().unwrap(), 1280, 720, 30, &cancel, &mut |p| progress.push(p)).unwrap();
        assert!(msg.contains("3 klip"), "{msg}");
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        assert!(audio && video, "ses ve video akışı olmalı");
        assert!((duration - 6.0).abs() < 0.4, "süre ≈ 6 sn olmalı: {duration}");
        assert_eq!(probe_size(out.to_str().unwrap()).unwrap(), (1280, 720));
        assert!((fps_of(out.to_str().unwrap()) - 30.0).abs() < 0.01);
        assert_eq!(progress.last().copied(), Some(100.0));
        assert!(progress.windows(2).all(|w| w[0] <= w[1] + 1e-9), "ilerleme geriye gitmemeli: {progress:?}");
        // Kaynaklar değişmedi, geçici klasör kalmadı, mevcut dosya ezilmez.
        assert!(a.exists() && b.exists() && c.exists());
        assert!(fs::read_dir(&d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-tl-")));
        assert!(render(&clips, out.to_str().unwrap(), 1280, 720, 30, &cancel, &mut |_| {}).is_err(), "mevcut çıktının üzerine yazılmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn portrait_output_letterboxes_landscape_sources() {
        if !ffmpeg_ok() { return; }
        let d = dir("dikey");
        let a = d.join("yatay.mp4"); fixture(&a, "640x360", 25, 2, true);
        let out = d.join("dikey.mp4");
        render(&[(a.to_string_lossy().into(), 0.0, 1.5)], out.to_str().unwrap(), 1080, 1920, 30, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(probe_size(out.to_str().unwrap()).unwrap(), (1080, 1920));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn cancel_flag_stops_the_render_and_cleans_up() {
        if !ffmpeg_ok() { return; }
        let d = dir("iptal");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 3, true);
        let out = d.join("iptal.mp4");
        let cancel = AtomicBool::new(true);
        let err = render(&[(a.to_string_lossy().into(), 0.0, 3.0)], out.to_str().unwrap(), 1280, 720, 30, &cancel, &mut |_| {}).unwrap_err();
        assert!(err.contains("iptal"), "{err}");
        assert!(!out.exists());
        assert!(fs::read_dir(&d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-tl-")), "geçici klasör temizlenmeli");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn invalid_requests_are_rejected_before_any_work() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecersiz");
        let a = d.join("a.mp4"); fixture(&a, "320x240", 25, 2, true);
        let p: String = a.to_string_lossy().into();
        let out = d.join("o.mp4");
        let o = out.to_str().unwrap();
        let ok = |clips: &[Clip], w, h, f| render(clips, o, w, h, f, &AtomicBool::new(false), &mut |_| {});
        assert!(ok(&[], 1280, 720, 30).is_err());
        assert!(ok(&[(p.clone(), 1.0, 1.0)], 1280, 720, 30).unwrap_err().contains("geçersiz"));
        assert!(ok(&[(p.clone(), -1.0, 1.0)], 1280, 720, 30).is_err());
        assert!(ok(&[(p.clone(), 0.0, 99.0)], 1280, 720, 30).unwrap_err().contains("aşıyor"));
        assert!(ok(&[(p.clone(), 0.0, f64::NAN)], 1280, 720, 30).is_err());
        assert!(ok(&[("yok.mp4".into(), 0.0, 1.0)], 1280, 720, 30).unwrap_err().contains("bulunamadı"));
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 1281, 720, 30).is_err(), "tek sayılı boyut");
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 64, 64, 30).is_err(), "çok küçük");
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 1280, 720, 29).is_err(), "kare hızı beyaz listede değil");
        assert!(render(&[(p.clone(), 0.0, 1.0)], d.join("o.mkv").to_str().unwrap(), 1280, 720, 30, &AtomicBool::new(false), &mut |_| {}).is_err(), "MP4 olmayan çıktı");
        assert!(render(&[(p.clone(), 0.0, 1.0)], &p, 1280, 720, 30, &AtomicBool::new(false), &mut |_| {}).is_err(), "çıktı = kaynak");
        let many: Vec<Clip> = (0..=MAX_CLIPS).map(|_| (p.clone(), 0.0, 0.5)).collect();
        assert!(ok(&many, 1280, 720, 30).unwrap_err().contains("En fazla"));
        assert!(!out.exists());
        let _ = fs::remove_dir_all(&d);
    }

    /// Stres testi (CLAUDE.md §6): 10 dk 1080p/30 birleştirme. Yavaştır; yalnız elle çalıştırılır:
    /// `cargo test --offline --lib stress_ten_minutes -- --ignored --nocapture`
    #[test]
    #[ignore = "uzun sürer (dakikalar); elle çalıştırılır"]
    fn stress_ten_minutes_1080p_timeline() {
        if !ffmpeg_ok() { return; }
        let d = dir("stres");
        let started = std::time::Instant::now();
        let mut clips: Vec<Clip> = Vec::new();
        for i in 0..3 {
            let p = d.join(format!("klip {i}.mp4"));
            let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=200", "-f", "lavfi", "-i", "sine=frequency=440:duration=200", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]).arg(&p).output().unwrap();
            assert!(out.status.success());
            clips.push((p.to_string_lossy().into(), 0.0, 200.0));
        }
        println!("STRES fixture süresi: {:.1} sn", started.elapsed().as_secs_f64());
        let out = d.join("stres.mp4");
        let t = std::time::Instant::now();
        let mut last = 0.0;
        let msg = render(&clips, out.to_str().unwrap(), 1920, 1080, 30, &AtomicBool::new(false), &mut |p| last = p).unwrap();
        let secs = t.elapsed().as_secs_f64();
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        let size_mb = fs::metadata(&out).unwrap().len() as f64 / 1_048_576.0;
        println!("STRES sonuç: {msg}");
        println!("STRES render süresi: {secs:.1} sn ({:.2}× gerçek zamanlı), çıktı {duration:.1} sn, {size_mb:.1} MB, son ilerleme %{last}", duration / secs);
        assert!(audio && video && (duration - 600.0).abs() < 1.5);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn filter_graph_pads_silent_clips_and_concats_all_in_order() {
        let g = filter_graph(&[("a".into(), 0.0, 2.0), ("b".into(), 1.0, 3.5)], &[true, false], 1280, 720, 30);
        assert!(g.contains("[0:a:0]atrim=start=0.000:end=2.000"));
        assert!(g.contains("anullsrc=r=48000:cl=stereo,atrim=duration=2.500"));
        assert!(g.ends_with("[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]"));
        assert!(g.contains("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720"));
    }
}
