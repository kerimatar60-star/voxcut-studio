import type { ProjectDocument } from './types';
import { saveExport } from './saveFile';
import { MAX_CANVAS } from './designCanvas';

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

/** Tasarımı verilen ölçekle bir tuvale çizer (tüm koordinatlar mantıksal piksel, çıktı ölçeklenir). */
export function renderDesign(project: ProjectDocument, scale: number): HTMLCanvasElement {
  const { width, height, background, elements } = project.design;
  const size = exportSize(width, height, scale);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tuval oluşturulamadı.');
  ctx.scale(size.width / width, size.height / height);
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  for (const element of elements) {
    const x = element.x / 100 * width, y = element.y / 100 * height, w = element.width / 100 * width, h = element.height / 100 * height;
    if (element.kind === 'rectangle') { ctx.fillStyle = element.background; ctx.fillRect(x, y, w, h); }
    else if (element.kind === 'ellipse') { ctx.fillStyle = element.background; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.fillStyle = element.color; ctx.font = `${element.weight} ${element.fontSize}px Arial, sans-serif`;
      ctx.textBaseline = 'top';
      const lines = element.text.split('\n');
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * element.fontSize * 1.12, Math.max(1, w));
    }
  }
  return canvas;
}

/** PNG / JPEG / WebP olarak indirir; kaydedilen dosya adını ve boyutunu döndürür. Tarayıcı biçimi desteklemezse hata verir. */
export function exportDesign(project: ProjectDocument, options: { format: ExportFormat; scale: number }): Promise<string> {
  const spec = EXPORT_FORMATS.find(f => f.id === options.format) ?? EXPORT_FORMATS[0];
  const canvas = renderDesign(project, options.scale);
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
