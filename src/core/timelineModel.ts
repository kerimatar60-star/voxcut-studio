import { baseName, printOf, type ProbeResult } from './audioMixModel';

/** Klibin sonundaki geçiş (bu klip → sonraki klip). `cut` geçiş yok demektir ve kaydedilmez. */
export const TRANSITIONS = [
  { id: 'cut', label: 'Kesme (geçiş yok)' },
  { id: 'fade', label: 'Solma' },
  { id: 'dissolve', label: 'Eriyerek geçiş' },
  { id: 'fadeblack', label: 'Siyaha solma' },
  { id: 'fadewhite', label: 'Beyaza solma' },
  { id: 'wipeleft', label: 'Sola silme' },
  { id: 'wiperight', label: 'Sağa silme' },
  { id: 'slideleft', label: 'Sola kayma' },
  { id: 'slideright', label: 'Sağa kayma' },
  { id: 'circleopen', label: 'Daire açılışı' },
  { id: 'pixelize', label: 'Piksellenme' },
  { id: 'radial', label: 'Radyal' },
] as const;
export type TransitionKind = (typeof TRANSITIONS)[number]['id'];
export const MIN_TRANSITION = 0.1;
export const MAX_TRANSITION = 3;
export type ClipTransition = { kind: Exclude<TransitionKind, 'cut'>; duration: number };
/** Klip başına renk ayarı: parlaklık -1..1, kontrast 0..2, doygunluk 0..3; varsayılan (0, 1, 1) kaydedilmez. */
export type ClipAdjust = { brightness: number; contrast: number; saturation: number };
export const DEFAULT_ADJUST: ClipAdjust = { brightness: 0, contrast: 1, saturation: 1 };

/** Video zaman çizelgesi: sıralı kesitler (kaynak dosya + başlangıç/bitiş). Medya baytı değil yalnız yol ve ayar saklanır. */
export type TimelineClip = { id: string; path: string; in: number; out: number; sourceDuration: number; size?: number; fingerprint?: string; transition?: ClipTransition; adjust?: ClipAdjust };
/** `burnSubtitles`: projedeki altyazıları çıktıya yak; `applyMix`: Ses sekmesindeki ek kanalları uygula (yalnız true ise kaydedilir). */
export type TimelineState = { clips: TimelineClip[]; width: number; height: number; fps: number; burnSubtitles?: boolean; applyMix?: boolean };

export const MAX_TIMELINE_CLIPS = 50;
export const FPS_CHOICES = [24, 25, 30, 50, 60] as const;
export const OUTPUT_PRESETS = [
  { id: 'hd720', label: 'YouTube 720p · 1280×720', width: 1280, height: 720 },
  { id: 'hd1080', label: 'YouTube 1080p · 1920×1080', width: 1920, height: 1080 },
  { id: 'shorts', label: 'Shorts / Reels · 1080×1920', width: 1080, height: 1920 },
  { id: 'square', label: 'Kare · 1080×1080', width: 1080, height: 1080 },
] as const;

export const emptyTimeline = (): TimelineState => ({ clips: [], width: 1280, height: 720, fps: 30 });
export const presetIdForSize = (w: number, h: number): string => OUTPUT_PRESETS.find(p => p.width === w && p.height === h)?.id ?? 'custom';

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\0/g, '').slice(0, max);
const evenSize = (v: unknown, def: number, min: number, max: number) => Math.round(num(v, def, min, max) / 2) * 2;
const isDefaultAdjust = (a: ClipAdjust) => a.brightness === 0 && a.contrast === 1 && a.saturation === 1;

/** Proje JSON'undaki zaman çizelgesini güvenle okur; alan yoksa (eski proje) undefined döner. */
export function parseTimeline(input: unknown): TimelineState | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Zaman çizelgesi verisi geçersiz.');
  const v = input as Record<string, unknown>;
  const raw = v.clips ?? [];
  if (!Array.isArray(raw) || raw.length > MAX_TIMELINE_CLIPS) throw new Error(`Zaman çizelgesi en fazla ${MAX_TIMELINE_CLIPS} klip içerebilir.`);
  const clips: TimelineClip[] = raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Klip kaydı geçersiz.');
    const c = item as Record<string, unknown>;
    const path = text(c.path, 1024);
    if (!path) throw new Error('Klipte dosya yolu yok.');
    const inPoint = num(c.in, 0, 0, 86400), outPoint = num(c.out, inPoint + 1, 0, 86400);
    const t = c.transition as Record<string, unknown> | undefined;
    const kind = t && typeof t === 'object' ? TRANSITIONS.find(x => x.id === t.kind && x.id !== 'cut')?.id : undefined;
    const a = c.adjust as Record<string, unknown> | undefined;
    const adjust: ClipAdjust | undefined = a && typeof a === 'object' ? { brightness: num(a.brightness, 0, -1, 1), contrast: num(a.contrast, 1, 0, 2), saturation: num(a.saturation, 1, 0, 3) } : undefined;
    return {
      id: text(c.id, 120) || crypto.randomUUID(), path, in: inPoint, out: outPoint, sourceDuration: num(c.sourceDuration, 0, 0, 86400), ...printOf(c.size, c.fingerprint),
      ...(kind && kind !== 'cut' ? { transition: { kind, duration: num(t?.duration, 0.5, MIN_TRANSITION, MAX_TRANSITION) } } : {}),
      ...(adjust && !isDefaultAdjust(adjust) ? { adjust } : {}),
    };
  });
  const fps = (FPS_CHOICES as readonly number[]).includes(Number(v.fps)) ? Number(v.fps) : 30;
  return {
    clips, width: evenSize(v.width, 1280, 128, 7680), height: evenSize(v.height, 720, 128, 4320), fps,
    ...(v.burnSubtitles === true ? { burnSubtitles: true } : {}), ...(v.applyMix === true ? { applyMix: true } : {}),
  };
}

export const clipLength = (c: Pick<TimelineClip, 'in' | 'out'>) => Math.max(0, c.out - c.in);
export const totalDuration = (clips: TimelineClip[]) => clips.reduce((sum, c) => sum + clipLength(c), 0);
/** Geçişler kliplerin üst üste binmesidir: çıktının gerçek süresi = klip toplamı − geçiş süreleri (son klibin geçişi yok sayılır). */
export const outputDuration = (clips: TimelineClip[]) => totalDuration(clips) - clips.slice(0, -1).reduce((s, c) => s + (c.transition?.duration ?? 0), 0);

/** Klibe izin verilen en uzun geçiş: komşu iki klibin kısasının yarısı (Rust ile aynı kural), 3 sn'yi aşmaz. */
export const maxTransitionFor = (clips: TimelineClip[], index: number): number => {
  const a = clips[index], b = clips[index + 1];
  if (!a || !b) return 0;
  return Math.max(0, Math.min(MAX_TRANSITION, 0.5 * Math.min(clipLength(a), clipLength(b))));
};

/** Klibi bir adım yukarı/aşağı taşır; taşınamıyorsa aynı diziyi döndürür. */
export function moveClip(clips: TimelineClip[], id: string, dir: -1 | 1): TimelineClip[] {
  const from = clips.findIndex(c => c.id === id), to = from + dir;
  if (from < 0 || to < 0 || to >= clips.length) return clips;
  const copy = clips.slice();
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

/** Kesit ayarını kaynağa göre düzeltir: başlangıç ≥ 0, bitiş kaynak süresini aşmaz, en az 0,1 sn uzunluk. Kaynak süresi bilinmiyorsa (0) üst sınır uygulanmaz. */
export function clampClip(c: TimelineClip, patch: Partial<Pick<TimelineClip, 'in' | 'out'>>): TimelineClip {
  const max = c.sourceDuration > 0 ? c.sourceDuration : 86400;
  let inPoint = Number.isFinite(patch.in ?? c.in) ? (patch.in ?? c.in) : c.in;
  let outPoint = Number.isFinite(patch.out ?? c.out) ? (patch.out ?? c.out) : c.out;
  inPoint = Math.min(Math.max(0, inPoint), Math.max(0, max - 0.1));
  outPoint = Math.min(Math.max(outPoint, inPoint + 0.1), max);
  inPoint = Math.min(inPoint, outPoint - 0.1);
  return { ...c, in: Math.round(inPoint * 1000) / 1000, out: Math.round(outPoint * 1000) / 1000 };
}

/** Geçişi ayarlar (kind 'cut' geçişi kaldırır); süre komşu kliplere göre sınırlanır. */
export function setTransition(clips: TimelineClip[], id: string, kind: TransitionKind, duration?: number): TimelineClip[] {
  const index = clips.findIndex(c => c.id === id);
  if (index < 0) return clips;
  const next = clips.slice();
  const { transition: _drop, ...rest } = next[index];
  if (kind === 'cut' || index === clips.length - 1) { next[index] = rest; return next; }
  const limit = Math.max(MIN_TRANSITION, maxTransitionFor(clips, index));
  next[index] = { ...rest, transition: { kind, duration: Math.min(limit, Math.max(MIN_TRANSITION, Number.isFinite(duration) ? (duration as number) : (clips[index].transition?.duration ?? 0.5))) } };
  return next;
}

/** Renk ayarını klibe uygular; varsayılan değerlere dönünce kayıttan kaldırılır. */
export function setAdjust(clips: TimelineClip[], id: string, patch: Partial<ClipAdjust>): TimelineClip[] {
  const index = clips.findIndex(c => c.id === id);
  if (index < 0) return clips;
  const cur = clips[index].adjust ?? DEFAULT_ADJUST;
  const merged: ClipAdjust = {
    brightness: num(patch.brightness ?? cur.brightness, 0, -1, 1), contrast: num(patch.contrast ?? cur.contrast, 1, 0, 2), saturation: num(patch.saturation ?? cur.saturation, 1, 0, 3),
  };
  const next = clips.slice();
  const { adjust: _drop, ...rest } = next[index];
  next[index] = isDefaultAdjust(merged) ? rest : { ...rest, adjust: merged };
  return next;
}

/** Dışa aktarma isteği için doğrulama: hata varsa Türkçe mesaj, yoksa null. */
export function validateTimeline(t: TimelineState): string | null {
  if (!t.clips.length) return 'Önce zaman çizelgesine en az bir klip ekle.';
  if (t.clips.length > MAX_TIMELINE_CLIPS) return `En fazla ${MAX_TIMELINE_CLIPS} klip birleştirilebilir.`;
  for (const [i, c] of t.clips.entries()) {
    const label = `Klip ${i + 1} (${baseName(c.path)})`;
    if (!c.path) return `${label}: dosya yolu yok.`;
    if (![c.in, c.out].every(Number.isFinite) || c.in < 0 || c.out <= c.in) return `${label}: kesit başlangıcı/bitişi geçersiz.`;
    if (c.sourceDuration > 0 && c.out > c.sourceDuration + 0.05) return `${label}: kesit bitişi kaynak süresini aşıyor.`;
    if (c.transition && i < t.clips.length - 1) {
      const limit = maxTransitionFor(t.clips, i);
      if (!Number.isFinite(c.transition.duration) || c.transition.duration < MIN_TRANSITION - 1e-9 || c.transition.duration > limit + 1e-9) return `${label}: geçiş süresi en az ${MIN_TRANSITION} sn, en çok ${limit.toFixed(1)} sn olabilir (komşu kliplerin kısasının yarısı).`;
    }
  }
  if (t.width % 2 || t.height % 2 || t.width < 128 || t.height < 128) return 'Çıktı boyutu çift sayı ve en az 128 px olmalı.';
  if (!(FPS_CHOICES as readonly number[]).includes(t.fps)) return 'Kare hızı geçersiz.';
  return null;
}

/** Rust `render_timeline` için klip dizisi: [yol, başlangıç, bitiş]. */
export const clipsRequest = (t: TimelineState): [string, number, number][] => t.clips.map(c => [c.path, c.in, c.out]);
/** Geçiş isteği (klip sayısı − 1 adet [ad, süre]); hiç geçiş yoksa undefined. */
export const transitionsRequest = (t: TimelineState): [string, number][] | undefined =>
  t.clips.slice(0, -1).some(c => c.transition) ? t.clips.slice(0, -1).map(c => [c.transition?.kind ?? 'cut', c.transition?.duration ?? 0] as [string, number]) : undefined;
/** Renk ayarı isteği (klip sayısı kadar [parlaklık, kontrast, doygunluk]); hiç ayar yoksa undefined. */
export const adjustsRequest = (t: TimelineState): [number, number, number][] | undefined =>
  t.clips.some(c => c.adjust) ? t.clips.map(c => { const a = c.adjust ?? DEFAULT_ADJUST; return [a.brightness, a.contrast, a.saturation] as [number, number, number]; }) : undefined;

/**
 * Proje açılırken kayıtlı süreye güvenmez: gerçek FFprobe sonuçlarıyla düzeltir. Eksik/okunamayan/videosuz dosyalar
 * `issues` içinde (anahtar: klip id) bildirilir; yol silinmez, ayarlar korunur.
 */
export function reconcileTimeline(t: TimelineState, probes: ProbeResult[]) {
  const issues: Record<string, string> = {};
  const notes: string[] = [];
  let clips = t.clips.map((c, i) => {
    const r = probes[i];
    const label = `Klip ${i + 1} (${baseName(c.path)})`;
    if (!r || !r.ok) { issues[c.id] = `${label} bulunamadı veya okunamadı. Taşınmış ya da silinmiş olabilir.`; return c; }
    if (!r.hasVideo) { issues[c.id] = `${label} artık video içermiyor.`; return c; }
    if (c.sourceDuration > 0 && Math.abs(r.duration - c.sourceDuration) > 0.05) notes.push(`${label}: kaynak süresi değişmiş (${c.sourceDuration.toFixed(2)} → ${r.duration.toFixed(2)} sn).`);
    const fixed = clampClip({ ...c, sourceDuration: r.duration }, {});
    if (fixed.in !== c.in || fixed.out !== c.out) notes.push(`${label}: kesit yeni kaynak süresine göre ayarlandı (${fixed.in.toFixed(2)}–${fixed.out.toFixed(2)} sn).`);
    return fixed;
  });
  // Kesitler değişince geçiş süreleri komşu kliplere göre yeniden sınırlanır.
  clips = clips.map((c, i) => {
    if (!c.transition || i === clips.length - 1) return c;
    const limit = Math.max(MIN_TRANSITION, maxTransitionFor(clips, i));
    if (c.transition.duration <= limit + 1e-9) return c;
    notes.push(`Klip ${i + 1}: geçiş süresi komşu kliplere göre ${limit.toFixed(1)} sn'ye düşürüldü.`);
    return { ...c, transition: { ...c.transition, duration: limit } };
  });
  return { timeline: { ...t, clips }, issues, notes };
}
