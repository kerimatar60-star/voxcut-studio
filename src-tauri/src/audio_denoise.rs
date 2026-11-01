use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

use crate::audio_mix::probe;

/// İki ses temizleme yöntemi vardır; ikisi de kaynak dosyayı değiştirmez.
/// - `classic`: model gerektirmez; FFmpeg `highpass` (uğultu) + `afftdn` (FFT gürültü azaltma) + isteğe bağlı `loudnorm` (EBU R128).
/// - `rnnoise`: yapay zekâ (RNNoise, tekrarlayan sinir ağı) tabanlı; FFmpeg `arnndn` süzgeci küçük bir model dosyasıyla çalışır.
///   Model (~300 KB) pakette gelmez; kullanıcı onayıyla, sabit bir adresten iner ve boyut + SHA-256 ile doğrulanır.
const MAX_PREVIEW_SECS: f64 = 60.0;

/// RNNoise modelleri (GregorR/rnnoise-models; yazar "hiçbir parçası telif hakkına tabi değildir" diyor). Adresler tek bir commit'e sabitlenmiştir.
#[derive(Debug)]
struct RnnModel { id: &'static str, file: &'static str, url: &'static str, size: u64, sha256: &'static str, label: &'static str }

const RNN_MODELS: [RnnModel; 2] = [
    RnnModel {
        id: "konusma", file: "sh.rnnn",
        url: "https://raw.githubusercontent.com/GregorR/rnnoise-models/3eee541a283fd3b8f81b85b1748e3b9ccbefa04d/somnolent-hogwash-2018-09-01/sh.rnnn",
        size: 297_646, sha256: "70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0",
        label: "Konuşma kaydı (önerilen): kayıt gürültüsü altındaki konuşma",
    },
    RnnModel {
        id: "genel", file: "mp.rnnn",
        url: "https://raw.githubusercontent.com/GregorR/rnnoise-models/3eee541a283fd3b8f81b85b1748e3b9ccbefa04d/marathon-prescription-2018-08-29/mp.rnnn",
        size: 296_861, sha256: "4e84a448a4baf937992aaf4d10c8258007ec5d24219b6647dfd5fb4b563ad231",
        label: "Genel ses: her türlü ortam gürültüsü",
    },
];

static AI_CANCEL: AtomicBool = AtomicBool::new(false);

fn rnn_model(id: &str) -> Result<&'static RnnModel, String> { RNN_MODELS.iter().find(|m| m.id == id).ok_or_else(|| "Bilinmeyen yapay zekâ modeli.".to_string()) }

fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| format!("Uygulama veri klasörü bulunamadı: {e}"))?.join("denoise").join("models"))
}

fn installed(dir: &Path, m: &RnnModel) -> bool { fs::metadata(dir.join(m.file)).is_ok_and(|md| md.is_file() && md.len() == m.size) }

/// Önizleme dosyalarının tutulduğu uygulamaya ait geçici klasör (yalnız bu klasördeki `onizleme-*.wav` dosyaları temizlenir).
fn preview_dir() -> PathBuf { std::env::temp_dir().join("voxcut-onizleme") }

pub(crate) fn format_of(format: &str) -> Result<(&'static str, &'static [&'static str]), String> {
    Ok(match format {
        "wav" => ("wav", &["-c:a", "pcm_s16le"]),
        "mp3" => ("mp3", &["-c:a", "libmp3lame", "-b:a", "192k"]),
        "flac" => ("flac", &["-c:a", "flac"]),
        _ => return Err("Desteklenmeyen çıktı biçimi (wav, mp3, flac).".into()),
    })
}

/// `strength` 0..1 → afftdn `nr` (6..30 dB azaltma); `noise_floor` dB → afftdn `nf` (gerçek gürültü tabanı).
/// Gürültü izleme (`tn`) bilerek kapalıdır: sabit gürültüde ölçülen tabanla çok daha etkilidir (deneyle doğrulandı).
/// Güç 0 ve tüm seçenekler kapalıysa filtre zinciri boş kalır (olduğu gibi kopya).
fn build_filter(strength: f64, noise_floor: f64, highpass: bool, normalize: bool) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if highpass { parts.push("highpass=f=80".into()); }
    if strength > 0.0 { parts.push(format!("afftdn=nr={:.1}:nf={:.1}:tn=0", 6.0 + 24.0 * strength.clamp(0.0, 1.0), noise_floor)); }
    if normalize { parts.push("loudnorm=I=-16:TP=-1.5:LRA=11".into()); }
    if parts.is_empty() { None } else { Some(parts.join(",")) }
}

/// Yapay zekâ (RNNoise) zinciri: `highpass` → `arnndn` (model dosyası çalışma klasörüne göre, bu yüzden Windows yol kaçışı gerekmez)
/// → isteğe bağlı `loudnorm`. `strength` 0..1 doğrudan `arnndn` karışım oranıdır (0 = hiç uygulanmaz).
fn build_filter_ai(strength: f64, model_file: &str, highpass: bool, normalize: bool) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if highpass { parts.push("highpass=f=80".into()); }
    if strength > 0.0 { parts.push(format!("arnndn=m={model_file}:mix={:.2}", strength.clamp(0.0, 1.0))); }
    if normalize { parts.push("loudnorm=I=-16:TP=-1.5:LRA=11".into()); }
    if parts.is_empty() { None } else { Some(parts.join(",")) }
}

/// Gürültü tabanı tahmini (dB): 100 ms'lik pencerelerin RMS düzeylerinin %10'luk dilimi (en sessiz kısımlar) + 5 dB
/// (ölçüm 16 kHz'de yapıldığı için tam bantta gürültü daha yüksektir). Dijital sessizlik pencereleri atlanır; ölçülemezse -45 dB.
fn estimate_noise_floor(input: &str, start: f64, duration: f64) -> f64 {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-nostdin", "-v", "error"]);
    if start > 0.0 { cmd.args(["-ss", &format!("{start:.3}")]); }
    cmd.arg("-i").arg(input);
    if duration > 0.0 { cmd.args(["-t", &format!("{duration:.3}")]); }
    cmd.args(["-vn", "-map", "0:a:0", "-af", "aresample=16000,astats=metadata=1:reset=1:length=0.1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]);
    let Ok(out) = cmd.output() else { return -45.0 };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut levels: Vec<f64> = text.lines().filter_map(|l| l.split("RMS_level=").nth(1)).filter_map(|v| v.trim().parse::<f64>().ok()).filter(|v| v.is_finite() && *v > -110.0).collect();
    if levels.len() < 5 { return -45.0; }
    levels.sort_by(|a, b| a.total_cmp(b));
    (levels[levels.len() / 10] + 5.0).clamp(-70.0, -25.0)
}

/// FFmpeg `volumedetect` ile (ortalama, tepe) dB.
fn levels(path: &str) -> Option<(f64, f64)> {
    let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-i", path, "-af", "volumedetect", "-f", "null", "-"]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stderr).to_string();
    let grab = |key: &str| text.lines().find(|l| l.contains(key)).and_then(|l| l.split(key).nth(1)).and_then(|v| v.trim().trim_end_matches(" dB").parse::<f64>().ok());
    Some((grab("mean_volume:")?, grab("max_volume:")?))
}

struct Request<'a> {
    input: &'a str, output: &'a str, strength: f64, highpass: bool, normalize: bool, start: f64, duration: f64, format: &'a str,
    /// "classic" veya "rnnoise"; rnnoise için model kimliği ve modellerin bulunduğu klasör gerekir.
    engine: &'a str, model: &'a str, model_dir: Option<&'a Path>,
}

fn process(r: &Request) -> Result<String, String> {
    let (ext, codec) = format_of(r.format)?;
    let ai_model = match r.engine {
        "classic" => None,
        "rnnoise" => {
            let m = rnn_model(r.model)?;
            let dir = r.model_dir.ok_or("Model klasörü bulunamadı.")?;
            if r.strength > 0.0 && !installed(dir, m) { return Err("Yapay zekâ modeli kurulu değil. Önce 'Modeli indir' düğmesini kullan.".into()); }
            Some((m, dir))
        }
        _ => return Err("Bilinmeyen temizleme yöntemi (classic, rnnoise).".into()),
    };
    if !Path::new(r.input).is_absolute() || !Path::new(r.input).is_file() { return Err("Kaynak dosya bulunamadı.".into()); }
    if !r.strength.is_finite() || !(0.0..=1.0).contains(&r.strength) { return Err("Temizleme gücü 0 ile 1 arasında olmalı.".into()); }
    if !r.start.is_finite() || r.start < 0.0 || !r.duration.is_finite() || r.duration < 0.0 || r.duration > MAX_PREVIEW_SECS { return Err(format!("Örnek aralığı geçersiz (başlangıç ≥ 0, süre 0–{MAX_PREVIEW_SECS} sn).")); }
    let target = Path::new(r.output);
    if !target.is_absolute() || target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case(ext)) { return Err(format!("Yeni bir .{ext} dosya adı seçin; mevcut dosyalar korunur.")); }
    if r.output.eq_ignore_ascii_case(r.input) { return Err("Çıktı dosyası kaynakla aynı olamaz.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (source_duration, has_audio, _) = probe(r.input)?;
    if !has_audio { return Err("Kaynakta ses akışı yok.".into()); }
    if r.start >= source_duration { return Err("Başlangıç kaynak süresinin dışında.".into()); }
    let expected = if r.duration > 0.0 { r.duration.min(source_duration - r.start) } else { source_duration - r.start };

    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-dn-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join(format!("out.{ext}"));
    let result = (|| {
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-hide_banner", "-nostdin", "-n"]);
        if r.start > 0.0 { cmd.args(["-ss", &format!("{:.3}", r.start)]); }
        cmd.arg("-i").arg(r.input);
        if r.duration > 0.0 { cmd.args(["-t", &format!("{:.3}", r.duration)]); }
        cmd.args(["-vn", "-map", "0:a:0"]);
        let filter = match ai_model {
            Some((m, dir)) => { cmd.current_dir(dir); build_filter_ai(r.strength, m.file, r.highpass, r.normalize) }
            None => {
                let noise_floor = if r.strength > 0.0 { estimate_noise_floor(r.input, r.start, r.duration) } else { -45.0 };
                build_filter(r.strength, noise_floor, r.highpass, r.normalize)
            }
        };
        if let Some(filter) = filter { cmd.args(["-af", &filter]); }
        let out = cmd.args(codec).arg(&temp).output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !out.status.success() { return Err(format!("Ses temizleme hatası: {}", String::from_utf8_lossy(&out.stderr).chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>())); }
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if !audio || video || (actual - expected).abs() > 0.3 { return Err(format!("Çıktı doğrulaması başarısız (süre {actual:.2} sn, beklenen {expected:.2} sn).")); }
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        let clipping = levels(r.output).is_some_and(|(_, peak)| peak > -0.1);
        Ok(format!("Temizlenmiş ses kaydedildi ({:.1} sn): {}{}", actual, r.output, if clipping { " ⚠ Tepe seviyesi 0 dB'ye dayandı; kırpılma olabilir, 'Normalleştir'i aç veya gücü azalt." } else { "" }))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

/// `duration` > 0 ise yalnız `start`'tan itibaren o kadar saniye işlenir (A/B örneği). Çıktı: wav / mp3 / flac.
// Tauri komut bağımsız değişkenleri arayüzden adıyla tek tek gelir; bu yüzden düz parametre listesi kullanılır.
/// `engine`: "classic" (varsayılan) veya "rnnoise" (yapay zekâ; `model` = "konusma" | "genel").
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn denoise_audio(app: tauri::AppHandle, input_path: String, output_path: String, strength: f64, highpass: bool, normalize: bool, start: f64, duration: f64, format: String, engine: Option<String>, model: Option<String>) -> Result<String, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let engine = engine.unwrap_or_else(|| "classic".into());
        let model = model.unwrap_or_else(|| "konusma".into());
        process(&Request { input: &input_path, output: &output_path, strength, highpass, normalize, start, duration, format: &format, engine: &engine, model: &model, model_dir: Some(&dir) })
    }).await.map_err(|e| e.to_string())?
}

/// Yapay zekâ modellerinin kurulu olup olmadığı (arayüz: kimlik, etiket, boyut, kurulu mu).
#[tauri::command]
pub async fn denoise_ai_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || serde_json::json!({
        "models": RNN_MODELS.iter().map(|m| serde_json::json!({ "id": m.id, "label": m.label, "size": m.size, "installed": installed(&dir, m) })).collect::<Vec<_>>(),
    })).await.map_err(|e| e.to_string())
}

/// Seçilen modeli resmî kaynaktan indirir (yalnız kullanıcı düğmeye bastığında); boyut + SHA-256 doğrulanır.
#[tauri::command]
pub async fn denoise_ai_install(app: tauri::AppHandle, model: String) -> Result<String, String> {
    AI_CANCEL.store(false, Ordering::SeqCst);
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let m = rnn_model(&model)?;
        fs::create_dir_all(&dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        if installed(&dir, m) { return Ok("Model zaten kurulu.".to_string()); }
        crate::asr::download(m.url, &dir.join(m.file), m.size, m.sha256, &AI_CANCEL, &mut |_| {})?;
        Ok("Model indirildi ve doğrulandı.".to_string())
    }).await.map_err(|e| e.to_string())?
}

/// A/B önizleme için uygulamaya ait geçici klasörü hazırlar, eski önizlemeleri temizler (yalnız `onizleme-*.wav`) ve yolunu verir.
#[tauri::command]
pub async fn denoise_preview_dir() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = preview_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Önizleme klasörü oluşturulamadı: {e}"))?;
        if let Ok(entries) = fs::read_dir(&dir) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("onizleme-") && name.ends_with(".wav") && e.file_type().is_ok_and(|t| t.is_file()) { let _ = fs::remove_file(e.path()); }
            }
        }
        dir.to_str().map(str::to_string).ok_or_else(|| "Önizleme yolu okunamadı.".to_string())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ffmpeg_ok() -> bool { Command::new("ffmpeg").arg("-version").output().is_ok() }
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut temizle {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    /// Gerçekçi "konuşma + oda gürültüsü" senaryosu (3 sn): ilk 1,5 sn yalnız hafif gürültü (≈ -45 dB),
    /// sonraki 1,5 sn aynı gürültü + yüksek 440 Hz ton ("konuşma").
    fn noise_then_tone(path: &Path) {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y",
            "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.01:duration=1.5:sample_rate=48000",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1.5:sample_rate=48000,volume=3",
            "-f", "lavfi", "-i", "anoisesrc=color=white:amplitude=0.01:duration=1.5:sample_rate=48000",
            "-filter_complex", "[1:a][2:a]amix=inputs=2:normalize=0[t];[0:a][t]concat=n=2:v=0:a=1"]).arg(path).output().unwrap();
        assert!(out.status.success(), "fixture üretilemedi: {}", String::from_utf8_lossy(&out.stderr));
    }
    /// Belirli bir aralığın ortalama düzeyi (dB).
    fn mean_between(path: &str, start: f64, secs: f64) -> f64 {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-ss", &start.to_string(), "-t", &secs.to_string(), "-i", path, "-af", "volumedetect", "-f", "null", "-"]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).to_string();
        text.lines().find(|l| l.contains("mean_volume:")).and_then(|l| l.split("mean_volume:").nth(1)).and_then(|v| v.trim().trim_end_matches(" dB").parse().ok()).expect("volumedetect çıktısı yok")
    }
    fn req<'a>(input: &'a str, output: &'a str) -> Request<'a> { Request { input, output, strength: 1.0, highpass: false, normalize: false, start: 0.0, duration: 0.0, format: "wav", engine: "classic", model: "konusma", model_dir: None } }

    #[test]
    fn ai_filter_chain_uses_a_relative_model_name_and_the_mix_amount() {
        assert_eq!(build_filter_ai(0.0, "sh.rnnn", false, false), None, "güç 0: süzgeç yok");
        assert_eq!(build_filter_ai(1.0, "sh.rnnn", false, false).unwrap(), "arnndn=m=sh.rnnn:mix=1.00");
        assert_eq!(build_filter_ai(0.6, "mp.rnnn", true, true).unwrap(), "highpass=f=80,arnndn=m=mp.rnnn:mix=0.60,loudnorm=I=-16:TP=-1.5:LRA=11");
        assert!(build_filter_ai(5.0, "sh.rnnn", false, false).unwrap().contains("mix=1.00"), "karışım 1'e kırpılır");
    }

    #[test]
    fn model_catalog_is_consistent_and_pinned() {
        let mut ids = std::collections::HashSet::new();
        for m in &RNN_MODELS {
            assert!(ids.insert(m.id), "kimlikler benzersiz olmalı");
            assert!(m.url.starts_with("https://raw.githubusercontent.com/GregorR/rnnoise-models/"), "yalnız resmî kaynak");
            assert!(m.url.contains("/3eee541a283fd3b8f81b85b1748e3b9ccbefa04d/"), "adres tek bir commit'e sabit olmalı (master değil)");
            assert!(m.url.ends_with(m.file) && m.file.ends_with(".rnnn") && !m.file.contains(['/', '\\', ':', ' ', ',']), "dosya adı süzgeç seçeneğine güvenle girmeli");
            assert_eq!(m.sha256.len(), 64);
            assert!(m.sha256.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
            assert!((100_000..2_000_000).contains(&m.size));
        }
        assert!(rnn_model("konusma").is_ok() && rnn_model("genel").is_ok());
        assert!(rnn_model("../x").unwrap_err().contains("Bilinmeyen"));
    }

    #[test]
    fn ai_requests_are_rejected_without_side_effects() {
        if !ffmpeg_ok() { return; }
        let d = dir("ai-gecersiz");
        let src = d.join("k.wav"); noise_then_tone(&src);
        let s = src.to_str().unwrap();
        let o = |n: &str| d.join(n).to_string_lossy().to_string();
        let empty = d.join("modeller"); fs::create_dir_all(&empty).unwrap();
        assert!(process(&Request { engine: "rnnoise", model_dir: Some(&empty), ..req(s, &o("a.wav")) }).unwrap_err().contains("kurulu değil"), "model yoksa açık hata");
        assert!(process(&Request { engine: "rnnoise", model: "../../x", model_dir: Some(&empty), ..req(s, &o("b.wav")) }).unwrap_err().contains("Bilinmeyen"));
        assert!(process(&Request { engine: "rnnoise", model_dir: None, ..req(s, &o("c.wav")) }).is_err());
        assert!(process(&Request { engine: "derin", ..req(s, &o("d.wav")) }).unwrap_err().contains("Bilinmeyen temizleme"));
        // yarım/yanlış boyutlu model dosyası kurulu sayılmaz
        fs::write(empty.join("sh.rnnn"), b"bozuk").unwrap();
        assert!(!installed(&empty, &RNN_MODELS[0]));
        assert!(process(&Request { engine: "rnnoise", model_dir: Some(&empty), ..req(s, &o("e.wav")) }).unwrap_err().contains("kurulu değil"));
        assert!(fs::read_dir(&d).unwrap().all(|e| { let n = e.unwrap().file_name().to_string_lossy().to_string(); n == "k.wav" || n == "modeller" }), "çıktı/geçici dosya oluşmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    /// GERÇEK deneme (ağ + gerçek model): `cargo test --release denoise_ai_gercek -- --ignored --nocapture`.
    /// Windows SAPI ile üretilen konuşmaya sabit gürültü karıştırılır; yalnız-gürültü kısmı düşmeli, konuşma korunmalı.
    #[test]
    #[ignore = "ağ ve gerçek model indirir"]
    fn denoise_ai_gercek() {
        if !ffmpeg_ok() { return; }
        let d = dir("ai-gercek");
        let models = d.join("modeller"); fs::create_dir_all(&models).unwrap();
        for m in &RNN_MODELS {
            crate::asr::download(m.url, &models.join(m.file), m.size, m.sha256, &AtomicBool::new(false), &mut |_| {}).expect("model indirilemedi");
            assert!(installed(&models, m));
        }
        let speech = d.join("konusma.wav");
        let ps = format!("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('{}'); $s.Speak('Hello, this is a test of the noise cleaning feature of the voice cut studio. The weather is sunny today and the recording is quiet.'); $s.Dispose()", speech.display());
        let out = Command::new("powershell").args(["-NoProfile", "-Command", &ps]).output().unwrap();
        assert!(out.status.success() && speech.exists(), "SAPI ile konuşma üretilemedi: {}", String::from_utf8_lossy(&out.stderr));
        let noisy = d.join("gurultulu.wav");
        let mix = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-i"]).arg(&speech)
            .args(["-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.03:duration=9:sample_rate=48000",
                   "-filter_complex", "[0:a]aresample=48000,adelay=2000:all=1,apad=whole_dur=9[s];[s][1:a]amix=inputs=2:normalize=0,atrim=0:9"]).arg(&noisy).output().unwrap();
        assert!(mix.status.success(), "{}", String::from_utf8_lossy(&mix.stderr));
        let n = noisy.to_str().unwrap();
        let (noise_before, speech_before) = (mean_between(n, 0.2, 1.6), mean_between(n, 2.3, 3.0));
        let mut report = format!("önce: gürültü {noise_before:.1} dB, konuşma {speech_before:.1} dB\n");
        for model in ["konusma", "genel"] {
            let o = d.join(format!("temiz-{model}.wav"));
            let msg = process(&Request { engine: "rnnoise", model, model_dir: Some(&models), ..req(n, o.to_str().unwrap()) }).unwrap();
            assert!(msg.contains("Temizlenmiş ses kaydedildi"), "{msg}");
            let (noise_after, speech_after) = (mean_between(o.to_str().unwrap(), 0.2, 1.6), mean_between(o.to_str().unwrap(), 2.3, 3.0));
            report += &format!("{model}: gürültü {noise_after:.1} dB ({:+.1}), konuşma {speech_after:.1} dB ({:+.1})\n", noise_after - noise_before, speech_after - speech_before);
            assert!(noise_after < noise_before - 10.0, "{model}: yalnız gürültü bölümü en az 10 dB düşmeli: {noise_before:.1} → {noise_after:.1}");
            assert!(speech_after > speech_before - 9.0, "{model}: konuşma çok bastırılmamalı: {speech_before:.1} → {speech_after:.1}");
        }
        eprintln!("{report}");
        let _ = fs::write(std::env::temp_dir().join("voxcut_denoise_ai_rapor.txt"), &report);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn filter_chain_follows_the_options_in_order() {
        assert_eq!(build_filter(0.0, -45.0, false, false), None);
        assert_eq!(build_filter(0.0, -45.0, true, false).unwrap(), "highpass=f=80");
        assert_eq!(build_filter(1.0, -45.0, false, false).unwrap(), "afftdn=nr=30.0:nf=-45.0:tn=0");
        assert_eq!(build_filter(0.5, -52.3, false, false).unwrap(), "afftdn=nr=18.0:nf=-52.3:tn=0");
        assert_eq!(build_filter(0.5, -45.0, true, true).unwrap(), "highpass=f=80,afftdn=nr=18.0:nf=-45.0:tn=0,loudnorm=I=-16:TP=-1.5:LRA=11");
        assert!(build_filter(9.0, -45.0, false, false).unwrap().contains("nr=30.0"), "güç 0..1'e kırpılır");
    }

    #[test]
    fn estimates_the_noise_floor_from_the_quietest_windows() {
        if !ffmpeg_ok() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let d = dir("tahmin");
        let src = d.join("k.wav"); noise_then_tone(&src);
        let nf = estimate_noise_floor(src.to_str().unwrap(), 0.0, 0.0);
        assert!((-55.0..=-40.0).contains(&nf), "gürültü tabanı yaklaşık -45 dB olmalı: {nf}");
        assert_eq!(estimate_noise_floor("yok.wav", 0.0, 0.0), -45.0, "ölçülemezse varsayılan");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn lowers_the_room_noise_but_keeps_the_signal_for_every_format() {
        if !ffmpeg_ok() { return; }
        let d = dir("gurultu");
        let src = d.join("gürültü ğ.wav"); noise_then_tone(&src);
        let s = src.to_str().unwrap();
        let (noise_before, tone_before) = (mean_between(s, 0.0, 1.2), mean_between(s, 1.7, 1.0));
        for (format, ext) in [("wav", "wav"), ("flac", "flac"), ("mp3", "mp3")] {
            let out = d.join(format!("temiz.{ext}"));
            let msg = process(&Request { format, ..req(s, out.to_str().unwrap()) }).unwrap();
            assert!(msg.contains("Temizlenmiş ses kaydedildi"), "{msg}");
            let o = out.to_str().unwrap();
            let (noise_after, tone_after) = (mean_between(o, 0.0, 1.2), mean_between(o, 1.7, 1.0));
            assert!(noise_after < noise_before - 8.0, "{format}: yalnız gürültü bölümü en az 8 dB düşmeli: {noise_before:.1} → {noise_after:.1} dB");
            assert!((tone_after - tone_before).abs() < 1.5, "{format}: konuşma/ton bölümü korunmalı: {tone_before:.1} → {tone_after:.1} dB");
            let (dur, audio, video) = probe(o).unwrap();
            assert!(audio && !video && (dur - 3.0).abs() < 0.4);
        }
        assert!(src.exists(), "kaynak değişmemeli");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn strength_scales_the_reduction_and_zero_is_a_passthrough() {
        if !ffmpeg_ok() { return; }
        let d = dir("guc");
        let src = d.join("k.wav"); noise_then_tone(&src);
        let s = src.to_str().unwrap();
        let before = mean_between(s, 0.0, 1.2);
        let run = |name: &str, strength: f64| { let out = d.join(name); process(&Request { strength, ..req(s, out.to_str().unwrap()) }).unwrap(); mean_between(out.to_str().unwrap(), 0.0, 1.2) };
        let (zero, mid, full) = (run("sifir.wav", 0.0), run("orta.wav", 0.5), run("tam.wav", 1.0));
        assert!((zero - before).abs() < 0.6, "güç 0 olduğu gibi kopya olmalı: {before:.1} → {zero:.1}");
        assert!(mid < zero - 3.0, "orta güç belirgin azaltmalı: {zero:.1} → {mid:.1}");
        assert!(full <= mid + 0.5, "tam güç orta güçten daha az azaltmamalı: {mid:.1} → {full:.1}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn preview_slice_has_the_requested_length_and_ab_difference_is_audible() {
        if !ffmpeg_ok() { return; }
        let d = dir("ornek");
        let src = d.join("k.wav"); noise_then_tone(&src);
        let s = src.to_str().unwrap();
        let (clean, raw) = (d.join("temiz.wav"), d.join("ham.wav"));
        process(&Request { start: 0.2, duration: 1.0, ..req(s, clean.to_str().unwrap()) }).unwrap();
        process(&Request { strength: 0.0, start: 0.2, duration: 1.0, ..req(s, raw.to_str().unwrap()) }).unwrap();
        let (dur, ..) = probe(clean.to_str().unwrap()).unwrap();
        assert!((dur - 1.0).abs() < 0.2, "{dur}");
        let (raw_mean, clean_mean) = (mean_between(raw.to_str().unwrap(), 0.0, 0.9), mean_between(clean.to_str().unwrap(), 0.0, 0.9));
        assert!(clean_mean < raw_mean - 8.0, "A/B farkı duyulur olmalı: ham {raw_mean:.1} dB, temiz {clean_mean:.1} dB");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn invalid_requests_are_rejected_without_side_effects() {
        if !ffmpeg_ok() { return; }
        let d = dir("gecersiz");
        let src = d.join("k.wav"); noise_then_tone(&src);
        let s = src.to_str().unwrap();
        let o = |n: &str| d.join(n).to_string_lossy().to_string();
        assert!(process(&Request { format: "ogg", ..req(s, &o("a.ogg")) }).unwrap_err().contains("Desteklenmeyen"));
        assert!(process(&Request { strength: 1.5, ..req(s, &o("b.wav")) }).is_err());
        assert!(process(&Request { strength: f64::NAN, ..req(s, &o("c.wav")) }).is_err());
        assert!(process(&Request { start: -1.0, ..req(s, &o("d.wav")) }).is_err());
        assert!(process(&Request { duration: 999.0, ..req(s, &o("e.wav")) }).is_err());
        assert!(process(&Request { start: 99.0, ..req(s, &o("f.wav")) }).unwrap_err().contains("dışında"));
        assert!(process(&req(s, &o("g.mp3"))).unwrap_err().contains(".wav"), "uzantı biçimle uyuşmalı");
        assert!(process(&req(s, s)).is_err(), "çıktı = kaynak");
        assert!(process(&req("yok.wav", &o("h.wav"))).is_err());
        let silent = d.join("sessiz.mp4");
        let v = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p"]).arg(&silent).output().unwrap();
        assert!(v.status.success());
        assert!(process(&req(silent.to_str().unwrap(), &o("i.wav"))).unwrap_err().contains("ses akışı yok"));
        assert!(fs::read_dir(&d).unwrap().all(|e| { let n = e.unwrap().file_name().to_string_lossy().to_string(); n == "k.wav" || n == "sessiz.mp4" }), "hiçbir çıktı/geçici dosya oluşmamalı");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn preview_dir_is_app_owned_and_cleanup_touches_only_preview_wavs() {
        let dir = preview_dir();
        fs::create_dir_all(&dir).unwrap();
        let (mine, other) = (dir.join("onizleme-test-sil.wav"), dir.join("baska-dosya.txt"));
        fs::write(&mine, b"x").unwrap(); fs::write(&other, b"x").unwrap();
        let path = tauri::async_runtime::block_on(denoise_preview_dir()).unwrap();
        assert_eq!(PathBuf::from(path), dir);
        assert!(!mine.exists(), "eski önizleme temizlenmeli");
        assert!(other.exists(), "başka dosyalara dokunulmamalı");
        let _ = fs::remove_file(&other);
    }
}
