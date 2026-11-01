**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan tasarım + video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## Bu sürümde ne yeni

- **Yapay zekâ ile ses ayrıştırma (yeni, ilk deneme sürümü):** Ses sekmesi → **"Yapay zekâ ile ayrıştırma"**. Bir şarkıyı veya kaydı **vokal, eşlik (vokalsiz müzik), davul, bas ve diğer** seslere ayırır. Demucs (Meta, MIT) modeli bu bilgisayarda, internete ses göndermeden çalışır. **Her şey kurulum dosyasının içinde gelir** (ONNX Runtime motoru ve model dahil): ek indirme veya kurulum adımı yoktur. Bu yüzden kurulum dosyası ≈ 176 MB'dır.
  - Çıktılar, kaynak dosyanın yanındaki "ad (ayrıştırılmış)" klasörüne yeni dosyalar olarak kaydedilir (`ad_vokal.wav` gibi); bitince **"Klasörü aç"** düğmesi çıkar. Kaynak dosyanız değişmez, mevcut dosyaların üzerine yazılmaz.
  - **Bu özellik alfadır ve gerçek bilgisayarda ilk kez denenecektir.** Bir sorun çıkarsa lütfen [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Sonuç kusursuz değildir: stemler arasında sızıntı ve yapaylık olabilir. İşlem CPU'da yapılır ve kayıt süresinden uzun sürebilir. En çok 8 dakikalık kayıtlar ayrıştırılır.
- **Yapay zekâ ile gürültü temizleme (RNNoise)** modelleri de artık pakette: "Modeli indir" adımı yok.
- 0.1.2: yapay zekâ ile gürültü temizleme (RNNoise). 0.1.1: Ö, İ ve Ü harflerinin noktalarının kırpılması düzeltildi.

## İndirme

`VoxCut.Studio_0.1.5_x64-setup.exe` (≈ 176 MB). Yönetici izni gerekmez.

**SHA-256:** `dbd7f3810c5c249d4f6d0dc7d569ac1fc01891ac18db22498dca1d9e71d04d0c`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.5_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.

Eski sürümü kaldırmanız gerekmez; yeni kurulum üzerine yazar. Projeleriniz etkilenmez.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorunlar bekleyin, lütfen [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun.
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- Otomatik altyazı (Whisper) motoru ve modeli pakette **yoktur** (model 74 MB–1,5 GB); Altyazı sekmesinden **sizin onayınızla** iner.
- 10 dakikalık 1080p birleştirme ölçüldü (≈ 1 dk). Saatlik video ve 4K denenmedi.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini içerir; lisans metni kurulum klasöründeki `licenses\` altındadır. İndirilen bileşenler (ONNX Runtime MIT, Demucs MIT, RNNoise modelleri, Whisper MIT) için ayrıntı: [THIRD_PARTY_NOTICES](https://github.com/kerimatar60-star/voxcut-studio/blob/main/docs/THIRD_PARTY_NOTICES.md).
