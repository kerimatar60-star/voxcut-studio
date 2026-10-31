# Test Planı ve Kabul Kanıtları

## Çalıştırma

```powershell
npm run typecheck
npm test
npm run build
# Windows + Tauri önkoşulları hazırsa
npm run desktop:dev
npm run desktop:build
```

**Şu ana kadar:** `tests/subtitles.test.ts` test kaynağı mevcut; testleri koştuğunu söylemek için gerçek komut sonucunu kaydet. Bu proje paketinin oluşturulduğu Linux ortamında npm bağımlılık indirmesi ağ zaman aşımına uğradı; Windows Tauri build'i yapılmadı.

## Birim testleri

- `cuesToSrt`: Türkçe karakter, sıralama, boş başlık, decimal rounding, saat aşımı, üst üste cues.
- `parseProject`: bozuk JSON, şema versiyonu, 16K boyut limiti, aşırı asset sayısı, XSS olmayan düz metin.
- `designExport`: 1280×720 ve 1080×1920, transparency, font/şekil ölçüsü.
- A1: her `EditAction` undo/redo, clip index, path relink ve migration.

## Entegrasyon medya fixture'ları (A3)

Fixture kaynakları içerik izniyle, en az 5 video:
1. H.264/AAC 1080p/30 fps (sesli).
2. H.264 sessiz video 720p/24 fps.
3. 9:16 dikey video, 30 fps.
4. VFR mobil kayıt ve 44.1 kHz mono ses.
5. Bozuk container/eksik akış + Unicode uzun dosya adı.

Beklenen: bütün sağlam dosyalarda final MP4 `ffprobe` süre/codec/stream başarılı; bozuk girdide yönetilen hata; kaynak değişmemiş.

## Kullanıcı e2e senaryoları

1. Yeni proje → tasarım katmanı/metin/renk → PNG indirme → dosya açma.
2. 2 video + 2 ses → kliplerin track üzerinde düzenlenmesi → MP4 dışa aktarma (A3-A4).
3. Sesli videoda konuşma → müzik %20'ye duck → MP4 ve WAV çıkış (A4).
4. Ses gürültüsü azalt → orijinal/işlenmiş A/B dinle (A6).
5. Telifli olmayan müzikten 2- ve 4-stem → stem WAV dosyalarını oynat (A6).
6. Türkçe konuşma → Whisper transkript → manuel düzelt → SRT → burn-in MP4 (A7).
7. Projeyi kaydet, kapat, aç, eksik medya yolu relink ve timing kontrol (A1).
8. Export iptal → geçici dosya temizlenmeli, tamamlandı diye raporlanmamalı.
9. Düşük disk / GPU OOM → kullanıcıya anlaşılır uyarı; CPU fallback (A6/A8).
10. Temiz Windows kurulumu: NSIS install, edit/export, uninstall (A9).

## Performans, RAM/VRAM, zaman

Donanım i7 12. nesil, 16 GB RAM, RTX 3060 (VRAM tespit), SSD. 10 dk 1080p/30 video ve 8 ses track testleri; 4K proxy ön izleme; CPU/GPU/peak RAM ve render süresini logla. **Henüz ölçülmüş benchmark yok**, tahmini performansı ölçüm diye sunma.

## Rapor formatı

```md
### Test kaydı
- Tarih: ...
- Aşama/commit: ...
- Ortam: Windows sürüm, Node, Rust, ffmpeg, GPU VRAM
- Komut: ...
- Sonuç: PASS / FAIL / NOT RUN
- Kanıt: log / çıktı dosyası yolu / ffprobe özet
- Bloklayan sorunlar: ...
```

## Otomatik test envanteri — 2026-10-31 (A35 sonrası)
- `npm test` (Vitest, `vitest.config.ts` backup_* klasörlerini dışlar): 9 dosya — ses miksi modeli ve kalıcılığı, parmak izi alanları, altyazı (SRT/VTT içe-dışa, yakma planı), geri al/yinele, medya türü ve yol kalıcılığı, paket yolları ve manifest.
- `cargo test --offline --lib` (Rust, gerçek FFmpeg dahil): ses miksi yardımcıları, `subtitle_burn` (uçtan uca yakma), `library_db` (SQLite migration, son projeler), `media_fingerprint`, `media_access`, `package_io` (paket yaz/oku/yedek), `package_media` (kopyalama, dedupe, disk alanı, geri alma). `cargo clippy --offline --lib` uyarısız.
- Derleme: `npm run build` (tsc strict), `npm run tauri -- build --debug --no-bundle -- --offline`.
- Açılış duman testi: exe başlatılır, pencere başlığı "VoxCut Studio", `library.db` oluşur, WebView2 çalışır, süreç kapatılır.
- Tarayıcı modu (Vite önizleme, gerçek arayüz): tasarım, geri al/yinele, altyazı, medya, eski proje JSON'u.
- ELLE (GUI) KABUL BEKLEYENLER: dosya/klasör diyalogları, gerçek video-ses oynatma (asset protokolü), paket kaydet/aç/taşı, medya kopyalama onayı, otomatik kayıt döngüsü, altyazı yakılan MP4'ün oynatılması.
