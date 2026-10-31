# Güvenlik politikası

## Güvenlik açığı bildirme

Bir güvenlik açığı bulduysanız **herkese açık Issue açmayın.** GitHub'da bu deponun *Security → Report a vulnerability* (özel güvenlik bildirimi) özelliğini kullanın. Mümkünse şunları ekleyin: etkilenen sürüm, adımlar, etkisi ve (varsa) önerilen çözüm.

Alfa aşamadaki bir hobi projesi olduğu için kesin bir yanıt süresi veremem; makul sürede yanıtlamaya çalışırım.

## Kapsam ve tasarım ilkeleri

- Uygulama yerel çalışır; hesap, sunucu ve telemetri yoktur.
- Ağ yalnız kullanıcı "indir" dediğinde, koda gömülü sabit HTTPS adreslerinden (whisper.cpp ve Hugging Face) dosya indirir; her dosya boyut ve SHA-256 ile doğrulanır.
- FFmpeg, ffprobe ve Whisper kabuk kullanılmadan, argüman listesiyle başlatılır. Yollar mutlak ve doğrulanmış olmalıdır; mevcut dosyaların üzerine yazılmaz.
- Proje dosyaları medya baytı içermez; yalnız yol ve ayar tutar.

## Bilinen sınırlar

- Kurulum paketi **imzasızdır**; indirdiğiniz dosyanın SHA-256 özetini Release notundakiyle karşılaştırın.
- Paket FFmpeg'i gömer; FFmpeg'in kendi güvenlik güncellemeleri yeni sürümle gelir. Kendi güncel FFmpeg'inizi kullanmak için kurulum klasöründeki `ffmpeg` klasörünü silip PATH'e kendi sürümünüzü koyabilirsiniz.
