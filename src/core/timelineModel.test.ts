import { describe, expect, it } from 'vitest';
import type { ProbeResult } from './audioMixModel';
import { clampClip, clipLength, clipsRequest, emptyTimeline, moveClip, parseTimeline, presetIdForSize, reconcileTimeline, totalDuration, validateTimeline, MAX_TIMELINE_CLIPS, type TimelineClip, type TimelineState } from './timelineModel';

const FP = 'e'.repeat(64);
const clip = (id: string, o: Partial<TimelineClip> = {}): TimelineClip => ({ id, path: `C:\\Videolar\\${id}.mp4`, in: 0, out: 5, sourceDuration: 10, ...o });
const state = (clips: TimelineClip[], o: Partial<TimelineState> = {}): TimelineState => ({ ...emptyTimeline(), clips, ...o });
const ok = (duration: number, hasVideo = true): ProbeResult => ({ ok: true, duration, hasAudio: true, hasVideo });

describe('parseTimeline', () => {
  it('alan yoksa undefined; geçerli veri gidiş-dönüşte korunur (parmak izi dahil)', () => {
    expect(parseTimeline(undefined)).toBeUndefined();
    expect(parseTimeline(null)).toBeUndefined();
    const t = state([clip('a', { size: 99, fingerprint: FP, in: 1.5, out: 4 })], { width: 1080, height: 1920, fps: 25 });
    expect(parseTimeline(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });
  it('bozuk/sınır dışı değerleri düzeltir: çift boyut, geçersiz fps, negatif süre, NUL', () => {
    const t = parseTimeline({ width: 1281, height: 99999, fps: 29, clips: [{ path: 'C:\\a\0b.mp4', in: -5, out: 'x', sourceDuration: 1e9, size: -1, fingerprint: 'zz' }] })!;
    expect(t.width % 2).toBe(0); expect(t.height).toBe(4320); expect(t.fps).toBe(30);
    expect(t.clips[0].path).toBe('C:\\ab.mp4');
    expect(t.clips[0].in).toBe(0); expect(t.clips[0].sourceDuration).toBe(86400);
    expect('fingerprint' in t.clips[0]).toBe(false);
    expect(t.clips[0].id.length).toBeGreaterThan(8);
  });
  it('geçersiz yapıları ve çok klibi reddeder; bayt/base64 sızmaz', () => {
    expect(() => parseTimeline('metin')).toThrow();
    expect(() => parseTimeline([])).toThrow();
    expect(() => parseTimeline({ clips: 'x' })).toThrow();
    expect(() => parseTimeline({ clips: [{ path: '' }] })).toThrow(/yolu yok/);
    expect(() => parseTimeline({ clips: [null] })).toThrow();
    expect(() => parseTimeline({ clips: Array.from({ length: MAX_TIMELINE_CLIPS + 1 }, () => ({ path: 'a.mp4' })) })).toThrow(/en fazla/);
    const t = parseTimeline({ clips: [{ path: 'a.mp4', data: 'AAAA', base64: 'x', blob: 'y' }] })!;
    expect(Object.keys(t.clips[0]).sort()).toEqual(['id', 'in', 'out', 'path', 'sourceDuration']);
  });
});

describe('süre, sıralama ve kesit', () => {
  it('toplam süre kesit uzunluklarının toplamıdır', () => {
    expect(totalDuration([clip('a', { in: 1, out: 4 }), clip('b', { in: 0, out: 2.5 })])).toBeCloseTo(5.5);
    expect(clipLength({ in: 3, out: 1 })).toBe(0);
    expect(totalDuration([])).toBe(0);
  });
  it('moveClip yer değiştirir, uçlarda aynı diziyi döndürür, girdiyi değiştirmez', () => {
    const clips = ['a', 'b', 'c'].map(id => clip(id));
    expect(moveClip(clips, 'b', -1).map(c => c.id)).toEqual(['b', 'a', 'c']);
    expect(moveClip(clips, 'b', 1).map(c => c.id)).toEqual(['a', 'c', 'b']);
    expect(moveClip(clips, 'a', -1)).toBe(clips);
    expect(moveClip(clips, 'c', 1)).toBe(clips);
    expect(moveClip(clips, 'yok', 1)).toBe(clips);
    expect(clips.map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('clampClip: kaynağı aşmaz, en az 0,1 sn bırakır, NaN yok sayar', () => {
    const c = clip('a', { in: 2, out: 6, sourceDuration: 8 });
    expect(clampClip(c, { out: 99 }).out).toBe(8);
    expect(clampClip(c, { in: -3 }).in).toBe(0);
    expect(clampClip(c, { in: 7.95 })).toMatchObject({ in: 7.9, out: 8 });
    expect(clampClip(c, { out: 1 })).toMatchObject({ in: 2, out: 2.1 });
    expect(clampClip(c, { in: NaN, out: NaN })).toMatchObject({ in: 2, out: 6 });
    expect(clampClip(clip('b', { sourceDuration: 0, out: 500 }), { out: 99999 }).out).toBe(86400);
  });
});

describe('validateTimeline ve clipsRequest', () => {
  it('geçerli çizelge null döner; Rust isteği [yol, in, out] biçimindedir', () => {
    const t = state([clip('a', { in: 1, out: 3 }), clip('b')]);
    expect(validateTimeline(t)).toBeNull();
    expect(clipsRequest(t)).toEqual([['C:\\Videolar\\a.mp4', 1, 3], ['C:\\Videolar\\b.mp4', 0, 5]]);
  });
  it('boş, ters kesit, kaynağı aşan kesit, tek sayılı boyut ve geçersiz fps için Türkçe mesaj verir', () => {
    expect(validateTimeline(state([]))).toMatch(/en az bir klip/);
    expect(validateTimeline(state([clip('a', { in: 4, out: 4 })]))).toMatch(/Klip 1.*geçersiz/);
    expect(validateTimeline(state([clip('a', { out: 11 })]))).toMatch(/aşıyor/);
    expect(validateTimeline(state([clip('a')], { width: 1281 }))).toMatch(/çift/);
    expect(validateTimeline(state([clip('a')], { fps: 29 }))).toMatch(/Kare hızı/);
    expect(validateTimeline(state([clip('a', { path: '' })]))).toMatch(/yolu yok/);
    expect(validateTimeline(state([clip('a', { in: NaN })]))).toMatch(/geçersiz/);
  });
  it('hazır boyutlar tanınır', () => {
    expect(presetIdForSize(1920, 1080)).toBe('hd1080');
    expect(presetIdForSize(1080, 1920)).toBe('shorts');
    expect(presetIdForSize(1000, 600)).toBe('custom');
  });
});

describe('reconcileTimeline (proje açılışı)', () => {
  it('gerçek süreyi kullanır, kesiti sığdırır ve nedenini notlar', () => {
    const t = state([clip('a', { in: 2, out: 9, sourceDuration: 10 })]);
    const r = reconcileTimeline(t, [ok(6)]);
    expect(r.timeline.clips[0]).toMatchObject({ sourceDuration: 6, in: 2, out: 6 });
    expect(r.notes.length).toBe(2);
    expect(r.issues).toEqual({});
  });
  it('eksik, okunamayan ve videosuz dosyaları issue olarak işaretler; yol ve ayar silinmez', () => {
    const t = state([clip('a'), clip('b'), clip('c')]);
    const r = reconcileTimeline(t, [{ ok: false, error: 'yok' }, ok(10, false), ok(10)]);
    expect(Object.keys(r.issues).sort()).toEqual(['a', 'b']);
    expect(r.issues.a).toMatch(/bulunamadı/); expect(r.issues.b).toMatch(/video içermiyor/);
    expect(r.timeline.clips.map(c => c.path)).toEqual(t.clips.map(c => c.path));
    expect(r.notes).toEqual([]);
  });
  it('probe sayısı eksikse kalan klipler eksik sayılır; girdi değişmez', () => {
    const t = state([clip('a'), clip('b')]);
    const before = JSON.stringify(t);
    const r = reconcileTimeline(t, [ok(10)]);
    expect(Object.keys(r.issues)).toEqual(['b']);
    expect(JSON.stringify(t)).toBe(before);
  });
});
