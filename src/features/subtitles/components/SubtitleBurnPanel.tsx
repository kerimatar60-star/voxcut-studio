import { useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { FileVideo, Flame, LoaderCircle } from 'lucide-react';
import { baseName } from '../../../core/audioMixModel';
import { DEFAULT_FONT, FONT_FAMILIES } from '../../../core/designText';
import { BURN_COLORS, BURN_OUTLINES, BURN_POSITIONS, BURN_SIZES, planBurn, type BurnColor, type BurnPosition } from '../../../core/subtitleBurn';
import type { SubtitleCue } from '../../../core/types';

type Probe = [number, boolean, boolean];
const formatError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 450 ? `${message.slice(0, 450)}…` : message;
};

/** Altyazı sekmesindeki cue'ları seçilen yerel videoya yakar ve yeni bir MP4 olarak kaydeder (CPU / libx264). */
export function SubtitleBurnPanel({ cues }: { cues: SubtitleCue[] }) {
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState(0);
  const [size, setSize] = useState<(typeof BURN_SIZES)[number]['id']>('medium');
  const [position, setPosition] = useState<BurnPosition>('bottom');
  const [color, setColor] = useState<BurnColor>('white');
  const [font, setFont] = useState<string>(DEFAULT_FONT);
  const [bold, setBold] = useState(false);
  const [outline, setOutline] = useState<(typeof BURN_OUTLINES)[number]['id']>('thin');
  const [boxed, setBoxed] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const plan = useMemo(() => planBurn(cues, duration), [cues, duration]);
  const percent = BURN_SIZES.find(s => s.id === size)?.percent ?? 5.5;

  const fail = (text: string) => { setIsError(true); setMessage(text); };

  async function pickVideo() {
    setMessage(''); setIsError(false);
    try {
      const path = await open({ title: 'Altyazı yakılacak videoyu seç', directory: false, multiple: false, filters: [{ name: 'Video dosyaları', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] });
      if (typeof path !== 'string') return;
      const [length, , hasVideo] = await invoke<Probe>('inspect_mix_media', { path });
      if (!hasVideo) { fail('Seçilen dosya video içermiyor.'); return; }
      setSource(path); setDuration(length);
    } catch (error) {
      fail(`Video okunamadı: ${formatError(error)}`);
    }
  }

  async function burn() {
    if (!source) return;
    setMessage(''); setIsError(false);
    try {
      // Son doğrulama: dosya taşınmış/değişmiş olabilir; kırpma gerçek süreye göre yapılır.
      const [length, , hasVideo] = await invoke<Probe>('inspect_mix_media', { path: source });
      if (!hasVideo) { fail('Kaynak artık video içermiyor.'); return; }
      setDuration(length);
      const final = planBurn(cues, length);
      if (!final.used) { fail('Videonun süresi içinde yakılacak geçerli altyazı yok.'); return; }
      const outputPath = await save({ title: 'Altyazılı videoyu MP4 olarak kaydet', defaultPath: 'VoxCut_Altyazili.mp4', filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
      if (!outputPath) return;
      setWorking(true);
      const result = await invoke<string>('burn_subtitles', { inputPath: source, outputPath, srt: final.srt, sizePercent: percent, position, color, font, bold, outline: BURN_OUTLINES.find(o => o.id === outline)?.value ?? 1.5, boxed });
      setMessage(result);
    } catch (error) {
      fail(`Altyazı yakılamadı: ${formatError(error)}`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="vc-trim-panel">
      <div className="vc-trim-heading"><Flame size={16} /> Altyazıyı videoya yaz</div>
      <p className="vc-trim-hint">Soldaki altyazıları seçtiğin videonun üzerine kalıcı olarak yakar ve yeni bir MP4 kaydeder. Orijinal dosya değişmez.</p>
      {!isTauri() ? (
        <p className="vc-trim-alert">Bu işlev Chrome yerine Tauri masaüstü penceresinde çalışır.</p>
      ) : (
        <>
          <button className="btn btn-dark wide" type="button" disabled={working} onClick={pickVideo}><FileVideo size={15} /> Video seç</button>
          <p className="vc-trim-name" title={source}>{source ? `${baseName(source)} · ${duration.toFixed(2)} sn` : 'Seçilmedi'}</p>
          <div className="field"><label>Yazı boyutu</label>
            <select value={size} disabled={working} onChange={e => setSize(e.target.value as typeof size)}>{BURN_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div className="property-grid">
            <div className="field"><label>Konum</label>
              <select value={position} disabled={working} onChange={e => setPosition(e.target.value as BurnPosition)}>{BURN_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Renk</label>
              <select value={color} disabled={working} onChange={e => setColor(e.target.value as BurnColor)}>{BURN_COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          </div>
          <div className="property-grid">
            <label className="field">Yazı tipi<select value={font} disabled={working} onChange={e => setFont(e.target.value)}>{FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}</select></label>
            <label className="field">Kontur<select value={outline} disabled={working || boxed} onChange={e => setOutline(e.target.value as typeof outline)}>{BURN_OUTLINES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <div className="property-grid">
            <label className="checkbox-row"><input type="checkbox" checked={bold} disabled={working} onChange={e => setBold(e.target.checked)} /> Kalın</label>
            <label className="checkbox-row"><input type="checkbox" checked={boxed} disabled={working} onChange={e => setBoxed(e.target.checked)} /> Arka plan kutusu</label>
          </div>
          <p className="vc-trim-hint">
            {source ? `${plan.used} altyazı yakılacak.` : `${plan.used} geçerli altyazı var.`}
            {plan.clipped > 0 && ` ${plan.clipped} tanesi video sonunda kırpılacak.`}
            {plan.dropped > 0 && ` ${plan.dropped} tanesi video süresi dışında, yakılmayacak.`}
            {plan.invalid > 0 && ` ${plan.invalid} tanesi geçersiz (boş metin veya ters zaman), atlanacak.`}
          </p>
          <button className="btn btn-primary wide" type="button" disabled={!source || working || plan.used === 0} onClick={burn}>
            {working ? <LoaderCircle size={15} className="vc-spin" /> : <Flame size={15} />}
            {working ? 'FFmpeg işliyor…' : 'Yaz ve MP4 kaydet'}
          </button>
          {message && <p role="status" className={`vc-trim-result ${isError ? 'vc-trim-error' : ''}`}>{message}</p>}
          <p className="vc-trim-hint">Video yeniden kodlanır (CPU / libx264, CRF 21); ses AAC 192k olur. Uzun videolarda süre alabilir, iptal henüz yok. Yazı tipleri Windows'ta hazır gelen sistem yazı tipleridir; bulunamazsa FFmpeg yedek bir yazı tipi kullanır.</p>
        </>
      )}
    </div>
  );
}
