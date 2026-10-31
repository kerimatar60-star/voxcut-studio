export type MixTrack = { id: string; path: string; gain: number; pan: number; start: number; sourceIn: number; length: number; fadeIn: number; fadeOut: number; mute: boolean; solo: boolean; sourceDuration: number; size?: number; fingerprint?: string };

/** Projeyle kaydedilen miks durumu. Yalnız dosya yolları ve ayarlar; medya baytları asla tutulmaz. */
export type AudioMixState = { videoPath: string; videoDuration: number; hasOriginal: boolean; gain: number; mute: boolean; solo: boolean; tracks: MixTrack[]; videoSize?: number; videoFingerprint?: string; format?: MixFormat; ducking?: number };
export type ProbeResult = { ok: true; duration: number; hasAudio: boolean; hasVideo: boolean } | { ok: false; error: string };

export const MAX_MIX_TRACKS = 8;

/** Miks çıktı biçimleri (Rust `mix_video_audio` ile aynı adlar). `mp4` varsayılandır ve kaydedilmez. */
export const MIX_FORMATS = [
  { id: 'mp4', label: 'Ses miksli MP4', ext: 'mp4', filter: 'MP4 video' },
  { id: 'wav', label: 'WAV (16 bit)', ext: 'wav', filter: 'WAV ses' },
  { id: 'wav24', label: 'WAV (24 bit)', ext: 'wav', filter: 'WAV ses' },
  { id: 'mp3', label: 'MP3 (192 kbps)', ext: 'mp3', filter: 'MP3 ses' },
  { id: 'flac', label: 'FLAC (kayıpsız)', ext: 'flac', filter: 'FLAC ses' },
] as const;
export type MixFormat = (typeof MIX_FORMATS)[number]['id'];
export const mixFormatSpec = (id: MixFormat | undefined) => MIX_FORMATS.find(f => f.id === id) ?? MIX_FORMATS[0];
export const emptyAudioMix = (): AudioMixState => ({ videoPath: '', videoDuration: 0, hasOriginal: true, gain: 1, mute: false, solo: false, tracks: [] });
export const baseName = (path: string) => path.split(/[\\/]/).pop() || 'Seçilmedi';

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
/** Medya parmak izi (boyut + SHA-256). Yalnız ikisi birlikte ve geçerliyse saklanır; aksi hâlde sessizce atılır. */
export const printOf = (size: unknown, fingerprint: unknown): { size?: number; fingerprint?: string } => {
  const s = typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= Number.MAX_SAFE_INTEGER ? Math.floor(size) : undefined;
  const f = typeof fingerprint === 'string' && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : undefined;
  return s !== undefined && f !== undefined ? { size: s, fingerprint: f } : {};
};
/** Kayıtlı parmak izi varsa ve gerçek dosyadan farklıysa true (kayıt yoksa false: karşılaştırılacak bir şey yok). */
export const printChanged = (stored: { size?: number; fingerprint?: string }, actual: { size: number; fingerprint: string }) =>
  stored.fingerprint !== undefined && (stored.fingerprint !== actual.fingerprint || stored.size !== actual.size);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\0/g, '').slice(0, max);

/** Proje JSON'undaki ses miksini güvenle okur. Alan yoksa (eski proje) undefined döner. */
export function parseAudioMix(input: unknown): AudioMixState | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Ses miksi verisi geçersiz.');
  const v = input as Record<string, unknown>;
  const rawTracks = v.tracks ?? [];
  if (!Array.isArray(rawTracks) || rawTracks.length > MAX_MIX_TRACKS) throw new Error('Ses miksi en fazla 8 ek kanal içerebilir.');
  const tracks: MixTrack[] = rawTracks.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('Ses kanalı kaydı geçersiz.');
    const t = raw as Record<string, unknown>;
    const path = text(t.path, 1024);
    if (!path) throw new Error('Ses kanalında dosya yolu yok.');
    return {
      id: text(t.id, 120) || crypto.randomUUID(), path,
      gain: num(t.gain, 0.8, 0, 2), pan: num(t.pan, 0, -1, 1), start: num(t.start, 0, 0, 86400), sourceIn: num(t.sourceIn, 0, 0, 86400),
      length: num(t.length, 1, 0.01, 86400), fadeIn: num(t.fadeIn, 0, 0, 86400), fadeOut: num(t.fadeOut, 0, 0, 86400),
      mute: t.mute === true, solo: t.solo === true, sourceDuration: num(t.sourceDuration, 0, 0, 86400),
      ...printOf(t.size, t.fingerprint),
    };
  });
  const videoPrint = printOf(v.videoSize, v.videoFingerprint);
  return {
    videoPath: text(v.videoPath, 1024), videoDuration: num(v.videoDuration, 0, 0, 86400), hasOriginal: v.hasOriginal !== false,
    gain: num(v.gain, 1, 0, 2), mute: v.mute === true, solo: v.solo === true, tracks,
    ...(MIX_FORMATS.some(f => f.id === v.format && f.id !== 'mp4') ? { format: v.format as MixFormat } : {}),
    ...(num(v.ducking, 0, 0, 1) > 0 ? { ducking: num(v.ducking, 0, 0, 1) } : {}),
    ...(videoPrint.fingerprint ? { videoSize: videoPrint.size, videoFingerprint: videoPrint.fingerprint } : {}),
  };
}

/**
 * Projeyi açarken kayıtlı süreye güvenmez: gerçek FFprobe sonuçlarıyla düzeltir.
 * Eksik/okunamayan dosyalar `issues` içinde (anahtar: 'video' veya kanal id) bildirilir; yol silinmez.
 */
export function reconcileMix(mix: AudioMixState, video: ProbeResult | null, probes: ProbeResult[]) {
  const issues: Record<string, string> = {};
  const notes: string[] = [];
  const next: AudioMixState = { ...mix, tracks: mix.tracks.map(t => ({ ...t })) };
  if (mix.videoPath) {
    if (!video || !video.ok) issues.video = `Video bulunamadı veya okunamadı: ${baseName(mix.videoPath)}. Taşınmış ya da silinmiş olabilir.`;
    else if (!video.hasVideo) issues.video = `Bu dosya artık video içermiyor: ${baseName(mix.videoPath)}.`;
    else {
      if (Math.abs(video.duration - mix.videoDuration) > 0.05) notes.push(`Video süresi değişmiş (${mix.videoDuration.toFixed(2)} → ${video.duration.toFixed(2)} sn); gerçek süre kullanıldı.`);
      next.videoDuration = video.duration; next.hasOriginal = video.hasAudio;
    }
  }
  next.tracks.forEach((t, i) => {
    const r = probes[i];
    const label = `Kanal ${i + 1} (${baseName(t.path)})`;
    if (!r || !r.ok) { issues[t.id] = `${label} bulunamadı veya okunamadı. Taşınmış ya da silinmiş olabilir.`; return; }
    if (!r.hasAudio) { issues[t.id] = `${label} artık ses içermiyor.`; return; }
    if (Math.abs(r.duration - t.sourceDuration) > 0.05) notes.push(`${label}: kaynak süresi değişmiş (${t.sourceDuration.toFixed(2)} → ${r.duration.toFixed(2)} sn).`);
    t.sourceDuration = r.duration;
    if (t.sourceIn >= r.duration) { t.sourceIn = 0; notes.push(`${label}: kesit başlangıcı kaynağı aşıyordu, 0'a alındı.`); }
    if (t.sourceIn + t.length > r.duration + 0.05) { t.length = Math.max(0.01, r.duration - t.sourceIn); notes.push(`${label}: kullanılacak süre kaynağa göre kısaltıldı (${t.length.toFixed(2)} sn).`); }
    if (t.fadeIn + t.fadeOut > t.length) { t.fadeIn = 0; t.fadeOut = 0; notes.push(`${label}: fade süreleri kesitten uzundu, sıfırlandı.`); }
  });
  return { mix: next, issues, notes };
}

export function mixRequest(videoDuration: number, gain: number, mute: boolean, solo: boolean, tracks: MixTrack[]) {
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) throw new Error('Önce geçerli bir video seç.');
  if (tracks.length > MAX_MIX_TRACKS) throw new Error('En fazla 8 ek ses kanalı kullanılabilir.');
  if (!Number.isFinite(gain) || gain < 0 || gain > 2) throw new Error('Orijinal ses seviyesi geçersiz.');
  const anySolo = solo || tracks.some(t => t.solo);
  const active = tracks.filter(t => !t.mute && (!anySolo || t.solo));
  for (const t of active) {
    if ([t.gain, t.pan, t.start, t.sourceIn, t.length, t.fadeIn, t.fadeOut, t.sourceDuration].some(n => !Number.isFinite(n)) || !t.path ||
      t.gain < 0 || t.gain > 2 || Math.abs(t.pan) > 1 || t.start < 0 || t.start >= videoDuration || t.sourceIn < 0 || t.length <= 0 ||
      t.sourceIn + t.length > t.sourceDuration + 0.05 || t.fadeIn < 0 || t.fadeOut < 0 || t.fadeIn + t.fadeOut > t.length) {
      throw new Error('Kanal sürelerini kontrol et: kesit kaynak sesi aşamaz, fade toplamı kesitten uzun olamaz ve başlangıç video içinde olmalıdır.');
    }
  }
  return { originalGain: mute || (anySolo && !solo) ? 0 : gain, tracks: active.map(t => [t.path, t.gain, t.pan, t.start, t.sourceIn, t.length, t.fadeIn, t.fadeOut] as [string, number, number, number, number, number, number, number]) };
}
