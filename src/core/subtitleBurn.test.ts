import { describe, expect, it } from 'vitest';
import { planBurn } from './subtitleBurn';
import type { SubtitleCue } from './types';

const cue = (start: number, end: number, text = 'Merhaba'): SubtitleCue => ({ id: `${start}-${end}`, start, end, text });

describe('planBurn', () => {
  it('geçerli altyazıları SRT olarak sıralı üretir', () => {
    const plan = planBurn([cue(3, 4, 'ikinci'), cue(0, 2, 'birinci')], 10);
    expect(plan).toMatchObject({ used: 2, invalid: 0, dropped: 0, clipped: 0 });
    expect(plan.srt.indexOf('birinci')).toBeLessThan(plan.srt.indexOf('ikinci'));
    expect(plan.srt).toContain('00:00:00,000 --> 00:00:02,000');
  });

  it('boş metin ve ters zaman aralığını geçersiz sayar', () => {
    const plan = planBurn([cue(0, 2, '   '), cue(5, 4), cue(1, 2)], 10);
    expect(plan.used).toBe(1);
    expect(plan.invalid).toBe(2);
  });

  it('video süresini aşan bitişi kırpar, tamamen dışarıda kalanı atar', () => {
    const plan = planBurn([cue(8, 12, 'kırpılır'), cue(10, 11, 'dışarıda'), cue(12, 13, 'dışarıda 2')], 10);
    expect(plan).toMatchObject({ used: 1, clipped: 1, dropped: 2 });
    expect(plan.srt).toContain('00:00:08,000 --> 00:00:10,000');
    expect(plan.srt).not.toContain('dışarıda');
  });

  it('süre bilinmiyorsa kırpmaz', () => {
    const plan = planBurn([cue(0, 500)], 0);
    expect(plan).toMatchObject({ used: 1, clipped: 0, dropped: 0 });
  });

  it('kullanılabilir altyazı yoksa boş SRT döner', () => {
    expect(planBurn([], 10)).toMatchObject({ srt: '', used: 0 });
    expect(planBurn([cue(20, 21)], 10)).toMatchObject({ srt: '', used: 0, dropped: 1 });
  });

  it('Türkçe karakterleri korur', () => {
    expect(planBurn([cue(0, 1, 'İğŞüÖçı')], 5).srt).toContain('İğŞüÖçı');
  });
});
