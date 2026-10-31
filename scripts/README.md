# PowerShell Scriptler

- `doctor.ps1`: Sadece sistem / araç kontrolü, değişiklik yapmaz.
- `setup.ps1`: Node/npm kontrol, `npm install`, `typecheck`, `test`, `build`; Rust/AI/FFmpeg kurmaz.
- `run-web.ps1`: 127.0.0.1:1420 üzerinde Vite UI.
- `run-desktop.ps1`: Rust ve C++ Build Tools hazırsa Tauri geliştirme penceresi.
- `build-windows.ps1`: test kontrolü sonrası Windows NSIS kurulum dosyası derler.

Örnek: `powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1`. Scriptler proje kökünden veya başka dizinden başlatılabilir. `setup.ps1` internet isteyebilir. `npm.cmd` PowerShell execution policy sorunlarından kaçınmak için kullanılmıştır.
