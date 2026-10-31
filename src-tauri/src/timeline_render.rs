use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Emitter;

use crate::audio_mix::{self, probe, Track};
use crate::subtitle_burn::{force_style, validate_srt, Look};

/// Birden çok video kesitini sırayla birleştirip tek MP4 üretir (FFmpeg `concat` / `xfade`). CPU / libx264 + AAC; kaynaklar değişmez.
/// İsteğe bağlı: klipler arası geçişler, klip başına renk ayarı, tek geçişte altyazı yakma ve ek ses kanalı miksi (video yeniden kodlanmadan).
const MAX_CLIPS: usize = 50;
const FPS_CHOICES: [u32; 5] = [24, 25, 30, 50, 60];
/// FFmpeg `xfade` geçiş adları (beyaz liste). "cut" geçiş yok anlamına gelir.
const TRANSITIONS: [&str; 12] = ["cut", "fade", "dissolve", "fadeblack", "fadewhite", "wipeleft", "wiperight", "slideleft", "slideright", "circleopen", "pixelize", "radial"];
const MIN_TRANSITION: f64 = 0.1;
const MAX_TRANSITION: f64 = 3.0;
static CANCEL: AtomicBool = AtomicBool::new(false);

/// (yol, kesit başlangıcı sn, kesit bitişi sn)
pub type Clip = (String, f64, f64);
/// (parlaklık -1..1, kontrast 0..2, doygunluk 0..3); varsayılan (0, 1, 1) filtre eklemez.
pub type Adjust = (f64, f64, f64);
/// (geçiş adı, süre sn): klip i ile i+1 arasında.
pub type Join = (String, f64);
/// (srt, yazı boyutu %, konum, renk, yazı tipi, kalın, kontur, kutu)
pub type SubtitleSpec = (String, f64, String, String, String, bool, f64, bool);
/// (orijinal ses seviyesi, ek kanallar, kısma gücü)
pub type MixSpec = (f64, Vec<Track>, f64);

pub struct Options {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub joins: Vec<Join>,
    pub adjusts: Vec<Adjust>,
    pub subtitles: Option<SubtitleSpec>,
    pub mix: Option<MixSpec>,
}

impl Default for Options {
    fn default() -> Self { Options { width: 1280, height: 720, fps: 30, joins: Vec::new(), adjusts: Vec::new(), subtitles: None, mix: None } }
}

#[cfg(test)]
fn probe_size(path: &str) -> Result<(u32, u32), String> {
    let out = Command::new("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path]).output()
        .map_err(|e| format!("FFprobe başlatılamadı: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let (w, h) = text.trim().split_once('x').ok_or("Video boyutu okunamadı.")?;
    Ok((w.parse().map_err(|_| "Video genişliği okunamadı.")?, h.parse().map_err(|_| "Video yüksekliği okunamadı.")?))
}

fn is_default_adjust(a: &Adjust) -> bool { a.0 == 0.0 && a.1 == 1.0 && a.2 == 1.0 }

/// Doğrulama sonucu: klip başına ses var mı, geçişlerin yerleşmiş hâli (cut = süre 0) ve çıktının beklenen süresi.
struct Plan { has_audio: Vec<bool>, joins: Vec<Join>, adjusts: Vec<Adjust>, expected: f64 }

fn validate(clips: &[Clip], o: &Options) -> Result<Plan, String> {
    if clips.is_empty() { return Err("Zaman çizelgesinde klip yok.".into()); }
    if clips.len() > MAX_CLIPS { return Err(format!("En fazla {MAX_CLIPS} klip birleştirilebilir.")); }
    if !(128..=7680).contains(&o.width) || !(128..=4320).contains(&o.height) || !o.width.is_multiple_of(2) || !o.height.is_multiple_of(2) { return Err("Çıktı boyutu 128–7680 × 128–4320 arasında ve çift sayı olmalı.".into()); }
    if !FPS_CHOICES.contains(&o.fps) { return Err("Kare hızı 24, 25, 30, 50 veya 60 olmalı.".into()); }
    let mut has_audio = Vec::new();
    for (i, (path, start, end)) in clips.iter().enumerate() {
        let label = format!("Klip {} ({})", i + 1, Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("?"));
        if !Path::new(path).is_absolute() || !Path::new(path).is_file() { return Err(format!("{label}: dosya bulunamadı.")); }
        if !start.is_finite() || !end.is_finite() || *start < 0.0 || end <= start { return Err(format!("{label}: kesit başlangıcı/bitişi geçersiz.")); }
        let (duration, audio, video) = probe(path).map_err(|e| format!("{label}: {e}"))?;
        if !video { return Err(format!("{label}: dosyada video yok.")); }
        if *end > duration + 0.05 { return Err(format!("{label}: kesit bitişi ({end:.2} sn) kaynak süresini ({duration:.2} sn) aşıyor.")); }
        has_audio.push(audio);
    }
    let joins_needed = clips.len() - 1;
    if !o.joins.is_empty() && o.joins.len() != joins_needed { return Err(format!("Geçiş sayısı {joins_needed} olmalı (her klip çifti için bir tane).")); }
    if !o.adjusts.is_empty() && o.adjusts.len() != clips.len() { return Err("Renk ayarı sayısı klip sayısıyla aynı olmalı.".into()); }
    for (i, (b, c, s)) in o.adjusts.iter().enumerate() {
        if ![b, c, s].iter().all(|v| v.is_finite()) || !(-1.0..=1.0).contains(b) || !(0.0..=2.0).contains(c) || !(0.0..=3.0).contains(s) { return Err(format!("Klip {}: renk ayarı geçersiz (parlaklık -1..1, kontrast 0..2, doygunluk 0..3).", i + 1)); }
    }
    let len = |i: usize| clips[i].2 - clips[i].1;
    let mut joins: Vec<Join> = Vec::with_capacity(joins_needed);
    for i in 0..joins_needed {
        let (kind, d) = o.joins.get(i).cloned().unwrap_or(("cut".into(), 0.0));
        if !TRANSITIONS.contains(&kind.as_str()) { return Err(format!("Geçiş {}: desteklenmeyen tür.", i + 1)); }
        if kind == "cut" { joins.push(("cut".into(), 0.0)); continue; }
        if !d.is_finite() || !(MIN_TRANSITION..=MAX_TRANSITION).contains(&d) { return Err(format!("Geçiş {}: süre {MIN_TRANSITION}–{MAX_TRANSITION} sn olmalı.", i + 1)); }
        if d > 0.5 * len(i).min(len(i + 1)) + 1e-9 { return Err(format!("Geçiş {}: süre, bitişen kliplerin kısasının yarısını aşamaz.", i + 1)); }
        joins.push((kind, d));
    }
    let expected = (0..clips.len()).map(len).sum::<f64>() - joins.iter().map(|j| j.1).sum::<f64>();
    let adjusts = if o.adjusts.is_empty() { vec![(0.0, 1.0, 1.0); clips.len()] } else { o.adjusts.clone() };
    Ok(Plan { has_audio, joins, adjusts, expected })
}

/// Klip başına trim/fps/ölçek-pad/renk + ses normalizasyonu; sonra geçişlerle zincirleme (xfade/acrossfade) veya `concat`.
/// Sessiz kliplerde `anullsrc` ile 48 kHz stereo sessizlik üretilir. `subtitle_filter` son video yoluna eklenir.
fn filter_graph(clips: &[Clip], plan: &Plan, o: &Options, subtitle_filter: Option<&str>) -> String {
    let (w, h, fps) = (o.width, o.height, o.fps);
    let mut parts = Vec::new();
    for (i, (_, start, end)) in clips.iter().enumerate() {
        let eq = if is_default_adjust(&plan.adjusts[i]) { String::new() } else { format!(",eq=brightness={:.3}:contrast={:.3}:saturation={:.3}", plan.adjusts[i].0, plan.adjusts[i].1, plan.adjusts[i].2) };
        parts.push(format!("[{i}:v:0]trim=start={start:.3}:end={end:.3},setpts=PTS-STARTPTS,fps={fps},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1{eq},format=yuv420p[v{i}]"));
        if plan.has_audio[i] {
            parts.push(format!("[{i}:a:0]atrim=start={start:.3}:end={end:.3},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]"));
        } else {
            parts.push(format!("anullsrc=r=48000:cl=stereo,atrim=duration={:.3},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]", end - start));
        }
    }
    let (mut v, mut a) = ("v0".to_string(), "a0".to_string());
    let mut acc = clips[0].2 - clips[0].1;
    for (i, clip) in clips.iter().enumerate().skip(1) {
        let len = clip.2 - clip.1;
        let (kind, d) = &plan.joins[i - 1];
        if kind == "cut" {
            parts.push(format!("[{v}][{a}][v{i}][a{i}]concat=n=2:v=1:a=1[j{i}v][j{i}a]"));
            acc += len;
        } else {
            parts.push(format!("[{v}][v{i}]xfade=transition={kind}:duration={d:.3}:offset={:.3}[j{i}v]", acc - d));
            parts.push(format!("[{a}][a{i}]acrossfade=d={d:.3}[j{i}a]"));
            acc += len - d;
        }
        v = format!("j{i}v"); a = format!("j{i}a");
    }
    parts.push(match subtitle_filter { Some(f) => format!("[{v}]{f}[outv]"), None => format!("[{v}]null[outv]") });
    parts.push(format!("[{a}]anull[outa]"));
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

pub fn render(clips: &[Clip], output: &str, o: &Options, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    let plan = validate(clips, o)?;
    let target = Path::new(output);
    if !target.is_absolute() || target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("mp4")) { return Err("Yeni bir MP4 dosya adı seçin; mevcut dosyalar korunur.".into()); }
    if clips.iter().any(|(p, _, _)| p.eq_ignore_ascii_case(output)) { return Err("Çıktı dosyası bir kaynak klipten farklı olmalı.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    // Altyazı ve miks isteklerini işe başlamadan doğrula.
    let subtitle_filter = match &o.subtitles {
        Some((srt, size, position, color, font, bold, outline, boxed)) => {
            validate_srt(srt)?;
            let look = Look { font: font.clone(), bold: *bold, outline: *outline, boxed: *boxed };
            Some(format!("subtitles=sub.srt:force_style='{}'", force_style(*size, position, color, &look)?))
        }
        None => None,
    };
    if let Some((gain, tracks, ducking)) = &o.mix {
        if tracks.len() > 8 || !gain.is_finite() || !(0.0..=2.0).contains(gain) || !ducking.is_finite() || !(0.0..=1.0).contains(ducking) { return Err("Ses miksi ayarları geçersiz.".into()); }
    }
    let total = plan.expected;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir: PathBuf = parent.join(format!(".voxcut-tl-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join("out.mp4");
    let result = (|| {
        if let Some((srt, ..)) = &o.subtitles { fs::write(temp_dir.join("sub.srt"), srt.as_bytes()).map_err(|e| format!("Altyazı dosyası yazılamadı: {e}"))?; }
        let mut cmd = Command::new("ffmpeg");
        // Altyazı dosyası göreli adla verilir (Windows sürücü harfi/iki nokta kaçışı gerekmez); girdi/çıktı yolları mutlaktır.
        cmd.current_dir(&temp_dir).args(["-hide_banner", "-nostdin", "-n", "-progress", "pipe:1", "-nostats"]);
        for (path, _, _) in clips { cmd.arg("-i").arg(path); }
        cmd.args(["-filter_complex", &filter_graph(clips, &plan, o, subtitle_filter.as_deref()), "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]).arg(&temp);
        run_ffmpeg(&mut cmd, total, on_progress, cancel)?;
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        let tolerance = 0.3 + clips.len() as f64 * 0.05;
        if !audio || !video || (actual - total).abs() > tolerance { return Err(format!("Çıktı doğrulaması başarısız (süre {actual:.2} sn, beklenen {total:.2} sn).")); }
        let cuts = plan.joins.iter().filter(|j| j.0 != "cut").count();
        let extras = format!("{}{}{}", if cuts > 0 { format!(", {cuts} geçiş") } else { String::new() }, if o.subtitles.is_some() { ", altyazı yakıldı" } else { "" }, if o.mix.is_some() { ", ses miksi uygulandı" } else { "" });
        if let Some((gain, tracks, ducking)) = &o.mix {
            // Video yeniden kodlanmaz (copy); miks kendi doğrulamasını yapar ve hedefe atomik yayımlar.
            audio_mix::render(temp.to_string_lossy().to_string(), output.to_string(), *gain, tracks.clone(), "mp4", *ducking)?;
        } else if fs::hard_link(&temp, target).is_err() {
            // Aynı dosya sisteminde atomik, üzerine yazmayan yayımlama (hard link yoksa yeniden adlandır).
            if target.exists() { return Err("Hedef dosya araya girdi; üzerine yazılmadı.".into()); }
            fs::rename(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi: {e}"))?;
        }
        on_progress(100.0);
        Ok(format!("Birleştirilmiş MP4 kaydedildi ({} klip, {total:.1} sn{extras}): {output}", clips.len()))
    })();
    let _ = fs::remove_file(temp_dir.join("sub.srt"));
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

// Tauri komut bağımsız değişkenleri arayüzden adıyla tek tek gelir; bu yüzden düz parametre listesi kullanılır.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn render_timeline(app: tauri::AppHandle, clips: Vec<Clip>, output_path: String, width: u32, height: u32, fps: u32, transitions: Option<Vec<Join>>, adjusts: Option<Vec<Adjust>>, subtitles: Option<SubtitleSpec>, mix: Option<MixSpec>) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let options = Options { width, height, fps, joins: transitions.unwrap_or_default(), adjusts: adjusts.unwrap_or_default(), subtitles, mix };
    tauri::async_runtime::spawn_blocking(move || {
        let mut last = -1.0f64;
        render(&clips, &output_path, &options, &CANCEL, &mut |pct| {
            if (pct - last).abs() >= 1.0 { last = pct; let _ = app.emit("timeline-progress", pct.round()); }
        })
    }).await.map_err(|e| e.to_string())?
}

/// Çalışan birleştirmeyi iptal eder (FFmpeg süreci öldürülür, geçici klasörler temizlenir, mevcut dosyalara dokunulmaz).
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
    fn clip(p: &Path, start: f64, end: f64) -> Clip { (p.to_string_lossy().into(), start, end) }
    fn run(clips: &[Clip], out: &Path, o: &Options) -> Result<String, String> { render(clips, out.to_str().unwrap(), o, &AtomicBool::new(false), &mut |_| {}) }
    /// İlk karenin ortalama parlaklığı (0..255) veya iki çıktının kare farkı için ham gri kare.
    fn gray_frame(video: &Path, at: f64) -> Vec<u8> {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-ss", &at.to_string(), "-i"]).arg(video).args(["-frames:v", "1", "-vf", "scale=320:180,format=gray", "-f", "rawvideo", "-"]).output().unwrap();
        assert!(out.status.success() && !out.stdout.is_empty());
        out.stdout
    }
    /// Karedeki ortalama renk yayılımı: piksel başına (en büyük − en küçük RGB kanalı). Gri görüntüde ≈ 0.
    fn color_spread(video: &Path, at: f64) -> f64 {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-ss", &at.to_string(), "-i"]).arg(video).args(["-frames:v", "1", "-vf", "scale=320:180,format=rgb24", "-f", "rawvideo", "-"]).output().unwrap();
        assert!(out.status.success() && !out.stdout.is_empty());
        let px = out.stdout.as_chunks::<3>().0.iter();
        let n = px.len() as f64;
        px.map(|p| (*p.iter().max().unwrap() as f64) - (*p.iter().min().unwrap() as f64)).sum::<f64>() / n
    }
    fn mean(frame: &[u8]) -> f64 { frame.iter().map(|b| *b as f64).sum::<f64>() / frame.len() as f64 }
    fn no_temp_left(d: &Path) -> bool { fs::read_dir(d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-tl-")) }

    #[test]
    fn merges_mixed_resolution_fps_and_missing_audio_into_one_verified_mp4() {
        if !ffmpeg_ok() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let d = dir("birlestir");
        let a = d.join("a 640x360 25fps.mp4"); fixture(&a, "640x360", 25, 3, true);
        let b = d.join("b sessiz 320x240 30fps.mp4"); fixture(&b, "320x240", 30, 2, false);
        let c = d.join("klip ğ üç 1280x720 24fps.mp4"); fixture(&c, "1280x720", 24, 4, true);
        let out = d.join("çıktı ş.mp4");
        let clips = [clip(&a, 0.5, 2.5), clip(&b, 0.0, 2.0), clip(&c, 1.0, 3.0)];
        let mut progress = Vec::new();
        let msg = render(&clips, out.to_str().unwrap(), &Options::default(), &AtomicBool::new(false), &mut |p| progress.push(p)).unwrap();
        assert!(msg.contains("3 klip"), "{msg}");
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        assert!(audio && video, "ses ve video akışı olmalı");
        assert!((duration - 6.0).abs() < 0.4, "süre ≈ 6 sn olmalı: {duration}");
        assert_eq!(probe_size(out.to_str().unwrap()).unwrap(), (1280, 720));
        assert!((fps_of(out.to_str().unwrap()) - 30.0).abs() < 0.01);
        assert_eq!(progress.last().copied(), Some(100.0));
        assert!(progress.windows(2).all(|w| w[0] <= w[1] + 1e-9), "ilerleme geriye gitmemeli: {progress:?}");
        assert!(a.exists() && b.exists() && c.exists());
        assert!(no_temp_left(&d));
        assert!(run(&clips, &out, &Options::default()).is_err(), "mevcut çıktının üzerine yazılmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn transitions_overlap_clips_and_shorten_the_total_by_the_fade_durations() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecis");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 3, true);
        let b = d.join("b.mp4"); fixture(&b, "320x240", 30, 3, false);
        let c = d.join("c.mp4"); fixture(&c, "1280x720", 24, 3, true);
        let clips = [clip(&a, 0.0, 3.0), clip(&b, 0.0, 3.0), clip(&c, 0.0, 3.0)];
        let out = d.join("gecisli.mp4");
        let o = Options { joins: vec![("fade".into(), 1.0), ("cut".into(), 0.0)], ..Options::default() };
        let msg = run(&clips, &out, &o).unwrap();
        assert!(msg.contains("1 geçiş"), "{msg}");
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        assert!(audio && video && (duration - 8.0).abs() < 0.4, "9 sn − 1 sn geçiş ≈ 8 sn: {duration}");
        // İki geçiş: toplam 9 − 0,5 − 0,5.
        let out2 = d.join("iki.mp4");
        run(&clips, &out2, &Options { joins: vec![("dissolve".into(), 0.5), ("wipeleft".into(), 0.5)], ..Options::default() }).unwrap();
        assert!((probe(out2.to_str().unwrap()).unwrap().0 - 8.0).abs() < 0.4);
        assert!(no_temp_left(&d));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn every_whitelisted_transition_renders() {
        if !ffmpeg_ok() { return; }
        let d = dir("tum-gecisler");
        let a = d.join("a.mp4"); fixture(&a, "320x240", 25, 2, true);
        let b = d.join("b.mp4"); fixture(&b, "320x240", 25, 2, true);
        let clips = [clip(&a, 0.0, 2.0), clip(&b, 0.0, 2.0)];
        for kind in TRANSITIONS.iter().filter(|k| **k != "cut") {
            let out = d.join(format!("{kind}.mp4"));
            run(&clips, &out, &Options { width: 320, height: 240, joins: vec![((*kind).into(), 0.5)], ..Options::default() }).unwrap_or_else(|e| panic!("{kind}: {e}"));
            let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
            assert!(audio && video && (duration - 3.5).abs() < 0.3, "{kind}: {duration}");
        }
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn invalid_transitions_and_adjustments_are_rejected_before_any_work() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecis-gecersiz");
        let a = d.join("a.mp4"); fixture(&a, "320x240", 25, 2, true);
        let b = d.join("b.mp4"); fixture(&b, "320x240", 25, 1, true);
        let clips = [clip(&a, 0.0, 2.0), clip(&b, 0.0, 1.0)];
        let out = d.join("o.mp4");
        let bad = |o: Options| run(&clips, &out, &o).unwrap_err();
        assert!(bad(Options { joins: vec![("fade".into(), 0.5), ("fade".into(), 0.5)], ..Options::default() }).contains("Geçiş sayısı"));
        assert!(bad(Options { joins: vec![("spin".into(), 0.5)], ..Options::default() }).contains("desteklenmeyen"));
        assert!(bad(Options { joins: vec![("fade".into(), 0.05)], ..Options::default() }).contains("süre"));
        assert!(bad(Options { joins: vec![("fade".into(), 4.0)], ..Options::default() }).contains("süre"));
        assert!(bad(Options { joins: vec![("fade".into(), f64::NAN)], ..Options::default() }).contains("süre"));
        assert!(bad(Options { joins: vec![("fade".into(), 0.8)], ..Options::default() }).contains("yarısını"), "kısa klibin (1 sn) yarısından uzun");
        assert!(bad(Options { adjusts: vec![(0.0, 1.0, 1.0)], ..Options::default() }).contains("Renk ayarı sayısı"));
        assert!(bad(Options { adjusts: vec![(2.0, 1.0, 1.0), (0.0, 1.0, 1.0)], ..Options::default() }).contains("geçersiz"));
        assert!(bad(Options { adjusts: vec![(0.0, 1.0, 1.0), (0.0, 1.0, f64::NAN)], ..Options::default() }).contains("geçersiz"));
        assert!(!out.exists() && no_temp_left(&d));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn color_adjustment_changes_the_picture_per_clip() {
        if !ffmpeg_ok() { return; }
        let d = dir("renk");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 2, true);
        let (plain, bright) = (d.join("duz.mp4"), d.join("parlak.mp4"));
        run(&[clip(&a, 0.0, 2.0)], &plain, &Options::default()).unwrap();
        run(&[clip(&a, 0.0, 2.0)], &bright, &Options { adjusts: vec![(0.3, 1.0, 1.0)], ..Options::default() }).unwrap();
        let (m_plain, m_bright) = (mean(&gray_frame(&plain, 1.0)), mean(&gray_frame(&bright, 1.0)));
        assert!(m_bright > m_plain + 15.0, "parlaklık +0.3 görüntüyü belirgin aydınlatmalı: {m_plain:.1} → {m_bright:.1}");
        let dull = d.join("soluk.mp4");
        run(&[clip(&a, 0.0, 2.0)], &dull, &Options { adjusts: vec![(0.0, 1.0, 0.0)], ..Options::default() }).unwrap();
        let (spread_plain, spread_dull) = (color_spread(&plain, 1.0), color_spread(&dull, 1.0));
        assert!(spread_plain > 20.0, "normal kare renkli olmalı: {spread_plain:.1}");
        assert!(spread_dull < spread_plain / 4.0, "doygunluk 0 kareyi (neredeyse) griye çevirmeli: normal {spread_plain:.1}, doygunluksuz {spread_dull:.1}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn subtitles_are_burned_in_the_same_pass() {
        if !ffmpeg_ok() { return; }
        let d = dir("altyazi");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 3, true);
        let (plain, subbed) = (d.join("duz.mp4"), d.join("altyazili.mp4"));
        run(&[clip(&a, 0.0, 3.0)], &plain, &Options::default()).unwrap();
        let srt = "1\n00:00:00,000 --> 00:00:03,000\nTürkçe İğŞ altyazı denemesi\n";
        let spec: SubtitleSpec = (srt.into(), 8.0, "bottom".into(), "white".into(), "Arial".into(), true, 3.0, true);
        let msg = run(&[clip(&a, 0.0, 3.0)], &subbed, &Options { subtitles: Some(spec), ..Options::default() }).unwrap();
        assert!(msg.contains("altyazı yakıldı"), "{msg}");
        let diff = gray_frame(&plain, 1.0).iter().zip(gray_frame(&subbed, 1.0)).map(|(x, y)| (*x as f64 - y as f64).abs()).sum::<f64>() / (320.0 * 180.0);
        assert!(diff > 0.5, "altyazı kareyi değiştirmeli: ortalama fark {diff:.2}");
        let bad: SubtitleSpec = ("metin".into(), 8.0, "bottom".into(), "white".into(), "Arial".into(), false, 1.5, false);
        assert!(run(&[clip(&a, 0.0, 3.0)], &d.join("x.mp4"), &Options { subtitles: Some(bad), ..Options::default() }).is_err(), "geçersiz SRT reddedilir");
        let evil: SubtitleSpec = (srt.into(), 8.0, "bottom".into(), "white".into(), "Evil,Outline=99".into(), false, 1.5, false);
        assert!(run(&[clip(&a, 0.0, 3.0)], &d.join("y.mp4"), &Options { subtitles: Some(evil), ..Options::default() }).is_err(), "yazı tipi beyaz listede değil");
        assert!(!d.join("x.mp4").exists() && !d.join("y.mp4").exists() && no_temp_left(&d));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn extra_audio_tracks_are_mixed_without_re_encoding_the_video() {
        if !ffmpeg_ok() { return; }
        let d = dir("miks");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 3, true);
        let music = d.join("müzik.wav");
        assert!(Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3,volume=3"]).arg(&music).output().unwrap().status.success());
        let out = d.join("miksli.mp4");
        let track: Track = (music.to_string_lossy().into(), 1.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0);
        let msg = run(&[clip(&a, 0.0, 3.0)], &out, &Options { mix: Some((1.0, vec![track.clone()], 0.5)), ..Options::default() }).unwrap();
        assert!(msg.contains("ses miksi uygulandı"), "{msg}");
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        assert!(audio && video && (duration - 3.0).abs() < 0.4);
        assert!(no_temp_left(&d));
        let bad_gain = run(&[clip(&a, 0.0, 3.0)], &d.join("k.mp4"), &Options { mix: Some((5.0, vec![track], 0.0)), ..Options::default() });
        assert!(bad_gain.is_err() && !d.join("k.mp4").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn portrait_output_letterboxes_landscape_sources() {
        if !ffmpeg_ok() { return; }
        let d = dir("dikey");
        let a = d.join("yatay.mp4"); fixture(&a, "640x360", 25, 2, true);
        let out = d.join("dikey.mp4");
        run(&[clip(&a, 0.0, 1.5)], &out, &Options { width: 1080, height: 1920, ..Options::default() }).unwrap();
        assert_eq!(probe_size(out.to_str().unwrap()).unwrap(), (1080, 1920));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn cancel_flag_stops_the_render_and_cleans_up() {
        if !ffmpeg_ok() { return; }
        let d = dir("iptal");
        let a = d.join("a.mp4"); fixture(&a, "640x360", 25, 3, true);
        let out = d.join("iptal.mp4");
        let err = render(&[clip(&a, 0.0, 3.0)], out.to_str().unwrap(), &Options::default(), &AtomicBool::new(true), &mut |_| {}).unwrap_err();
        assert!(err.contains("iptal"), "{err}");
        assert!(!out.exists() && no_temp_left(&d), "geçici klasör temizlenmeli");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn invalid_requests_are_rejected_before_any_work() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecersiz");
        let a = d.join("a.mp4"); fixture(&a, "320x240", 25, 2, true);
        let p: String = a.to_string_lossy().into();
        let out = d.join("o.mp4");
        let ok = |clips: &[Clip], w, h, f| run(clips, &out, &Options { width: w, height: h, fps: f, ..Options::default() });
        assert!(ok(&[], 1280, 720, 30).is_err());
        assert!(ok(&[(p.clone(), 1.0, 1.0)], 1280, 720, 30).unwrap_err().contains("geçersiz"));
        assert!(ok(&[(p.clone(), -1.0, 1.0)], 1280, 720, 30).is_err());
        assert!(ok(&[(p.clone(), 0.0, 99.0)], 1280, 720, 30).unwrap_err().contains("aşıyor"));
        assert!(ok(&[(p.clone(), 0.0, f64::NAN)], 1280, 720, 30).is_err());
        assert!(ok(&[("yok.mp4".into(), 0.0, 1.0)], 1280, 720, 30).unwrap_err().contains("bulunamadı"));
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 1281, 720, 30).is_err(), "tek sayılı boyut");
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 64, 64, 30).is_err(), "çok küçük");
        assert!(ok(&[(p.clone(), 0.0, 1.0)], 1280, 720, 29).is_err(), "kare hızı beyaz listede değil");
        assert!(run(&[(p.clone(), 0.0, 1.0)], &d.join("o.mkv"), &Options::default()).is_err(), "MP4 olmayan çıktı");
        assert!(run(&[(p.clone(), 0.0, 1.0)], &a, &Options::default()).is_err(), "çıktı = kaynak");
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
            clips.push(clip(&p, 0.0, 200.0));
        }
        println!("STRES fixture süresi: {:.1} sn", started.elapsed().as_secs_f64());
        let out = d.join("stres.mp4");
        let t = std::time::Instant::now();
        let mut last = 0.0;
        let o = Options { width: 1920, height: 1080, ..Options::default() };
        let msg = render(&clips, out.to_str().unwrap(), &o, &AtomicBool::new(false), &mut |p| last = p).unwrap();
        let secs = t.elapsed().as_secs_f64();
        let (duration, audio, video) = probe(out.to_str().unwrap()).unwrap();
        let size_mb = fs::metadata(&out).unwrap().len() as f64 / 1_048_576.0;
        println!("STRES sonuç: {msg}");
        println!("STRES render süresi: {secs:.1} sn ({:.2}× gerçek zamanlı), çıktı {duration:.1} sn, {size_mb:.1} MB, son ilerleme %{last}", duration / secs);
        assert!(audio && video && (duration - 600.0).abs() < 1.5);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn filter_graph_chains_cuts_and_crossfades_in_order_with_color_and_subtitles() {
        let clips: Vec<Clip> = vec![("a".into(), 0.0, 2.0), ("b".into(), 1.0, 3.5), ("c".into(), 0.0, 4.0)];
        let o = Options { adjusts: vec![(0.0, 1.0, 1.0), (0.2, 1.1, 0.9), (0.0, 1.0, 1.0)], ..Options::default() };
        let plan = Plan { has_audio: vec![true, false, true], joins: vec![("fade".into(), 0.5), ("cut".into(), 0.0)], adjusts: o.adjusts.clone(), expected: 8.0 };
        let g = filter_graph(&clips, &plan, &o, Some("subtitles=sub.srt:force_style='X'"));
        assert!(g.contains("[v0][v1]xfade=transition=fade:duration=0.500:offset=1.500[j1v]"), "{g}");
        assert!(g.contains("[a0][a1]acrossfade=d=0.500[j1a]"));
        assert!(g.contains("[j1v][j1a][v2][a2]concat=n=2:v=1:a=1[j2v][j2a]"));
        assert!(g.contains("anullsrc=r=48000:cl=stereo,atrim=duration=2.500,asetpts=PTS-STARTPTS,aformat"));
        assert!(g.contains("setsar=1,eq=brightness=0.200:contrast=1.100:saturation=0.900,format=yuv420p[v1]"));
        assert!(!g.contains("[v0]trim") || !g.split(";").next().unwrap().contains("eq="), "varsayılan ayar filtre eklememeli");
        assert!(g.ends_with("[j2v]subtitles=sub.srt:force_style='X'[outv];[j2a]anull[outa]"));
        let single = filter_graph(&clips[..1], &Plan { has_audio: vec![true], joins: vec![], adjusts: vec![(0.0, 1.0, 1.0)], expected: 2.0 }, &Options::default(), None);
        assert!(single.ends_with("[v0]null[outv];[a0]anull[outa]"), "{single}");
    }
}
