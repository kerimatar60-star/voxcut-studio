**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan tasarım + video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## Bu sürümde ne yeni

- **Yapay zekâ ile ses temizleme (yeni):** Ses sekmesi → Ses temizleme → **"Yapay zekâ"** yöntemi. RNNoise sinir ağı fan, uğultu ve oda gürültüsünü azaltır. Küçük bir model (≈ 0,3 MB) gerekir; pakette gelmez, **"Modeli indir"** düğmesine bastığınızda GitHub'dan iner ve doğrulanır. Ses dosyalarınız internete gönderilmez. Klasik yöntem de seçenek olarak duruyor.
  - Ölçüm: Windows ile üretilen konuşmaya karıştırılan sabit gürültü yaklaşık **20 dB** azaldı, konuşma düzeyi yaklaşık 0,3 dB değişti. Ses kalitesi kulakla değerlendirilmedi; müzik içeren seste müziği bozabilir. Konuşma kayıtları için önerilir.
- 0.1.1'deki düzeltme (Ö, İ, Ü harflerinin noktaları) bu sürümde de var.

## İndirme

`VoxCut.Studio_0.1.2_x64-setup.exe` (≈ 55 MB). Yönetici izni gerekmez.

**SHA-256:** `4fb00a8f3acb9ca805e536edda54e5e4c27ade6c315a0e29d5d5d1a38f52f22d`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.2_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.

Eski sürümü kaldırmanız gerekmez; yeni kurulum üzerine yazar. Projeleriniz etkilenmez.

## Bu sürümde neler var

- **Tasarım:** metin/şekil/görsel katmanları, döndürme-boyutlandırma, 13 özgün şablon, PNG/JPEG/WebP.
- **Video:** çok klipli birleştirme, 12 geçiş, renk ayarı, MP4 çıktı, ilerleme ve iptal.
- **Ses:** 8 ek kanal, ducking, dalga formu, MP4/WAV/MP3/FLAC, gürültü temizleme (klasik veya yapay zekâ), klasik vokal azaltma.
- **Altyazı:** düzenleme, SRT/VTT, videoya yakma, **Whisper ile yerel otomatik altyazı** (isteğe bağlı indirme).
- **Proje:** geri al/yinele, otomatik kayıt, `.voxcut` paketi + yedekler, medya yeniden bağlama.
- **Komutla düzenleme** (Türkçe cümle → plan → onay) ve koyu/açık tema.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorunlar bekleyin, lütfen [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun (uygulama kaynak dosyalarınızı değiştirmez).
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- **Yapay zekâ ile enstrüman/vokal ayrıştırma henüz yok** (yalnız klasik orta kanal yöntemi). Üzerinde çalışılıyor.
- Whisper motoru/modeli pakette yoktur; Altyazı sekmesinden **sizin onayınızla** iner (9 MB + 74 MB–1,5 GB).
- 10 dakikalık 1080p birleştirme ölçüldü (≈ 1 dk). Saatlik video ve 4K denenmedi.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini (BtbN, n9.0.2-39-g7adfbe40dc) içerir; lisans metni ve kaynak bilgisi kurulum klasöründeki `licenses\` altındadır. FFmpeg kaynak kodu: <https://github.com/FFmpeg/FFmpeg> (commit `7adfbe40dc`), derleme betikleri: <https://github.com/BtbN/FFmpeg-Builds>. İndirilen RNNoise modelleri için ayrıntı: [THIRD_PARTY_NOTICES](https://github.com/kerimatar60-star/voxcut-studio/blob/main/docs/THIRD_PARTY_NOTICES.md).
