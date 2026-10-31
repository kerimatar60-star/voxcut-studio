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

## Pakete GÖMÜLMEYEN, harici çalıştırılan araçlar

| Araç | Nasıl kullanılır | Lisans notu |
|---|---|---|
| **FFmpeg / FFprobe** | Kullanıcının kendi kurduğu `ffmpeg` ayrı bir süreç olarak çağrılır; VoxCut Studio onu **dağıtmaz**. | Derlemeye bağlıdır: LGPL 2.1+ veya (libx264/libx265 gibi bileşenlerle) **GPL 2+/3**. Uygulama libx264 kullanan bir derleme bekler. FFmpeg'i pakete eklemek istenirse lisans yükümlülükleri (kaynak sunumu, GPL) ayrıca değerlendirilmelidir. |
| **whisper.cpp** (`ggml-org/whisper.cpp`, sürüm etiketi b5454, `whisper-bin-x64.zip`) | Kullanıcı Altyazı sekmesinde onaylayınca indirilir; uygulama veri klasörüne kurulur. | MIT |
| **Whisper ggml modelleri** (`ggerganov/whisper.cpp`, Hugging Face) | Kullanıcı seçip onaylayınca indirilir. | OpenAI Whisper ağırlıkları MIT |

İndirilen her dosyanın kaynağı, boyutu ve SHA-256 özeti `docs/AI_MODELS.md` içindedir; uygulama bunları indirme sırasında doğrular.

## Yazı tipleri ve içerik

Uygulama hiçbir yazı tipi dosyası **dağıtmaz**; yalnız Windows'ta hazır gelen sistem yazı tiplerini adıyla kullanır (Arial, Segoe UI, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman, Impact, Courier New). Tasarım şablonları (13 adet) bu depoda özgün olarak yazılmıştır; marka, logo veya üçüncü taraf görsel içermez. Kullanıcının eklediği medyanın telif sorumluluğu kullanıcıya aittir.

## Henüz yapılmayanlar

- Rust ve npm bağımlılıklarının otomatik lisans taraması ve imza/bildirim dosyası üretimi.
- Kurulum paketi içine lisans metinlerinin (MIT/Apache tam metinleri) eklenmesi.
- GPU (CUDA) için Whisper veya ayrıştırma modelleri: eklenirse bu belge güncellenmelidir.
