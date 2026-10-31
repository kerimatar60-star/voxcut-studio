import { baseName, printOf, type ProbeResult } from './audioMixModel';

/** Video zaman çizelgesi: sıralı kesitler (kaynak dosya + başlangıç/bitiş). Medya baytı değil yalnız yol ve ayar saklanır. */
export type TimelineClip = { id: string; path: string; in: number; out: number; sourceDuration: number; size?: number; fingerprint?: string };
export type TimelineState = { clips: TimelineClip[]; width: number; height: number; fps: number };

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
    return { id: text(c.id, 120) || crypto.randomUUID(), path, in: inPoint, out: outPoint, sourceDuration: num(c.sourceDuration, 0, 0, 86400), ...printOf(c.size, c.fingerprint) };
  });
  const fps = (FPS_CHOICES as readonly number[]).includes(Number(v.fps)) ? Number(v.fps) : 30;
  return { clips, width: evenSize(v.width, 1280, 128, 7680), height: evenSize(v.height, 720, 128, 4320), fps };
}

export const clipLength = (c: Pick<TimelineClip, 'in' | 'out'>) => Math.max(0, c.out - c.in);
export const totalDuration = (clips: TimelineClip[]) => clips.reduce((sum, c) => sum + clipLength(c), 0);

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

/** Dışa aktarma isteği için doğrulama: hata varsa Türkçe mesaj, yoksa null. */
export function validateTimeline(t: TimelineState): string | null {
  if (!t.clips.length) return 'Önce zaman çizelgesine en az bir klip ekle.';
  if (t.clips.length > MAX_TIMELINE_CLIPS) return `En fazla ${MAX_TIMELINE_CLIPS} klip birleştirilebilir.`;
  for (const [i, c] of t.clips.entries()) {
    const label = `Klip ${i + 1} (${baseName(c.path)})`;
    if (!c.path) return `${label}: dosya yolu yok.`;
    if (![c.in, c.out].every(Number.isFinite) || c.in < 0 || c.out <= c.in) return `${label}: kesit başlangıcı/bitişi geçersiz.`;
    if (c.sourceDuration > 0 && c.out > c.sourceDuration + 0.05) return `${label}: kesit bitişi kaynak süresini aşıyor.`;
  }
  if (t.width % 2 || t.height % 2 || t.width < 128 || t.height < 128) return 'Çıktı boyutu çift sayı ve en az 128 px olmalı.';
  if (!(FPS_CHOICES as readonly number[]).includes(t.fps)) return 'Kare hızı geçersiz.';
  return null;
}

/** Rust `render_timeline` için klip dizisi: [yol, başlangıç, bitiş]. */
export const clipsRequest = (t: TimelineState): [string, number, number][] => t.clips.map(c => [c.path, c.in, c.out]);

/**
 * Proje açılırken kayıtlı süreye güvenmez: gerçek FFprobe sonuçlarıyla düzeltir. Eksik/okunamayan/videosuz dosyalar
 * `issues` içinde (anahtar: klip id) bildirilir; yol silinmez, ayarlar korunur.
 */
export function reconcileTimeline(t: TimelineState, probes: ProbeResult[]) {
  const issues: Record<string, string> = {};
  const notes: string[] = [];
  const clips = t.clips.map((c, i) => {
    const r = probes[i];
    const label = `Klip ${i + 1} (${baseName(c.path)})`;
    if (!r || !r.ok) { issues[c.id] = `${label} bulunamadı veya okunamadı. Taşınmış ya da silinmiş olabilir.`; return c; }
    if (!r.hasVideo) { issues[c.id] = `${label} artık video içermiyor.`; return c; }
    if (c.sourceDuration > 0 && Math.abs(r.duration - c.sourceDuration) > 0.05) notes.push(`${label}: kaynak süresi değişmiş (${c.sourceDuration.toFixed(2)} → ${r.duration.toFixed(2)} sn).`);
    const fixed = clampClip({ ...c, sourceDuration: r.duration }, {});
    if (fixed.in !== c.in || fixed.out !== c.out) notes.push(`${label}: kesit yeni kaynak süresine göre ayarlandı (${fixed.in.toFixed(2)}–${fixed.out.toFixed(2)} sn).`);
    return fixed;
  });
  return { timeline: { ...t, clips }, issues, notes };
}
