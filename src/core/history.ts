/** Projeyi bozmadan geri al / yinele geçmişi. Anlık görüntüler değişmez (immutable) olduğundan yapı paylaşılır. */
export type History<T> = { past: T[]; future: T[]; lastAt: number };

export const MAX_HISTORY = 100;
/** Bu süre içindeki art arda değişiklikler (sürükleme, yazma) tek geri alma adımı sayılır. */
export const COALESCE_MS = 700;

export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [], lastAt: 0 });

/** Bir değişiklikten ÖNCEKİ durumu geçmişe ekler. */
export function recordChange<T>(h: History<T>, before: T, now: number): History<T> {
  const coalesce = h.past.length > 0 && h.future.length === 0 && now - h.lastAt < COALESCE_MS;
  if (coalesce) return { ...h, lastAt: now };
  return { past: [...h.past, before].slice(-MAX_HISTORY), future: [], lastAt: now };
}

export function undoStep<T>(h: History<T>, present: T): { history: History<T>; state: T } | null {
  if (!h.past.length) return null;
  return { state: h.past[h.past.length - 1], history: { past: h.past.slice(0, -1), future: [present, ...h.future], lastAt: 0 } };
}

export function redoStep<T>(h: History<T>, present: T): { history: History<T>; state: T } | null {
  if (!h.future.length) return null;
  return { state: h.future[0], history: { past: [...h.past, present], future: h.future.slice(1), lastAt: 0 } };
}
