import { useRef, useState } from 'react';
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Download, FileVideo, LoaderCircle, Scissors } from 'lucide-react';

const formatError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 450 ? `${message.slice(0, 450)}…` : message;
};

/** Local-only MVP: native Tauri file dialog -> FFmpeg trim_video -> MP4. */
export function VideoTrimPanel() {
  const [source, setSource] = useState<string>('');
  const previewRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(10);
  const [duration, setDuration] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [isError, setIsError] = useState<boolean>(false);

  const canUseDesktop = isTauri();
  const mediaUrl = source && canUseDesktop ? convertFileSrc(source) : '';
  const baseName = source.split(/[\\/]/).pop() || 'Seçilmedi';

  async function pickSource() {
    setIsError(false);
    setMessage('');
    try {
      const path = await open({
        title: 'Kesilecek videoyu seç',
        directory: false,
        multiple: false,
        filters: [{ name: 'Video dosyaları', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
      });
      if (typeof path !== 'string') return;
      setSource(path);
      setStart(0);
      setEnd(10);
      setDuration(null);
    } catch (error) {
      setIsError(true);
      setMessage(`Dosya seçilemedi: ${formatError(error)}`);
    }
  }

  async function renderTrim() {
    if (!source) return;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      setIsError(true);
      setMessage('Başlangıç ve bitiş süreleri geçerli olmalı (bitiş > başlangıç).');
      return;
    }
    if (duration !== null && end > duration + 0.05) {
      setIsError(true);
      setMessage(`Bitiş süresi, video süresini (${duration.toFixed(2)} sn) aşamaz.`);
      return;
    }

    setIsError(false);
    setMessage('');
    try {
      const outputPath = await save({
        title: 'Kesilmiş videoyu MP4 olarak kaydet',
        defaultPath: 'VoxCut_Kesit.mp4',
        filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
      });
      if (!outputPath) return;
      if (outputPath.toLowerCase() === source.toLowerCase()) {
        setIsError(true);
        setMessage('Kaynak video ile hedef dosya aynı olamaz. Farklı bir dosya seç.');
        return;
      }
      setIsWorking(true);
      const result = await invoke<string>('trim_video', {
        inputPath: source,
        outputPath,
        startSeconds: start,
        endSeconds: end,
      });
      setMessage(result || `Video kaydedildi: ${outputPath}`);
    } catch (error) {
      setIsError(true);
      setMessage(`Dışa aktarma hatası: ${formatError(error)}`);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="vc-trim-panel">
      <div className="vc-trim-heading"><Scissors size={16} /> Videoyu kes</div>
      <p className="vc-trim-hint">Videoyu seç; yalnızca seçtiğin aralığı yeni bir MP4 olarak kaydeder. Orijinal videon değişmez.</p>
      {!canUseDesktop ? (
        <p className="vc-trim-alert">Bu özellik yalnızca kurulu VoxCut Studio uygulamasında çalışır.</p>
      ) : (
        <>
          <button className="btn btn-dark wide" type="button" disabled={isWorking} onClick={pickSource}>
            <FileVideo size={15} /> Yerel video seç
          </button>
          <p className="vc-trim-name" title={source}>{baseName}</p>
          {mediaUrl && (
            <video
              key={source}
              ref={previewRef}
              className="vc-trim-preview"
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={event => {
                const length = event.currentTarget.duration;
                if (Number.isFinite(length) && length > 0) {
                  setDuration(length);
                  setEnd(Math.round(length * 100) / 100);
                }
              }}
              onError={() => {
                setIsError(true);
                setMessage('Ön izleme açılamadı. Video biçimi veya Tauri asset izni kontrol edilmeli. Süreleri elle girerek dışa aktarmayı yine deneyebilirsin.');
              }}
            />
          )}
          <div className="property-grid">
            <div className="field">
              <label>Başlangıç (sn)</label>
              <input type="number" min={0} step="0.1" value={start} onChange={event => setStart(Number(event.target.value))} />
            </div>
            <div className="field">
              <label>Bitiş (sn)</label>
              <input type="number" min={0.1} step="0.1" value={end} onChange={event => setEnd(Number(event.target.value))} />
            </div>
          </div>
          <div className="property-grid">
            <button className="btn btn-dark" type="button" disabled={!mediaUrl || isWorking} onClick={() => {
              const value = previewRef.current?.currentTime;
              if (value !== undefined && Number.isFinite(value)) setStart(Math.round(value * 100) / 100);
            }}>Bu kareyi başlangıç yap</button>
            <button className="btn btn-dark" type="button" disabled={!mediaUrl || isWorking} onClick={() => {
              const value = previewRef.current?.currentTime;
              if (value !== undefined && Number.isFinite(value)) setEnd(Math.round(value * 100) / 100);
            }}>Bu kareyi bitiş yap</button>
          </div>
          {duration !== null && <p className="vc-trim-hint">Kaynak süresi: {duration.toFixed(2)} saniye</p>}
          <button className="btn btn-primary wide" type="button" disabled={!source || isWorking} onClick={renderTrim}>
            {isWorking ? <LoaderCircle size={15} className="vc-spin" /> : <Download size={15} />}
            {isWorking ? 'FFmpeg işliyor…' : 'Kes ve MP4 kaydet'}
          </button>
          {message && <p role="status" className={`vc-trim-result ${isError ? 'vc-trim-error' : ''}`}>{message}</p>}
          <p className="vc-trim-hint">Sadece video kesme aktiftir. Müzik ekleme ve birleştirme henüz bu panelde yoktur. Mevcut FFmpeg sürücüsü nedeniyle CPU / libx264 kullanılır.</p>
        </>
      )}
    </div>
  );
}
