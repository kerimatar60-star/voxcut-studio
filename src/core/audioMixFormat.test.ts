import { describe, expect, it } from 'vitest';
import { MIX_FORMATS, mixFormatSpec, parseAudioMix } from './audioMixModel';

const base = { videoPath: 'C:/v.mp4', videoDuration: 10, tracks: [] };

describe('miks çıktı biçimi ve otomatik kısma kalıcılığı', () => {
  it('biçimler benzersiz; mp4 varsayılan; bilinmeyen kimlik mp4 sayılır', () => {
    expect(new Set(MIX_FORMATS.map(f => f.id)).size).toBe(MIX_FORMATS.length);
    expect(mixFormatSpec(undefined).id).toBe('mp4');
    expect(mixFormatSpec('flac').ext).toBe('flac');
    expect(mixFormatSpec('wav24').ext).toBe('wav');
  });
  it('geçerli biçim ve kısma gücü gidiş-dönüşte korunur', () => {
    const mix = parseAudioMix({ ...base, format: 'mp3', ducking: 0.6 })!;
    expect(mix).toMatchObject({ format: 'mp3', ducking: 0.6 });
    expect(parseAudioMix(JSON.parse(JSON.stringify(mix)))).toEqual(mix);
  });
  it('varsayılanlar (mp4, kısma kapalı) kaydedilmez; eski proje etkilenmez', () => {
    const mix = parseAudioMix({ ...base, format: 'mp4', ducking: 0 })! as unknown as Record<string, unknown>;
    expect('format' in mix).toBe(false);
    expect('ducking' in mix).toBe(false);
    expect('format' in (parseAudioMix(base)! as unknown as Record<string, unknown>)).toBe(false);
  });
  it('bozuk/saldırgan değerler atılır, kısma 0..1 aralığına kırpılır', () => {
    const bad = parseAudioMix({ ...base, format: 'ogg; rm -rf', ducking: 'çok' })! as unknown as Record<string, unknown>;
    expect('format' in bad).toBe(false);
    expect('ducking' in bad).toBe(false);
    expect(parseAudioMix({ ...base, ducking: 9 })!.ducking).toBe(1);
    expect('ducking' in (parseAudioMix({ ...base, ducking: -3 })! as unknown as Record<string, unknown>)).toBe(false);
  });
});
