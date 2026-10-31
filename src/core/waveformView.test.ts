import { describe, expect, it } from 'vitest';
import { peaksToBars, selectionFractions } from './waveformView';

describe('peaksToBars', () => {
  it('çubuk başına kapsadığı kovaların en yükseğini alır', () => {
    expect(peaksToBars([0.1, 0.5, 0.2, 0.9, 0, 0.3], 3)).toEqual([0.5, 0.9, 0.3]);
  });
  it('çubuk sayısı kovadan fazlaysa son çubuklar sıfır kalmaz bozulmaz, boş girdi sıfırdır', () => {
    expect(peaksToBars([1, 0.5], 4)).toEqual([1, 0, 0.5, 0]);
    expect(peaksToBars([], 5)).toEqual([0, 0, 0, 0, 0]);
  });
  it('0..1 dışı ve sonlu olmayan değerleri sınırlar; geçersiz sayıyı 1 çubuğa yuvarlar', () => {
    expect(peaksToBars([2, -1, NaN, Infinity], 4)).toEqual([1, 0, 0, 0]);
    expect(peaksToBars([0.4], 0)).toEqual([0.4]);
    expect(peaksToBars([0.4], 2.9)).toHaveLength(2);
  });
});

describe('selectionFractions', () => {
  it('kesiti kaynak süresine oranlar', () => {
    expect(selectionFractions(2, 6, 8)).toEqual({ from: 0.25, to: 0.75 });
  });
  it('sınırları aşan veya ters değerleri kırpar; süre bilinmiyorsa tamamı seçili', () => {
    expect(selectionFractions(-3, 99, 10)).toEqual({ from: 0, to: 1 });
    expect(selectionFractions(8, 2, 10)).toEqual({ from: 0.8, to: 0.8 });
    expect(selectionFractions(1, 2, 0)).toEqual({ from: 0, to: 1 });
    expect(selectionFractions(NaN, 2, 10)).toEqual({ from: 0, to: 1 });
  });
});
