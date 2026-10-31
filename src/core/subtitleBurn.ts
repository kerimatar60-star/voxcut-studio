import type { SubtitleCue } from './types';
import { cuesToSrt } from './subtitles';

export type BurnPosition = 'bottom' | 'middle' | 'top';
export type BurnColor = 'white' | 'yellow' | 'cyan' | 'green';
/** Kontur kalınlığı seçenekleri (libass birimi; 0 = kontursuz). Kutu modunda kontur yerine yarı saydam arka plan kullanılır. */
export const BURN_OUTLINES = [
  { id: 'none', label: 'Yok', value: 0 },
  { id: 'thin', label: 'İnce', value: 1.5 },
  { id: 'medium', label: 'Orta', value: 3 },
  { id: 'thick', label: 'Kalın', value: 5 },
] as const;

/** Yazı boyutu, video yüksekliğinin yüzdesidir (çözünürlükten bağımsız). */
export const BURN_SIZES = [
  { id: 'small', label: 'Küçük', percent: 4 },
  { id: 'medium', label: 'Orta', percent: 5.5 },
  { id: 'large', label: 'Büyük', percent: 7.5 },
] as const;
export const BURN_POSITIONS: { id: BurnPosition; label: string }[] = [
  { id: 'bottom', label: 'Alt' }, { id: 'middle', label: 'Orta' }, { id: 'top', label: 'Üst' },
];
export const BURN_COLORS: { id: BurnColor; label: string }[] = [{ id: 'white', label: 'Beyaz' }, { id: 'yellow', label: 'Sarı' }, { id: 'cyan', label: 'Turkuaz' }, { id: 'green', label: 'Yeşil' }];

export type BurnPlan = { srt: string; used: number; invalid: number; dropped: number; clipped: number };

/**
 * Videoya yakılacak altyazıları hazırlar. Geçersiz (boş/ters zaman) olanları atar,
 * video süresini aşanları kırpar, tamamen dışında kalanları ayıklar ve sayıları bildirir.
 */
export function planBurn(cues: SubtitleCue[], videoDuration: number): BurnPlan {
  const valid = cues.filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && c.text.trim());
  const invalid = cues.length - valid.length;
  const hasLimit = Number.isFinite(videoDuration) && videoDuration > 0;
  let dropped = 0, clipped = 0;
  const fitted: SubtitleCue[] = [];
  for (const cue of valid) {
    if (hasLimit && cue.start >= videoDuration) { dropped++; continue; }
    if (hasLimit && cue.end > videoDuration) { clipped++; fitted.push({ ...cue, end: videoDuration }); continue; }
    fitted.push(cue);
  }
  return { srt: fitted.length ? cuesToSrt(fitted) : '', used: fitted.length, invalid, dropped, clipped };
}
