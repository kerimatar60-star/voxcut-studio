import type { DesignElement, ProjectDocument } from './types';

type Design = ProjectDocument['design'];

export const MIN_CANVAS = 64;
export const MAX_CANVAS = 8192;

export const DESIGN_PRESETS = [
  { id: 'youtube', label: 'YouTube kapak · 1280×720', width: 1280, height: 720 },
  { id: 'shorts', label: 'Shorts / Reels · 1080×1920', width: 1080, height: 1920 },
  { id: 'square', label: 'Instagram gönderi · 1080×1080', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Instagram dikey · 1080×1350', width: 1080, height: 1350 },
  { id: 'profile', label: 'Profil · 800×800', width: 800, height: 800 },
  { id: 'banner', label: 'Afiş · 1500×500', width: 1500, height: 500 },
] as const;

/** Verilen boyuta uyan hazır ayarın kimliği; yoksa 'custom'. */
export const presetIdFor = (width: number, height: number): string => DESIGN_PRESETS.find(p => p.width === width && p.height === height)?.id ?? 'custom';

const clampSize = (n: number) => Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(Number.isFinite(n) ? n : MIN_CANVAS)));

/**
 * Tuval boyutunu değiştirir. Katman konum/ölçüleri yüzde olduğu için orantılı kalır; yazı boyutları (tuval pikseli cinsindendir)
 * genişlik oranında ölçeklenir, böylece görünüm bozulmaz.
 */
export function resizeCanvas(design: Design, width: number, height: number): Design {
  const w = clampSize(width), h = clampSize(height);
  const ratio = w / design.width;
  const elements: DesignElement[] = design.elements.map(e => ({ ...e, fontSize: Math.min(500, Math.max(8, Math.round(e.fontSize * ratio))) }));
  return { ...design, width: w, height: h, elements };
}

export type LayerMove = 'up' | 'down' | 'front' | 'back';

/** Katman sırasını değiştirir (listenin sonu en üsttür). Taşınamıyorsa aynı diziyi döndürür. */
export function moveLayer<T extends { id: string }>(elements: T[], id: string, move: LayerMove): T[] {
  const from = elements.findIndex(e => e.id === id);
  if (from < 0) return elements;
  const to = move === 'up' ? from + 1 : move === 'down' ? from - 1 : move === 'front' ? elements.length - 1 : 0;
  if (to < 0 || to >= elements.length || to === from) return elements;
  const copy = elements.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Katmanı hemen üstüne, biraz kaydırarak çoğaltır; yeni kimliği de döndürür. */
export function duplicateLayer(elements: DesignElement[], id: string, newId: string): { elements: DesignElement[]; id: string | null } {
  const index = elements.findIndex(e => e.id === id);
  if (index < 0) return { elements, id: null };
  const source = elements[index];
  const copy: DesignElement = { ...source, id: newId, x: Math.min(99, source.x + 3), y: Math.min(99, source.y + 3) };
  const next = elements.slice();
  next.splice(index + 1, 0, copy);
  return { elements: next, id: newId };
}
