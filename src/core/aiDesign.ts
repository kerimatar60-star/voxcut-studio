import { DESIGN_PRESETS, MAX_CANVAS, MIN_CANVAS } from './designCanvas';
import { FONT_FAMILIES, isFontFamily } from './designText';
import { newId } from './project';
import type { DesignElement, ProjectDocument } from './types';

type Design = ProjectDocument['design'];

/** "Yazıyla tasarla": ChatGPT'den KAPALI bir şemaya uyan tasarım (metin, dikdörtgen, elips) istenir. Cevap hiçbir zaman olduğu gibi uygulanmaz;
 *  burada her alan doğrulanır, sınırlanır ve yeni kimlikler verilir. Keyfi komut, resim yolu veya dosya erişimi yoktur. */
export const AI_MAX_ELEMENTS = 40;
export const AI_MAX_PROMPT = 1500;
const HEX = /^#[0-9a-fA-F]{6}$/;
const KINDS = ['text', 'rectangle', 'ellipse'] as const;

const elementSchema = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'x', 'y', 'width', 'height', 'text', 'color', 'background', 'fontSize', 'weight', 'fontFamily', 'align', 'italic', 'shadow', 'strokeColor', 'strokeWidth', 'opacity', 'rotation'],
  properties: {
    kind: { type: 'string', enum: [...KINDS] },
    x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
    text: { type: 'string' }, color: { type: 'string' }, background: { type: 'string' },
    fontSize: { type: 'number' }, weight: { type: 'integer' },
    fontFamily: { type: 'string', enum: [...FONT_FAMILIES] },
    align: { type: 'string', enum: ['left', 'center', 'right'] },
    italic: { type: 'boolean' }, shadow: { type: 'boolean' },
    strokeColor: { type: 'string' }, strokeWidth: { type: 'number' }, opacity: { type: 'number' }, rotation: { type: 'number' },
  },
};

/** OpenAI "structured outputs" şeması (hepsi zorunlu, ek alan yok). */
export const AI_DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['width', 'height', 'background', 'elements'],
  properties: { width: { type: 'integer' }, height: { type: 'integer' }, background: { type: 'string' }, elements: { type: 'array', items: elementSchema } },
};

const SYSTEM = `Sen bir grafik tasarımcısın. Kullanıcının isteğine göre TEK bir tasarımı JSON olarak döndür.
Kurallar:
- Tuval piksel cinsindendir (width, height). Katmanların x, y, width, height değerleri tuvalin YÜZDESİDİR (0-100).
- Katman türleri: "text" (yazı), "rectangle" (dikdörtgen), "ellipse" (elips). Resim yoktur.
- Katmanlar alttan üste doğru sıralanır: önce arka plan şekilleri, en son yazılar.
- Renkler 6 haneli hex olmalı (örn. #3c3489). "color" yazı rengi, "background" şeklin dolgu rengidir; yazıda "background" önemsizdir (#000000 yaz).
- fontSize tuval pikselidir (1280 genişlikli tuvalde başlık için 60-120, alt yazı için 24-40).
- weight 400 veya 700 veya 900. fontFamily yalnızca şemadaki listeden. Türkçe karakterleri (ğ, ü, ş, ı, ö, ç, İ) aynen koru.
- Yazılar kutuya sığmalı: uzun başlıklarda fontSize küçült veya kutuyu büyüt; kontrastı yüksek tut.
- strokeWidth 0, opacity 1, rotation 0 varsayılandır; gerekmedikçe değiştirme.
- Yalnızca istenen içeriği yaz; uydurma marka, logo veya telifli içerik ekleme.`;

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Yeni tasarım isteği: kullanıcı metni + (varsa) boyut. */
export function newDesignMessages(prompt: string, size?: { width: number; height: number }): AiMessage[] {
  const sizeLine = size ? `Tuval boyutu: ${size.width}x${size.height} piksel (bunu kullan).` : 'Tuval boyutunu isteğe göre seç (YouTube kapağı 1280x720, Shorts 1080x1920, Instagram gönderi 1080x1080, afiş 1500x500, profil 800x800).';
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${sizeLine}\nİstek: ${prompt.trim().slice(0, AI_MAX_PROMPT)}` }];
}

/** Mevcut tasarımı yazıyla değiştirme isteği: tasarım JSON'u ve yapılacak değişiklik gönderilir, tam yeni tasarım beklenir. */
export function editDesignMessages(design: Design, instruction: string): AiMessage[] {
  const current = JSON.stringify({ width: design.width, height: design.height, background: design.background, elements: design.elements.filter(e => e.kind !== 'image').map(({ id: _id, assetId: _a, fit: _f, ...rest }) => rest) });
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Mevcut tasarım:\n${current}\n\nDeğişiklik isteği: ${instruction.trim().slice(0, AI_MAX_PROMPT)}\nTasarımın tamamını, isteğe göre güncellenmiş hâliyle döndür; istenmeyen her şeyi aynen koru.` }];
}

const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);

/** Model çıktısının JSON metnini bulur (kod çiti veya ek açıklama varsa ayıklar). */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* kod çiti veya fazladan metin olabilir */ }
  const start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* aşağıda hata verilir */ } }
  throw new Error('Yapay zekânın cevabı tasarıma çevrilemedi. Tekrar dene.');
}

/** Cevabı güvenli bir tasarıma çevirir. `fallbackSize`: cevaptaki boyut geçersizse kullanılacak boyut. */
export function normalizeAiDesign(text: string, fallbackSize: { width: number; height: number } = { width: DESIGN_PRESETS[0].width, height: DESIGN_PRESETS[0].height }): Design {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { elements?: unknown }).elements)) throw new Error('Yapay zekânın cevabı tasarıma çevrilemedi. Tekrar dene.');
  const r = raw as { width?: unknown; height?: unknown; background?: unknown; elements: unknown[] };
  const width = Math.round(num(r.width, MIN_CANVAS, MAX_CANVAS, fallbackSize.width));
  const height = Math.round(num(r.height, MIN_CANVAS, MAX_CANVAS, fallbackSize.height));
  const elements: DesignElement[] = [];
  for (const item of r.elements.slice(0, AI_MAX_ELEMENTS)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const kind = (KINDS as readonly string[]).includes(String(e.kind)) ? (e.kind as DesignElement['kind']) : null;
    if (!kind) continue;
    const box = { x: num(e.x, -50, 150, 10), y: num(e.y, -50, 150, 10), width: num(e.width, 1, 200, 30), height: num(e.height, 1, 200, 20) };
    const weight = [400, 700, 900].reduce((best, w) => (Math.abs(w - num(e.weight, 100, 900, 700)) < Math.abs(best - num(e.weight, 100, 900, 700)) ? w : best), 700);
    const opacity = num(e.opacity, 0.05, 1, 1), rotation = num(e.rotation, -360, 360, 0), strokeWidth = num(e.strokeWidth, 0, 40, 0);
    const el: DesignElement = {
      id: newId(), kind, ...box,
      text: kind === 'text' ? String(e.text ?? '').slice(0, 600) : '',
      color: hex(e.color, '#ffffff'), background: hex(e.background, '#7355e9'),
      fontSize: Math.round(num(e.fontSize, 8, 600, 48)), weight,
      ...(isFontFamily(e.fontFamily) ? { fontFamily: e.fontFamily } : {}),
      ...(e.align === 'center' || e.align === 'right' ? { align: e.align } : {}),
      ...(e.italic === true ? { italic: true } : {}),
      ...(e.shadow === true ? { shadow: true } : {}),
      ...(strokeWidth > 0 ? { strokeWidth, strokeColor: hex(e.strokeColor, '#000000') } : {}),
      ...(opacity < 1 ? { opacity } : {}),
      ...(rotation !== 0 ? { rotation } : {}),
    };
    elements.push(el);
  }
  if (elements.length === 0) throw new Error('Yapay zekâ boş bir tasarım döndürdü. İsteğini biraz daha ayrıntılı yazıp tekrar dene.');
  return { width, height, background: hex(r.background, '#1b1b2f'), elements };
}

/** Birden fazla cevaptan geçerli olanları tasarıma çevirir; hiçbiri geçerli değilse ilk hatayı verir. */
export function normalizeAiDesigns(texts: string[], fallbackSize?: { width: number; height: number }): Design[] {
  const ok: Design[] = [];
  let firstError: Error | null = null;
  for (const t of texts) {
    try { ok.push(normalizeAiDesign(t, fallbackSize)); } catch (e) { firstError ??= e instanceof Error ? e : new Error(String(e)); }
  }
  if (ok.length === 0) throw firstError ?? new Error('Yapay zekâ cevap vermedi.');
  return ok;
}
