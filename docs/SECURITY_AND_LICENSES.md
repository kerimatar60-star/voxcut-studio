# Güvenlik, Gizlilik, Dağıtım ve Lisans Denetimi

## Yerel gizlilik

- Kullanıcının video, ses, fotoğraf, transkriptleri cihazında kalır; otomatik upload, analytics veya API **kapalı**.
- Mikrofon/ekran kaydı ayrı kullanıcı izni ile; kayıt göstergesi görünür, durdurma ve silme seçeneği.
- Hata logları medya içeriklerini ve açık dosya yollarını varsayılan olarak kaydetmez.
- Web ön izleme yerel `127.0.0.1` üzerinden sunulur, ağ arayüzlerine açılmaz.
- İleride hesap/bulut eklenirse privacy policy, şifreleme, erişim yetkisi ve açık rıza ayrı tasarlanır.

## Dosya/komut güvenliği

- Tauri minimal `capabilities/default.json`; dosya erişimi seçim doğrulamasıyla sınırlandırılır.
- `Command::new(binary).args([...])` gibi argv ile çalıştır; string shell interpolate etme; `shell: true` kullanma.
- Desteklenmeyen/bozuk medya, sıfır süre, anormal codec header, zip bomb, path traversal, symlink escape, ses cihazı izni test edilir.
- Girdi dosyasının üstüne doğrudan yazma; geçici dosya + doğrulama + atomik taşıma.
- CPU/VRAM ve disk kota sınırları; child process timeout, cancel ve process-tree cleanup.

## Kaynak lisansı ve telif

- FFmpeg bileşenlerinin lisansı yapılandırmaya bağlı **LGPL veya GPL** olabilir. Kullanılan binary'nin konfigürasyonunu, lisanslarını, kaynak bildirimlerini ve dağıtım yükümlülüklerini doğrulamadan binary'yi installer'a gömme.
  - Resmî açıklama: https://www.ffmpeg.org/legal.html
- Tauri, React, yardımcı NPM paketleri ve fontların lisansları sürüm bazında audit edilmeli.
- Whisper/AI modellerinin **kod lisansı ile ağırlık lisansı** ayrıdır; her model kaynağı, SHA-256, sürüm, lisans, attribution kaydı gerekir.
- Üçüncü taraf şablon, müzik, stok görüntü veya ikon **lisanssız** dahil edilmez; kullanıcıların kendi içeriklerinin kullanım hakları kendilerine aittir.
- `README.md` ve installer 'ücretsiz' diyebilir; **teliften muaf sınırsız müzik, sınırsız cloud AI, sınırsız hız** vaat edilemez.
- Canva/CapCut'ın isim/logo/arayüz tasarımı kopyalanmaz; yalnızca kategori benzerliği kullanılır.

## Dağıtım kontrol listesi

- [ ] Rust ve NPM dependency audit (güvenlik + lisans)
- [ ] FFmpeg build config ve GPL/LGPL uyumluluk raporu
- [ ] AI model ağırlıklarının ticari kullanım koşulları
- [ ] NSIS kurulum/çıkarma ve app data davranışı
- [ ] Gizlilik metni, medya dosyası paylaşımı varsayılan kapalı
- [ ] Runtime izinleri, eksik dosya/bozuk medya recovery
- [ ] Kod imzalama/SmartScreen stratejisi
- [ ] Kurulum çıktısının SHA-256 checksum'ı
- [ ] 'No telemetry by default' ve güvenlik raporlama kanalı

- rusqlite 0.41.1 (MIT) + gömülü SQLite (public domain): yalnız yerel metadata veritabanı; ağ erişimi yok. Eklenme: 2026-10-31, kullanıcı onayıyla.
