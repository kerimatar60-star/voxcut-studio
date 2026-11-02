import { describe, expect, it } from 'vitest';
import { AI_DESIGN_SCHEMA, AI_MAX_ELEMENTS, editDesignMessages, newDesignMessages, normalizeAiDesign, normalizeAiDesigns } from './aiDesign';
import { exampleProject, parseProject, serializeProject } from './project';

const good = {
  width: 1280, height: 720, background: '#3C3489',
  elements: [
    { kind: 'ellipse', x: 60, y: -10, width: 40, height: 70, text: '', color: '#ffffff', background: '#EF9F27', fontSize: 40, weight: 700, fontFamily: 'Arial', align: 'left', italic: false, shadow: false, strokeColor: '#000000', strokeWidth: 0, opacity: 0.9, rotation: 0 },
    { kind: 'text', x: 6, y: 30, width: 60, height: 30, text: 'Yeni telefonu inceledim ğüşiöç', color: '#ffffff', background: '#000000', fontSize: 90, weight: 900, fontFamily: 'Impact', align: 'center', italic: true, shadow: true, strokeColor: '#112233', strokeWidth: 4, opacity: 1, rotation: -5 },
  ],
};

describe('yazıyla tasarla: istek hazırlama', () => {
  it('yeni tasarım isteği sistem kurallarını ve kullanıcı metnini içerir, uzun metni keser', () => {
    const m = newDesignMessages('x'.repeat(5000), { width: 1080, height: 1920 });
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain('1080x1920');
    expect(m[1].content.length).toBeLessThan(1700);
    expect(newDesignMessages('merhaba')[1].content).toContain('Tuval boyutunu isteğe göre seç');
  });
  it('düzeltme isteği mevcut tasarımı kimliksiz ve resimsiz gönderir', () => {
    const p = exampleProject();
    p.design.elements.push({ ...p.design.elements[0], id: 'resim', kind: 'image', assetId: 'GİZLİ-VARLIK' });
    const m = editDesignMessages(p.design, 'başlığı büyüt');
    expect(m[1].content).toContain('başlığı büyüt');
    expect(m[1].content).not.toContain('GİZLİ-VARLIK');
    expect(m[1].content).not.toContain(p.design.elements[0].id);
  });
  it('şema her alanı zorunlu tutar ve ek alanı yasaklar (structured outputs için)', () => {
    expect(AI_DESIGN_SCHEMA.additionalProperties).toBe(false);
    const item = AI_DESIGN_SCHEMA.properties.elements.items;
    expect(new Set(item.required)).toEqual(new Set(Object.keys(item.properties)));
    expect(item.additionalProperties).toBe(false);
  });
});

describe('yazıyla tasarla: cevabı güvenli tasarıma çevirme', () => {
  it('geçerli cevabı katmanlara çevirir, yeni kimlik verir, Türkçe karakteri korur', () => {
    const d = normalizeAiDesign(JSON.stringify(good));
    expect(d.width).toBe(1280); expect(d.background).toBe('#3c3489');
    expect(d.elements).toHaveLength(2);
    expect(d.elements[1].text).toBe('Yeni telefonu inceledim ğüşiöç');
    expect(d.elements[1]).toMatchObject({ align: 'center', italic: true, shadow: true, strokeWidth: 4, rotation: -5, weight: 900, fontFamily: 'Impact' });
    expect(new Set(d.elements.map(e => e.id)).size).toBe(2);
    expect(d.elements[0].opacity).toBe(0.9);
  });
  it('kod çiti ve fazladan açıklama içindeki JSON\'u da bulur', () => {
    expect(normalizeAiDesign('```json\n' + JSON.stringify(good) + '\n```').elements).toHaveLength(2);
    expect(normalizeAiDesign('İşte tasarım: ' + JSON.stringify(good) + ' umarım beğenirsin').elements).toHaveLength(2);
  });
  it('tehlikeli veya hatalı değerleri sınırlar: boyut, renk, katman türü, yazı tipi, sayı', () => {
    const bad = { width: 999999, height: -5, background: 'url(javascript:x)', elements: [
      { kind: 'image', x: 0, y: 0, width: 10, height: 10, assetId: 'C:\\gizli.png' },
      { kind: 'script', x: 0, y: 0, width: 10, height: 10 },
      { kind: 'text', x: 1e9, y: 'a', width: 0, height: null, text: 'a'.repeat(5000), color: 'red;background:url(x)', background: 'javascript:1', fontSize: 1e9, weight: 123, fontFamily: 'Evil; x', align: 'justify', italic: 'yes', strokeWidth: 500, strokeColor: 'zzz', opacity: 5, rotation: 9999 },
    ] };
    const d = normalizeAiDesign(JSON.stringify(bad), { width: 800, height: 800 });
    expect(d.width).toBe(8192); expect(d.height).toBe(64);
    expect(d.background).toBe('#1b1b2f');
    expect(d.elements).toHaveLength(1);
    const e = d.elements[0];
    expect(e.kind).toBe('text'); expect(e.x).toBe(150); expect(e.y).toBe(10); expect(e.width).toBe(1); expect(e.height).toBe(20);
    expect(e.text.length).toBe(600); expect(e.color).toBe('#ffffff'); expect(e.fontSize).toBe(600); expect([400, 700, 900]).toContain(e.weight);
    expect(e.fontFamily).toBeUndefined(); expect(e.align).toBeUndefined(); expect(e.italic).toBeUndefined();
    expect(e.strokeWidth).toBe(40); expect(e.strokeColor).toBe('#000000'); expect(e.opacity).toBeUndefined(); expect(e.rotation).toBe(360);
    expect(JSON.stringify(d)).not.toContain('gizli');
  });
  it('katman sayısını sınırlar', () => {
    const many = { ...good, elements: Array.from({ length: 200 }, () => good.elements[1]) };
    expect(normalizeAiDesign(JSON.stringify(many)).elements).toHaveLength(AI_MAX_ELEMENTS);
  });
  it('boş, bozuk veya katmansız cevapta anlaşılır hata verir', () => {
    for (const t of ['', 'merhaba', '{}', '{"elements":[]}', '{"elements":[{"kind":"image"}]}', '[1,2]']) expect(() => normalizeAiDesign(t), t).toThrow(/Tekrar dene|boş bir tasarım/);
  });
  it('birden çok cevaptan yalnız geçerli olanları alır; hiçbiri geçerli değilse hata verir', () => {
    expect(normalizeAiDesigns(['bozuk', JSON.stringify(good), '{}'])).toHaveLength(1);
    expect(() => normalizeAiDesigns(['bozuk', '{}'])).toThrow();
  });
  it('üretilen tasarım projeye konup kaydet → aç gidiş-dönüşünde aynen korunur', () => {
    const p = exampleProject();
    p.design = normalizeAiDesign(JSON.stringify(good));
    const back = parseProject(JSON.parse(serializeProject(p)));
    expect(back.design.elements).toHaveLength(2);
    expect(back.design.elements[1].text).toContain('ğüşiöç');
  });
});
