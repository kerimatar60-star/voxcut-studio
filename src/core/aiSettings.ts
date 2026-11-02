export type AiStatus = { hasKey: boolean; hint: string | null; consent: boolean; model: string };

/** Bağlantı kurulabilir mi: anahtar kayıtlı, onay verilmiş ve model seçilmiş. */
export const aiReady = (s: AiStatus | null): boolean => !!s && s.hasKey && s.consent && s.model.length > 0;

const PREFERRED = ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o'];

/** Listeden varsayılan model: bilinen ucuz/hızlı modellerden ilki; yoksa adında "mini" geçen; o da yoksa listenin ilki. Liste boşsa boş metin. */
export function pickDefaultModel(models: string[]): string {
  for (const p of PREFERRED) if (models.includes(p)) return p;
  return models.find(m => m.includes('mini')) ?? models[0] ?? '';
}
