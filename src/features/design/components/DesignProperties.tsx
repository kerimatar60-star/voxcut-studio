import {ArrowDown,ArrowUp,Copy,Layers,Trash2} from 'lucide-react';
import type {LayerMove} from '../../../core/designCanvas';
import type {DesignElement} from '../../../core/types';

export function DesignProperties({element,changeElement,removeElement,onMove,onDuplicate}:{element:DesignElement|undefined;changeElement:(changes:Partial<DesignElement>)=>void;removeElement:()=>void;onMove:(move:LayerMove)=>void;onDuplicate:()=>void}){
  if(!element)return <div className="empty-properties"><Layers size={31}/><strong>Katman seç</strong><p>Tuvaldeki bir katmana tıkla veya soldan yenisini ekle.</p></div>;
  return <div className="property-body">
    <label className="small-heading">SEÇİLİ KATMAN</label><div className="selected-title"><Layers size={17}/>{element.kind==='text'?'Metin katmanı':element.kind==='ellipse'?'Elips':'Dikdörtgen'}</div>
    {element.kind==='text'&&<div className="field"><label>Metin içeriği</label><textarea rows={4} value={element.text} onChange={e=>changeElement({text:e.target.value})}/></div>}
    <div className="property-grid"><div className="field"><label>X (%)</label><input type="number" value={Math.round(element.x)} onChange={e=>changeElement({x:Number(e.target.value)})}/></div><div className="field"><label>Y (%)</label><input type="number" value={Math.round(element.y)} onChange={e=>changeElement({y:Number(e.target.value)})}/></div></div>
    <div className="property-grid"><div className="field"><label>Genişlik (%)</label><input type="number" value={element.width} onChange={e=>changeElement({width:Number(e.target.value)})}/></div><div className="field"><label>Yükseklik (%)</label><input type="number" value={element.height} onChange={e=>changeElement({height:Number(e.target.value)})}/></div></div>
    {element.kind==='text'&&<div className="field"><label>Yazı boyutu (px)</label><input type="number" min={8} max={500} value={element.fontSize} onChange={e=>changeElement({fontSize:Number(e.target.value)})}/></div>}
    <div className="field"><label>{element.kind==='text'?'Metin rengi':'Şekil rengi'}</label><input type="color" value={element.kind==='text'?element.color:element.background} onChange={e=>changeElement(element.kind==='text'?{color:e.target.value}:{background:e.target.value})}/></div>
    <span className="small-heading">KATMAN SIRASI</span>
    <div className="property-grid">
      <button className="btn btn-dark" onClick={()=>onMove('up')} title="Bir katman öne al"><ArrowUp size={15}/> Öne al</button>
      <button className="btn btn-dark" onClick={()=>onMove('down')} title="Bir katman arkaya al"><ArrowDown size={15}/> Arkaya al</button>
      <button className="btn btn-dark" onClick={()=>onMove('front')}>En öne</button>
      <button className="btn btn-dark" onClick={()=>onMove('back')}>En arkaya</button>
    </div>
    <button className="btn btn-dark wide" onClick={onDuplicate}><Copy size={15}/> Katmanı çoğalt</button>
    <button className="btn danger" onClick={removeElement}><Trash2 size={15}/> Katmanı sil</button>
  </div>;
}
