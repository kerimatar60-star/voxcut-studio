import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FileAudio, LoaderCircle, Mic, X } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { ASR_LANGUAGES, defaultModel, formatBytes, parseAsrStatus, transcribeBlocker, type AsrLanguage, type AsrStatus } from '../../../core/asr';

const formatError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 450 ? `${message.slice(0, 450)}…` : message;
};

type Phase = 'engine' | 'model' | 'transcribe';
const PHASE_TEXT: Record<Phase, string> = { engine: 'Motor indiriliyor', model: 'Model indiriliyor', transcribe: 'Konuşma yazıya çevriliyor' };

/** Yerel Whisper ile otomatik altyazı. Motor ve model yalnız kullanıcı "İndir"e basınca iner; ses dışarı gönderilmez. */
export function AutoSubtitlePanel({ onResult }: { onResult: (srt: string) => void }) {
  const [status, setStatus] = useState<AsrStatus | null>(null);
  const [model, setModel] = useState('small');
  const [language, setLanguage] = useState<AsrLanguage>('tr');
  const [source, setSource] = useState('');
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = parseAsrStatus(await invoke('asr_status'));
      setStatus(next);
      return next;
    } catch (error) { setIsError(true); setMessage(`Durum okunamadı: ${formatError(error)}`); return null; }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined; let cancelled = false;
    void refresh().then(next => { if (!cancelled) setModel(defaultModel(next)); });
    void listen<{ pct: number }>('asr-progress', e => setProgress(Math.max(0, Math.min(100, Number(e.payload?.pct) || 0)))).then(fn => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => { cancelled = true; try { unlisten?.(); } catch { /* sayfa kapanırken olay kaydı zaten yok olmuş olabilir */ } };
  }, [refresh]);

  const busy = phase !== null;
  const current = status?.models.find(m => m.id === model);
  const blocker = transcribeBlocker(status, model, Boolean(source));

  async function run<T>(next: Phase, work: () => Promise<T>): Promise<T | undefined> {
    setPhase(next); setProgress(0); setMessage(''); setIsError(false);
    try { return await work(); }
    catch (error) { setIsError(true); setMessage(formatError(error)); return undefined; }
    finally { setPhase(null); await refresh(); }
  }

  async function installEngine() {
    const text = await run('engine', () => invoke<string>('asr_install_engine'));
    if (text) setMessage(text);
  }
  async function installModel() {
    const text = await run('model', () => invoke<string>('asr_install_model', { model }));
    if (text) setMessage(text);
  }
  async function pickSource() {
    setMessage(''); setIsError(false);
    try {
      const path = await open({ title: 'Yazıya çevrilecek ses veya videoyu seç', directory: false, multiple: false, filters: [{ name: 'Ses ve video', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] });
      if (typeof path === 'string') setSource(path);
    } catch (error) { setIsError(true); setMessage(`Dosya seçilemedi: ${formatError(error)}`); }
  }
  async function transcribe() {
    const srt = await run('transcribe', () => invoke<string>('asr_transcribe', { inputPath: source, model, language }));
    if (srt) { onResult(srt); setMessage('Altyazı oluşturuldu ve projeye eklendi. Metni mutlaka dinleyerek gözden geçirin.'); }
  }

  return (
    <div className="vc-trim-panel">
      <div className="vc-trim-heading"><Mic size={16} /> Otomatik altyazı (Whisper)</div>
      <p className="vc-trim-hint">Konuşmayı bu bilgisayarda yazıya çevirir; ses internete gönderilmez. İlk kullanımda resmî whisper.cpp motoru ve bir model <strong>sen onaylayınca</strong> indirilir (SHA-256 doğrulanır). Sonuç hatasız değildir; özel isim ve gürültülü kayıtlarda düzeltme gerekir.</p>
      {!isTauri() ? (
        <p className="vc-trim-alert">Bu işlev Chrome yerine Tauri masaüstü penceresinde çalışır.</p>
      ) : (
        <>
          <div className="field"><label>Whisper motoru</label>
            {status?.engineInstalled
              ? <p className="vc-trim-name">Kurulu (CPU)</p>
              : <button className="btn btn-dark wide" type="button" disabled={busy || !status} onClick={installEngine}><Download size={15} /> Motoru indir ({formatBytes(status?.engineSize ?? 0)})</button>}
          </div>
          <div className="property-grid">
            <label className="field">Model<select value={model} disabled={busy} onChange={e => setModel(e.target.value)}>{(status?.models ?? []).map(m => <option key={m.id} value={m.id}>{m.label}{m.installed ? ' · kurulu' : ` · ${formatBytes(m.size)}`}</option>)}</select></label>
            <label className="field">Dil<select value={language} disabled={busy} onChange={e => setLanguage(e.target.value as AsrLanguage)}>{ASR_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
          </div>
          {current && !current.installed && (
            <button className="btn btn-dark wide" type="button" disabled={busy} onClick={installModel}><Download size={15} /> Modeli indir ({formatBytes(current.size)})</button>
          )}
          <button className="btn btn-dark wide" type="button" disabled={busy} onClick={pickSource}><FileAudio size={15} /> Ses / video seç</button>
          <p className="vc-trim-name" title={source}>{source ? baseName(source) : 'Seçilmedi'}</p>
          {busy && (
            <div role="progressbar" aria-label={PHASE_TEXT[phase]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <progress max={100} value={progress} style={{ width: '100%' }} />
              <p className="vc-trim-hint">{PHASE_TEXT[phase]}… %{progress}</p>
            </div>
          )}
          <div className="property-grid">
            <button className="btn btn-primary wide" type="button" disabled={busy || blocker !== null} title={blocker ?? undefined} onClick={transcribe}>
              {phase === 'transcribe' ? <LoaderCircle size={15} className="vc-spin" /> : <Mic size={15} />}Yazıya çevir
            </button>
            <button className="btn btn-dark wide" type="button" disabled={!busy} onClick={() => void invoke('asr_cancel')}><X size={15} />İptal</button>
          </div>
          {!busy && blocker && source !== '' && <p className="vc-trim-hint">{blocker}</p>}
          {message && <p role="status" className={`vc-trim-result ${isError ? 'vc-trim-error' : ''}`}>{message}</p>}
          <p className="vc-trim-hint">Hız (i7 CPU): small modeli kabaca gerçek zamanlı hızda çalışır; medium daha yavaştır. Türkçe için small önerilir. GPU (CUDA) sürümü henüz kullanılmıyor.</p>
        </>
      )}
    </div>
  );
}
