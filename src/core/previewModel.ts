import type { TimelineClip, TimelineState } from './timelineModel';
import { clipLength, outputDuration } from './timelineModel';
import type { AudioMixState, MixTrack } from './audioMixModel';

/** Önizleme için kurgu hesapları. Saf fonksiyonlar: arayüz ve oynatıcıdan bağımsız, birim testli. */

export const MIN_PART = 0.1; // bölünen her parçanın en az süresi (sn)

export type VideoSegment = { index: number; clip: TimelineClip; start: number; end: number };

/** Her klibin zaman çizelgesindeki başlangıç/bitişi. Geçiş, bir sonraki klibi öncekinin üstüne bindirir. */
export function layoutVideo(clips: TimelineClip[]): VideoSegment[] {
  const out: VideoSegment[] = [];
  let cursor = 0;
  clips.forEach((clip, index) => {
    const start = cursor;
    const end = start + clipLength(clip);
    out.push({ index, clip, start, end });
    cursor = end - (clip.transition?.duration ?? 0);
  });
  return out;
}

/** t anında hangi klip gösterilir ve kaynak dosyada kaçıncı saniyedir. Geçiş bindirmesinde gelen klip öne geçer. */
export function locateVideo(clips: TimelineClip[], t: number): { index: number; sourceTime: number } | null {
  const segs = layoutVideo(clips);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (t >= s.start && t < s.end) return { index: s.index, sourceTime: s.clip.in + (t - s.start) };
  }
  return null;
}

/** Müzik katmanının t anındaki durumu: etkinse kaynak saniyesi ve fade'li kazanç. */
export function trackStateAt(track: MixTrack, t: number, anySolo: boolean): { active: boolean; sourceTime: number; gain: number } {
  const local = t - track.start;
  const silent = track.mute || (anySolo && !track.solo);
  if (local < 0 || local >= track.length || silent) return { active: false, sourceTime: 0, gain: 0 };
  const fadeIn = track.fadeIn > 0 ? Math.min(1, local / track.fadeIn) : 1;
  const left = track.length - local;
  const fadeOut = track.fadeOut > 0 ? Math.min(1, left / track.fadeOut) : 1;
  return { active: true, sourceTime: track.sourceIn + local, gain: Math.max(0, Math.min(2, track.gain * fadeIn * fadeOut)) };
}

/** Önizlemede gösterilecek video klipleri: zaman çizelgesi doluysa o, yoksa miksteki video tek klip olarak. */
export function previewClips(timeline: TimelineState | undefined, mix: AudioMixState | undefined): TimelineClip[] {
  if (timeline && timeline.clips.length > 0) return timeline.clips;
  if (mix && mix.videoPath && mix.videoDuration > 0) return [{ id: 'mix-video', path: mix.videoPath, in: 0, out: mix.videoDuration, sourceDuration: mix.videoDuration }];
  return [];
}

/** Toplam önizleme süresi: video bitişi ile en geç biten müzik katmanının büyüğü. */
export function previewLength(clips: TimelineClip[], tracks: MixTrack[]): number {
  const video = clips.length ? outputDuration(clips) : 0;
  const audio = tracks.reduce((m, t) => Math.max(m, t.start + t.length), 0);
  return Math.max(video, audio);
}

/** Klibi t anında ikiye böler. Parçalardan biri MIN_PART'tan kısa kalacaksa null döner. Geçiş ikinci parçaya geçer. */
export function splitClipAt(clips: TimelineClip[], t: number, newId: () => string): TimelineClip[] | null {
  const loc = locateVideo(clips, t);
  if (!loc) return null;
  const clip = clips[loc.index];
  const cut = loc.sourceTime;
  if (cut - clip.in < MIN_PART || clip.out - cut < MIN_PART) return null;
  const first: TimelineClip = { ...clip, out: cut, transition: undefined };
  const second: TimelineClip = { ...clip, id: newId(), in: cut };
  const next = [...clips];
  next.splice(loc.index, 1, first, second);
  return next;
}

/** Müzik katmanını t saniyesinde başlatır (negatif olamaz). */
export function startTrackAt(track: MixTrack, t: number): MixTrack {
  return { ...track, start: Math.max(0, Math.round(t * 100) / 100) };
}

/** Müzik katmanını t anında keser: sol parça kısalır, sağ parça yeni katman olarak devam eder. */
export function splitTrackAt(tracks: MixTrack[], id: string, t: number, newId: () => string): MixTrack[] | null {
  const i = tracks.findIndex(x => x.id === id);
  if (i < 0) return null;
  const tr = tracks[i];
  const local = t - tr.start;
  if (local < MIN_PART || tr.length - local < MIN_PART) return null;
  const left: MixTrack = { ...tr, length: local, fadeOut: 0 };
  const right: MixTrack = { ...tr, id: newId(), start: t, sourceIn: tr.sourceIn + local, length: tr.length - local, fadeIn: 0 };
  const next = [...tracks];
  next.splice(i, 1, left, right);
  return next;
}

export const clampTime = (t: number, length: number) => Math.max(0, Math.min(length, Number.isFinite(t) ? t : 0));
