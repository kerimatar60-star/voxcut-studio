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
