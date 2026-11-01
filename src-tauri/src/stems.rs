use std::{
    ffi::{c_char, c_void, CStr, CString},
    fs,
    io::{Read, Write},
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{Emitter, Manager};

use crate::asr::{download, sha256_file};
use crate::audio_denoise::format_of;
use crate::audio_mix::probe;

/// Yapay zekâ ile kaynak ayrıştırma (vokal / davul / bas / diğer): Meta'nın `htdemucs` modeli (MIT), ONNX biçiminde,
/// Microsoft ONNX Runtime (MIT) ile bu bilgisayarda çalışır. Hiçbir şey kurulumla gelmez: motor ve model yalnız kullanıcı
/// onayıyla iner (veya yerel klasörden alınır), boyut + SHA-256 doğrulanır. Ses dışarı gönderilmez; kaynak dosya değişmez.
/// ONNX Runtime DLL'i `LoadLibraryExW` ile tam yoldan yüklenir ve C API işlev tablosu üzerinden çağrılır (ek Rust paketi yok).
const ORT_URL: &str = "https://github.com/microsoft/onnxruntime/releases/download/v1.31.1/onnxruntime-win-x64-1.31.1.zip";
const ORT_SIZE: u64 = 82_929_944;
const ORT_SHA256: &str = "5869e26bb25314375f2d5ef1877e3ea06b1543d6c710e6e4a1ec2f7177ab4b2c";
const ORT_ZIP_DIR: &str = "onnxruntime-win-x64-1.31.1";
const ORT_FILES: [&str; 2] = ["onnxruntime.dll", "onnxruntime_providers_shared.dll"];

/// Dönüştürülmüş model (iki dosya aynı klasörde durmalı: ONNX, ağırlıkları `.data` dosyasından okur). Kurulum paketiyle gelir;
/// ayrıca indirilmez (yalnız geliştirici derlemelerinde "klasörden al" ile kurulabilir).
const MODEL_FILES: [(&str, u64, &str); 2] = [
    ("htdemucs.onnx", 2_458_228, "04680f424ba8232b408e6a7d83d9f12a7cc4a4249176c0ded5d974e5c8e36101"),
    ("htdemucs.onnx.data", 168_293_632, "e8b687ed0a8506a8b2627b68fc5eb27ce401323f054b1465b5903ae8b7fcd5dc"),
];

pub(crate) const SAMPLE_RATE: usize = 44_100;
const SEG: usize = 343_980; // modelin sabit parça uzunluğu (≈ 7,8 sn)
const NFFT: usize = 4096;
const HOP: usize = 1024;
const FREQS: usize = 2048;
const FRAMES: usize = 336;
const SOURCES: usize = 4; // davul, bas, diğer, vokal
const MAX_SECONDS: f64 = 480.0; // bellek için üst sınır (8 dk)
const API_VERSION: u32 = 17;

/// Arayüzde seçilebilen çıktılar: kimlik → (etiket, kaynak indeksleri). Kaynak sırası: 0 davul, 1 bas, 2 diğer, 3 vokal.
const OUTPUTS: [(&str, &[usize]); 5] = [("vokal", &[3]), ("eslik", &[0, 1, 2]), ("davul", &[0]), ("bas", &[1]), ("diger", &[2])];

static CANCEL: AtomicBool = AtomicBool::new(false);

/// Kurulum paketiyle gelen yapay zekâ dosyalarının klasörü (`<kurulum>\stems`); uygulama açılırken bir kez ayarlanır.
static BUNDLED: OnceLock<PathBuf> = OnceLock::new();
pub(crate) fn init_bundled(dir: PathBuf) { let _ = BUNDLED.set(dir); }
pub(crate) fn bundled_dir() -> Option<&'static Path> { BUNDLED.get().map(PathBuf::as_path) }

/// Paketle gelen klasör eksiksizse onu, değilse indirilen kopyanın klasörünü seçer (kullanıcıya hiçbir şey indirtmemek için).
fn pick_dir(bundled: Option<&Path>, fallback: PathBuf, complete: impl Fn(&Path) -> bool) -> PathBuf {
    match bundled { Some(b) if complete(b) => b.to_path_buf(), _ => fallback }
}
fn engine_complete(dir: &Path) -> bool { ORT_FILES.iter().all(|f| fs::metadata(dir.join(f)).is_ok_and(|m| m.is_file() && m.len() > 10_000)) }
fn model_complete(dir: &Path) -> bool { MODEL_FILES.iter().all(|(n, s, _)| fs::metadata(dir.join(n)).is_ok_and(|m| m.is_file() && m.len() == *s)) }
fn engine_dir(base: &Path) -> PathBuf { pick_dir(bundled_dir(), base.join("engine"), engine_complete) }
fn model_dir(base: &Path) -> PathBuf { pick_dir(bundled_dir(), base.join("model"), model_complete) }
fn engine_dll(base: &Path) -> PathBuf { engine_dir(base).join("onnxruntime.dll") }
fn model_onnx(base: &Path) -> PathBuf { model_dir(base).join(MODEL_FILES[0].0) }

fn engine_installed(base: &Path) -> bool { engine_complete(&engine_dir(base)) }
fn model_installed(base: &Path) -> bool { model_complete(&model_dir(base)) }

// ---------------------------------------------------------------------------------------------------------------------
// ONNX Runtime C API (yalnız gereken işlevler; indeksler `onnxruntime_c_api.h` içindeki OrtApi sırasından çıkarıldı)
// ---------------------------------------------------------------------------------------------------------------------
#[link(name = "kernel32")]
unsafe extern "system" {
    fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    fn GetLastError() -> u32;
}

const I_GET_ERROR_MESSAGE: usize = 2;
const I_CREATE_ENV: usize = 3;
const I_CREATE_SESSION: usize = 7;
const I_RUN: usize = 9;
const I_CREATE_SESSION_OPTIONS: usize = 10;
const I_CREATE_TENSOR: usize = 49;
const I_GET_TENSOR_DATA: usize = 51;
const I_CREATE_CPU_MEMORY_INFO: usize = 69;
const I_RELEASE_ENV: usize = 92;
const I_RELEASE_STATUS: usize = 93;
const I_RELEASE_MEMORY_INFO: usize = 94;
const I_RELEASE_SESSION: usize = 95;
const I_RELEASE_VALUE: usize = 96;
const I_RELEASE_SESSION_OPTIONS: usize = 100;

type Status = *mut c_void;
type RunFn = unsafe extern "C" fn(*mut c_void, *const c_void, *const *const c_char, *const *const c_void, usize, *const *const c_char, usize, *mut *mut c_void) -> Status;

#[repr(C)]
struct OrtApiBase { get_api: unsafe extern "C" fn(u32) -> *const *const c_void }

struct Ort { api: *const *const c_void }

impl Ort {
    fn load(dll: &Path) -> Result<Ort, String> {
        let wide: Vec<u16> = dll.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        // 0x8 = LOAD_WITH_ALTERED_SEARCH_PATH: DLL'in kendi klasöründeki bağımlılıklar da bulunur.
        let module = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), 0x8) };
        if module.is_null() { return Err(format!("ONNX Runtime yüklenemedi (Windows hata kodu {}).", unsafe { GetLastError() })); }
        let get_base = unsafe { GetProcAddress(module, c"OrtGetApiBase".as_ptr() as *const u8) };
        if get_base.is_null() { return Err("ONNX Runtime DLL'inde OrtGetApiBase bulunamadı.".into()); }
        let get_base: unsafe extern "C" fn() -> *const OrtApiBase = unsafe { std::mem::transmute(get_base) };
        let base = unsafe { get_base() };
        if base.is_null() { return Err("ONNX Runtime başlatılamadı.".into()); }
        let api = unsafe { ((*base).get_api)(API_VERSION) };
        if api.is_null() { return Err("ONNX Runtime sürümü bu uygulamayla uyumsuz.".into()); }
        Ok(Ort { api })
    }

    unsafe fn f<T>(&self, index: usize) -> T { unsafe { std::mem::transmute_copy(&*self.api.add(index)) } }

    fn check(&self, status: Status) -> Result<(), String> {
        if status.is_null() { return Ok(()); }
        unsafe {
            let msg: unsafe extern "C" fn(Status) -> *const c_char = self.f(I_GET_ERROR_MESSAGE);
            let p = msg(status);
            let text = if p.is_null() { "bilinmeyen hata".to_string() } else { CStr::from_ptr(p).to_string_lossy().chars().take(400).collect() };
            let release: unsafe extern "C" fn(Status) = self.f(I_RELEASE_STATUS);
            release(status);
            Err(format!("ONNX Runtime hatası: {text}"))
        }
    }
}

struct Session<'a> { ort: &'a Ort, env: *mut c_void, session: *mut c_void, mem: *mut c_void }

impl<'a> Session<'a> {
    fn new(ort: &'a Ort, model: &Path) -> Result<Session<'a>, String> {
        unsafe {
            let create_env: unsafe extern "C" fn(i32, *const c_char, *mut *mut c_void) -> Status = ort.f(I_CREATE_ENV);
            let create_opts: unsafe extern "C" fn(*mut *mut c_void) -> Status = ort.f(I_CREATE_SESSION_OPTIONS);
            let create_session: unsafe extern "C" fn(*mut c_void, *const u16, *const c_void, *mut *mut c_void) -> Status = ort.f(I_CREATE_SESSION);
            let create_mem: unsafe extern "C" fn(i32, i32, *mut *mut c_void) -> Status = ort.f(I_CREATE_CPU_MEMORY_INFO);
            let release_opts: unsafe extern "C" fn(*mut c_void) = ort.f(I_RELEASE_SESSION_OPTIONS);
            let (mut env, mut opts, mut session, mut mem) = (std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
            let name = CString::new("voxcut").map_err(|e| e.to_string())?;
            ort.check(create_env(3, name.as_ptr(), &mut env))?;
            let mut out = Session { ort, env, session: std::ptr::null_mut(), mem: std::ptr::null_mut() };
            ort.check(create_opts(&mut opts))?;
            let wide: Vec<u16> = model.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            let r = create_session(env, wide.as_ptr(), opts, &mut session);
            release_opts(opts);
            ort.check(r)?;
            out.session = session;
            ort.check(create_mem(1, 0, &mut mem))?; // OrtArenaAllocator, OrtMemTypeDefault
            out.mem = mem;
            Ok(out)
        }
    }

    /// Bir parçayı çalıştırır: `wave` = 2×SEG, `mag` = 4×2048×336; dönüş (frekans kolu 4·4·2048·336, zaman kolu 4·2·SEG).
    fn run(&self, wave: &mut [f32], mag: &mut [f32]) -> Result<(Vec<f32>, Vec<f32>), String> {
        debug_assert!(wave.len() == 2 * SEG && mag.len() == 4 * FREQS * FRAMES);
        unsafe {
            let o = self.ort;
            let create_tensor: unsafe extern "C" fn(*const c_void, *mut c_void, usize, *const i64, usize, i32, *mut *mut c_void) -> Status = o.f(I_CREATE_TENSOR);
            let run: RunFn = o.f(I_RUN);
            let get_data: unsafe extern "C" fn(*mut c_void, *mut *mut c_void) -> Status = o.f(I_GET_TENSOR_DATA);
            let release_value: unsafe extern "C" fn(*mut c_void) = o.f(I_RELEASE_VALUE);
            let shape_w = [1i64, 2, SEG as i64];
            let shape_m = [1i64, 4, FREQS as i64, FRAMES as i64];
            let (mut tw, mut tm) = (std::ptr::null_mut(), std::ptr::null_mut());
            o.check(create_tensor(self.mem, wave.as_mut_ptr() as *mut c_void, std::mem::size_of_val(wave), shape_w.as_ptr(), 3, 1, &mut tw))?;
            let r = create_tensor(self.mem, mag.as_mut_ptr() as *mut c_void, std::mem::size_of_val(mag), shape_m.as_ptr(), 4, 1, &mut tm);
            if let Err(e) = o.check(r) { release_value(tw); return Err(e); }
            let names_in = [CString::new("input").unwrap(), CString::new("x").unwrap()];
            let names_out = [CString::new("output").unwrap(), CString::new("add_67").unwrap()];
            let in_ptrs = [names_in[0].as_ptr(), names_in[1].as_ptr()];
            let out_ptrs = [names_out[0].as_ptr(), names_out[1].as_ptr()];
            let inputs = [tw as *const c_void, tm as *const c_void];
            let mut outputs: [*mut c_void; 2] = [std::ptr::null_mut(); 2];
            let status = run(self.session, std::ptr::null(), in_ptrs.as_ptr(), inputs.as_ptr(), 2, out_ptrs.as_ptr(), 2, outputs.as_mut_ptr());
            let result = (|| {
                o.check(status)?;
                let (mut p0, mut p1) = (std::ptr::null_mut(), std::ptr::null_mut());
                o.check(get_data(outputs[0], &mut p0))?;
                o.check(get_data(outputs[1], &mut p1))?;
                if p0.is_null() || p1.is_null() { return Err("Model çıktısı okunamadı.".to_string()); }
                Ok((std::slice::from_raw_parts(p0 as *const f32, SOURCES * 4 * FREQS * FRAMES).to_vec(), std::slice::from_raw_parts(p1 as *const f32, SOURCES * 2 * SEG).to_vec()))
            })();
            for v in [tw, tm, outputs[0], outputs[1]] { if !v.is_null() { release_value(v); } }
            result
        }
    }
}

impl Drop for Session<'_> {
    fn drop(&mut self) {
        unsafe {
            let o = self.ort;
            if !self.mem.is_null() { let f: unsafe extern "C" fn(*mut c_void) = o.f(I_RELEASE_MEMORY_INFO); f(self.mem); }
            if !self.session.is_null() { let f: unsafe extern "C" fn(*mut c_void) = o.f(I_RELEASE_SESSION); f(self.session); }
            if !self.env.is_null() { let f: unsafe extern "C" fn(*mut c_void) = o.f(I_RELEASE_ENV); f(self.env); }
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// STFT / ters STFT (torch.stft / torch.istft ile aynı kurallar: Hann penceresi, normalized, center, reflect)
// ---------------------------------------------------------------------------------------------------------------------
struct Dsp { window: Vec<f64>, cos: Vec<f64>, sin: Vec<f64>, rev: Vec<usize>, envelope: Vec<f64> }

const PAD1: usize = HOP / 2 * 3; // 1536
const PADDED: usize = FRAMES * HOP + 2 * PAD1; // 347136: demucs'un yeniden dolgulu uzunluğu
const CENTER: usize = PADDED + NFFT; // 351232: torch'un merkez dolgusundan sonra
const TOTAL_FRAMES: usize = (CENTER - NFFT) / HOP + 1; // 340

impl Dsp {
    fn new() -> Dsp {
        let window: Vec<f64> = (0..NFFT).map(|n| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * n as f64 / NFFT as f64).cos()).collect();
        let cos = (0..NFFT / 2).map(|k| (2.0 * std::f64::consts::PI * k as f64 / NFFT as f64).cos()).collect();
        let sin = (0..NFFT / 2).map(|k| (2.0 * std::f64::consts::PI * k as f64 / NFFT as f64).sin()).collect();
        let bits = NFFT.trailing_zeros();
        let rev = (0..NFFT).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let mut envelope = vec![0.0; CENTER];
        for j in 0..TOTAL_FRAMES { for n in 0..NFFT { envelope[j * HOP + n] += window[n] * window[n]; } }
        Dsp { window, cos, sin, rev, envelope }
    }

    /// Yerinde radix-2 FFT (`inverse` = ters dönüşüm, ölçeklenmez).
    fn fft(&self, re: &mut [f64], im: &mut [f64], inverse: bool) {
        for i in 0..NFFT { let j = self.rev[i]; if j > i { re.swap(i, j); im.swap(i, j); } }
        let mut len = 2;
        while len <= NFFT {
            let step = NFFT / len;
            for start in (0..NFFT).step_by(len) {
                for k in 0..len / 2 {
                    let (wr, wi) = (self.cos[k * step], if inverse { self.sin[k * step] } else { -self.sin[k * step] });
                    let (a, b) = (start + k, start + k + len / 2);
                    let (tr, ti) = (re[b] * wr - im[b] * wi, re[b] * wi + im[b] * wr);
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                }
            }
            len *= 2;
        }
    }

    /// `x` (SEG örnek) → (gerçek, sanal), her biri FREQS×FRAMES (satır = frekans).
    fn stft(&self, x: &[f32]) -> (Vec<f32>, Vec<f32>) {
        let first = reflect_pad(x, PAD1, PADDED - SEG - PAD1);
        let padded = reflect_pad(&first, NFFT / 2, NFFT / 2);
        let (mut out_re, mut out_im) = (vec![0f32; FREQS * FRAMES], vec![0f32; FREQS * FRAMES]);
        let (mut re, mut im) = (vec![0f64; NFFT], vec![0f64; NFFT]);
        for t in 0..FRAMES {
            let start = (t + 2) * HOP; // torch çıktısının 2. çerçevesinden başlar
            for n in 0..NFFT { re[n] = padded[start + n] as f64 * self.window[n]; im[n] = 0.0; }
            self.fft(&mut re, &mut im, false);
            for f in 0..FREQS { out_re[f * FRAMES + t] = (re[f] / 64.0) as f32; out_im[f * FRAMES + t] = (im[f] / 64.0) as f32; }
        }
        (out_re, out_im)
    }

    /// FREQS×FRAMES karmaşık spektrumdan SEG örnek üretir (demucs `standalone_ispec`: üst bin 0, zaman 2+2 sıfır dolgu).
    fn istft(&self, re_in: &[f32], im_in: &[f32]) -> Vec<f32> {
        let mut acc = vec![0f64; CENTER];
        let (mut re, mut im) = (vec![0f64; NFFT], vec![0f64; NFFT]);
        for j in 2..2 + FRAMES {
            let t = j - 2;
            for f in 0..FREQS {
                let (a, b) = (re_in[f * FRAMES + t] as f64, im_in[f * FRAMES + t] as f64);
                re[f] = a; im[f] = b;
                if f > 0 { re[NFFT - f] = a; im[NFFT - f] = -b; }
            }
            re[FREQS] = 0.0; im[FREQS] = 0.0; // Nyquist bini atılmıştı
            self.fft(&mut re, &mut im, true);
            for n in 0..NFFT { acc[j * HOP + n] += re[n] / NFFT as f64 * 64.0 * self.window[n]; }
        }
        let offset = NFFT / 2 + PAD1;
        (0..SEG).map(|i| { let e = self.envelope[offset + i]; (acc[offset + i] / if e > 1e-11 { e } else { 1.0 }) as f32 }).collect()
    }
}

/// Kenar örneği tekrarlamayan yansıtmalı dolgu (torch `reflect`).
fn reflect_pad(v: &[f32], left: usize, right: usize) -> Vec<f32> {
    let n = v.len();
    let mut out = vec![0f32; left + n + right];
    out[left..left + n].copy_from_slice(v);
    for k in 1..=left { out[left - k] = v[k]; }
    for k in 1..=right { out[left + n - 1 + k] = v[n - 1 - k]; }
    out
}

/// Modelin giriş spektrumu: [gerçek0, sanal0, gerçek1, sanal1] × FREQS × FRAMES ("cac").
fn model_input(dsp: &Dsp, chunk: &[f32]) -> Vec<f32> {
    let mut mag = Vec::with_capacity(4 * FREQS * FRAMES);
    for c in 0..2 {
        let (re, im) = dsp.stft(&chunk[c * SEG..(c + 1) * SEG]);
        mag.extend_from_slice(&re);
        mag.extend_from_slice(&im);
    }
    mag
}

/// Bir parçanın dört kaynağı: [kaynak][kanal][SEG].
fn run_chunk(sess: &Session, dsp: &Dsp, chunk: &[f32]) -> Result<Vec<f32>, String> {
    let mut wave = chunk.to_vec();
    let mut mag = model_input(dsp, chunk);
    let (out_f, out_t) = sess.run(&mut wave, &mut mag)?;
    let mut result = vec![0f32; SOURCES * 2 * SEG];
    let plane = FREQS * FRAMES;
    for s in 0..SOURCES {
        for c in 0..2 {
            let re = &out_f[(s * 4 + 2 * c) * plane..(s * 4 + 2 * c + 1) * plane];
            let im = &out_f[(s * 4 + 2 * c + 1) * plane..(s * 4 + 2 * c + 2) * plane];
            let time = dsp.istft(re, im);
            let dst = &mut result[(s * 2 + c) * SEG..(s * 2 + c + 1) * SEG];
            let tb = &out_t[(s * 2 + c) * SEG..(s * 2 + c + 1) * SEG];
            for i in 0..SEG { dst[i] = time[i] + tb[i]; }
        }
    }
    Ok(result)
}

// ---------------------------------------------------------------------------------------------------------------------
// Dosya işleme
// ---------------------------------------------------------------------------------------------------------------------
fn decode(input: &str) -> Result<[Vec<f32>; 2], String> {
    let mut child = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-v", "error", "-i", input, "-vn", "-map", "0:a:0", "-f", "f32le", "-ar", "44100", "-ac", "2", "-"])
        .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
    let mut raw = Vec::new();
    child.stdout.take().ok_or("FFmpeg çıktısı alınamadı.")?.read_to_end(&mut raw).map_err(|e| format!("Ses okunamadı: {e}"))?;
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() || raw.len() < 8 { return Err("Ses çözülemedi.".into()); }
    let n = raw.len() / 8;
    let (mut l, mut r) = (Vec::with_capacity(n), Vec::with_capacity(n));
    let (frames, _) = raw.as_chunks::<8>();
    for f in frames { l.push(f32::from_le_bytes([f[0], f[1], f[2], f[3]])); r.push(f32::from_le_bytes([f[4], f[5], f[6], f[7]])); }
    Ok([l, r])
}

fn mean_std(ch: &[Vec<f32>; 2]) -> (f64, f64) {
    let n = ch[0].len() as f64;
    let mean = ch[0].iter().zip(&ch[1]).map(|(a, b)| (*a as f64 + *b as f64) / 2.0).sum::<f64>() / n;
    let var = ch[0].iter().zip(&ch[1]).map(|(a, b)| { let d = (*a as f64 + *b as f64) / 2.0 - mean; d * d }).sum::<f64>() / (n - 1.0).max(1.0);
    (mean, var.sqrt())
}

/// Ayrıştırır; dönüş [kaynak][kanal][örnek] (normalleştirme geri alınmış).
fn separate_audio(base: &Path, audio: &[Vec<f32>; 2], cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<Vec<Vec<Vec<f32>>>, String> {
    let ort = Ort::load(&engine_dll(base))?;
    let sess = Session::new(&ort, &model_onnx(base))?;
    let dsp = Dsp::new();
    let total = audio[0].len();
    let (mean, std) = mean_std(audio);
    let scale = 1.0 / (std + 1e-5);
    let stride = SEG * 3 / 4;
    let weight: Vec<f32> = (0..SEG).map(|i| { let v = (i.min(SEG - 1 - i) + 1) as f32; v / (SEG / 2) as f32 }).collect();
    let mut out: Vec<Vec<Vec<f32>>> = vec![vec![vec![0f32; total]; 2]; SOURCES];
    let mut wsum = vec![0f32; total];
    let chunks = if total <= SEG { 1 } else { (total - SEG).div_ceil(stride) + 1 };
    for ci in 0..chunks {
        if cancel.load(Ordering::SeqCst) { return Err("İşlem iptal edildi.".into()); }
        let start = if total <= SEG { 0 } else { (ci * stride).min(total - SEG) };
        let len = (total - start).min(SEG);
        let mut chunk = vec![0f32; 2 * SEG];
        for c in 0..2 { for i in 0..len { chunk[c * SEG + i] = ((audio[c][start + i] as f64 - mean) * scale) as f32; } }
        let y = run_chunk(&sess, &dsp, &chunk)?;
        for i in 0..len {
            let w = weight[i];
            wsum[start + i] += w;
            for s in 0..SOURCES { for c in 0..2 { out[s][c][start + i] += y[(s * 2 + c) * SEG + i] * w; } }
        }
        on_progress((ci + 1) as f64 / chunks as f64 * 92.0);
    }
    for channel in out.iter_mut().flatten() {
        for (v, ws) in channel.iter_mut().zip(&wsum) {
            let w = if *ws > 1e-6 { *ws } else { 1.0 };
            *v = ((*v / w) as f64 * (std + 1e-5) + mean) as f32;
        }
    }
    Ok(out)
}

fn safe_name(stem: &str) -> String {
    let s: String = stem.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    let s = s.trim_matches('_').to_string();
    if s.is_empty() { "ses".into() } else { s.chars().take(80).collect() }
}

fn write_output(channels: &[&[Vec<f32>]], gain: f32, temp: &Path, codec: &[&str]) -> Result<(), String> {
    let mut child = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", "44100", "-ac", "2", "-i", "-"]).args(codec).arg(temp)
        .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("FFmpeg başlatılamadı: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("FFmpeg girişi açılamadı.")?;
    let total = channels[0][0].len();
    let mut buf: Vec<u8> = Vec::with_capacity(1 << 20);
    let mut write_err = None;
    for start in (0..total).step_by(1 << 17) {
        buf.clear();
        for i in start..(start + (1 << 17)).min(total) {
            for c in 0..2 {
                let v: f32 = channels.iter().map(|s| s[c][i]).sum::<f32>() * gain;
                buf.extend_from_slice(&v.clamp(-1.0, 1.0).to_le_bytes());
            }
        }
        if let Err(e) = stdin.write_all(&buf) { write_err = Some(e); break; }
    }
    drop(stdin);
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if let Some(e) = write_err { return Err(format!("Ses yazılamadı: {e} {}", String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>())); }
    if !out.status.success() { return Err(format!("Çıktı yazılamadı: {}", String::from_utf8_lossy(&out.stderr).chars().take(400).collect::<String>())); }
    Ok(())
}

pub(crate) fn separate_file(base: &Path, input: &str, out_dir: &str, outputs: &[String], format: &str, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<(String, PathBuf), String> {
    let (ext, codec) = format_of(format)?;
    if !engine_installed(base) { return Err("ONNX Runtime motoru kurulu değil. Önce 'Kurulumu tamamla' düğmesini kullan.".into()); }
    if !model_installed(base) { return Err("Ayrıştırma modeli kurulu değil. Önce 'Kurulumu tamamla' düğmesini kullan.".into()); }
    if !Path::new(input).is_absolute() || !Path::new(input).is_file() { return Err("Kaynak dosya bulunamadı.".into()); }
    let stem = safe_name(Path::new(input).file_stem().and_then(|s| s.to_str()).unwrap_or("ses"));
    // Çıktı klasörü boşsa: kaynağın yanında "<ad> (ayrıştırılmış)" klasörü (başarıyla ayrıştırılınca oluşturulur).
    let auto = out_dir.trim().is_empty();
    let dir: PathBuf = if auto { Path::new(input).parent().ok_or("Kaynak klasörü bulunamadı.")?.join(format!("{stem} (ayrıştırılmış)")) } else { PathBuf::from(out_dir) };
    if !auto && (!dir.is_absolute() || !dir.is_dir()) { return Err("Çıktı klasörü bulunamadı.".into()); }
    if outputs.is_empty() { return Err("En az bir çıktı seç.".into()); }
    let mut picks: Vec<(&str, &[usize])> = Vec::new();
    for id in outputs {
        let entry = OUTPUTS.iter().find(|(n, _)| n == id).ok_or_else(|| format!("Bilinmeyen çıktı: {id}"))?;
        if !picks.iter().any(|(n, _)| n == &entry.0) { picks.push(*entry); }
    }
    let (duration, has_audio, _) = probe(input)?;
    if !has_audio { return Err("Kaynakta ses akışı yok.".into()); }
    if duration > MAX_SECONDS { return Err(format!("Bu sürümde en çok {} dakikalık kayıtlar ayrıştırılır (bellek sınırı); dosyayı parçalara bölün.", (MAX_SECONDS / 60.0) as u32)); }
    if duration < 1.0 { return Err("Kayıt çok kısa (en az 1 sn).".into()); }
    let targets: Vec<PathBuf> = picks.iter().map(|(id, _)| dir.join(format!("{stem}_{id}.{ext}"))).collect();
    if let Some(t) = targets.iter().find(|t| t.exists()) { return Err(format!("Bu dosya zaten var, üzerine yazılmaz: {}", t.display())); }

    on_progress(1.0);
    let audio = decode(input)?;
    if audio[0].len() as f64 / SAMPLE_RATE as f64 > MAX_SECONDS + 1.0 { return Err("Kayıt çok uzun.".into()); }
    let stems = separate_audio(base, &audio, cancel, on_progress)?;
    drop(audio);
    if auto { fs::create_dir_all(&dir).map_err(|e| format!("Çıktı klasörü oluşturulamadı: {e}"))?; }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let mut done = Vec::new();
    let result: Result<(), String> = (|| {
        for (i, ((_, idx), target)) in picks.iter().zip(&targets).enumerate() {
            let temp = dir.join(format!(".voxcut-stem-{}-{nonce}-{i}.{ext}", std::process::id()));
            let parts: Vec<&[Vec<f32>]> = idx.iter().map(|s| stems[*s].as_slice()).collect();
            let r = write_output(&parts, 1.0, &temp, codec).and_then(|_| {
                let (d, a, v) = probe(temp.to_str().ok_or("Çıktı yolu okunamadı.")?)?;
                if !a || v || (d - duration).abs() > 0.6 { return Err(format!("Çıktı doğrulaması başarısız (süre {d:.2} sn, beklenen {duration:.2} sn).")); }
                fs::hard_link(&temp, target).map_err(|e| format!("Çıktı kaydedilemedi (mevcut dosyalar korunur): {e}"))
            });
            let _ = fs::remove_file(&temp);
            r?;
            done.push(target.clone());
            on_progress(92.0 + 8.0 * (i + 1) as f64 / picks.len() as f64);
        }
        Ok(())
    })();
    if let Err(e) = result { for f in &done { let _ = fs::remove_file(f); } if auto { let _ = fs::remove_dir(&dir); } return Err(e); }
    let message = format!("{} dosya kaydedildi ({:.1} sn): {}", done.len(), duration, done.iter().filter_map(|p| p.file_name().and_then(|n| n.to_str())).collect::<Vec<_>>().join(", "));
    Ok((message, dir))
}

// ---------------------------------------------------------------------------------------------------------------------
// Kurulum (motor + model) ve komutlar
// ---------------------------------------------------------------------------------------------------------------------
pub(crate) fn install_engine(base: &Path, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    if engine_installed(base) { return Ok("ONNX Runtime zaten kurulu.".into()); }
    fs::create_dir_all(base).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let zip = base.join("ort.zip");
    download(ORT_URL, &zip, ORT_SIZE, ORT_SHA256, cancel, on_progress)?;
    let staging = base.join("ort-kurulum");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let result = (|| {
        let mut cmd = Command::new("tar.exe");
        cmd.arg("-xf").arg(&zip).arg("-C").arg(&staging);
        for f in ORT_FILES { cmd.arg(format!("{ORT_ZIP_DIR}/lib/{f}")); }
        let out = cmd.output().map_err(|e| format!("Arşiv açıcı (tar.exe) başlatılamadı: {e}"))?;
        if !out.status.success() { return Err(format!("Arşiv açılamadı: {}", String::from_utf8_lossy(&out.stderr).trim().chars().take(300).collect::<String>())); }
        let src = staging.join(ORT_ZIP_DIR).join("lib");
        Ort::load(&src.join("onnxruntime.dll")).map(|_| ())?; // yüklenip çalıştığı denenir
        let target = engine_dir(base);
        let _ = fs::remove_dir_all(&target);
        fs::create_dir_all(&target).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        for f in ORT_FILES { fs::copy(src.join(f), target.join(f)).map_err(|e| format!("Dosya kopyalanamadı: {e}"))?; }
        Ok("ONNX Runtime kuruldu (Microsoft, MIT lisansı).".to_string())
    })();
    let _ = fs::remove_file(&zip);
    let _ = fs::remove_dir_all(&staging);
    result
}

/// Kullanıcının seçtiği klasördeki model dosyalarını (htdemucs.onnx + .data) doğrular ve uygulama klasörüne kopyalar.
pub(crate) fn import_model(base: &Path, from: &str, cancel: &AtomicBool, on_progress: &mut dyn FnMut(f64)) -> Result<String, String> {
    let src = Path::new(from);
    if !src.is_absolute() || !src.is_dir() { return Err("Klasör bulunamadı.".into()); }
    for (name, size, _) in MODEL_FILES {
        let md = fs::metadata(src.join(name)).map_err(|_| format!("Klasörde {name} yok."))?;
        if !md.is_file() || md.len() != size { return Err(format!("{name} beklenen boyutta değil ({} / {size} bayt).", md.len())); }
    }
    let dir = model_dir(base);
    fs::create_dir_all(&dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    for (i, (name, _, sha)) in MODEL_FILES.iter().enumerate() {
        if sha256_file(&src.join(name), cancel)? != *sha { return Err(format!("{name} SHA-256 doğrulaması başarısız; bu, beklenen model değil.")); }
        let part = dir.join(format!("{name}.part"));
        fs::copy(src.join(name), &part).map_err(|e| format!("Dosya kopyalanamadı: {e}"))?;
        fs::rename(&part, dir.join(name)).map_err(|e| format!("Dosya yerine konamadı: {e}"))?;
        on_progress(50.0 * (i + 1) as f64);
    }
    Ok("Model doğrulandı ve kuruldu.".into())
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| format!("Uygulama veri klasörü bulunamadı: {e}"))?.join("stems"))
}

fn reporter(app: tauri::AppHandle, phase: &'static str) -> impl FnMut(f64) {
    let mut last = -1.0f64;
    move |pct| { if (pct - last).abs() >= 1.0 { last = pct; let _ = app.emit("stems-progress", serde_json::json!({ "phase": phase, "pct": pct.round() })); } }
}

#[tauri::command]
pub async fn stems_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || serde_json::json!({
        "engineInstalled": engine_installed(&base), "engineSize": ORT_SIZE,
        "modelInstalled": model_installed(&base), "modelSize": MODEL_FILES.iter().map(|f| f.1).sum::<u64>(),
        "maxMinutes": (MAX_SECONDS / 60.0) as u32,
        "outputs": OUTPUTS.iter().map(|o| o.0).collect::<Vec<_>>(),
    })).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stems_install_engine(app: tauri::AppHandle) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || install_engine(&base, &CANCEL, &mut reporter(app, "engine"))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stems_import_model(app: tauri::AppHandle, from: String) -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || import_model(&base, &from, &CANCEL, &mut reporter(app, "model"))).await.map_err(|e| e.to_string())?
}

/// `outputs`: "vokal", "eslik" (davul+bas+diğer), "davul", "bas", "diger". `format`: wav / mp3 / flac. Dosyalar `<ad>_<çıktı>.<uzantı>`.
#[tauri::command]
pub async fn stems_separate(app: tauri::AppHandle, input_path: String, out_dir: String, outputs: Vec<String>, format: String) -> Result<serde_json::Value, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let base = data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || separate_file(&base, &input_path, &out_dir, &outputs, &format, &CANCEL, &mut reporter(app, "separate")).map(|(message, folder)| serde_json::json!({ "message": message, "folder": folder.to_string_lossy() }))).await.map_err(|e| e.to_string())?
}

/// Çıktı klasörünü Windows Gezgini'nde açar (yalnız var olan, mutlak bir klasör).
#[tauri::command]
pub fn stems_open_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() || !p.is_dir() { return Err("Klasör bulunamadı.".into()); }
    Command::new("explorer.exe").arg(p).spawn().map(|_| ()).map_err(|e| format!("Gezgin açılamadı: {e}"))
}

#[tauri::command]
pub fn stems_cancel() { CANCEL.store(true, Ordering::SeqCst); }

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(n: usize) -> Vec<f32> { (0..n).map(|i| 0.5 * (i as f32 * 0.031).sin() + 0.3 * (i as f32 * 0.0071).sin() + 0.1 * (((i * 7919) % 1000) as f32 / 1000.0 - 0.5)).collect() }

    #[test]
    fn dimensions_match_the_model_contract() {
        assert_eq!(PADDED, 347_136);
        assert_eq!(CENTER, 351_232);
        assert_eq!(TOTAL_FRAMES, 340);
        assert_eq!(FRAMES, SEG.div_ceil(HOP));
        assert_eq!(PADDED - SEG - PAD1, 1620, "sağ dolgu demucs ile aynı olmalı");
    }

    #[test]
    fn reflect_pad_mirrors_without_repeating_the_edge_sample() {
        assert_eq!(reflect_pad(&[1.0, 2.0, 3.0, 4.0], 2, 2), vec![3.0, 2.0, 1.0, 2.0, 3.0, 4.0, 3.0, 2.0]);
    }

    #[test]
    fn fft_matches_a_direct_dft_and_inverts() {
        let dsp = Dsp::new();
        let x: Vec<f64> = (0..NFFT).map(|i| (i as f64 * 0.01).sin() + 0.25 * (i as f64 * 0.37).cos()).collect();
        let (mut re, mut im) = (x.clone(), vec![0.0; NFFT]);
        dsp.fft(&mut re, &mut im, false);
        for k in [0usize, 1, 7, 100, 2047, 2048] {
            let (mut sr, mut si) = (0.0, 0.0);
            for (n, v) in x.iter().enumerate() { let a = -2.0 * std::f64::consts::PI * (k * n) as f64 / NFFT as f64; sr += v * a.cos(); si += v * a.sin(); }
            assert!((re[k] - sr).abs() < 1e-6 && (im[k] - si).abs() < 1e-6, "bin {k}");
        }
        dsp.fft(&mut re, &mut im, true);
        for i in [0usize, 5, 1000, 4095] { assert!((re[i] / NFFT as f64 - x[i]).abs() < 1e-9); }
    }

    #[test]
    fn stft_then_istft_reconstructs_the_interior_of_the_signal() {
        let dsp = Dsp::new();
        let x = tone(SEG);
        let (re, im) = dsp.stft(&x);
        let y = dsp.istft(&re, &im);
        assert_eq!(y.len(), SEG);
        // Kenar çerçeveleri (2 başta, 2 sonda) modelin kendisinde atılır; iç bölge kayıpsız geri gelmeli.
        let worst = (4096..SEG - 4096).map(|i| (x[i] - y[i]).abs()).fold(0f32, f32::max);
        assert!(worst < 2e-4, "iç bölgede en büyük sapma {worst}");
    }

    #[test]
    fn stft_scale_follows_torch_normalized_convention() {
        let dsp = Dsp::new();
        // sabit 1 sinyalinin DC bini: toplam(window)/64 = 2048/64 = 32 (periyodik Hann toplamı N/2)
        let (re, _) = dsp.stft(&vec![1.0; SEG]);
        assert!((re[FRAMES / 2] - 32.0).abs() < 1e-3, "{}", re[FRAMES / 2]);
    }

    #[test]
    fn bundled_files_win_only_when_complete() {
        let root = std::env::temp_dir().join(format!("voxcut stems paket {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let (bundled, fallback) = (root.join("stems"), root.join("indirilen"));
        fs::create_dir_all(&bundled).unwrap();
        assert_eq!(pick_dir(None, fallback.clone(), engine_complete), fallback, "paket yoksa indirilen klasör");
        assert_eq!(pick_dir(Some(&bundled), fallback.clone(), engine_complete), fallback, "paket klasörü boşsa indirilen klasör");
        for f in ORT_FILES { fs::write(bundled.join(f), vec![0u8; 20_000]).unwrap(); }
        assert_eq!(pick_dir(Some(&bundled), fallback.clone(), engine_complete), bundled, "motor dosyaları tamamsa paket klasörü");
        assert_eq!(pick_dir(Some(&bundled), fallback.clone(), model_complete), fallback, "model eksikse (yalnız motor var) model için indirilen klasör");
        fs::write(bundled.join(ORT_FILES[1]), b"x").unwrap();
        assert_eq!(pick_dir(Some(&bundled), fallback.clone(), engine_complete), fallback, "bozuk/kısa dosya tamam sayılmaz");
        for (n, s, _) in MODEL_FILES { fs::File::create(bundled.join(n)).unwrap().set_len(s).unwrap(); }
        assert_eq!(pick_dir(Some(&bundled), fallback.clone(), model_complete), bundled);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn output_catalog_and_names_are_safe() {
        assert!(OUTPUTS.iter().all(|(id, src)| id.chars().all(|c| c.is_ascii_lowercase()) && src.iter().all(|s| *s < SOURCES)));
        assert_eq!(safe_name("şarkı: (final) ✓.mp3"), "şarkı___final____mp3");
        assert_eq!(safe_name("..."), "ses");
        assert!(MODEL_FILES.iter().all(|(n, s, h)| n.starts_with("htdemucs") && *s > 1000 && h.len() == 64));
        assert!(ORT_URL.starts_with("https://github.com/microsoft/onnxruntime/releases/download/v1.31.1/"));
        assert_eq!(ORT_SHA256.len(), 64);
    }

    #[test]
    fn requests_are_rejected_before_any_work() {
        let base = std::env::temp_dir().join(format!("voxcut stems ğ {}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let no = AtomicBool::new(false);
        let r = |input: &str, outs: &[&str], fmt: &str| separate_file(&base, input, base.to_str().unwrap(), &outs.iter().map(|s| s.to_string()).collect::<Vec<_>>(), fmt, &no, &mut |_| {}).unwrap_err();
        assert!(r("x.wav", &["vokal"], "wav").contains("motoru kurulu değil"));
        assert!(r("x.wav", &["vokal"], "ogg").contains("Desteklenmeyen"));
        // motor ve model "kurulu" göster (sahte): doğrulamalar dosyaya bakmadan önce çalışmalı
        fs::create_dir_all(engine_dir(&base)).unwrap(); fs::create_dir_all(model_dir(&base)).unwrap();
        for f in ORT_FILES { fs::write(engine_dir(&base).join(f), vec![0u8; 20_000]).unwrap(); }
        assert!(r("x.wav", &["vokal"], "wav").contains("modeli kurulu değil"));
        for (n, s, _) in MODEL_FILES { let f = fs::File::create(model_dir(&base).join(n)).unwrap(); f.set_len(s).unwrap(); }
        assert!(r("göreli.wav", &["vokal"], "wav").contains("Kaynak dosya bulunamadı"));
        let src = base.join("k.wav"); fs::write(&src, b"x").unwrap();
        assert!(r(src.to_str().unwrap(), &[], "wav").contains("En az bir"));
        assert!(r(src.to_str().unwrap(), &["gitar"], "wav").contains("Bilinmeyen çıktı"));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn import_rejects_wrong_or_missing_files_without_side_effects() {
        let base = std::env::temp_dir().join(format!("voxcut stems-ice {}", std::process::id()));
        let src = base.join("kaynak"); let _ = fs::remove_dir_all(&base); fs::create_dir_all(&src).unwrap();
        let no = AtomicBool::new(false);
        assert!(import_model(&base, src.to_str().unwrap(), &no, &mut |_| {}).unwrap_err().contains("yok"));
        fs::write(src.join(MODEL_FILES[0].0), b"yanlis").unwrap(); fs::write(src.join(MODEL_FILES[1].0), b"yanlis").unwrap();
        assert!(import_model(&base, src.to_str().unwrap(), &no, &mut |_| {}).unwrap_err().contains("boyutta değil"));
        assert!(import_model(&base, "relative", &no, &mut |_| {}).is_err());
        assert!(!model_installed(&base) && !model_dir(&base).join(MODEL_FILES[0].0).exists());
        let _ = fs::remove_dir_all(&base);
    }

    /// GERÇEK deneme: ml-work klasöründeki gerçek model + ONNX Runtime ile konuşma+müzik karışımını ayrıştırır;
    /// Python'daki doğrulama (vokal SDR ≈ +10 dB, eşlik SDR ≈ +22 dB) ile aynı sonuç beklenir.
    /// `cargo test --release stems_gercek -- --ignored --nocapture`
    #[test]
    #[ignore = "ml-work klasöründeki model ve motor dosyalarını kullanır"]
    fn stems_gercek() {
        let work = Path::new("D:/VoxCutStudio/ml-work");
        let dll_dir = work.join("ort/onnxruntime-win-x64-1.31.1/lib");
        let model = work.join("onnx-models");
        let refs = work.join("dogrulama");
        if !dll_dir.join("onnxruntime.dll").exists() || !model.join(MODEL_FILES[0].0).exists() || !refs.join("karisim.wav").exists() { eprintln!("ml-work dosyaları yok, test atlandı"); return; }
        let base = std::env::temp_dir().join(format!("voxcut stems gercek {}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(engine_dir(&base)).unwrap(); fs::create_dir_all(model_dir(&base)).unwrap();
        for f in ORT_FILES { fs::copy(dll_dir.join(f), engine_dir(&base).join(f)).unwrap(); }
        let no = AtomicBool::new(false);
        import_model(&base, model.to_str().unwrap(), &no, &mut |_| {}).expect("model içe aktarılamadı (SHA-256 doğrulaması dahil)");
        let out = base.join("cikti"); fs::create_dir_all(&out).unwrap();
        let t0 = std::time::Instant::now();
        let mut last = 0.0;
        let msg = separate_file(&base, refs.join("karisim.wav").to_str().unwrap(), out.to_str().unwrap(), &["vokal".into(), "eslik".into(), "davul".into()], "wav", &no, &mut |p| last = p).expect("ayrıştırma başarısız").0;
        let secs = t0.elapsed().as_secs_f64();
        eprintln!("{msg}\nsüre: {secs:.1} sn (16 sn ses), son ilerleme %{last}");
        let dec = |p: &Path| decode(p.to_str().unwrap()).unwrap();
        let (mix, music) = (dec(&refs.join("karisim.wav")), dec(&refs.join("muzik.wav")));
        let (vocal, accomp) = (dec(&out.join("karisim_vokal.wav")), dec(&out.join("karisim_eslik.wav")));
        let n = mix[0].len().min(vocal[0].len());
        let sdr = |est: &[Vec<f32>; 2], refc: &dyn Fn(usize, usize) -> f64| { let (mut num, mut den) = (0f64, 0f64); for (c, channel) in est.iter().enumerate() { for (i, v) in channel.iter().take(n).enumerate() { let r = refc(c, i); let e = *v as f64; num += r * r; den += (r - e) * (r - e); } } 10.0 * (num.max(1e-12) / den.max(1e-12)).log10() };
        let speech = |c: usize, i: usize| mix[c][i] as f64 - music[c][i] as f64;
        let music_ref = |c: usize, i: usize| music[c][i] as f64;
        let (sv, sa) = (sdr(&vocal, &speech), sdr(&accomp, &music_ref));
        eprintln!("SDR vokal {sv:.1} dB, SDR eşlik {sa:.1} dB (Python: +10,0 / +22,1)");
        assert!(sv > 8.0, "vokal SDR çok düşük: {sv}");
        assert!(sa > 19.0, "eşlik SDR çok düşük: {sa}");
        assert!(out.join("karisim_davul.wav").exists());
        assert!(fs::read_dir(&out).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".voxcut-stem")), "geçici dosya kalmamalı");
        // aynı hedefe ikinci kez yazılmaz
        assert!(separate_file(&base, refs.join("karisim.wav").to_str().unwrap(), out.to_str().unwrap(), &["vokal".into()], "wav", &no, &mut |_| {}).unwrap_err().contains("zaten var"));
        let _ = fs::remove_dir_all(&base);
    }
}
