import { describe, expect, it } from 'vitest';
import { parseAudioMix, printChanged, printOf } from './audioMixModel';

const FP = 'a'.repeat(64);
const base = { videoPath: 'C:\\v.mp4', videoDuration: 10, tracks: [{ id: 't1', path: 'C:\\a.wav', gain: 1, sourceDuration: 5, length: 5 }] };

describe('medya parmak izi alanları', () => {
  it('geçerli parmak izi kaydet→aç gidiş-dönüşünde korunur', () => {
    const mix = parseAudioMix({ ...base, videoSize: 1234, videoFingerprint: FP, tracks: [{ ...base.tracks[0], size: 99, fingerprint: FP }] })!;
    expect(mix.videoSize).toBe(1234);
    expect(mix.videoFingerprint).toBe(FP);
    expect(mix.tracks[0]).toMatchObject({ size: 99, fingerprint: FP });
    const again = parseAudioMix(JSON.parse(JSON.stringify(mix)))!;
    expect(again).toEqual(mix);
  });

  it('eski proje (parmak izi alanı yok) sorunsuz açılır', () => {
    const mix = parseAudioMix(base)!;
    expect(mix.videoFingerprint).toBeUndefined();
    expect('videoSize' in mix).toBe(false);
    expect('fingerprint' in mix.tracks[0]).toBe(false);
  });

  it('bozuk/yarım/saldırgan değerleri sessizce atar', () => {
    for (const bad of [{ size: 10 }, { fingerprint: FP }, { size: -1, fingerprint: FP }, { size: 10, fingerprint: 'A'.repeat(64) }, { size: 10, fingerprint: 'abc' }, { size: 'x', fingerprint: FP }, { size: 1e400, fingerprint: FP }, { size: 10, fingerprint: `${FP}'; DROP` }]) {
      expect(printOf(bad.size, bad.fingerprint)).toEqual({});
    }
    const mix = parseAudioMix({ ...base, tracks: [{ ...base.tracks[0], size: 10, fingerprint: '../../etc' }] })!;
    expect(mix.tracks[0].fingerprint).toBeUndefined();
  });

  it('size kesirliyse tam sayıya indirilir', () => {
    expect(printOf(10.9, FP)).toEqual({ size: 10, fingerprint: FP });
  });

  it('printChanged: kayıt yoksa false, aynıysa false, farklıysa true', () => {
    const actual = { size: 10, fingerprint: FP };
    expect(printChanged({}, actual)).toBe(false);
    expect(printChanged({ size: 10, fingerprint: FP }, actual)).toBe(false);
    expect(printChanged({ size: 10, fingerprint: 'b'.repeat(64) }, actual)).toBe(true);
    expect(printChanged({ size: 11, fingerprint: FP }, actual)).toBe(true);
  });
});
