import { invoke } from '@tauri-apps/api/core';
import type { ProbeResult } from '../core/audioMixModel';

/** FFprobe ile dosyanın süresini ve ses/video içeriğini okur (Rust `inspect_mix_media`). Hata fırlatmaz; sonuç `ok:false` olur. */
export async function probeMedia(path: string): Promise<ProbeResult> {
  try {
    const [duration, hasAudio, hasVideo] = await invoke<[number, boolean, boolean]>('inspect_mix_media', { path });
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, error: 'Medya süresi geçersiz.' };
    return { ok: true, duration, hasAudio, hasVideo };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export type Print = { size: number; fingerprint: string };
/** Hızlı parmak izi (boyut + baş/son 1 MiB SHA-256); başarısızlık projeyi bozmaz, yalnız yeniden bağlama yardımıdır. */
export async function fingerprintOf(path: string): Promise<Print | null> {
  try { const [size, fingerprint] = await invoke<[number, string]>('file_fingerprint', { path }); return { size, fingerprint }; } catch { return null; }
}
