import { describe, expect, it } from 'vitest';
import { mixRequest, type MixTrack } from './audioMixModel';
const track = (patch: Partial<MixTrack> = {}): MixTrack => ({ id: 'one', path: 'C:\\müzik.wav', gain: 0.5, pan: 0, start: 1, sourceIn: 0, length: 3, fadeIn: 0, fadeOut: 1, mute: false, solo: false, sourceDuration: 4, ...patch });
describe('miks kararları', () => {
  it('orijinali ve etkin kanalları birlikte gönderir', () => {
    const result = mixRequest(10, 0.9, false, false, [track(), track({ mute: true })]);
    expect(result.originalGain).toBe(0.9);
    expect(result.tracks).toEqual([['C:\\müzik.wav', 0.5, 0, 1, 0, 3, 0, 1]]);
  });
  it('solo yalnız seçili kanalı bırakır; sustur soloyu da susturur', () => {
    expect(mixRequest(10, 1, false, false, [track({ solo: true }), track()]).tracks).toHaveLength(1);
    expect(mixRequest(10, 1, false, false, [track({ solo: true, mute: true })])).toEqual({ originalGain: 0, tracks: [] });
    expect(mixRequest(10, 1, false, true, [track()])).toEqual({ originalGain: 1, tracks: [] });
  });
  it('kaynak dışı kesit ve çakışan fade değerlerini reddeder', () => {
    expect(() => mixRequest(10, 1, false, false, [track({ sourceIn: 2 })])).toThrow();
    expect(() => mixRequest(10, 1, false, false, [track({ fadeIn: 3 })])).toThrow();
    expect(() => mixRequest(10, 1, false, false, [track({ start: 10 })])).toThrow();
    expect(() => mixRequest(10, 1, false, false, [track({ pan: NaN })])).toThrow();
  });
  it('video sonunu aşan geçerli kesite izin verir; motor video sonunda keser', () => {
    expect(mixRequest(2, 1, false, false, [track()]).tracks).toHaveLength(1);
  });
});
