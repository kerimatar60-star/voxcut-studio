import type {CSSProperties} from 'react';
import {DESIGN_TEMPLATES} from '../../../core/designTemplates';
import type {DesignTemplate} from '../../../core/designTemplates';
import {elementStyle} from '../elementStyle';

const categories=[...new Set(DESIGN_TEMPLATES.map(t=>t.category))];

function Thumb({template}:{template:DesignTemplate}){
  const portrait=template.height>template.width;
  const style:CSSProperties={aspectRatio:`${template.width} / ${template.height}`,background:template.background,...(portrait?{height:104,width:'auto'}:{width:'100%'})};
  return <div className="template-thumb" style={style} aria-hidden="true">
    {template.elements.map((el,i)=><div key={i} className={`thumb-el ${el.kind}`} style={{...elementStyle(el,template),cursor:'inherit'}}>{el.kind==='text'?el.text:null}</div>)}
  </div>;
}

/** Hazır şablonlar: tıklayınca tuval boyutu ve katmanlar şablonla değişir; Geri al ile önceki tasarıma dönülür. */
export function TemplatePicker({onApply}:{onApply:(id:string)=>void}){
  return <div className="template-picker">
    {categories.map(category=><div key={category} className="template-group">
      <span className="template-category">{category}</span>
      <div className="template-grid">
        {DESIGN_TEMPLATES.filter(t=>t.category===category).map(t=>
          <button key={t.id} type="button" className="template-card" onClick={()=>onApply(t.id)} title={`${t.name} · ${t.width}×${t.height}`} aria-label={`${t.name} şablonunu uygula (${t.width}×${t.height})`}>
            <Thumb template={t}/><small>{t.name}</small>
          </button>)}
      </div>
    </div>)}
    <p className="field-note">Şablon uygulanınca mevcut tasarım değişir; üstteki Geri al ile dönebilirsin.</p>
  </div>;
}
