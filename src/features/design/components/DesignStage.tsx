import type {CSSProperties} from 'react';
import {Check,Sparkles} from 'lucide-react';
import type {ProjectDocument} from '../../../core/types';
import {elementStyle} from '../elementStyle';

type Props={design:ProjectDocument['design'];imageSources:Record<string,string>};

/** Tasarımı yalnızca gösterir (düzenleme tutamacı yok): yazıyla tasarlanan sonuç burada görünür. */
export function DesignStage({design,imageSources}:Props){
  const frameStyle={'--ar':design.width/design.height} as CSSProperties;
  return <>
    <div className="board-tools"><span className="chip"><Sparkles size={14}/> Tasarım</span><span className="chip pale">{design.width} × {design.height}</span></div>
    <div className="stage-fit"><div className="design-frame" style={frameStyle}><div className="design-stage" style={{background:design.background}}>
      {design.elements.map(el=><div key={el.id} data-element={el.id} className={`design-element ${el.kind}`} style={elementStyle(el,design)}>{el.kind==='text'?el.text:el.kind==='image'?(el.assetId&&imageSources[el.assetId]?<img src={imageSources[el.assetId]} alt="" draggable={false} style={{width:'100%',height:'100%',objectFit:el.fit??'contain',display:'block',pointerEvents:'none'}}/>:<span className="image-missing">Görsel bulunamadı</span>):null}</div>)}
    </div></div></div>
    <div className="below-preview"><span>Önizleme</span><span>PNG, JPEG ve WebP çıkışı çalışır <Check size={14}/></span></div>
  </>;
}
