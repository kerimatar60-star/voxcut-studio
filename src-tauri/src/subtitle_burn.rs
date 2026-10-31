use std::{fs, path::Path, process::Command, time::{SystemTime, UNIX_EPOCH}};

use crate::audio_mix::probe;

const MAX_SRT_BYTES: usize = 1_000_000;

/// Yalnız beyaz listedeki değerlerden libass stili üretir; arayüzden ham stil metni kabul edilmez.
/// `size_percent`: yazı boyutu, video yüksekliğinin yüzdesi. libass SRT için 288 birimlik sanal yükseklik kullanır.
fn force_style(size_percent: f64, position: &str, color: &str) -> Result<String, String> {
    if !size_percent.is_finite() || !(2.0..=12.0).contains(&size_percent) { return Err("Yazı boyutu %2 ile %12 arasında olmalı.".into()); }
    let alignment = match position { "bottom" => 2, "middle" => 5, "top" => 8, _ => return Err("Geçersiz altyazı konumu.".into()) };
    let primary = match color { "white" => "&H00FFFFFF", "yellow" => "&H0000FFFF", _ => return Err("Geçersiz altyazı rengi.".into()) };
    let font_size = size_percent * 2.88;
    let margin = if position == "middle" { 0.0 } else { 3.0 * 2.88 };
    Ok(format!("FontName=Arial,FontSize={font_size:.2},PrimaryColour={primary},OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,Alignment={alignment},MarginV={margin:.1}"))
}

/// SRT içeriğini doğrular ve ipucu olarak cue sayısını döndürür.
fn validate_srt(srt: &str) -> Result<usize, String> {
    if srt.len() > MAX_SRT_BYTES { return Err("Altyazı verisi çok büyük.".into()); }
    if srt.contains('\0') { return Err("Altyazı verisi geçersiz karakter içeriyor.".into()); }
    let cues = srt.lines().filter(|line| line.contains(" --> ")).count();
    if cues == 0 { return Err("Yakılacak geçerli altyazı bulunamadı.".into()); }
    Ok(cues)
}

fn render(input: String, output: String, srt: String, size_percent: f64, position: String, color: String) -> Result<String, String> {
    let source = Path::new(&input);
    if !source.is_absolute() || !source.is_file() { return Err("Kaynak video bulunamadı.".into()); }
    let cues = validate_srt(&srt)?;
    let style = force_style(size_percent, &position, &color)?;
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
pub async fn burn_subtitles(input_path: String, output_path: String, srt: String, size_percent: f64, position: String, color: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || render(input_path, output_path, srt, size_percent, position, color)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn style_uses_only_whitelisted_values() {
        let s = force_style(5.0, "bottom", "white").unwrap();
        assert!(s.contains("FontSize=14.40") && s.contains("Alignment=2") && s.contains("&H00FFFFFF"));
        assert!(force_style(5.0, "top", "yellow").unwrap().contains("Alignment=8"));
        assert!(force_style(5.0, "middle", "white").unwrap().contains("MarginV=0.0"));
    }

    #[test]
    fn style_rejects_injection_and_out_of_range() {
        assert!(force_style(5.0, "bottom,Outline=99", "white").is_err());
        assert!(force_style(5.0, "bottom", "red'];x").is_err());
        assert!(force_style(1.0, "bottom", "white").is_err());
        assert!(force_style(13.0, "bottom", "white").is_err());
        assert!(force_style(f64::NAN, "bottom", "white").is_err());
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
        let msg = render(input.to_str().unwrap().into(), output.to_str().unwrap().into(), srt.into(), 6.0, "top".into(), "yellow".into()).unwrap();
        assert!(msg.contains("1 altyazı"), "{msg}");
        let (d, a, v) = probe(output.to_str().unwrap()).unwrap();
        assert!(a && v && (d - 3.0).abs() < 0.25, "süre/akış hatalı: {d} {a} {v}");
        let again = render(input.to_str().unwrap().into(), output.to_str().unwrap().into(), srt.into(), 6.0, "top".into(), "yellow".into());
        assert!(again.is_err(), "mevcut dosyanın üzerine yazmamalı");
        assert!(fs::read_dir(&dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-sub-")), "geçici klasör kalmamalı");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn render_rejects_relative_or_missing_input() {
        let err = render("yok.mp4".into(), "C:\\tmp\\o.mp4".into(), "1\n00:00:00,000 --> 00:00:01,000\na\n".into(), 5.0, "bottom".into(), "white".into()).unwrap_err();
        assert!(err.contains("bulunamadı"));
    }
}
