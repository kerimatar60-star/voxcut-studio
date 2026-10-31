import { describe, expect, it } from 'vitest';
import { alignBox, MIN_BOX_PX, resizeBox, rotationFromPointer, type Box } from './designGeometry';
import { fontStack, isFontFamily, wrapText } from './designText';

const W = 1000, H = 500;
const toRad = (d: number) => (d * Math.PI) / 180;
/** Kutunun yerel (merkezden ox,oy) noktasının dünya koordinatı, tuval pikseli. */
const corner = (b: Box, ox: number, oy: number) => {
  const w = (b.width / 100) * W, h = (b.height / 100) * H;
  const cx = (b.x / 100) * W + w / 2, cy = (b.y / 100) * H + h / 2;
  const c = Math.cos(toRad(b.rotation)), s = Math.sin(toRad(b.rotation));
  return { x: cx + ox * c - oy * s, y: cy + ox * s + oy * c };
};
const sizePx = (b: Box) => ({ w: (b.width / 100) * W, h: (b.height / 100) * H });
const box = (rotation: number): Box => ({ x: 20, y: 30, width: 40, height: 20, rotation }); // 400×100 px

describe('resizeBox', () => {
  it('dönüksüz: sağ-alt köşe sürüklenince sol-üst sabit kalır', () => {
    const out = resizeBox(box(0), 'se', 100, 50, W, H);
    expect(sizePx(out)).toEqual({ w: 500, h: 150 });
    expect([out.x, out.y]).toEqual([20, 30]);
  });

  it('dönüksüz: sol-üst köşe sürüklenince sağ-alt sabit kalır', () => {
    const before = corner(box(0), 200, 50);
    const out = resizeBox(box(0), 'nw', -100, -50, W, H);
    const after = corner(out, sizePx(out).w / 2, sizePx(out).h / 2);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
    expect(sizePx(out)).toEqual({ w: 500, h: 150 });
  });

  it.each([30, 90, -45, 180])('dönük (%i°): her köşe için KARŞI köşe dünya koordinatında sabit kalır', rotation => {
    const b = box(rotation);
    const { w, h } = sizePx(b);
    const cases = [['nw', 1, 1], ['ne', -1, 1], ['sw', 1, -1], ['se', -1, -1]] as const; // [tutamaç, karşı köşe işaretleri]
    for (const [handle, ox, oy] of cases) {
      const opposite = corner(b, (ox * w) / 2, (oy * h) / 2);
      const out = resizeBox(b, handle, 37, -21, W, H);
      const o = sizePx(out);
      const after = corner(out, (ox * o.w) / 2, (oy * o.h) / 2);
      expect(after.x).toBeCloseTo(opposite.x, 6); expect(after.y).toBeCloseTo(opposite.y, 6);
      expect(out.rotation).toBe(rotation);
    }
  });

  it('en küçük boyutun altına inmez ve karşı köşe yine sabit kalır', () => {
    const out = resizeBox(box(0), 'se', -9999, -9999, W, H);
    expect(sizePx(out)).toEqual({ w: MIN_BOX_PX, h: MIN_BOX_PX });
    expect([out.x, out.y]).toEqual([20, 30]);
  });

  it('keepRatio en-boy oranını korur', () => {
    const out = resizeBox(box(20), 'se', 80, 5, W, H, true);
    const o = sizePx(out);
    expect(o.w / o.h).toBeCloseTo(4, 6);
    expect(o.w).toBeGreaterThan(400);
  });
});

describe('rotationFromPointer ve hizalama', () => {
  it('tutamaç üstteyken 0°, sağdayken 90°, altta 180°, solda -90°', () => {
    expect(rotationFromPointer(0, 0, 0, -50, false)).toBe(0);
    expect(rotationFromPointer(0, 0, 50, 0, false)).toBe(90);
    expect(rotationFromPointer(0, 0, 0, 50, false)).toBe(180);
    expect(rotationFromPointer(0, 0, -50, 0, false)).toBe(-90);
  });
  it('snap 15° adımlara yuvarlar', () => {
    expect(rotationFromPointer(0, 0, 50, -10, true) % 15).toBe(0);
    expect(rotationFromPointer(0, 0, 50, -10, true)).toBe(75);
  });

  it('alignBox tuvale göre hizalar, girdiyi değiştirmez', () => {
    const b = { x: 13, y: 41, width: 30, height: 10 };
    expect(alignBox(b, 'left').x).toBe(0);
    expect(alignBox(b, 'hcenter').x).toBe(35);
    expect(alignBox(b, 'right').x).toBe(70);
    expect(alignBox(b, 'top').y).toBe(0);
    expect(alignBox(b, 'vcenter').y).toBe(45);
    expect(alignBox(b, 'bottom').y).toBe(90);
    expect(b).toEqual({ x: 13, y: 41, width: 30, height: 10 });
  });
});

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

import { fitRect, initialImageBox } from './designGeometry';

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
