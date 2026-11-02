import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, LoaderCircle, Music2, X } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { formatBytes } from '../../../core/asr';
import { friendlyError } from '../../../core/stems';
import { MEDIA_EXTENSIONS, kindFromPath } from '../../../core/mediaKinds';
import { probeMedia } from '../../../shared/mediaProbe';

type Phase = 'engine' | 'model' | 'separate';
type Status = { engineInstalled: boolean; engineSize: number; modelInstalled: boolean; modelSize: number; maxMinutes: number };
const OUTPUTS = [
  { id: 'vokal', label: 'Vokal (yalnız ses)' },
  { id: 'eslik', label: 'Eşlik (vokalsiz müzik)' },
  { id: 'davul', label: 'Davul' },
  { id: 'bas', label: 'Bas' },
  { id: 'diger', label: 'Diğer (gitar, klavye…)' },
] as const;
const FORMATS = [{ id: 'wav', label: 'WAV (16 bit)' }, { id: 'flac', label: 'FLAC (kayıpsız)' }, { id: 'mp3', label: 'MP3 (192 kbps)' }] as const;
const SOURCE_EXT = MEDIA_EXTENSIONS.filter(e => ['audio', 'video'].includes(kindFromPath(`x.${e}`)?.kind ?? ''));

/** Yapay zekâ ile kaynak ayrıştırma (vokal / davul / bas / diğer): Demucs (htdemucs) modeli ONNX Runtime ile bu bilgisayarda çalışır. */
export function StemPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(0);
  const [outDir, setOutDir] = useState('');
  const [picked, setPicked] = useState<string[]>(['vokal', 'eslik']);
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('wav');
  const [phase, setPhase] = useState<Phase | null>(null);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [resultFolder, setResultFolder] = useState('');

  const refresh = useCallback(async () => {
    try { const s = await invoke<Status>('stems_status'); setStatus(s); return s; }
    catch (e) { setIsError(true); setMessage(`Durum okunamadı: ${friendlyError(e instanceof Error ? e.message : String(e))}`); return null; }
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
  const blocker = !ready ? 'Önce kurulumu tamamla.' : !source ? 'Önce bir dosya seç.' : tooLong ? `Bu sürümde en çok ${status?.maxMinutes} dakikalık kayıtlar ayrıştırılır.` : picked.length === 0 ? 'En az bir çıktı seç.' : null;
  const totalSize = status && !status.engineInstalled ? status.engineSize : 0;

  async function run<T>(next: Phase, label: string, work: () => Promise<T>): Promise<T | undefined> {
    setPhase(next); setStep(label); setProgress(0); setMessage(''); setIsError(false);
    try { return await work(); }
    catch (e) { setIsError(true); setMessage(friendlyError(e instanceof Error ? e.message : String(e))); return undefined; }
    finally { setPhase(null); }
  }

  /** Normalde her şey kurulum paketiyle gelir; yalnız eksikse motoru resmî kaynaktan indirir. Model eksikse yeniden kurmayı önerir. */
  async function installAll() {
    setResultFolder('');
    if (status && !status.engineInstalled) {
      const ok = await run('engine', 'Motor indiriliyor', () => invoke<string>('stems_install_engine'));
      const s = await refresh();
      if (!ok || !s?.engineInstalled) return;
    }
    const s = await refresh();
    if (s && !s.modelInstalled) { setIsError(true); setMessage('Model dosyası bu kurulumda eksik. En kolay çözüm: VoxCut Studio kurulum dosyasını yeniden çalıştırmak. (Model dosyan bir klasördeyse "Gelişmiş" bölümünden seçebilirsin.)'); return; }
    setMessage('Hazır. Şimdi bir dosya seçebilirsin.'); setIsError(false);
  }
  async function importModel() {
    try {
      const dir = await open({ multiple: false, directory: true, title: 'htdemucs.onnx ve htdemucs.onnx.data dosyalarının bulunduğu klasörü seç' });
      if (typeof dir !== 'string') return;
      const t = await run('model', 'Model klasörden alınıyor', () => invoke<string>('stems_import_model', { from: dir }));
      await refresh();
      if (t) setMessage(t);
    } catch (e) { setIsError(true); setMessage(friendlyError(e instanceof Error ? e.message : String(e))); }
  }
  async function pickSource() {
    setMessage(''); setIsError(false); setResultFolder('');
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Ayrıştırılacak ses veya video dosyasını seç', filters: [{ name: 'Ses ve video', extensions: SOURCE_EXT }] });
      if (typeof chosen !== 'string') return;
      const r = await probeMedia(chosen);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasAudio) throw new Error('Bu dosyada ses akışı yok.');
      setSource(chosen); setDuration(r.duration);
    } catch (e) { setIsError(true); setMessage(friendlyError(e instanceof Error ? e.message : String(e))); }
  }
  async function pickFolder() {
    try { const chosen = await open({ multiple: false, directory: true, title: 'Çıktıların kaydedileceği klasörü seç' }); if (typeof chosen === 'string') setOutDir(chosen); }
    catch (e) { setIsError(true); setMessage(friendlyError(e instanceof Error ? e.message : String(e))); }
  }
  async function separate() {
    setResultFolder('');
    const r = await run('separate', 'Ayrıştırılıyor', () => invoke<{ message: string; folder: string }>('stems_separate', { inputPath: source, outDir, outputs: picked, format }));
    if (r) { setMessage(r.message); setResultFolder(r.folder); }
  }
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  if (!isTauri()) return <p className="vc-trim-alert">Şarkıyı parçalara ayırma yalnızca kurulu VoxCut Studio uygulamasında çalışır.</p>;
  return <section className="vc-trim-panel" aria-label="Yapay zekâ ile ses ayrıştırma">
    <div className="vc-trim-heading"><Music2 size={16} /> Yapay zekâ ile ayrıştırma</div>
    <p className="vc-trim-hint">Bir şarkıyı veya kaydı vokal, davul, bas ve diğer seslere ayırır. Her şey bu bilgisayarda çalışır; ses internete gönderilmez. Sonuç kusursuz değildir: sesler arasında hafif sızıntı olabilir. Kaynak dosya değişmez; çıktılar yeni dosyalardır.</p>

    {!ready && <div className="vc-trim-panel">
      <p className="vc-trim-hint"><strong>Yapay zekâ dosyaları bu kurulumda eksik görünüyor.</strong> En kolay çözüm, VoxCut Studio kurulum dosyasını yeniden çalıştırmaktır. Motor eksikse aşağıdaki düğme onu resmî kaynaktan indirir{status ? ` (≈ ${formatBytes(totalSize)})` : ''}; model dosyası indirilemez, kurulumla gelir.</p>
      <button className="btn btn-primary wide" type="button" disabled={busy || !status} onClick={installAll}>{busy ? <LoaderCircle size={15} className="vc-spin" /> : <Download size={15} />} Eksikleri tamamla</button>
      <details>
        <summary className="vc-trim-hint">Gelişmiş: model dosyası bende var</summary>
        <p className="vc-trim-hint">Model dosyalarını (<code>htdemucs.onnx</code> ve <code>htdemucs.onnx.data</code>) bir klasöre koyduysan buradan alabilirsin. Önce motor kurulmuş olmalı.</p>
        <button className="btn btn-dark wide" type="button" disabled={busy || !status} onClick={importModel}><FolderOpen size={15} /> Model klasörünü seç…</button>
      </details>
    </div>}

    {ready && <>
      <button className="btn btn-dark wide" type="button" disabled={busy} onClick={pickSource}>{source ? 'Dosyayı değiştir' : '1 · Ses veya video dosyası seç'}</button>
      <p className="vc-trim-name" title={source}>{source ? `${baseName(source)} · ${(duration / 60).toFixed(1)} dk` : 'Seçilmedi'}</p>
      <fieldset className="property-grid" disabled={busy} aria-label="Kaydedilecek çıktılar">
        {OUTPUTS.map(o => <label key={o.id} className="checkbox-row"><input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} /> {o.label}</label>)}
      </fieldset>
      <label className="field">Çıktı biçimi<select value={format} disabled={busy} onChange={e => setFormat(e.target.value as typeof format)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <p className="vc-trim-hint">Kaydedilecek yer: {outDir ? <code>{outDir}</code> : 'dosyanın yanında “… (ayrıştırılmış)” adlı yeni bir klasör'}. <button type="button" className="btn btn-dark" disabled={busy} onClick={pickFolder}><FolderOpen size={14} /> Başka klasör seç</button>{outDir && <> <button type="button" className="btn btn-dark" disabled={busy} onClick={() => setOutDir('')}>Otomatik yap</button></>}</p>
    </>}

    {busy && phase && <div role="progressbar" aria-label={step} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <progress max={100} value={progress} style={{ width: '100%' }} />
      <p className="vc-trim-hint">{step}… %{progress}</p>
    </div>}
    {ready && <div className="property-grid">
      <button className="btn btn-primary wide" type="button" disabled={busy || blocker !== null} title={blocker ?? undefined} onClick={separate}>{phase === 'separate' ? <LoaderCircle size={15} className="vc-spin" /> : <Music2 size={15} />} 2 · Ayrıştır</button>
      <button className="btn btn-dark wide" type="button" disabled={!busy} onClick={() => void invoke('stems_cancel')}><X size={15} />İptal</button>
    </div>}
    {!busy && ready && blocker && <p className="vc-trim-hint">{blocker}</p>}
    {message && <p role={isError ? 'alert' : 'status'} className={`vc-trim-result ${isError ? 'vc-trim-error' : ''}`}>{message}</p>}
    {resultFolder && !busy && <button className="btn btn-primary wide" type="button" onClick={() => void invoke('stems_open_folder', { path: resultFolder })}><FolderOpen size={15} /> Klasörü aç</button>}
    <p className="vc-trim-hint">İşlem bilgisayarın işlemcisinde yapılır ve ses süresinden uzun sürebilir; pencereyi kapatmadan bekle. En çok {status?.maxMinutes ?? 8} dakikalık kayıtlar ayrıştırılır.</p>
  </section>;
}
