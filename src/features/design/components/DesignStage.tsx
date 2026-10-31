import {useRef} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {Check,LayoutTemplate} from 'lucide-react';
import type {DesignElement,ProjectDocument,UpdateProject} from '../../../core/types';

type Drag={id:string;startX:number;startY:number;originX:number;originY:number};

export function DesignStage({design,selectedElement,onSelect,update}:{design:ProjectDocument['design'];selectedElement:string|null;onSelect:(id:string|null)=>void;update:UpdateProject}){
  const stageRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<Drag|null>(null);
  const beginDrag=(e:ReactPointerEvent<HTMLDivElement>,entry:DesignElement)=>{
    if(!stageRef.current)return;
    onSelect(entry.id);
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current={id:entry.id,startX:e.clientX,startY:e.clientY,originX:entry.x,originY:entry.y};
  };
  const moveDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current;if(!drag||drag.id!==e.currentTarget.dataset.element)return;
    const rect=stageRef.current?.getBoundingClientRect();if(!rect)return;
    const x=Math.min(99,Math.max(0,drag.originX+(e.clientX-drag.startX)/rect.width*100));
    const y=Math.min(99,Math.max(0,drag.originY+(e.clientY-drag.startY)/rect.height*100));
    update(p=>({...p,design:{...p.design,elements:p.design.elements.map(el=>el.id===drag.id?{...el,x,y}:el)}}));
  };
  return <>
    <div className="board-tools"><span className="chip"><LayoutTemplate size={14}/> Tasarım tuvali</span><span className="chip pale">Sürükle ve düzenle</span></div>
    <div className="stage-frame" style={{aspectRatio:`${design.width} / ${design.height}`,...(design.height>design.width?{height:'100%',width:'auto',maxWidth:'100%'}:{})}}><div ref={stageRef} className="design-stage" style={{background:design.background}} onClick={()=>onSelect(null)}>
      {design.elements.map(el=><div key={el.id} data-element={el.id} className={`design-element ${el.kind} ${el.id===selectedElement?'selected':''}`} onClick={e=>{e.stopPropagation();onSelect(el.id);}} onPointerDown={e=>beginDrag(e,el)} onPointerMove={moveDrag} onPointerUp={()=>dragRef.current=null} onPointerCancel={()=>dragRef.current=null} style={{left:`${el.x}%`,top:`${el.y}%`,width:`${el.width}%`,height:`${el.height}%`,color:el.color,background:el.kind==='text'?'transparent':el.background,fontSize:`${el.fontSize/design.width*100}cqw`,fontWeight:el.weight}}>{el.kind==='text'?el.text:null}</div>)}
    </div></div>
    <div className="below-preview"><span>Proje tuvali • Önizleme</span><span>PNG çıkışı çalışır <Check size={14}/></span></div>
  </>;
}
