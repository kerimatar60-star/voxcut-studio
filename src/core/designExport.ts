import type { DesignElement, ProjectDocument } from './types';
import { fontStack, LINE_HEIGHT, TEXT_TOP_BLEED, wrapText } from './designText';
import { saveExport } from './saveFile';
import { MAX_CANVAS } from './designCanvas';
import { fitRect } from './designGeometry';

export type ExportFormat = 'png' | 'jpeg' | 'webp';
export const EXPORT_FORMATS: { id: ExportFormat; label: string; mime: string; ext: string }[] = [
  { id: 'png', label: 'PNG (kayıpsız)', mime: 'image/png', ext: 'png' },
  { id: 'jpeg', label: 'JPEG (küçük dosya)', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP (küçük dosya)', mime: 'image/webp', ext: 'webp' },
];
export const EXPORT_SCALES = [0.5, 1, 2, 3] as const;
const MAX_PIXELS = 40_000_000;
const QUALITY = 0.92;

/** Ölçekli çıktı boyutu; geçersiz veya aşırı büyükse hata verir (tarayıcı belleğini korur). */
export function exportSize(width: number, height: number, scale: number): { width: number; height: number } {
  const w = Math.round(width * scale), h = Math.round(height * scale);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) throw new Error('Dışa aktarma boyutu geçersiz.');
  if (w > MAX_CANVAS || h > MAX_CANVAS || w * h > MAX_PIXELS) throw new Error(`Çıktı çok büyük (${w}×${h}). Ölçeği küçült; en çok ${MAX_CANVAS} px kenar ve 40 milyon piksel desteklenir.`);
  return { width: w, height: h };
}

/** Proje adından güvenli dosya adı üretir. */
export function designFileName(projectName: string, format: ExportFormat): string {
  const base = projectName.replace(/[^a-zA-Z0-9-_\p{L}]/gu, '_').replace(/^_+|_+$/g, '') || 'tasarim';
  return `${base}.${EXPORT_FORMATS.find(f => f.id === format)?.ext ?? 'png'}`;
}

/** Tek katmanı çizer: dönme (merkez etrafında), opaklık, yazı stili ve kutuya kırpma önizleme (CSS) ile aynı kurallara uyar. */
export type LoadedImages = Record<string, HTMLImageElement>;

function drawElement(ctx: CanvasRenderingContext2D, el: DesignElement, canvasW: number, canvasH: number, images: LoadedImages) {
  const x = el.x / 100 * canvasW, y = el.y / 100 * canvasH, w = el.width / 100 * canvasW, h = el.height / 100 * canvasH;
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  if (el.rotation) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(el.rotation * Math.PI / 180); ctx.translate(-(x + w / 2), -(y + h / 2)); }
  if (el.kind === 'rectangle') { ctx.fillStyle = el.background; ctx.fillRect(x, y, w, h); }
  else if (el.kind === 'ellipse') { ctx.fillStyle = el.background; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.fill(); }
  else if (el.kind === 'image') {
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const img = el.assetId ? images[el.assetId] : undefined;
    if (img) {
      const r = fitRect(img.naturalWidth, img.naturalHeight, w, h, el.fit ?? 'contain');
      ctx.drawImage(img, x + r.x, y + r.y, r.width, r.height);
    } else { ctx.fillStyle = '#3a3d52'; ctx.fillRect(x, y, w, h); } // görsel yüklenemediyse yer tutucu (sahnedeki yer tutucuyla aynı mantık)
  }
  else {
    const size = el.fontSize, align = el.align ?? 'left';
    ctx.beginPath(); ctx.rect(x, y - size * TEXT_TOP_BLEED, w, h + size * TEXT_TOP_BLEED); ctx.clip(); // üstte pay: Ö/İ noktaları kırpılmasın
    ctx.font = `${el.italic ? 'italic ' : ''}${el.weight} ${size}px ${fontStack(el.fontFamily)}`;
    ctx.textBaseline = 'top'; ctx.textAlign = align; ctx.lineJoin = 'round';
    const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    const lines = wrapText(el.text, Math.max(1, w), s => ctx.measureText(s).width);
    const stroke = (el.strokeWidth ?? 0) > 0;
    lines.forEach((line, i) => {
      const ty = y + i * size * LINE_HEIGHT;
      const shadow = () => { if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.05; } };
      const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
      if (stroke) { shadow(); ctx.lineWidth = el.strokeWidth!; ctx.strokeStyle = el.strokeColor ?? '#000000'; ctx.strokeText(line, tx, ty); noShadow(); }
      else shadow();
      ctx.fillStyle = el.color; ctx.fillText(line, tx, ty);
      noShadow();
    });
  }
  ctx.restore();
}

/** Tasarımı verilen ölçekle bir tuvale çizer (tüm koordinatlar mantıksal piksel, çıktı ölçeklenir). */
export function renderDesign(project: ProjectDocument, scale: number, images: LoadedImages = {}): HTMLCanvasElement {
  const { width, height, background, elements } = project.design;
  const size = exportSize(width, height, scale);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tuval oluşturulamadı.');
  ctx.scale(size.width / width, size.height / height);
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  for (const element of elements) drawElement(ctx, element, width, height, images);
  return canvas;
}

/** PNG / JPEG / WebP olarak indirir; kaydedilen dosya adını ve boyutunu döndürür. Tarayıcı biçimi desteklemezse hata verir. */
/** Tasarımdaki görsel katmanlarının kaynaklarını yükler; yüklenemeyenler atlanır (o katman yer tutucu çizilir). */
export async function loadDesignImages(project: ProjectDocument, sources: Record<string, string>): Promise<LoadedImages> {
  const ids = [...new Set(project.design.elements.filter(e => e.kind === 'image' && e.assetId).map(e => e.assetId as string))];
  const loaded: LoadedImages = {};
  await Promise.all(ids.map(async id => {
    const src = sources[id];
    if (!src) return;
    const img = new Image();
    img.src = src;
    try { await img.decode(); if (img.naturalWidth > 0) loaded[id] = img; } catch { /* bozuk görsel: yer tutucu */ }
  }));
  return loaded;
}

export async function exportDesign(project: ProjectDocument, options: { format: ExportFormat; scale: number; imageSources?: Record<string, string> }): Promise<string> {
  const spec = EXPORT_FORMATS.find(f => f.id === options.format) ?? EXPORT_FORMATS[0];
  const images = await loadDesignImages(project, options.imageSources ?? {});
  const canvas = renderDesign(project, options.scale, images);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Dosya oluşturulamadı.')); return; }
      if (blob.type !== spec.mime) { reject(new Error(`${spec.label.split(' ')[0]} biçimi bu ortamda desteklenmiyor; PNG kullan.`)); return; }
      const name = designFileName(project.name, spec.id);
      saveExport(blob, name, spec.label.split(' ')[0]).then(result => {
        resolve(result.saved ? `${result.where === name ? name : result.where} (${canvas.width}×${canvas.height}, ${(blob.size / 1024).toFixed(0)} KB)` : '');
      }, reject);
    }, spec.mime, QUALITY);
  });
}

/** Eski üst çubuk düğmesi için: 1x PNG. */
export const exportDesignPng = (project: ProjectDocument) => exportDesign(project, { format: 'png', scale: 1 });
