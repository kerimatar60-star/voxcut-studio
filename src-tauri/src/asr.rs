use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::mpsc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

use crate::audio_mix::probe;

/// Yerel Türkçe/çok dilli konuşma tanıma: resmî `whisper.cpp` Windows CPU sürümü + resmî ggml modelleri.
/// Hiçbir şey kurulumla gelmez; motor ve model yalnız kullanıcı "İndir"e bastığında, aşağıdaki sabit adreslerden iner
/// (komutlar dışarıdan URL kabul etmez), boyutu ve SHA-256 özeti doğrulanır. Kaynak medya değişmez.
const ENGINE_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip";
const ENGINE_SIZE: u64 = 8_928_640;
const ENGINE_SHA256: &str = "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb";
const MODEL_URL_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const ENGINE_EXE: &str = "whisper-cli.exe";

struct Model { id: &'static str, file: &'static str, size: u64, sha256: &'static str, label: &'static str }

const MODELS: [Model; 4] = [
    Model { id: "tiny", file: "ggml-tiny.bin", size: 77_691_713, sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21", label: "Tiny (çok hızlı, düşük doğruluk)" },
    Model { id: "base", file: "ggml-base.bin", size: 147_951_465, sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe", label: "Base (hızlı, orta doğruluk)" },
    Model { id: "small", file: "ggml-small.bin", size: 487_601_967, sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b", label: "Small (önerilen: Türkçe için dengeli)" },
    Model { id: "medium", file: "ggml-medium.bin", size: 1_533_763_059, sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208", label: "Medium (en doğru, yavaş, 1,5 GB)" },
];

const LANGUAGES: [&str; 3] = ["tr", "en", "auto"];
const MAX_SRT_BYTES: usize = 8 * 1024 * 1024;

static CANCEL: AtomicBool = AtomicBool::new(false);

pub(crate) struct ModelState { id: String, label: String, size: u64, installed: bool }

pub(crate) struct Status { engine_installed: bool, engine_size: u64, models: Vec<ModelState> }

impl Status {
    /// Arayüze giden JSON (camelCase).
    fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "engineInstalled": self.engine_installed,
            "engineSize": self.engine_size,
            "models": self.models.iter().map(|m| serde_json::json!({ "id": m.id, "label": m.label, "size": m.size, "installed": m.installed })).collect::<Vec<_>>(),
        })
    }
}

fn model_of(id: &str) -> Result<&'static Model, String> { MODELS.iter().find(|m| m.id == id).ok_or_else(|| "Bilinmeyen model.".to_string()) }

fn engine_dir(base: &Path) -> PathBuf { base.join("engine") }
fn models_dir(base: &Path) -> PathBuf { base.join("models") }

/// Motor klasöründe `whisper-cli.exe` dosyasını (en çok 3 düzey derinlikte) bulur.
fn find_engine(dir: &Path, depth: u32) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let kind = entry.file_type().ok()?;
        if kind.is_file() && entry.file_name().to_string_lossy().eq_ignore_ascii_case(ENGINE_EXE) { return Some(entry.path()); }
        if kind.is_dir() && depth < 3 { if let Some(found) = find_engine(&entry.path(), depth + 1) { return Some(found); } }
    }
    None
}

fn sha256_file(path: &Path, cancel: &AtomicBool) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        if cancel.load(Ordering::SeqCst) { return Err("İşlem iptal edildi.".into()); }
        let n = file.read(&mut buffer).map_err(|e| format!("Dosya okunamadı: {e}"))?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

pub(crate) fn status(base: &Path) -> Status {
    let models = MODELS.iter().map(|m| ModelState {
        id: m.id.into(), label: m.label.into(), size: m.size,
        installed: fs::metadata(models_dir(base).join(m.file)).is_ok_and(|md| md.is_file() && md.len() == m.size),
    }).collect();
    Status { engine_installed: engine_dir(base).is_dir() && find_engine(&engine_dir(base), 0).is_some(), engine_size: ENGINE_SIZE, models }
}

/// Sabit HTTPS adresinden `curl.exe` (Windows 10 1803+ ile gelir) ile indirir; kabuk kullanılmaz, yalnız https ve en çok 5 yönlendirme.
/// İlerleme için kısmi dosyanın boyutu izlenir. Bitince boyut + SHA-256 doğrulanır; eşleşmezse dosya silinir.
fn download(url: &str, dest: &Path, size: u64, sha256: &str, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<(), String> {
    let part = dest.with_extension("part");
    let _ = fs::remove_file(&part);
    let mut child = Command::new("curl.exe")
        .args(["--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--tlsv1.2", "--max-redirs", "5", "--connect-timeout", "20", "--retry", "2", "-o"])
        .arg(&part).arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("İndirme aracı (curl.exe) başlatılamadı: {e}"))?;
    let stderr = child.stderr.take();
    let err_thread = std::thread::spawn(move || { let mut text = String::new(); if let Some(mut s) = stderr { let _ = s.read_to_string(&mut text); } text });
    let status = loop {
        if cancel.load(Ordering::SeqCst) { let _ = child.kill(); let _ = child.wait(); let _ = err_thread.join(); let _ = fs::remove_file(&part); return Err("İşlem iptal edildi.".into()); }
        if let Some(s) = child.try_wait().map_err(|e| format!("İndirme beklenemedi: {e}"))? { break s; }
        if let Ok(md) = fs::metadata(&part) { on_progress((md.len() as f64 / size as f64 * 95.0).clamp(0.0, 95.0)); }
        std::thread::sleep(Duration::from_millis(250));
    };
    let errors = err_thread.join().unwrap_or_default();
    if !status.success() { let _ = fs::remove_file(&part); return Err(format!("İndirme başarısız: {}", errors.trim().chars().take(300).collect::<String>())); }
    let actual = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if actual != size { let _ = fs::remove_file(&part); return Err(format!("İndirilen dosyanın boyutu beklenenle uyuşmuyor ({actual} / {size} bayt).")); }
    let digest = match sha256_file(&part, cancel) { Ok(d) => d, Err(e) => { let _ = fs::remove_file(&part); return Err(e); } };
    if digest != sha256 { let _ = fs::remove_file(&part); return Err("SHA-256 doğrulaması başarısız; dosya silindi.".into()); }
    fs::rename(&part, dest).map_err(|e| format!("İndirilen dosya yerine konamadı: {e}"))?;
    on_progress(100.0);
    Ok(())
}

pub(crate) fn install_engine(base: &Path, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    if status(base).engine_installed { return Ok("Whisper motoru zaten kurulu.".into()); }
    fs::create_dir_all(base).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let zip = base.join("engine.zip");
    download(ENGINE_URL, &zip, ENGINE_SIZE, ENGINE_SHA256, cancel, on_progress)?;
    let staging = base.join("engine-kurulum");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let result = (|| {
        // Windows ile gelen bsdtar (tar.exe) zip arşivlerini açar ve `..` içeren yolları reddeder.
        let out = Command::new("tar.exe").arg("-xf").arg(&zip).arg("-C").arg(&staging).output().map_err(|e| format!("Arşiv açıcı (tar.exe) başlatılamadı: {e}"))?;
        if !out.status.success() { return Err(format!("Arşiv açılamadı: {}", String::from_utf8_lossy(&out.stderr).trim().chars().take(300).collect::<String>())); }
        let exe = find_engine(&staging, 0).ok_or("Arşivde whisper-cli.exe bulunamadı.")?;
        let probe = Command::new(&exe).arg("-h").stdin(Stdio::null()).output().map_err(|e| format!("Whisper motoru çalıştırılamadı: {e}"))?;
        if !probe.status.success() && probe.stdout.is_empty() && probe.stderr.is_empty() { return Err("Whisper motoru çalıştırılamadı (çıktı yok).".into()); }
        let target = engine_dir(base);
        let _ = fs::remove_dir_all(&target);
        fs::rename(&staging, &target).map_err(|e| format!("Motor klasörü yerine konamadı: {e}"))?;
        Ok("Whisper motoru kuruldu (CPU, resmî whisper.cpp sürümü).".to_string())
    })();
    let _ = fs::remove_file(&zip);
    let _ = fs::remove_dir_all(&staging);
    result
}

pub(crate) fn install_model(base: &Path, id: &str, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    let model = model_of(id)?;
    let dir = models_dir(base);
    fs::create_dir_all(&dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let dest = dir.join(model.file);
    if fs::metadata(&dest).is_ok_and(|m| m.len() == model.size) { return Ok(format!("{} modeli zaten kurulu.", model.id)); }
    download(&format!("{MODEL_URL_BASE}{}", model.file), &dest, model.size, model.sha256, cancel, on_progress)?;
    Ok(format!("{} modeli indirildi ve doğrulandı.", model.id))
}

/// whisper.cpp ilerleme satırından yüzdeyi okur ("... progress =  35%").
pub(crate) fn parse_progress(line: &str) -> Option<f64> {
    let value = line.split("progress =").nth(1)?.trim().trim_end_matches('%').trim();
    value.parse::<f64>().ok().filter(|v| v.is_finite()).map(|v| v.clamp(0.0, 100.0))
}

/// Çıktının gerçekten SRT olduğunu ve makul boyutta olduğunu denetler.
pub(crate) fn validate_srt(text: &str) -> Result<(), String> {
    if text.len() > MAX_SRT_BYTES { return Err("Altyazı çıktısı beklenenden büyük.".into()); }
    if !text.contains("-->") { return Err("Konuşma bulunamadı (çıktıda altyazı satırı yok). Dil ve model seçimini kontrol edin.".into()); }
    Ok(())
}

pub(crate) fn transcribe(base: &Path, input: &str, model_id: &str, language: &str, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    let model = model_of(model_id)?;
    if !LANGUAGES.contains(&language) { return Err("Desteklenmeyen dil (tr, en, auto).".into()); }
    let state = status(base);
    if !state.engine_installed { return Err("Önce Whisper motorunu indirin.".into()); }
    if !state.models.iter().any(|m| m.id == model.id && m.installed) { return Err(format!("'{}' modeli kurulu değil; önce indirin.", model.id)); }
    let source = Path::new(input);
    if !source.is_absolute() || !source.is_file() { return Err("Kaynak dosya bulunamadı.".into()); }
    let (_, has_audio, _) = probe(input)?;
    if !has_audio { return Err("Kaynakta ses akışı yok.".into()); }
    let exe = find_engine(&engine_dir(base), 0).ok_or("Whisper motoru bulunamadı.")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let work = std::env::temp_dir().join(format!("voxcut-asr-{}-{nonce}", std::process::id()));
    fs::create_dir_all(&work).map_err(|e| format!("Geçici klasör oluşturulamadı: {e}"))?;
    let result = (|| {
        let wav = work.join("girdi.wav");
        on_progress(1.0);
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-n", "-i"]).arg(input)
            .args(["-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]).arg(&wav)
            .output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !out.status.success() { return Err(format!("Ses hazırlanamadı: {}", String::from_utf8_lossy(&out.stderr).trim().chars().take(400).collect::<String>())); }
        if cancel.load(Ordering::SeqCst) { return Err("İşlem iptal edildi.".into()); }
        on_progress(5.0);
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
        let mut child = Command::new(&exe)
            .current_dir(&work)
            .args(["-m"]).arg(models_dir(base).join(model.file))
            .args(["-f", "girdi.wav", "-l", language, "-osrt", "-of", "cikti", "-np", "-pp", "-t", &threads.to_string()])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped())
            .spawn().map_err(|e| format!("Whisper başlatılamadı: {e}"))?;
        let stderr = child.stderr.take().ok_or("Whisper çıktısı alınamadı.")?;
        let (tx, rx) = mpsc::channel::<String>();
        let reader = std::thread::spawn(move || { for line in BufReader::new(stderr).lines().map_while(Result::ok) { if tx.send(line).is_err() { break; } } });
        let mut tail: Vec<String> = Vec::new();
        let status = loop {
            if cancel.load(Ordering::SeqCst) { let _ = child.kill(); let _ = child.wait(); drop(rx); let _ = reader.join(); return Err("İşlem iptal edildi.".into()); }
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(line) => {
                    if let Some(p) = parse_progress(&line) { on_progress(5.0 + p * 0.94); }
                    else if !line.trim().is_empty() { tail.push(line); if tail.len() > 12 { tail.remove(0); } }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break child.wait().map_err(|e| format!("Whisper beklenemedi: {e}"))?,
            }
        };
        let _ = reader.join();
        if !status.success() { return Err(format!("Whisper hatası: {}", tail.join(" | ").chars().take(600).collect::<String>())); }
        let srt_path = work.join("cikti.srt");
        let bytes = fs::read(&srt_path).map_err(|_| "Whisper altyazı dosyası üretmedi.".to_string())?;
        let text = String::from_utf8(bytes).map_err(|_| "Altyazı çıktısı UTF-8 değil.".to_string())?;
        validate_srt(&text)?;
        on_progress(100.0);
        Ok(text)
    })();
    let _ = fs::remove_dir_all(&work);
    result
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| format!("Uygulama veri klasörü bulunamadı: {e}"))?.join("asr"))
}

fn reporter(app: tauri::AppHandle, phase: &'static str) -> impl FnMut(f64) {
    let mut last = -1.0f64;
    move |pct| { if (pct - last).abs() >= 1.0 { last = pct; let _ = app.emit("asr-progress", serde_json::json!({ "phase": phase, "pct": pct.round() })); } }
}

#[tauri::command]
pub async fn asr_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || status(&base).to_json()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn asr_install_engine(app: tauri::AppHandle) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || install_engine(&base, &CANCEL, &mut reporter(app, "engine"))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn asr_install_model(app: tauri::AppHandle, model: String) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || install_model(&base, &model, &CANCEL, &mut reporter(app, "model"))).await.map_err(|e| e.to_string())?
}

/// Konuşmayı yazıya çevirir ve SRT metnini döndürür (arayüz mevcut altyazı ayrıştırıcısıyla içe alır; dosya yazılmaz).
#[tauri::command]
pub async fn asr_transcribe(app: tauri::AppHandle, input_path: String, model: String, language: String) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || transcribe(&base, &input_path, &model, &language, &CANCEL, &mut reporter(app, "transcribe"))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn asr_cancel() { CANCEL.store(true, Ordering::SeqCst); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_consistent() {
        let mut ids: Vec<&str> = MODELS.iter().map(|m| m.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), MODELS.len());
        for m in &MODELS {
            assert_eq!(m.sha256.len(), 64, "{}", m.id);
            assert!(m.sha256.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()), "{}", m.id);
            assert_eq!(m.file, format!("ggml-{}.bin", m.id));
            assert!(m.size > 10_000_000);
        }
        assert_eq!(ENGINE_SHA256.len(), 64);
        assert!(ENGINE_URL.starts_with("https://github.com/ggml-org/whisper.cpp/releases/download/"));
        assert!(MODEL_URL_BASE.starts_with("https://huggingface.co/"));
    }

    #[test]
    fn unknown_model_and_language_are_rejected() {
        assert!(model_of("../etc").is_err());
        assert!(model_of("small").is_ok());
        let base = std::env::temp_dir().join("voxcut-asr-yok");
        let no = AtomicBool::new(false);
        assert!(transcribe(&base, "C:\\x.wav", "small", "xx", &no, &mut |_| {}).is_err());
        assert!(transcribe(&base, "C:\\x.wav", "nope", "tr", &no, &mut |_| {}).is_err());
        // Motor yokken açık bir yönlendirme mesajı verir.
        assert!(transcribe(&base, "C:\\x.wav", "small", "tr", &no, &mut |_| {}).unwrap_err().contains("motor"));
    }

    #[test]
    fn progress_lines_are_parsed() {
        assert_eq!(parse_progress("whisper_print_progress_callback: progress =  35%"), Some(35.0));
        assert_eq!(parse_progress("progress = 100%"), Some(100.0));
        assert_eq!(parse_progress("progress = abc%"), None);
        assert_eq!(parse_progress("başka bir satır"), None);
    }

    #[test]
    fn srt_output_is_validated() {
        assert!(validate_srt("1\n00:00:00,000 --> 00:00:02,000\nMerhaba\n").is_ok());
        assert!(validate_srt("").is_err());
        assert!(validate_srt(&"a".repeat(MAX_SRT_BYTES + 1)).is_err());
    }

    #[test]
    fn sha256_matches_known_value_and_cancel_stops_it() {
        let dir = std::env::temp_dir().join(format!("voxcut asr özet {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("abc.txt");
        fs::write(&file, b"abc").unwrap();
        assert_eq!(sha256_file(&file, &AtomicBool::new(false)).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(sha256_file(&file, &AtomicBool::new(true)).unwrap_err().contains("iptal"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn status_reflects_files_on_disk() {
        let base = std::env::temp_dir().join(format!("voxcut asr durum {}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        assert!(!status(&base).engine_installed);
        assert!(status(&base).models.iter().all(|m| !m.installed));
        fs::create_dir_all(engine_dir(&base).join("Release")).unwrap();
        fs::write(engine_dir(&base).join("Release").join(ENGINE_EXE), b"x").unwrap();
        fs::create_dir_all(models_dir(&base)).unwrap();
        fs::write(models_dir(&base).join("ggml-tiny.bin"), "kısa".as_bytes()).unwrap(); // eksik/bozuk boyut → kurulu sayılmaz
        let s = status(&base);
        assert!(s.engine_installed);
        assert!(s.models.iter().all(|m| !m.installed));
        let _ = fs::remove_dir_all(&base);
    }

    /// Gerçek uçtan uca deneme (ağ + ~157 MB indirir): `cargo test asr_gercek -- --ignored --nocapture`.
    /// İngilizce SAPI sesi (bu makinede Türkçe ses kurulu değil) → resmî motor + base modeli → SRT.
    #[test]
    #[ignore]
    fn asr_gercek_indir_ve_yaziya_cevir() {
        let base = std::env::temp_dir().join("voxcut-asr-gercek-test");
        let no = AtomicBool::new(false);
        let mut last = 0.0;
        println!("{}", install_engine(&base, &no, &mut |p| last = p).unwrap());
        println!("{}", install_model(&base, "base", &no, &mut |p| last = p).unwrap());
        assert!(status(&base).engine_installed && status(&base).models.iter().any(|m| m.id == "base" && m.installed));
        let dir = base.join("ornek");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let wav = dir.join("konusma.wav");
        let script = format!("Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('{}'); $s.Speak('Hello, this is a test of the voice cut studio subtitle system. The weather is sunny today.'); $s.Dispose()", wav.display());
        let ps = Command::new("powershell").args(["-NoProfile", "-Command", &script]).output().unwrap();
        assert!(ps.status.success(), "{}", String::from_utf8_lossy(&ps.stderr));
        let mut progress = Vec::new();
        let srt = transcribe(&base, wav.to_str().unwrap(), "base", "en", &no, &mut |p| progress.push(p)).unwrap();
        println!("{srt}");
        let lower = srt.to_lowercase();
        assert!(lower.contains("test") && lower.contains("weather"), "beklenen sözcükler yok: {srt}");
        assert!(progress.last().copied() == Some(100.0));
    }
}
