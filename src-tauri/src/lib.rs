mod asr;
mod audio_center;
mod audio_denoise;
mod audio_mix;
mod export_io;
mod library_db;
mod media_access;
mod media_fingerprint;
mod package_io;
mod package_media;
mod project_io;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            trim_video, audio_mix::mix_video_audio, audio_mix::inspect_mix_media, project_io::read_project_file, project_io::write_project_file, subtitle_burn::burn_subtitles, library_db::recent_projects_list, library_db::recent_projects_touch, library_db::recent_projects_forget, media_fingerprint::file_fingerprint, media_fingerprint::find_moved_media, media_access::authorize_media, media_access::read_image_bytes, package_io::write_package, package_io::read_package, package_io::list_backups, package_io::restore_backup, package_media::collect_media, export_io::save_export_file, timeline_render::render_timeline, timeline_render::cancel_timeline_render, tool_check::check_tools, waveform::waveform_peaks, audio_denoise::denoise_audio, audio_denoise::denoise_preview_dir, asr::asr_status, asr::asr_install_engine, asr::asr_install_model, asr::asr_transcribe, asr::asr_cancel, audio_center::split_center
        ])
        .run(tauri::generate_context!())
        .expect("VoxCut Studio baslatilamadi");
}

