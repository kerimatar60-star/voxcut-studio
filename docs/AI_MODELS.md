# AI Modelleri — Yerel ve isteğe bağlı

**Donanım hedefi:** i7 12. nesil, 16 GB sistem RAM, RTX 3060. VRAM 6 GB veya 12 GB olabilir, **algıla**. Üçüncü taraf modeller ilk kurulumda gelmez: indirme boyutu, kaynak, lisans, gizlilik, zaman/bellek maliyeti gösterildikten sonra kullanıcı onayı al.

## 1. Konuşmayı yazıya dönüştürme / Türkçe altyazı

- Aday: `whisper.cpp` resmi açık kaynak: https://github.com/ggml-org/whisper.cpp
- İlk deneme: küçük veya orta model (VRAM'e göre otomatik fallback), Türkçe dil parametresi `tr`.
- Codec dönüşümü: ffmpeg ile 16 kHz mono PCM WAV (transcriber gereksinimine göre); timestamp'leri milisaniyeye doğru çevir.
- Çıktı: segment metni/timestamp → kullanıcı editörü → SRT/VTT/MP4 burn-in.
- Kelime bazlı zamanlama, konuşmacı ayrımı ayrı model/aligner gerektirebilir; standart ASR çıktısını kusursuz kabul etme.

## 2. Konuşma/enstrüman sesini temizleme

- İlk işlev: FFmpeg `afftdn` gibi spektral temizleme; ayrıca highpass/lowpass ve limiter. Bu 'AI' değildir, AI etiketi koyma.
- İleri seviye: lisansı teyit edilmiş yerel denoise model(ler)i; model metadata, input sample rate ve gecikme gereksinimleri açık olsun.
- Kullanıcı için A/B ses karşılaştırma, yoğunluk slider, çıtırtı/artifact uyarısı ve kaynak geri alma.
- Enstrüman kaydını gürültüden temizlemek, müziği vokal/enstrüman stem'lerine ayırmaktan farklı işlemdir.

## 3. Müzik kaynak ayrıştırma

- Aday: Demucs ailesi (2 stems: vocals/instrumental; 4 stems: vocals/drums/bass/other), alternatif UVR ekosistemi.
- Meta `facebookresearch/demucs` deposu **2025'te arşivlenmiş** ve yalnızca okunabilir; aktif bakım/fork/lisans ve Windows bağımlılıkları kontrol edilmeden dağıtıma gömme.
- `adefossez/demucs` fork'u sınırlı bakım durumuyla incelenecek. Üçüncü taraf model ağırlıklarının lisansı kaynak kod lisansından ayrı kontrol edilir.
- GPU belleği yetersizse segment boyutunu düşür veya CPU kullan; işlem sırasında projeyi kilitleme; kullanıcı iptal edebilsin.
- Ayrıştırma kusursuz değildir: enstrüman kaçakları, artefaktlar, stereo faz sorunları olabilir.

## 4. Mimaride modele bağımlılık sınırları

```text
Ui AI Dialog -> Local Job Queue -> Validation -> Model Registry -> Worker Adapter
                                                     ├ whisper.cpp
                                                     ├ FFmpeg classical filters
                                                     └ Stem separator (licensed)
        Worker -> progress/log (without raw content) -> output asset(s)
```

`ModelRegistry`: `id, version, sourceUrl, sha256, licenseId, requiredRam, requiredVram, supportsCpu, downloadSize, installedPath`. Modellerin hash doğrulaması ve güvenli dosya yerleştirme gereklidir; kullanıcı makinesinden kişisel video buluta gönderilmez.

## 5. Kontrol / kabul testleri

1. Gürültülü ve temiz referans test wav, 2/4-stem test parçası (kullanım hakkı var), Türkçe kısa diyalog.
2. Model indirimi açık rızayla; kapatıp açınca tekrar indirmemeli; indirme kesilince bozuk model olarak kullanmamalı.
3. CPU fallback 16 GB RAM altında aşırı swap/çökme olmadan çalışmalı; VRAM hatası kullanıcıya açıklanmalı.
4. Üretilen stem'ler eşit süre/uygun örnekleme frekansında olmalı; WAV tekrar oynatılmalı.
5. ASR metni **düzenlenebilir** olmalı; onaylanmadan videonun içine kalıcı yazılmamalı.

## Ölçülen donanım (2026-10-31, geliştirme makinesi)
- CPU: Intel Core i7-12700H (14 çekirdek / 20 iş parçacığı), RAM 15,7 GB, GPU: NVIDIA GeForce RTX 3060 Laptop — **VRAM 6144 MiB (6 GB)** (`nvidia-smi` ile ölçüldü; CLAUDE.md'nin istediği gibi varsayılmadı).
- Sonuç: GPU belleği 6 GB'tır; vokal/enstrüman ayrıştırma ve Whisper modelleri bu bütçeye göre seçilmeli (büyük modeller için parça/segment kullanımı ve CPU yedeği). NVENC bu sürücüyle uyumsuz bulunduğu için video kodlama CPU / libx264'tür.
- Model indirme, bu belgedeki seçimlerden biri kullanıcı onayıyla yapılmadan başlamaz.

## Kurulu kaynaklar ve doğrulama özetleri (A45, 2026-10-31)

| Parça | Kaynak | Boyut | SHA-256 |
|---|---|---|---|
| whisper.cpp Windows CPU motoru | github.com/ggml-org/whisper.cpp, sürüm etiketi b5454, `whisper-bin-x64.zip` | 8 928 640 B | `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb` |
| ggml-tiny | huggingface.co/ggerganov/whisper.cpp | 77 691 713 B | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |
| ggml-base | aynı | 147 951 465 B | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| ggml-small (önerilen) | aynı | 487 601 967 B | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |
| ggml-medium | aynı | 1 533 763 059 B | `6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208` |

Özetler GitHub sürüm API'sinin `digest` alanından ve Hugging Face LFS `oid` alanından alındı; uygulama indirilen her dosyayı bu değerlerle karşılaştırır. Motor CPU sürümüdür (CUDA sürümü ~685 MB olduğu için kullanılmıyor; ileride isteğe bağlı eklenebilir). Lisanslar: whisper.cpp MIT, OpenAI Whisper ağırlıkları MIT.
