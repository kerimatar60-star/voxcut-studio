import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MessageSquarePlus, Music, Pause, Play, Scissors, SkipBack, StepForward } from 'lucide-react';
import { clampTime, layoutVideo, locateVideo, previewClips, previewLength, splitClipAt, splitTrackAt, startTrackAt, trackStateAt } from '../../../core/previewModel';
import { newId } from '../../../core/project';
import type { AudioMixState } from '../../../core/audioMixModel';
import type { TimelineState } from '../../../core/timelineModel';
import type { ProjectDocument, UpdateProject } from '../../../core/types';

type Props = {
  project: ProjectDocument;
  update: UpdateProject;
  changeTimeline: (fn: (t: TimelineState) => TimelineState) => void;
  changeMix: (fn: (m: AudioMixState) => AudioMixState) => void;
};

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Video, müzik ve altyazı katmanlarını birlikte oynatan önizleme: istediğin saniyeye git, orada böl, müziği başlat, altyazı ekle.
 *  Önizleme yaklaşıktır: panorama (pan) ve ducking burada duyulmaz; kesin sonuç dışa aktarılan dosyadadır. */
export function LayeredPreview({ project, update, changeTimeline, changeMix }: Props) {
  const clips = useMemo(() => previewClips(project.timeline, project.audioMix), [project.timeline, project.audioMix]);
  const tracks = useMemo(() => project.audioMix?.tracks ?? [], [project.audioMix]);
  const total = previewLength(clips, tracks);
  const segments = useMemo(() => layoutVideo(clips), [clips]);
  const anySolo = tracks.some(t => t.solo);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const tlRef = useRef<HTMLDivElement>(null);
  const clock = useRef({ last: 0, raf: 0 });
  const tRef = useRef(0);
  tRef.current = t;

  const sync = useCallback((time: number, play: boolean) => {
    const video = videoRef.current;
    const loc = locateVideo(clips, time);
    if (video) {
      if (loc) {
        const src = convertFileSrc(clips[loc.index].path);
        if (video.dataset.src !== src) { video.dataset.src = src; video.src = src; }
        if (Math.abs(video.currentTime - loc.sourceTime) > 0.35 || !play) { try { video.currentTime = loc.sourceTime; } catch { /* henüz hazır değil */ } }
        const mixVideo = !project.timeline?.clips.length && project.audioMix;
        video.volume = mixVideo ? (project.audioMix!.mute ? 0 : Math.min(1, project.audioMix!.gain)) : 1;
        if (play) void video.play().catch(() => undefined); else video.pause();
      } else video.pause();
    }
    for (const track of tracks) {
      const st = trackStateAt(track, time, anySolo);
      let el = audios.current.get(track.id);
      if (!st.active) { el?.pause(); continue; }
      if (!el) { el = new Audio(); el.preload = 'auto'; audios.current.set(track.id, el); }
      const src = convertFileSrc(track.path);
      if (el.dataset.src !== src) { el.dataset.src = src; el.src = src; }
      el.volume = Math.min(1, st.gain);
      if (Math.abs(el.currentTime - st.sourceTime) > 0.35 || !play) { try { el.currentTime = st.sourceTime; } catch { /* henüz hazır değil */ } }
      if (play) void el.play().catch(() => undefined); else el.pause();
    }
  }, [clips, tracks, anySolo, project.timeline, project.audioMix]);

  // Oynatma saati: ekran yenilemesiyle ilerler, sona gelince durur.
  useEffect(() => {
    if (!playing) return;
    clock.current.last = performance.now();
    const tick = (now: number) => {
      const dt = (now - clock.current.last) / 1000;
      clock.current.last = now;
      const next = tRef.current + dt;
      if (next >= total) { setT(total); setPlaying(false); return; }
      setT(next);
      clock.current.raf = requestAnimationFrame(tick);
    };
    clock.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(clock.current.raf);
  }, [playing, total]);

  useEffect(() => { sync(t, playing); }, [t, playing, sync]);
  useEffect(() => { if (!playing) { videoRef.current?.pause(); audios.current.forEach(a => a.pause()); } }, [playing]);
  useEffect(() => () => { audios.current.forEach(a => { a.pause(); a.removeAttribute('src'); }); audios.current.clear(); }, []);

  const seekFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = tlRef.current?.querySelector('.pv-lane-track')?.getBoundingClientRect();
    if (!r || total <= 0) return;
    setT(clampTime(((e.clientX - r.left) / r.width) * total, total));
  };
  const dragging = useRef(false);
  const pct = (s: number) => `${total > 0 ? (s / total) * 100 : 0}%`;
  const say = (text: string) => setMessage(`${text} (${fmt(t)})`);

  const splitVideo = () => {
    const next = splitClipAt(project.timeline?.clips ?? [], t, newId);
    if (!next) { setMessage('Bu saniyede video bölünemez (klibin başına/sonuna çok yakın ya da klip yok).'); return; }
    changeTimeline(tl => ({ ...tl, clips: splitClipAt(tl.clips, t, newId) ?? tl.clips }));
    say('Video bu saniyede ikiye bölündü.');
  };
  const startMusic = () => {
    if (!selected) { setMessage('Önce zaman çizelgesinden bir müzik katmanına tıkla.'); return; }
    changeMix(m => ({ ...m, tracks: m.tracks.map(x => (x.id === selected ? startTrackAt(x, t) : x)) }));
    say('Müzik bu saniyede başlayacak şekilde taşındı.');
  };
  const splitMusic = () => {
    if (!selected) { setMessage('Önce zaman çizelgesinden bir müzik katmanına tıkla.'); return; }
    if (!splitTrackAt(tracks, selected, t, newId)) { setMessage('Seçili müzik bu saniyede kesilemez (katmanın içinde değil ya da kenara çok yakın).'); return; }
    changeMix(m => ({ ...m, tracks: splitTrackAt(m.tracks, selected, t, newId) ?? m.tracks }));
    say('Müzik bu saniyede ikiye bölündü.');
  };
  const addCue = () => {
    const start = Math.round(t * 10) / 10;
    update(p => ({ ...p, subtitles: [...p.subtitles, { id: newId(), start, end: start + 2.5, text: 'Yeni altyazı' }].sort((a, b) => a.start - b.start) }));
    say('Bu saniyede altyazı eklendi (Altyazı sekmesinde metnini değiştirebilirsin).');
  };

  if (clips.length === 0 && tracks.length === 0) return <p className="vc-trim-hint">Önizlenecek bir şey yok. Önce Video sekmesinden klip ekle veya Ses sekmesinden video ve müzik seç.</p>;

  const current = locateVideo(clips, t);
  const playingTracks = tracks.filter(x => trackStateAt(x, t, anySolo).active).map(x => nameOf(x.path));
  const rows: { label: string; kind: 'video' | 'music' | 'sub'; id: string; start: number; len: number; text: string }[] = [
    ...segments.map(s => ({ label: 'Video', kind: 'video' as const, id: s.clip.id, start: s.start, len: s.end - s.start, text: `Klip ${s.index + 1}` })),
    ...tracks.map((x, i) => ({ label: `Müzik ${i + 1}`, kind: 'music' as const, id: x.id, start: x.start, len: x.length, text: nameOf(x.path) })),
    ...project.subtitles.map(c => ({ label: 'Altyazı', kind: 'sub' as const, id: c.id, start: c.start, len: c.end - c.start, text: c.text })),
  ];
  const lane = (label: string, items: typeof rows) => <div className="pv-lane"><span className="pv-lane-label">{label}</span><div className="pv-lane-track">
    {items.map(r => <button key={r.id} type="button" className={`pv-block ${r.kind}${selected === r.id ? ' on' : ''}`} style={{ left: pct(r.start), width: pct(Math.max(r.len, total * 0.01)) }} title={r.text}
      onPointerDown={e => e.stopPropagation()} onClick={() => { if (r.kind === 'music') setSelected(r.id); }}>{r.text}</button>)}</div></div>;

  const cueNow = project.subtitles.find(c => t >= c.start && t < c.end);

  return <div className="pv">
    <div className="pv-top">
      <div className="pv-screen"><video ref={videoRef} playsInline preload="auto" aria-label="Video önizleme" />
        {!current && <div className="pv-empty">{clips.length ? 'Bu saniyede video yok' : 'Video yok; yalnız müzik çalar'}</div>}
        {cueNow && <div className="pv-cue">{cueNow.text}</div>}
        <span className="pv-time">{fmt(t)}</span></div>
      <div className="pv-side">
        <div className="muted-line">Bu saniyede yapabileceklerin</div>
        <button className="btn btn-dark" type="button" disabled={!project.timeline?.clips.length} title={project.timeline?.clips.length ? '' : 'Önce Video sekmesinde klip ekle'} onClick={splitVideo}><Scissors size={15} /> Videoyu burada böl</button>
        <button className="btn btn-dark" type="button" disabled={tracks.length === 0} onClick={startMusic}><Music size={15} /> Müziği buradan başlat</button>
        <button className="btn btn-dark" type="button" disabled={tracks.length === 0} onClick={splitMusic}><StepForward size={15} /> Müziği burada kes</button>
        <button className="btn btn-dark" type="button" onClick={addCue}><MessageSquarePlus size={15} /> Altyazı ekle</button>
        <div className="muted-line" role="status" aria-live="polite">{message}</div>
      </div>
    </div>
    <div className="pv-controls">
      <button className="btn btn-dark" type="button" aria-label="Başa sar" onClick={() => { setPlaying(false); setT(0); }}><SkipBack size={15} /></button>
      <button className="btn btn-primary" type="button" onClick={() => { if (t >= total) setT(0); setPlaying(p => !p); }}>{playing ? <><Pause size={15} /> Duraklat</> : <><Play size={15} /> Oynat</>}</button>
      <span className="pv-readout">{fmt(t)} / {fmt(total)}</span>
      <span className="muted-line" style={{ flex: 1 }}>{current ? `Klip ${current.index + 1}` : 'Video yok'}{playingTracks.length ? ` · çalan müzik: ${playingTracks.join(', ')}` : ''}</span>
    </div>
    <div className="pv-timeline" ref={tlRef} role="slider" aria-label="Önizleme zamanı" aria-valuemin={0} aria-valuemax={Math.round(total * 10) / 10} aria-valuenow={Math.round(t * 10) / 10} tabIndex={0}
      onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }} onPointerMove={e => { if (dragging.current) seekFrom(e); }} onPointerUp={() => { dragging.current = false; }}
      onKeyDown={e => { if (e.key === 'ArrowRight') setT(x => clampTime(x + (e.shiftKey ? 5 : 0.5), total)); else if (e.key === 'ArrowLeft') setT(x => clampTime(x - (e.shiftKey ? 5 : 0.5), total)); else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); } }}>
      {lane('Video', rows.filter(r => r.kind === 'video'))}
      {tracks.map((x, i) => <Fragment key={x.id}>{lane(`Müzik ${i + 1}`, rows.filter(r => r.id === x.id))}</Fragment>)}
      {lane('Altyazı', rows.filter(r => r.kind === 'sub'))}
      <div className="pv-playhead" style={{ left: `calc(72px + (100% - 80px) * ${total > 0 ? t / total : 0})` }} aria-hidden="true" />
    </div>
    <div className="muted-line">Çizelgeye tıkla veya sürükle; ok tuşları 0,5 sn (Shift ile 5 sn) kaydırır, boşluk oynatır. Önizleme yaklaşıktır; kesin sonuç kaydedilen dosyadadır.</div>
  </div>;
}
