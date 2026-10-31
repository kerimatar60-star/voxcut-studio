import {AlignCenter,AlignLeft,AlignRight,ArrowDown,ArrowUp,Copy,Layers,RotateCcw,Trash2} from 'lucide-react';
import type {LayerMove} from '../../../core/designCanvas';
import type {AlignHow} from '../../../core/designGeometry';
import {DEFAULT_FONT,FONT_FAMILIES} from '../../../core/designText';
import type {DesignElement} from '../../../core/types';

type Props={
  element:DesignElement|undefined;
  changeElement:(changes:Partial<DesignElement>)=>void;removeElement:()=>void;
  onMove:(move:LayerMove)=>void;onDuplicate:()=>void;onAlign:(how:AlignHow)=>void;
};

const WEIGHTS=[[400,'Normal'],[500,'Orta'],[600,'Yarı kalın'],[700,'Kalın'],[800,'Çok kalın'],[900,'Siyah']] as const;
const ALIGNS:[AlignHow,string][]=[['left','Sola'],['hcenter','Yatay orta'],['right','Sağa'],['top','Üste'],['vcenter','Dikey orta'],['bottom','Alta']];
const clamp=(v:number,min:number,max:number)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):min;

export function DesignProperties({element,changeElement,removeElement,onMove,onDuplicate,onAlign}:Props){
  if(!element)return <div className="empty-properties"><Layers size={31}/><strong>Katman seç</strong><p>Tuvaldeki bir katmana tıkla veya soldan yenisini ekle. Köşelerden boyutlandır, üstteki yuvarlak tutamaçtan döndür; ok tuşları kaydırır, Delete siler.</p></div>;
  const isText=element.kind==='text';
  const opacity=Math.round((element.opacity??1)*100);
  return <div className="property-body">
    <label className="small-heading">SEÇİLİ KATMAN</label><div className="selected-title"><Layers size={17}/>{isText?'Metin katmanı':element.kind==='ellipse'?'Elips':'Dikdörtgen'}</div>
    {isText&&<div className="field"><label>Metin içeriği</label><textarea rows={4} value={element.text} onChange={e=>changeElement({text:e.target.value})}/></div>}
    {isText&&<>
      <span className="small-heading">YAZI</span>
      <div className="property-grid">
        <div className="field"><label htmlFor="el-font">Yazı tipi</label><select id="el-font" value={element.fontFamily??DEFAULT_FONT} onChange={e=>changeElement({fontFamily:e.target.value})}>{FONT_FAMILIES.map(f=><option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}</select></div>
        <div className="field"><label htmlFor="el-weight">Kalınlık</label><select id="el-weight" value={element.weight} onChange={e=>changeElement({weight:Number(e.target.value)})}>{WEIGHTS.map(([w,l])=><option key={w} value={w}>{l}</option>)}</select></div>
      </div>
      <div className="field"><label>Yazı boyutu (px)</label><input type="number" min={8} max={500} value={element.fontSize} onChange={e=>changeElement({fontSize:clamp(Number(e.target.value),8,500)})}/></div>
      <div className="property-grid">
        {(['left','center','right'] as const).map(a=>{const Icon=a==='left'?AlignLeft:a==='center'?AlignCenter:AlignRight;const active=(element.align??'left')===a;return <button key={a} className={`btn btn-dark ${active?'active':''}`} aria-pressed={active} aria-label={`Metni ${a==='left'?'sola':a==='center'?'ortaya':'sağa'} hizala`} onClick={()=>changeElement({align:a})}><Icon size={15}/></button>;})}
        <label className="checkbox-row"><input type="checkbox" checked={!!element.italic} onChange={e=>changeElement({italic:e.target.checked})}/> İtalik</label>
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={!!element.shadow} onChange={e=>changeElement({shadow:e.target.checked})}/> Gölge</label>
      <div className="property-grid">
        <div className="field"><label>Kontur rengi</label><input type="color" value={element.strokeColor??'#000000'} onChange={e=>changeElement({strokeColor:e.target.value})}/></div>
        <div className="field"><label>Kontur (px)</label><input type="number" min={0} max={200} value={element.strokeWidth??0} onChange={e=>changeElement({strokeWidth:clamp(Number(e.target.value),0,200)})}/></div>
      </div>
    </>}
    <span className="small-heading">KONUM VE BOYUT</span>
    <div className="property-grid"><div className="field"><label>X (%)</label><input type="number" value={Math.round(element.x)} onChange={e=>changeElement({x:Number(e.target.value)})}/></div><div className="field"><label>Y (%)</label><input type="number" value={Math.round(element.y)} onChange={e=>changeElement({y:Number(e.target.value)})}/></div></div>
    <div className="property-grid"><div className="field"><label>Genişlik (%)</label><input type="number" value={Math.round(element.width*10)/10} onChange={e=>changeElement({width:Number(e.target.value)})}/></div><div className="field"><label>Yükseklik (%)</label><input type="number" value={Math.round(element.height*10)/10} onChange={e=>changeElement({height:Number(e.target.value)})}/></div></div>
    <div className="property-grid">
      <div className="field"><label htmlFor="el-rotation">Döndürme (°)</label><input id="el-rotation" type="number" min={-360} max={360} value={Math.round((element.rotation??0)*10)/10} onChange={e=>changeElement({rotation:clamp(Number(e.target.value),-360,360)})}/></div>
      <button className="btn btn-dark" title="Döndürmeyi sıfırla" aria-label="Döndürmeyi sıfırla" disabled={!element.rotation} onClick={()=>changeElement({rotation:0})}><RotateCcw size={15}/> Sıfırla</button>
    </div>
    <div className="field"><label htmlFor="el-opacity">Opaklık: {opacity}%</label><input id="el-opacity" type="range" min={5} max={100} step={1} value={opacity} onChange={e=>changeElement({opacity:clamp(Number(e.target.value),5,100)/100})}/></div>
    <div className="field"><label>{isText?'Metin rengi':'Şekil rengi'}</label><input type="color" value={isText?element.color:element.background} onChange={e=>changeElement(isText?{color:e.target.value}:{background:e.target.value})}/></div>
    <span className="small-heading">TUVALE HİZALA</span>
    <div className="property-grid">{ALIGNS.map(([how,label])=><button key={how} className="btn btn-dark" onClick={()=>onAlign(how)}>{label}</button>)}</div>
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
