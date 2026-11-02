import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Film, Image as ImageIcon, LoaderCircle, Save } from 'lucide-react';
import { COVER_IMAGE_EXT, COVER_VIDEO_EXT, coverOutputName, fileNameOf, friendlyCoverError, isCoverImage, isCoverVideo } from '../../../core/cover';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Videoya kapak fotoğrafı ekler: video seç → fotoğraf seç → yeni videoyu kaydet. Video yeniden kodlanmaz, kaynak değişmez. */
export function CoverScreen({ setNotice }: { setNotice: (text: string) => void }) {
  const [video, setVideo] = useState('');
  const [image, setImage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urlRef = useRef('');

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const fail = (raw: unknown) => setError(friendlyCoverError(raw instanceof Error ? raw.message : String(raw)));

  async function pickVideo() {
    setError('');
    try {
      const path = await open({ title: 'Kapak eklenecek videoyu seç', directory: false, multiple: false, filters: [{ name: 'Video dosyaları', extensions: [...COVER_VIDEO_EXT] }] });
      if (typeof path !== 'string') return;
      if (!isCoverVideo(path)) { setError('Kapak eklemek için MP4, M4V veya MOV video seç.'); return; }
      setVideo(path);
    } catch (e) { fail(e); }
  }

  async function pickImage() {
    setError('');
    try {
      const path = await open({ title: 'Kapak fotoğrafını seç', directory: false, multiple: false, filters: [{ name: 'Fotoğraflar', extensions: [...COVER_IMAGE_EXT] }] });
      if (typeof path !== 'string') return;
      if (!isCoverImage(path)) { setError('Fotoğraf PNG, JPEG veya WebP olmalı.'); return; }
      const bytes = await invoke<ArrayBuffer>('read_image_bytes', { path });
      const ext = path.split('.').pop()?.toLowerCase() ?? 'png';
      const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? 'image/png' }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setImage(path); setImageUrl(url);
    } catch (e) { fail(e); }
  }

  async function apply() {
    if (!video || !image) return;
    setError('');
    try {
      const output = await save({ title: 'Kapaklı videoyu kaydet', defaultPath: coverOutputName(video), filters: [{ name: 'Video', extensions: [video.split('.').pop()?.toLowerCase() ?? 'mp4'] }] });
      if (!output) return;
      setBusy(true);
      const message = await invoke<string>('add_cover', { videoPath: video, imagePath: image, outputPath: output });
      setNotice(message);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!isTauri()) return <section className="panel cover-screen" style={{ gridColumn: '1 / -1', padding: 24 }}><h2>Kapak</h2><p className="vc-trim-alert">Kapak ekleme yalnızca kurulu VoxCut Studio uygulamasında çalışır.</p></section>;

  return <section className="panel cover-screen" style={{ gridColumn: '1 / -1', padding: 24, overflow: 'auto' }}>
    <div className="panel-heading"><div><span className="eyebrow">KAPAK</span><h2>Videoya kapak fotoğrafı ekle</h2></div></div>
    <p style={{ color: 'var(--text-2)', maxWidth: 640 }}>Seçtiğin fotoğraf videonun kapağı olur: dosya gezgininde, telefonda ve oynatıcılarda küçük resim olarak görünür. Video yeniden kodlanmaz, kalitesi aynı kalır. Orijinal videon değişmez; kapaklı video yeni bir dosya olarak kaydedilir.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 24, marginTop: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="btn btn-dark wide" type="button" onClick={() => void pickVideo()}><Film size={16} /> 1 · Videoyu seç</button>
        <div className="muted-line" aria-live="polite">{video ? fileNameOf(video) : 'Seçilmedi'}</div>
        <button className="btn btn-dark wide" type="button" onClick={() => void pickImage()}><ImageIcon size={16} /> 2 · Kapak fotoğrafını seç</button>
        <div className="muted-line">{image ? fileNameOf(image) : 'Seçilmedi'}</div>
        <button className="btn btn-primary wide" type="button" disabled={!video || !image || busy} onClick={() => void apply()}>{busy ? <><LoaderCircle size={16} className="spin" /> Ekleniyor…</> : <><Save size={16} /> 3 · Kapaklı videoyu kaydet</>}</button>
        {!video || !image ? <div className="muted-line">Önce videoyu ve fotoğrafı seç.</div> : null}
        {error && <p className="vc-trim-alert" role="alert">{error}</p>}
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <figure style={{ margin: 0 }}>
          <div style={{ width: 360, maxWidth: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            {imageUrl ? <img src={imageUrl} alt="Kapak önizlemesi, yatay" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Fotoğraf seçilmedi'}
          </div>
          <figcaption style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Yatay görünüm (16:9)</figcaption>
        </figure>
        <figure style={{ margin: 0 }}>
          <div style={{ width: 140, aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>
            {imageUrl ? <img src={imageUrl} alt="Kapak önizlemesi, dikey" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '—'}
          </div>
          <figcaption style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Dikey görünüm (9:16)</figcaption>
        </figure>
      </div>
    </div>
  </section>;
}
