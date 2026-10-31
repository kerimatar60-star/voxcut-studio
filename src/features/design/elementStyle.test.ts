import { describe, expect, it } from 'vitest';
import { TEXT_TOP_BLEED } from '../../core/designText';
import type { DesignElement } from '../../core/types';
import { elementStyle } from './elementStyle';

const base = { x: 0, y: 0, width: 50, height: 20, text: 'ÖZELLİK', color: '#fff', background: 'transparent', fontSize: 100, weight: 900 };

describe('metin kutusu üst payı (Ö, İ, Ü noktaları kırpılmasın)', () => {
  it('pay pozitif ve yazı boyutundan küçüktür', () => {
    expect(TEXT_TOP_BLEED).toBeGreaterThan(0);
    expect(TEXT_TOP_BLEED).toBeLessThan(1);
  });

  it('metin katmanı yalnız üstte pay bırakır, diğer kenarlarda kutuya kırpar', () => {
    const style = elementStyle({ ...base, kind: 'text' } as Omit<DesignElement, 'id'>, { width: 1280 });
    expect(style.overflow).toBe('visible');
    expect(style.clipPath).toBe(`inset(-${TEXT_TOP_BLEED}em 0 0 0)`);
  });

  it('şekil katmanlarına kırpma yolu eklenmez', () => {
    const style = elementStyle({ ...base, kind: 'rectangle', text: '' } as Omit<DesignElement, 'id'>, { width: 1280 });
    expect(style.clipPath).toBeUndefined();
  });
});
