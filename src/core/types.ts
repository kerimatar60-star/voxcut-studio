import type { AudioMixState } from './audioMixModel';
import type { TimelineState } from './timelineModel';

export type Workspace = 'design' | 'video' | 'audio' | 'subtitles' | 'cover';
export type AssetKind = 'image' | 'video' | 'audio';

export type MediaAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  size: number;
  addedAt: number;
  /** Masaüstünde seçilen dosyanın tam yolu; tarayıcı modunda yoktur. */
  path?: string;
  /** Hızlı parmak izi (boyut + SHA-256); yeniden bağlamada kullanılır. */
  fingerprint?: string;
  // File bytes are intentionally NOT persisted inside JSON projects.
};

export type DesignElement = {
  id: string;
  kind: 'text' | 'rectangle' | 'ellipse' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  background: string;
  fontSize: number;
  weight: number;
  /** Aşağıdakiler isteğe bağlıdır; eski projelerde yoktur (varsayılanlar: Arial, sola hizalı, gölgesiz/konturSuz, tam opak, dönmesiz). */
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  shadow?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  rotation?: number;
  /** Yalnız görsel katmanı: medya kütüphanesindeki görsel varlığın kimliği ve kutuya sığdırma biçimi (varsayılan 'contain'). */
  assetId?: string;
  fit?: 'contain' | 'cover';
};

export type SubtitleCue = { id: string; start: number; end: number; text: string };
export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  design: { width: number; height: number; background: string; elements: DesignElement[] };
  assets: MediaAsset[];
  subtitles: SubtitleCue[];
  /** Yalnız dosya yolları + kanal ayarları; eski projelerde yoktur. */
  audioMix?: AudioMixState;
  /** Video zaman çizelgesi (yalnız kesit ayarları + dosya yolları); eski projelerde yoktur. */
  timeline?: TimelineState;
};

/** Proje değişikliklerinin tek giriş noktası; updatedAt otomatik güncellenir. */
export type UpdateProject = (fn: (p: ProjectDocument) => ProjectDocument) => void;
