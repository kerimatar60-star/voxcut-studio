import {useEffect,useState} from 'react';
import {Download,Layers,LayoutTemplate,Plus,Type} from 'lucide-react';
import {DESIGN_PRESETS,MAX_CANVAS,MIN_CANVAS,presetIdFor} from '../../../core/designCanvas';
import {EXPORT_FORMATS,EXPORT_SCALES,exportSize} from '../../../core/designExport';
import type {ExportFormat} from '../../../core/designExport';
import {TemplatePicker} from './TemplatePicker';
import type {DesignElement,ProjectDocument,UpdateProject} from '../../../core/types';

type Props={
  design:ProjectDocument['design'];update:UpdateProject;addElement:(kind:DesignElement['kind'])=>void;
  onCanvas:(width:number,height:number)=>void;onExport:(format:ExportFormat,scale:number)=>void;onTemplate:(id:string)=>void;
};

export function DesignTools({design,update,addElement,onCanvas,onExport,onTemplate}:Props){
  const preset=presetIdFor(design.width,design.height);
  const [width,setWidth]=useState(String(design.width));
  const [height,setHeight]=useState(String(design.height));
  const [format,setFormat]=useState<ExportFormat>('png');
  const [scale,setScale]=useState<number>(1);
  // Proje açılınca veya hazır ayar seçilince alanlar gerçek boyuta eşitlenir.
  useEffect(()=>{setWidth(String(design.width));setHeight(String(design.height));},[design.width,design.height]);
  const w=Number(width),h=Number(height);
  const valid=Number.isFinite(w)&&Number.isFinite(h)&&w>=MIN_CANVAS&&h>=MIN_CANVAS&&w<=MAX_CANVAS&&h<=MAX_CANVAS;
  let outSize='';let outError='';
  try{const s=exportSize(design.width,design.height,scale);outSize=`${s.width}×${s.height} px`;}catch(e){outError=e instanceof Error?e.message:'Boyut geçersiz.';}
  return <div className="tool-section">
    <span className="small-heading">İÇERİK EKLE</span>
    <button className="tool-card" onClick={()=>addElement('text')}><span className="tool-icon purple"><Type size={20}/></span><span><strong>Metin ekle</strong><small>Başlık ve açıklama</small></span><Plus size={16}/></button>
    <button className="tool-card" onClick={()=>addElement('rectangle')}><span className="tool-icon pink"><LayoutTemplate size={20}/></span><span><strong>Dikdörtgen</strong><small>Arka plan ve kutular</small></span><Plus size={16}/></button>
    <button className="tool-card" onClick={()=>addElement('ellipse')}><span className="tool-icon cyan"><Layers size={20}/></span><span><strong>Elips</strong><small>Dekoratif şekiller</small></span><Plus size={16}/></button>
    <div className="divider"/>
    <span className="small-heading">ŞABLONLAR</span>
    <TemplatePicker onApply={onTemplate}/>
    <div className="divider"/>
    <span className="small-heading">TUVAL</span>
    <div className="field"><label htmlFor="canvas-preset">Boyut</label>
      <select id="canvas-preset" value={preset} onChange={e=>{const p=DESIGN_PRESETS.find(x=>x.id===e.target.value);if(p)onCanvas(p.width,p.height);}}>
        {DESIGN_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        <option value="custom" disabled>Özel</option>
      </select></div>
    <div className="property-grid">
      <div className="field"><label htmlFor="canvas-w">Genişlik (px)</label><input id="canvas-w" type="number" min={MIN_CANVAS} max={MAX_CANVAS} value={width} onChange={e=>setWidth(e.target.value)}/></div>
      <div className="field"><label htmlFor="canvas-h">Yükseklik (px)</label><input id="canvas-h" type="number" min={MIN_CANVAS} max={MAX_CANVAS} value={height} onChange={e=>setHeight(e.target.value)}/></div>
    </div>
    <button className="btn btn-dark wide" disabled={!valid||(w===design.width&&h===design.height)} onClick={()=>onCanvas(w,h)}>Özel boyutu uygula</button>
    <div className="flexform"><label>Arka plan rengi</label><input aria-label="Arka plan rengi" type="color" value={design.background} onChange={e=>update(p=>({...p,design:{...p.design,background:e.target.value}}))}/></div>
    <div className="field-note">Şu anki boyut: {design.width} × {design.height} px · {MIN_CANVAS}–{MAX_CANVAS} px arası</div>
    <div className="divider"/>
    <span className="small-heading">DIŞA AKTAR</span>
    <div className="property-grid">
      <div className="field"><label htmlFor="export-format">Biçim</label><select id="export-format" value={format} onChange={e=>setFormat(e.target.value as ExportFormat)}>{EXPORT_FORMATS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
      <div className="field"><label htmlFor="export-scale">Ölçek</label><select id="export-scale" value={scale} onChange={e=>setScale(Number(e.target.value))}>{EXPORT_SCALES.map(s=><option key={s} value={s}>{s}×</option>)}</select></div>
    </div>
    <div className="field-note">{outError?<span role="alert">{outError}</span>:`Çıktı: ${outSize}`}</div>
    <button className="btn btn-primary wide" disabled={!!outError} onClick={()=>onExport(format,scale)}><Download size={15}/> Görsel olarak kaydet</button>
  </div>;
}
