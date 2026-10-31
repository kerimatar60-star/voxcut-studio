# Teknik Mimari — VoxCut Studio

## Mimari hedef

```text
┌────────────────────────── React / TypeScript ──────────────────────────┐
│ Tasarım UI  │ Video NLE UI │ Ses DAW UI │ Altyazı UI │ Proje/Kütüphane │
│         Timeline State / Undo–Redo / Actions / Preview                 │
└───────────────────────────┬────────────────────────────────────────────┘
                            │ tipli IPC sözleşmesi
┌───────────────────────────▼──── Tauri v2 / Rust ───────────────────────┐
│ File/Path Guard │ Project Store │ Job Queue │ Progress │ Cancellation │
│ Cache / Proxies │ FFprobe       │ FFmpeg Render Planner / Executor     │
└──────┬─────────────────────────┬───────────────────────────────────────┘
       │                         │  izole yerel worker, onaylı model
    FFmpeg/ffprobe           whisper.cpp / Denoiser / Stem Splitter
       │                         │
 video+ses+altyazı         local model cache (NO cloud default)
       └────────────────────┬────┘
                        Export Verification
```

## Sorumluluk ve modül sınırları

| Katman | Görev | Yapmaması gereken |
|---|---|---|
| `src/features/design` | Tuval, shape/text/image, layer, export request | ffmpeg spawn |
| `src/features/video` | Clip/timeline state, kaynak trim, preview | Ham medya kaydını JSON içine gömme |
| `src/features/audio` | Ses klipleri, dalga formu, miks parametreleri | AI modeli UI thread'de yürütme |
| `src/features/subtitles` | Cue CRUD, SRT/VTT/pozisyon ve stiller | Kaynağı otomatik değiştirme |
| `src/features/library` | Dosya listesi, hash/mtime, media relink | Sınırsız klasör taraması |
| `src/features/export` | Preset ve iş durumu | Export tamamlanmadan başarılı gösterme |
| `src/features/ai` | Model yönetimi, güvenli işleri isteğe bağlı çağırma | Gizlice bulut API'ye dosya gönderme |
| `src-tauri/src/jobs` (plan) | İş kuyruğu, iş ilerleme, iptal | Serbest argümanlı shell çağrısı |
| `src-tauri/src/media` (plan) | ffprobe, transcode, mux, proxy, checksum | Kaynak dosyaya inplace yazma |
| `src-tauri/src/project` (plan) | Manifest, SQLite, atomic save, migration | Kişisel dosya yollarını log'a dökme |

## Timeline zaman tabanı

- UI saniye ile gösterir; veride **tamsayı mikrosaniye** kullan (`durationUs`, `startUs`, `sourceInUs`, `sourceOutUs`).
- Her clip: stable id, source asset id, track id, timeline start, source in/out, playback rate, opacity/volume/gain, geçiş referansı.
- Klip süresi = `(sourceOutUs - sourceInUs) / playbackRate`, float hesaplamayı sadece UI formatında yap.
- VFR dosyaları normalizasyon/render sırasında `ffprobe` ile incelenir; seek yakınsaması için keyframe/frame timestamp yönetimi.
- 44.1/48 kHz ses dönüştürme, tempo, zaman bazlı filtreler net olsun; her export kaynağı yeniden örnekleyebilir.
- Ön izleme ile export aynı modelden beslensin. İşlemlerin sonucu sürümler arası mümkün olduğunca deterministik olsun.

## Export pipeline (A3 ve sonrası)

1. Seçilen medya dosyaları üzerinde path izin ve varlık kontrolü; ffprobe ile duration, resolution, fps, channels, vcodec/acodec denetle.
2. İstenen export preset'i ve timeline manifestini doğrula; çakışan klip, boş zaman aralığı ve kayıp medya sorunlarını UI'da göster.
3. Gerekirse proxy ve intermediate cache üret; geçici dizin hesapla; disk alanını kontrol et.
4. Filtre grafiklerini timeline kliplerinden **tipli veri** ile oluştur (serbest string concat yok); ses `amix/afade/sidechaincompress`, video overlay/concat/transitions.
5. NVENC varsa kullanılabilen encoder'ı sorgula, preset'i sınırlara göre dönüştür; hata varsa kontrollü CPU fallback.
6. `ffmpeg -progress pipe:1` çıktısını parse et; gerçek job id ve ilerleme üret; iptalde child process tree sonlandır.
7. Geçici çıktı dosyasını ffprobe ile doğrula, başarısızsa korumalı hata/log oluştur; başarılıysa atomic rename ile hedef dosyaya taşı.
8. Nihai QA: süre toleransı, video varsa görüntü, ses varsa ses akışı, subtitling istenmişse alt yazı. Formatlar/lisanslar ayrıca denetlenir.

## AI pipeline (A6-A7)

`AIJob { id, type: 'denoise'|'separate'|'transcribe', assetId, parameters, modelId, device:'auto'|'cpu'|'cuda', status, progress }`

- Başlamadan lisans/bellek/indirilen model boyutu ve disk alanı göster; kullanıcı onayı al.
- 16 GB sistem RAM, RTX 3060 VRAM belirsizliği için ilk seçenek küçük modeller; model metadata gerekmeden GPU'ya güvenme.
- Uzun dosyalar parça bazında işlenip birleştirilir; OOM olursa CPU retry/yetersiz bellek açıklaması.
- Kaynak dosyayı değiştirme; sonuçları proje cache'ine ayrı stem/audio olarak ekle; A/B karşılaştırması.
- Transkripsiyon dil parametresi `tr`; zamanı onayla ve elle düzeltilebilir cue olarak sakla.

## Veri kurtarma ve cache

- Uygulama veri klasörü: Tauri `appDataDir` altındaki `VoxCutStudio` (gerçek OS API ile resolve).
- Kullanıcı projeleri `*.voxcut` manifest + gerekirse medya referansları; içeri alınmış medya ön tanımlı olarak çoğaltılmaz; kullanıcının seçtiği portable export opsiyonel.
- Autosave tüm dosyayı bloklamadan yaz; temp + rename; son 3 backup; v1→v2 migration testleri.
- Cache ayrı dizin; LRU sınırını ayarlardan seç; cache silmek proje dosyalarını etkilemez.
- Hiçbir medya dosyası sessizce buluta yüklenmez.

## Tech debt ve kalite kararları

- Mevcut `src/App.tsx` A0 prototipidir; A1'de feature modüllerine bölünür.
- Tarayıcıda `objectURL` sadece oturuma aittir ve JSON kaydında kaybolur, A1 bu eksikliği çözer.
- Tauri capability sadece `core:default`; dosya IO ve subprocess için yeni izinler minimum düzeyde ve gerekçeli eklenir.
- GUI UI tests (Playwright) A1; worker integration tests (FFmpeg fixtures) A3; desktop smoke test (Windows CI) A9.
