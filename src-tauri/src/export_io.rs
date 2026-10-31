use std::{fs, path::Path};

/// Dışa aktarılan görsel/altyazı dosyalarını kullanıcının seçtiği yola yazar. Baytlar ham ikili IPC gövdesiyle gelir (JSON dizisi değil);
/// yol `x-export-path` başlığında yüzde-kodlu taşınır. Uzantı beyaz listesi ve dosya imzası (magic bytes) doğrulanır.
const MAX_BYTES: usize = 200 * 1024 * 1024;

fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else { out.push(bytes[i]); i += 1; }
    }
    String::from_utf8(out).ok()
}

fn check_payload(path: &Path, data: &[u8]) -> Result<(), String> {
    if data.is_empty() { return Err("Kaydedilecek veri boş.".into()); }
    if data.len() > MAX_BYTES { return Err("Dosya 200 MB sınırını aşıyor.".into()); }
    let ext = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).ok_or("Dosya uzantısı yok.")?;
    let ok = match ext.as_str() {
        "png" => data.starts_with(&[0x89, b'P', b'N', b'G']),
        "jpg" | "jpeg" => data.starts_with(&[0xFF, 0xD8, 0xFF]),
        "webp" => data.len() > 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP",
        "srt" => std::str::from_utf8(data).is_ok(),
        "vtt" => std::str::from_utf8(data).is_ok_and(|t| t.trim_start_matches('\u{feff}').starts_with("WEBVTT")),
        _ => return Err("Desteklenmeyen dışa aktarma türü.".into()),
    };
    if ok { Ok(()) } else { Err("Dosya içeriği uzantıyla uyuşmuyor; kaydedilmedi.".into()) }
}

fn save_at(path: &str, data: &[u8]) -> Result<String, String> {
    let target = Path::new(path);
    if path.is_empty() || path.len() > 1024 || path.contains('\0') || !target.is_absolute() { return Err("Kayıt yolu geçersiz.".into()); }
    check_payload(target, data)?;
    if target.is_dir() { return Err("Hedef bir klasör.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let name = target.file_name().and_then(|n| n.to_str()).ok_or("Dosya adı okunamadı.")?;
    // Üzerine yazma onayını kaydet penceresi zaten aldı; yarım dosya bırakmamak için geçici dosya + yeniden adlandırma.
    let tmp = parent.join(format!(".{name}.voxcut-tmp"));
    fs::write(&tmp, data).map_err(|e| format!("Yazılamadı: {e}"))?;
    if let Err(e) = fs::rename(&tmp, target) { let _ = fs::remove_file(&tmp); return Err(format!("Kaydedilemedi: {e}")); }
    Ok(format!("{path} ({} KB)", data.len().div_ceil(1024)))
}

#[tauri::command]
pub async fn save_export_file(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("Ham bayt verisi bekleniyordu.".into()) };
    let path = request.headers().get("x-export-path").and_then(|v| v.to_str().ok()).and_then(percent_decode).ok_or("Kayıt yolu başlığı eksik veya geçersiz.")?;
    let data = data.clone();
    tauri::async_runtime::spawn_blocking(move || save_at(&path, &data)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 1, 2, 3];
    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("voxcut export {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn percent_decode_handles_unicode_and_rejects_garbage() {
        assert_eq!(percent_decode("C%3A%5CKlas%C3%B6r%20%C4%B1%C5%9F%5Ca.png").unwrap(), "C:\\Klasör ış\\a.png");
        assert_eq!(percent_decode("duz.png").unwrap(), "duz.png");
        assert!(percent_decode("%").is_none());
        assert!(percent_decode("%zz").is_none());
        assert!(percent_decode("%FF%FE").is_none(), "geçersiz UTF-8 reddedilir");
    }

    #[test]
    fn signatures_must_match_the_extension() {
        let webp = [b"RIFF".as_slice(), &[0, 0, 0, 0], b"WEBPVP8 "].concat();
        for (name, data) in [("a.png", PNG.to_vec()), ("a.JPG", vec![0xFF, 0xD8, 0xFF, 0xE0]), ("a.webp", webp.clone()), ("a.srt", "1\n00:00:00,000 --> 00:00:01,000\nİ\n".as_bytes().to_vec()), ("a.vtt", "\u{feff}WEBVTT\n\n".as_bytes().to_vec())] {
            assert!(check_payload(Path::new(name), &data).is_ok(), "{name}");
        }
        assert!(check_payload(Path::new("a.png"), &webp).is_err());
        assert!(check_payload(Path::new("a.jpg"), PNG).is_err());
        assert!(check_payload(Path::new("a.vtt"), b"SRT metni").is_err());
        assert!(check_payload(Path::new("a.srt"), &[0xFF, 0xFE, 0xFD]).is_err());
        assert!(check_payload(Path::new("a.exe"), PNG).is_err());
        assert!(check_payload(Path::new("uzantisiz"), PNG).is_err());
        assert!(check_payload(Path::new("a.png"), &[]).is_err());
    }

    #[test]
    fn saves_atomically_overwrites_and_leaves_no_temp_file() {
        let dir = temp("save");
        let target = dir.join("Çıktı ğ.png");
        let first = save_at(target.to_str().unwrap(), PNG).unwrap();
        assert!(first.contains("Çıktı ğ.png"));
        let newer = [PNG, &[9, 9, 9]].concat();
        save_at(target.to_str().unwrap(), &newer).unwrap();
        assert_eq!(fs::read(&target).unwrap(), newer);
        assert!(fs::read_dir(&dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".voxcut-tmp")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_relative_missing_parent_directory_target_and_bad_payload_without_writing() {
        let dir = temp("bad");
        assert!(save_at("goreli.png", PNG).is_err());
        assert!(save_at(dir.join("yok").join("a.png").to_str().unwrap(), PNG).is_err());
        assert!(save_at(dir.to_str().unwrap(), PNG).is_err());
        assert!(save_at("", PNG).is_err());
        let target = dir.join("sahte.png");
        assert!(save_at(target.to_str().unwrap(), b"png degil").is_err());
        assert!(!target.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
