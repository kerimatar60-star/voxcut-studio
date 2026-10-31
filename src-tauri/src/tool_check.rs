use std::process::Command;

/// FFmpeg / FFprobe kurulum ve yetenek denetimi. Yalnız yerel `ffmpeg -version`, `-encoders`, `-filters` çıktıları okunur; ağ erişimi yok.
/// (ad, tamam mı, ayrıntı)
pub type Check = (String, bool, String);

const ENCODERS: &[(&str, &str)] = &[("libx264", "H.264 video kodlayıcı"), ("aac", "AAC ses kodlayıcı"), ("libmp3lame", "MP3 kodlayıcı"), ("flac", "FLAC kodlayıcı"), ("pcm_s16le", "WAV (PCM) kodlayıcı")];
const FILTERS: &[(&str, &str)] = &[("subtitles", "altyazı yakma (libass)"), ("sidechaincompress", "otomatik müzik kısma"), ("afftdn", "gürültü azaltma"), ("loudnorm", "ses seviyesi normalleştirme"), ("amix", "ses karıştırma"), ("alimiter", "limiter")];

pub(crate) fn first_line(text: &str) -> String { text.lines().next().unwrap_or("").trim().chars().take(160).collect() }

/// `-encoders` / `-filters` çıktısında ada göre tam eşleşme (üçüncü sütun ad).
pub(crate) fn lists(text: &str, name: &str) -> bool {
    text.lines().any(|l| l.split_whitespace().nth(1) == Some(name))
}

fn run(tool: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(tool).args(args).output().map_err(|e| format!("{tool} bulunamadı veya çalıştırılamadı: {e}"))?;
    if !out.status.success() { return Err(format!("{tool} hata kodu döndürdü.")); }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn collect() -> Vec<Check> {
    let mut checks: Vec<Check> = Vec::new();
    for tool in ["ffmpeg", "ffprobe"] {
        match run(tool, &["-version"]) {
            Ok(text) => checks.push((tool.to_string(), true, first_line(&text))),
            Err(e) => checks.push((tool.to_string(), false, e)),
        }
    }
    if checks[0].1 {
        let encoders = run("ffmpeg", &["-hide_banner", "-encoders"]).unwrap_or_default();
        for (name, what) in ENCODERS { checks.push((format!("kodlayıcı:{name}"), lists(&encoders, name), (*what).to_string())); }
        let filters = run("ffmpeg", &["-hide_banner", "-filters"]).unwrap_or_default();
        for (name, what) in FILTERS { checks.push((format!("filtre:{name}"), lists(&filters, name), (*what).to_string())); }
    }
    checks
}

/// Arayüz açılışında çağrılır; eksik araç/yetenek varsa kullanıcıya anlaşılır uyarı gösterilir.
#[tauri::command]
pub async fn check_tools() -> Result<Vec<Check>, String> {
    tauri::async_runtime::spawn_blocking(collect).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = " V....D libx264              libx264 H.264 / AVC\n A....D aac                  AAC (Advanced Audio Coding)\n A....D libmp3lame           libmp3lame MP3\n V....D libx264rgb           x264 RGB\n";

    #[test]
    fn lists_matches_whole_names_only() {
        assert!(lists(SAMPLE, "libx264"));
        assert!(lists(SAMPLE, "aac"));
        assert!(lists(SAMPLE, "libmp3lame"));
        assert!(!lists(SAMPLE, "libx26"), "kısmi ad eşleşmemeli");
        assert!(!lists(SAMPLE, "flac"));
        assert!(!lists("", "aac"));
        assert!(lists(" T.. subtitles        V->V       Render text subtitles\n", "subtitles"));
    }

    #[test]
    fn first_line_is_trimmed_and_bounded() {
        assert_eq!(first_line("ffmpeg version 9.0\nbuilt with gcc"), "ffmpeg version 9.0");
        assert_eq!(first_line(""), "");
        assert_eq!(first_line(&"x".repeat(500)).len(), 160);
    }

    #[test]
    fn real_machine_reports_all_required_capabilities() {
        if Command::new("ffmpeg").arg("-version").output().is_err() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let checks = collect();
        assert!(checks.iter().any(|c| c.0 == "ffmpeg" && c.1));
        assert!(checks.iter().any(|c| c.0 == "ffprobe" && c.1));
        let missing: Vec<_> = checks.iter().filter(|c| !c.1).map(|c| c.0.clone()).collect();
        assert!(missing.is_empty(), "eksik yetenekler: {missing:?}");
        assert_eq!(checks.len(), 2 + ENCODERS.len() + FILTERS.len());
    }
}
