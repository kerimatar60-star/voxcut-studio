/** Katmanlarda kullanılabilen yazı aileleri: yalnız Windows'ta hazır gelen sistem yazı tipleri (uygulamaya yazı tipi dosyası gömülmez, lisans sorunu yok). */
export const FONT_FAMILIES = ['Arial', 'Segoe UI', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Impact', 'Courier New'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const DEFAULT_FONT: FontFamily = 'Arial';
export const LINE_HEIGHT = 1.13;
/** Metin kutusunun üstünde (yazı boyutunun katı olarak) görünür kalan pay: Ö, İ, Ü gibi büyük harflerin noktaları satır kutusunun üstüne taşar ve kırpılmamalı. */
export const TEXT_TOP_BLEED = 0.3;

export const isFontFamily = (v: unknown): v is FontFamily => typeof v === 'string' && (FONT_FAMILIES as readonly string[]).includes(v);

/** CSS / canvas `font-family` değeri; yedek olarak genel aile eklenir. */
export const fontStack = (family: string | undefined) => {
  const f = isFontFamily(family) ? family : DEFAULT_FONT;
  const generic = f === 'Georgia' || f === 'Times New Roman' ? 'serif' : f === 'Courier New' ? 'monospace' : 'sans-serif';
  return `"${f}", ${generic}`;
};

/**
 * Metni verilen genişliğe göre satırlara böler (önizleme ile dışa aktarma aynı sonucu versin diye ortak).
 * Kelimeler boşluktan, tek başına sığmayan kelimeler karakter karakter bölünür; \n zorunlu satır sonudur.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) { out.push(line); line = ''; }
      if (measure(word) <= maxWidth) { line = word; continue; }
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (chunk && measure(chunk + ch) > maxWidth) { out.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}
