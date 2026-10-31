use std::{fs, path::Path};

const MAX_BYTES: u64 = 10_000_000;

fn check_ext(path: &Path) -> Result<(), String> {
    match path.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case("json") => Ok(()),
        _ => Err("Proje dosyası .json (örn. ad.voxcut.json) olmalıdır.".into()),
    }
}

/// Kullanıcının seçtiği proje JSON'unu okur. Yalnız .json, en çok 10 MB.
#[tauri::command]
pub async fn read_project_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        check_ext(p)?;
        let meta = fs::metadata(p).map_err(|_| "Proje dosyası bulunamadı.".to_string())?;
        if !meta.is_file() { return Err("Seçilen yol bir dosya değil.".into()); }
        if meta.len() == 0 || meta.len() > MAX_BYTES { return Err("Proje dosyası boş veya 10 MB sınırını aşıyor.".into()); }
        fs::read_to_string(p).map_err(|e| format!("Proje dosyası okunamadı: {e}"))
    }).await.map_err(|e| e.to_string())?
}

/// Proje JSON'unu atomik yazar (geçici dosya + yeniden adlandırma); yarım dosya bırakmaz.
/// Üzerine yazma onayı kaydet penceresinde kullanıcıdan alınır.
#[tauri::command]
pub async fn write_project_file(path: String, contents: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        check_ext(p)?;
        if contents.len() as u64 > MAX_BYTES || !contents.trim_start().starts_with('{') { return Err("Proje verisi geçersiz veya çok büyük.".into()); }
        let dir = p.parent().filter(|d| d.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
        let name = p.file_name().and_then(|n| n.to_str()).ok_or("Dosya adı okunamadı.")?;
        let tmp = dir.join(format!(".{name}.voxcut-tmp"));
        fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("Proje yazılamadı: {e}"))?;
        if let Err(e) = fs::rename(&tmp, p) { let _ = fs::remove_file(&tmp); return Err(format!("Proje kaydedilemedi: {e}")); }
        Ok(format!("Proje kaydedildi: {path}"))
    }).await.map_err(|e| e.to_string())?
}
