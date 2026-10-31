# Claude Code'a verilecek ilk mesaj

Bu dosyadaki metni Claude Code'a yapıştırabilir veya `.claude/commands/baslat.md` komutunu açabilirsin.

---

**VoxCut Studio projesini devam ettir.** Önce kök dizindeki `CLAUDE.md`, `README.md`, `docs/ROADMAP.md`, `docs/FEATURE_MATRIX.md`, `docs/ARCHITECTURE.md` ve `docs/WINDOWS_SETUP.md` dosyalarını oku. Türkçe iletişim kur.

Hedef bilgisayarım Windows 10/11, Intel i7 12. nesil, 16 GB RAM, NVIDIA RTX 3060. Ürün: Canva benzeri tasarım + CapCut benzeri video düzenleme + ses temizleme, enstrüman/vokal ayrıştırma, altyazı, ses miks ve gerçek MP4 dışa aktarma; mümkün olduğunca ücretsiz ve çevrimdışı kullanım.

**Önce A0 aşamasını doğrula**: Kurulu yazılımları kontrol et; `scripts/doctor.ps1` raporunu incele; kaynak kodu gözden geçir; güvenli şekilde npm bağımlılıklarını kurmak için benden izin gereken noktada belirt; `typecheck`, `test`, `build` komutlarını çalıştır ve gerçek hata varsa düzelt. Başarıyı test loguyla göster. Tauri Windows önkoşulları kurulmadıysa bunları tespit et; gizlice kurma. İlk etap sonunda mevcut tasarım/PNG ve manuel SRT işlemlerini doğrula.

Sonra A1 için önerilen işleri bağımlılık sırasına koy. Her adımda **tek önemli işlem**, beklenen çıktı, test ve gerekçe belirt. Var olan projeyi sıfırdan silme. Henüz yapılmayan AI, MP4, stem ayrıştırma özelliklerini çalışıyormuş gibi gösterme. Tüm ücretli servisler ve AI model indirmeleri yalnızca açık onayımla yapılsın. İlerlemeyi `docs/ROADMAP.md` ve `docs/FEATURE_MATRIX.md` içinde güncelle.
