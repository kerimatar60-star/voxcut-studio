import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { peaksToBars, selectionFractions } from '../../../core/waveformView';

const BUCKETS = 400;
/** Yol → tepe değerleri; aynı dosya için dalga formu oturum boyunca bir kez hesaplanır. */
const cache = new Map<string, Promise<number[]>>();
const load = (path: string) => {
  let p = cache.get(path);
  if (!p) { p = invoke<number[]>('waveform_peaks', { path, buckets: BUCKETS }); cache.set(path, p); p.catch(() => cache.delete(path)); }
  return p;
};

type Props = { path: string; label: string; /** Kaynak süresi (sn); 0 ise seçim çizilmez. */ duration: number; /** Kullanılan kesit (sn). */ start: number; end: number };

/** Ses dosyasının dalga formu; kullanılan kesit vurgulanır, kalan kısım soluk çizilir. Yüklenemezse sessizce gizlenir. */
export function Waveform({ path, label, duration, start, end }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isTauri() || !path) return;
    let alive = true;
    setPeaks(null); setFailed(false);
    load(path).then(p => { if (alive) setPeaks(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [path]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 240, height = 44;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const bars = peaksToBars(peaks, Math.max(20, Math.floor(width / 3)));
    const sel = selectionFractions(start, end, duration);
    const step = width / bars.length;
    bars.forEach((v, i) => {
      const mid = (i + 0.5) / bars.length;
      const inside = duration <= 0 || (mid >= sel.from && mid <= sel.to);
      ctx.fillStyle = inside ? '#a78bfa' : '#4a4d63';
      const h = Math.max(1, v * (height - 4));
      ctx.fillRect(i * step, (height - h) / 2, Math.max(1, step - 1), h);
    });
  }, [peaks, duration, start, end]);

  if (!isTauri() || failed) return null;
  return <canvas ref={ref} className="vc-wave" role="img" aria-label={`${label} dalga formu`} style={{ width: '100%', height: 44, display: peaks ? 'block' : 'none' }} />;
}
