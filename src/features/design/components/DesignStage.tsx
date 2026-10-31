import {useEffect,useRef} from 'react';
import type {CSSProperties,PointerEvent as ReactPointerEvent} from 'react';
import {Check,LayoutTemplate} from 'lucide-react';
import {resizeBox,rotationFromPointer} from '../../../core/designGeometry';
import type {Box,Handle} from '../../../core/designGeometry';
import type {DesignElement,ProjectDocument,UpdateProject} from '../../../core/types';
import {elementStyle} from '../elementStyle';

type Drag={mode:'move'|'resize'|'rotate';id:string;startX:number;startY:number;origin:Box;handle?:Handle};
type Props={design:ProjectDocument['design'];selectedElement:string|null;onSelect:(id:string|null)=>void;update:UpdateProject;onDelete:()=>void;onNudge:(dx:number,dy:number)=>void};

const HANDLES:Handle[]=['nw','ne','sw','se'];

export function DesignStage({design,selectedElement,onSelect,update,onDelete,onNudge}:Props){
  const stageRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<Drag|null>(null);
  const selected=design.elements.find(e=>e.id===selectedElement);

  const patch=(id:string,changes:Partial<DesignElement>)=>update(p=>({...p,design:{...p.design,elements:p.design.elements.map(el=>el.id===id?{...el,...changes}:el)}}));
  const originOf=(el:DesignElement):Box=>({x:el.x,y:el.y,width:el.width,height:el.height,rotation:el.rotation??0});
  const begin=(e:ReactPointerEvent<HTMLElement>,el:DesignElement,mode:Drag['mode'],handle?:Handle)=>{
    if(!stageRef.current)return;
    e.preventDefault();e.stopPropagation();
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* geçersiz işaretçi kimliği: yakalama olmadan sürüklemeye devam edilir */}
    onSelect(el.id);
    dragRef.current={mode,id:el.id,startX:e.clientX,startY:e.clientY,origin:originOf(el),handle};
  };
  const end=()=>{dragRef.current=null;};
  const onPointerMove=(e:ReactPointerEvent<HTMLElement>)=>{
    const drag=dragRef.current;const rect=stageRef.current?.getBoundingClientRect();
    if(!drag||!rect)return;
    if(drag.mode==='move'){
      const x=Math.min(99,Math.max(-50,drag.origin.x+(e.clientX-drag.startX)/rect.width*100));
      const y=Math.min(99,Math.max(-50,drag.origin.y+(e.clientY-drag.startY)/rect.height*100));
      patch(drag.id,{x,y});
    }else if(drag.mode==='resize'&&drag.handle){
      const dx=(e.clientX-drag.startX)*design.width/rect.width,dy=(e.clientY-drag.startY)*design.height/rect.height;
      const box=resizeBox(drag.origin,drag.handle,dx,dy,design.width,design.height,e.shiftKey);
      patch(drag.id,{x:box.x,y:box.y,width:box.width,height:box.height});
    }else if(drag.mode==='rotate'){
      const cx=rect.left+(drag.origin.x+drag.origin.width/2)/100*rect.width,cy=rect.top+(drag.origin.y+drag.origin.height/2)/100*rect.height;
      patch(drag.id,{rotation:rotationFromPointer(cx,cy,e.clientX,e.clientY,e.shiftKey)});
    }
  };

  // Klavye: Delete/Backspace siler, ok tuşları 0.5% (Shift ile 5%) kaydırır. Metin alanlarında çalışmaz.
  const keyRef=useRef({onDelete,onNudge,has:false});
  keyRef.current={onDelete,onNudge,has:!!selected};
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const t=e.target as HTMLElement|null;
      if(!keyRef.current.has||e.ctrlKey||e.metaKey||e.altKey)return;
      if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;
      const step=e.shiftKey?5:0.5;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();keyRef.current.onDelete();}
      else if(e.key==='ArrowLeft'){e.preventDefault();keyRef.current.onNudge(-step,0);}
      else if(e.key==='ArrowRight'){e.preventDefault();keyRef.current.onNudge(step,0);}
      else if(e.key==='ArrowUp'){e.preventDefault();keyRef.current.onNudge(0,-step);}
      else if(e.key==='ArrowDown'){e.preventDefault();keyRef.current.onNudge(0,step);}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);

  const frameStyle={'--ar':design.width/design.height} as CSSProperties;
  return <>
    <div className="board-tools"><span className="chip"><LayoutTemplate size={14}/> Tasarım tuvali</span><span className="chip pale">Sürükle, köşeden boyutlandır, üstten döndür</span></div>
    <div className="stage-fit"><div className="design-frame" style={frameStyle}><div ref={stageRef} className="design-stage" style={{background:design.background}} onClick={()=>onSelect(null)}>
      {design.elements.map(el=><div key={el.id} data-element={el.id} className={`design-element ${el.kind} ${el.id===selectedElement?'selected':''}`} onClick={e=>e.stopPropagation()} onPointerDown={e=>begin(e,el,'move')} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} style={elementStyle(el,design)}>{el.kind==='text'?el.text:null}</div>)}
      {selected&&<div className="design-handles" style={{left:`${selected.x}%`,top:`${selected.y}%`,width:`${selected.width}%`,height:`${selected.height}%`,transform:selected.rotation?`rotate(${selected.rotation}deg)`:undefined}}>
        {HANDLES.map(h=><div key={h} data-handle={h} className={`design-handle ${h}`} onClick={e=>e.stopPropagation()} onPointerDown={e=>begin(e,selected,'resize',h)} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}/>)}
        <div className="design-handle-stem"/>
        <div data-handle="rotate" className="design-handle rotate" title="Döndür (Shift: 15° adımlar)" onClick={e=>e.stopPropagation()} onPointerDown={e=>begin(e,selected,'rotate')} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}/>
      </div>}
    </div></div></div>
    <div className="below-preview"><span>Proje tuvali • Önizleme</span><span>PNG, JPEG ve WebP çıkışı çalışır <Check size={14}/></span></div>
  </>;
}
