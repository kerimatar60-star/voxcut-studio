/** Dalga formu çizimi için saf yardımcılar (Rust `waveform_peaks` çıktısı: 0..1 tepe değerleri). */

/** Tepe dizisini `count` çubuğa indirger (her çubuk kapsadığı kovaların en yükseği); boş girdi sıfırlardan oluşur. */
export function peaksToBars(peaks: number[], count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const bars = new Array<number>(n).fill(0);
  if (!peaks.length) return bars;
  for (let i = 0; i < peaks.length; i++) {
    const slot = Math.min(n - 1, Math.floor((i / peaks.length) * n));
    const v = Number.isFinite(peaks[i]) ? Math.min(1, Math.max(0, peaks[i])) : 0;
    if (v > bars[slot]) bars[slot] = v;
  }
  return bars;
}

/** Kullanılan kesiti (saniye) kaynak süresine göre 0..1 oranlarına çevirir; geçersiz/sıfır sürede tüm dalga seçili sayılır. */
export function selectionFractions(start: number, end: number, duration: number): { from: number; to: number } {
  if (!(duration > 0) || !Number.isFinite(start) || !Number.isFinite(end)) return { from: 0, to: 1 };
  const from = Math.min(1, Math.max(0, start / duration));
  const to = Math.min(1, Math.max(from, end / duration));
  return { from, to };
}
