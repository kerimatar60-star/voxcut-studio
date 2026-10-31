# VoxCut Studio 0.1.0 (alfa)

> GitHub Releases açıklamasına yapıştırılacak metin. Etiket: `v0.1.0-alpha`

**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan tasarım + video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## İndirme

`VoxCut.Studio_0.1.0_x64-setup.exe` (≈ 55 MB). Yönetici izni gerekmez.

**SHA-256:** `4204a08bf315e922f17a8c1cef1dce600b6fa3a48c37d7efd77f6a1501ca1703`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.0_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.
>
> Her yeniden derlemede dosya özeti değişir; yukarıdaki değer yalnız bu sürümdeki yüklenen dosya içindir.

## Bu sürümde neler var

- **Tasarım:** metin/şekil/görsel katmanları, döndürme-boyutlandırma, 13 özgün şablon, PNG/JPEG/WebP.
- **Video:** çok klipli birleştirme, 12 geçiş, renk ayarı, MP4 çıktı, ilerleme ve iptal.
- **Ses:** 8 ek kanal, ducking, dalga formu, MP4/WAV/MP3/FLAC, klasik gürültü temizleme, klasik vokal azaltma.
- **Altyazı:** düzenleme, SRT/VTT, videoya yakma, **Whisper ile yerel otomatik altyazı** (isteğe bağlı indirme).
- **Proje:** geri al/yinele, otomatik kayıt, `.voxcut` paketi + yedekler, medya yeniden bağlama.
- **Komutla düzenleme** (Türkçe cümle → plan → onay) ve koyu/açık tema.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorunlar bekleyin, lütfen [Issue](../../issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun (uygulama kaynak dosyalarınızı değiştirmez).
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- **Yapay zekâ ile enstrüman ayrıştırma yok** (yalnız klasik orta kanal yöntemi).
- Whisper motoru/modeli pakette yoktur; Altyazı sekmesinden **sizin onayınızla** iner (9 MB + 74 MB–1,5 GB).
- 10 dakikalık 1080p birleştirme ölçüldü (≈ 1 dk). Saatlik video ve 4K denenmedi.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini (BtbN, n9.0.2-39-g7adfbe40dc) içerir; lisans metni ve kaynak bilgisi kurulum klasöründeki `licenses\` altındadır. FFmpeg kaynak kodu: <https://github.com/FFmpeg/FFmpeg> (commit `7adfbe40dc`), derleme betikleri: <https://github.com/BtbN/FFmpeg-Builds>. Ayrıntı: [`docs/THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
