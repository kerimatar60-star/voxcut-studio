# Gizlilik bildirimi (taslak)

Son güncelleme: 2026-10-31 · Bu belge teknik davranışı anlatır; yayından önce hukuki inceleme gerekir.

## Kısaca

VoxCut Studio dosyalarınızı **bu bilgisayarda** işler. Hesap, giriş, abonelik, telemetri, reklam veya çevrimiçi analiz yoktur. Uygulama kendiliğinden internete bağlanmaz.

## Ağ erişimi — yalnız sizin tıklamanızla

Uygulama yalnızca aşağıdaki durumlarda internete çıkar. Birincisi: **Altyazı sekmesinde "Motoru indir" / "Modeli indir"** düğmelerine bastığınızda:

- `github.com/ggml-org/whisper.cpp` (konuşma tanıma motoru) ve `huggingface.co/ggerganov/whisper.cpp` (model dosyası) adreslerinden **dosya indirir**.
- Bu isteklere **sizin ses, video veya proje verileriniz eklenmez**; yalnız sabit dosya adresleri istenir. GitHub ve Hugging Face, her web isteğinde olduğu gibi IP adresinizi görebilir.
- İndirilen dosya doğrulanamazsa (boyut/SHA-256) silinir.

**Yazıyla tasarla (isteğe bağlı):** Tasarım sekmesinde kendi OpenAI API anahtarınızı kaydeder ve açık onay kutusunu işaretlerseniz, **"Tasarla" veya "Değişikliği uygula" düğmesine bastığınızda** `api.openai.com` adresine tasarım isteğiniz (yazdığınız metin; düzeltmede mevcut tasarımın metin ve renk bilgisi) gönderilir. Dosyalarınız, videolarınız ve sesleriniz gönderilmez. İstekler OpenAI hesabınızdan ücret kesebilir. Anahtar yalnızca bu Windows kullanıcısının çözebileceği şifreli biçimde uygulama veri klasöründe durur; "Anahtarı sil" ile kaldırılır. OpenAI'nin gizlilik koşulları geçerlidir.

Başka hiçbir özellik ağ kullanmaz. Vite geliştirme sunucusu yalnızca `127.0.0.1` dinler.

## Yerelde saklananlar

| Veri | Yer | Not |
|---|---|---|
| Projeler | Sizin seçtiğiniz `.voxcut.json` / `.voxcut` klasörü | Medya baytları içermez; yalnız dosya yolları ve ayarlar. |
| Son projeler listesi | Uygulama veri klasöründe SQLite | Yalnız ad ve yol; listeden "Unut" ile silinir. |
| Kurtarma kopyası | Uygulama yerel depolaması | Kaydedilmemiş oturum için; "Sil" ile silinir. |
| Whisper motoru ve modelleri | Uygulama veri klasörü, `asr/` | Silerek kaldırabilirsiniz. |
| Geçici dosyalar | Sistem geçici klasörü | İşlem bitince veya iptalde silinir. |

## Ses ve konuşma

Otomatik altyazı, seçtiğiniz dosyayı yerel Whisper ile işler; ses dışarı gönderilmez. Mikrofon kaydı **bu sürümde yoktur**; eklenirse kayıt öncesi görünür bir izin istenecektir.

## Günlükler

Günlüklere kişisel dosya içeriği, ses veya anahtar yazılmaz; hata iletileri yalnız teknik bilgi içerir. Dosya yolları hata iletilerinde görünebilir.

## Haklarınız ve silme

Tüm veriler sizin bilgisayarınızdadır; projeleri, uygulama veri klasörünü ve indirilen modelleri dosya yöneticisinden silmeniz yeterlidir. Bizde saklanan bir verinizi yoktur.
