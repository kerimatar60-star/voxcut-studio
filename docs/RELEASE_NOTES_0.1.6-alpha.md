**Windows 10/11 (64 bit) için ücretsiz, yerel çalışan video + ses + altyazı stüdyosu ve yazıyla tasarım aracı.** Hesap, abonelik ve telemetri yok.

## Bu sürümde ne yeni

- **Yazıyla tasarla (ChatGPT):** Tasarım sekmesi artık ne istediğini yazdığın bir araç. Kendi OpenAI API anahtarını bir kez kaydedersin (Ayarlar'da adımlar yazıyor); "Mor tonlarda YouTube kapağı, başlık: Yeni telefonu inceledim" gibi bir cümleden 3 öneri çıkar, beğendiğini seçer, "başlığı büyüt, rengi maviye çevir" gibi yazıyla değiştirirsin. **Bağlantı isteğe bağlıdır ve açık onayına bağlıdır:** yazdığın istek internet üzerinden OpenAI'ye gider, dosyaların gitmez; OpenAI hesabından küçük bir ücret kesilir. ChatGPT abonelik girişi yetmez, ayrı API anahtarı gerekir.
- **Kapak sekmesi:** Videoya kapak fotoğrafı ekle (dosya gezgininde ve oynatıcılarda küçük resim olur). Video yeniden kodlanmaz, orijinal dosyan değişmez.
- **Önizleme:** "Dışa Aktar" artık önce sonucu gösterir. Tasarımda gerçek çıktıyı, altyazıda kaydedilecek metni, video ve müzikte tüm katmanları birlikte oynatır; istediğin saniyeye gidip videoyu bölebilir, müziği oradan başlatabilir, altyazı ekleyebilirsin.
- Eski tasarım düzenleyicisi (sürükle-bırak, şablonlar) kaldırıldı; eski projelerin açılmaya devam eder.
- Yanlış kalmış yazılar düzeltildi.

## Bilmeniz gerekenler

- Bu bir **alfa** sürümdür. Yazıyla tasarla özelliği gerçek bir OpenAI hesabıyla henüz denenmedi; sorun olursa [Issue](https://github.com/kerimatar60-star/voxcut-studio/issues) açın.
- Önizleme yaklaşıktır: panorama, otomatik müzik kısma ve geçiş efektleri önizlemede duyulmaz/görülmez; kesin sonuç kaydedilen dosyadadır.
- Windows SmartScreen uyarı verebilir (imzasız): *Daha fazla bilgi → Yine de çalıştır*.

## İndirme

`VoxCut.Studio_0.1.6_x64-setup.exe` (≈ 176 MB). Yönetici izni gerekmez. Eski sürümün üzerine kurulur, projelerin etkilenmez.

**SHA-256:** `64981ef2f9b9c3e2b98d64dd4849313dc0e00db9982360899109307c05c6d1df`

PowerShell ile kontrol: `Get-FileHash "VoxCut.Studio_0.1.6_x64-setup.exe"`
