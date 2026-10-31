import { describe, expect, it } from 'vitest';
import { exampleProject, makeElement, parseProject, serializeProject } from './project';
import type { DesignElement } from './types';

const withElement = (extra: Record<string, unknown>) => {
  const base = { ...makeElement('text'), id: 'e1' } as Record<string, unknown>;
  const doc = { ...exampleProject(), design: { ...exampleProject().design, elements: [{ ...base, ...extra }] } };
  return parseProject(JSON.parse(JSON.stringify(doc))).design.elements[0] as DesignElement;
};

describe('katman stili kalıcılığı', () => {
  it('geçerli stil alanları kaydet → aç gidiş-dönüşünde korunur', () => {
    const style: Partial<DesignElement> = { fontFamily: 'Georgia', align: 'center', italic: true, shadow: true, strokeColor: '#112233', strokeWidth: 4, opacity: 0.5, rotation: -30 };
    const project = { ...exampleProject(), design: { ...exampleProject().design, elements: [{ ...makeElement('text'), id: 'e1', ...style }] } };
    const back = parseProject(JSON.parse(serializeProject(project))).design.elements[0];
    expect(back).toMatchObject(style);
  });

  it('eski proje (stil alanı yok) aynen açılır ve varsayılanlar eklenmez', () => {
    const el = withElement({}) as unknown as Record<string, unknown>;
    for (const key of ['fontFamily', 'align', 'italic', 'shadow', 'strokeColor', 'strokeWidth', 'opacity', 'rotation']) expect(key in el).toBe(false);
  });

  it('varsayılan değerler (opak=1, dönme=0, kontur=0, italik/gölge=false) kaydedilmez', () => {
    const el = withElement({ opacity: 1, rotation: 0, strokeWidth: 0, italic: false, shadow: false }) as unknown as Record<string, unknown>;
    for (const key of ['opacity', 'rotation', 'strokeWidth', 'italic', 'shadow']) expect(key in el).toBe(false);
  });

  it('sınır dışı sayılar kırpılır', () => {
    expect(withElement({ opacity: 0 }).opacity).toBe(0.05);
    expect(withElement({ rotation: 9999 }).rotation).toBe(360);
    expect(withElement({ rotation: -9999 }).rotation).toBe(-360);
    expect(withElement({ strokeWidth: 99999 }).strokeWidth).toBe(200);
    expect(withElement({ strokeWidth: -5 }).strokeWidth).toBeUndefined();
  });

  it('saldırgan/bozuk değerler sessizce atılır (CSS enjeksiyonu dahil)', () => {
    const el = withElement({ fontFamily: 'Arial; background:url(//evil)', align: 'justify', strokeColor: 'red; x:y', opacity: 'yarım', rotation: 'çok', italic: 'evet', shadow: 1 }) as unknown as Record<string, unknown>;
    for (const key of ['fontFamily', 'align', 'strokeColor', 'opacity', 'rotation', 'italic', 'shadow']) expect(key in el).toBe(false);
  });
});
