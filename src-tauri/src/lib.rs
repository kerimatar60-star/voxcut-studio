mod ai;
mod asr;
mod audio_center;
mod audio_denoise;
mod audio_mix;
mod cover;
mod export_io;
mod library_db;
mod media_access;
mod media_fingerprint;
mod package_io;
mod package_media;
mod project_io;
mod stems;
mod subtitle_burn;
mod timeline_render;
mod tool_check;
mod waveform;

use std::path::Path;
use std::process::Command;

// FFmpeg kullanarak video kesme ve MP4 kaydetme
#[tauri::command]
fn trim_video(
    input_path: String,
    output_path: String,
    start_seconds: f64,
    end_seconds: f64,
) -> Result<String, String> {
    let input = Path::new(&input_path);
    let output = Path::new(&output_path);

    // Girdi doğrulama
    if !input.is_file() {
        return Err("Kaynak video bulunamadi.".into());
    }

    if !start_seconds.is_finite()
        || !end_seconds.is_finite()
        || start_seconds < 0.0
        || end_seconds <= start_seconds
    {
        return Err("Gecersiz baslangic veya bitis suresi.".into());
    }

    if output.exists() {
        return Err("Hedef dosya zaten mevcut. Farkli bir ad secin.".into());
    }

    if output
        .extension()
        .and_then(|ext| ext.to_str())
        .is_none_or(|ext| !ext.eq_ignore_ascii_case("mp4"))
    {
        return Err("Cikti dosyasi MP4 olmali.".into());
    }

    if !output.parent().is_some_and(|dir| dir.is_dir()) {
        return Err("Hedef klasor bulunamadi.".into());
    }

    let duration = end_seconds - start_seconds;

    let result = Command::new("ffmpeg")
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-n")
        .arg("-ss")
        .arg(format!("{start_seconds:.3}"))
        .arg("-i")
        .arg(&input_path)
        .arg("-t")
        .arg(format!("{duration:.3}"))
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("0:a?")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("21")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&output_path)
        .output()
        .map_err(|e| format!("FFmpeg baslatilamadi: {e}"))?;

    if !result.status.success() {
        return Err(format!(
            "Video isleme hatasi:\n{}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }

    Ok(format!("Video kaydedildi: {output_path}"))
}

/// Kurulum paketindeki FFmpeg klasörünü (varsa) PATH'in BAŞINA ekler; böylece tüm modüllerin `ffmpeg`/`ffprobe` çağrıları
/// önce pakettekini bulur, yoksa kullanıcının sistem kurulumuna düşer. Klasör yoksa `None` döner (PATH değişmez).
pub(crate) fn path_with_bundled(resource_dir: &Path, current: Option<std::ffi::OsString>) -> Option<std::ffi::OsString> {
    let dir = ["ffmpeg", "resources/ffmpeg"].iter().map(|d| resource_dir.join(d)).find(|d| d.join("ffmpeg.exe").is_file() && d.join("ffprobe.exe").is_file())?;
    let mut parts = vec![dir];
    if let Some(existing) = current { parts.extend(std::env::split_paths(&existing)); }
    std::env::join_paths(parts).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            if let Ok(dir) = app.path().resource_dir() {
                if let Some(path) = path_with_bundled(&dir, std::env::var_os("PATH")) { std::env::set_var("PATH", path); }
                stems::init_bundled(dir.join("stems"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trim_video, audio_mix::mix_video_audio, audio_mix::inspect_mix_media, project_io::read_project_file, project_io::write_project_file, subtitle_burn::burn_subtitles, library_db::recent_projects_list, library_db::recent_projects_touch, library_db::recent_projects_forget, media_fingerprint::file_fingerprint, media_fingerprint::find_moved_media, media_access::authorize_media, media_access::read_image_bytes, package_io::write_package, package_io::read_package, package_io::list_backups, package_io::restore_backup, package_media::collect_media, export_io::save_export_file, timeline_render::render_timeline, timeline_render::cancel_timeline_render, tool_check::check_tools, waveform::waveform_peaks, audio_denoise::denoise_audio, audio_denoise::denoise_ai_status, audio_denoise::denoise_ai_install, stems::stems_status, stems::stems_install_engine, stems::stems_import_model, stems::stems_separate, stems::stems_cancel, stems::stems_open_folder, audio_denoise::denoise_preview_dir, asr::asr_status, asr::asr_install_engine, asr::asr_install_model, asr::asr_transcribe, asr::asr_cancel, audio_center::split_center, cover::add_cover, ai::ai_status, ai::ai_save, ai::ai_clear, ai::ai_models, ai::ai_chat
        ])
        .run(tauri::generate_context!())
        .expect("VoxCut Studio baslatilamadi");
}

#[cfg(test)]
mod bundled_ffmpeg_tests {
    use super::*;
    use std::ffi::OsString;

    fn dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut paket ğş {name} {}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn bundled_dir_is_prepended_only_when_both_tools_exist() {
        let res = dir("var");
        assert!(path_with_bundled(&res, Some(OsString::from("C:\\Windows"))).is_none(), "klasör yokken PATH değişmemeli");
        std::fs::create_dir_all(res.join("ffmpeg")).unwrap();
        std::fs::write(res.join("ffmpeg").join("ffmpeg.exe"), b"x").unwrap();
        assert!(path_with_bundled(&res, None).is_none(), "ffprobe eksikken eklenmemeli");
        std::fs::write(res.join("ffmpeg").join("ffprobe.exe"), b"x").unwrap();
        let joined = path_with_bundled(&res, Some(OsString::from("C:\\Windows;C:\\Tools"))).unwrap();
        let parts: Vec<_> = std::env::split_paths(&joined).collect();
        assert_eq!(parts[0], res.join("ffmpeg"));
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[1], std::path::PathBuf::from("C:\\Windows"));
        let _ = std::fs::remove_dir_all(&res);
    }
}
