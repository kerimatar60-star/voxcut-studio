use std::{fs, path::Path, process::Command, time::{SystemTime, UNIX_EPOCH}};

use crate::audio_mix::probe;

const MAX_SRT_BYTES: usize = 1_000_000;

/// Altyazı görünümü (hepsi beyaz liste ile doğrulanır): yazı tipi, kalın, kontur kalınlığı ve yarı saydam arka plan kutusu.
#[derive(Debug, Clone)]
struct Look { font: String, bold: bool, outline: f64, boxed: bool }

impl Default for Look {
    fn default() -> Self { Look { font: "Arial".into(), bold: false, outline: 1.5, boxed: false } }
}

/// Yalnız Windows'ta hazır gelen sistem yazı tipleri (uygulamaya yazı tipi dosyası gömülmez; tasarım editöründeki liste ile aynı).
const FONTS: [&str; 9] = ["Arial", "Segoe UI", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Impact", "Courier New"];

/// Yalnız beyaz listedeki değerlerden libass stili üretir; arayüzden ham stil metni kabul edilmez.
/// `size_percent`: yazı boyutu, video yüksekliğinin yüzdesi. libass SRT için 288 birimlik sanal yükseklik kullanır.
fn force_style(size_percent: f64, position: &str, color: &str, look: &Look) -> Result<String, String> {
    if !size_percent.is_finite() || !(2.0..=12.0).contains(&size_percent) { return Err("Yazı boyutu %2 ile %12 arasında olmalı.".into()); }
    let alignment = match position { "bottom" => 2, "middle" => 5, "top" => 8, _ => return Err("Geçersiz altyazı konumu.".into()) };
    let primary = match color { "white" => "&H00FFFFFF", "yellow" => "&H0000FFFF", "cyan" => "&H00FFFF00", "green" => "&H0000FF00", _ => return Err("Geçersiz altyazı rengi.".into()) };
    if !FONTS.contains(&look.font.as_str()) { return Err("Desteklenmeyen yazı tipi.".into()); }
    if !look.outline.is_finite() || !(0.0..=6.0).contains(&look.outline) { return Err("Kontur kalınlığı 0 ile 6 arasında olmalı.".into()); }
    let font_size = size_percent * 2.88;
    let margin = if position == "middle" { 0.0 } else { 3.0 * 2.88 };
    let bold = if look.bold { -1 } else { 0 };
    // Kutu modunda (BorderStyle=3) kutu rengi ve dolgu payı Outline alanlarından gelir; yarı saydam siyah.
    let (border_style, outline, outline_colour, back_colour) = if look.boxed { (3, 3.0, "&H59000000", "&H59000000") } else { (1, look.outline, "&H00000000", "&H00000000") };
    Ok(format!("FontName={},FontSize={font_size:.2},Bold={bold},PrimaryColour={primary},OutlineColour={outline_colour},BackColour={back_colour},BorderStyle={border_style},Outline={outline:.1},Shadow=0,Alignment={alignment},MarginV={margin:.1}", look.font))
}

/// SRT içeriğini doğrular ve ipucu olarak cue sayısını döndürür.
fn validate_srt(srt: &str) -> Result<usize, String> {
    if srt.len() > MAX_SRT_BYTES { return Err("Altyazı verisi çok büyük.".into()); }
    if srt.contains('\0') { return Err("Altyazı verisi geçersiz karakter içeriyor.".into()); }
    let cues = srt.lines().filter(|line| line.contains(" --> ")).count();
    if cues == 0 { return Err("Yakılacak geçerli altyazı bulunamadı.".into()); }
    Ok(cues)
}

fn render(input: String, output: String, srt: String, size_percent: f64, position: String, color: String, look: Look) -> Result<String, String> {
    let source = Path::new(&input);
    if !source.is_absolute() || !source.is_file() { return Err("Kaynak video bulunamadı.".into()); }
    let cues = validate_srt(&srt)?;
    let style = force_style(size_percent, &position, &color, &look)?;
    let target = Path::new(&output);
    if target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("mp4")) { return Err("Yeni bir MP4 dosya adı seçin; mevcut dosyalar korunur.".into()); }
    if output.to_lowercase() == input.to_lowercase() { return Err("Kaynak video ile hedef dosya aynı olamaz.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (duration, has_audio, has_video) = probe(&input)?;
    if !has_video { return Err("Seçilen kaynak video içermiyor.".into()); }

    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-sub-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join("out.mp4");
    let result = (|| {
        // Dosya adı filtre içinde çalışma klasörüne göre verilir; Windows sürücü harfi/iki nokta kaçışı gerekmez.
        fs::write(temp_dir.join("sub.srt"), srt.as_bytes()).map_err(|e| format!("Altyazı dosyası yazılamadı: {e}"))?;
        let filter = format!("subtitles=sub.srt:force_style='{style}'");
        let result = Command::new("ffmpeg").current_dir(&temp_dir)
            .args(["-hide_banner", "-nostdin", "-n", "-i"]).arg(&input)
            .args(["-map", "0:v:0", "-map", "0:a?", "-vf", &filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "out.mp4"])
            .output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !result.status.success() { return Err(format!("Altyazı yakma hatası: {}", String::from_utf8_lossy(&result.stderr).chars().rev().take(1800).collect::<String>().chars().rev().collect::<String>())); }
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if !video || audio != has_audio || (actual - duration).abs() > 0.25 { return Err("Çıktının video, ses veya süre doğrulaması başarısız.".into()); }
        // Aynı dosya sisteminde atomik, üzerine yazmayan yayımlama.
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        Ok(format!("Altyazılı MP4 kaydedildi ({cues} altyazı): {output}"))
    })();
    let _ = fs::remove_file(temp_dir.join("sub.srt"));
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

#[tauri::command]
pub async fn burn_subtitles(input_path: String, output_path: String, srt: String, size_percent: f64, position: String, color: String, font: Option<String>, bold: Option<bool>, outline: Option<f64>, boxed: Option<bool>) -> Result<String, String> {
    let defaults = Look::default();
    let look = Look { font: font.unwrap_or(defaults.font), bold: bold.unwrap_or(defaults.bold), outline: outline.unwrap_or(defaults.outline), boxed: boxed.unwrap_or(defaults.boxed) };
    tauri::async_runtime::spawn_blocking(move || render(input_path, output_path, srt, size_percent, position, color, look)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn style_uses_only_whitelisted_values() {
        let d = Look::default();
        let s = force_style(5.0, "bottom", "white", &d).unwrap();
        assert!(s.contains("FontName=Arial") && s.contains("FontSize=14.40") && s.contains("Alignment=2") && s.contains("&H00FFFFFF") && s.contains("BorderStyle=1") && s.contains("Bold=0"));
        assert!(force_style(5.0, "top", "yellow", &d).unwrap().contains("Alignment=8"));
        assert!(force_style(5.0, "middle", "white", &d).unwrap().contains("MarginV=0.0"));
        assert!(force_style(5.0, "bottom", "cyan", &d).unwrap().contains("PrimaryColour=&H00FFFF00"));
        assert!(force_style(5.0, "bottom", "green", &d).unwrap().contains("PrimaryColour=&H0000FF00"));
    }

    #[test]
    fn style_look_options_are_applied_and_validated() {
        let bold_serif = Look { font: "Georgia".into(), bold: true, outline: 3.0, boxed: false };
        let s = force_style(5.0, "bottom", "white", &bold_serif).unwrap();
        assert!(s.contains("FontName=Georgia") && s.contains("Bold=-1") && s.contains("Outline=3.0") && s.contains("BorderStyle=1"));
        let boxed = Look { boxed: true, ..Look::default() };
        let b = force_style(5.0, "bottom", "white", &boxed).unwrap();
        assert!(b.contains("BorderStyle=3") && b.contains("OutlineColour=&H59000000") && b.contains("BackColour=&H59000000"));
        for bad in [Look { font: "Evil,Outline=99".into(), ..Look::default() }, Look { font: "Comic Sans".into(), ..Look::default() }, Look { outline: -1.0, ..Look::default() }, Look { outline: 7.0, ..Look::default() }, Look { outline: f64::NAN, ..Look::default() }] {
            assert!(force_style(5.0, "bottom", "white", &bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn style_rejects_injection_and_out_of_range() {
        let d = Look::default();
        assert!(force_style(5.0, "bottom,Outline=99", "white", &d).is_err());
        assert!(force_style(5.0, "bottom", "red'];x", &d).is_err());
        assert!(force_style(1.0, "bottom", "white", &d).is_err());
        assert!(force_style(13.0, "bottom", "white", &d).is_err());
        assert!(force_style(f64::NAN, "bottom", "white", &d).is_err());
    }

    #[test]
    fn srt_validation() {
        assert_eq!(validate_srt("1\n00:00:00,000 --> 00:00:01,000\nMerhaba\n").unwrap(), 1);
        assert!(validate_srt("").is_err());
        assert!(validate_srt("sadece metin").is_err());
        assert!(validate_srt("1\n00:00:00,000 --> 00:00:01,000\na\0b\n").is_err());
        assert!(validate_srt(&"x".repeat(MAX_SRT_BYTES + 1)).is_err());
    }

    /// Gerçek FFmpeg ile uçtan uca: Unicode klasör, sesli kaynak, çıktı doğrulaması ve üzerine yazmama.
    #[test]
    fn render_burns_subtitles_end_to_end() {
        if Command::new("ffmpeg").arg("-version").output().is_err() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let dir = std::env::temp_dir().join(format!("voxcut altyazı test ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("kaynak ğ.mp4");
        let made = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]).arg(&input).output().unwrap();
        assert!(made.status.success(), "fixture üretilemedi");
        let output = dir.join("çıktı.mp4");
        let srt = "1\n00:00:00,500 --> 00:00:02,000\nTürkçe İğŞ altyazı\n";
        let msg = render(input.to_str().unwrap().into(), output.to_str().unwrap().into(), srt.into(), 6.0, "top".into(), "yellow".into(), Look::default()).unwrap();
        assert!(msg.contains("1 altyazı"), "{msg}");
        let (d, a, v) = probe(output.to_str().unwrap()).unwrap();
        assert!(a && v && (d - 3.0).abs() < 0.25, "süre/akış hatalı: {d} {a} {v}");
        let again = render(input.to_str().unwrap().into(), output.to_str().unwrap().into(), srt.into(), 6.0, "top".into(), "yellow".into(), Look::default());
        assert!(again.is_err(), "mevcut dosyanın üzerine yazmamalı");
        assert!(fs::read_dir(&dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-sub-")), "geçici klasör kalmamalı");
        let _ = fs::remove_dir_all(&dir);
    }

    /// Altyazı satırının bulunduğu şeridin (400×34 px) ortalama parlaklığı (0..255): kutu stili görüntüyü gerçekten karartmalı.
    fn bottom_brightness(video: &Path) -> f64 {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-ss", "1", "-i"]).arg(video)
            .args(["-frames:v", "1", "-vf", "crop=400:34:120:318,format=gray", "-f", "rawvideo", "-"]).output().unwrap();
        assert!(out.status.success() && !out.stdout.is_empty());
        out.stdout.iter().map(|b| *b as f64).sum::<f64>() / out.stdout.len() as f64
    }

    #[test]
    fn look_options_change_the_rendered_pixels() {
        if Command::new("ffmpeg").arg("-version").output().is_err() { return; }
        let dir = std::env::temp_dir().join(format!("voxcut gorunum ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("k.mp4");
        let made = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p"]).arg(&input).output().unwrap();
        assert!(made.status.success());
        let srt = "1\n00:00:00,000 --> 00:00:03,000\nBu uzun bir deneme altyazısı satırıdır\n";
        let run = |name: &str, look: Look| {
            let out = dir.join(name);
            render(input.to_str().unwrap().into(), out.to_str().unwrap().into(), srt.into(), 7.0, "bottom".into(), "white".into(), look).unwrap();
            bottom_brightness(&out)
        };
        let plain = run("duz.mp4", Look::default());
        let boxed = run("kutulu.mp4", Look { boxed: true, ..Look::default() });
        let other = run("farkli.mp4", Look { outline: 6.0, bold: true, font: "Impact".into(), ..Look::default() });
        assert!(boxed < plain - 10.0, "kutu alt şeridi karartmalı: düz {plain:.1}, kutulu {boxed:.1}");
        assert!((other - plain).abs() > 0.2, "yazı tipi/kalın/kontur görüntüyü değiştirmeli: düz {plain:.1}, farklı {other:.1}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn render_rejects_relative_or_missing_input() {
        let err = render("yok.mp4".into(), "C:\\tmp\\o.mp4".into(), "1\n00:00:00,000 --> 00:00:01,000\na\n".into(), 5.0, "bottom".into(), "white".into(), Look::default()).unwrap_err();
        assert!(err.contains("bulunamadı"));
    }
}
