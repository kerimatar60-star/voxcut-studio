/** Rust `check_tools` sonucu: [ad, tamam mı, ayrıntı]. Adlar: "ffmpeg", "ffprobe", "kodlayıcı:<ad>", "filtre:<ad>". */
export type ToolCheck = [name: string, ok: boolean, detail: string];

/** Eksik araç/yetenekleri anlaşılır Türkçe uyarılara çevirir; her şey tamamsa boş dizi döner. */
export function describeToolProblems(checks: ToolCheck[]): string[] {
  const problems: string[] = [];
  const get = (name: string) => checks.find(c => c[0] === name);
  const ffmpeg = get('ffmpeg'), ffprobe = get('ffprobe');
  if (!ffmpeg || !ffmpeg[1] || !ffprobe || !ffprobe[1]) {
    const missing = [!ffmpeg?.[1] && 'FFmpeg', !ffprobe?.[1] && 'FFprobe'].filter(Boolean).join(' ve ');
    problems.push(`${missing} bulunamadı. Video kesme/birleştirme, ses miksi ve altyazı yakma bu olmadan çalışmaz. Windows için ffmpeg.org adresindeki bağlantılardan "full build" sürümünü indirip bin klasörünü PATH'e ekle, sonra uygulamayı yeniden aç.`);
    return problems;
  }
  const lacking = checks.filter(c => !c[1] && (c[0].startsWith('kodlayıcı:') || c[0].startsWith('filtre:')));
  if (lacking.length) problems.push(`Kurulu FFmpeg sürümünde şu özellikler yok: ${lacking.map(c => c[2] || c[0]).join(', ')}. İlgili işlemler çalışmayabilir; "full build" bir FFmpeg sürümü kullan.`);
  return problems;
}
