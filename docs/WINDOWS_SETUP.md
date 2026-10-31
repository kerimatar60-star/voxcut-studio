# Windows Kurulum ve Çalıştırma Kılavuzu

## Gerekenler

**Donanım:** Intel i7 12. nesil, 16 GB RAM, RTX 3060; Windows 10/11 x64; en az 20 GB boş SSD alanı başlangıç için önerilir (medya ve AI modelleriyle büyür). Güncel ekran kartı sürücüsü. GPU belleği miktarını gerçek cihazdan sorgula.

**Temel (web geliştirme):** Node.js **20.19+ veya 22 LTS+** (sürüm gereksinimini package.json'dan kontrol et), npm. `node -v` ve `npm -v` çalışmalı. `Git` önerilir. İnternet ilk npm kurulumunda gerekir.

**Windows Desktop (Tauri):** Microsoft C++ Build Tools (**Desktop development with C++**), Rust MSVC toolchain (`rustup`, `cargo`), Microsoft Edge WebView2. Resmi rehber: https://v2.tauri.app/start/prerequisites/

**Sonraki aşamalarda:** FFmpeg+ffprobe, CUDA/NVIDIA (opsiyonel), whisper.cpp model ve uygun stem ayrıştırıcı. **Bunlar A0 setup aşamasında zorunlu değil**, lisans/güvenlik incelemesi gerektirir.

## Sıfırdan kurulum (adım adım)

1. ZIP'i `D:\VoxCutStudio` klasörüne çıkart. Yolun çok uzun veya Türkçe özel karakter içermeyen basit bir yol olması build kolaylığı sağlar (bu bir zorunluluk değil).
2. PowerShell aç: `cd D:\VoxCutStudio`.
3. **Sadece kontrol:** `powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1`. İşaretlenen eksikleri resmi sitelerden tamamla.
4. Node/npm varsa `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1` çalıştır. Script `npm install`, `typecheck`, `test`, `build` yapar; harici `.exe`, FFmpeg veya AI modeli indirmez. Projede testler varsa çalıştırır.
5. `powershell -ExecutionPolicy Bypass -File .\scripts\run-web.ps1`. Chrome'da `http://127.0.0.1:1420` aç. Port 1420 başka programdaysa Vite hata verir; sessizce başka port açmaz.
6. Tauri penceresi için C++ Build Tools + WebView2 + Rust MSVC yüklü olmalı. `rustup default stable-msvc` gerekiyorsa (kurulumdan sonra yeni PowerShell aç). `run-desktop.ps1` komutunu çalıştır.
7. Kurulum `.exe` için `build-windows.ps1` (Windows'ta). NSIS kurulum dosyası `src-tauri\target\release\bundle\nsis` altına yerleşir. `npm run desktop:build` bitmeden veya NSIS dosyası doğrulanmadan 'EXE hazır' deme.

## Özel kurulum ilkeleri

- Dokümanlar varsayılan olarak **AI modeli veya FFmpeg binary'si içermez**; bunlar sonraki etaplarda ayrı kurulur.
- Yönetici yetkisi gerekmedikçe PowerShell'i yönetici olarak açma. `ExecutionPolicy Bypass` **yalnızca tek komut işlemine** uygulanır, makine ayarını kalıcı değiştirmez.
- Windows Build Tools/Rust/webview yoksa sadece web arayüzünü kullan; Tauri komutlarını zorla çalıştırma.
- İlk setup internet bağlantısı gerektirir (`npm install`). Sonraki temel UI kullanımının çevrimdışı olması hedeflenir.
- Node modüllerini zip'e koymadık; platforma uygun kurulumdan sonra oluşacaktır. `package-lock.json` dosyası oluşturulacak ve CI'de `npm ci` tercih edilecektir.
- Eklenecek FFmpeg'in lisansını ve dağıtım kaynağını gözden geçir; Windows için rastgele kaynaklardan `.exe` indirme.

## Komut sonuçları ve sorun giderme

| Hata | Denetle / Çözüm |
|---|---|
| `node` tanınmıyor | Node LTS resmi kurulum ve yeni PowerShell, ardından `node -v` |
| `npm.ps1 cannot be loaded` | `npm.cmd` kullan veya script içindeki `.cmd` komutunu izle; kalıcı policy düşürme |
| `npm install` ağ bağlantısı hatası | Proxy/DNS/npm registry kontrolü; kurulum tamamlanmadan test iddiasında bulunma |
| `cargo` bulunamadı | Rustup MSVC ve terminali yeniden başlat |
| `link.exe` veya `windows.h` bulunamadı | Visual Studio Build Tools C++ workload ve Windows SDK |
| WebView2 hatası | Evergreen Runtime'ı Microsoft'tan kur veya güncelle |
| `Port 1420 already in use` | Çalışan Vite sunucusunu kapat; `Get-NetTCPConnection -LocalPort 1420` |
| `ffmpeg not found` | A3 aşamasında doğrulanacak; A0 için normal |
| `CUDA out of memory` | AI modelini küçült, segment küçült, diğer programları kapat, CPU fallback |
| Media file missing | JSON manifest medya içermez; tekrar dosya ekle / A1 relink özelliğini geliştir |
| `msi` VBSCRIPT hatası | NSIS hedefini kullan (`tauri.conf.json`); MSI özel ihtiyaçsa Tauri rehberini izle |

## Güvenli ortam kontrolü

```powershell
node -v
npm -v
git --version
rustc --version
cargo --version
rustup show active-toolchain
Get-Command cl.exe -ErrorAction SilentlyContinue
Get-Command ffmpeg -ErrorAction SilentlyContinue
nvidia-smi
```

`cl.exe` yalnızca Developer Command Prompt ortamındayken PATH'te görünebilir; Build Tools kurulu olmasına rağmen boş dönebilir. `doctor.ps1` bu durumu kesin hüküm diye sunmaz.
