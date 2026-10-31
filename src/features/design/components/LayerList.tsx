import {Image as ImageIcon,Layers,Type} from 'lucide-react';
import type {DesignElement} from '../../../core/types';

const layerLabel=(el:DesignElement)=>el.kind==='text'?(el.text.split('\n')[0]||'Metin'):el.kind==='ellipse'?'Elips':el.kind==='image'?'Görsel':'Dikdörtgen';
const layerTag=(el:DesignElement)=>el.kind==='text'?'Metin':el.kind==='image'?'Görsel':'Şekil';

export function LayerList({elements,selected,onSelect}:{elements:DesignElement[];selected:string|null;onSelect:(id:string)=>void}){
  return <div className="layer-list">{elements.slice().reverse().map(el=><button key={el.id} className={`layer ${selected===el.id?'active':''}`} onClick={()=>onSelect(el.id)}>{el.kind==='text'?<Type size={15}/>:el.kind==='image'?<ImageIcon size={15}/>:<Layers size={15}/>}<span>{layerLabel(el)}</span><span className="layer-tag">{layerTag(el)}</span></button>)}</div>;
}
