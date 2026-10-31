import {Layers,Type} from 'lucide-react';
import type {DesignElement} from '../../../core/types';

export function LayerList({elements,selected,onSelect}:{elements:DesignElement[];selected:string|null;onSelect:(id:string)=>void}){
  return <div className="layer-list">{elements.slice().reverse().map(el=><button key={el.id} className={`layer ${selected===el.id?'active':''}`} onClick={()=>onSelect(el.id)}>{el.kind==='text'?<Type size={15}/>:<Layers size={15}/>}<span>{el.kind==='text'?(el.text.split('\n')[0]||'Metin'):(el.kind==='ellipse'?'Elips':'Dikdörtgen')}</span><span className="layer-tag">{el.kind==='text'?'Metin':'Şekil'}</span></button>)}</div>;
}
