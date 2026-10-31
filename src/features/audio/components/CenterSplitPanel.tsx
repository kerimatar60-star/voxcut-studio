import { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { LoaderCircle, Mic2 } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { MEDIA_EXTENSIONS, kindFromPath } from '../../../core/mediaKinds';
import { probeMedia } from '../../../shared/mediaProbe';

const MODES = [
  { id: 'instrumental', label: 'Vokali azalt (karaoke benzeri)', file: 'VoxCut_Vokalsiz', hint: 'Ortadaki içeriği (çoğunlukla vokal; bazen bas ve bas davul da) azaltır.' },
  { id: 'center', label: 'Yalnız orta kanal', file: 'VoxCut_OrtaKanal', hint: 'Ortadaki içeriği öne çıkarır; yalnız bir kanalda duyulan sesler yarıya iner ama yok olmaz.' },
] as const;
const FORMATS = [{ id: 'wav', label: 'WAV', filter: 'WAV ses' }, { id: 'mp3', label: 'MP3', filter: 'MP3 ses' }, { id: 'flac', label: 'FLAC', filter: 'FLAC ses' }] as const;
const SOURCE_EXT = MEDIA_EXTENSIONS.filter(e => ['audio', 'video'].includes(kindFromPath(`x.${e}`)?.kind ?? ''));
const errorText = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return m.length > 500 ? `${m.slice(0, 500)}…` : m; };

/** Klasik orta/yan kanal ayrımı. Yapay zekâ ayrıştırması DEĞİLDİR: vokal ortada olan stereo kayıtlarda işe yarar, aksi hâlde sızıntı/eksiklik olur. */
export function CenterSplitPanel() {
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('instrumental');
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('wav');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const report = (e: unknown) => { setError(true); setMessage(errorText(e)); };
  const current = MODES.find(m => m.id === mode) ?? MODES[0];

  async function pick() {
    setMessage(''); setError(false);
    try {
      const chosen = await open({ multiple: false, directory: false, title: 'Stereo ses veya video dosyasını seç', filters: [{ name: 'Ses ve video', extensions: SOURCE_EXT }] });
      if (typeof chosen !== 'string') return;
      const r = await probeMedia(chosen);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasAudio) throw new Error('Bu dosyada ses akışı yok.');
      setSource(chosen);
    } catch (e) { report(e); }
  }

  async function run() {
    if (!source) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const spec = FORMATS.find(f => f.id === format) ?? FORMATS[0];
      const outputPath = await save({ title: 'Sonucu kaydet', defaultPath: `${current.file}.${spec.id}`, filters: [{ name: spec.filter, extensions: [spec.id] }] });
      if (!outputPath) return;
      setMessage(await invoke<string>('split_center', { inputPath: source, outputPath, mode, format: spec.id }));
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  if (!isTauri()) return null;
  return <section className="vc-trim-panel" aria-label="Orta kanal ayrımı">
    <div className="vc-trim-heading"><Mic2 size={16} /> Vokal azaltma (klasik yöntem)</div>
    <p className="vc-trim-hint">Stereo kayıtta iki kanalda eşit duyulan sesi azaltır veya öne çıkarır. <strong>Yapay zekâ ayrıştırması değildir</strong>: vokal ortada değilse, kayıt mono ise ya da yankı varsa sonuç zayıf olur; sonuç mono kaydedilir.</p>
    <button className="btn btn-dark wide" type="button" disabled={busy} onClick={pick}>{source ? 'Dosyayı değiştir' : 'Dosya seç'}</button>
    <p className="vc-trim-name" title={source}>{source ? baseName(source) : 'Seçilmedi'}</p>
    <label className="field">İşlem<select value={mode} disabled={busy} onChange={e => setMode(e.target.value as typeof mode)}>{MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
    <p className="vc-trim-hint">{current.hint}</p>
    <div className="property-grid">
      <label className="field">Biçim<select value={format} disabled={busy} onChange={e => setFormat(e.target.value as typeof format)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <button className="btn btn-primary" type="button" disabled={busy || !source} onClick={run}>{busy ? <LoaderCircle size={14} className="vc-spin" /> : null} İşle ve kaydet</button>
    </div>
    {message && <p role={error ? 'alert' : 'status'} className={`vc-trim-result ${error ? 'vc-trim-error' : ''}`}>{message}</p>}
  </section>;
}
