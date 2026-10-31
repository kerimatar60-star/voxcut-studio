# Özellik Matrisi — Gerçek durum ve kabul kriteri

| ID | Özellik | Durum | Test / kabul kanıtı |
|---|---|---|---|
| F001 | React/Vite çalışma alanı | CODED | `npm run build` bu ortamda ağ bağımlılıkları nedeniyle henüz doğrulanamadı |
| F002 | Tauri v2 kabuk | CODED | Windows üzerinde Rust/Build Tools ile `desktop:dev` gerekli |
| F003 | Metin/şekil sürükle ve özellik değiştir | CODED | UI smoke henüz tamamlanmadı |
| F004 | PNG tasarım çıktısı | CODED | 1280×720 PNG el ile kontrol edilmeli |
| F005 | Medya içe alma/yerel ön izleme | CODED | İşlev oturum içi; kalıcılık A1 |
| F006 | JSON proje indir/aç | CODED | Medya yeniden bağlama henüz eksik |
| F007 | Elle altyazı ve SRT | CODED | Vitest testleri yazıldı; `npm test` çalıştırılmalı |
| F008 | Çok katmanlı görsel düzenleme | PLAN | A2, görsel layer ve şablonlar |
| F009 | Gerçek video kesme/birleştirme | PLAN | A3, ffprobe doğrulanmış MP4 |
| F010 | Çok track ses mix | PLAN | A4, gerçek wave file |
| F011 | Videoya müzik/efekt/ducking | PLAN | A4, MP4'ta ses denetimi |
| F012 | WAV/MP3 ses çıkışı | PLAN | A4, format/duration testleri |
| F013 | SRT/VTT import ve burn-in | IMPLEMENTED (birim testli; GUI kabulü bekliyor) | A28 burn-in, A29 SRT/VTT import + VTT export |
| F014 | Ses gürültüsü temizleme | PLAN | A6, input-output A/B |
| F015 | Vokal/instrumental ayırma | PLAN | A6, 2-stem WAV dosyaları |
| F016 | Davul/bas/diğer/vokal ayırma | PLAN | A6, 4-stem WAV dosyaları |
| F017 | Türkçe otomatik altyazı | PLAN | A7, Whisper yerel modeli |
| F018 | Komutla video/ses düzenleme | PLAN | A8, schema+diff+undo |
| F019 | 4K/proxy NVENC | PLAN | A8, GPU/CPU fallback |
| F020 | Windows NSIS dağıtım | PLAN | A9, temiz sistem kurulum testi |
| F021 | Tam proje kalıcılığı/relink | PLAN | A1, kapat-aç sonra medya bulunmalı |
| F022 | Undo/redo + autosave | PLAN | A1, çökme sonrası kurtarma |

`CODED`, *işlev gerçekten doğrulandı* anlamına gelmez. Aşama tamamlandığında bu tabloda test tarihi, ortam, çalışma kanıtı ve commit numarasını ekle. İşe başlamadan önce geçmiş satırları doğru güncelle.

## A26 — 2026-10-31 güncel durum
- [TESTED: kullanıcı doğrulaması] A25 video kesme ve 10 saniyelik sesli MP4 çıktısı çalışıyor.
- [IMPLEMENTED] Ses sekmesinde ayrı A26 paneli: orijinal video sesi + en fazla 8 ek ses kanalı; seviye, pan, sustur/solo, kaynak kesiti, zamanlama, fade giriş/çıkış.
- [IMPLEMENTED] Rust tarafında doğrulanan yollar/süreler; FFmpeg amix + limiter; AAC ses, video akışı kopyalama; sessiz video desteği. Arka planda çalışır. Mevcut hedefin üzerine yazmaz; geçici dosya doğrulandıktan sonra yayımlar.
- [TESTED] npm run build (TypeScript dahil), npm test (mevcut 3 test), cargo check --offline geçti. Bu kontroller yeni ses miksinin duyularak doğrulandığı anlamına gelmez.
- [PENDING / Claude] scripts/test-a26.ps1: mevcut test videosu + 660 Hz ton → test-output/VoxCut_A26_SesMix_Test.mp4. Henüz çalıştırılmadı.
- [PENDING / Claude] Masaüstünde sessiz video, çoklu ses, solo/sustur, pan, fade, gecikme, Unicode yollar, geçersiz süre ve mevcut hedef koruması kontrol edilmeli.
- Sınırlar: miks canlı ön izlemesi, ayarların proje JSON'una kaydı, waveform, iptal/ilerleme ve WAV/MP3 henüz yok. Sekmeden çıkınca A26 ayarları sıfırlanır. AI özellikleri planlandı.
- Geri alma: backup_A26_20261031_140047 içindeki değiştirilmeden önceki dosyalar korunmuştur. Yeni dosyalar: src/components/AudioMixPanel.tsx, src-tauri/src/audio_mix.rs, scripts/test-a26.ps1.

## A26 uygulama akışı — 2026-10-31
- [TESTED / kullanıcı] VoxCut_A26_KonusmaMix_Test.mp4: 10 sn, H.264 + AAC; konuşma, mevcut müzik ve eklenen 660 Hz ton birlikte duyuldu. Bu CLI testidir; GUI kabulüyle karıştırılmamalı.
- [IMPLEMENTED] inspect_mix_media komutu ile gerçek kaynak süresi ve ses/video akışı kontrolü; yeni kanala kaynak/video süresine göre başlangıç kesiti.
- [IMPLEMENTED] Sekme değişiminde panel unmount edilmez, oturum içindeki miks ayarları korunur. Kapatıp açınca veya JSON kaydet/aç ile miks geri yükleme henüz yok.
- [IMPLEMENTED] Dışa aktarma öncesi kesit, fade, seviye ve zamanlama doğrulaması. Çıktıda hem video hem ses akışı kontrolü.
- [TESTED] TypeScript/Vite build, 7 Vitest testi ve cargo check --offline geçti. Solo/sustur önceliği, yanlış kesit/fade ve video sonunda kesme kararı için 4 yeni test var.

## A27 — 2026-10-31 ses miksi proje kalıcılığı
- [TESTED / kullanıcı] A26 GUI: ses ekleme, miksli MP4 kaydetme ve solo/sustur davranışı kullanıcı tarafından denendi, başarılı bildirildi.
- [IMPLEMENTED] `ProjectDocument.audioMix` (isteğe bağlı; schemaVersion 1 korunur): video yolu, ek ses yolları ve tüm kanal ayarları. Medya baytı/base64 yazılmaz; ayrıştırıcı yalnız bilinen alanları alır, değerleri sınırlar.
- [IMPLEMENTED] JSON Kaydet / Proje Aç miksi taşır. Eski projeler (audioMix alanı yok) açılmaya devam eder.
- [IMPLEMENTED] Proje açılınca FFprobe ile yeniden doğrulama (`reconcileMix`): kayıtlı süreye güvenilmez; kesit/fade gerçek süreye göre sığdırılır ve nedeni listelenir. Dışa aktarmadan önce de son bir doğrulama yapılır.
- [IMPLEMENTED] Taşınmış/silinmiş dosya: sarı uyarı + "Yeniden seç"; kanal ayarları korunur. Eksik dosya varken MP4 dışa aktarma engellenir.
- [IMPLEMENTED] Arayüz: 4 adımlı gösterge (video → ses → ayarla → kaydet); ses ekleme penceresi artık ses + video uzantılarını gösterir (videonun sesi kullanılabilir).
- [TESTED] `npm run build` (tsc dahil) hatasız; `npm test` 25/25 (18 yeni: kaydet→aç gidiş-dönüş, eski proje, bayt gömülmemesi, sınır/bozuk veri, yeniden doğrulama, eksik dosya, fade taşması); `cargo check --offline` ve `tauri build --debug --no-bundle --offline` geçti.
- [PENDING] Gerçek masaüstünde elle kabul: miksi kaydet → uygulamayı kapat → projeyi aç → ayarlar aynı mı; bir ses dosyasını taşıyıp uyarı + "Yeniden seç" akışı. Bu GUI akışı otomatik test edilmedi (yalnız model katmanı birim testli).
- Sınırlar: JSON hâlâ tarayıcı indirmesi olarak kaydedilir (Tauri dosya yolu/otomatik kayıt A1 işi). Canlı miks ön izleme, waveform, iptal/ilerleme, WAV/MP3 yok. Medya kütüphanesi (MediaAsset) dosya yolu tutmaz; yalnız ses miksi tutar.
- Geri alma: backup_A27_20261031_145806. Değişen: src/core/{audioMixModel,project,types}.ts, src/components/AudioMixPanel.tsx, src/App.tsx, src/styles/app.css; yeni: src/core/audioMixPersistence.test.ts.

## A27b — 2026-10-31 gerçek dosyaya kaydet/aç + otomatik kayıt
- [IMPLEMENTED] Rust `read_project_file` / `write_project_file` (src-tauri/src/project_io.rs): yalnız .json, en çok 10 MB; yazma atomik (geçici dosya + yeniden adlandırma).
- [IMPLEMENTED] Masaüstünde Kaydet / Farklı Kaydet / Proje Aç gerçek yol seçimiyle çalışır; tarayıcı modunda eski indir/yükle akışı korunur.
- [IMPLEMENTED] Değişiklik göstergesi (üstteki nokta sarı = kaydedilmemiş). Dosya seçildiyse 2 sn sonra otomatik kayıt; seçilmediyse yerel kurtarma kopyası (yalnız yol + ayar) ve sonraki açılışta "Geri yükle / Sil" bandı. Kaydedilmemiş projeyi değiştirirken onay istenir.
- [TESTED] `npm run build`, `npm test` 25/25, `cargo check --offline`, `tauri build --debug --no-bundle --offline` geçti.
- [PENDING] Bu akışlar (kaydet dialogu, otomatik kayıt, kurtarma bandı) masaüstünde elle denenmedi; Rust komutları için birim testi yok. Dosya yolları bilinen (A1) tam proje paketi/SQLite henüz yok.
- Geri alma: backup_A27_20261031_145806 (project_io.rs yeni dosyadır, lib.rs'te iki satır).

## A28 — 2026-10-31 altyazıyı videoya yazma (A5 ilk dilim)
- [IMPLEMENTED] Altyazı sekmesinde "Altyazıyı videoya yaz" paneli (src/components/SubtitleBurnPanel.tsx): yerel video seç → boyut/konum/renk → yeni MP4 kaydet. Mevcut dosyanın üzerine yazmaz; orijinal video değişmez.
- [IMPLEMENTED] Rust `burn_subtitles` (src-tauri/src/subtitle_burn.rs): FFmpeg `subtitles` (libass) filtresi, CPU libx264 CRF 21 + AAC 192k. Stil yalnız beyaz listeden üretilir (ham stil metni kabul edilmez); SRT geçici klasörde `sub.srt` olarak yazılır, FFmpeg o klasörde çalışır (Windows yol kaçışı yok). Çıktı FFprobe ile doğrulanır (video, ses varlığı, süre), sonra atomik yayımlanır; geçici klasör temizlenir.
- [IMPLEMENTED] `planBurn` (src/core/subtitleBurn.ts): geçersiz cue'ları atar, video süresini aşan bitişi kırpar, tamamen dışarıda kalanı ayıklar ve sayıları arayüzde gösterir. Yakmadan önce dosya yeniden FFprobe ile okunur.
- [TESTED] FFmpeg ile elle prototip: Türkçe karakterler (ğüşiöç İĞÜŞÖÇ) ve iki satırlı altyazı 1280×720 karelerde görsel olarak doğru yakıldı. Bu makinede FFmpeg libass + fontconfig + harfbuzz ile derlenmiş.
- [TESTED] `cargo test --offline subtitle_burn`: 5/5 (stil beyaz listesi, enjeksiyon reddi, SRT doğrulama, bağıl/eksik yol reddi, gerçek FFmpeg ile uçtan uca: Unicode klasör/dosya adı, sesli kaynak, çıktı doğrulaması, mevcut hedefi ezmeme, geçici klasör kalmaması).
- [TESTED] `npm run build`; `npm test` 24/24 (4 dosya: yeni 6 test `subtitleBurn.test.ts`); `tauri build --debug --no-bundle --offline` geçti.
- [DÜZELTME] Önceki "npm test 25/25 (18 yeni)" ifadesi hatalıydı: Vitest backup_* klasörlerindeki eski test kopyalarını da topluyordu (7 kopya). Gerçek sayı A27 sonunda 18'di (audioMixPersistence 11 yeni). `vitest.config.ts` ile yedekler dışlandı; artık sayılar gerçek kaynağı yansıtır.
- [PENDING] Masaüstü GUI'de elle kabul: Altyazı sekmesi → Video seç → ayarlar → "Yaz ve MP4 kaydet" → çıktıyı oynat. GUI otomasyonu çalışmadığı için arayüz akışı ben tarafından denenmedi; yalnız Rust komutu ve model katmanı test edildi.
- Sınırlar: ilerleme/iptal yok; yazı tipi sabit Arial; kontur/gölge/arka plan kutusu ayarı yok; stil projeyle kaydedilmez; SRT/VTT içe aktarma ve gömülü (soft) altyazı henüz yok; otomatik altyazı (Whisper) A7. A5 tamamlanmış sayılmaz.
- Geri alma: backup_A28_20261031_175024. Değişen: src-tauri/src/{lib,audio_mix}.rs (probe pub(crate)), src/App.tsx; yeni: src-tauri/src/subtitle_burn.rs, src/components/SubtitleBurnPanel.tsx, src/core/subtitleBurn{,.test}.ts, vitest.config.ts.

## A29 — 2026-10-31 SRT/VTT içe aktarma + VTT dışa aktarma (A5 ikinci dilim)
- [IMPLEMENTED] Altyazı sekmesinde "SRT / VTT içe aktar" ve "VTT olarak kaydet". İçe aktarma: .srt/.vtt, en çok 2 MB; BOM/CRLF, VTT başlık/NOTE/STYLE/cue kimliği/cue ayarları, saat kısmı opsiyonel zaman, HTML/ASS etiketleri temizlenir. Geçersiz bloklar (ters zaman, boş metin) atlanır ve sayısı bildirilir. Mevcut altyazı varsa onay sorulur: değiştir veya mevcutlara ekle.
- [TESTED] `src/core/subtitleImport.test.ts` 10 test: zaman damgası biçimleri, SRT/VTT okuma, etiket temizleme, geçersiz blok sayımı, boş/bozuk dosyada hata, SRT→içe aktar→SRT ve VTT gidiş-dönüşü. `npm test` 34/34 (5 dosya), `npm run build` ve `tauri build --debug --no-bundle --offline` geçti.
- [PENDING] Dosya seçme düğmeleri ve onay penceresi masaüstünde elle denenmedi. A28 altyazı yakma GUI kabulü de hâlâ bekliyor.
- Sınırlar: stil/konum bilgisi (VTT cue ayarları, ASS) içe aktarılmaz; çoklu dil katmanı, ASS/SSA içe aktarma ve gömülü (soft) altyazı yok. A5 tamamlanmış sayılmaz.
- Geri alma: backup_A28_20261031_175024 (A29 değişiklikleri src/App.tsx ve src/core/subtitles.ts içindedir; yeni test dosyası src/core/subtitleImport.test.ts).

## A30 — 2026-10-31 geri al / yinele ve klavye kısayolları (A1 ilk dilim)
- [IMPLEMENTED] `src/core/history.ts`: sınırlı (100 adım) ve birleştirmeli geçmiş. 700 ms içindeki art arda değişiklikler (sürükleme, yazma) tek geri alma adımı olur. Geri aldıktan sonra yeni değişiklik yinele geçmişini siler.
- [IMPLEMENTED] App: üst çubukta Geri al / Yinele düğmeleri; Ctrl+S kaydet, Ctrl+Z geri al, Ctrl+Shift+Z ve Ctrl+Y yinele. Metin/sayı alanlarında tarayıcının kendi geri alması korunur (Ctrl+S her yerde çalışır). Proje açılınca geçmiş sıfırlanır. Tüm proje değişiklikleri (tasarım, altyazı, ses miksi dahil) tek noktadan izlenir.
- [TESTED] `history.test.ts` 6 test; `npm test` 40/40 (6 dosya), `npm run build`, `tauri build --debug --no-bundle --offline` geçti.
- [TESTED / ben, tarayıcı modu] Vite önizlemesinde gerçek arayüzle: 4 katman → dikdörtgen ekle (5) → elips ekle (6) → Geri al (5) → Geri al (4) → Yinele (5) → Ctrl+Z (4) → Ctrl+Shift+Z (5); başlangıçta Geri al devre dışı; konsolda hata yok. Tauri masaüstü penceresinde ve Ctrl+S kaydetmede elle denenmedi.
- Sınırlar: geçmiş yalnız bellekte (uygulama kapanınca gider); medya dosyası içeriği geri alınmaz (yalnız proje ayarları). Metin alanı içinde yazarken Ctrl+Z tarayıcı davranışıdır.
- [PENDING] A1'in kalanı onay bekliyor: SQLite için `rusqlite` (yerel önbellekte yok, indirme gerekir) ve `.voxcut` paketi. Dosya yolu + hash tabanlı medya kütüphanesi kalıcılığı da bekliyor.
- Geri alma: backup_A28_20261031_175024 (App.tsx ve CLAUDE/docs dosyaları A28 öncesi hâli). Yeni: src/core/history{,.test}.ts, .claude/launch.json (yalnız yerel Vite önizleme).

## A31 — 2026-10-31 yerel SQLite kütüphane veritabanı + Son projeler (A1 ikinci dilim)
- [IMPLEMENTED] Kullanıcı onayıyla `rusqlite 0.41.1` (özellik `bundled`; SQLite derlemeye gömülür, sistem kurulumu gerekmez) eklendi. `src-tauri/src/library_db.rs`: uygulama veri klasöründe (`%APPDATA%\studio.voxcut.desktop\library.db`) yalnız metadata; sürüm `PRAGMA user_version` ile izlenir, `migrate` sırayla genişler, daha yeni sürümlü veritabanı reddedilir ve değiştirilmez.
- [IMPLEMENTED] `recent_projects` tablosu (yol, ad, zaman; en çok 20) ve komutlar `recent_projects_list/touch/forget`. Arayüz: üst çubukta "Son projeler" menüsü; dosyası yerinde olmayanlar üstü çizili gösterilir, açılmaz, listeden kaldırılabilir. Kaydet/Proje Aç başarılı olunca otomatik kaydedilir. Veritabanı hatası kaydetmeyi/açmayı engellemez.
- [TESTED] `cargo test --lib library_db` 7/7 (sürüm + idempotent migration, yeni sürüm reddi, upsert ve sıralama, 20 sınırı, silme, kötü yol ve SQL metakarakterleri, var olan dosya bayrağı). `npm test` 40/40, `npm run build`, `tauri build --debug --no-bundle --offline` geçti.
- [TESTED / ben] Gerçek exe başlatıldı: açılışta `recent_projects_list` IPC çağrısı `library.db` dosyasını (16 KB) oluşturdu ve migration çalıştı; ardından exe kapatıldı. Menünün tıklanması, kaydet→listede görünme ve eksik dosya davranışı arayüzden elle denenmedi.
- Lisans: rusqlite MIT, gömülü SQLite kamu malıdır (public domain). Yeni indirilen crate'ler: rusqlite, libsqlite3-sys, rsqlite-vfs, sqlite-wasm-rs, vcpkg ve bağımlılıkları (Cargo.lock'ta).
- [PENDING] A1'in kalanı: `.voxcut` taşınabilir paket/manifest, medya dosyası parmak izi (hash) ile yeniden bağlama (kullanıcı klasör seçerek), medya kütüphanesi (MediaAsset) yol kalıcılığı, App.tsx modüllere bölme, thumbnail/drag-drop.
- Geri alma: src-tauri/Cargo.toml.backup_A31 ve Cargo.lock.backup_A31 (rusqlite öncesi). Yeni: src-tauri/src/library_db.rs; değişen: src-tauri/src/lib.rs, src/App.tsx, src/styles/app.css. DB dosyası silinse proje dosyaları etkilenmez (yalnız son proje listesi gider).

## A32 — 2026-10-31 medya parmak izi ve klasörden toplu yeniden bağlama (A1 üçüncü dilim)
- [IMPLEMENTED] `src-tauri/src/media_fingerprint.rs`: hızlı parmak izi = SHA-256(boyut + ilk 1 MiB + son 1 MiB; ≤ 2 MiB dosyada tamamı). `sha2 0.10` yerel önbellekten doğrudan bağımlılık yapıldı (yeni indirme yok). Komutlar `file_fingerprint` ve `find_moved_media`.
- [IMPLEMENTED] `find_moved_media` yalnız kullanıcının diyalogla seçtiği klasörü tarar (en çok 6 seviye, 20 000 girdi, sembolik bağlantılar atlanır, ilk 5 eşleşme); önce boyut, sonra parmak izi eşleşmesi gerekir. Kullanıcının başka klasörlerine dokunulmaz.
- [IMPLEMENTED] Ses miksi: `videoSize/videoFingerprint` ve kanalda `size/fingerprint` (isteğe bağlı; eski projeler aynen açılır). Dosya seçilince/yeniden bağlanınca kaydedilir; ayrıştırıcı yalnız geçerli (64 küçük hex + pozitif boyut) çifti kabul eder.
- [IMPLEMENTED] Projeyi açınca: dosya yerindeyse ve parmak izi kayıtlıysa içerik değişmiş mi karşılaştırılır (yalnız not, engellemez). Eksik dosya varsa "Klasörde ara ve toplu yeniden bağla": seçilen klasörde tüm eksikler aranır, bulunanlar ayarları korunarak bağlanır, sonuç sayıları gösterilir. Parmak izi olmayan (eski) kayıtlar için "Yeniden seç" kalır.
- [TESTED] Rust 16/16 (yeni 4: aynı içerik farklı yol/ad aynı iz, baş/son/küçük dosya değişimi, taşınmış+yeniden adlandırılmış dosyayı bulma ve aynı boyutlu yem dosyayı eleme, derinlik sınırı ve girdi doğrulama; Unicode klasör adları). `npm test` 45/45 (yeni 5: gidiş-dönüş, eski proje, bozuk/saldırgan değerler, kesirli boyut, printChanged). `npm run build` ve `tauri build --debug --no-bundle --offline` geçti.
- Sınırlar: parmak izi bütünlük kanıtı değildir (3 MiB'tan büyük dosyada yalnız orta kısım değişirse fark edilmez). Yalnız ses miksi dosyaları kapsanır; medya kütüphanesi (MediaAsset) ve tasarım görselleri henüz yol/parmak izi tutmaz. Klasör diyaloğu ve toplu bağlama akışı masaüstünde elle denenmedi.
- Geri alma: src-tauri/Cargo.toml.backup_A32, Cargo.lock.backup_A32; AudioMixPanel.tsx ve audioMixModel.ts değişti (öncesi için backup_A28_* klasöründeki sürümler A28 öncesi, A32 öncesi kopya geçicidir). Yeni: src-tauri/src/media_fingerprint.rs, src/core/mediaFingerprintModel.test.ts.

## A33 — 2026-10-31 App.tsx modüllere bölündü (A1 dördüncü dilim)
- [IMPLEMENTED] `src/App.tsx` 367 → 110 satır; yalnızca durum birleştirme ve yerleşim kaldı. Davranış değiştirilmeden `src/features/{design,library,video,audio,subtitles,projects}` altına taşındı (model/hook + `components/`), ortak parçalar `src/shared/`.
  - projects: `useProjectHistory` (geri al/yinele), `useProjectFiles` (aç/kaydet/otomatik kayıt/kurtarma/son projeler/kısayollar), `components/TopBar`.
  - design: `useDesignActions`, `DesignTools`, `DesignStage` (sürükleme mantığı içinde), `DesignProperties`, `LayerList`.
  - library: `useMediaLibrary` (oturum blob URL'leri), `MediaLibrary`.
  - video: `MediaPreview`, `Timeline`, `MediaProperties`, `VideoTrimPanel` (taşındı).
  - audio: `AudioMixPanel` (taşındı). subtitles: `useSubtitles`, `SubtitleTools`, `CueList`, `SubtitleBurnPanel` (taşındı).
  - shared: `FeatureLocked`, `workspaces` (sekmeler, süre biçimi). `core/types.ts`: `UpdateProject` tipi.
- [TESTED] `npm run build` (tsc strict dahil) ve `npm test` 45/45 geçti; `tauri build --debug --no-bundle --offline` geçti.
- [TESTED / ben, tarayıcı modu] Bölmeden sonra aynı akışlar gerçek arayüzde tekrar denendi: katman ekleme, özellik paneliyle X değiştirme, geri al/yinele/Ctrl+Z, katman listesinden seçme, altyazı ekleme, SRT içe aktarma (+2 altyazı, mevcutlara ekle), VTT düğmesi ve yakma paneli varlığı, görsel medya ekleme/önizleme/silme, zaman çizelgesi sayacı, Ses sekmesi. Beklenmeyen davranış çıkmadı. (Geri al, 700 ms içindeki ekleme+düzenlemeyi bilerek tek adım yapar.)
- Kalan A1 (App.tsx bölme maddesi tamam): `.voxcut` taşınabilir paket, medya kütüphanesi (MediaAsset) yol/parmak izi kalıcılığı, küçük resim, sürükle-bırak. Refaktör kuralına uyuldu: döngüsel import yok; tek yönlü bağımlılık video→design (Timeline→LayerList).
- Geri alma: backup_A33_20261031_180741 (bölme öncesi tüm `src`).

## A34 — 2026-10-31 medya kütüphanesi yol + parmak izi kalıcılığı (A1 beşinci dilim)
- [IMPLEMENTED] `MediaAsset` isteğe bağlı `path` ve `fingerprint` alanları aldı (eski projeler aynen açılır; ayrıştırıcı yolu 1024 karaktere kırpar, NUL'ü temizler, geçersiz parmak izini atar; baytlar/base64 sızmaz).
- [IMPLEMENTED] Masaüstünde "Dosya ekle" artık yerel diyalog kullanır: tür uzantıdan belirlenir (`src/core/mediaKinds.ts`, 19 uzantı), boyut+parmak izi kaydedilir, dosya belleğe yüklenmez ve diskten akıtılır (asset protokolü; eski 2 GB RAM sınırı bu yolda yok). Aynı yol ikinci kez eklenmez. Tarayıcı modunda eski oturum-içi blob akışı korunur.
- [IMPLEMENTED] Proje açılınca kayıtlı yollar yeniden doğrulanır: bulunanlar önizlenebilir olur, eksikler "bulunamadı" ile işaretlenir, parmak izi değişmişse not düşülür. Eksik dosya için satırda ↻ "Yeniden bağla" (tür uyuşmazlığı reddedilir) ve "Klasörde ara ve toplu bağla" (A32 `find_moved_media`; yalnız kullanıcının seçtiği klasör).
- [IMPLEMENTED] Rust `authorize_media` (src-tauri/src/media_access.rs): proje dosyasından gelen yolu önizleme için asset kapsamına ekler; yalnız mutlak yol, mevcut dosya ve bilinen medya uzantısı kabul edilir. (tauri.conf assetProtocol.scope boş kalır; izin dosya bazında ve oturum başına verilir.)
- [TESTED] Rust 18/18 (yeni 2: `check` doğrulaması). `npm test` 52/52 (yeni 7: `mediaAssetPersistence.test.ts` — uzantıdan tür, gidiş-dönüş, eski proje, bozuk/NUL/aşırı uzun değer, bayt sızmaması). `npm run build` ve `tauri build --debug --no-bundle --offline` geçti. Tarayıcı modunda gerçek arayüzle: görsel ekle/önizle/sil ve eski proje JSON'u (yolsuz medya) açma sorunsuz.
- [PENDING / doğrulanmadı] Masaüstünde dosya seçme diyaloğu, `convertFileSrc` ile gerçek video/ses oynatma, `authorize_media`'nın asset kapsamını fiilen açması (AppHandle gerektirir; yalnız doğrulama kısmı birim testli), yeniden açınca otomatik doğrulama ve toplu bağlama elle denenmedi.
- [DÜZELTME] Bu aşamada Bash heredoc'u ters eğik çizgileri yuttuğu için project.ts'e NUL baytı girdi ve iki test dosyasında bozuk yol dizeleri oluştu; hepsi Write/Edit aracıyla düzeltildi ve testler yeniden çalıştırıldı.
- Kalan A1: `.voxcut` taşınabilir paket, küçük resim, medya sürükle-bırak. Tasarım görselleri henüz yol tutmaz.
- Geri alma: backup_A33_20261031_180741 (öncesi `src`). Yeni: src-tauri/src/media_access.rs, src/core/mediaKinds.ts, src/core/mediaAssetPersistence.test.ts; değişen: src/core/{types,project}.ts, src/features/library/*, src/App.tsx, src-tauri/src/lib.rs.

## A35 — 2026-10-31 .voxcut taşınabilir paket (A1 altıncı dilim)
- [IMPLEMENTED] Paket biçimi: `Ad.voxcut` klasörü = `manifest.json` (biçim işareti `voxcut-package`, `formatVersion` 1, medya özeti) + `project.json` (normal proje JSON'u) + `backups/`. Medya dosyaları pakete GÖMÜLMEZ; paket klasörünün içindeki medya göreli (`media/x.mp4`), dışındakiler mutlak yolla saklanır. Tek dosyalı `.voxcut.json` projeler aynen çalışır.
- [IMPLEMENTED] Rust `package_io.rs` (`write_package`, `read_package`; `serde_json` yerel önbellekten doğrudan bağımlılık yapıldı, yeni indirme yok): yalnız `.voxcut` adlı mutlak yol; manifest biçimi/sürümü doğrulanır (daha yeni sürüm reddedilir, dokunulmaz); başka bir klasörün (manifestsiz) üzerine yazmaz; önce `project.json`, en son `manifest.json` atomik (geçici dosya + rename) yazılır; son yedek 5 dakikadan eskiyse `backups/project-<ms>.json` alınır, en çok 10 yedek tutulur; 10 MB sınırı ve JSON doğrulaması.
- [IMPLEMENTED] `src/core/packagePaths.ts`: kaydederken paket içi mutlak yol → göreli (harf büyüklüğüne duyarsız; kardeş klasör `...Kardes` eşleşmez), açarken göreli → paket klasörüne göre mutlak. `..`, `.`, boş parça ve sürücü içeren göreli yollar çözülmez (göreli kalır, "bulunamadı" olarak işaretlenir; paket dışına erişim yok). Kütüphane medyası ve ses miksi yolları kapsanır; girdi nesnesi değiştirilmez. `buildManifest`: rol, taşınabilirlik, boyut, parmak izi.
- [IMPLEMENTED] Arayüz (yalnız masaüstü): üst çubukta "Paket" menüsü (Paket olarak kaydet… / Pakete kaydet / Paketi farklı kaydet… / Paket aç…). Ctrl+S ve 2 sn otomatik kayıt paket açıksa pakete yazar. Son projeler `.voxcut` klasörlerini de tutar (var/yok kontrolü klasör için de çalışır).
- [TESTED] Rust 24/24 (yeni 5 `package_io`: Unicode yollu gidiş-dönüş, yabancı klasöre/kötü ada karşı koruma ve dokunmama, bozuk JSON ve yanlış/yeni manifest, yedek sıklığı + budama, eksik parça; +1 `library_db` paket klasörü). `npm test` 62/62 (yeni 10 `packagePaths.test.ts`: mutlak/göreli, taşıma gidiş-dönüşü, güvensiz yollar, değişmezlik, manifest). `npm run build` ve `tauri build --debug --no-bundle --offline` geçti. Tarayıcı modunda Paket menüsü görünmüyor, eski akışlar sorunsuz.
- [PENDING / doğrulanmadı] Masaüstünde kaydet/aç diyalogları (klasör seçici, `.voxcut` kaydet adı), gerçek paketi başka klasöre/diske taşıyıp açma, otomatik kayıt ve yedek döngüsü, son projelerden paket açma elle denenmedi.
- Sınırlar: "medyayı pakete topla (kopyala)" yok (ayrı onay/disk alanı kontrolü gerektirir); yedeklerden geri yükleme arayüzü yok (dosyalar `backups/` içinde); paket zip/tek dosya değil klasör; SQLite proje içeriği tutmaz (yalnız son projeler).
- Geri alma: src-tauri/Cargo.toml.backup_A35, Cargo.lock.backup_A35; src/features/projects/* ve src/App.tsx değişti. Yeni: src-tauri/src/package_io.rs, src/core/packagePaths{,.test}.ts.

## A35b — 2026-10-31 medyayı pakete kopyala + tam doğrulama turu
- [IMPLEMENTED] Rust `package_media.rs` (`collect_media`): paket `media/` klasörüne KOPYALAR; kaynaklar asla taşınmaz/silinmez/değiştirilmez. Aynı ad farklı içerik → `ad (2).ext`; aynı içerik varsa yeniden kullanılır (çoğaltma yok); paket içindeki dosya atlanır. Her kopya geçici adla yazılır, boyut + parmak iziyle doğrulanır, sonra yerine konur; hata olursa bu çağrıda oluşturulan tüm dosyalar geri alınır. Disk alanı Windows `GetDiskFreeSpaceExW` ile okunur; toplam + 100 MB pay yoksa hiç kopyalanmaz. Kuru çalıştırma (`dry_run`) hiçbir şey yazmaz.
- [IMPLEMENTED] Arayüz: Paket menüsü → "Medyayı pakete kopyala…" (yalnız paket açıkken). Önce toplam MB ve boş disk alanı gösterilip onay alınır; kopyadan sonra proje yolları güncellenir, otomatik kayıtla göreli olur. İlerleme/iptal yok (büyük dosyada dakikalar sürebilir; uyarı gösterilir).
- [TESTED] Rust 31/31 (yeni 7 `package_media`: Unicode klasör/dosya adı, ad çakışması, kaynak değişmezliği, kuru çalıştırma, tekrar çalıştırmada dedupe, yetersiz disk reddi, eksik kaynak/yanlış uzantı/paket olmayan klasörde yan etki yok, gerçek disk alanı API'si, büyük/küçük harf ve kardeş klasör ayrımı). Clippy uyarısız. `npm test` 64/64 (9 dosya), `npm run build`, `tauri build --debug --no-bundle --offline` geçti.
- [TESTED / ben] Exe açılış duman testi: süreç çalışıyor, pencere başlığı "VoxCut Studio", `library.db` oluştu, WebView2 çalışıyor, süreç kapatıldı. Tarayıcı modunda gerçek arayüz akışları tekrar denendi.
- [DÜZELTME] CLAUDE.md §1 durum tablosu ve README durum paragrafı güncel gerçeğe getirildi (eskiden "YOK/EKSİK" diyen satırlar yanıltıcıydı). `docs/TEST_PLAN.md`'ye otomatik test envanteri ve elle kabul bekleyenler listesi eklendi.
- [PENDING] Elle GUI kabulü (tümü sonda toplanacak): diyaloglar, medya oynatma, paket taşıma/açma, medya kopyalama onay penceresi, otomatik kayıt, altyazı yakılan MP4'ün oynatılması.
- A1 durumu: JSON + paket + yedek + otomatik kayıt + kurtarma + geri al/yinele + SQLite + parmak izi/yeniden bağlama + medya yolu kalıcılığı + modüllere bölme tamam. Kalan A1: küçük resim, medya sürükle-bırak, zip paket, yedekten geri yükleme arayüzü.
- Geri alma: src-tauri/Cargo.toml.backup_A35, Cargo.lock.backup_A35; bu aşamada değişen: src/features/projects/*, src/core/packagePaths.ts, src-tauri/src/{lib,media_access,media_fingerprint,package_io}.rs (görünürlük), yeni src-tauri/src/package_media.rs.

## A36 — 2026-10-31 yedekten geri yükleme, medya sürükle-bırak, küçük resimler (A1 kapanış)
- [IMPLEMENTED] Paket yedekleri: Rust `list_backups` (en yeni başta, yalnız `project-<ms>.json` adları) ve `restore_backup`. Geri yüklemede önce seçilen yedek okunup doğrulanır, SONRA mevcut durum zorla yeni bir yedek olarak saklanır (geri alınabilir), en son project.json atomik yazılır; geçersiz ad, `..` içeren ad, bozuk JSON ve paket olmayan klasör reddedilir ve projeye dokunulmaz. Arayüz: Paket menüsü → "Yedekler" listesi (tarih, boyut) → onayla → paket yeniden açılır.
- [IMPLEMENTED] Medya sürükle-bırak: masaüstünde Tauri `onDragDropEvent` (gerçek dosya yolları, yol + parmak izi kaydedilir), tarayıcıda HTML5 dosyaları (oturum içi). Sürüklerken "Medya eklemek için bırak" katmanı çıkar. Desteklenmeyen uzantılar bildirimle atlanır.
- [IMPLEMENTED] Medya kütüphanesinde küçük resimler: görselde gerçek önizleme, videoda ilk kare (asset/blob URL'den, ek dosya veya önbellek yok), sesde simge.
- [TESTED] Rust 33/33 (yeni 2: yedek listeleme + güvenlik yedekli geri yükleme; kötü ad/traversal/bozuk yedekte yan etkisiz ret), clippy 0 uyarı. `npm test` 64/64, `npm run build`, `tauri build --debug --no-bundle --offline` geçti. Exe açılış duman testi geçti (pencere "VoxCut Studio", süreç kapatıldı).
- [TESTED / ben, tarayıcı modu] Sürükle-bırak: dragover → bırakma katmanı göründü, drop → görsel kütüphaneye eklendi (küçük resim 40 px yüklendi), .txt bırakılınca eklenmedi ve uyarı çıktı; konsolda hata yok.
- [PENDING / doğrulanmadı] Masaüstünde gerçek dosya sürükleme (Tauri olayı), yedek menüsü ve geri yükleme, video küçük resminin asset protokolüyle görünmesi elle denenmedi.
- A1 durumu: zip paket (yeni bağımlılık + format kararı gerektirir) hariç tüm maddeler IMPLEMENTED. Sıradaki aşama A2 (gerçek tasarım editörü).
- Geri alma: src/features/library/*, src/features/projects/*, src/App.tsx, src/styles/app.css, src-tauri/src/package_io.rs değişti (öncesi için backup_A33_* ve A35 notları).

## A37 — 2026-10-31 tasarım editörü: tuval boyutları, katman sırası/çoğaltma, JPEG/WebP/ölçekli dışa aktarma, yerel kaydetme (A2 ilk dilim)
- [IMPLEMENTED] Tuval hazır ayarları (YouTube 1280×720, Shorts/Reels 1080×1920, Instagram 1080×1080 ve 1080×1350, Profil 800×800, Afiş 1500×500) + özel boyut (64–8192 px). Boyut değişince konum yüzdeleri aynı kalır, yazı boyutu genişlik oranında ölçeklenir; sahne oranı tuvale uyar (dikey tuval sığar). Üstteki çözünürlük etiketi ve yazı ölçeği artık gerçek tuval genişliğine göre (eskiden 1280'e sabitti).
- [IMPLEMENTED] Katman sırası (öne al/arkaya al/en öne/en arkaya) ve çoğaltma. Dışa aktarma: PNG / JPEG / WebP, 0.5×–3× ölçek, çıktı boyutu önceden gösterilir; 8192 px kenar ve 40 milyon piksel üstü reddedilir; dosya adı güvenli (Unicode korunur, yol karakterleri `_`).
- [IMPLEMENTED] Masaüstünde yerel "Kaydet" penceresi + Rust `save_export_file` (`export_io.rs`): baytlar ham ikili IPC ile gelir (JSON dizisi değil), yol yüzde-kodlu başlıkla; uzantı beyaz listesi (png/jpg/jpeg/webp/srt/vtt) ve dosya imzası (magic bytes) doğrulanır, atomik yazılır. Tasarım görseli, SRT ve VTT çıktıları bu yolu kullanır; tarayıcıda normal indirme.
- [TESTED] Rust 37/37 (yeni 4 `export_io`: yüzde çözme, imza-uzantı eşleşmesi, atomik yazma/üzerine yazma/geçici dosya kalmaması, göreli yol/eksik klasör/klasör hedef/sahte içerik reddi), clippy 0 uyarı. `npm test` 72/72 (yeni 8 `designCanvas.test.ts`: hazır ayarlar, boyut ölçekleme ve sınırlar, gidiş-dönüş, katman sırası/çoğaltma, çıktı boyutu, dosya adı). `npm run build`, `tauri build --debug --no-bundle --offline`, exe açılış duman testi geçti.
- [TESTED / ben, tarayıcı modu, gerçek arayüz + ekran görüntüsü] Shorts hazır ayarı seçildi: sahne oranı 0.563 (=1080/1920), dikey tuval önizlemeye sığdı; çoğaltma +1 katman ve kopya seçili; En arkaya/En öne DOM sırasını değiştirdi; PNG 1×, JPEG 2× (2160×3840) ve WebP 0.5× gerçek blob olarak doğru MIME ve imzayla indirildi; SRT/VTT içeriği ve güvenli adlar doğrulandı; konsolda hata yok.
- [PENDING / doğrulanmadı] Masaüstünde yerel kaydet penceresi + `save_export_file` ham IPC yolu (Tauri çalışma zamanında), JPEG/WebP'nin WebView2'de üretilmesi elle denenmedi. Önceki "anchor indirme masaüstünde çalışır" varsayımı doğrulanmamıştı; bu değişiklik onu gereksiz kılar.
- Kalan A2: görsel (resim) katmanı, kırpma, döndürme/yeniden boyutlandırma tutamaçları, hizalama/snapping, yazı tipi/hizalama/gölge/kontur, çoklu seçim/grup, şablonlar (≥12), çok sayfalı PDF.
- Geri alma: backup_A33_20261031_180741 (önceki `src`) ve bu aşamadaki yeni dosyalar: src/core/{designCanvas,saveFile}.ts(+test), src-tauri/src/export_io.rs; değişen: designExport.ts, App.tsx, features/design/*, features/subtitles/useSubtitles.ts.

## A38 — 2026-10-31 tasarım editörü: yazı stili, döndürme, köşeden boyutlandırma, hizalama, klavye (A2 ikinci dilim)
- [IMPLEMENTED] Yazı: sistem yazı tipi listesi (Arial, Segoe UI, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman, Impact, Courier New; dosya gömülmez, lisans sorunu yok), kalınlık, sola/orta/sağa hizalama, italik, gölge, kontur rengi/kalınlığı. Tüm katmanlarda opaklık ve döndürme (-360…360°).
- [IMPLEMENTED] Tuvalde seçili katman için 4 köşe tutamacı (karşı köşe sabit kalır, dönükken de; Shift = oran koru), üstte döndürme tutamacı (Shift = 15° adımlar), "Tuvale hizala" (6 düğme), ok tuşlarıyla kaydırma (0,5 %, Shift 5 %), Delete/Backspace ile silme (metin alanlarında devre dışı).
- [IMPLEMENTED] Önizleme ile dışa aktarma eşitlendi: aynı metin sarma (`wrapText`, uzun kelimeyi karakterden böler), kutuya kırpma, satır yüksekliği 1,13, hizalama, gölge, kontur, opaklık ve döndürme. Eskiden dışa aktarma metni sarmak yerine sıkıştırıyordu (önizlemeden farklıydı).
- [IMPLEMENTED] Model: `DesignElement` isteğe bağlı alanlar (fontFamily, align, italic, shadow, strokeColor, strokeWidth, opacity, rotation); ayrıştırıcı yazı tipini beyaz listeyle, rengi hex deseniyle doğrular, sayıları kırpar, varsayılanları (opak=1, dönme=0, kontur=0) kaydetmez; eski projeler aynen açılır.
- [DÜZELTME] Örnek projedeki başlık kutusu iki satıra sığmıyordu ve ikinci satır kırpılıyordu; kutu yüksekliği 21 → 29 %. Tutamaç bırakılınca tıklama tuvale ulaşıp seçimi kaldırıyordu; tutamaçlara `stopPropagation` eklendi (gerçek fare sürüklemesiyle bulundu).
- [TESTED] `npm test` 91/91 (12 dosya; yeni: `designGeometry.test.ts` 14 — dönük 4 açıda her köşe için karşı köşe dünya koordinatında sabit, en küçük boyut, oran koru, döndürme açısı, hizalama, metin sarma, yazı tipi beyaz listesi; `designStylePersistence.test.ts` 5 — gidiş-dönüş, eski proje, varsayılanlar, sınırlar, CSS enjeksiyonu). `npm run build` geçti. Rust 37/37, clippy 0.
- [TESTED / ben, tarayıcı, GERÇEK fare sürüklemesi + ekran görüntüsü] Elips SW köşesi sürüklendi (büyüdü), başlık SE köşesi sürüklendi (genişlik 75→84,6 %, seçim korundu), döndürme tutamacı sürüklendi (91,1°), dışa aktarılan PNG önizlemeyle aynı (dikey dönmüş metin aynı yerde); ortalı + italik + gölge + pembe kontur önizlemede ve dışa aktarılan PNG'de aynı görünüyor.
- [PENDING] Masaüstü WebView2'de aynı etkileşimler elle denenmedi. Görsel (resim) katmanı, şablonlar, çoklu seçim, snapping/kılavuz çizgileri, çok sayfalı PDF hâlâ yok.

## A39 — 2026-10-31 tasarım şablonları + sahne düzeni düzeltmesi (A2 üçüncü dilim)
- [IMPLEMENTED] 13 özgün şablon, 6 kategori (YouTube kapak ×4, Shorts/Reels ×2, Instagram gönderi ×3, Instagram dikey ×1, Profil ×1, Afiş ×2): yalnız şekil + metin; marka, görsel veya yazı tipi dosyası içermez (telif/lisans sorunu yok). Arayüz: sol panelde "Şablonlar" küçük resimleri; tıklayınca tuval boyutu ve katmanlar değişir, Geri al ile önceki tasarıma dönülür.
- [DÜZELTME — gerçek hata] Tasarım sahnesi (`.stage-frame`) pencere yüksekliği azaldığında dikeyde eziliyordu (1440×900'de 16:9 yerine oran 2,36): metinler kutularından taşıyor, önizleme dışa aktarılan görselden farklı görünüyordu. Yeni `stage-fit`/`design-frame`: kutu, kullanılabilir alana oran korunarak sığar (`min(100cqw, 100cqh × oran)`), çerçeve kenarlık yerine gölge halkası. Doğrulama: 13 şablonun tamamında oran hatası %0, iki pencere boyutunda (1440×900 ve 1100×640) sahne alanın içinde.
- [DÜZELTME] Şablon metin sığma testi büyük harf + ağır kalınlıkta fazla iyimserdi (gerçek ölçüm: 150 px Arial 900 "ÖĞRENDİM" = 916 px). Tahmin muhafazakârlaştırıldı, 3 şablon yeniden boyutlandı; şablon küçük resimleri sahnedeki katmanlarla karışmasın diye ayrı sınıf (`thumb-el`) kullanır. Yazı stili ayrıştırması `elementStyle.ts` içinde ortaklaştı (sahne + küçük resim).
- [TESTED] `npm test` 97/97 (13 dosya; yeni `designTemplates.test.ts` 6: ≥12 şablon, benzersizlik, hazır boyutlar, geçerli renk/yazı tipi/sınırlar, kutuya sığma (muhafazakâr genişlik tahmini), proje yükle-kaydet-aç döngüsü, ayrıştırıcıdan kayıpsız geçiş). `npm run build`, Rust 37/37, clippy 0, debug exe derlemesi ve açılış duman testi geçti.
- [TESTED / ben, tarayıcı + gerçek ölçüm] Tüm 13 şablon uygulandı: her biri için gerçek DOM ölçümüyle metin taşması/beklenmeyen satır sarması yok, sahne oranı doğru; geri al/yinele şablon uygulamasını geri alıyor (tuval boyutu dahil); karşılaştırma/Shorts şablonları ekran görüntüsüyle kontrol edildi.
- [PENDING] Masaüstü WebView2'de elle görsel kontrol. Not: Windows'ta "Arial" + ağırlık 900 isteği Arial Black yüzüne düşebilir (daha geniş/yüksek); şablonlar bu durumu karşılayacak payla ayarlandı, dışa aktarma aynı yazı tipini kullanır.
- Kalan A2: resim katmanı + kırpma, çoklu seçim, snapping/kılavuz çizgileri, çok sayfalı PDF, şablonu kaydetme.
