/** Görsel katmanları için yerleşim hesapları (kutuya sığdırma, ilk boyut). */
/**
 * Görseli kutuya sığdırır: `contain` tamamı görünür (kenarlarda boşluk kalabilir), `cover` kutuyu doldurur (taşan kısım kırpılır).
 * Dönen dikdörtgen kutuya göre (0,0 = kutunun sol üstü) çizim hedefidir.
 */
export function fitRect(imgW: number, imgH: number, boxW: number, boxH: number, fit: 'contain' | 'cover'): { x: number; y: number; width: number; height: number } {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) return { x: 0, y: 0, width: Math.max(0, boxW), height: Math.max(0, boxH) };
  const scale = fit === 'cover' ? Math.max(boxW / imgW, boxH / imgH) : Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * scale, height = imgH * scale;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

/** Yeni görsel katmanı için kutu: tuvalin en çok %50'si genişlik ve %60'ı yükseklik; görselin oranı korunur, ortalanır (yüzde). */
export function initialImageBox(imgW: number, imgH: number, canvasW: number, canvasH: number): { x: number; y: number; width: number; height: number } {
  const ratio = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
  let wPx = canvasW * 0.5, hPx = wPx / ratio;
  if (hPx > canvasH * 0.6) { hPx = canvasH * 0.6; wPx = hPx * ratio; }
  const width = (wPx / canvasW) * 100, height = (hPx / canvasH) * 100;
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height };
}
