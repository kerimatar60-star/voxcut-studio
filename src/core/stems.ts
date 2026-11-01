/** Teknik hata metnini kullanıcının anlayacağı bir cümleye çevirir (özgün metin kısaltılarak sonda kalır). */
export function friendlyError(raw: string): string {
  const m = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  if (/\b404\b/.test(raw)) return 'İndirme adresi bulunamadı (404). En kolay çözüm VoxCut Studio kurulum dosyasını yeniden çalıştırmaktır.';
  if (/curl|İndirme başarısız|resolve host|timed out|Could not resolve/i.test(raw)) return `İndirme yapılamadı. İnternet bağlantını kontrol edip tekrar dene. (${m})`;
  return m;
}
