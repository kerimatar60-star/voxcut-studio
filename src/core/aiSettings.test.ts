import { describe, expect, it } from 'vitest';
import { aiReady, pickDefaultModel } from './aiSettings';

describe('yapay zekâ ayarları', () => {
  it('bağlantı için anahtar, onay ve model üçü de gerekir', () => {
    const base = { hasKey: true, hint: 'sk-…abcd', consent: true, model: 'gpt-x' };
    expect(aiReady(base)).toBe(true);
    expect(aiReady({ ...base, hasKey: false })).toBe(false);
    expect(aiReady({ ...base, consent: false })).toBe(false);
    expect(aiReady({ ...base, model: '' })).toBe(false);
    expect(aiReady(null)).toBe(false);
  });
  it('varsayılan model: bilinen ucuz modeller, yoksa "mini", yoksa ilk', () => {
    expect(pickDefaultModel(['gpt-4o', 'gpt-4.1-mini', 'gpt-9'])).toBe('gpt-4.1-mini');
    expect(pickDefaultModel(['gpt-9', 'gpt-9-mini'])).toBe('gpt-9-mini');
    expect(pickDefaultModel(['gpt-9', 'gpt-10'])).toBe('gpt-9');
    expect(pickDefaultModel([])).toBe('');
  });
});
