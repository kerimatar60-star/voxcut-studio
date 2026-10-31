import {Download,Plus,Trash2} from 'lucide-react';
import type {SubtitleCue} from '../../../core/types';

type Props={cues:SubtitleCue[];onUpdate:(id:string,changes:Partial<SubtitleCue>)=>void;onRemove:(id:string)=>void;onAdd:()=>void;onExportSrt:()=>void};

export function CueList({cues,onUpdate,onRemove,onAdd,onExportSrt}:Props){
  return <div className="property-body captions-list"><span className="small-heading">ZAMAN KODLARI</span>{cues.map((cue,index)=><div className="cue" key={cue.id}><div className="cue-head"><strong>#{index+1}</strong><button onClick={()=>onRemove(cue.id)} title="Sil"><Trash2 size={14}/></button></div><div className="property-grid"><div className="field"><label>Başlangıç (sn)</label><input type="number" min={0} step="0.1" value={cue.start} onChange={e=>onUpdate(cue.id,{start:Number(e.target.value)})}/></div><div className="field"><label>Bitiş (sn)</label><input type="number" min={0} step="0.1" value={cue.end} onChange={e=>onUpdate(cue.id,{end:Number(e.target.value)})}/></div></div><textarea aria-label="Altyazı metni" value={cue.text} onChange={e=>onUpdate(cue.id,{text:e.target.value})} rows={2}/></div>)}<button className="btn btn-dark wide" onClick={onAdd}><Plus size={15}/> Yeni altyazı</button><button className="btn btn-primary wide" onClick={onExportSrt}><Download size={15}/> SRT dışa aktar</button></div>;
}
