import { useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { AudioLines, LoaderCircle } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { MEDIA_EXTENSIONS, kindFromPath } from '../../../core/mediaKinds';
import { probeMedia } from '../../../shared/mediaProbe';

type Which = 'raw' | 'clean';
const FORMATS = [{ id: 'wav', label: 'WAV (16 bit)', filter: 'WAV ses' }, { id: 'mp3', label: 'MP3 (192 kbps)', filter: 'MP3 ses' }, { id: 'flac', label: 'FLAC (kayıpsız)', filter: 'FLAC ses' }] as const;
const SAMPLE_SECONDS = 10;
const SOURCE_EXT = MEDIA_EXTENSIONS.filter(e => ['audio', 'video'].includes(kindFromPath(`x.${e}`)?.kind ?? ''));
const errorText = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return m.length > 500 ? `${m.slice(0, 500)}…` : m; };

type Engine = 'classic' | 'rnnoise';
type AiModel = { id: string; label: string; size: number; installed: boolean };

/** Ses temizleme: klasik (FFT, model yok) veya yapay zekâ (RNNoise sinir ağı; küçük model yalnız onayla iner). A/B örnek dinleme ve kayıt. */
export function DenoisePanel() {
  const [engine, setEngine] = useState<Engine>('classic');
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [aiModel, setAiModel] = useState('konusma');
  const [installing, setInstalling] = useState(false);
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(0);
  const [strength, setStrength] = useState(0.6);
  const [highpass, setHighpass] = useState(true);
  const [normalize, setNormalize] = useState(false);
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('wav');
  const [sampleStart, setSampleStart] = useState(0);
  const [previews, setPreviews] = useState<Record<Which, string> | null>(null);
  const [which, setWhich] = useState<Which>('clean');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const report = (e: unknown) => { setError(true); setMessage(errorText(e)); };
  const current = aiModels.find(m => m.id === aiModel);
  const aiReady = engine === 'classic' || !!current?.installed;
  const params = { engine, model: aiModel };

  async function refreshAi() {
    try { const s = await invoke<{ models: AiModel[] }>('denoise_ai_status'); setAiModels(s.models); } catch { /* durum okunamazsa model yok sayılır */ }
  }
  useEffect(() => { if (isTauri()) void refreshAi(); }, []);

  /** Yalnız kullanıcı bu düğmeye bastığında, sabit resmî adresten indirir (boyut + SHA-256 doğrulanır). */
  async function installModel() {
    setInstalling(true); setMessage(''); setError(false);
    try { setMessage(await invoke<string>('denoise_ai_install', { model: aiModel })); await refreshAi(); }
    catch (e) { report(e); } finally { setInstalling(false); }
  }

  async function pick() {
    setMessage(''); setError(false);
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Temizlenecek ses veya video dosyasını seç', filters: [{ name: 'Ses ve video', extensions: SOURCE_EXT }] });
      if (typeof chosen !== 'string') return;
      const r = await probeMedia(chosen);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasAudio) throw new Error('Bu dosyada ses akışı yok.');
      setSource(chosen); setDuration(r.duration); setSampleStart(0); setPreviews(null);
    } catch (e) { report(e); }
  }

  /** Aynı aralığın ham ve temizlenmiş kısa örneğini üretir; A/B karşılaştırma bunlarla yapılır. */
  async function makeSample() {
    if (!source) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const dir = await invoke<string>('denoise_preview_dir');
      const stamp = Date.now();
      const join = (name: string) => `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${name}`;
      const start = Math.max(0, Math.min(sampleStart, Math.max(0, duration - 1)));
      const rawPath = join(`onizleme-${stamp}-ham.wav`), cleanPath = join(`onizleme-${stamp}-temiz.wav`);
      await invoke('denoise_audio', { inputPath: source, outputPath: rawPath, strength: 0, highpass: false, normalize: false, start, duration: SAMPLE_SECONDS, format: 'wav', ...params });
      await invoke('denoise_audio', { inputPath: source, outputPath: cleanPath, strength, highpass, normalize, start, duration: SAMPLE_SECONDS, format: 'wav', ...params });
      await invoke('authorize_media', { path: rawPath }); await invoke('authorize_media', { path: cleanPath });
      setPreviews({ raw: convertFileSrc(rawPath), clean: convertFileSrc(cleanPath) }); setWhich('clean');
      setMessage(`${SAMPLE_SECONDS} sn örnek hazır. "Orijinal" ve "Temizlenmiş" düğmeleriyle aynı yerden karşılaştır.`);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  function toggle(next: Which) {
    const a = audioRef.current;
    resume.current = a ? { time: a.currentTime, playing: !a.paused } : null;
    setWhich(next);
  }

  async function saveFull() {
    if (!source) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const spec = FORMATS.find(f => f.id === format) ?? FORMATS[0];
      const outputPath = await save({ title: 'Temizlenmiş sesi kaydet', defaultPath: `VoxCut_Temiz.${spec.id}`, filters: [{ name: spec.filter, extensions: [spec.id] }] });
      if (!outputPath) return;
      const result = await invoke<string>('denoise_audio', { inputPath: source, outputPath, strength, highpass, normalize, start: 0, duration: 0, format: spec.id, ...params });
      setMessage(result);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  if (!isTauri()) return <p className="vc-trim-alert">Ses temizleme Tauri masaüstü uygulamasında çalışır.</p>;
  return <section className="vc-trim-panel vc-denoise" aria-label="Ses temizleme">
    <div className="vc-trim-heading"><AudioLines size={16} /> Ses temizleme</div>
    <p className="vc-trim-hint">Fan, uğultu ve oda gürültüsünü azaltır. Çok gürültülü kayıtlarda mucize beklenmemeli; önce kısa örneği dinle.</p>
    <div className="property-grid" role="group" aria-label="Temizleme yöntemi">
      <button type="button" className={`btn btn-dark ${engine === 'classic' ? 'active' : ''}`} aria-pressed={engine === 'classic'} disabled={busy || installing} onClick={() => { setEngine('classic'); setPreviews(null); }}>Klasik (model yok)</button>
      <button type="button" className={`btn btn-dark ${engine === 'rnnoise' ? 'active' : ''}`} aria-pressed={engine === 'rnnoise'} disabled={busy || installing} onClick={() => { setEngine('rnnoise'); setPreviews(null); }}>Yapay zekâ</button>
    </div>
    {engine === 'rnnoise' && <div className="vc-trim-hint">
      <label className="field">Model<select aria-label="Yapay zekâ modeli" value={aiModel} disabled={busy || installing} onChange={e => { setAiModel(e.target.value); setPreviews(null); }}>{aiModels.map(m => <option key={m.id} value={m.id}>{m.label}{m.installed ? ' · kurulu' : ''}</option>)}</select></label>
      {current && !current.installed
        ? <>
          <p>Bu yöntem küçük bir yapay zekâ modeli (RNNoise, ≈ {(current.size / 1_000_000).toFixed(1)} MB) kullanır. Pakette gelmez; aşağıdaki düğmeye bastığında GitHub'dan (GregorR/rnnoise-models, telif hakkı yok) indirilir ve SHA-256 ile doğrulanır. Ses dosyaların internete gönderilmez.</p>
          <button className="btn btn-primary wide" type="button" disabled={installing || busy} onClick={installModel}>{installing ? <LoaderCircle size={14} className="vc-spin" /> : null} Modeli indir (≈ {(current.size / 1_000_000).toFixed(1)} MB)</button>
        </>
        : <p>Model kurulu; temizleme bu bilgisayarda çalışır, ağ kullanılmaz. Konuşma için sinir ağı, klasik yönteme göre sabit olmayan gürültülerde de etkilidir.</p>}
    </div>}
    <button className="btn btn-dark wide" type="button" disabled={busy} onClick={pick}>{source ? 'Dosyayı değiştir' : '1 · Dosya seç'}</button>
    <p className="vc-trim-name" title={source}>{source ? `${baseName(source)} · ${duration.toFixed(1)} sn` : 'Seçilmedi'}</p>
    <label className="field">Temizleme gücü: %{Math.round(strength * 100)}<input aria-label="Temizleme gücü" type="range" min="0" max="1" step="0.05" value={strength} disabled={busy} onChange={e => setStrength(Number(e.target.value))} /></label>
    <div className="property-grid">
      <label className="checkbox-row"><input type="checkbox" checked={highpass} disabled={busy} onChange={e => setHighpass(e.target.checked)} /> Uğultu süzgeci (80 Hz)</label>
      <label className="checkbox-row"><input type="checkbox" checked={normalize} disabled={busy} onChange={e => setNormalize(e.target.checked)} /> Ses seviyesini dengele</label>
    </div>
    <div className="property-grid">
      <label className="field">Örnek başlangıcı (sn)<input type="number" min={0} max={Math.max(0, duration - 1)} step="1" value={sampleStart} disabled={busy || !source} onChange={e => setSampleStart(Math.max(0, Number(e.target.value) || 0))} /></label>
      <button className="btn btn-dark" type="button" disabled={busy || !source || !aiReady} onClick={makeSample}>{busy ? <LoaderCircle size={14} className="vc-spin" /> : null} {SAMPLE_SECONDS} sn örnek hazırla</button>
    </div>
    {previews && <div className="vc-ab">
      <div className="property-grid">
        <button type="button" className={`btn btn-dark ${which === 'raw' ? 'active' : ''}`} aria-pressed={which === 'raw'} onClick={() => toggle('raw')}>Orijinal</button>
        <button type="button" className={`btn btn-dark ${which === 'clean' ? 'active' : ''}`} aria-pressed={which === 'clean'} onClick={() => toggle('clean')}>Temizlenmiş</button>
      </div>
      <audio ref={audioRef} key={which} src={previews[which]} controls preload="auto" onLoadedMetadata={e => {
        const r = resume.current; resume.current = null;
        if (r) { e.currentTarget.currentTime = Math.min(r.time, e.currentTarget.duration || r.time); if (r.playing) void e.currentTarget.play(); }
      }} />
    </div>}
    <div className="property-grid">
      <label className="field">Çıktı biçimi<select value={format} disabled={busy} onChange={e => setFormat(e.target.value as typeof format)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <button className="btn btn-primary" type="button" disabled={busy || !source || !aiReady} onClick={saveFull}>2 · Temizlenmiş sesi kaydet</button>
    </div>
    {message && <p role={error ? 'alert' : 'status'} className={`vc-trim-result ${error ? 'vc-trim-error' : ''}`}>{message}</p>}
    <p className="vc-trim-hint">Kaynak dosya değişmez; çıktı yeni bir dosyadır. Tüm dosya işlenirken iptal henüz yok (uzun kayıtlarda süre alır).</p>
  </section>;
}
