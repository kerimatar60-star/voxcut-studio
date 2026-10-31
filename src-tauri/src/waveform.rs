use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
};

use crate::audio_mix::probe;

/// Dalga formu için tepe değerleri: ses 8 kHz mono float'a çözülür, akış üzerinden kovalara bölünüp her kovanın en yüksek mutlak değeri alınır.
/// Bellek kullanımı yalnız kova sayısı kadardır (uzun dosyalarda bile sabit).
const SAMPLE_RATE: u32 = 8000;
const MIN_BUCKETS: usize = 50;
const MAX_BUCKETS: usize = 4000;

/// Örnek akışını sabit sayıda kovaya dağıtır; her kova için mutlak tepe (0..1) tutar. Toplam örnek sayısı önceden tahmin edilir;
/// beklenenden fazla örnek son kovaya düşer. Sonlu olmayan örnekler sessizlik sayılır.
struct PeakFolder { peaks: Vec<f32>, per_bucket: usize, index: usize }

impl PeakFolder {
    fn new(expected_total: usize, buckets: usize) -> Self { Self { peaks: vec![0.0; buckets], per_bucket: expected_total.div_ceil(buckets).max(1), index: 0 } }
    fn push(&mut self, sample: f32) {
        let slot = (self.index / self.per_bucket).min(self.peaks.len() - 1);
        let v = if sample.is_finite() { sample.abs().min(1.0) } else { 0.0 };
        if v > self.peaks[slot] { self.peaks[slot] = v; }
        self.index += 1;
    }
}

/// Test ve küçük girdiler için: tüm örnekleri verip kova tepelerini döndürür.
#[cfg(test)]
fn fold_peaks(samples: impl Iterator<Item = f32>, expected_total: usize, buckets: usize) -> Vec<f32> {
    let mut folder = PeakFolder::new(expected_total, buckets);
    samples.for_each(|s| folder.push(s));
    folder.peaks
}

fn compute(path: &str, buckets: usize) -> Result<Vec<f32>, String> {
    if !(MIN_BUCKETS..=MAX_BUCKETS).contains(&buckets) { return Err(format!("Kova sayısı {MIN_BUCKETS}–{MAX_BUCKETS} arasında olmalı.")); }
    if !Path::new(path).is_absolute() || !Path::new(path).is_file() { return Err("Medya dosyası bulunamadı.".into()); }
    let (duration, has_audio, _) = probe(path)?;
    if !has_audio { return Err("Dosyada ses akışı yok.".into()); }
    let expected = (duration * SAMPLE_RATE as f64).ceil() as usize;
    let mut child = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", &SAMPLE_RATE.to_string(), "-f", "f32le", "-"])
        .stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null())
        .spawn().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("FFmpeg çıktısı alınamadı.")?;
    let mut folder = PeakFolder::new(expected, buckets);
    let mut buf = vec![0u8; 64 * 1024];
    let mut carry: Vec<u8> = Vec::new();
    loop {
        let n = stdout.read(&mut buf).map_err(|e| format!("Ses okunamadı: {e}"))?;
        if n == 0 { break; }
        carry.extend_from_slice(&buf[..n]);
        let usable = carry.len() / 4 * 4;
        for b in carry[..usable].as_chunks::<4>().0 { folder.push(f32::from_le_bytes(*b)); }
        carry.drain(..usable);
    }
    let status = child.wait().map_err(|e| format!("FFmpeg beklenemedi: {e}"))?;
    if !status.success() || folder.index == 0 { return Err("Ses çözülemedi.".into()); }
    Ok(folder.peaks)
}

/// Dalga formu tepe değerlerini döndürür (0..1, `buckets` adet). Medya baytı IPC'den geçmez, yalnız sayılar.
#[tauri::command]
pub async fn waveform_peaks(path: String, buckets: usize) -> Result<Vec<f32>, String> {
    tauri::async_runtime::spawn_blocking(move || compute(&path, buckets)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn fold_peaks_takes_the_absolute_maximum_per_bucket() {
        let samples = [0.1f32, -0.5, 0.2, 0.0, 0.9, -0.3, 0.0, 0.0].into_iter();
        assert_eq!(fold_peaks(samples, 8, 4), vec![0.5, 0.2, 0.9, 0.0]);
    }

    #[test]
    fn fold_peaks_clamps_overflow_samples_into_the_last_bucket_and_limits_to_one() {
        let samples = std::iter::repeat_n(0.25f32, 10).chain(std::iter::once(3.0));
        let p = fold_peaks(samples, 4, 2); // beklenenden fazla örnek
        assert_eq!(p.len(), 2);
        assert_eq!(p[1], 1.0, "1'in üstü kırpılır");
    }

    #[test]
    fn rejects_bad_bucket_counts_and_missing_files() {
        assert!(compute("C:\\yok.wav", 10).is_err());
        assert!(compute("C:\\yok.wav", 100).unwrap_err().contains("bulunamadı"));
        assert!(compute("goreli.wav", 100).is_err());
        assert!(compute("C:\\yok.wav", 99999).is_err());
    }

    #[test]
    fn real_audio_shows_silence_then_tone_and_rejects_silent_video() {
        if Command::new("ffmpeg").arg("-version").output().is_err() { eprintln!("ffmpeg yok, test atlandı"); return; }
        let d = std::env::temp_dir().join(format!("voxcut dalga ğş {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        // 2 sn sessizlik + 2 sn 440 Hz (genlik ≈ 0,5) = 4 sn
        let wav = d.join("sessiz sonra ton.wav");
        let out = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2,volume=4", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", "-c:a", "pcm_s16le"]).arg(&wav).output().unwrap();
        assert!(out.status.success(), "fixture üretilemedi");
        let peaks = compute(wav.to_str().unwrap(), 100).unwrap();
        assert_eq!(peaks.len(), 100);
        let (first, second) = peaks.split_at(50);
        assert!(first[..45].iter().all(|p| *p < 0.02), "ilk yarı sessiz olmalı: {:?}", &first[..5]);
        assert!(second[5..].iter().all(|p| *p > 0.3 && *p <= 1.0), "ikinci yarı tonu göstermeli: {:?}", &second[5..10]);
        // Ses akışı olmayan video
        let silent = d.join("sessiz.mp4");
        let v = Command::new("ffmpeg").args(["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p"]).arg(&silent).output().unwrap();
        assert!(v.status.success());
        assert!(compute(silent.to_str().unwrap(), 100).unwrap_err().contains("ses akışı yok"));
        let _ = fs::remove_dir_all(&d);
    }
}
