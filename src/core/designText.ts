/** Yazı aileleri: yalnız Windows'ta hazır gelen sistem yazı tipleri (uygulamaya yazı tipi dosyası gömülmez, lisans sorunu yok). Altyazı yakma ve proje dosyası ayrıştırıcısı kullanır. */
export const FONT_FAMILIES = ['Arial', 'Segoe UI', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Impact', 'Courier New'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const DEFAULT_FONT: FontFamily = 'Arial';

export const isFontFamily = (v: unknown): v is FontFamily => typeof v === 'string' && (FONT_FAMILIES as readonly string[]).includes(v);
