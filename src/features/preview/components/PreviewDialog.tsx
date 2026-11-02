import { useEffect } from 'react';
import { Download, Eye, X } from 'lucide-react';
import { cuesToSrt } from '../../../core/subtitles';
import type { AudioMixState } from '../../../core/audioMixModel';
import type { TimelineState } from '../../../core/timelineModel';
import type { ProjectDocument, UpdateProject, Workspace } from '../../../core/types';
import { LayeredPreview } from './LayeredPreview';

type Props = {
  workspace: Workspace;
  project: ProjectDocument;
  update: UpdateProject;
  changeTimeline: (fn: (t: TimelineState) => TimelineState) => void;
  changeMix: (fn: (m: AudioMixState) => AudioMixState) => void;
  onExportSrt: () => void;
  onExportVtt: () => void;
  onClose: () => void;
  setNotice: (text: string) => void;
};

const TITLES: Record<Workspace, string> = { video: 'Video önizlemesi', audio: 'Video ve müzik önizlemesi', subtitles: 'Altyazı önizlemesi', cover: 'Önizleme' };

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
      {p.workspace === 'subtitles' && <SubtitlePreview project={p.project} onExportSrt={p.onExportSrt} onExportVtt={p.onExportVtt} onClose={p.onClose} />}
      {media && <>
        <LayeredPreview project={p.project} update={p.update} changeTimeline={p.changeTimeline} changeMix={p.changeMix} />
        <div className="vc-modal-row"><button className="btn btn-primary" type="button" onClick={() => { p.onClose(); p.setNotice(p.workspace === 'video' ? 'Videoyu kaydetmek için sağdaki "MP4 kesme" veya "Çok klipli birleştirme" panelindeki kaydet düğmesini kullan.' : 'Sesi veya miksli videoyu kaydetmek için sağdaki Ses Miks panelinde çıktı biçimini seç ve kaydet düğmesine bas.'); }}>Kaydetmeye geç</button>
          <button className="btn btn-dark" type="button" onClick={p.onClose}>Kapat</button></div></>}
      {p.workspace === 'cover' && <p className="muted-line">Kapak için soldaki 1, 2, 3 adımlarını izle.</p>}
    </div>
  </div>;
}
