use std::{
    fs,
    path::Path,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{audio_mix::probe, media_access::check_image};

const VIDEO_EXT: [&str; 3] = ["mp4", "m4v", "mov"];
const COVER_MAX_WIDTH: u32 = 1280;

/// Videoya kapak fotoğrafı ekler: kapak, dosyanın "ekli resim" akışı olur (Gezgin, oynatıcılar ve telefonlar küçük resim olarak gösterir).
/// Video, ses ve altyazı akışları yeniden kodlanmaz (kopyalanır); kaynak değişmez, çıktı yeni bir dosyadır. Videoda önceden kapak varsa o atılır.
fn apply(input: &str, image: &str, output: &str) -> Result<String, String> {
    let ext_of = |p: &str| Path::new(p).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
    let src_ext = ext_of(input).filter(|e| VIDEO_EXT.contains(&e.as_str())).ok_or("Kapak eklenecek video .mp4, .m4v veya .mov olmalı.")?;
    if !Path::new(input).is_absolute() || !Path::new(input).is_file() { return Err("Video dosyası bulunamadı.".into()); }
    check_image(image)?;
    let target = Path::new(output);
    if !target.is_absolute() || target.exists() || ext_of(output).as_deref() != Some(src_ext.as_str()) {
        return Err(format!("Yeni bir .{src_ext} dosya adı seçin; mevcut dosyaların üzerine yazılmaz."));
    }
    if output.eq_ignore_ascii_case(input) { return Err("Çıktı dosyası kaynakla aynı olamaz.".into()); }
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("Hedef klasör bulunamadı.")?;
    let (duration, _, has_video) = probe(input)?;
    if !has_video { return Err("Bu dosyada video akışı yok; kapak yalnızca videoya eklenir.".into()); }

    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = parent.join(format!(".voxcut-kapak-{}-{nonce}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| format!("Geçici çıktı oluşturulamadı: {e}"))?;
    let temp = temp_dir.join(format!("out.{src_ext}"));
    let result = (|| {
        let scale = format!("scale='min({COVER_MAX_WIDTH},iw)':-2,format=yuvj420p");
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-n", "-i"]).arg(input).arg("-i").arg(image)
            .args(["-map", "0:V:0", "-map", "0:a?", "-map", "0:s?", "-map", "1:v:0", "-c", "copy", "-c:v:1", "mjpeg", "-q:v:1", "2", "-filter:v:1", &scale, "-disposition:v:1", "attached_pic", "-movflags", "+faststart"])
            .arg(&temp).output().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
        if !out.status.success() {
            return Err(format!("Kapak eklenemedi: {}", String::from_utf8_lossy(&out.stderr).chars().rev().take(900).collect::<String>().chars().rev().collect::<String>()));
        }
        let covers = count_covers(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        let (actual, _, _) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
        if covers != 1 || (actual - duration).abs() > 0.3 { return Err(format!("Çıktı doğrulaması başarısız (kapak sayısı {covers}, süre {actual:.2} sn, beklenen {duration:.2} sn).")); }
        fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))?;
        Ok(format!("Kapak eklendi ({actual:.1} sn): {output}"))
    })();
    let _ = fs::remove_file(&temp);
    let _ = fs::remove_dir(&temp_dir);
    result
}

/// Dosyadaki "ekli resim" (kapak) akışı sayısı.
fn count_covers(path: &str) -> Result<usize, String> {
    let out = Command::new("ffprobe").args(["-v", "error", "-show_entries", "stream_disposition=attached_pic", "-of", "csv=p=0", path]).output().map_err(|e| format!("FFprobe başlatılamadı: {e}"))?;
    if !out.status.success() { return Err("Çıktı okunamadı.".into()); }
    Ok(String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.trim() == "1").count())
}

#[tauri::command]
pub async fn add_cover(video_path: String, image_path: String, output_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || apply(&video_path, &image_path, &output_path)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ffmpeg_ok() -> bool { Command::new("ffmpeg").arg("-version").output().is_ok() }
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut kapak ğş {name} {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn video(path: &Path, with_audio: bool) {
        let mut args = vec!["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25:d=2"];
        if with_audio { args.extend(["-f", "lavfi", "-i", "sine=f=440:d=2", "-c:a", "aac"]); }
        args.extend(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest"]);
        assert!(Command::new("ffmpeg").args(args).arg(path).status().unwrap().success());
    }
    fn picture(path: &Path, color: &str) {
        let src = format!("color=c={color}:s=640x360:d=1");
        assert!(Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", &src, "-frames:v", "1"]).arg(path).status().unwrap().success());
    }
    fn s(p: &Path) -> String { p.to_str().unwrap().to_string() }

    #[test]
    fn adds_one_cover_keeps_video_and_audio_and_never_touches_the_source() {
        if !ffmpeg_ok() { return; }
        let d = dir("ekle");
        let (v, img, out) = (d.join("klip ğ.mp4"), d.join("kapak ş.png"), d.join("kapakli ö.mp4"));
        video(&v, true); picture(&img, "red");
        let before = fs::read(&v).unwrap();
        let msg = apply(&s(&v), &s(&img), &s(&out)).unwrap();
        assert!(msg.contains("Kapak eklendi"));
        assert_eq!(count_covers(&s(&out)).unwrap(), 1);
        let (dur, audio, vid) = probe(&s(&out)).unwrap();
        assert!(audio && vid && (dur - 2.0).abs() < 0.3);
        assert_eq!(before, fs::read(&v).unwrap(), "kaynak değişmemeli");
        assert_eq!(count_covers(&s(&v)).unwrap(), 0);
        assert!(fs::read_dir(&d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-kapak")), "geçici klasör kalmamalı");
    }

    #[test]
    fn replaces_an_existing_cover_instead_of_adding_a_second_one() {
        if !ffmpeg_ok() { return; }
        let d = dir("degistir");
        let (v, a, b, first, second) = (d.join("v.mp4"), d.join("a.png"), d.join("b.jpg"), d.join("bir.mp4"), d.join("iki.mp4"));
        video(&v, false); picture(&a, "blue"); picture(&b, "green");
        apply(&s(&v), &s(&a), &s(&first)).unwrap();
        apply(&s(&first), &s(&b), &s(&second)).unwrap();
        assert_eq!(count_covers(&s(&second)).unwrap(), 1);
    }

    #[test]
    fn invalid_requests_are_rejected_without_side_effects() {
        if !ffmpeg_ok() { return; }
        let d = dir("hata");
        let (v, img, out) = (d.join("v.mp4"), d.join("k.png"), d.join("o.mp4"));
        video(&v, false); picture(&img, "red");
        fs::write(&out, b"var").unwrap();
        assert!(apply(&s(&v), &s(&img), &s(&out)).is_err(), "mevcut hedef ezilmemeli");
        assert_eq!(fs::read(&out).unwrap(), b"var");
        assert!(apply("relative.mp4", &s(&img), &s(&d.join("x.mp4"))).is_err());
        assert!(apply(&s(&d.join("yok.mp4")), &s(&img), &s(&d.join("x.mp4"))).is_err());
        assert!(apply(&s(&v), &s(&d.join("yok.png")), &s(&d.join("x.mp4"))).is_err());
        assert!(apply(&s(&v), &s(&img), &s(&d.join("x.mov"))).is_err(), "uzantı kaynakla aynı olmalı");
        assert!(apply(&s(&v), &s(&img), &s(&v)).is_err(), "çıktı kaynak olamaz");
        let txt = d.join("not.mp4"); fs::write(&txt, b"video degil").unwrap();
        assert!(apply(&s(&txt), &s(&img), &s(&d.join("y.mp4"))).is_err());
        assert!(!d.join("x.mp4").exists() && !d.join("y.mp4").exists());
    }

    #[test]
    fn audio_only_files_are_rejected() {
        if !ffmpeg_ok() { return; }
        let d = dir("ses");
        let (a, img) = (d.join("ses.m4v"), d.join("k.png"));
        picture(&img, "red");
        assert!(Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=1", "-c:a", "aac", "-f", "ipod"]).arg(&a).status().unwrap().success());
        assert!(apply(&s(&a), &s(&img), &s(&d.join("o.m4v"))).is_err());
    }
}
