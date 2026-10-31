import {duplicateLayer,moveLayer,resizeCanvas} from '../../core/designCanvas';
import {alignBox} from '../../core/designGeometry';
import type {AlignHow} from '../../core/designGeometry';
import type {LayerMove} from '../../core/designCanvas';
import {instantiateTemplate,templateById} from '../../core/designTemplates';
import {makeElement,newId} from '../../core/project';
import type {DesignElement,UpdateProject} from '../../core/types';

/** Tasarım katmanı işlemleri; seçili katman kimliği App'te tutulur (zaman çizelgesi ve özellikler de kullanır). */
export function useDesignActions(update:UpdateProject,selected:string|null,setSelected:(id:string|null)=>void){
  const changeElement=(changes:Partial<DesignElement>)=>{
    if(!selected)return;
    update(p=>({...p,design:{...p.design,elements:p.design.elements.map(e=>e.id===selected?{...e,...changes}:e)}}));
  };
  const addElement=(kind:DesignElement['kind'])=>{
    const el=makeElement(kind);update(p=>({...p,design:{...p.design,elements:[...p.design.elements,el]}}));setSelected(el.id);
  };
  const removeElement=()=>{if(selected){update(p=>({...p,design:{...p.design,elements:p.design.elements.filter(e=>e.id!==selected)}}));setSelected(null);}};
  const setCanvas=(width:number,height:number)=>update(p=>({...p,design:resizeCanvas(p.design,width,height)}));
  const moveSelected=(move:LayerMove)=>{if(selected)update(p=>({...p,design:{...p.design,elements:moveLayer(p.design.elements,selected,move)}}));};
  const duplicateSelected=()=>{
    if(!selected)return;
    const copyId=newId();
    update(p=>({...p,design:{...p.design,elements:duplicateLayer(p.design.elements,selected,copyId).elements}}));
    setSelected(copyId);
  };
  /** Ok tuşlarıyla kaydırma (yüzde); katman tuvalin çok dışına çıkmasın diye -50..150 arasında kalır. */
  const nudgeSelected=(dx:number,dy:number)=>{
    if(!selected)return;
    update(p=>({...p,design:{...p.design,elements:p.design.elements.map(e=>e.id===selected?{...e,x:Math.min(150,Math.max(-50,e.x+dx)),y:Math.min(150,Math.max(-50,e.y+dy))}:e)}}));
  };
  const alignSelected=(how:AlignHow)=>{
    if(!selected)return;
    update(p=>({...p,design:{...p.design,elements:p.design.elements.map(e=>e.id===selected?alignBox(e,how):e)}}));
  };
  /** Şablonu uygular (tuval + katmanlar değişir, seçim temizlenir); geri al ile eski tasarıma dönülür. */
  const applyTemplate=(templateId:string)=>{
    const template=templateById(templateId);
    if(!template)return;
    const next=instantiateTemplate(template,newId);
    update(p=>({...p,design:next}));
    setSelected(null);
  };
  return {changeElement,addElement,removeElement,setCanvas,moveSelected,duplicateSelected,nudgeSelected,alignSelected,applyTemplate};
}
