import type {CSSProperties} from 'react';
import {fontStack,LINE_HEIGHT} from '../../core/designText';
import type {DesignElement,ProjectDocument} from '../../core/types';

/** Önizleme stili: dışa aktarma ile aynı kurallar (dönme, opaklık, yazı tipi, hizalama, gölge, kontur). Yazı boyutu tuval genişliğine göre `cqw`. */
export function elementStyle(el:Omit<DesignElement,'id'>,design:Pick<ProjectDocument['design'],'width'>):CSSProperties{
  const style:CSSProperties={left:`${el.x}%`,top:`${el.y}%`,width:`${el.width}%`,height:`${el.height}%`,color:el.color,background:el.kind==='text'||el.kind==='image'?'transparent':el.background,fontSize:`${el.fontSize/design.width*100}cqw`,fontWeight:el.weight,lineHeight:LINE_HEIGHT};
  if(el.opacity!==undefined)style.opacity=el.opacity;
  if(el.rotation)style.transform=`rotate(${el.rotation}deg)`;
  if(el.kind==='text'){
    style.fontFamily=fontStack(el.fontFamily);style.textAlign=el.align??'left';style.overflowWrap='anywhere';
    if(el.italic)style.fontStyle='italic';
    if(el.shadow)style.textShadow='0 0.05em 0.12em rgba(0,0,0,0.55)';
    if(el.strokeWidth){style.WebkitTextStroke=`${el.strokeWidth/design.width*100}cqw ${el.strokeColor??'#000000'}`;style.paintOrder='stroke fill';}
  }
  return style;
}
