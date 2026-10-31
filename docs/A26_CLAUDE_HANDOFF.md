# A26 Claude kontrolü
Önce CLAUDE.md sonundaki tarihli A26 durumunu okuyun. Eski A0 tablosu tarihli A26 durumunu yansıtmıyor. Kurulumları tekrarlamayın. CPU yolu kullanılır, NVENC etkinleştirmeyin.

1. PowerShell: proje kökünde `powershell -ExecutionPolicy Bypass -File .\scripts\test-a26.ps1` çalıştırın. Bu test henüz çalıştırılmadı. Çıktı mevcutsa script üzerine yazmaz.
2. Çıktıyı oynatıp görüntü, orijinal ses ve 660 Hz tonu birlikte kontrol edin.
3. `npm run desktop:dev` ile Ses sekmesindeki A26 panelinden video + ses seçin. Her kanalın süresini kaynağın süresine göre girin. İlk denemede 5 sn altındaki seslerde varsayılan süreyi kısaltın.
4. İki ses, gecikme, fade, pan, sustur ve solo; sessiz kaynak video; Unicode yol; yanlış süre; mevcut hedef dosya korumasını sınayın. Başarısızlığı kaydedip yalnız ilgili parçayı düzenleyin.
5. Yeni motor video akışını kopyalar; MP4 uyumsuz video kodeki varsa gerçek FFmpeg hatası döner. Canlı miks ön izlemesi ve kalıcı miks projesi sonraki iştir.

Burada geçen kontroller: Vite/TypeScript build; mevcut 3 Vitest testi; Rust cargo check --offline. Ses/GUI kabul testi yapılmadı. A26 tamamlandı olarak işaretlemeyin.

2026-10-31 güncellemesi: CLI 660 Hz konuşma/müzik miks testi kullanıcı tarafından dinlenerek doğrulandı. Güncel dosya/süre/sekme/validasyon düzeltmeleri ve GUI otomasyon engeli için A26_TEST_RESULT.md okuyun. Eski 'test henüz yapılmadı' notları CLI için artık geçerli değil.
