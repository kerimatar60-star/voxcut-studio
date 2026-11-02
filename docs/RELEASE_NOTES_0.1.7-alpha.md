**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## Bu sürümde ne yeni

- **Kapak sekmesi:** Videoya kapak fotoğrafı ekle (dosya gezgininde ve oynatıcılarda küçük resim olur). Video yeniden kodlanmaz, orijinal dosyan değişmez.
- **Önizleme:** "Dışa Aktar" artık önce sonucu gösterir. Altyazıda kaydedilecek metni; video ve müzikte tüm katmanları birlikte oynatır. İstediğin saniyeye gidip videoyu bölebilir, müziği oradan başlatabilir, altyazı ekleyebilirsin.
- **Tasarım sekmesi kaldırıldı.** Program artık yalnız video, ses, altyazı ve kapakla ilgilenir. Eski projelerin açılmaya devam eder.
- Yanlış kalmış yazılar düzeltildi (alt çubuk, Ses'te Dışa Aktar mesajı); sürüm numarası artık doğru görünüyor.
- Önceki sürümlerdeki yapay zekâ ses özellikleri (gürültü temizleme, şarkıyı vokal/davul/bas'a ayırma) aynen duruyor; hepsi kurulum dosyasının içinde gelir.

## İndirme

`VoxCut.Studio_0.1.7_x64-setup.exe` (≈ 176 MB). Yönetici izni gerekmez. Eski sürümün üzerine kurulur, projelerin etkilenmez.

**SHA-256:** `0b5800d29e7c543fbd58d36efd395b902c34886ef6d7f2e99d2632a745da591c`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.7_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorun olursa [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun.
- Önizleme yaklaşıktır: panorama, otomatik müzik kısma ve geçiş efektleri önizlemede duyulmaz/görülmez; kesin sonuç kaydedilen dosyadadır.
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- Otomatik altyazı (Whisper) motoru ve modeli pakette **yoktur** (model 74 MB–1,5 GB); Altyazı sekmesinden **sizin onayınızla** iner. Programda başka hiçbir internet bağlantısı yoktur.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini içerir; lisans metinleri kurulum klasöründeki `licenses\` altındadır. Diğer bileşenler (ONNX Runtime MIT, Demucs MIT, RNNoise modelleri, Whisper MIT) için ayrıntı: [THIRD_PARTY_NOTICES](https://github.com/kerimatar60-star/voxcut-studio/blob/main/docs/THIRD_PARTY_NOTICES.md).
