import { baseName } from './audioMixModel';
import type { ProjectDocument } from './types';

/** `.voxcut` paketi: paket klasörünün içindeki medya göreli, dışındakiler mutlak yolla saklanır. */
export const isAbsolutePath = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
const normalize = (p: string) => p.replace(/\\/g, '/');
const safeParts = (parts: string[]) => parts.length > 0 && parts.every(s => s !== '' && s !== '.' && s !== '..' && !s.includes(':'));

/** Mutlak yol paket klasörünün içindeyse pakete göreli (ileri eğik çizgili) yola çevirir; aksi hâlde olduğu gibi bırakır. */
export function toPortablePath(path: string, packageDir: string): string {
  if (!isAbsolutePath(path)) return path;
  const base = normalize(packageDir).replace(/\/+$/, '');
  const full = normalize(path);
  if (!full.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return path;
  const rel = full.slice(base.length + 1).split('/');
  return safeParts(rel) ? rel.join('/') : path;
}

/**
 * Göreli yolu paket klasörüne göre mutlak yapar. Üst klasöre çıkan (`..`), boş parçalı veya sürücü içeren göreli yollar
 * güvenli değildir: olduğu gibi (göreli) bırakılır, böylece dosya "bulunamadı" olarak işaretlenir ve paket dışına erişilmez.
 */
export function resolvePortablePath(path: string, packageDir: string): string {
  if (isAbsolutePath(path)) return path;
  const parts = normalize(path).split('/');
  if (!safeParts(parts)) return path;
  const sep = packageDir.includes('\\') ? '\\' : '/';
  return packageDir.replace(/[\\/]+$/, '') + sep + parts.join(sep);
}

/** Projedeki tüm medya yollarına (kütüphane + ses miksi) bir dönüşüm uygular. */
export function mapProjectPaths(doc: ProjectDocument, fn: (path: string) => string): ProjectDocument {
  const mix = doc.audioMix;
  return {
    ...doc,
    assets: doc.assets.map(a => (a.path ? { ...a, path: fn(a.path) } : a)),
    ...(mix ? { audioMix: { ...mix, videoPath: mix.videoPath ? fn(mix.videoPath) : mix.videoPath, tracks: mix.tracks.map(t => ({ ...t, path: fn(t.path) })) } } : {}),
  };
}
/** Projedeki tüm medya yolları (kütüphane + ses miksi), tekrarlar dahil. */
export function projectMediaPaths(doc: ProjectDocument): string[] {
  const out: string[] = [];
  mapProjectPaths(doc, p => { out.push(p); return p; });
  return out;
}
export const toPortableProject =(doc: ProjectDocument, packageDir: string) => mapProjectPaths(doc, p => toPortablePath(p, packageDir));
export const fromPortableProject = (doc: ProjectDocument, packageDir: string) => mapProjectPaths(doc, p => resolvePortablePath(p, packageDir));

export type ManifestMedia = { role: 'asset' | 'mix-video' | 'mix-track'; name: string; path: string; portable: boolean; size?: number; fingerprint?: string };
export type PackageManifest = { format: 'voxcut-package'; formatVersion: 1; app: string; savedAt: number; projectFile: 'project.json'; name: string; media: ManifestMedia[] };

/** Bilgilendirici manifest: hangi medya, nerede, taşınabilir mi (göreli) ve parmak izi. `stored` paketin içine yazılacak (göreli yollu) proje olmalı. */
export function buildManifest(stored: ProjectDocument, savedAt: number): PackageManifest {
  const media: ManifestMedia[] = [];
  for (const a of stored.assets) if (a.path) media.push({ role: 'asset', name: a.name, path: a.path, portable: !isAbsolutePath(a.path), size: a.size || undefined, fingerprint: a.fingerprint });
  const mix = stored.audioMix;
  if (mix?.videoPath) media.push({ role: 'mix-video', name: baseName(mix.videoPath), path: mix.videoPath, portable: !isAbsolutePath(mix.videoPath), size: mix.videoSize, fingerprint: mix.videoFingerprint });
  for (const t of mix?.tracks ?? []) media.push({ role: 'mix-track', name: baseName(t.path), path: t.path, portable: !isAbsolutePath(t.path), size: t.size, fingerprint: t.fingerprint });
  return { format: 'voxcut-package', formatVersion: 1, app: 'VoxCut Studio', savedAt, projectFile: 'project.json', name: stored.name, media };
}
