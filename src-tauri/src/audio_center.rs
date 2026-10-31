use std::{
    fs,
    path::Path,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{audio_denoise::format_of, audio_mix::probe};

/// Klasik "orta kanal" ayrımı (yapay zekâ DEĞİL): stereo kayıtta iki kanalda eşit duyulan içerik (genellikle vokal, bas, bas davul)
/// "orta", kanallar arasındaki fark ise "yan" içeriktir. `instrumental` = yan (L−R)/2, `center` = orta (L+R)/2.
/// Vokal ortada değilse, geniş stereo/yankılı kayıtlarda veya mono kayıtlarda sonuç zayıftır; çıktı mono olur. Kaynak değişmez.
fn filter_of(mode: &str) -> Result<&'static str, String> {
    Ok(match mode {
        "instrumental" => "pan=mono|c0=0.5*c0-0.5*c1",
        "center" => "pan=mono|c0=0.5*c0+0.5*c1",
        _ => return Err("Desteklenmeyen kip (instrumental, center).".into()),
    })
}

fn channels(path: &str) -> Result<u32, String> {
    let out = Command::new("ffprobe").args(["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", path]).output().map_err(|e| format!("FFprobe başlatılamadı: {e}"))?;
    String::from_utf8_lossy(&out.stdout).trim().parse::<u32>().map_err(|_| "Kanal sayısı okunamadı.".to_string())
}

fn process(input: &str, output: &str, mode: &str, format: &str) -> Result<String, String> {
    let filter = filter_of(mode)?;
    let (ext, codec) = format_of(format)?;
    if !Path::new(input).is_absolute() || !Path::new(input).is_file() { return Err("Kaynak dosya bulunamadı.".into()); }
    let target = Path::new(output);
    if !target.is_absolute() || target.exists() || target.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case(ext)) { return Err(format!("Yeni bir .{ext} dosya adı seçin; mevcut dosyalar korunur.")); }
    if output.eq_ignore_ascii_case(input) { return Err("Çıktı dosyası kaynakla aynı olamaz.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (duration, has_audio, _) = probe(input)?;
    if !has_audio { return Err("Kaynakta ses akışı yok.".into()); }
    if channels(input)? < 2 { return Err("Orta kanal ayrımı için stereo (2 kanallı) kayıt gerekir; bu kayıt mono.".into()); }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-ct-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join(format!("out.{ext}"));
    let result = (|| {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-n", "-i"]).arg(input)
            .args(["-vn", "-map", "0:a:0", "-af", filter]).args(codec).arg(&temp).output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !out.status.success() { return Err(format!("Ayrıştırma hatası: {}", String::from_utf8_lossy(&out.stderr).chars().rev().take(1200).collect::<String>().chars().rev().collect::<String>())); }
        let (actual, audio, video) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if !audio || video || (actual - duration).abs() > 0.3 { return Err(format!("Çıktı doğrulaması başarısız (süre {actual:.2} sn, beklenen {duration:.2} sn).")); }
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        Ok(format!("{} kaydedildi ({actual:.1} sn, mono): {output}", if mode == "instrumental" { "Vokali azaltılmış (yan kanal) ses" } else { "Orta kanal sesi" }))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

/// `mode`: "instrumental" (ortadaki içeriği azaltır) veya "center" (yalnız ortadaki içerik). Çıktı: wav / mp3 / flac.
#[tauri::command]
pub async fn split_center(input_path: String, output_path: String, mode: String, format: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || process(&input_path, &output_path, &mode, &format)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ffmpeg_ok() -> bool { Command::new("ffmpeg").arg("-version").output().is_ok() }
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut orta ğş {name} {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    /// Stereo: 440 Hz iki kanalda eşit ("vokal"), 880 Hz yalnız solda, 1320 Hz yalnız sağda ("enstrümanlar").
    fn stereo(path: &Path) {
        let ok = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=2", "-f", "lavfi", "-i", "sine=f=880:d=2", "-f", "lavfi", "-i", "sine=f=1320:d=2", "-filter_complex",
            "[0]volume=0.5,asplit=2[v1][v2];[1]volume=0.5[a];[2]volume=0.5[b];[v1][a]amix=inputs=2:normalize=0[l];[v2][b]amix=inputs=2:normalize=0[r];[l][r]join=inputs=2:channel_layout=stereo[o]", "-map", "[o]"]).arg(path).status().unwrap().success();
        assert!(ok);
    }
    /// Çıktının bir frekans çevresindeki düzeyi (dB, ortalama).
    fn level_at(path: &Path, hz: u32) -> f64 {
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-i"]).arg(path).args(["-af", &format!("bandpass=f={hz}:width_type=h:w=60,volumedetect"), "-f", "null", "-"]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).to_string();
        text.lines().find_map(|l| l.split("mean_volume:").nth(1)).and_then(|v| v.trim().trim_end_matches(" dB").parse::<f64>().ok()).unwrap_or(-91.0)
    }

    #[test]
    fn modes_are_validated() {
        assert!(filter_of("instrumental").is_ok() && filter_of("center").is_ok());
        assert!(filter_of("rm").is_err());
    }

    #[test]
    fn instrumental_removes_center_and_keeps_sides_and_center_mode_does_the_opposite() {
        if !ffmpeg_ok() { return; }
        let d = dir("ayrim");
        let src = d.join("kaynak.wav");
        stereo(&src);
        let inst = d.join("enstr.wav");
        let msg = process(src.to_str().unwrap(), inst.to_str().unwrap(), "instrumental", "wav").unwrap();
        assert!(msg.contains("mono"), "{msg}");
        let (c_in, s_in) = (level_at(&src, 440), level_at(&src, 880));
        let (c_out, s_out, r_out) = (level_at(&inst, 440), level_at(&inst, 880), level_at(&inst, 1320));
        // Süzgeç komşu frekansları tamamen bastırmadığından ölçüm tabanı ≈ -50 dB civarındadır; bu yüzden hem mutlak düşüş hem yan içeriğe göre fark aranır.
        assert!(c_in - c_out > 20.0, "orta içerik yeterince azalmadı: {c_in:.1} → {c_out:.1} dB");
        assert!(s_out - c_out > 15.0, "yan içerik ortadakinden belirgin yüksek olmalı: yan {s_out:.1}, orta {c_out:.1} dB");
        assert!((s_in - s_out).abs() < 8.0, "yan içerik korunmalı: {s_in:.1} → {s_out:.1} dB (sağ {r_out:.1})");
        let cen = d.join("orta.wav");
        process(src.to_str().unwrap(), cen.to_str().unwrap(), "center", "wav").unwrap();
        let (c2, s2) = (level_at(&cen, 440), level_at(&cen, 880));
        // (L+R)/2 yalnız tek kanalda duyulan içeriği yarıya (−6 dB) indirir, yok etmez: orta kip bir "süzgeç" değil, ağırlıklandırmadır.
        assert!(c2 > s2 + 4.0, "orta kipte ortadaki içerik baskın olmalı: orta {c2:.1} dB, yan {s2:.1} dB");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn mono_existing_target_and_bad_format_are_refused_without_touching_files() {
        if !ffmpeg_ok() { return; }
        let d = dir("red");
        let mono = d.join("mono.wav");
        assert!(Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=1"]).arg(&mono).status().unwrap().success());
        let out = d.join("c.wav");
        assert!(process(mono.to_str().unwrap(), out.to_str().unwrap(), "center", "wav").unwrap_err().contains("stereo"));
        assert!(!out.exists());
        let st = d.join("st.wav");
        stereo(&st);
        let keep = d.join("var.wav");
        fs::write(&keep, b"onemli").unwrap();
        assert!(process(st.to_str().unwrap(), keep.to_str().unwrap(), "center", "wav").is_err());
        assert_eq!(fs::read(&keep).unwrap(), b"onemli");
        assert!(process(st.to_str().unwrap(), d.join("x.ogg").to_str().unwrap(), "center", "ogg").is_err());
        assert!(fs::read_dir(&d).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".voxcut-ct")), "geçici klasör temizlenmeli");
        let _ = fs::remove_dir_all(&d);
    }
}
