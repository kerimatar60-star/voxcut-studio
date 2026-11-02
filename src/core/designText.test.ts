import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT, FONT_FAMILIES, isFontFamily } from './designText';

describe('yazı tipi beyaz listesi', () => {
  it('yalnız listedeki yazı tiplerini kabul eder, CSS enjeksiyonunu reddeder', () => {
    expect(isFontFamily('Arial')).toBe(true);
    expect(isFontFamily('Evil; background:url(x)')).toBe(false);
    expect(isFontFamily(undefined)).toBe(false);
    expect(FONT_FAMILIES).toContain(DEFAULT_FONT);
  });
});
