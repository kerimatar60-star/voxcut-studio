use std::path::Path;

use tauri::Manager;

/// Önizleme için (asset protokolü) izin verilebilecek yalnız bilinen medya uzantıları.
const MEDIA_EXT: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "m4v", "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "png", "jpg", "jpeg", "webp", "gif", "bmp"];

pub(crate) fn check(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 1024 || path.contains('\0') { return Err("Medya yolu geçersiz.".into()); }
    let p = Path::new(path);
    if !p.is_absolute() { return Err("Medya yolu tam (mutlak) olmalı.".into()); }
    if !p.is_file() { return Err("Medya dosyası bulunamadı.".into()); }
    let known = p.extension().and_then(|e| e.to_str()).is_some_and(|e| MEDIA_EXT.iter().any(|k| k.eq_ignore_ascii_case(e)));
    if !known { return Err("Desteklenmeyen medya uzantısı.".into()); }
    Ok(())
}

/// Proje dosyasından okunan bir medya yolunu bu oturumda önizlenebilir yapar. Uzantı beyaz listesi ve dosya kontrolü zorunludur;
/// diyalogla seçilen dosyalar zaten izinlidir, kayıtlı projelerdeki yollar için bu komut gerekir.
#[tauri::command]
pub fn authorize_media(app: tauri::AppHandle, path: String) -> Result<(), String> {
    check(&path)?;
    app.asset_protocol_scope().allow_file(&path).map_err(|e| format!("Önizleme izni verilemedi: {e}"))
}

const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

/// Tasarım katmanında kullanılacak görsel dosyasını doğrular (medya kontrolü + görsel uzantısı + en çok 50 MB).
pub(crate) fn check_image(path: &str) -> Result<u64, String> {
    check(path)?;
    let p = Path::new(path);
    if !p.extension().and_then(|e| e.to_str()).is_some_and(|e| IMAGE_EXT.iter().any(|k| k.eq_ignore_ascii_case(e))) { return Err("Bu dosya bir görsel değil.".into()); }
    let size = std::fs::metadata(p).map_err(|e| format!("Dosya bilgisi okunamadı: {e}"))?.len();
    if size == 0 || size > MAX_IMAGE_BYTES { return Err("Görsel boş veya 50 MB sınırını aşıyor.".into()); }
    Ok(size)
}

/// Görsel baytlarını ham ikili yanıt olarak verir (JSON dizisi değil). Tuvale çizim "tainted canvas" olmasın diye
/// arayüz bunu blob URL'ye çevirir; asset protokolü URL'si dışa aktarmayı engeller.
#[tauri::command]
pub async fn read_image_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_image(&path)?;
        std::fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| format!("Görsel okunamadı: {e}"))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn accepts_existing_media_file_with_known_extension() {
        let f = std::env::temp_dir().join(format!("voxcut-access-{}.MP4", std::process::id()));
        fs::write(&f, b"x").unwrap();
        assert!(check(f.to_str().unwrap()).is_ok());
        let _ = fs::remove_file(&f);
    }

    #[test]
    fn image_check_accepts_images_only_within_size_limits() {
        let dir = std::env::temp_dir().join(format!("voxcut-img-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let png = dir.join("a ğ.PNG"); fs::write(&png, b"123456").unwrap();
        assert_eq!(check_image(png.to_str().unwrap()).unwrap(), 6);
        let mp4 = dir.join("v.mp4"); fs::write(&mp4, b"x").unwrap();
        assert!(check_image(mp4.to_str().unwrap()).unwrap_err().contains("görsel değil"));
        let empty = dir.join("e.png"); fs::write(&empty, b"").unwrap();
        assert!(check_image(empty.to_str().unwrap()).unwrap_err().contains("boş"));
        assert!(check_image(dir.join("yok.png").to_str().unwrap()).is_err());
        assert!(check_image("goreli.png").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_unknown_extension_missing_relative_directory_and_garbage() {
        let txt = std::env::temp_dir().join(format!("voxcut-access-{}.txt", std::process::id()));
        fs::write(&txt, b"x").unwrap();
        assert!(check(txt.to_str().unwrap()).unwrap_err().contains("uzantı"));
        let _ = fs::remove_file(&txt);
        assert!(check("C:\\yok\\yok.mp4").unwrap_err().contains("bulunamadı"));
        assert!(check("goreli.mp4").unwrap_err().contains("mutlak"));
        assert!(check(std::env::temp_dir().to_str().unwrap()).is_err());
        assert!(check("").is_err());
        assert!(check("C:\\a\0.mp4").is_err());
        assert!(check(&"a".repeat(2000)).is_err());
    }
}
