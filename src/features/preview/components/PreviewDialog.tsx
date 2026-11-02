import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, LoaderCircle, X } from 'lucide-react';
import { EXPORT_FORMATS, EXPORT_SCALES, exportSize, renderDesignBlob, saveRenderedDesign } from '../../../core/designExport';
import type { ExportFormat, RenderedDesign } from '../../../core/designExport';
import { cuesToSrt } from '../../../core/subtitles';
import type { AudioMixState } from '../../../core/audioMixModel';
import type { TimelineState } from '../../../core/timelineModel';
import type { ProjectDocument, UpdateProject, Workspace } from '../../../core/types';
import { LayeredPreview } from './LayeredPreview';

type Props = {
  workspace: Workspace;
  project: ProjectDocument;
  imageSources: Record<string, string>;
  update: UpdateProject;
  changeTimeline: (fn: (t: TimelineState) => TimelineState) => void;
  changeMix: (fn: (m: AudioMixState) => AudioMixState) => void;
  onExportSrt: () => void;
  onExportVtt: () => void;
  onClose: () => void;
  setNotice: (text: string) => void;
};

const TITLES: Record<Workspace, string> = { design: 'Tasarım önizlemesi', video: 'Video önizlemesi', audio: 'Video ve müzik önizlemesi', subtitles: 'Altyazı önizlemesi', cover: 'Önizleme' };

function DesignPreview({ project, imageSources, setNotice, onClose }: Pick<Props, 'project' | 'imageSources' | 'setNotice' | 'onClose'>) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scale, setScale] = useState<number>(1);
  const [rendered, setRendered] = useState<RenderedDesign | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const size = useMemo(() => { try { return exportSize(project.design.width, project.design.height, scale); } catch (e) { return e instanceof Error ? e : new Error(String(e)); } }, [project.design.width, project.design.height, scale]);

  useEffect(() => {
    let alive = true, made = '';
    setError(''); setRendered(null);
    renderDesignBlob(project, { format, scale, imageSources }).then(r => {
      if (!alive) return;
      made = URL.createObjectURL(r.blob);
      setRendered(r); setUrl(made);
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [project, format, scale, imageSources]);

  async function save() {
    if (!rendered) return;
    setBusy(true);
    try {
      const info = await saveRenderedDesign(rendered);
      if (info) { setNotice(`Kaydedildi: ${info}`); onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return <div className="pv-design">
    <div className="pv-design-img">{url ? <img src={url} alt="Kaydedilecek görselin önizlemesi" /> : <span className="muted-line">{error || 'Hazırlanıyor…'}</span>}</div>
    <div className="pv-design-side">
      <label className="field">Biçim<select value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>{EXPORT_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <label className="field">Boyut<select value={scale} onChange={e => setScale(Number(e.target.value))}>{EXPORT_SCALES.map(s => <option key={s} value={s}>{s}× {size instanceof Error ? '' : `(${Math.round(project.design.width * s)}×${Math.round(project.design.height * s)})`}</option>)}</select></label>
      <div className="muted-line">{rendered ? `${rendered.width}×${rendered.height} piksel · yaklaşık ${(rendered.blob.size / 1024).toFixed(0)} KB · ${rendered.name}` : ''}</div>
      {size instanceof Error && <p className="vc-trim-alert" role="alert">{size.message}</p>}
      {error && !(size instanceof Error) && <p className="vc-trim-alert" role="alert">{error}</p>}
      <button className="btn btn-primary wide" type="button" disabled={!rendered || busy} onClick={() => void save()}>{busy ? <><LoaderCircle size={15} className="spin" /> Kaydediliyor…</> : <><Download size={15} /> Kaydet</>}</button>
      <button className="btn btn-dark wide" type="button" onClick={onClose}>Vazgeç</button>
    </div>
  </div>;
}

function SubtitlePreview({ project, onExportSrt, onExportVtt, onClose }: Pick<Props, 'project' | 'onExportSrt' | 'onExportVtt' | 'onClose'>) {
  const valid = project.subtitles.filter(c => c.start >= 0 && c.end > c.start && c.text.trim());
  const skipped = project.subtitles.length - valid.length;
  return <div className="pv-design">
    <div className="pv-subs" aria-label="Kaydedilecek altyazı metni"><pre>{valid.length ? cuesToSrt(valid) : 'Henüz geçerli altyazı yok.'}</pre></div>
    <div className="pv-design-side">
      <div className="muted-line">{valid.length} altyazı kaydedilecek{skipped ? `, ${skipped} geçersiz altyazı atlanacak` : ''}.</div>
      <button className="btn btn-primary wide" type="button" disabled={!valid.length} onClick={() => { onExportSrt(); onClose(); }}><Download size={15} /> SRT olarak kaydet</button>
      <button className="btn btn-dark wide" type="button" disabled={!valid.length} onClick={() => { onExportVtt(); onClose(); }}>VTT olarak kaydet</button>
      <button className="btn btn-dark wide" type="button" onClick={onClose}>Vazgeç</button>
    </div>
  </div>;
}

/** "Dışa Aktar" önce bu pencereyi açar: sonucu kaydetmeden önce görürsün. */
export function PreviewDialog(p: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);
  const media = p.workspace === 'video' || p.workspace === 'audio';
  return <div className="vc-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) p.onClose(); }}>
    <div className="vc-modal wide" role="dialog" aria-modal="true" aria-labelledby="pv-title">
      <div className="vc-modal-head"><h2 id="pv-title"><Eye size={18} /> {TITLES[p.workspace]}</h2><button className="btn btn-dark" type="button" aria-label="Kapat" onClick={p.onClose}><X size={16} /></button></div>
      {p.workspace === 'design' && <DesignPreview project={p.project} imageSources={p.imageSources} setNotice={p.setNotice} onClose={p.onClose} />}
      {p.workspace === 'subtitles' && <SubtitlePreview project={p.project} onExportSrt={p.onExportSrt} onExportVtt={p.onExportVtt} onClose={p.onClose} />}
      {media && <>
        <LayeredPreview project={p.project} update={p.update} changeTimeline={p.changeTimeline} changeMix={p.changeMix} />
        <div className="vc-modal-row"><button className="btn btn-primary" type="button" onClick={() => { p.onClose(); p.setNotice(p.workspace === 'video' ? 'Videoyu kaydetmek için sağdaki "MP4 kesme" veya "Çok klipli birleştirme" panelindeki kaydet düğmesini kullan.' : 'Sesi veya miksli videoyu kaydetmek için sağdaki Ses Miks panelinde çıktı biçimini seç ve kaydet düğmesine bas.'); }}>Kaydetmeye geç</button>
          <button className="btn btn-dark" type="button" onClick={p.onClose}>Kapat</button></div></>}
      {p.workspace === 'cover' && <p className="muted-line">Kapak için soldaki 1, 2, 3 adımlarını izle.</p>}
    </div>
  </div>;
}
