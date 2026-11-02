import { describe, expect, it } from 'vitest';
import type { TimelineClip } from './timelineModel';
import type { MixTrack } from './audioMixModel';
import { layoutVideo, locateVideo, previewClips, previewLength, splitClipAt, splitTrackAt, startTrackAt, trackStateAt } from './previewModel';

const clip = (id: string, inn: number, out: number, transition?: TimelineClip['transition']): TimelineClip => ({ id, path: `C:\\v\\${id}.mp4`, in: inn, out, sourceDuration: 100, transition });
const track = (over: Partial<MixTrack> = {}): MixTrack => ({ id: 't1', path: 'C:\\m.mp3', gain: 1, pan: 0, start: 2, sourceIn: 10, length: 6, fadeIn: 0, fadeOut: 0, mute: false, solo: false, sourceDuration: 120, ...over });
let n = 0; const id = () => `n${++n}`;

describe('layoutVideo / locateVideo', () => {
  it('klipleri art arda dizer', () => {
    const l = layoutVideo([clip('a', 0, 4), clip('b', 5, 8)]);
    expect([l[0].start, l[0].end, l[1].start, l[1].end]).toEqual([0, 4, 4, 7]);
  });
  it('geçiş bindirmesi bir sonraki klibi öne alır', () => {
    const clips = [clip('a', 0, 4, { kind: 'fade', duration: 1 }), clip('b', 5, 8)];
    const l = layoutVideo(clips);
    expect(l[1].start).toBe(3);
    expect(locateVideo(clips, 3.5)).toEqual({ index: 1, sourceTime: 5.5 });
    expect(locateVideo(clips, 2.9)).toEqual({ index: 0, sourceTime: 2.9 });
  });
  it('kaynak saniyesini klibin başlangıcına göre hesaplar', () => {
    expect(locateVideo([clip('a', 10, 20)], 3)).toEqual({ index: 0, sourceTime: 13 });
  });
  it('kapsam dışı zamanda null döner', () => {
    expect(locateVideo([clip('a', 0, 4)], 4)).toBeNull();
    expect(locateVideo([], 0)).toBeNull();
    expect(locateVideo([clip('a', 0, 4)], -1)).toBeNull();
  });
});

describe('trackStateAt', () => {
  it('başlamadan önce ve bittikten sonra etkin değildir', () => {
    expect(trackStateAt(track(), 1.9, false).active).toBe(false);
    expect(trackStateAt(track(), 8, false).active).toBe(false);
  });
  it('kaynak saniyesi sourceIn + geçen süredir', () => {
    const s = trackStateAt(track(), 5, false);
    expect(s.active).toBe(true);
    expect(s.sourceTime).toBe(13);
  });
  it('fade giriş ve çıkış kazancı ölçekler', () => {
    const t = track({ fadeIn: 2, fadeOut: 2 });
    expect(trackStateAt(t, 3, false).gain).toBeCloseTo(0.5);
    expect(trackStateAt(t, 5, false).gain).toBeCloseTo(1);
    expect(trackStateAt(t, 7, false).gain).toBeCloseTo(0.5);
  });
  it('sustur her zaman, solo yalnız başka solo varken sessizleştirir', () => {
    expect(trackStateAt(track({ mute: true, solo: true }), 5, true).active).toBe(false);
    expect(trackStateAt(track(), 5, true).active).toBe(false);
    expect(trackStateAt(track({ solo: true }), 5, true).active).toBe(true);
  });
});

describe('previewClips / previewLength', () => {
  it('zaman çizelgesi boşsa miksteki videoyu tek klip yapar', () => {
    const mix = { videoPath: 'C:\\x.mp4', videoDuration: 12, hasOriginal: true, gain: 1, mute: false, solo: false, tracks: [] };
    expect(previewClips({ clips: [], width: 1280, height: 720, fps: 30 }, mix)).toHaveLength(1);
    expect(previewClips(undefined, undefined)).toEqual([]);
  });
  it('süre, video ve müziğin büyüğüdür', () => {
    expect(previewLength([clip('a', 0, 4)], [track({ start: 3, length: 6 })])).toBe(9);
    expect(previewLength([clip('a', 0, 10)], [track()])).toBe(10);
    expect(previewLength([], [])).toBe(0);
  });
});

describe('splitClipAt', () => {
  it('klibi kaynak saniyesinde ikiye böler, geçiş ikinci parçada kalır', () => {
    const r = splitClipAt([clip('a', 0, 10, { kind: 'fade', duration: 1 }), clip('b', 0, 5)], 4, id)!;
    expect(r).toHaveLength(3);
    expect([r[0].in, r[0].out, r[0].transition]).toEqual([0, 4, undefined]);
    expect([r[1].in, r[1].out, r[1].transition?.duration]).toEqual([4, 10, 1]);
    expect(r[1].id).not.toBe(r[0].id);
  });
  it('kenara çok yakın veya kapsam dışı kesmeyi reddeder', () => {
    expect(splitClipAt([clip('a', 0, 10)], 0.05, id)).toBeNull();
    expect(splitClipAt([clip('a', 0, 10)], 9.95, id)).toBeNull();
    expect(splitClipAt([clip('a', 0, 10)], 11, id)).toBeNull();
  });
  it('girdiyi değiştirmez', () => {
    const clips = [clip('a', 0, 10)];
    splitClipAt(clips, 5, id);
    expect(clips).toHaveLength(1);
    expect(clips[0].out).toBe(10);
  });
});

describe('müzik katmanı düzenleme', () => {
  it('buradan başlat: başlangıcı playhead yapar, negatif olmaz', () => {
    expect(startTrackAt(track(), 7.123).start).toBe(7.12);
    expect(startTrackAt(track(), -3).start).toBe(0);
  });
  it('keserken sağ parça kaynakta kaldığı yerden devam eder', () => {
    const r = splitTrackAt([track({ fadeIn: 1, fadeOut: 1 })], 't1', 5, id)!;
    expect(r).toHaveLength(2);
    expect([r[0].start, r[0].length, r[0].fadeOut, r[0].fadeIn]).toEqual([2, 3, 0, 1]);
    expect([r[1].start, r[1].sourceIn, r[1].length, r[1].fadeIn, r[1].fadeOut]).toEqual([5, 13, 3, 0, 1]);
  });
  it('kenara çok yakın kesmeyi ve bilinmeyen katmanı reddeder', () => {
    expect(splitTrackAt([track()], 't1', 2.05, id)).toBeNull();
    expect(splitTrackAt([track()], 'yok', 5, id)).toBeNull();
  });
});
