import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ArrowDown, ArrowUp, Film, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { baseName, mixRequest, type AudioMixState } from '../../../core/audioMixModel';
import { MEDIA_EXTENSIONS, kindFromPath } from '../../../core/mediaKinds';
import { planBurn } from '../../../core/subtitleBurn';
import {
  adjustsRequest, clampClip, clipsRequest, DEFAULT_ADJUST, FPS_CHOICES, maxTransitionFor, MAX_TIMELINE_CLIPS, MIN_TRANSITION, moveClip, outputDuration, OUTPUT_PRESETS, presetIdForSize,
  reconcileTimeline, setAdjust, setTransition, totalDuration, transitionsRequest, TRANSITIONS, validateTimeline, type TimelineClip, type TimelineState, type TransitionKind,
} from '../../../core/timelineModel';
import type { SubtitleCue } from '../../../core/types';
import { fingerprintOf, probeMedia } from '../../../shared/mediaProbe';

type Props = {
  timeline: TimelineState;
  onChange: (fn: (t: TimelineState) => TimelineState) => void;
  /** Her proje açılışında artar; panel kliplerin dosyalarını yeniden doğrular. */
  loadToken: number;
  /** Projedeki altyazılar (isteğe bağlı olarak çıktıya yakılır) ve Ses sekmesindeki miks (ek kanallar isteğe bağlı uygulanır). */
  cues: SubtitleCue[];
  mix: AudioMixState;
};

const VIDEO_EXT = MEDIA_EXTENSIONS.filter(e => kindFromPath(`x.${e}`)?.kind === 'video');
const formatError = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return m.length > 600 ? `${m.slice(0, 600)}…` : m; };
const seconds = (n: number) => `${n.toFixed(2)} sn`;

/** Video sekmesi: klipleri sırala, kesitlerini ve geçişlerini ayarla, tek MP4 olarak birleştir (CPU / libx264, ilerleme ve iptal ile). */
export function TimelinePanel({ timeline, onChange, loadToken, cues, mix }: Props) {
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string[]>([]);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const report = (e: unknown) => { setError(true); setMessage(formatError(e)); };
  const patchClip = (id: string, fn: (c: TimelineClip) => TimelineClip) => onChange(t => ({ ...t, clips: t.clips.map(c => (c.id === id ? fn(c) : c)) }));

  // Proje açılınca kayıtlı süreye güvenme: gerçek dosyaları yeniden oku.
  const verify = useCallback(async (state: TimelineState) => {
    if (!state.clips.length) { setIssues({}); setNotes([]); return; }
    setBusy(true);
    try {
      const probes = await Promise.all(state.clips.map(c => probeMedia(c.path)));
      const result = reconcileTimeline(state, probes);
      onChange(() => result.timeline);
      setIssues(result.issues); setNotes(result.notes);
      const count = Object.keys(result.issues).length;
      setError(count > 0);
      setMessage(count ? `${count} klip dosyası bulunamadı veya okunamadı. "Yeniden seç" ile dosyayı göster.` : result.notes.length ? 'Klipler yeniden doğrulandı; bazı değerler gerçek dosyaya göre güncellendi.' : 'Klip dosyaları yeniden doğrulandı.');
    } finally { setBusy(false); }
  }, [onChange]);
  useEffect(() => {
    if (loadToken > 0 && isTauri()) void verify(timelineRef.current);
    // Yalnız proje açılışında tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToken]);

  // Birleştirme ilerlemesi (Rust olayı).
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined; let cancelled = false;
    void listen<number>('timeline-progress', e => setProgress(Math.max(0, Math.min(100, Number(e.payload) || 0)))).then(fn => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => { cancelled = true; try { unlisten?.(); } catch { /* sayfa kapanırken olay kaydı zaten yok olmuş olabilir */ } };
  }, []);

  async function addClips() {
    setBusy(true); setMessage(''); setError(false);
    try {
      const chosen = await open({ multiple: true, directory: false, title: 'Video klipleri seç', filters: [{ name: 'Video', extensions: VIDEO_EXT }] });
      const paths = Array.isArray(chosen) ? chosen : typeof chosen === 'string' ? [chosen] : [];
      if (!paths.length) return;
      const room = MAX_TIMELINE_CLIPS - timeline.clips.length;
      if (paths.length > room) throw new Error(`En fazla ${MAX_TIMELINE_CLIPS} klip eklenebilir (${Math.max(0, room)} yer kaldı).`);
      const added: TimelineClip[] = []; const skipped: string[] = [];
      for (const path of paths) {
        const r = await probeMedia(path);
        if (!r.ok || !r.hasVideo) { skipped.push(baseName(path)); continue; }
        const fp = await fingerprintOf(path);
        added.push({ id: crypto.randomUUID(), path, in: 0, out: Math.round(r.duration * 1000) / 1000, sourceDuration: r.duration, size: fp?.size, fingerprint: fp?.fingerprint });
      }
      if (added.length) onChange(t => ({ ...t, clips: [...t.clips, ...added] }));
      setError(added.length === 0);
      setMessage(`${added.length} klip eklendi${skipped.length ? `; atlanan (video değil/okunamadı): ${skipped.join(', ')}` : ''}.`);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  async function relink(id: string) {
    setBusy(true);
    try {
      const path = await open({ multiple: false, directory: false, title: 'Klip için dosyayı seç', filters: [{ name: 'Video', extensions: VIDEO_EXT }] });
      if (typeof path !== 'string') return;
      const r = await probeMedia(path);
      if (!r.ok) throw new Error(r.error);
      if (!r.hasVideo) throw new Error('Bu dosya video içermiyor.');
      const fp = await fingerprintOf(path);
      patchClip(id, c => clampClip({ ...c, path, sourceDuration: r.duration, size: fp?.size, fingerprint: fp?.fingerprint }, {}));
      setIssues(old => { const c = { ...old }; delete c[id]; return c; });
      setError(false); setMessage('Klip yeniden bağlandı.');
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  /** Kullanıcının seçtiği klasörde, parmak iziyle eşleşen eksik klipleri toplu bulur ve bağlar. */
  async function relinkFromFolder() {
    setBusy(true);
    try {
      const folder = await open({ multiple: false, directory: true, title: 'Eksik klip dosyalarının taşındığı klasörü seç (alt klasörler de aranır)' });
      if (typeof folder !== 'string') return;
      let linked = 0, missing = 0, unknown = 0;
      for (const c of timeline.clips.filter(x => issues[x.id])) {
        if (!c.fingerprint || !c.size) { unknown++; continue; }
        const found = await invoke<string[]>('find_moved_media', { folder, size: c.size, fingerprint: c.fingerprint, name: baseName(c.path) });
        if (!found[0]) { missing++; continue; }
        const r = await probeMedia(found[0]);
        if (!r.ok || !r.hasVideo) { missing++; continue; }
        patchClip(c.id, x => clampClip({ ...x, path: found[0], sourceDuration: r.duration }, {}));
        setIssues(old => { const n = { ...old }; delete n[c.id]; return n; });
        linked++;
      }
      setError(linked === 0 && missing + unknown > 0);
      setMessage(`${linked} klip yeniden bağlandı${missing ? `, ${missing} klip bu klasörde bulunamadı` : ''}${unknown ? `, ${unknown} kaydın parmak izi yok ("Yeniden seç" kullan)` : ''}.`);
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  async function render() {
    setError(false); setMessage(''); setProgress(0);
    const invalid = validateTimeline(timeline);
    if (invalid) { setError(true); setMessage(invalid); return; }
    setBusy(true);
    try {
      // Dışa aktarmadan önce dosyaları son kez doğrula (taşınmış/değişmiş olabilirler).
      const check = reconcileTimeline(timeline, await Promise.all(timeline.clips.map(c => probeMedia(c.path))));
      setIssues(check.issues);
      const bad = Object.values(check.issues);
      if (bad.length) throw new Error(bad.join(' '));
      onChange(() => check.timeline);
      const t = check.timeline;
      const invalidAfter = validateTimeline(t);
      if (invalidAfter) throw new Error(invalidAfter);
      const duration = outputDuration(t.clips);
      // İsteğe bağlı: altyazı yakma ve Ses sekmesindeki ek kanallar. Geçersizse işe başlamadan açık hata verilir.
      let subtitles: unknown;
      if (t.burnSubtitles) {
        const plan = planBurn(cues, duration);
        if (!plan.used) throw new Error('Altyazı yakma açık ama çıktı süresi içinde geçerli altyazı yok (Altyazı sekmesini kontrol et).');
        subtitles = [plan.srt, 5.5, 'bottom', 'white', 'Arial', false, 1.5, false];
      }
      let mixSpec: unknown;
      if (t.applyMix) {
        if (!mix.tracks.length) throw new Error('Ses miksi açık ama Ses sekmesinde ek kanal yok.');
        const req = mixRequest(duration, mix.gain, mix.mute, mix.solo, mix.tracks);
        mixSpec = [req.originalGain, req.tracks, mix.ducking ?? 0];
      }
      const outputPath = await save({ title: 'Birleştirilmiş videoyu MP4 olarak kaydet', defaultPath: 'VoxCut_Birlestirme.mp4', filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
      if (!outputPath) return;
      setRendering(true);
      const result = await invoke<string>('render_timeline', { clips: clipsRequest(t), outputPath, width: t.width, height: t.height, fps: t.fps, transitions: transitionsRequest(t), adjusts: adjustsRequest(t), subtitles, mix: mixSpec });
      setMessage(result); setProgress(100);
    } catch (e) { report(e); } finally { setRendering(false); setBusy(false); }
  }

  if (!isTauri()) return <p className="vc-trim-alert">Çok klipli birleştirme Tauri masaüstü uygulamasında çalışır.</p>;
  const issueIds = Object.keys(issues);
  const locked = busy || rendering;
  const total = totalDuration(timeline.clips);
  const output = outputDuration(timeline.clips);
  const setOption = (key: 'burnSubtitles' | 'applyMix', on: boolean) => onChange(t => { const { [key]: _drop, ...rest } = t; return on ? { ...rest, [key]: true } : rest; });
  return <section className="vc-trim-panel vc-timeline" aria-label="Video zaman çizelgesi ve birleştirme">
    <div className="vc-trim-heading"><Film size={16} /> Çok klipli birleştirme</div>
    <p className="vc-trim-hint">Klipleri ekle, sırala, her birinin kullanılacak aralığını ve aralarındaki geçişi ayarla, tek MP4 olarak kaydet. Farklı çözünürlük/kare hızı/sessiz klipler otomatik uyumlanır. Ayarlar projeyle kaydedilir; dosyalar projeye gömülmez.</p>
    {issueIds.length > 0 && <div role="alert" className="vc-warn"><strong>⚠ Eksik klip dosyası</strong>
      <button type="button" className="btn btn-primary" disabled={locked} onClick={relinkFromFolder}>Klasörde ara ve toplu bağla</button>
      <ul>{issueIds.map(id => <li key={id}>{issues[id]} <button type="button" className="btn btn-dark" disabled={locked} onClick={() => relink(id)}>Yeniden seç</button></li>)}</ul></div>}
    {notes.length > 0 && <ul className="vc-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    <button className="btn btn-dark wide" type="button" disabled={locked || timeline.clips.length >= MAX_TIMELINE_CLIPS} onClick={addClips}><Plus size={15} /> Klip ekle ({timeline.clips.length}/{MAX_TIMELINE_CLIPS})</button>
    <ol className="vc-clip-list">
      {timeline.clips.map((c, i) => {
        const last = i === timeline.clips.length - 1;
        const limit = maxTransitionFor(timeline.clips, i);
        const adjust = c.adjust ?? DEFAULT_ADJUST;
        return <li key={c.id} className={`vc-clip ${issues[c.id] ? 'vc-track-bad' : ''}`}>
          <div className="vc-clip-head"><strong>{i + 1}.</strong><span title={c.path}>{baseName(c.path)}</span>
            <span className="vc-clip-actions">
              <button type="button" className="btn btn-dark" disabled={locked || i === 0} aria-label={`Klip ${i + 1} yukarı taşı`} onClick={() => onChange(t => ({ ...t, clips: moveClip(t.clips, c.id, -1) }))}><ArrowUp size={13} /></button>
              <button type="button" className="btn btn-dark" disabled={locked || last} aria-label={`Klip ${i + 1} aşağı taşı`} onClick={() => onChange(t => ({ ...t, clips: moveClip(t.clips, c.id, 1) }))}><ArrowDown size={13} /></button>
              <button type="button" className="btn danger" disabled={locked} aria-label={`Klip ${i + 1} kaldır`} onClick={() => { onChange(t => ({ ...t, clips: t.clips.filter(x => x.id !== c.id) })); setIssues(old => { const n = { ...old }; delete n[c.id]; return n; }); }}><Trash2 size={13} /></button>
            </span></div>
          <div className="property-grid">
            <label className="field">Başlangıç (sn)<input type="number" min={0} step="0.1" value={c.in} disabled={locked} aria-label={`Klip ${i + 1} başlangıç`} onChange={e => patchClip(c.id, x => clampClip(x, { in: Number(e.target.value) }))} /></label>
            <label className="field">Bitiş (sn)<input type="number" min={0.1} step="0.1" value={c.out} disabled={locked} aria-label={`Klip ${i + 1} bitiş`} onChange={e => patchClip(c.id, x => clampClip(x, { out: Number(e.target.value) }))} /></label>
          </div>
          <p className="vc-trim-hint">Kullanılan: {seconds(c.out - c.in)}{c.sourceDuration > 0 ? ` · kaynak ${seconds(c.sourceDuration)}` : ''}</p>
          <details className="vc-adjust">
            <summary>Renk ayarı{c.adjust ? ' •' : ''}</summary>
            <label className="field">Parlaklık: {adjust.brightness.toFixed(2)}<input type="range" min={-1} max={1} step={0.05} value={adjust.brightness} disabled={locked} aria-label={`Klip ${i + 1} parlaklık`} onChange={e => onChange(t => ({ ...t, clips: setAdjust(t.clips, c.id, { brightness: Number(e.target.value) }) }))} /></label>
            <label className="field">Kontrast: {adjust.contrast.toFixed(2)}<input type="range" min={0} max={2} step={0.05} value={adjust.contrast} disabled={locked} aria-label={`Klip ${i + 1} kontrast`} onChange={e => onChange(t => ({ ...t, clips: setAdjust(t.clips, c.id, { contrast: Number(e.target.value) }) }))} /></label>
            <label className="field">Doygunluk: {adjust.saturation.toFixed(2)}<input type="range" min={0} max={3} step={0.05} value={adjust.saturation} disabled={locked} aria-label={`Klip ${i + 1} doygunluk`} onChange={e => onChange(t => ({ ...t, clips: setAdjust(t.clips, c.id, { saturation: Number(e.target.value) }) }))} /></label>
            <button type="button" className="btn btn-dark" disabled={locked || !c.adjust} onClick={() => onChange(t => ({ ...t, clips: setAdjust(t.clips, c.id, { ...DEFAULT_ADJUST }) }))}>Sıfırla</button>
          </details>
          {!last && <div className="vc-transition">
            <label className="field">Sonraki klibe geçiş
              <select value={c.transition?.kind ?? 'cut'} disabled={locked || limit < MIN_TRANSITION} aria-label={`Klip ${i + 1} sonrası geçiş`} onChange={e => onChange(t => ({ ...t, clips: setTransition(t.clips, c.id, e.target.value as TransitionKind) }))}>
                {TRANSITIONS.map(tr => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
              </select></label>
            {c.transition && <label className="field">Geçiş süresi (sn)<input type="number" min={MIN_TRANSITION} max={limit} step="0.1" value={c.transition.duration} disabled={locked} aria-label={`Klip ${i + 1} geçiş süresi`} onChange={e => onChange(t => ({ ...t, clips: setTransition(t.clips, c.id, c.transition!.kind, Number(e.target.value)) }))} /></label>}
            {limit < MIN_TRANSITION && <p className="vc-trim-hint">Komşu klipler geçiş için çok kısa.</p>}
          </div>}
        </li>;
      })}
    </ol>
    {timeline.clips.length === 0 && <p className="vc-trim-hint">Henüz klip yok. "Klip ekle" ile videoları seç; sırayla birleştirilir.</p>}
    <div className="property-grid">
      <label className="field">Çıktı boyutu<select value={presetIdForSize(timeline.width, timeline.height)} disabled={locked} onChange={e => { const p = OUTPUT_PRESETS.find(x => x.id === e.target.value); if (p) onChange(t => ({ ...t, width: p.width, height: p.height })); }}>{OUTPUT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="custom" disabled>Özel ({timeline.width}×{timeline.height})</option></select></label>
      <label className="field">Kare hızı<select value={timeline.fps} disabled={locked} onChange={e => onChange(t => ({ ...t, fps: Number(e.target.value) }))}>{FPS_CHOICES.map(f => <option key={f} value={f}>{f} fps</option>)}</select></label>
    </div>
    <label className="checkbox-row"><input type="checkbox" checked={!!timeline.burnSubtitles} disabled={locked} onChange={e => setOption('burnSubtitles', e.target.checked)} /> Projedeki altyazıları çıktıya yak ({cues.length} altyazı)</label>
    <label className="checkbox-row"><input type="checkbox" checked={!!timeline.applyMix} disabled={locked} onChange={e => setOption('applyMix', e.target.checked)} /> Ses sekmesindeki ek kanalları uygula ({mix.tracks.length} kanal)</label>
    <p className="vc-trim-hint">Toplam klip süresi: {seconds(total)} · Çıktı süresi: {seconds(output)}{total - output > 0.001 ? ' (geçişler kliplerin üst üste binmesidir)' : ''} · {timeline.width}×{timeline.height} @ {timeline.fps} fps · CPU / libx264 (CRF 21) + AAC. Oran farkı olan klipler siyah bantla ortalanır.</p>
    {rendering && <div role="progressbar" aria-label="Birleştirme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="vc-progress"><div className="vc-progress-bar" style={{ width: `${progress}%` }} /><span>%{Math.round(progress)}</span></div>}
    <div className="property-grid">
      <button className="btn btn-primary" type="button" disabled={locked || timeline.clips.length === 0} onClick={render}>{rendering ? <LoaderCircle size={15} className="vc-spin" /> : <Film size={15} />}{rendering ? 'Birleştiriliyor…' : 'Birleştir ve MP4 kaydet'}</button>
      {rendering && <button className="btn danger" type="button" onClick={() => { void invoke('cancel_timeline_render'); }}><X size={15} /> İptal</button>}
    </div>
    {message && <p role={error ? 'alert' : 'status'} className={`vc-trim-result ${error ? 'vc-trim-error' : ''}`}>{message}</p>}
  </section>;
}
