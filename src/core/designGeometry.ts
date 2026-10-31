/** Katman kutusu: konum/ölçü tuvalin yüzdesi, dönme derece (merkez etrafında, saat yönü pozitif). */
export type Box = { x: number; y: number; width: number; height: number; rotation: number };
export type Handle = 'nw' | 'ne' | 'sw' | 'se';
export type AlignHow = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Yeniden boyutlandırmada en küçük kenar (tuval pikseli). */
export const MIN_BOX_PX = 16;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const rotate = (x: number, y: number, deg: number) => {
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
  return { x: x * c - y * s, y: x * s + y * c };
};

/**
 * Köşe tutamacıyla yeniden boyutlandırır. Fare farkı (dxPx, dyPx) tuval pikselidir; katman dönükse fark katmanın kendi eksenine çevrilir
 * ve KARŞI köşe sabit kalır. `keepRatio` en-boy oranını korur. En küçük kenar MIN_BOX_PX'tir.
 */
export function resizeBox(box: Box, handle: Handle, dxPx: number, dyPx: number, canvasW: number, canvasH: number, keepRatio = false): Box {
  const w = (box.width / 100) * canvasW, h = (box.height / 100) * canvasH;
  const cx = (box.x / 100) * canvasW + w / 2, cy = (box.y / 100) * canvasH + h / 2;
  const local = rotate(dxPx, dyPx, -box.rotation);
  const sx = handle.endsWith('e') ? 1 : -1, sy = handle.startsWith('s') ? 1 : -1;
  let nw = Math.max(MIN_BOX_PX, w + sx * local.x), nh = Math.max(MIN_BOX_PX, h + sy * local.y);
  if (keepRatio && w > 0 && h > 0) {
    const factor = Math.max(nw / w, nh / h);
    nw = Math.max(MIN_BOX_PX, w * factor); nh = Math.max(MIN_BOX_PX, h * factor);
    const fit = Math.max(nw / w, nh / h);
    nw = w * fit; nh = h * fit;
  }
  const shift = rotate((sx * (nw - w)) / 2, (sy * (nh - h)) / 2, box.rotation);
  const ncx = cx + shift.x, ncy = cy + shift.y;
  return { x: ((ncx - nw / 2) / canvasW) * 100, y: ((ncy - nh / 2) / canvasH) * 100, width: (nw / canvasW) * 100, height: (nh / canvasH) * 100, rotation: box.rotation };
}

/** Fare konumundan dönme açısı (derece, -180..180]; `snap` 15° adımlara yuvarlar). Tutamaç kutunun üstündeyken 0° döner. */
export function rotationFromPointer(cx: number, cy: number, px: number, py: number, snap: boolean): number {
  let deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  deg = snap ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10;
  return deg === 0 ? 0 : deg;
}

/** Katmanı tuvale göre hizalar (dönme yok sayılır: kutunun kendi kenarlarına göre). */
export function alignBox<T extends { x: number; y: number; width: number; height: number }>(box: T, how: AlignHow): T {
  switch (how) {
    case 'left': return { ...box, x: 0 };
    case 'hcenter': return { ...box, x: (100 - box.width) / 2 };
    case 'right': return { ...box, x: 100 - box.width };
    case 'top': return { ...box, y: 0 };
    case 'vcenter': return { ...box, y: (100 - box.height) / 2 };
    case 'bottom': return { ...box, y: 100 - box.height };
  }
}
