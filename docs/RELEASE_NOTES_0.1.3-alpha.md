**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan tasarım + video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## Bu sürümde ne yeni

- **Yapay zekâ ile ses ayrıştırma (yeni, ilk deneme sürümü):** Ses sekmesi → **"Yapay zekâ ile ayrıştırma"**. Bir şarkıyı veya kaydı **vokal, eşlik (vokalsiz müzik), davul, bas ve diğer** seslere ayırır. Demucs (Meta, MIT) modeli bu bilgisayarda, internete ses göndermeden çalışır. Motor (ONNX Runtime, ≈ 83 MB) ve model (≈ 168 MB) pakette yoktur; sizin onayınızla kurulur.
  - Çıktılar yeni dosyalar olarak kaydedilir (`ad_vokal.wav` gibi); kaynak dosyanız değişmez, mevcut dosyaların üzerine yazılmaz.
  - **Bu özellik alfadır ve gerçek bilgisayarda ilk kez denenecektir.** Bir sorun çıkarsa lütfen [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Sonuç kusursuz değildir: stemler arasında sızıntı ve yapaylık olabilir. İşlem CPU'da yapılır ve kayıt süresinden uzun sürebilir. En çok 8 dakikalık kayıtlar ayrıştırılır.
- 0.1.2: yapay zekâ ile gürültü temizleme (RNNoise). 0.1.1: Ö, İ ve Ü harflerinin noktalarının kırpılması düzeltildi.

## İndirme

`VoxCut.Studio_0.1.3_x64-setup.exe` (≈ 55 MB). Yönetici izni gerekmez.

**SHA-256:** `79c4901414bab32e6a8e683ffde08044b81734acc5a3ad5bd129a295d55f8a9b`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.3_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.

Eski sürümü kaldırmanız gerekmez; yeni kurulum üzerine yazar. Projeleriniz etkilenmez.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorunlar bekleyin, lütfen [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun.
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- Ses ayrıştırma modeli için indirme adresi henüz yayımlanmadı; geliştirici model dosyalarını ayrıca paylaşacak. Şimdilik "Yerel klasörden al" ile elle kurulur.
- Whisper motoru/modeli pakette yoktur; Altyazı sekmesinden **sizin onayınızla** iner.
- 10 dakikalık 1080p birleştirme ölçüldü (≈ 1 dk). Saatlik video ve 4K denenmedi.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini içerir; lisans metni kurulum klasöründeki `licenses\` altındadır. İndirilen bileşenler (ONNX Runtime MIT, Demucs MIT, RNNoise modelleri, Whisper MIT) için ayrıntı: [THIRD_PARTY_NOTICES](https://github.com/kerimatar60-star/voxcut-studio/blob/main/docs/THIRD_PARTY_NOTICES.md).
