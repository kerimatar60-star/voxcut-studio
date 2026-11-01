import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, LoaderCircle, Music2, X } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { formatBytes } from '../../../core/asr';
import { MEDIA_EXTENSIONS, kindFromPath } from '../../../core/mediaKinds';
import { probeMedia } from '../../../shared/mediaProbe';

type Phase = 'engine' | 'model' | 'separate';
type Status = { engineInstalled: boolean; engineSize: number; modelInstalled: boolean; modelSize: number; maxMinutes: number };
const PHASE_TEXT: Record<Phase, string> = { engine: 'ONNX Runtime indiriliyor', model: 'Model hazırlanıyor', separate: 'Ayrıştırılıyor' };
const OUTPUTS = [
  { id: 'vokal', label: 'Vokal (yalnız ses)' },
  { id: 'eslik', label: 'Eşlik (vokalsiz müzik)' },
  { id: 'davul', label: 'Davul' },
  { id: 'bas', label: 'Bas' },
  { id: 'diger', label: 'Diğer (gitar, klavye…)' },
] as const;
const FORMATS = [{ id: 'wav', label: 'WAV (16 bit)' }, { id: 'flac', label: 'FLAC (kayıpsız)' }, { id: 'mp3', label: 'MP3 (192 kbps)' }] as const;
const SOURCE_EXT = MEDIA_EXTENSIONS.filter(e => ['audio', 'video'].includes(kindFromPath(`x.${e}`)?.kind ?? ''));
const errorText = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return m.length > 500 ? `${m.slice(0, 500)}…` : m; };

/** Yapay zekâ ile kaynak ayrıştırma (vokal / davul / bas / diğer): Demucs (htdemucs) modeli ONNX Runtime ile bu bilgisayarda çalışır. */
export function StemPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(0);
  const [outDir, setOutDir] = useState('');
  const [picked, setPicked] = useState<string[]>(['vokal', 'eslik']);
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('wav');
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    try { setStatus(await invoke<Status>('stems_status')); } catch (e) { setIsError(true); setMessage(`Durum okunamadı: ${errorText(e)}`); }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined; let cancelled = false;
    void refresh();
    void listen<{ pct: number }>('stems-progress', e => setProgress(Math.max(0, Math.min(100, Number(e.payload?.pct) || 0)))).then(fn => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => { cancelled = true; try { unlisten?.(); } catch { /* sayfa kapanırken olay kaydı zaten yok olmuş olabilir */ } };
  }, [refresh]);

  const busy = phase !== null;
  const ready = !!status?.engineInstalled && !!status?.modelInstalled;
  const tooLong = status ? duration / 60 > status.maxMinutes : false;
  const blocker = !ready ? 'Önce motoru ve modeli kur.' : !source ? 'Önce bir dosya seç.' : tooLong ? `Bu sürümde en çok ${status?.maxMinutes} dakikalık kayıtlar ayrıştırılır.` : !outDir ? 'Çıktı klasörünü seç.' : picked.length === 0 ? 'En az bir çıktı seç.' : null;

  async function run<T>(next: Phase, work: () => Promise<T>): Promise<T | undefined> {
    setPhase(next); setProgress(0); setMessage(''); setIsError(false);
    try { return await work(); }
    catch (e) { setIsError(true); setMessage(errorText(e)); return undefined; }
    finally { setPhase(null); await refresh(); }
  }

  async function pickSource() {
    setMessage(''); setIsError(false);
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Ayrıştırılacak ses veya video dosyasını seç', filters: [{ name: 'Ses ve video', extensions: SOURCE_EXT }] });
      if (typeof chosen !== 'string') return;
      const r = await probeMedia(chosen);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasAudio) throw new Error('Bu dosyada ses akışı yok.');
      setSource(chosen); setDuration(r.duration);
    } catch (e) { setIsError(true); setMessage(errorText(e)); }
  }
  async function pickFolder(title: string, set: (p: string) => void) {
    try { const chosen = await open({ multiple: false, directory: true, title }); if (typeof chosen === 'string') set(chosen); }
    catch (e) { setIsError(true); setMessage(errorText(e)); }
  }
  async function installEngine() { const t = await run('engine', () => invoke<string>('stems_install_engine')); if (t) setMessage(t); }
  async function installModel() { const t = await run('model', () => invoke<string>('stems_install_model')); if (t) setMessage(t); }
  async function importModel() {
    let dir: string | null = null;
    await pickFolder('htdemucs.onnx ve htdemucs.onnx.data dosyalarının bulunduğu klasörü seç', p => { dir = p; });
    if (!dir) return;
    const t = await run('model', () => invoke<string>('stems_import_model', { from: dir }));
    if (t) setMessage(t);
  }
  async function separate() {
    const t = await run('separate', () => invoke<string>('stems_separate', { inputPath: source, outDir, outputs: picked, format }));
    if (t) setMessage(t);
  }
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  if (!isTauri()) return <p className="vc-trim-alert">Ses ayrıştırma Tauri masaüstü uygulamasında çalışır.</p>;
  return <section className="vc-trim-panel" aria-label="Yapay zekâ ile ses ayrıştırma">
    <div className="vc-trim-heading"><Music2 size={16} /> Yapay zekâ ile ayrıştırma</div>
    <p className="vc-trim-hint">Bir şarkıyı veya kaydı vokal, davul, bas ve diğer seslere ayırır (Demucs modeli, bu bilgisayarda çalışır; ses internete gönderilmez). İlk kullanımda motor ve model <strong>sen onaylayınca</strong> kurulur. Sonuç kusursuz değildir: stemler arasında sızıntı ve yapaylık olabilir. Kaynak dosya değişmez; çıktılar yeni dosyalardır.</p>
    <div className="field"><label>ONNX Runtime motoru (Microsoft, MIT)</label>
      {status?.engineInstalled
        ? <p className="vc-trim-name">Kurulu</p>
        : <button className="btn btn-dark wide" type="button" disabled={busy || !status} onClick={installEngine}><Download size={15} /> Motoru indir ({formatBytes(status?.engineSize ?? 0)}, SHA-256 doğrulanır)</button>}
    </div>
    <div className="field"><label>Ayrıştırma modeli (htdemucs, MIT)</label>
      {status?.modelInstalled
        ? <p className="vc-trim-name">Kurulu</p>
        : <div className="property-grid">
          <button className="btn btn-dark" type="button" disabled={busy || !status} onClick={installModel}><Download size={15} /> Modeli indir ({formatBytes(status?.modelSize ?? 0)})</button>
          <button className="btn btn-dark" type="button" disabled={busy || !status} onClick={importModel}><FolderOpen size={15} /> Yerel klasörden al…</button>
        </div>}
    </div>
    <button className="btn btn-dark wide" type="button" disabled={busy} onClick={pickSource}>{source ? 'Dosyayı değiştir' : '1 · Dosya seç'}</button>
    <p className="vc-trim-name" title={source}>{source ? `${baseName(source)} · ${(duration / 60).toFixed(1)} dk` : 'Seçilmedi'}</p>
    <button className="btn btn-dark wide" type="button" disabled={busy} onClick={() => pickFolder('Çıktıların kaydedileceği klasörü seç', setOutDir)}><FolderOpen size={15} /> 2 · Çıktı klasörü seç</button>
    <p className="vc-trim-name" title={outDir}>{outDir || 'Seçilmedi'}</p>
    <fieldset className="property-grid" disabled={busy} aria-label="Kaydedilecek çıktılar">
      {OUTPUTS.map(o => <label key={o.id} className="checkbox-row"><input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} /> {o.label}</label>)}
    </fieldset>
    <label className="field">Çıktı biçimi<select value={format} disabled={busy} onChange={e => setFormat(e.target.value as typeof format)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    {busy && phase && <div role="progressbar" aria-label={PHASE_TEXT[phase]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <progress max={100} value={progress} style={{ width: '100%' }} />
      <p className="vc-trim-hint">{PHASE_TEXT[phase]}… %{progress}</p>
    </div>}
    <div className="property-grid">
      <button className="btn btn-primary wide" type="button" disabled={busy || blocker !== null} title={blocker ?? undefined} onClick={separate}>{phase === 'separate' ? <LoaderCircle size={15} className="vc-spin" /> : <Music2 size={15} />} 3 · Ayrıştır</button>
      <button className="btn btn-dark wide" type="button" disabled={!busy} onClick={() => void invoke('stems_cancel')}><X size={15} />İptal</button>
    </div>
    {!busy && blocker && <p className="vc-trim-hint">{blocker}</p>}
    {message && <p role={isError ? 'alert' : 'status'} className={`vc-trim-result ${isError ? 'vc-trim-error' : ''}`}>{message}</p>}
    <p className="vc-trim-hint">Süre: işlem CPU'da yapılır ve ses süresinden uzun sürer; bilgisayara göre değişir. En çok {status?.maxMinutes ?? 8} dakikalık kayıtlar (bellek sınırı). Hazır olduğunda çıktı klasöründe <code>ad_vokal.wav</code> gibi dosyalar oluşur.</p>
  </section>;
}
