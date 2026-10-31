import { describe, expect, it } from 'vitest';
import { DESIGN_PRESETS, MAX_CANVAS, MIN_CANVAS } from './designCanvas';
import { DESIGN_TEMPLATES, instantiateTemplate, templateById } from './designTemplates';
import { isFontFamily, LINE_HEIGHT, wrapText } from './designText';
import { exampleProject, parseProject, serializeProject } from './project';


/**
 * Yazı genişliği tahmini (Arial/Impact, tarayıcı canvas ölçümlerine göre MUHAFAZAKÂR): büyük harf ve ağır kalınlık daha geniştir.
 * Ölçüm: 150 px Arial 900 "ÖĞRENDİM" = 916 px (≈0,76 em/harf).
 */
function estimateWidth(text: string, size: number, weight: number, family?: string): number {
  const heavy = weight >= 800, narrow = family === 'Impact';
  let em = 0;
  for (const ch of Array.from(text)) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch)) em += narrow ? 0.55 : heavy ? 0.78 : 0.72;
    else if (/[0-9%]/.test(ch)) em += narrow ? 0.5 : 0.62;
    else if (ch === ' ') em += 0.3;
    else if (/[“”—•]/.test(ch)) em += 0.7;
    else em += narrow ? 0.45 : heavy ? 0.62 : 0.56;
  }
  return em * size;
}

describe('şablon kütüphanesi', () => {
  it('en az 12 şablon, benzersiz kimlik ve ad', () => {
    expect(DESIGN_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(DESIGN_TEMPLATES.map(t => t.id)).size).toBe(DESIGN_TEMPLATES.length);
    expect(new Set(DESIGN_TEMPLATES.map(t => `${t.category}/${t.name}`)).size).toBe(DESIGN_TEMPLATES.length);
    expect(templateById('yt-baslik')?.name).toBe('Büyük başlık');
    expect(templateById('yok')).toBeUndefined();
  });

  it('her şablon bir hazır tuval boyutunu kullanır ve 5 kategoriyi kapsar', () => {
    for (const t of DESIGN_TEMPLATES) expect(DESIGN_PRESETS.some(p => p.width === t.width && p.height === t.height), t.id).toBe(true);
    const categories = new Set(DESIGN_TEMPLATES.map(t => t.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it('katmanlar geçerli: sınırlar, renkler, yazı tipleri, boş olmayan metin', () => {
    for (const t of DESIGN_TEMPLATES) {
      expect(t.width).toBeGreaterThanOrEqual(MIN_CANVAS); expect(t.height).toBeLessThanOrEqual(MAX_CANVAS);
      expect(t.background, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.elements.length, t.id).toBeGreaterThan(0);
      expect(t.elements.length, t.id).toBeLessThanOrEqual(10);
      for (const e of t.elements) {
        expect(Number.isFinite(e.x + e.y + e.width + e.height + e.fontSize + e.weight), t.id).toBe(true);
        expect(e.width, t.id).toBeGreaterThan(0); expect(e.height, t.id).toBeGreaterThan(0);
        expect(e.fontSize).toBeGreaterThanOrEqual(8); expect(e.fontSize).toBeLessThanOrEqual(500);
        if (e.fontFamily) expect(isFontFamily(e.fontFamily), `${t.id} yazı tipi`).toBe(true);
        if (e.opacity !== undefined) { expect(e.opacity).toBeGreaterThanOrEqual(0.05); expect(e.opacity).toBeLessThanOrEqual(1); }
        if (e.kind === 'text') expect(e.text.trim().length, t.id).toBeGreaterThan(0);
        const color = e.kind === 'text' ? e.color : e.background;
        expect(color, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('metinler kutularına sığar (yaklaşık genişlik ölçümüyle sarılınca yükseklik aşılmaz): kırpma olmaz', () => {
    const problems: string[] = [];
    for (const t of DESIGN_TEMPLATES) {
      for (const e of t.elements.filter(x => x.kind === 'text')) {
        const boxW = (e.width / 100) * t.width, boxH = (e.height / 100) * t.height;
        const width = (s: string) => estimateWidth(s, e.fontSize, e.weight, e.fontFamily);
        const lines = wrapText(e.text, boxW, width);
        const need = lines.length * e.fontSize * LINE_HEIGHT;
        if (need > boxH + 0.5) problems.push(`${t.id}: "${e.text.split('\n')[0]}" yükseklik ${Math.round(need)} > ${Math.round(boxH)}`);
        // Tek bir kelime bile kutudan geniş olmamalı (karakterden bölünmesin).
        for (const word of e.text.split(/\s+/)) if (width(word) > boxW + 0.5) problems.push(`${t.id}: "${word}" genişlik ${Math.round(width(word))} > ${Math.round(boxW)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('şablon uygulanınca yeni kimlikler üretilir, şablon verisi değişmez ve proje kaydet → aç döngüsünden geçer', () => {
    const t = DESIGN_TEMPLATES[0];
    const snapshot = JSON.stringify(t);
    let n = 0;
    const design = instantiateTemplate(t, () => `n${++n}`);
    expect(design.elements.map(e => e.id)).toEqual(t.elements.map((_, i) => `n${i + 1}`));
    expect(JSON.stringify(t)).toBe(snapshot);
    const project = { ...exampleProject(), design };
    const back = parseProject(JSON.parse(serializeProject(project)));
    expect(back.design.elements).toHaveLength(t.elements.length);
    expect([back.design.width, back.design.height]).toEqual([t.width, t.height]);
  });

  it('tüm şablonlar projeye yüklenip ayrıştırıcıdan kayıpsız geçer', () => {
    for (const t of DESIGN_TEMPLATES) {
      let n = 0;
      const project = { ...exampleProject(), design: instantiateTemplate(t, () => `e${++n}`) };
      const back = parseProject(JSON.parse(serializeProject(project)));
      expect(back.design.elements.length, t.id).toBe(t.elements.length);
      back.design.elements.forEach((e, i) => { expect(e.kind).toBe(t.elements[i].kind); expect(e.text).toBe(t.elements[i].text); });
    }
  });
});
