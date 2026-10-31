import type { AudioMixState } from './audioMixModel';

export type Workspace = 'design' | 'video' | 'audio' | 'subtitles';
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
  kind: 'text' | 'rectangle' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  background: string;
  fontSize: number;
  weight: number;
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
};

/** Proje değişikliklerinin tek giriş noktası; updatedAt otomatik güncellenir. */
export type UpdateProject = (fn: (p: ProjectDocument) => ProjectDocument) => void;
