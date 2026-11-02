use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use tauri::Manager;

/// OpenAI (ChatGPT) bağlantısı. Yalnızca kullanıcı onay verip kendi API anahtarını kaydettiyse ve "Tasarla" gibi bir düğmeye bastıysa ağa çıkar.
/// Anahtar yalnızca bu Windows kullanıcısının çözebileceği biçimde (DPAPI) uygulama veri klasöründe durur; proje dosyasına, günlüğe veya komut satırına yazılmaz.
const API: &str = "https://api.openai.com/v1";
const MAX_MESSAGES_CHARS: usize = 60_000;
const MAX_SCHEMA_BYTES: usize = 20_000;

// ---------- Anahtar saklama (DPAPI) ----------

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;
    #[repr(C)]
    struct Blob { cb: u32, pb: *mut u8 }
    #[link(name = "crypt32")]
    unsafe extern "system" {
        fn CryptProtectData(input: *const Blob, desc: *const u16, entropy: *const Blob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, out: *mut Blob) -> i32;
        fn CryptUnprotectData(input: *const Blob, desc: *mut *mut u16, entropy: *const Blob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, out: *mut Blob) -> i32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn LocalFree(mem: *mut c_void) -> *mut c_void; }

    fn run(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let input = Blob { cb: data.len() as u32, pb: data.as_ptr() as *mut u8 };
        let mut out = Blob { cb: 0, pb: std::ptr::null_mut() };
        let ok = unsafe {
            if protect { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), 0, &mut out) }
            else { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), 0, &mut out) }
        };
        if ok == 0 || out.pb.is_null() { return Err("Anahtar şifrelenemedi veya çözülemedi (başka bir Windows kullanıcısıyla kaydedilmiş olabilir).".into()); }
        let bytes = unsafe { std::slice::from_raw_parts(out.pb, out.cb as usize).to_vec() };
        unsafe { LocalFree(out.pb as *mut c_void); }
        Ok(bytes)
    }
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> { run(data, true) }
    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> { run(data, false) }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Anahtar saklama yalnızca Windows'ta desteklenir.".into()) }
    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Anahtar saklama yalnızca Windows'ta desteklenir.".into()) }
}

fn ai_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| format!("Uygulama veri klasörü bulunamadı: {e}"))?.join("ai"))
}

/// Anahtar yalnızca harf, rakam, `-` ve `_` içerebilir (komut/ayar dosyasına güvenle yazılabilmesi için); makul uzunlukta olmalı.
pub(crate) fn valid_key(key: &str) -> bool {
    let k = key.trim();
    k.len() >= 20 && k.len() <= 400 && k.starts_with("sk-") && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Ekranda gösterilecek kısa ipucu: `sk-…abcd`.
pub(crate) fn key_hint(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("sk-…{tail}")
}

fn read_key(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join("key.bin");
    if !path.is_file() { return Ok(None); }
    let raw = fs::read(&path).map_err(|e| format!("Anahtar okunamadı: {e}"))?;
    let plain = dpapi::unprotect(&raw)?;
    let key = String::from_utf8(plain).map_err(|_| "Kayıtlı anahtar bozuk.".to_string())?;
    Ok(valid_key(&key).then_some(key))
}

fn write_key(dir: &Path, key: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Ayar klasörü oluşturulamadı: {e}"))?;
    let sealed = dpapi::protect(key.as_bytes())?;
    let temp = dir.join("key.bin.tmp");
    fs::write(&temp, sealed).map_err(|e| format!("Anahtar kaydedilemedi: {e}"))?;
    fs::rename(&temp, dir.join("key.bin")).map_err(|e| format!("Anahtar kaydedilemedi: {e}"))
}

fn read_settings(dir: &Path) -> (bool, String) {
    let value: Value = fs::read_to_string(dir.join("settings.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let consent = value.get("consent").and_then(Value::as_bool).unwrap_or(false);
    let model = value.get("model").and_then(Value::as_str).filter(|m| valid_model(m)).unwrap_or("").to_string();
    (consent, model)
}

fn write_settings(dir: &Path, consent: bool, model: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Ayar klasörü oluşturulamadı: {e}"))?;
    let text = serde_json::to_string_pretty(&json!({ "consent": consent, "model": model })).map_err(|e| e.to_string())?;
    let temp = dir.join("settings.json.tmp");
    fs::write(&temp, text).map_err(|e| format!("Ayarlar kaydedilemedi: {e}"))?;
    fs::rename(&temp, dir.join("settings.json")).map_err(|e| format!("Ayarlar kaydedilemedi: {e}"))
}

pub(crate) fn valid_model(m: &str) -> bool {
    !m.is_empty() && m.len() <= 80 && m.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
}

// ---------- İstek hazırlama ve yanıt okuma (saf, test edilebilir) ----------

/// `messages`: [{role: system|user|assistant, content: metin}] — rol ve boyut doğrulanır. Modeli kullanıcı ayarı belirler.
pub(crate) fn build_chat_body(model: &str, messages: &str, schema: Option<&str>, n: u32) -> Result<String, String> {
    if !valid_model(model) { return Err("Önce Yapay zekâ ayarlarından bir model seç.".into()); }
    let parsed: Value = serde_json::from_str(messages).map_err(|_| "İstek biçimi geçersiz.".to_string())?;
    let list = parsed.as_array().filter(|a| !a.is_empty() && a.len() <= 12).ok_or("İstek biçimi geçersiz.")?;
    let mut total = 0usize;
    let mut clean = Vec::new();
    for m in list {
        let role = m.get("role").and_then(Value::as_str).filter(|r| matches!(*r, "system" | "user" | "assistant")).ok_or("İstek rolü geçersiz.")?;
        let content = m.get("content").and_then(Value::as_str).ok_or("İstek içeriği geçersiz.")?;
        total += content.chars().count();
        clean.push(json!({ "role": role, "content": content }));
    }
    if total == 0 || total > MAX_MESSAGES_CHARS { return Err("İstek çok uzun veya boş.".into()); }
    let mut body = json!({ "model": model, "messages": clean, "n": n.clamp(1, 3), "max_completion_tokens": 4000 });
    if let Some(s) = schema {
        if s.len() > MAX_SCHEMA_BYTES { return Err("Şema çok büyük.".into()); }
        let schema_value: Value = serde_json::from_str(s).map_err(|_| "Şema geçersiz.".to_string())?;
        body["response_format"] = json!({ "type": "json_schema", "json_schema": { "name": "voxcut_design", "strict": true, "schema": schema_value } });
    }
    serde_json::to_string(&body).map_err(|e| e.to_string())
}

fn redact(text: &str, key: &str) -> String { if key.is_empty() { text.to_string() } else { text.replace(key, "***") } }

/// HTTP durumunu ve OpenAI hata metnini sade bir cümleye çevirir (anahtar her zaman gizlenir).
pub(crate) fn describe_failure(code: u16, body: &str, key: &str) -> String {
    let api_message = serde_json::from_str::<Value>(body).ok().and_then(|v| v.pointer("/error/message").and_then(Value::as_str).map(str::to_string)).unwrap_or_default();
    let api_message: String = redact(&api_message, key).chars().take(240).collect();
    match code {
        401 => "Anahtar geçersiz veya iptal edilmiş. OpenAI sitesinden yeni bir anahtar oluşturup Ayarlar'a yapıştır.".into(),
        403 => format!("Bu anahtarın bu işlem için izni yok. {api_message}").trim().to_string(),
        429 => format!("İstek sınırı aşıldı veya hesapta kredi bitti. OpenAI hesabındaki ödeme/kredi durumunu kontrol et. {api_message}").trim().to_string(),
        404 => format!("Seçili model bulunamadı. Ayarlar'dan başka bir model seç. {api_message}").trim().to_string(),
        500..=599 => "OpenAI sunucusu şu an yanıt vermiyor. Biraz sonra tekrar dene.".into(),
        _ => format!("OpenAI isteği reddetti ({code}). {api_message}").trim().to_string(),
    }
}

/// Sohbet yanıtından `n` adede kadar içerik metnini alır.
pub(crate) fn parse_chat(body: &str) -> Result<Vec<String>, String> {
    let v: Value = serde_json::from_str(body).map_err(|_| "Yanıt okunamadı.".to_string())?;
    let texts: Vec<String> = v.get("choices").and_then(Value::as_array).map(|c| c.iter().filter_map(|x| x.pointer("/message/content").and_then(Value::as_str).map(str::to_string)).collect()).unwrap_or_default();
    if texts.is_empty() { return Err("Yapay zekâ boş yanıt verdi. Tekrar dene veya isteği değiştir.".into()); }
    Ok(texts)
}

/// Model listesinden sohbet için uygun görünenleri (gpt…) alır; ses, görsel, arama vb. özel modelleri ayıklar.
pub(crate) fn parse_models(body: &str) -> Result<Vec<String>, String> {
    let v: Value = serde_json::from_str(body).map_err(|_| "Model listesi okunamadı.".to_string())?;
    let mut ids: Vec<String> = v.get("data").and_then(Value::as_array).map(|d| d.iter().filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string)).collect()).unwrap_or_default();
    ids.retain(|id| valid_model(id) && id.starts_with("gpt") && !["audio", "realtime", "image", "transcribe", "tts", "search", "instruct", "embedding", "moderation"].iter().any(|bad| id.contains(bad)));
    ids.sort();
    ids.dedup();
    if ids.is_empty() { return Err("Hesabında kullanılabilir sohbet modeli bulunamadı.".into()); }
    Ok(ids)
}

// ---------- Ağ (curl.exe, ayar dosyası stdin'den; anahtar komut satırında görünmez) ----------

fn curl_config(url: &str, key: &str, body_file: Option<&Path>) -> Result<String, String> {
    if !valid_key(key) { return Err("Anahtar geçersiz.".into()); }
    if url.contains('"') || url.contains('\n') { return Err("Adres geçersiz.".into()); }
    let mut cfg = format!("url = \"{url}\"\nsilent\nshow-error\nmax-time = 120\nwrite-out = \"\\n%{{http_code}}\"\nheader = \"Authorization: Bearer {key}\"\n");
    if url.starts_with("https://") { cfg.push_str("proto = \"=https\"\ntlsv1.2\n"); }
    if let Some(f) = body_file {
        let p = f.to_str().ok_or("Geçici dosya yolu okunamadı.")?.replace('\\', "/");
        if p.contains('"') { return Err("Geçici dosya yolu geçersiz.".into()); }
        cfg.push_str(&format!("request = \"POST\"\nheader = \"Content-Type: application/json\"\ndata-binary = \"@{p}\"\n"));
    }
    Ok(cfg)
}

/// (HTTP kodu, gövde). Gövde varsa geçici bir dosyaya yazılır ve işlem bitince silinir.
fn http(dir: &Path, url: &str, key: &str, body: Option<&str>) -> Result<(u16, String), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Geçici klasör oluşturulamadı: {e}"))?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let body_file = body.map(|_| dir.join(format!("istek-{}-{nonce}.json", std::process::id())));
    if let (Some(text), Some(path)) = (body, &body_file) { fs::write(path, text).map_err(|e| format!("İstek hazırlanamadı: {e}"))?; }
    let result = (|| {
        let config = curl_config(url, key, body_file.as_deref())?;
        let mut child = Command::new("curl.exe").args(["--config", "-"]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
            .spawn().map_err(|e| format!("Bağlantı aracı (curl.exe) başlatılamadı: {e}"))?;
        child.stdin.take().ok_or("Bağlantı aracına yazılamadı.")?.write_all(config.as_bytes()).map_err(|e| format!("Bağlantı aracına yazılamadı: {e}"))?;
        let out = child.wait_with_output().map_err(|e| format!("Bağlantı aracı beklenemedi: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        if !out.status.success() && text.trim().is_empty() {
            let err = redact(&String::from_utf8_lossy(&out.stderr), key);
            return Err(format!("İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene. ({})", err.trim().chars().take(200).collect::<String>()));
        }
        let (body_text, code_text) = text.rsplit_once('\n').ok_or("Yanıt okunamadı.")?;
        let code: u16 = code_text.trim().parse().map_err(|_| "Yanıt kodu okunamadı.".to_string())?;
        if code == 0 {
            let err = redact(&String::from_utf8_lossy(&out.stderr), key);
            return Err(format!("İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene. ({})", err.trim().chars().take(200).collect::<String>()));
        }
        Ok((code, body_text.to_string()))
    })();
    if let Some(path) = &body_file { let _ = fs::remove_file(path); }
    result
}

fn require_ready(dir: &Path) -> Result<(String, String), String> {
    let (consent, model) = read_settings(dir);
    if !consent { return Err("Önce Yapay zekâ ayarlarında \"yazdıklarım OpenAI'ye gönderilir\" onayını ver.".into()); }
    let key = read_key(dir)?.ok_or("Önce Yapay zekâ ayarlarına API anahtarını kaydet.")?;
    Ok((key, model))
}

fn chat_at(base: &str, dir: &Path, key: &str, model: &str, messages: &str, schema: Option<&str>, n: u32) -> Result<Vec<String>, String> {
    let body = build_chat_body(model, messages, schema, n)?;
    let (code, text) = http(&dir.join("tmp"), &format!("{base}/chat/completions"), key, Some(&body))?;
    if code != 200 { return Err(describe_failure(code, &text, key)); }
    parse_chat(&text)
}

fn models_at(base: &str, dir: &Path, key: &str) -> Result<Vec<String>, String> {
    let (code, text) = http(&dir.join("tmp"), &format!("{base}/models"), key, None)?;
    if code != 200 { return Err(describe_failure(code, &text, key)); }
    parse_models(&text)
}

// ---------- Komutlar ----------

#[tauri::command]
pub fn ai_status(app: tauri::AppHandle) -> Result<Value, String> {
    let dir = ai_dir(&app)?;
    let (consent, model) = read_settings(&dir);
    let key = read_key(&dir).unwrap_or(None);
    Ok(json!({ "hasKey": key.is_some(), "hint": key.as_deref().map(key_hint), "consent": consent, "model": model }))
}

/// `key` boşsa mevcut anahtar korunur. Onay verilmeden de kaydedilebilir; ağ yalnızca onay + anahtar varsa kullanılır.
#[tauri::command]
pub fn ai_save(app: tauri::AppHandle, key: Option<String>, consent: bool, model: String) -> Result<(), String> {
    let dir = ai_dir(&app)?;
    if let Some(k) = key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        if !valid_key(k) { return Err("Bu bir OpenAI anahtarına benzemiyor. Anahtar \"sk-\" ile başlar ve boşluk içermez; baştan sona kopyaladığından emin ol.".into()); }
        write_key(&dir, k)?;
    }
    if !model.is_empty() && !valid_model(&model) { return Err("Model adı geçersiz.".into()); }
    write_settings(&dir, consent, &model)
}

#[tauri::command]
pub fn ai_clear(app: tauri::AppHandle) -> Result<(), String> {
    let dir = ai_dir(&app)?;
    let _ = fs::remove_file(dir.join("key.bin"));
    let (_, model) = read_settings(&dir);
    write_settings(&dir, false, &model)
}

/// Bağlantıyı dener ve hesabın kullanabildiği sohbet modellerini listeler.
#[tauri::command]
pub async fn ai_models(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = ai_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || { let (key, _) = require_ready(&dir)?; models_at(API, &dir, &key) }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ai_chat(app: tauri::AppHandle, messages: String, schema: Option<String>, n: u32) -> Result<Vec<String>, String> {
    let dir = ai_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (key, model) = require_ready(&dir)?;
        chat_at(API, &dir, &key, &model, &messages, schema.as_deref(), n)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Read, net::TcpListener, thread};

    const KEY: &str = "sk-proj-TESTKEY1234567890abcdef_xyz";

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("voxcut ai ğş {name} {}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn keys_are_validated_and_hinted_without_leaking() {
        assert!(valid_key(KEY));
        for bad in ["", "sk-", "abc", "sk-kisa", "sk-has space 12345678901234567890", "sk-quote\"12345678901234567890", "sk-new\nline12345678901234567890", "xx-12345678901234567890123456"] { assert!(!valid_key(bad), "{bad:?}"); }
        assert_eq!(key_hint(KEY), "sk-…_xyz");
        assert!(!key_hint(KEY).contains("TESTKEY"));
    }

    #[cfg(windows)]
    #[test]
    fn key_round_trips_encrypted_and_is_not_stored_in_clear() {
        let d = tmp("anahtar");
        assert_eq!(read_key(&d).unwrap(), None);
        write_key(&d, KEY).unwrap();
        let raw = fs::read(d.join("key.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("TESTKEY"), "anahtar düz metin saklanmamalı");
        assert_eq!(read_key(&d).unwrap().as_deref(), Some(KEY));
        write_settings(&d, true, "gpt-test-1").unwrap();
        assert_eq!(read_settings(&d), (true, "gpt-test-1".to_string()));
        assert_eq!(read_settings(&tmp("bos")), (false, String::new()));
    }

    #[test]
    fn chat_body_is_built_from_a_closed_set_of_fields() {
        let msgs = r#"[{"role":"system","content":"s"},{"role":"user","content":"merhaba ğ"}]"#;
        let body: Value = serde_json::from_str(&build_chat_body("gpt-x-1", msgs, Some(r#"{"type":"object"}"#), 7).unwrap()).unwrap();
        assert_eq!(body["model"], "gpt-x-1");
        assert_eq!(body["n"], 3, "n en çok 3");
        assert_eq!(body["response_format"]["json_schema"]["strict"], true);
        assert_eq!(body["messages"][1]["content"], "merhaba ğ");
        assert_eq!(build_chat_body("gpt-x-1", msgs, None, 0).map(|b| serde_json::from_str::<Value>(&b).unwrap()["n"].clone()).unwrap(), 1);
        for bad in ["[]", "{}", "yok", r#"[{"role":"root","content":"x"}]"#, r#"[{"role":"user","content":5}]"#, r#"[{"role":"user","content":""}]"#] { assert!(build_chat_body("gpt-x-1", bad, None, 1).is_err(), "{bad}"); }
        assert!(build_chat_body("model adı;rm", msgs, None, 1).is_err());
        assert!(build_chat_body("", msgs, None, 1).is_err());
        let huge = format!(r#"[{{"role":"user","content":"{}"}}]"#, "a".repeat(MAX_MESSAGES_CHARS + 1));
        assert!(build_chat_body("gpt-x-1", &huge, None, 1).is_err());
    }

    #[test]
    fn failures_are_explained_and_never_contain_the_key() {
        assert!(describe_failure(401, "{}", KEY).contains("Anahtar geçersiz"));
        assert!(describe_failure(429, r#"{"error":{"message":"quota"}}"#, KEY).contains("kredi"));
        assert!(describe_failure(404, "", KEY).contains("model"));
        assert!(describe_failure(503, "", KEY).contains("yanıt vermiyor"));
        let leaked = describe_failure(400, &format!(r#"{{"error":{{"message":"bad key {KEY} here"}}}}"#), KEY);
        assert!(!leaked.contains("TESTKEY") && leaked.contains("***"), "{leaked}");
    }

    #[test]
    fn responses_are_parsed_and_models_filtered() {
        let ok = r#"{"choices":[{"message":{"content":"bir"}},{"message":{"content":"iki"}}]}"#;
        assert_eq!(parse_chat(ok).unwrap(), vec!["bir", "iki"]);
        assert!(parse_chat(r#"{"choices":[]}"#).is_err());
        assert!(parse_chat("<html>").is_err());
        let models = r#"{"data":[{"id":"gpt-b-mini"},{"id":"gpt-a"},{"id":"gpt-realtime-x"},{"id":"gpt-image-1"},{"id":"text-embedding-3"},{"id":"gpt-a"},{"id":"gpt-4o-audio"},{"id":"o1"}]}"#;
        assert_eq!(parse_models(models).unwrap(), vec!["gpt-a", "gpt-b-mini"]);
        assert!(parse_models(r#"{"data":[{"id":"whisper-1"}]}"#).is_err());
    }

    #[test]
    fn curl_config_hides_nothing_dangerous_and_rejects_bad_input() {
        let cfg = curl_config("https://api.openai.com/v1/models", KEY, None).unwrap();
        assert!(cfg.contains("proto = \"=https\"") && cfg.contains("Authorization: Bearer sk-proj"));
        assert!(!cfg.contains("data-binary"));
        assert!(curl_config("https://x\"; evil", KEY, None).is_err());
        assert!(curl_config("https://x", "sk-kisa", None).is_err());
        let with_body = curl_config("https://x/y", KEY, Some(Path::new("C:\\Users\\ğ ş\\a.json"))).unwrap();
        assert!(with_body.contains("data-binary = \"@C:/Users/ğ ş/a.json\""));
    }

    /// Yerel sahte sunucu: istek biçimini (yöntem, yetki başlığı, gövde) ve yanıt okumayı gerçek curl.exe ile uçtan uca doğrular.
    fn serve_once(status: &str, response: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}/v1", listener.local_addr().unwrap().port());
        let status = status.to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 65536];
            let mut got = Vec::new();
            loop {
                let n = stream.read(&mut buf).unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got).to_string();
                if let Some(i) = text.find("\r\n\r\n") {
                    let len = text.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0))).unwrap_or(0);
                    if got.len() >= i + 4 + len { break; }
                }
                if n == 0 { break; }
            }
            let reply = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}", response.len());
            stream.write_all(reply.as_bytes()).unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (base, handle)
    }

    #[test]
    fn chat_works_end_to_end_against_a_local_fake_server() {
        if Command::new("curl.exe").arg("--version").output().is_err() { return; }
        let d = tmp("sunucu");
        let (base, handle) = serve_once("200 OK", r#"{"choices":[{"message":{"content":"{\"ok\":true}"}}]}"#);
        let msgs = r#"[{"role":"user","content":"Türkçe ğüşiöç istek"}]"#;
        let out = chat_at(&base, &d, KEY, "gpt-x-1", msgs, None, 1).unwrap();
        assert_eq!(out, vec![r#"{"ok":true}"#]);
        let seen = handle.join().unwrap();
        assert!(seen.starts_with("POST /v1/chat/completions"), "{seen}");
        assert!(seen.contains(&format!("Bearer {KEY}")), "yetki başlığı gönderilmeli");
        assert!(seen.contains("ğüşiöç"), "gövde UTF-8 gitmeli");
        assert!(fs::read_dir(d.join("tmp")).unwrap().next().is_none(), "geçici istek dosyası silinmeli");
    }

    #[test]
    fn http_errors_from_the_server_become_friendly_messages() {
        if Command::new("curl.exe").arg("--version").output().is_err() { return; }
        let d = tmp("hata");
        let (base, handle) = serve_once("401 Unauthorized", r#"{"error":{"message":"Incorrect API key"}}"#);
        let err = chat_at(&base, &d, KEY, "gpt-x-1", r#"[{"role":"user","content":"x"}]"#, None, 1).unwrap_err();
        handle.join().unwrap();
        assert!(err.contains("Anahtar geçersiz"), "{err}");
        let (base2, h2) = serve_once("200 OK", r#"{"data":[{"id":"gpt-z"},{"id":"whisper-1"}]}"#);
        assert_eq!(models_at(&base2, &d, KEY).unwrap(), vec!["gpt-z"]);
        let seen = h2.join().unwrap();
        assert!(seen.starts_with("GET /v1/models"), "{seen}");
    }

    #[test]
    fn unreachable_server_gives_a_connection_message() {
        if Command::new("curl.exe").arg("--version").output().is_err() { return; }
        let d = tmp("yok");
        let err = chat_at("http://127.0.0.1:9/v1", &d, KEY, "gpt-x-1", r#"[{"role":"user","content":"x"}]"#, None, 1).unwrap_err();
        assert!(err.contains("bağlanılamadı"), "{err}");
    }
}
