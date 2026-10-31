use std::{fs, path::Path};

use rusqlite::{params, Connection};
use tauri::Manager;

/// Yerel kütüphane veritabanı (yalnız metadata: yollar, adlar, zamanlar; medya baytı asla tutulmaz).
/// Şema sürümü `PRAGMA user_version` ile izlenir; yeni sürümler `migrate` içine sırayla eklenir.
const SCHEMA_VERSION: i32 = 1;
const MAX_RECENT: i64 = 20;

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| format!("Veritabanı sürümü okunamadı: {e}"))?;
    if version > SCHEMA_VERSION {
        return Err(format!("Veritabanı daha yeni bir VoxCut sürümünden (v{version}); bu sürüm v{SCHEMA_VERSION} biliyor. Veriler değiştirilmedi."));
    }
    if version < 1 {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE recent_projects (path TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, opened_at INTEGER NOT NULL);
             CREATE INDEX idx_recent_projects_opened ON recent_projects (opened_at DESC);
             PRAGMA user_version = 1;
             COMMIT;",
        ).map_err(|e| format!("Veritabanı oluşturulamadı: {e}"))?;
    }
    Ok(())
}

fn check_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 1024 || path.contains('\0') { return Err("Proje yolu geçersiz.".into()); }
    if !Path::new(path).extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("json") || e.eq_ignore_ascii_case("voxcut")) { return Err("Yalnız .json proje dosyaları ve .voxcut paketleri kaydedilir.".into()); }
    Ok(())
}

fn touch_recent(conn: &Connection, path: &str, name: &str, now: i64) -> Result<(), String> {
    check_path(path)?;
    let name: String = name.replace('\0', "").chars().take(200).collect();
    conn.execute(
        "INSERT INTO recent_projects (path, name, opened_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET name = excluded.name, opened_at = excluded.opened_at",
        params![path, name, now],
    ).map_err(|e| format!("Son projeler kaydedilemedi: {e}"))?;
    conn.execute(
        "DELETE FROM recent_projects WHERE path NOT IN (SELECT path FROM recent_projects ORDER BY opened_at DESC, path LIMIT ?1)",
        params![MAX_RECENT],
    ).map_err(|e| format!("Son projeler düzenlenemedi: {e}"))?;
    Ok(())
}

/// (yol, ad, açılış zamanı ms, dosya hâlâ var mı)
type Recent = (String, String, i64, bool);

fn list_recent(conn: &Connection) -> Result<Vec<Recent>, String> {
    let mut stmt = conn.prepare("SELECT path, name, opened_at FROM recent_projects ORDER BY opened_at DESC, path LIMIT ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![MAX_RECENT], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (path, name, at) = row.map_err(|e| e.to_string())?;
        // .json bir dosya, .voxcut bir paket klasörüdür.
        let exists = Path::new(&path).exists();
        out.push((path, name, at, exists));
    }
    Ok(out)
}

fn forget_recent(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM recent_projects WHERE path = ?1", params![path]).map_err(|e| format!("Kayıt silinemedi: {e}"))?;
    Ok(())
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("Uygulama veri klasörü bulunamadı: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Veri klasörü oluşturulamadı: {e}"))?;
    let conn = Connection::open(dir.join("library.db")).map_err(|e| format!("Veritabanı açılamadı: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_secs(3)).map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

#[tauri::command]
pub async fn recent_projects_list(app: tauri::AppHandle) -> Result<Vec<Recent>, String> {
    tauri::async_runtime::spawn_blocking(move || list_recent(&open_db(&app)?)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn recent_projects_touch(app: tauri::AppHandle, path: String, name: String) -> Result<(), String> {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as i64;
    tauri::async_runtime::spawn_blocking(move || touch_recent(&open_db(&app)?, &path, &name, now)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn recent_projects_forget(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || forget_recent(&open_db(&app)?, &path)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection { let c = Connection::open_in_memory().unwrap(); migrate(&c).unwrap(); c }

    #[test]
    fn migrate_sets_version_and_is_idempotent() {
        let c = db();
        migrate(&c).unwrap();
        let v: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);
    }

    #[test]
    fn newer_database_is_refused_and_untouched() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA user_version = 99;").unwrap();
        let err = migrate(&c).unwrap_err();
        assert!(err.contains("daha yeni"), "{err}");
        let tables: i64 = c.query_row("SELECT count(*) FROM sqlite_master WHERE name = 'recent_projects'", [], |r| r.get(0)).unwrap();
        assert_eq!(tables, 0);
    }

    #[test]
    fn touch_upserts_and_orders_most_recent_first() {
        let c = db();
        touch_recent(&c, "C:\\p\\a.voxcut.json", "A", 100).unwrap();
        touch_recent(&c, "C:\\p\\b.voxcut.json", "B", 200).unwrap();
        touch_recent(&c, "C:\\p\\a.voxcut.json", "A yeni ad", 300).unwrap();
        let rows = list_recent(&c).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].0.as_str(), rows[0].1.as_str(), rows[0].2), ("C:\\p\\a.voxcut.json", "A yeni ad", 300));
        assert_eq!(rows[1].1, "B");
        assert!(!rows[0].3, "olmayan dosya exists=false olmalı");
    }

    #[test]
    fn keeps_only_max_recent() {
        let c = db();
        for i in 0..(MAX_RECENT + 5) { touch_recent(&c, &format!("C:\\p\\{i}.json"), "x", i).unwrap(); }
        let rows = list_recent(&c).unwrap();
        assert_eq!(rows.len() as i64, MAX_RECENT);
        assert_eq!(rows[0].2, MAX_RECENT + 4);
        assert_eq!(rows.last().unwrap().2, 5);
    }

    #[test]
    fn forget_removes_entry() {
        let c = db();
        touch_recent(&c, "C:\\p\\a.json", "A", 1).unwrap();
        forget_recent(&c, "C:\\p\\a.json").unwrap();
        assert!(list_recent(&c).unwrap().is_empty());
    }

    #[test]
    fn rejects_bad_paths_and_survives_sql_metacharacters() {
        let c = db();
        assert!(touch_recent(&c, "", "x", 1).is_err());
        assert!(touch_recent(&c, "C:\\p\\a.txt", "x", 1).is_err());
        assert!(touch_recent(&c, "C:\\p\\a\0.json", "x", 1).is_err());
        touch_recent(&c, "C:\\p\\o'; DROP TABLE recent_projects;--.json", "ad'; --", 1).unwrap();
        assert_eq!(list_recent(&c).unwrap().len(), 1);
    }

    #[test]
    fn package_directories_are_accepted_and_reported() {
        let c = db();
        let dir = std::env::temp_dir().join(format!("voxcut-recent-pkg-{}.voxcut", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        touch_recent(&c, dir.to_str().unwrap(), "paket", 1).unwrap();
        touch_recent(&c, "C:\\yok\\kayip.voxcut", "kayıp", 2).unwrap();
        let rows = list_recent(&c).unwrap();
        assert!(!rows[0].3, "olmayan paket exists=false");
        assert!(rows[1].3, "var olan paket klasörü exists=true");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn existing_file_is_reported_as_existing() {
        let c = db();
        let file = std::env::temp_dir().join(format!("voxcut-recent-{}.json", std::process::id()));
        fs::write(&file, "{}").unwrap();
        touch_recent(&c, file.to_str().unwrap(), "var", 1).unwrap();
        assert!(list_recent(&c).unwrap()[0].3);
        let _ = fs::remove_file(&file);
    }
}
