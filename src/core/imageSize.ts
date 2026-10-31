/** Görselin doğal boyutunu ölçer (kaynak blob/asset URL). Bozuk veya okunamayan görselde hata verir. */
export async function measureImage(url: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error('Görsel boyutu okunamadı.');
  return { width: img.naturalWidth, height: img.naturalHeight };
}
