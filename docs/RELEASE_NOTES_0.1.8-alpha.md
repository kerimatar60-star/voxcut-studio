**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan video + ses + altyazı stüdyosu.** Hesap, abonelik, bulut ve telemetri yok.

## Bu sürümde ne yeni

- **Yeni açılış sayfası:** Program artık "Merhaba! Ne yapmak istiyorsun?" diye soran bir ana sayfayla açılır. Dört kart seni doğru bölüme götürür; son projelerin de burada.
- **Her iş ayrı kartta:** Video ve Ses bölümlerinde önce işi seçersin (Videoyu kes, Videoları birleştir, Gürültüyü azalt, Şarkıyı parçalara ayır…), ekranda yalnız o işin araçları görünür. Kalabalık kalktı.
- **Yardım turu:** İlk açılışta 3 adımlık kısa bir tanıtım çıkar; üstteki ve alttaki "Yardım" ile tekrar açabilirsin.
- **Daha sade dil:** Teknik kelimeler günlük Türkçeye çevrildi ("Yavaş açılma", "Yalnız bunu dinle", "Projeyi kaydet"…). Alt çubuk sadeleşti.
- Önceki sürümdeki Kapak sekmesi, katmanlı önizleme ve yapay zekâ ses özellikleri aynen duruyor.

## İndirme

`VoxCut.Studio_0.1.8_x64-setup.exe` (≈ 176 MB). Yönetici izni gerekmez. Eski sürümün üzerine kurulur, projelerin etkilenmez.

**SHA-256:** `ef3d181949904846e904372806083984369005d2747b4a0397ed99bcb70e95f1`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.8_x64-setup.exe"`

> ⚠️ **İmzasız:** Windows SmartScreen uyarı verebilir → *Daha fazla bilgi → Yine de çalıştır*. Dosyayı yalnız bu sayfadan indirin ve özetini karşılaştırın.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür; sorun olursa [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın. Önemli işlerinizde orijinal dosyalarınızı yedekte tutun.
- Altyazı bölümü henüz yeni kart düzenine geçmedi; eski düzeniyle çalışır.
- Önizleme yaklaşıktır: panorama, otomatik müzik kısma ve geçiş efektleri önizlemede duyulmaz/görülmez; kesin sonuç kaydedilen dosyadadır.
- **Türkçe konuşma tanıma doğruluğu ölçülmedi**; çıktıyı dinleyip düzeltin.
- Otomatik altyazı (Whisper) motoru ve modeli pakette **yoktur** (model 74 MB–1,5 GB); Altyazı sekmesinden **sizin onayınızla** iner. Programda başka hiçbir internet bağlantısı yoktur.

## Lisanslar

VoxCut Studio kaynak kodu **MIT**. Kurulum paketi, **GPL v3** lisanslı bir **FFmpeg** derlemesini içerir; lisans metinleri kurulum klasöründeki `licenses\` altındadır. Diğer bileşenler (ONNX Runtime MIT, Demucs MIT, RNNoise modelleri, Whisper MIT) için ayrıntı: [THIRD_PARTY_NOTICES](https://github.com/kerimatar60-star/voxcut-studio/blob/main/docs/THIRD_PARTY_NOTICES.md).
