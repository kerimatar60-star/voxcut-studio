/** Yerel konuşma tanıma (whisper.cpp) için arayüz tarafı saf mantık: durum ayrıştırma, biçim ve uygunluk denetimi. */
export type AsrModel = { id: string; label: string; size: number; installed: boolean };
export type AsrStatus = { engineInstalled: boolean; engineSize: number; models: AsrModel[] };
export type AsrLanguage = 'tr' | 'en' | 'auto';
export const ASR_LANGUAGES: { id: AsrLanguage; label: string }[] = [
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'İngilizce' },
  { id: 'auto', label: 'Otomatik algıla' },
];
export const RECOMMENDED_MODEL = 'small';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Rust'tan gelen durumu doğrular; beklenmeyen biçimde `null` döner (arayüz kurulu değil gibi davranır). */
export function parseAsrStatus(value: unknown): AsrStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.engineInstalled !== 'boolean' || !Array.isArray(v.models)) return null;
  const models: AsrModel[] = [];
  for (const m of v.models) {
    if (!m || typeof m !== 'object') return null;
    const r = m as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.label !== 'string' || typeof r.size !== 'number' || typeof r.installed !== 'boolean') return null;
    models.push({ id: r.id, label: r.label, size: r.size, installed: r.installed });
  }
  return { engineInstalled: v.engineInstalled, engineSize: typeof v.engineSize === 'number' ? v.engineSize : 0, models };
}

/** Çalıştırılabilir mi? Değilse kullanıcıya gösterilecek neden. */
export function transcribeBlocker(status: AsrStatus | null, modelId: string, hasSource: boolean): string | null {
  if (!status) return 'Durum okunamadı.';
  if (!status.engineInstalled) return 'Önce Whisper motorunu indir.';
  if (!status.models.find(m => m.id === modelId)?.installed) return 'Seçilen modeli indir.';
  if (!hasSource) return 'Önce bir ses veya video dosyası seç.';
  return null;
}

/** Hâlihazırda kurulu modeller arasında en uygun varsayılan: önerilen, yoksa kurulu olan en büyük, yoksa önerilen. */
export function defaultModel(status: AsrStatus | null): string {
  if (!status) return RECOMMENDED_MODEL;
  if (status.models.some(m => m.id === RECOMMENDED_MODEL && m.installed)) return RECOMMENDED_MODEL;
  const installed = status.models.filter(m => m.installed).sort((a, b) => b.size - a.size);
  return installed[0]?.id ?? RECOMMENDED_MODEL;
}
