export const COVER_VIDEO_EXT = ['mp4', 'm4v', 'mov'] as const;
export const COVER_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp'] as const;

const extOf = (path: string) => path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;
export const isCoverVideo = (path: string) => (COVER_VIDEO_EXT as readonly string[]).includes(extOf(path));
export const isCoverImage = (path: string) => (COVER_IMAGE_EXT as readonly string[]).includes(extOf(path));

/** Kaydet penceresinde önerilen ad: `Klip.mp4` → `Klip_kapakli.mp4` (uzantı korunur, Rust tarafı aynı uzantıyı ister). */
export function coverOutputName(videoPath: string): string {
  const name = fileNameOf(videoPath);
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '.mp4';
  return `${base}_kapakli${ext}`;
}

/** Teknik hata metnini sade bir cümleye çevirir; özgün metin kısaltılarak sonda kalır. */
export function friendlyCoverError(raw: string): string {
  const short = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  if (/zaten var|üzerine yazılmaz|mevcut dosya/i.test(raw)) return 'Bu adla bir dosya zaten var. Başka bir ad seç; mevcut dosyalar silinmez veya değiştirilmez.';
  if (/video akışı yok/i.test(raw)) return 'Bu dosyada görüntü yok, yalnızca ses var. Kapak bir videoya eklenir.';
  if (/FFmpeg başlatılamadı|FFprobe başlatılamadı/i.test(raw)) return 'Video aracı (FFmpeg) çalıştırılamadı. Programı yeniden kurmayı dene.';
  return short;
}
