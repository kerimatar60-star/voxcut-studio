import type { DesignElement } from './types';

/** Özgün şablonlar: yalnız şekil ve metinden oluşur (marka, görsel veya yazı tipi dosyası içermez; telif/lisans sorunu yok). */
export type TemplateElement = Omit<DesignElement, 'id'>;
export type DesignTemplate = { id: string; name: string; category: string; width: number; height: number; background: string; elements: TemplateElement[] };

const text = (t: string, x: number, y: number, w: number, h: number, size: number, color: string, o: Partial<DesignElement> = {}): TemplateElement =>
  ({ kind: 'text', x, y, width: w, height: h, text: t, color, background: 'transparent', fontSize: size, weight: 800, ...o });
const rect = (x: number, y: number, w: number, h: number, fill: string, o: Partial<DesignElement> = {}): TemplateElement =>
  ({ kind: 'rectangle', x, y, width: w, height: h, text: '', color: '#ffffff', background: fill, fontSize: 32, weight: 600, ...o });
const oval = (x: number, y: number, w: number, h: number, fill: string, o: Partial<DesignElement> = {}): TemplateElement =>
  ({ kind: 'ellipse', x, y, width: w, height: h, text: '', color: '#ffffff', background: fill, fontSize: 32, weight: 600, ...o });

const C = { align: 'center' as const };

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  { id: 'yt-baslik', name: 'Büyük başlık', category: 'YouTube kapak', width: 1280, height: 720, background: '#14122b', elements: [
    oval(66, 10, 44, 78, '#ff5c8a', { opacity: 0.92 }), rect(6, 14, 12, 2.2, '#ffd166'),
    text('BAŞLIĞINI\nBURAYA YAZ', 6, 22, 70, 46, 120, '#ffffff', { weight: 900, shadow: true, fontFamily: 'Impact' }),
    text('Alt başlık veya kanal adı', 6, 74, 60, 10, 38, '#ffd166', { weight: 700 }),
  ] },
  { id: 'yt-karsilastirma', name: 'Karşılaştırma', category: 'YouTube kapak', width: 1280, height: 720, background: '#0f172a', elements: [
    rect(0, 0, 50, 100, '#1d4ed8'), rect(50, 0, 50, 100, '#be123c'),
    text('SEÇENEK A', 4, 68, 42, 14, 70, '#ffffff', { ...C, weight: 900, shadow: true }),
    text('SEÇENEK B', 54, 68, 42, 14, 70, '#ffffff', { ...C, weight: 900, shadow: true }),
    oval(42.5, 33, 15, 26.7, '#ffffff'), text('VS', 42.5, 39, 15, 17, 84, '#0f172a', { ...C, weight: 900 }),
  ] },
  { id: 'yt-liste', name: 'İlk 5 listesi', category: 'YouTube kapak', width: 1280, height: 720, background: '#052e2b', elements: [
    text('5', 4, 8, 24, 72, 370, '#2dd4bf', { ...C, weight: 900, opacity: 0.95 }),
    rect(32, 20, 8, 1.8, '#facc15'),
    text('EN İYİ 5', 32, 25, 64, 26, 110, '#ffffff', { weight: 900, shadow: true }),
    text('Ayrıntılar videoda', 32, 56, 60, 10, 46, '#99f6e4', { weight: 600 }),
  ] },
  { id: 'yt-egitim', name: 'Adım adım rehber', category: 'YouTube kapak', width: 1280, height: 720, background: '#fff7ed', elements: [
    rect(0, 0, 3.5, 100, '#f97316'),
    text('ADIM ADIM\nREHBER', 8, 18, 84, 40, 104, '#7c2d12', { weight: 900 }),
    rect(8, 66, 20, 11, '#f97316'), text('YENİ SERİ', 8, 69, 20, 6, 36, '#ffffff', { ...C, weight: 800 }),
    text('Sıfırdan ileri seviyeye', 32, 68, 60, 8, 38, '#9a3412', { weight: 600 }),
  ] },
  { id: 'shorts-baslik', name: 'Başlık kartı', category: 'Shorts / Reels', width: 1080, height: 1920, background: '#1e1b4b', elements: [
    oval(-20, -8, 90, 50, '#7c3aed', { opacity: 0.55 }), oval(40, 62, 80, 44, '#a78bfa', { opacity: 0.35 }),
    text('BUGÜN\nÖĞRENDİM', 5, 30, 90, 26, 136, '#ffffff', { ...C, weight: 900, shadow: true }),
    text('Kısa ve net bir ipucu', 8, 60, 84, 8, 56, '#c4b5fd', { ...C, weight: 600 }),
    rect(30, 90, 40, 1.2, '#a78bfa'),
  ] },
  { id: 'shorts-alinti', name: 'Alıntı', category: 'Shorts / Reels', width: 1080, height: 1920, background: '#fef3c7', elements: [
    text('“', 8, 8, 30, 26, 400, '#f59e0b', { weight: 900 }),
    text('Küçük adımlar,\nbüyük yolların\nbaşlangıcıdır.', 8, 36, 84, 30, 92, '#78350f', { weight: 800 }),
    rect(8, 69, 14, 0.8, '#f59e0b'), text('— Yazar Adı', 8, 72, 84, 6, 52, '#92400e', { weight: 600, italic: true }),
  ] },
  { id: 'ig-alinti', name: 'Kare alıntı', category: 'Instagram gönderi', width: 1080, height: 1080, background: '#0b3d2e', elements: [
    oval(70, -12, 40, 40, '#10b981', { opacity: 0.5 }),
    text('“', 8, 3, 20, 36, 300, '#6ee7b7', { weight: 900 }),
    text('Her gün biraz daha\nileriye gitmek yeter.', 8, 40, 84, 32, 76, '#ecfdf5', { weight: 800 }),
    text('— Yazar Adı', 8, 74, 84, 8, 46, '#6ee7b7', { weight: 600, italic: true }),
  ] },
  { id: 'ig-duyuru', name: 'Duyuru', category: 'Instagram gönderi', width: 1080, height: 1080, background: '#ffffff', elements: [
    rect(0, 0, 100, 24, '#2563eb'), text('DUYURU', 6, 5, 88, 14, 120, '#ffffff', { ...C, weight: 900 }),
    text('Önemli bilgi burada\nyer alır.', 8, 34, 84, 26, 72, '#0f172a', { weight: 800 }),
    text('Tarih • Saat • Yer', 8, 66, 84, 8, 52, '#2563eb', { weight: 700 }),
    rect(8, 80, 30, 1.2, '#2563eb'),
  ] },
  { id: 'ig-kampanya', name: 'İndirim', category: 'Instagram gönderi', width: 1080, height: 1080, background: '#be123c', elements: [
    oval(55, 55, 60, 60, '#fb7185', { opacity: 0.5 }),
    text('%50', 4, 8, 92, 48, 380, '#ffffff', { ...C, weight: 900, shadow: true, fontFamily: 'Impact' }),
    text('İNDİRİM', 4, 57, 92, 17, 130, '#fde68a', { ...C, weight: 900 }),
    text('Sadece bu hafta sonu', 4, 78, 92, 8, 54, '#ffe4e6', { ...C, weight: 600 }),
  ] },
  { id: 'ig-etkinlik', name: 'Etkinlik afişi', category: 'Instagram dikey', width: 1080, height: 1350, background: '#0f172a', elements: [
    rect(0, 0, 100, 3, '#fbbf24'), oval(55, 50, 70, 56, '#f59e0b', { opacity: 0.22 }),
    text('CANLI\nKONSER', 8, 11, 84, 34, 190, '#fbbf24', { weight: 900, fontFamily: 'Impact', shadow: true }),
    text('12 EKİM • 21:00', 8, 48, 84, 8, 76, '#ffffff', { weight: 800 }),
    text('Sahne Adı, Şehir\nBilet bilgisi için bağlantı profilde', 8, 62, 84, 14, 50, '#cbd5e1', { weight: 500 }),
    rect(8, 90, 30, 1, '#fbbf24'),
  ] },
  { id: 'profil-rozet', name: 'Logo rozeti', category: 'Profil', width: 800, height: 800, background: '#4c1d95', elements: [
    oval(8, 8, 84, 84, '#ede9fe'), oval(14, 14, 72, 72, '#7c3aed'),
    text('V', 14, 18, 72, 66, 390, '#ffffff', { ...C, weight: 900, shadow: true }),
  ] },
  { id: 'banner-kanal', name: 'Kanal başlığı', category: 'Afiş', width: 1500, height: 500, background: '#111827', elements: [
    oval(70, -40, 50, 150, '#6366f1', { opacity: 0.55 }), oval(84, 40, 30, 90, '#ec4899', { opacity: 0.5 }),
    text('KANAL ADI', 6, 22, 60, 38, 120, '#ffffff', { weight: 900, shadow: true }),
    text('Her hafta yeni içerik', 6, 66, 60, 16, 52, '#9ca3af', { weight: 600 }),
  ] },
  { id: 'banner-slogan', name: 'Slogan afişi', category: 'Afiş', width: 1500, height: 500, background: '#ecfeff', elements: [
    rect(80, 0, 20, 100, '#06b6d4'), oval(70, 20, 22, 66, '#155e75', { opacity: 0.85 }),
    text('Fikirlerini\nhayata geçir.', 6, 14, 66, 72, 120, '#155e75', { weight: 900 }),
  ] },
];

export const templateById = (id: string) => DESIGN_TEMPLATES.find(t => t.id === id);

/** Şablondan yeni tasarım üretir; her katmana verilen üreteçten yeni kimlik atanır. */
export function instantiateTemplate(template: DesignTemplate, newId: () => string) {
  return {
    width: template.width, height: template.height, background: template.background,
    elements: template.elements.map(e => ({ ...e, id: newId() }) as DesignElement),
  };
}
