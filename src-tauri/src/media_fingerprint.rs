use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

/// Hızlı medya parmak izi: boyut + ilk 1 MiB + son 1 MiB (2 MiB ve altı dosyalarda tamamı) üzerinden SHA-256.
/// Çok büyük dosyalarda yalnız orta kısmı değişirse fark edilmez; amaç taşınmış dosyayı güvenle bulmaktır, bütünlük kanıtı değildir.
const EDGE: u64 = 1024 * 1024;
const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 20_000;
const MAX_RESULTS: usize = 5;

pub(crate) fn fingerprint(path: &Path) -> Result<(u64, String), String> {
    let mut file = File::open(path).map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let size = file.metadata().map_err(|e| format!("Dosya bilgisi okunamadı: {e}"))?.len();
    if size == 0 { return Err("Dosya boş.".into()); }
    let mut hasher = Sha256::new();
    hasher.update(b"voxcut-fp1");
    hasher.update(size.to_le_bytes());
    let mut buf = Vec::new();
    if size <= 2 * EDGE {
        file.read_to_end(&mut buf).map_err(|e| format!("Dosya okunamadı: {e}"))?;
        hasher.update(&buf);
    } else {
        buf.resize(EDGE as usize, 0);
        file.read_exact(&mut buf).map_err(|e| format!("Dosya okunamadı: {e}"))?;
        hasher.update(&buf);
        file.seek(SeekFrom::Start(size - EDGE)).map_err(|e| format!("Dosya okunamadı: {e}"))?;
        file.read_exact(&mut buf).map_err(|e| format!("Dosya okunamadı: {e}"))?;
        hasher.update(&buf);
    }
    Ok((size, hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()))
}

fn valid_fingerprint(text: &str) -> bool { text.len() == 64 && text.bytes().all(|b| b.is_ascii_hexdigit()) }

/// Kullanıcının seçtiği klasörde (en çok 6 seviye, 20 000 girdi, sembolik bağlantılar atlanır) aynı boyut + parmak izli dosyaları arar.
fn find_in_folder(folder: &Path, size: u64, wanted: &str, name_hint: &str) -> Result<Vec<String>, String> {
    if !folder.is_dir() { return Err("Klasör bulunamadı.".into()); }
    if size == 0 || !valid_fingerprint(wanted) { return Err("Parmak izi veya boyut geçersiz.".into()); }
    let wanted = wanted.to_ascii_lowercase();
    let mut stack: Vec<(PathBuf, usize)> = vec![(folder.to_path_buf(), 0)];
    let mut seen = 0usize;
    let mut candidates: Vec<PathBuf> = Vec::new();
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            seen += 1;
            if seen > MAX_ENTRIES { break; }
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() { continue; }
            if kind.is_dir() { if depth < MAX_DEPTH { stack.push((entry.path(), depth + 1)); } }
            else if kind.is_file() && entry.metadata().is_ok_and(|m| m.len() == size) { candidates.push(entry.path()); }
        }
        if seen > MAX_ENTRIES { break; }
    }
    // Aynı adı taşıyanlar önce denenir.
    let hint = name_hint.to_lowercase();
    candidates.sort_by_key(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.to_lowercase() != hint).unwrap_or(true));
    let mut found = Vec::new();
    for path in candidates {
        if let Ok((_, print)) = fingerprint(&path) {
            if print == wanted { if let Some(text) = path.to_str() { found.push(text.to_string()); } }
        }
        if found.len() >= MAX_RESULTS { break; }
    }
    Ok(found)
}

#[tauri::command]
pub async fn file_fingerprint(path: String) -> Result<(u64, String), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.is_file() { return Err("Dosya bulunamadı.".into()); }
        fingerprint(p)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn find_moved_media(folder: String, size: u64, fingerprint: String, name: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || find_in_folder(Path::new(&folder), size, &fingerprint, &name)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("voxcut fp {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn bytes(len: usize, seed: u8) -> Vec<u8> { (0..len).map(|i| (i as u8).wrapping_mul(31).wrapping_add(seed)).collect() }

    #[test]
    fn same_content_same_print_regardless_of_path() {
        let dir = temp("same");
        let data = bytes(3 * 1024 * 1024 + 17, 1);
        fs::write(dir.join("a.wav"), &data).unwrap();
        fs::create_dir_all(dir.join("taşındı")).unwrap();
        fs::write(dir.join("taşındı").join("başka ad.wav"), &data).unwrap();
        let a = fingerprint(&dir.join("a.wav")).unwrap();
        let b = fingerprint(&dir.join("taşındı").join("başka ad.wav")).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.0, data.len() as u64);
        assert_eq!(a.1.len(), 64);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn head_tail_and_small_file_changes_are_detected() {
        let dir = temp("diff");
        let big = bytes(3 * 1024 * 1024, 2);
        fs::write(dir.join("o.bin"), &big).unwrap();
        let base = fingerprint(&dir.join("o.bin")).unwrap().1;
        let mut head = big.clone(); head[10] ^= 1; fs::write(dir.join("h.bin"), &head).unwrap();
        let mut tail = big.clone(); let n = tail.len(); tail[n - 10] ^= 1; fs::write(dir.join("t.bin"), &tail).unwrap();
        assert_ne!(fingerprint(&dir.join("h.bin")).unwrap().1, base);
        assert_ne!(fingerprint(&dir.join("t.bin")).unwrap().1, base);
        let small = bytes(5000, 3); fs::write(dir.join("s.bin"), &small).unwrap();
        let mut small2 = small.clone(); small2[2500] ^= 1; fs::write(dir.join("s2.bin"), &small2).unwrap();
        assert_ne!(fingerprint(&dir.join("s.bin")).unwrap().1, fingerprint(&dir.join("s2.bin")).unwrap().1);
        fs::write(dir.join("empty.bin"), b"").unwrap();
        assert!(fingerprint(&dir.join("empty.bin")).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_moved_renamed_file_and_skips_same_size_decoys() {
        let dir = temp("find");
        let data = bytes(70_000, 4);
        let decoy = bytes(70_000, 5);
        let print = { fs::write(dir.join("orijinal.wav"), &data).unwrap(); fingerprint(&dir.join("orijinal.wav")).unwrap() };
        fs::remove_file(dir.join("orijinal.wav")).unwrap();
        fs::create_dir_all(dir.join("müzik").join("alt")).unwrap();
        fs::write(dir.join("müzik").join("alt").join("yeni ad.wav"), &data).unwrap();
        fs::write(dir.join("müzik").join("orijinal.wav"), &decoy).unwrap();
        let found = find_in_folder(&dir, print.0, &print.1, "orijinal.wav").unwrap();
        assert_eq!(found.len(), 1, "{found:?}");
        assert!(found[0].ends_with("yeni ad.wav"));
        let none = find_in_folder(&dir, print.0 + 1, &print.1, "x").unwrap();
        assert!(none.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn depth_limit_and_input_validation() {
        let dir = temp("depth");
        let data = bytes(4000, 6);
        let mut deep = dir.clone();
        for i in 0..(MAX_DEPTH + 2) { deep = deep.join(format!("d{i}")); }
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("x.wav"), &data).unwrap();
        let print = fingerprint(&deep.join("x.wav")).unwrap();
        assert!(find_in_folder(&dir, print.0, &print.1, "x.wav").unwrap().is_empty(), "çok derindeki dosya aranmamalı");
        assert!(find_in_folder(&dir, print.0, "zz", "x").is_err());
        assert!(find_in_folder(&dir, 0, &print.1, "x").is_err());
        assert!(find_in_folder(&dir.join("yok"), print.0, &print.1, "x").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
