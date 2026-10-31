# VoxCut Studio 🎬🎙️🎨

**Ücretsiz, yerel-öncelikli tasarım + video + ses stüdyosu** (Windows 10/11 x64 hedefi).

> **Durum: ALPHA 0.1 / çalışan, kısmen test edilmiş uygulama.** Canva veya CapCut'ın tamamı değildir. Çalışanlar: tasarım tuvali + PNG; tek video kesme → MP4 ve çok kanallı ses miksi → MP4 (kullanıcı tarafından denendi); altyazı düzenleme, SRT/VTT içe-dışa aktarma ve altyazıyı videoya yakma; geri al/yinele; JSON ve `.voxcut` paket projeleri (göreli yollar, yedek, otomatik kayıt, kurtarma, son projeler); medya yolu + parmak iziyle yeniden bağlama. Masaüstü arayüz akışlarının çoğu henüz elle (GUI) kabul edilmedi; ayrıntı için `docs/FEATURE_MATRIX.md`. **Henüz yok:** çok klipli video timeline, WAV/MP3 çıktı, ses temizleme, enstrüman/vokal ayrıştırma, otomatik AI altyazı.

## Hızlı başlangıç (Windows / PowerShell)

**A.** ZIP'i aç, içindeki `voxcut-studio` klasörünü `D:\VoxCutStudio` gibi kısa bir yola taşı. Ardından PowerShell'de proje klasörüne gir:

```powershell
cd D:\VoxCutStudio
powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

**B.** Geliştirme araçların sağlamsa (Node.js 20.19+ / npm), bağımlılıkları kur ve kod doğrulamasını yap:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

**C.** Web üzerinden başlangıç arayüzünü aç:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-web.ps1
# Tarayıcı adresi: http://127.0.0.1:1420
```

**D.** Gerçek Windows masaüstü kabuğu için ayrıca **Rust (MSVC toolchain), Microsoft C++ Build Tools, WebView2** gerekir. Yüklendikten sonra:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-desktop.ps1
```

**E.** Windows `.exe` kurulum dosyası derlemek için (Windows cihazda):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
# Çıktı genellikle src-tauri\target\release\bundle\nsis\ altındadır.
```

Ayrıntılar: [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md). **Not:** scriptler Node/Rust/Build Tools'u otomatik yüklemez. Modeller ve FFmpeg de ayrıca onaylanarak entegre edilecek.

## Mevcut kullanılabilir işlevler

- Tasarım: metin / dikdörtgen / elips ekleme; metin ve renk değiştirme; sürükle-bırak konumlama; PNG çıkarma.
- Medya kütüphanesi: yerel görüntü, video, ses dosyasını mevcut oturumda seçme ve ön izleme; geçici nesne URL'leri.
- Altyazı: zaman kodlu cümle ekleme, düzenleme, silme, SRT dışa aktarma.
- Proje: JSON manifest kaydetme ve geri açma (**medya baytları manifest içinde değildir, yeniden yüklemek gerekir**).
- Tasarım, video, ses, altyazı sekmeleriyle bir sonraki aşamalar için arayüz taslağı.

## Planlanan ana işlevler

Gerçek NLE timeline, kesme/birleştirme/MP4, ses kanalları/miks, WAV/MP3, konuşma temizleme, enstrüman-vokal ayrımı (2/4 stem), Whisper Türkçe altyazı, altyazıyı videoya yakma, renk/video efektleri, şablon kütüphanesi, 1080p/4K proxy, NSIS release installer.

## Claude Code'u bu projede çalıştırma

1. Claude Code'u proje kök klasöründe aç; `CLAUDE.md` otomatik okunsun.
2. [`docs/FIRST_PROMPT.md`](docs/FIRST_PROMPT.md) içindeki ilk görevi gönder.
3. Projeyi önce **A0 → A1 → A2 ...** sırasıyla ilerlet. `docs/ROADMAP.md` her etap için kabul kriteri tanımlar.
4. Başarı raporlarında gerçekten geçmeyen testleri 'başarılı' işaretlemeyin.

## Proje dokümanları

- [`CLAUDE.md`](CLAUDE.md) — Claude'un ana kuralları ve eksiksiz modül planı.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — 10 aşamalı geliştirme ve çıkış kriterleri.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — katmanlar ve servis sınırları.
- [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) — çalışıyor mu / planlandı mı?
- [`docs/DATA_CONTRACTS.md`](docs/DATA_CONTRACTS.md) — proje ve clip veri modeli.
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) — birim, medya ve performans testleri.
- [`docs/AI_MODELS.md`](docs/AI_MODELS.md) — ses temizleme, Whisper, vokal stem ve GPU.
- [`docs/SECURITY_AND_LICENSES.md`](docs/SECURITY_AND_LICENSES.md) — gizlilik, FFmpeg ve model lisansı.
- [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md) — Windows başlangıcı / troubleshooting.
- [`docs/FIRST_PROMPT.md`](docs/FIRST_PROMPT.md) — doğrudan Claude'a verilecek komut.

## Geliştirici komutları

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run desktop:dev
npm run desktop:build
```

## Geliştirme ilkeleri

Yerel kullanım; zorunlu hesap yok; filigransız temel çıktı hedefi; telif haklarına saygı; çökmede proje kurtarma; dosya gizliliği; kullanıcı istemeden ücretli API/modelleri indirmeme. Bu paket hiçbir ücretli servis hesabı veya gizli anahtar içermez.

## A26 — 2026-10-31 güncel durum
- [TESTED: kullanıcı doğrulaması] A25 video kesme ve 10 saniyelik sesli MP4 çıktısı çalışıyor.
- [IMPLEMENTED] Ses sekmesinde ayrı A26 paneli: orijinal video sesi + en fazla 8 ek ses kanalı; seviye, pan, sustur/solo, kaynak kesiti, zamanlama, fade giriş/çıkış.
- [IMPLEMENTED] Rust tarafında doğrulanan yollar/süreler; FFmpeg amix + limiter; AAC ses, video akışı kopyalama; sessiz video desteği. Arka planda çalışır. Mevcut hedefin üzerine yazmaz; geçici dosya doğrulandıktan sonra yayımlar.
- [TESTED] npm run build (TypeScript dahil), npm test (mevcut 3 test), cargo check --offline geçti. Bu kontroller yeni ses miksinin duyularak doğrulandığı anlamına gelmez.
- [PENDING / Claude] scripts/test-a26.ps1: mevcut test videosu + 660 Hz ton → test-output/VoxCut_A26_SesMix_Test.mp4. Henüz çalıştırılmadı.
- [PENDING / Claude] Masaüstünde sessiz video, çoklu ses, solo/sustur, pan, fade, gecikme, Unicode yollar, geçersiz süre ve mevcut hedef koruması kontrol edilmeli.
- Sınırlar: miks canlı ön izlemesi, ayarların proje JSON'una kaydı, waveform, iptal/ilerleme ve WAV/MP3 henüz yok. Sekmeden çıkınca A26 ayarları sıfırlanır. AI özellikleri planlandı.
- Geri alma: backup_A26_20261031_140047 içindeki değiştirilmeden önceki dosyalar korunmuştur. Yeni dosyalar: src/components/AudioMixPanel.tsx, src-tauri/src/audio_mix.rs, scripts/test-a26.ps1.

## A26 uygulama akışı — 2026-10-31
- [TESTED / kullanıcı] VoxCut_A26_KonusmaMix_Test.mp4: 10 sn, H.264 + AAC; konuşma, mevcut müzik ve eklenen 660 Hz ton birlikte duyuldu. Bu CLI testidir; GUI kabulüyle karıştırılmamalı.
- [IMPLEMENTED] inspect_mix_media komutu ile gerçek kaynak süresi ve ses/video akışı kontrolü; yeni kanala kaynak/video süresine göre başlangıç kesiti.
- [IMPLEMENTED] Sekme değişiminde panel unmount edilmez, oturum içindeki miks ayarları korunur. Kapatıp açınca veya JSON kaydet/aç ile miks geri yükleme henüz yok.
- [IMPLEMENTED] Dışa aktarma öncesi kesit, fade, seviye ve zamanlama doğrulaması. Çıktıda hem video hem ses akışı kontrolü.
- [TESTED] TypeScript/Vite build, 7 Vitest testi ve cargo check --offline geçti. Solo/sustur önceliği, yanlış kesit/fade ve video sonunda kesme kararı için 4 yeni test var.
