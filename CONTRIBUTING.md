# Katkı rehberi

Katkılar (hata raporu, öneri, kod, çeviri, test) memnuniyetle karşılanır.

## Hata bildirme

[Issues](../../issues) üzerinden "Hata raporu" şablonunu doldurun: Windows sürümü, uygulama sürümü, yaptığınız adımlar, beklenen ve gerçekleşen davranış. Mümkünse hata iletisini olduğu gibi yapıştırın. **Kişisel dosya, ses kaydı veya yol içeren ekran görüntüsü paylaşmadan önce kontrol edin.**

## Kod katkısı

1. Depoyu çatallayın, `main`'den bir dal açın.
2. Küçük, tek amaçlı değişiklikler yapın.
3. Değişikliğinizi çalıştırın ve test edin:

   ```powershell
   npm install
   npm run typecheck
   npm test
   npm run build
   cd src-tauri; cargo test; cargo clippy --all-targets
   ```

4. Yeni davranış için test ekleyin. Rust'ta FFmpeg gerektiren testler FFmpeg yoksa atlanır; yine de gerçek FFmpeg ile çalıştırın.
5. Pull request açıklamasında **neyi değiştirdiğinizi, neyi nasıl test ettiğinizi ve neyi test edemediğinizi** yazın.

## Proje kuralları (özet)

- Özellikleri olduğundan fazla göstermeyin: çalışmayan özellik arayüzde "Planlandı" ve devre dışı olmalı. Durum tablosu: [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md).
- Kullanıcı verisi yerelde kalır. Ağ erişimi yalnız kullanıcı onayıyla ve sabit, doğrulanmış adreslerle olur.
- Dışarıdan çalıştırılan araçlar (FFmpeg, Whisper) kabuk üzerinden değil, argüman listesiyle başlatılır; yollar doğrulanır; mevcut dosyaların üzerine yazılmaz.
- Arayüz metinleri Türkçedir.
- Yeni üçüncü taraf bileşen eklerken lisansını [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md) dosyasına işleyin. GPL/telifli içerik eklemeyin.
- Katkınız MIT lisansı ([`LICENSE`](LICENSE)) altında yayımlanır.

## Yapay zekâ destekli geliştirme

Bu depo bir kodlama asistanıyla geliştirildi; asistanın sözleşmesi [`CLAUDE.md`](CLAUDE.md) içindedir. İnsan katkıcıların bunu okuması gerekmez.
