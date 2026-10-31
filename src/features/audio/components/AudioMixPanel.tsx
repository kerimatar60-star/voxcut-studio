import { useCallback, useEffect, useState } from 'react';
import { baseName, MAX_MIX_TRACKS, MIX_FORMATS, mixFormatSpec, mixRequest, printChanged, reconcileMix, type MixFormat, type AudioMixState, type MixTrack, type ProbeResult } from '../../../core/audioMixModel';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
const AUDIO_EXT = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus'];

async function probe(path: string): Promise<ProbeResult> {
  try {
    const [duration, hasAudio, hasVideo] = await invoke<[number, boolean, boolean]>('inspect_mix_media', { path });
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, error: 'Medya süresi geçersiz.' };
    return { ok: true, duration, hasAudio, hasVideo };
  } catch (e) { return { ok: false, error: String(e) }; }
}

type Print = { size: number; fingerprint: string };
/** Hızlı parmak izi (boyut + baş/son 1 MiB SHA-256). Başarısızlık projeyi bozmaz: parmak izi yalnız yeniden bağlama yardımıdır. */
async function fingerprintOf(path: string): Promise<Print | null> {
  try { const [size, fingerprint] = await invoke<[number, string]>('file_fingerprint', { path }); return { size, fingerprint }; } catch { return null; }
}

type Props = {
  mix: AudioMixState;
  onChange: (fn: (m: AudioMixState) => AudioMixState) => void;
  /** Her proje açılışında artar; panel medyayı yeniden doğrular. */
  loadToken: number;
};

export function AudioMixPanel({ mix, onChange, loadToken }: Props) {
  const [lastOutput, setLastOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string[]>([]);
  const update = (id: string, patch: Partial<MixTrack>) => onChange(m => ({ ...m, tracks: m.tracks.map(t => t.id === id ? { ...t, ...patch } : t) }));
  const report = (e: unknown) => { setError(true); setMessage(String(e instanceof Error ? e.message : e)); };

  // Proje açıldığında kayıtlı süreye güvenme: gerçek dosyaları yeniden oku.
  const verify = useCallback(async (state: AudioMixState) => {
    if (!state.videoPath && !state.tracks.length) { setIssues({}); setNotes([]); return; }
    setBusy(true);
    try {
      const video = state.videoPath ? await probe(state.videoPath) : null;
      const probes = await Promise.all(state.tracks.map(t => probe(t.path)));
      const result = reconcileMix(state, video, probes);
      onChange(() => result.mix);
      // Kayıtlı parmak izi varsa dosyanın içeriği değişmiş mi bak (yalnız uyarı; engellemez).
      const changed: string[] = [];
      const checks: [string, string, { size?: number; fingerprint?: string }][] = [];
      if (state.videoPath && video?.ok) checks.push(['Video', state.videoPath, { size: state.videoSize, fingerprint: state.videoFingerprint }]);
      state.tracks.forEach((t, i) => { if (probes[i]?.ok) checks.push([`Kanal ${i + 1}`, t.path, t]); });
      for (const [label, path, stored] of checks) {
        if (!stored.fingerprint) continue;
        const actual = await fingerprintOf(path);
        if (actual && printChanged(stored, actual)) changed.push(`${label} (${baseName(path)}): dosyanın içeriği kayıttan sonra değişmiş görünüyor; dosyayı doğru seçtiğinden emin ol.`);
      }
      setIssues(result.issues); setNotes([...result.notes, ...changed]);
      const count = Object.keys(result.issues).length;
      setError(count > 0);
      setMessage(count ? `${count} dosya bulunamadı veya okunamadı. "Yeniden seç" ile tek tek ya da "Klasörde ara" ile toplu olarak yeniden bağla.` : result.notes.length || changed.length ? 'Medya yeniden doğrulandı; bazı değerler veya dosyalar değişmiş görünüyor (notlara bak).' : 'Medya dosyaları yeniden doğrulandı.');
    } finally { setBusy(false); }
  }, [onChange]);

  useEffect(() => {
    if (loadToken > 0 && isTauri()) void verify(mix);
    // Yalnız proje açılışında tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToken]);

  async function choose(kind: 'video' | 'audio'): Promise<string | null> {
    const video = { name: 'Video', extensions: VIDEO_EXT }, audio = { name: 'Ses', extensions: AUDIO_EXT };
    const path = await open({
      multiple: false, directory: false,
      title: kind === 'video' ? 'Miks için video seç' : 'Ses dosyası seç (ses veya video içindeki ses)',
      filters: kind === 'video' ? [video] : [{ name: 'Ses ve video', extensions: [...AUDIO_EXT, ...VIDEO_EXT] }, audio, video],
    });
    return typeof path === 'string' ? path : null;
  }

  async function pickVideo() {
    setBusy(true);
    try {
      const path = await choose('video'); if (!path) return;
      setMessage(''); setError(false);
      const r = await probe(path);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasVideo) throw new Error('Bu dosya video içermiyor.');
      const fp = await fingerprintOf(path);
      onChange(m => ({ ...m, videoPath: path, videoDuration: r.duration, hasOriginal: r.hasAudio, videoSize: fp?.size, videoFingerprint: fp?.fingerprint }));
      setIssues(old => { const c = { ...old }; delete c.video; return c; });
      setLastOutput('');
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  async function addTrack() {
    setBusy(true);
    try {
      const path = await choose('audio'); if (!path) return;
      setMessage(''); setError(false);
      const r = await probe(path);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasAudio) throw new Error('Bu dosya ses içermiyor.');
      const fp = await fingerprintOf(path);
      onChange(m => ({ ...m, tracks: [...m.tracks, { id: crypto.randomUUID(), path, size: fp?.size, fingerprint: fp?.fingerprint, gain: 0.8, pan: 0, start: 0, sourceIn: 0, length: Math.min(r.duration, m.videoDuration || r.duration), sourceDuration: r.duration, fadeIn: 0, fadeOut: 0, mute: false, solo: false }] }));
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  /** Seçilen/bulunan dosyayı kanala bağlar; ayarlar korunur, kesit yeni dosyanın süresine sığdırılır. */
  async function applyRelink(id: string, path: string) {
    const r = await probe(path);
    if (!r.ok) throw new Error(r.error);
    const fp = await fingerprintOf(path);
    if (id === 'video') {
      if (!r.hasVideo) throw new Error('Bu dosya video içermiyor.');
      onChange(m => ({ ...m, videoPath: path, videoDuration: r.duration, hasOriginal: r.hasAudio, videoSize: fp?.size, videoFingerprint: fp?.fingerprint }));
    } else {
      if (!r.hasAudio) throw new Error('Bu dosya ses içermiyor.');
      onChange(m => ({ ...m, tracks: m.tracks.map(t => {
        if (t.id !== id) return t;
        const sourceIn = t.sourceIn >= r.duration ? 0 : t.sourceIn;
        const length = Math.max(0.01, Math.min(t.length, r.duration - sourceIn));
        return { ...t, path, size: fp?.size, fingerprint: fp?.fingerprint, sourceDuration: r.duration, sourceIn, length, fadeIn: t.fadeIn + t.fadeOut > length ? 0 : t.fadeIn, fadeOut: t.fadeIn + t.fadeOut > length ? 0 : t.fadeOut };
      }) }));
    }
    setIssues(old => { const c = { ...old }; delete c[id]; return c; });
  }

  async function relink(id: string) {
    setBusy(true);
    try {
      const path = await choose(id === 'video' ? 'video' : 'audio'); if (!path) return;
      await applyRelink(id, path);
      setError(false); setMessage('Dosya yeniden bağlandı.');
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  /** Kullanıcının seçtiği klasörde, kayıtlı parmak iziyle eşleşen eksik dosyaları toplu arar ve bağlar. */
  async function relinkFromFolder() {
    setBusy(true);
    try {
      const folder = await open({ multiple: false, directory: true, title: 'Eksik dosyaların taşındığı klasörü seç (alt klasörler de aranır)' });
      if (typeof folder !== 'string') return;
      const targets: { id: string; path: string; size?: number; fingerprint?: string }[] = [];
      for (const id of Object.keys(issues)) {
        if (id === 'video') targets.push({ id, path: mix.videoPath, size: mix.videoSize, fingerprint: mix.videoFingerprint });
        else { const t = mix.tracks.find(v => v.id === id); if (t) targets.push({ id, path: t.path, size: t.size, fingerprint: t.fingerprint }); }
      }
      let linked = 0, missing = 0, unknown = 0;
      for (const t of targets) {
        if (!t.fingerprint || !t.size) { unknown++; continue; }
        const found = await invoke<string[]>('find_moved_media', { folder, size: t.size, fingerprint: t.fingerprint, name: baseName(t.path) });
        if (!found.length) { missing++; continue; }
        try { await applyRelink(t.id, found[0]); linked++; } catch { missing++; }
      }
      setError(missing + unknown > 0 && linked === 0);
      setMessage(`${linked} dosya yeniden bağlandı${missing ? `, ${missing} dosya bu klasörde bulunamadı` : ''}${unknown ? `, ${unknown} dosyanın parmak izi kayıtlı değil (eski proje); "Yeniden seç" kullan` : ''}.`);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  async function render() {
    setError(false); setMessage(''); setBusy(true);
    try {
      // Dışa aktarmadan önce dosyaları son kez doğrula (taşınmış olabilirler).
      const video = await probe(mix.videoPath);
      const probes = await Promise.all(mix.tracks.map(t => probe(t.path)));
      const check = reconcileMix(mix, video, probes);
      setIssues(check.issues);
      const bad = Object.values(check.issues);
      if (bad.length) throw new Error(bad.join(' '));
      onChange(() => check.mix);
      const request = mixRequest(check.mix.videoDuration, check.mix.gain, check.mix.mute, check.mix.solo, check.mix.tracks);
      const spec = mixFormatSpec(check.mix.format);
      const outputPath = await save({ title: `${spec.label} olarak kaydet`, defaultPath: `VoxCut_SesMix.${spec.ext}`, filters: [{ name: spec.filter, extensions: [spec.ext] }] });
      if (!outputPath) return;
      const result = await invoke<string>('mix_video_audio', { inputPath: check.mix.videoPath, outputPath, ...request, format: spec.id, ducking: check.mix.ducking ?? 0 });
      setMessage(result); setLastOutput(outputPath);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  if (!isTauri()) return <p className="vc-trim-alert">Çok kanallı miks Tauri masaüstü uygulamasında çalışır.</p>;
  const { tracks } = mix;
  const issueList = Object.entries(issues);
  return <section className="vc-trim-panel vc-mix" aria-label="Çok kanallı ses miks editörü">
    <h3>Ses Miks · Çok kanallı</h3>
    <ol className="vc-steps">
      <li className={mix.videoPath ? 'done' : 'now'}>Video seç</li>
      <li className={!mix.videoPath ? '' : tracks.length ? 'done' : 'now'}>Ses ekle</li>
      <li className={tracks.length ? 'now' : ''}>Ayarla</li>
      <li className={tracks.length && mix.videoPath ? 'now' : ''}>MP4 kaydet</li>
    </ol>
    <p className="vc-trim-hint">Ayarlar <b>projeyle birlikte</b> kaydedilir (üstteki “JSON Kaydet”). Dosyaların kendisi projeye gömülmez; yalnız yolları saklanır. Dosyayı taşırsan açılışta uyarılır ve yeniden seçebilirsin.</p>
    {issueList.length > 0 && <div role="alert" className="vc-warn">
      <strong>⚠ Eksik dosya{issueList.length > 1 ? 'lar' : ''}</strong>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={relinkFromFolder}>Klasörde ara ve toplu yeniden bağla</button>
      <ul>{issueList.map(([id, text]) => <li key={id}>{text} <button type="button" className="btn btn-dark" disabled={busy} onClick={() => relink(id)}>Yeniden seç</button></li>)}</ul>
    </div>}
    {notes.length > 0 && <ul className="vc-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <button type="button" className="btn btn-dark wide" onClick={pickVideo}>{mix.videoPath ? 'Videoyu değiştir' : '1 · Miks için video seç'}</button>
      <p className="vc-trim-name" title={mix.videoPath}>{baseName(mix.videoPath)}</p>
      {mix.videoDuration > 0 && <p className="vc-trim-hint">Video: {mix.videoDuration.toFixed(2)} sn{mix.hasOriginal ? '' : ' · Orijinal ses yok'}</p>}
      <label className="field">Orijinal ses: {Math.round(mix.gain * 100)}%<input aria-label="Orijinal ses seviyesi" type="range" min="0" max="2" step="0.01" value={mix.gain} onChange={e => onChange(m => ({ ...m, gain: Number(e.target.value) }))}/></label>
      <div className="property-grid"><label><input type="checkbox" checked={mix.mute} onChange={e => onChange(m => ({ ...m, mute: e.target.checked }))}/> Sustur</label><label><input type="checkbox" checked={mix.solo} onChange={e => onChange(m => ({ ...m, solo: e.target.checked }))}/> Solo</label></div>
      {tracks.map((t, index) => <fieldset key={t.id} className={issues[t.id] ? 'vc-track-bad' : ''} style={{ margin: '16px 0', border: '1px solid #555', borderRadius: 8, minWidth: 0 }}>
        <legend>Kanal {index + 1} · {t.sourceDuration.toFixed(2)} sn</legend><p className="vc-trim-name" title={t.path}>{baseName(t.path)}</p>
        <label className="field">Seviye: {Math.round(t.gain * 100)}%<input aria-label={`Kanal ${index + 1} seviye`} type="range" min="0" max="2" step="0.01" value={t.gain} onChange={e => update(t.id, { gain: Number(e.target.value) })}/></label>
        <label className="field">Pan: {t.pan === 0 ? 'Orta' : t.pan < 0 ? 'Sol' : 'Sağ'}<input aria-label={`Kanal ${index + 1} pan`} type="range" min="-1" max="1" step="0.05" value={t.pan} onChange={e => update(t.id, { pan: Number(e.target.value) })}/></label>
        <div className="property-grid">{([['start', 'Videoda başlangıç'], ['sourceIn', 'Seste başlangıç'], ['length', 'Kullanılacak süre'], ['fadeIn', 'Fade giriş'], ['fadeOut', 'Fade çıkış']] as const).map(([key, label]) => <label className="field" key={key}>{label} (sn)<input aria-label={`Kanal ${index + 1} ${label}`} type="number" min={key === 'length' ? 0.01 : 0} step="0.1" value={t[key]} onChange={e => update(t.id, { [key]: Number(e.target.value) })}/></label>)}</div>
        <div className="property-grid"><label><input type="checkbox" checked={t.mute} onChange={e => update(t.id, { mute: e.target.checked })}/> Sustur</label><label><input type="checkbox" checked={t.solo} onChange={e => update(t.id, { solo: e.target.checked })}/> Solo</label></div>
        <button type="button" className="btn danger" onClick={() => { onChange(m => ({ ...m, tracks: m.tracks.filter(v => v.id !== t.id) })); setIssues(old => { const c = { ...old }; delete c[t.id]; return c; }); }}>Kanalı kaldır</button>
      </fieldset>)}
      <button type="button" className="btn btn-dark wide" disabled={tracks.length >= MAX_MIX_TRACKS} onClick={addTrack}>2 · Ses kanalı ekle ({tracks.length}/{MAX_MIX_TRACKS})</button>
      <p className="vc-trim-hint">Ses veya video dosyası seçebilirsin (videonun sesi kullanılır). Video bitiminden taşan ses kesilir. Solo etkinse yalnız solo kanallar duyulur; sustur her zaman önceliklidir. Limiter taşmayı sınırlar.</p>
      <div className="property-grid">
        <label className="field">Çıktı biçimi<select aria-label="Çıktı biçimi" value={mix.format ?? 'mp4'} onChange={e => onChange(m => ({ ...m, format: e.target.value === 'mp4' ? undefined : (e.target.value as MixFormat) }))}>{MIX_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label className="field">Otomatik müzik kısma: {mix.ducking ? `%${Math.round(mix.ducking * 100)}` : 'kapalı'}<input aria-label="Otomatik müzik kısma gücü" type="range" min="0" max="1" step="0.05" value={mix.ducking ?? 0} onChange={e => onChange(m => ({ ...m, ducking: Number(e.target.value) > 0 ? Number(e.target.value) : undefined }))} /></label>
      </div>
      <p className="vc-trim-hint">Otomatik kısma: videonun kendi sesi (konuşma) varken ek kanallar (müzik) kısılır. {mix.hasOriginal ? '' : 'Bu videoda orijinal ses yok; kısma uygulanmaz. '}WAV/MP3/FLAC seçilirse yalnız ses dosyası üretilir.</p>
      <button type="button" className="btn btn-primary wide" disabled={!mix.videoPath} onClick={render}>4 · {mixFormatSpec(mix.format).label} kaydet</button>
    </fieldset>
    {busy && <p role="status">İşleniyor… Lütfen bekle.</p>}
    {lastOutput && <p className="vc-trim-hint">Son çıktı: {lastOutput}</p>}
    {message && <p role={error ? 'alert' : 'status'} className={`vc-trim-result ${error ? 'vc-trim-error' : ''}`}>{message}</p>}
  </section>;
}
