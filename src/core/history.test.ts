import { describe, expect, it } from 'vitest';
import { COALESCE_MS, emptyHistory, MAX_HISTORY, recordChange, redoStep, undoStep } from './history';

describe('history', () => {
  it('boş geçmişte geri al / yinele null döner', () => {
    expect(undoStep(emptyHistory<number>(), 1)).toBeNull();
    expect(redoStep(emptyHistory<number>(), 1)).toBeNull();
  });

  it('geri al ve yinele gidiş-dönüşü durumu korur', () => {
    let h = recordChange(emptyHistory<string>(), 'A', 1000);      // A -> B
    h = recordChange(h, 'B', 5000);                                // B -> C
    const u1 = undoStep(h, 'C')!;
    expect(u1.state).toBe('B');
    const u2 = undoStep(u1.history, 'B')!;
    expect(u2.state).toBe('A');
    expect(undoStep(u2.history, 'A')).toBeNull();
    const r1 = redoStep(u2.history, 'A')!;
    expect(r1.state).toBe('B');
    const r2 = redoStep(r1.history, 'B')!;
    expect(r2.state).toBe('C');
    expect(redoStep(r2.history, 'C')).toBeNull();
  });

  it('kısa aralıktaki art arda değişiklikleri tek adımda birleştirir', () => {
    let h = recordChange(emptyHistory<number>(), 0, 1000);
    h = recordChange(h, 1, 1000 + COALESCE_MS - 1);
    h = recordChange(h, 2, 1000 + 2 * (COALESCE_MS - 1));
    expect(h.past).toEqual([0]);
    expect(undoStep(h, 3)!.state).toBe(0);
  });

  it('uzun aradan sonra yeni adım açar', () => {
    let h = recordChange(emptyHistory<number>(), 0, 1000);
    h = recordChange(h, 1, 1000 + COALESCE_MS + 1);
    expect(h.past).toEqual([0, 1]);
  });

  it('geri aldıktan sonraki yeni değişiklik yinele geçmişini siler ve birleşmez', () => {
    let h = recordChange(emptyHistory<string>(), 'A', 1000);
    const u = undoStep(h, 'B')!;
    h = recordChange(u.history, 'A', 1001);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(['A']);
  });

  it('geçmişi MAX_HISTORY ile sınırlar (en eskisi düşer)', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < MAX_HISTORY + 20; i++) h = recordChange(h, i, i * (COALESCE_MS + 1));
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(20);
    expect(h.past[h.past.length - 1]).toBe(MAX_HISTORY + 19);
  });
});
