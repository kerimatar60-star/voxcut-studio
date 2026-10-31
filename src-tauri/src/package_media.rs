use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{media_access, media_fingerprint::fingerprint, package_io};

/// Medyayı `.voxcut` paketinin `media/` klasörüne KOPYALAR (kaynak dosyalar asla taşınmaz, değiştirilmez veya silinmez).
const MAX_FILES: usize = 500;
/// Disk dolmasın diye kopyalanacak toplamın üstüne her zaman bırakılan güvenlik payı.
const MARGIN_BYTES: u64 = 100 * 1024 * 1024;

#[cfg(windows)]
fn free_space(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(dir: *const u16, available: *mut u64, total: *mut u64, free: *mut u64) -> i32;
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
    // SAFETY: wide sıfır sonlandırmalı geçerli bir UTF-16 dizisidir; çıktı işaretçileri yığındaki yerel değişkenlere işaret eder.
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) };
    (ok != 0).then_some(available)
}
#[cfg(not(windows))]
fn free_space(_path: &Path) -> Option<u64> { None }

fn norm(p: &Path) -> String { p.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase() }
fn is_inside(path: &Path, dir: &Path) -> bool { norm(path).starts_with(&format!("{}/", norm(dir))) }

#[derive(Debug, PartialEq)]
enum Action { AlreadyInside, Reuse, Copy }
#[derive(Debug)]
struct Item { src: PathBuf, dest: PathBuf, size: u64, print: String, action: Action }

fn candidate(stem: &str, ext: &str, n: usize) -> String {
    match (n, ext.is_empty()) { (1, true) => stem.to_string(), (1, false) => format!("{stem}.{ext}"), (_, true) => format!("{stem} ({n})"), (_, false) => format!("{stem} ({n}).{ext}") }
}

/// Her kaynak için hedefi belirler: pakette zaten varsa atla, aynı içerikli dosya `media/` içinde varsa yeniden kullan, değilse çakışmasız ad seç.
fn plan(dir: &Path, sources: &[String]) -> Result<Vec<Item>, String> {
    if !package_io::is_package(dir) { return Err("Önce projeyi paket olarak kaydedin (geçerli bir .voxcut paketi bulunamadı).".into()); }
    if sources.is_empty() { return Err("Kopyalanacak medya yok.".into()); }
    if sources.len() > MAX_FILES { return Err(format!("En fazla {MAX_FILES} dosya kopyalanabilir.")); }
    let media_dir = dir.join("media");
    let mut taken: HashSet<String> = HashSet::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut items = Vec::new();
    for source in sources {
        let src = PathBuf::from(source);
        media_access::check(source).map_err(|e| format!("{}: {e}", src.file_name().and_then(|n| n.to_str()).unwrap_or("dosya")))?;
        if !seen.insert(norm(&src)) { continue; }
        let (size, print) = fingerprint(&src)?;
        if is_inside(&src, dir) { items.push(Item { dest: src.clone(), src, size, print, action: Action::AlreadyInside }); continue; }
        let stem = src.file_stem().and_then(|s| s.to_str()).ok_or("Dosya adı okunamadı.")?.to_string();
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_string();
        let mut n = 1;
        let (dest, action) = loop {
            let name = candidate(&stem, &ext, n);
            let dest = media_dir.join(&name);
            if taken.contains(&name.to_lowercase()) { n += 1; continue; }
            if dest.exists() {
                let same = fingerprint(&dest).map(|(s, p)| s == size && p == print).unwrap_or(false);
                if same { break (dest, Action::Reuse); }
                n += 1; continue;
            }
            break (dest, Action::Copy);
        };
        taken.insert(dest.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase());
        items.push(Item { src, dest, size, print, action });
    }
    Ok(items)
}

/// (kaynak → hedef eşlemesi, bayt toplamı, boş alan)
type Collected = (Vec<(String, String)>, u64, u64);

fn nonce() -> Result<u128, String> { Ok(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos()) }

/// (kaynak → hedef eşlemesi, kopyalanacak/kopyalanan toplam bayt, boş disk alanı bayt; bilinmiyorsa 0).
/// `dry_run` doğruysa hiçbir şey yazılmaz. Her dosya geçici adla kopyalanır, boyut + parmak iziyle doğrulanır, sonra yerine konur;
/// herhangi bir hata olursa bu çağrıda oluşturulan tüm dosyalar geri alınır.
fn collect_at(dir: &Path, sources: &[String], dry_run: bool, free_override: Option<Option<u64>>) -> Result<Collected, String> {
    let items = plan(dir, sources)?;
    let total: u64 = items.iter().filter(|i| i.action == Action::Copy).map(|i| i.size).sum();
    let free = free_override.unwrap_or_else(|| free_space(dir));
    if let Some(avail) = free {
        if total > 0 && avail < total.saturating_add(MARGIN_BYTES) {
            return Err(format!("Disk alanı yetersiz: {} MB gerekiyor (+100 MB pay), {} MB boş.", total / 1_048_576, avail / 1_048_576));
        }
    }
    let mapping = |items: &[Item]| items.iter().map(|i| (i.src.to_string_lossy().to_string(), i.dest.to_string_lossy().to_string())).collect::<Vec<_>>();
    if dry_run { return Ok((mapping(&items), total, free.unwrap_or(0))); }
    let media_dir = dir.join("media");
    fs::create_dir_all(&media_dir).map_err(|e| format!("media klasörü oluşturulamadı: {e}"))?;
    let mut created: Vec<PathBuf> = Vec::new();
    let result = (|| -> Result<(), String> {
        for item in items.iter().filter(|i| i.action == Action::Copy) {
            let tmp = media_dir.join(format!(".voxcut-copy-{}-{}.tmp", std::process::id(), nonce()?));
            created.push(tmp.clone());
            fs::copy(&item.src, &tmp).map_err(|e| format!("Kopyalanamadı ({}): {e}", item.src.display()))?;
            let (size, print) = fingerprint(&tmp)?;
            if size != item.size || print != item.print { return Err(format!("Kopya doğrulaması başarısız: {}", item.src.display())); }
            if item.dest.exists() { return Err(format!("Hedef zaten var, üzerine yazılmaz: {}", item.dest.display())); }
            fs::rename(&tmp, &item.dest).map_err(|e| format!("Kopya yerine konamadı: {e}"))?;
            created.pop();
            created.push(item.dest.clone());
        }
        Ok(())
    })();
    if let Err(e) = result {
        for path in &created { let _ = fs::remove_file(path); }
        return Err(format!("{e} (bu işlemde oluşturulan tüm kopyalar geri alındı)"));
    }
    Ok((mapping(&items), total, free.unwrap_or(0)))
}

/// Verilen medya dosyalarını paketin `media/` klasörüne kopyalar. `dry_run`: yalnız plan ve toplam boyut.
#[tauri::command]
pub async fn collect_media(dir: String, sources: Vec<String>, dry_run: bool) -> Result<Collected, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = Path::new(&dir);
        if !d.is_absolute() { return Err("Paket yolu tam olmalı.".to_string()); }
        collect_at(d, &sources, dry_run, None)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{"format":"voxcut-package","formatVersion":1,"media":[]}"#;
    const PROJECT: &str = r#"{"schemaVersion":1}"#;

    fn setup(name: &str) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("voxcut topla {name} ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let pkg = root.join("Paket ü.voxcut");
        package_io::write_package_at(&pkg, PROJECT, MANIFEST, 1).unwrap();
        (root, pkg)
    }
    fn file(dir: &Path, name: &str, len: usize, seed: u8) -> String {
        fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        fs::write(&path, (0..len).map(|i| (i as u8).wrapping_add(seed)).collect::<Vec<u8>>()).unwrap();
        path.to_string_lossy().to_string()
    }
    fn no_temp_left(media: &Path) -> bool { fs::read_dir(media).map(|d| d.flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".tmp"))).unwrap_or(true) }

    #[test]
    fn copies_verifies_and_never_touches_sources() {
        let (root, pkg) = setup("kopya");
        let a = file(&root.join("klasör A"), "klip ğ.mp4", 5000, 1);
        let b = file(&root.join("klasör B"), "klip ğ.mp4", 6000, 2); // aynı ad, farklı içerik
        let c = file(&root.join("ses"), "fon.wav", 3000, 3);
        let before = fs::read(&a).unwrap();
        let (map, total, _) = collect_at(&pkg, &[a.clone(), b.clone(), c.clone()], false, Some(None)).unwrap();
        assert_eq!(total, 14_000);
        assert_eq!(map.len(), 3);
        let dests: Vec<_> = map.iter().map(|(_, d)| PathBuf::from(d).file_name().unwrap().to_string_lossy().to_string()).collect();
        assert_eq!(dests, vec!["klip ğ.mp4", "klip ğ (2).mp4", "fon.wav"]);
        for (src, dest) in &map { assert_eq!(fs::read(src).unwrap(), fs::read(dest).unwrap()); assert!(is_inside(Path::new(dest), &pkg)); }
        assert_eq!(fs::read(&a).unwrap(), before, "kaynak değişmemeli");
        assert!(Path::new(&b).exists() && Path::new(&c).exists(), "kaynaklar silinmemeli");
        assert!(no_temp_left(&pkg.join("media")));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn dry_run_writes_nothing_and_reports_totals() {
        let (root, pkg) = setup("kuru");
        let a = file(&root.join("k"), "a.mp4", 4000, 1);
        let (map, total, _) = collect_at(&pkg, &[a], true, Some(None)).unwrap();
        assert_eq!((map.len(), total), (1, 4000));
        assert!(!pkg.join("media").exists(), "kuru çalıştırma klasör bile oluşturmamalı");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn second_run_reuses_identical_files_and_skips_files_already_inside() {
        let (root, pkg) = setup("tekrar");
        let a = file(&root.join("k"), "a.mp4", 4000, 1);
        let first = collect_at(&pkg, std::slice::from_ref(&a), false, Some(None)).unwrap();
        let again = collect_at(&pkg, std::slice::from_ref(&a), false, Some(None)).unwrap();
        assert_eq!(first.0, again.0, "aynı içerik aynı hedefe eşlenmeli");
        assert_eq!(again.1, 0, "ikinci çalıştırmada kopyalanacak bayt yok");
        assert_eq!(fs::read_dir(pkg.join("media")).unwrap().count(), 1, "çoğaltma yapılmamalı");
        let inside = first.0[0].1.clone();
        let third = collect_at(&pkg, std::slice::from_ref(&inside), false, Some(None)).unwrap();
        assert_eq!(third.0, vec![(inside.clone(), inside)]);
        assert_eq!(third.1, 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn insufficient_disk_space_is_refused_before_copying() {
        let (root, pkg) = setup("disk");
        let a = file(&root.join("k"), "a.mp4", 4000, 1);
        let err = collect_at(&pkg, std::slice::from_ref(&a), false, Some(Some(50 * 1024 * 1024))).unwrap_err();
        assert!(err.contains("Disk alanı yetersiz"), "{err}");
        assert!(!pkg.join("media").exists());
        assert!(collect_at(&pkg, &[a], false, Some(Some(MARGIN_BYTES + 4000))).is_ok());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_source_bad_extension_and_non_package_abort_without_side_effects() {
        let (root, pkg) = setup("hata");
        let ok = file(&root.join("k"), "a.mp4", 4000, 1);
        let missing = root.join("k").join("yok.mp4").to_string_lossy().to_string();
        let txt = file(&root.join("k"), "not.txt", 10, 1);
        assert!(collect_at(&pkg, &[ok.clone(), missing], false, Some(None)).is_err());
        assert!(collect_at(&pkg, &[ok.clone(), txt], false, Some(None)).is_err());
        assert!(!pkg.join("media").exists(), "hata durumunda hiçbir kopya yapılmamalı");
        let foreign = root.join("baska.voxcut");
        fs::create_dir_all(&foreign).unwrap();
        assert!(collect_at(&foreign, &[ok], false, Some(None)).unwrap_err().contains("paket"));
        assert!(!foreign.join("media").exists());
        assert!(collect_at(&pkg, &[], false, Some(None)).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn free_space_is_reported_on_this_machine() {
        #[cfg(windows)]
        assert!(free_space(&std::env::temp_dir()).is_some_and(|b| b > 0));
    }

    #[test]
    fn inside_check_is_case_insensitive_and_not_fooled_by_sibling_names() {
        let dir = Path::new("D:\\Projeler\\Klip.voxcut");
        assert!(is_inside(Path::new("d:\\projeler\\klip.VOXCUT\\media\\a.mp4"), dir));
        assert!(!is_inside(Path::new("D:\\Projeler\\Klip.voxcutX\\a.mp4"), dir));
        assert!(!is_inside(Path::new("D:\\Projeler\\Klip.voxcut"), dir));
    }
}
