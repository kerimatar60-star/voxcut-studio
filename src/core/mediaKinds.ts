import type { AssetKind } from './types';

const KINDS: Record<string, { kind: AssetKind; mimeType: string }> = {
  mp4: { kind: 'video', mimeType: 'video/mp4' }, m4v: { kind: 'video', mimeType: 'video/x-m4v' }, mov: { kind: 'video', mimeType: 'video/quicktime' },
  mkv: { kind: 'video', mimeType: 'video/x-matroska' }, webm: { kind: 'video', mimeType: 'video/webm' }, avi: { kind: 'video', mimeType: 'video/x-msvideo' },
  wav: { kind: 'audio', mimeType: 'audio/wav' }, mp3: { kind: 'audio', mimeType: 'audio/mpeg' }, m4a: { kind: 'audio', mimeType: 'audio/mp4' },
  aac: { kind: 'audio', mimeType: 'audio/aac' }, flac: { kind: 'audio', mimeType: 'audio/flac' }, ogg: { kind: 'audio', mimeType: 'audio/ogg' }, opus: { kind: 'audio', mimeType: 'audio/opus' },
  png: { kind: 'image', mimeType: 'image/png' }, jpg: { kind: 'image', mimeType: 'image/jpeg' }, jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  webp: { kind: 'image', mimeType: 'image/webp' }, gif: { kind: 'image', mimeType: 'image/gif' }, bmp: { kind: 'image', mimeType: 'image/bmp' },
};
export const MEDIA_EXTENSIONS = Object.keys(KINDS);

/** Dosya yolunun uzantısından medya türü ve mime tipi; bilinmeyen uzantıda null. */
export function kindFromPath(path: string): { kind: AssetKind; mimeType: string } | null {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  return KINDS[name.slice(dot + 1).toLowerCase()] ?? null;
}
