import { describe, expect, it } from 'vitest';
import { fitRect, initialImageBox } from './designGeometry';
import { fontStack, isFontFamily, wrapText } from './designText';

describe('metin sarma ve yazı tipleri', () => {
  const m = (s: string) => s.length * 10;
  it('kelimeleri genişliğe göre sarar, \\n zorunlu satır sonudur, boş satırı korur', () => {
    expect(wrapText('aa bb cc dd', 50, m)).toEqual(['aa bb', 'cc dd']);
    expect(wrapText('a\n\nb', 100, m)).toEqual(['a', '', 'b']);
    expect(wrapText('', 100, m)).toEqual(['']);
  });
  it('tek başına sığmayan uzun kelimeyi karakterden böler ve Unicode karakterleri bölmez', () => {
    expect(wrapText('abcdefgh', 30, m)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText('ğüşiöç', 30, m)).toEqual(['ğüş', 'iöç']);
    expect(wrapText('ab abcdefgh', 30, m)).toEqual(['ab', 'abc', 'def', 'gh']);
  });
  it('yazı tipi beyaz listesi dışını reddeder ve yedek aile ekler', () => {
    expect(isFontFamily('Arial')).toBe(true);
    expect(isFontFamily('Evil; background:url(x)')).toBe(false);
    expect(fontStack('Georgia')).toBe('"Georgia", serif');
    expect(fontStack('hacker')).toBe('"Arial", sans-serif');
    expect(fontStack(undefined)).toBe('"Arial", sans-serif');
  });
});

describe('görsel sığdırma', () => {
  it('contain: tamamı görünür ve ortalanır (yatay görsel dikey kutuda üst-alt boşluk)', () => {
    const r = fitRect(200, 100, 100, 100, 'contain');
    expect(r).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });
  it('cover: kutuyu doldurur, taşan kısım eşit kırpılır', () => {
    const r = fitRect(200, 100, 100, 100, 'cover');
    expect(r).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });
  it('kutu ile aynı oranda görsel her iki modda da tam oturur', () => {
    for (const fit of ['contain', 'cover'] as const) expect(fitRect(400, 200, 200, 100, fit)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
  it('geçersiz boyutlarda çökmez (kutuyu doldurur)', () => {
    expect(fitRect(0, 0, 100, 50, 'contain')).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(fitRect(10, 10, 0, 50, 'cover')).toEqual({ x: 0, y: 0, width: 0, height: 50 });
  });
  it('initialImageBox: oran korunur, ortalanır, tuvalin sınırlarını aşmaz', () => {
    const wide = initialImageBox(2000, 1000, 1280, 720);
    expect(wide.width).toBeCloseTo(50); expect((wide.width / 100) * 1280 / ((wide.height / 100) * 720)).toBeCloseTo(2);
    expect(wide.x).toBeCloseTo((100 - wide.width) / 2); expect(wide.y).toBeCloseTo((100 - wide.height) / 2);
    const tall = initialImageBox(500, 2000, 1280, 720);
    expect(tall.height).toBeCloseTo(60); expect((tall.width / 100) * 1280 / ((tall.height / 100) * 720)).toBeCloseTo(0.25);
    const bad = initialImageBox(0, 0, 1000, 1000);
    expect(bad.width).toBeCloseTo(50); expect(bad.height).toBeCloseTo(50);
  });
});
