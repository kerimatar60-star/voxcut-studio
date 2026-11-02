# Üçüncü taraf bileşenler ve lisanslar

Son güncelleme: 2026-10-31 · Bu belge bir **hukuki görüş değildir**; yayından önce her satırın sürüm ve lisans metni yeniden doğrulanmalıdır (`npm ls`, `cargo tree`, `Cargo.lock`, `package-lock.json`).

## Uygulamayla birlikte dağıtılan bileşenler

| Bileşen | Kullanım | Lisans |
|---|---|---|
| React, React DOM | Arayüz | MIT |
| lucide-react | Simgeler | ISC |
| Tauri (çekirdek, `tauri-plugin-dialog`, `@tauri-apps/api`) | Masaüstü kabuğu | MIT veya Apache-2.0 |
| rusqlite (+ gömülü SQLite) | Son projeler listesi | MIT (rusqlite); SQLite kamu malı |
| sha2, serde_json | Özet ve JSON | MIT veya Apache-2.0 |

Rust bağımlılıklarının tam ve geçişli listesi `src-tauri/Cargo.lock` içindedir; çoğu MIT/Apache-2.0'dır. Yayın öncesi `cargo tree` çıktısı ile lisanslar toplu denetlenmelidir (örn. `cargo-license` / `cargo-deny`); bu denetim **henüz yapılmadı**.

## Yalnız geliştirmede kullanılanlar (pakete girmez)

TypeScript (Apache-2.0), Vite (MIT), Vitest (MIT), `@vitejs/plugin-react` (MIT), `@tauri-apps/cli` (MIT/Apache-2.0), **axe-core (MPL-2.0; yalnız erişilebilirlik taramasında kullanılır)**.

## Harici süreç olarak çalıştırılan araçlar (FFmpeg pakete gömülü; Whisper indirilir)

| Araç | Nasıl kullanılır | Lisans notu |
|---|---|---|
| **FFmpeg / FFprobe** | **Kurulum paketine gömülüdür** (BtbN `win64-gpl-shared`, n9.0.2-39-g7adfbe40dc; ayrı süreç olarak çalıştırılır, değiştirilmez). Kullanıcı isterse kendi kurulumunu PATH'e koyabilir. | **GNU GPL v3** (libx264 dahil). Lisans metni: `licenses\FFMPEG-LICENSE.txt`; kaynak ve sürüm bilgisi: `licenses\FFMPEG-NOTICE.txt`. Bu nedenle kurulum paketini dağıtan kişi GPL yükümlülüklerini (lisans metni, kaynak erişimi) sağlamalıdır. |
| **whisper.cpp** (`ggml-org/whisper.cpp`, sürüm etiketi b5454, `whisper-bin-x64.zip`) | Kullanıcı Altyazı sekmesinde onaylayınca indirilir; uygulama veri klasörüne kurulur. | MIT |
| **Whisper ggml modelleri** (`ggerganov/whisper.cpp`, Hugging Face) | Kullanıcı seçip onaylayınca indirilir. | OpenAI Whisper ağırlıkları MIT |
| **ONNX Runtime** (Microsoft, `onnxruntime-win-x64-1.31.1.zip`; yalnız `onnxruntime.dll` ve `onnxruntime_providers_shared.dll` kullanılır) | **Kurulum paketine gömülüdür** (`stems\`, yalnız `onnxruntime.dll` ve `onnxruntime_providers_shared.dll`); DLL tam yoldan yüklenir. Lisans metni `licenses\ONNXRUNTIME-LICENSE.txt`. (Paket dışı kurulumda "Kurulumu tamamla" resmî adresten indirir.) SHA-256 `5869e26bb25314375f2d5ef1877e3ea06b1543d6c710e6e4a1ec2f7177ab4b2c`. | MIT |
| **Demucs `htdemucs` modeli** (Meta; ONNX'e çevrilmiş) | **Kurulum paketine gömülüdür** (`stems\`, ≈ 168 MB); lisans metni `licenses\DEMUCS-LICENSE.txt`. Ağırlıklar Meta'nın resmî `dl.fbaipublicfiles.com` dosyasından, STFT'si ağın dışına alınmış dışa aktarma betiğiyle (`sevagh/demucs.onnx`, MIT) çevrildi. | Demucs kodu ve model ağırlıkları MIT (Meta). Dışa aktarma betikleri MIT |
| **RNNoise modelleri** (`GregorR/rnnoise-models`, `sh.rnnn` ve `mp.rnnn`, ≈ 0,3 MB) | **Kurulum paketine gömülüdür** (`stems\`; paketten bağımsız kurulumda "Modeli indir"le indirilir); FFmpeg `arnndn` süzgeci çalıştırır. Adres tek bir commit'e sabittir. | Depo sahibi: "hiçbir parçası telif hakkına tabi değildir" (README). Üretim araçları (`tools/`) kullanılmaz. RNNoise yöntemi BSD-3 |

İndirilen her dosyanın kaynağı, boyutu ve SHA-256 özeti `docs/AI_MODELS.md` içindedir; uygulama bunları indirme sırasında doğrular.

## Yazı tipleri ve içerik

Uygulama hiçbir yazı tipi dosyası **dağıtmaz**; yalnız Windows'ta hazır gelen sistem yazı tiplerini adıyla kullanır (Arial, Segoe UI, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman, Impact, Courier New). Tasarım şablonları (13 adet) bu depoda özgün olarak yazılmıştır; marka, logo veya üçüncü taraf görsel içermez. Kullanıcının eklediği medyanın telif sorumluluğu kullanıcıya aittir.

## Henüz yapılmayanlar

- Rust ve npm bağımlılıklarının otomatik lisans taraması ve imza/bildirim dosyası üretimi.
- Kurulum paketi içine lisans metinlerinin (MIT/Apache tam metinleri) eklenmesi.
- GPU (CUDA) için Whisper veya ayrıştırma modelleri: eklenirse bu belge güncellenmelidir.

**OpenAI API (hizmet, pakete gömülü değil):** "Yazıyla tasarla" kullanıcının kendi anahtarı ve onayıyla `api.openai.com` adresine bağlanır. Hizmet koşulları, fiyatlandırma ve veri işleme OpenAI'ye aittir; bu belge hukuki inceleme gerektiren bir taslaktır.
