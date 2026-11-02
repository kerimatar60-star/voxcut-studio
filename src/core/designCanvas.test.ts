import { describe, expect, it } from 'vitest';
import { DESIGN_PRESETS, MAX_CANVAS, MIN_CANVAS, presetIdFor, resizeCanvas } from './designCanvas';
import { designFileName, exportSize } from './designExport';
import { exampleProject, parseProject, serializeProject } from './project';

const design = () => exampleProject().design;

describe('tuval hazır ayarları ve yeniden boyutlandırma', () => {
  it('hazır ayarlar benzersiz ve sınırlar içinde; presetIdFor doğru eşler', () => {
    expect(new Set(DESIGN_PRESETS.map(p => p.id)).size).toBe(DESIGN_PRESETS.length);
    for (const p of DESIGN_PRESETS) { expect(p.width).toBeGreaterThanOrEqual(MIN_CANVAS); expect(p.height).toBeLessThanOrEqual(MAX_CANVAS); expect(presetIdFor(p.width, p.height)).toBe(p.id); }
    expect(presetIdFor(1234, 567)).toBe('custom');
  });

  it('boyut değişince konum yüzdeleri aynı kalır, yazı boyutu genişlik oranında ölçeklenir', () => {
    const d = design();
    const text = d.elements.find(e => e.kind === 'text')!;
    const out = resizeCanvas(d, 640, 360);
    const same = out.elements.find(e => e.id === text.id)!;
    expect([same.x, same.y, same.width, same.height]).toEqual([text.x, text.y, text.width, text.height]);
    expect(same.fontSize).toBe(Math.round(text.fontSize * 0.5));
    expect([out.width, out.height]).toEqual([640, 360]);
  });

  it('aşırı, küçük, kesirli ve sayı olmayan boyutları sınırlar; girdi değişmez', () => {
    const d = design(); const before = JSON.stringify(d);
    expect(resizeCanvas(d, 99999, 1)).toMatchObject({ width: MAX_CANVAS, height: MIN_CANVAS });
    expect(resizeCanvas(d, 100.6, NaN)).toMatchObject({ width: 101, height: MIN_CANVAS });
    expect(resizeCanvas(d, 1080, 1920).elements.every(e => e.fontSize >= 8 && e.fontSize <= 500)).toBe(true);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('yeniden boyutlandırılan tasarım kaydet → aç gidiş-dönüşünde korunur', () => {
    const project = exampleProject();
    const resized = { ...project, design: resizeCanvas(project.design, 1080, 1920) };
    const back = parseProject(JSON.parse(serializeProject(resized)));
    expect([back.design.width, back.design.height]).toEqual([1080, 1920]);
  });
});

describe('dışa aktarma ayarları', () => {
  it('exportSize ölçekler ve aşırı boyutu reddeder', () => {
    expect(exportSize(1280, 720, 2)).toEqual({ width: 2560, height: 1440 });
    expect(exportSize(1280, 720, 0.5)).toEqual({ width: 640, height: 360 });
    expect(() => exportSize(8000, 8000, 1)).toThrow(/çok büyük/);
    expect(() => exportSize(5000, 3000, 3)).toThrow(/çok büyük/);
    expect(() => exportSize(0, 100, 1)).toThrow(/geçersiz/);
    expect(() => exportSize(100, 100, NaN)).toThrow();
  });

  it('dosya adı güvenli ve doğru uzantılı; Unicode korunur', () => {
    expect(designFileName('Kapak ğüş/..\\x', 'jpeg')).toBe('Kapak_ğüş____x.jpg'); // nokta ve eğik çizgiler alt çizgiye döner: yol gezintisi imkânsız
    expect(designFileName('???', 'png')).toBe('tasarim.png');
    expect(designFileName('a', 'webp')).toBe('a.webp');
  });
});
