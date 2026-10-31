use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::Value;

/// `.voxcut` paketi: içinde `manifest.json` (biçim işareti + medya özeti) ve `project.json` bulunan bir klasördür.
/// Medya dosyaları pakete gömülmez; yollar (pakete göreli ya da mutlak) proje JSON'unda tutulur.
const MAX_BYTES: usize = 10_000_000;
const FORMAT: &str = "voxcut-package";
const SUPPORTED_VERSION: u64 = 1;
const BACKUP_EVERY_MS: u128 = 5 * 60 * 1000;
const KEEP_BACKUPS: usize = 10;

fn has_package_name(dir: &Path) -> bool {
    dir.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("voxcut"))
}

fn parse_object(text: &str, what: &str) -> Result<Value, String> {
    if text.len() > MAX_BYTES { return Err(format!("{what} 10 MB sınırını aşıyor.")); }
    let value: Value = serde_json::from_str(text).map_err(|_| format!("{what} geçerli JSON değil."))?;
    if !value.is_object() { return Err(format!("{what} bir nesne olmalı.")); }
    Ok(value)
}

fn check_manifest(manifest: &Value) -> Result<(), String> {
    if manifest.get("format").and_then(Value::as_str) != Some(FORMAT) { return Err("Manifest bir VoxCut paketi değil.".into()); }
    match manifest.get("formatVersion").and_then(Value::as_u64) {
        Some(v) if (1..=SUPPORTED_VERSION).contains(&v) => Ok(()),
        Some(v) => Err(format!("Paket daha yeni bir sürümden (v{v}); bu VoxCut v{SUPPORTED_VERSION} biliyor. Hiçbir şey değiştirilmedi.")),
        None => Err("Manifest sürüm bilgisi eksik.".into()),
    }
}

/// Klasör geçerli bir VoxCut paketi mi (manifest okunabilir, biçim işareti doğru)?
pub(crate) fn is_package(dir: &Path) -> bool {
    fs::read_to_string(dir.join("manifest.json")).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).is_some_and(|m| check_manifest(&m).is_ok())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("Dosya adı okunamadı.")?;
    let tmp = path.with_file_name(format!(".{name}.voxcut-tmp"));
    fs::write(&tmp, bytes).map_err(|e| format!("Yazılamadı: {e}"))?;
    if let Err(e) = fs::rename(&tmp, path) { let _ = fs::remove_file(&tmp); return Err(format!("Kaydedilemedi: {e}")); }
    Ok(())
}

fn backup_millis(name: &str) -> Option<u128> { name.strip_prefix("project-")?.strip_suffix(".json")?.parse().ok() }

/// Mevcut project.json'u, son yedek 5 dakikadan eskiyse `backups/` altına kopyalar; en çok 10 yedek tutar.
fn rotate_backup(dir: &Path, now_ms: u128) -> Result<(), String> { backup_current(dir, now_ms, false) }

/// `force` doğruysa son yedeğin yaşına bakılmaksızın yedekler (geri yüklemeden önce mevcut durumu korumak için).
fn backup_current(dir: &Path, now_ms: u128, force: bool) -> Result<(), String> {
    let current = dir.join("project.json");
    if !current.is_file() { return Ok(()); }
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|e| format!("Yedek klasörü oluşturulamadı: {e}"))?;
    let mut stamps: Vec<(u128, PathBuf)> = fs::read_dir(&backups).map_err(|e| e.to_string())?
        .flatten().filter_map(|e| { let n = e.file_name().to_string_lossy().to_string(); backup_millis(&n).map(|m| (m, e.path())) }).collect();
    stamps.sort();
    if !force && stamps.last().is_some_and(|(newest, _)| now_ms.saturating_sub(*newest) < BACKUP_EVERY_MS) { return Ok(()); }
    fs::copy(&current, backups.join(format!("project-{now_ms}.json"))).map_err(|e| format!("Yedek alınamadı: {e}"))?;
    stamps.push((now_ms, backups.join(format!("project-{now_ms}.json"))));
    while stamps.len() > KEEP_BACKUPS { let (_, old) = stamps.remove(0); let _ = fs::remove_file(old); }
    Ok(())
}

pub(crate) fn write_package_at(dir: &Path, project_json: &str, manifest_json: &str, now_ms: u128) -> Result<String, String> {
    if !dir.is_absolute() || !has_package_name(dir) { return Err("Paket klasörünün adı .voxcut ile bitmeli ve yol tam olmalı.".into()); }
    parse_object(project_json, "Proje verisi")?;
    let manifest = parse_object(manifest_json, "Manifest")?;
    check_manifest(&manifest)?;
    if dir.exists() {
        if !dir.is_dir() { return Err("Hedef bir klasör değil.".into()); }
        if !is_package(dir) { return Err("Bu klasör bir VoxCut paketi değil; üzerine yazılmaz. Yeni bir ad seçin.".into()); }
    } else {
        let parent = dir.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
        let _ = parent;
        fs::create_dir(dir).map_err(|e| format!("Paket klasörü oluşturulamadı: {e}"))?;
    }
    rotate_backup(dir, now_ms)?;
    // Önce proje, en son manifest: yarım kalırsa mevcut paket yine geçerli ve açılabilir kalır.
    write_atomic(&dir.join("project.json"), project_json.as_bytes())?;
    write_atomic(&dir.join("manifest.json"), manifest_json.as_bytes())?;
    Ok(format!("Paket kaydedildi: {}", dir.display()))
}

/// (yedek adı, zaman damgası ms, bayt) — en yeni başta.
fn list_backups_at(dir: &Path) -> Result<Vec<(String, u128, u64)>, String> {
    if !is_package(dir) { return Err("Bu klasör bir VoxCut paketi değil.".into()); }
    let Ok(entries) = fs::read_dir(dir.join("backups")) else { return Ok(Vec::new()) };
    let mut out: Vec<(String, u128, u64)> = entries.flatten().filter_map(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        let millis = backup_millis(&name)?;
        let meta = e.metadata().ok().filter(|m| m.is_file())?;
        Some((name, millis, meta.len()))
    }).collect();
    out.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    Ok(out)
}

/// Seçilen yedeği project.json yapar. Önce yedek okunur ve doğrulanır, sonra mevcut durum zorla yedeklenir (geri alınabilir), en son atomik yazılır.
fn restore_backup_at(dir: &Path, name: &str, now_ms: u128) -> Result<String, String> {
    if !is_package(dir) { return Err("Bu klasör bir VoxCut paketi değil.".into()); }
    backup_millis(name).ok_or("Geçersiz yedek adı.")?;
    let source = dir.join("backups").join(name);
    let meta = fs::metadata(&source).map_err(|_| "Yedek dosyası bulunamadı.".to_string())?;
    if !meta.is_file() || meta.len() == 0 || meta.len() as usize > MAX_BYTES { return Err("Yedek boş veya 10 MB sınırını aşıyor.".into()); }
    let text = fs::read_to_string(&source).map_err(|e| format!("Yedek okunamadı: {e}"))?;
    parse_object(&text, "Yedek")?;
    backup_current(dir, now_ms, true)?;
    write_atomic(&dir.join("project.json"), text.as_bytes())?;
    Ok("Yedek geri yüklendi; önceki durum da yeni bir yedek olarak saklandı.".to_string())
}

fn read_package_at(dir: &Path) -> Result<(String, String), String> {
    if !dir.is_dir() { return Err("Paket klasörü bulunamadı.".into()); }
    let manifest_text = fs::read_to_string(dir.join("manifest.json")).map_err(|_| "Bu klasör bir VoxCut paketi değil (manifest.json yok).".to_string())?;
    let manifest = parse_object(&manifest_text, "Manifest")?;
    check_manifest(&manifest)?;
    let project = dir.join("project.json");
    let meta = fs::metadata(&project).map_err(|_| "Paketin project.json dosyası bulunamadı.".to_string())?;
    if !meta.is_file() || meta.len() == 0 || meta.len() as usize > MAX_BYTES { return Err("project.json boş veya 10 MB sınırını aşıyor.".into()); }
    let project_text = fs::read_to_string(&project).map_err(|e| format!("project.json okunamadı: {e}"))?;
    parse_object(&project_text, "Proje verisi")?;
    Ok((project_text, manifest_text))
}

fn now_ms() -> Result<u128, String> { Ok(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis()) }

#[tauri::command]
pub async fn write_package(dir: String, project_json: String, manifest_json: String) -> Result<String, String> {
    let now = now_ms()?;
    tauri::async_runtime::spawn_blocking(move || write_package_at(Path::new(&dir), &project_json, &manifest_json, now)).await.map_err(|e| e.to_string())?
}

/// (project.json, manifest.json) metinlerini döndürür.
#[tauri::command]
pub async fn list_backups(dir: String) -> Result<Vec<(String, u128, u64)>, String> {
    tauri::async_runtime::spawn_blocking(move || list_backups_at(Path::new(&dir))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restore_backup(dir: String, name: String) -> Result<String, String> {
    let now = now_ms()?;
    tauri::async_runtime::spawn_blocking(move || restore_backup_at(Path::new(&dir), &name, now)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_package(dir: String) -> Result<(String, String), String> {
    tauri::async_runtime::spawn_blocking(move || read_package_at(Path::new(&dir))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{"format":"voxcut-package","formatVersion":1,"media":[]}"#;
    const PROJECT: &str = r#"{"schemaVersion":1,"name":"Çok güzel proje ğ"}"#;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("voxcut pkg {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_then_read_round_trip_with_unicode_names() {
        let root = temp("rt");
        let pkg = root.join("Proje ğüş.voxcut");
        let msg = write_package_at(&pkg, PROJECT, MANIFEST, 1_000).unwrap();
        assert!(msg.contains("Paket kaydedildi"));
        let (p, m) = read_package_at(&pkg).unwrap();
        assert_eq!(p, PROJECT);
        assert_eq!(m, MANIFEST);
        assert!(fs::read_dir(&pkg).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".voxcut-tmp")), "geçici dosya kalmamalı");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_foreign_directories_and_bad_names_without_touching_them() {
        let root = temp("foreign");
        let foreign = root.join("baska.voxcut");
        fs::create_dir_all(&foreign).unwrap();
        fs::write(foreign.join("onemli.txt"), "kalmali").unwrap();
        assert!(write_package_at(&foreign, PROJECT, MANIFEST, 1).unwrap_err().contains("paketi değil"));
        assert_eq!(fs::read_to_string(foreign.join("onemli.txt")).unwrap(), "kalmali");
        assert!(!foreign.join("project.json").exists());
        assert!(write_package_at(&root.join("adsiz"), PROJECT, MANIFEST, 1).is_err());
        assert!(write_package_at(Path::new("goreli.voxcut"), PROJECT, MANIFEST, 1).is_err());
        assert!(write_package_at(&root.join("yok").join("alt.voxcut"), PROJECT, MANIFEST, 1).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_invalid_json_and_wrong_or_newer_manifest() {
        let root = temp("bad");
        let pkg = root.join("a.voxcut");
        assert!(write_package_at(&pkg, "{bozuk", MANIFEST, 1).is_err());
        assert!(write_package_at(&pkg, "[1,2]", MANIFEST, 1).is_err());
        assert!(write_package_at(&pkg, PROJECT, r#"{"format":"baska","formatVersion":1}"#, 1).is_err());
        let newer = write_package_at(&pkg, PROJECT, r#"{"format":"voxcut-package","formatVersion":9}"#, 1).unwrap_err();
        assert!(newer.contains("daha yeni"), "{newer}");
        assert!(!pkg.exists(), "hatalı istek klasör oluşturmamalı");
        write_package_at(&pkg, PROJECT, MANIFEST, 1).unwrap();
        fs::write(pkg.join("manifest.json"), r#"{"format":"voxcut-package","formatVersion":9}"#).unwrap();
        assert!(read_package_at(&pkg).unwrap_err().contains("daha yeni"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn backups_are_rate_limited_and_pruned() {
        let root = temp("bak");
        let pkg = root.join("b.voxcut");
        write_package_at(&pkg, PROJECT, MANIFEST, 1_000_000).unwrap();
        let count = |p: &Path| fs::read_dir(p.join("backups")).map(|d| d.count()).unwrap_or(0);
        assert_eq!(count(&pkg), 0, "ilk yazımda yedeklenecek bir şey yok");
        write_package_at(&pkg, r#"{"v":2}"#, MANIFEST, 1_000_000 + 1_000).unwrap();
        assert_eq!(count(&pkg), 1);
        write_package_at(&pkg, r#"{"v":3}"#, MANIFEST, 1_000_000 + 2_000).unwrap();
        assert_eq!(count(&pkg), 1, "5 dakikadan kısa sürede yeni yedek alınmaz");
        for i in 1..=15u128 { write_package_at(&pkg, r#"{"v":9}"#, MANIFEST, 1_000_000 + i * BACKUP_EVERY_MS).unwrap(); }
        assert_eq!(count(&pkg), KEEP_BACKUPS);
        let newest = fs::read_dir(pkg.join("backups")).unwrap().flatten().filter_map(|e| backup_millis(&e.file_name().to_string_lossy())).max().unwrap();
        assert_eq!(newest, 1_000_000 + 15 * BACKUP_EVERY_MS);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_newest_first_and_restores_with_a_safety_backup() {
        let root = temp("restore");
        let pkg = root.join("r.voxcut");
        assert!(list_backups_at(&root.join("yok.voxcut")).is_err());
        write_package_at(&pkg, r#"{"v":1}"#, MANIFEST, 1_000_000).unwrap();
        assert!(list_backups_at(&pkg).unwrap().is_empty());
        write_package_at(&pkg, r#"{"v":2}"#, MANIFEST, 1_000_000 + BACKUP_EVERY_MS).unwrap();   // yedek: v1
        write_package_at(&pkg, r#"{"v":3}"#, MANIFEST, 1_000_000 + 2 * BACKUP_EVERY_MS).unwrap(); // yedek: v2
        let list = list_backups_at(&pkg).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list[0].1 > list[1].1, "en yeni başta olmalı");
        let oldest = list[1].0.clone();
        let msg = restore_backup_at(&pkg, &oldest, 1_000_000 + 3 * BACKUP_EVERY_MS).unwrap();
        assert!(msg.contains("geri yüklendi"));
        assert_eq!(read_package_at(&pkg).unwrap().0, r#"{"v":1}"#);
        let after = list_backups_at(&pkg).unwrap();
        assert_eq!(after.len(), 3, "geri yüklemeden önceki durum (v3) da yedeklenmeli");
        let safety = fs::read_to_string(pkg.join("backups").join(&after[0].0)).unwrap();
        assert_eq!(safety, r#"{"v":3}"#);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn restore_rejects_bad_names_traversal_and_corrupt_backups_without_changes() {
        let root = temp("restore-bad");
        let pkg = root.join("s.voxcut");
        write_package_at(&pkg, r#"{"v":1}"#, MANIFEST, 1_000_000).unwrap();
        for bad in ["..\\manifest.json", "../manifest.json", "project-1.json.exe", "project-abc.json", "manifest.json", ""] {
            assert!(restore_backup_at(&pkg, bad, 5).is_err(), "{bad}");
        }
        assert!(restore_backup_at(&pkg, "project-42.json", 5).unwrap_err().contains("bulunamadı"));
        fs::create_dir_all(pkg.join("backups")).unwrap();
        fs::write(pkg.join("backups").join("project-43.json"), "{bozuk").unwrap();
        assert!(restore_backup_at(&pkg, "project-43.json", 5).is_err());
        assert_eq!(read_package_at(&pkg).unwrap().0, r#"{"v":1}"#, "başarısız geri yükleme projeye dokunmamalı");
        assert!(restore_backup_at(&root.join("paket-degil.voxcut"), "project-43.json", 5).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn read_rejects_missing_pieces() {
        let root = temp("read");
        assert!(read_package_at(&root.join("yok.voxcut")).is_err());
        let pkg = root.join("c.voxcut");
        fs::create_dir_all(&pkg).unwrap();
        assert!(read_package_at(&pkg).unwrap_err().contains("manifest"));
        fs::write(pkg.join("manifest.json"), MANIFEST).unwrap();
        assert!(read_package_at(&pkg).unwrap_err().contains("project.json"));
        let _ = fs::remove_dir_all(&root);
    }
}
