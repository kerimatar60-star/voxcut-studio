import type { DesignElement, MediaAsset, ProjectDocument, SubtitleCue } from './types';

import { parseAudioMix, printOf } from './audioMixModel';
import { isFontFamily } from './designText';

const now = () => Date.now();
export const newId = () => crypto.randomUUID();
export const exampleProject = (): ProjectDocument => ({
  schemaVersion: 1,
  id: newId(), name: 'İlk Projem', createdAt: now(), updatedAt: now(),
  design: {
    width: 1280, height: 720, background: '#1b1d3b', elements: [
      { id: newId(), kind: 'ellipse', x: 74, y: 12, width: 27, height: 48, text: '', color: '#ffffff', background: '#8164f8', fontSize: 32, weight: 600 },
      { id: newId(), kind: 'rectangle', x: 7, y: 17, width: 10, height: 4, text: '', color: '#ffffff', background: '#bca8ff', fontSize: 32, weight: 600 },
      { id: newId(), kind: 'text', x: 7, y: 30, width: 75, height: 29, text: 'Hikâyeni\ntasarla.', color: '#ffffff', background: 'transparent', fontSize: 83, weight: 800 },
      { id: newId(), kind: 'text', x: 7, y: 71, width: 72, height: 12, text: 'VoxCut Studio • Yaratıcılık sınır tanımaz', color: '#c5c9eb', background: 'transparent', fontSize: 26, weight: 500 },
    ]
  },
  assets: [], subtitles: [{id: newId(),start: 0,end: 2.8,text: 'VoxCut Studio ile üretmeye başla.'}]
});
export function makeElement(kind: DesignElement['kind']): DesignElement {
  return {id:newId(),kind,x:22,y:28,width:50,height:kind==='text'?20:35,text:kind==='text'?'Yeni metin':'',color:'#ffffff',background:kind==='rectangle'?'#7355e9':'#f88ac7',fontSize:52,weight:700};
}
export function detectKind(file: File): MediaAsset['kind'] | null {
  if(file.type.startsWith('image/')) return 'image';
  if(file.type.startsWith('video/')) return 'video';
  if(file.type.startsWith('audio/')) return 'audio';
  return null;
}
export function parseProject(input: unknown): ProjectDocument {
  if (!input || typeof input !== 'object') throw new Error('Geçersiz proje verisi.');
  const value = input as Record<string,unknown>;
  if(value.schemaVersion !== 1 || typeof value.name !== 'string' || !value.design || !Array.isArray(value.assets) || !Array.isArray(value.subtitles)) throw new Error('Bu proje dosyası desteklenmiyor.');
  const design = value.design as Record<string,unknown>;
  if (!Array.isArray(design.elements) || typeof design.background !== 'string') throw new Error('Tasarım içeriği geçersiz.');
  if (design.elements.length > 2000 || value.assets.length > 5000 || value.subtitles.length > 10000) throw new Error('Proje sınırları aşıldı.');
  const width = Number(design.width), height = Number(design.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width<1 || width>16384 || height<1 || height>16384) throw new Error('Tuval boyutu geçersiz.');
  const elements:DesignElement[] = design.elements.map((el:unknown) => {
    if (!el || typeof el !== 'object') throw new Error('Geçersiz katman.');
    const e = el as Record<string,unknown>;
    if (!['text','rectangle','ellipse'].includes(String(e.kind))) throw new Error('Desteklenmeyen katman.');
    if (![e.x,e.y,e.width,e.height,e.fontSize,e.weight].every(v => typeof v==='number' && Number.isFinite(v))) throw new Error('Katman ölçüleri geçersiz.');
    const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):undefined;
    const opacity=num(e.opacity,0.05,1),rotation=num(e.rotation,-360,360),strokeWidth=num(e.strokeWidth,0,200);
    const extras:Partial<DesignElement>={
      ...(isFontFamily(e.fontFamily)?{fontFamily:e.fontFamily}:{}),
      ...(e.align==='left'||e.align==='center'||e.align==='right'?{align:e.align}:{}),
      ...(e.italic===true?{italic:true}:{}),
      ...(e.shadow===true?{shadow:true}:{}),
      ...(typeof e.strokeColor==='string'&&/^#[0-9a-fA-F]{3,8}$/.test(e.strokeColor)?{strokeColor:e.strokeColor}:{}),
      ...(strokeWidth!==undefined&&strokeWidth>0?{strokeWidth}:{}),
      ...(opacity!==undefined&&opacity<1?{opacity}:{}),
      ...(rotation!==undefined&&rotation!==0?{rotation}:{}),
    };
    return { id:String(e.id).slice(0,120), kind:e.kind as DesignElement['kind'], x:Number(e.x), y:Number(e.y), width:Number(e.width), height:Number(e.height), text:String(e.text ?? '').slice(0,3000), color:String(e.color ?? '#ffffff').slice(0,80), background:String(e.background ?? '#7355e9').slice(0,80),fontSize:Number(e.fontSize),weight:Number(e.weight),...extras};
  });
  const assets:MediaAsset[] = value.assets.map((asset:unknown) => {
    if (!asset || typeof asset!=='object') throw new Error('Medya kaydı geçersiz.');
    const a = asset as Record<string,unknown>;
    if (!['video','audio','image'].includes(String(a.kind))) throw new Error('Medya türü geçersiz.');
    const size=Number(a.size)||0;
    const path=typeof a.path==='string'?a.path.replace(/\0/g,'').slice(0,1024):'';
    const print=printOf(size,a.fingerprint);
    return {id:String(a.id).slice(0,120), name:String(a.name).slice(0,250), kind:a.kind as MediaAsset['kind'],mimeType:String(a.mimeType).slice(0,120),size,addedAt:Number(a.addedAt)||0,...(path?{path}:{}),...(print.fingerprint?{fingerprint:print.fingerprint}:{})};
  });
  const subtitles:SubtitleCue[] = value.subtitles.map((cue:unknown)=> {
    if (!cue || typeof cue!=='object') throw new Error('Altyazı geçersiz.');
    const c=cue as Record<string,unknown>; const start=Number(c.start),end=Number(c.end);
    if (!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start) throw new Error('Altyazı zaman aralığı geçersiz.');
    return {id:String(c.id).slice(0,120),start,end,text:String(c.text).slice(0,2000)};
  });
  const audioMix=parseAudioMix(value.audioMix);
  return {
    schemaVersion:1,id:String(value.id ?? newId()).slice(0,120),name:value.name.slice(0,200),createdAt:Number(value.createdAt)||now(),updatedAt:now(),
    design:{width,height,background:design.background.slice(0,80),elements},assets,subtitles,
    ...(audioMix?{audioMix}:{})
  };
}
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export const serializeProject=(doc:ProjectDocument)=>JSON.stringify({...doc,updatedAt:now()},null,2);
export const projectFileName=(name:string)=>`${name.replace(/[^a-zA-Z0-9-_\p{L}]/gu,'_') || 'voxcut'}.voxcut.json`;
export function saveProjectJson(doc:ProjectDocument){
  downloadFile(new Blob([JSON.stringify({...doc,updatedAt:now()},null,2)],{type:'application/json'}), `${doc.name.replace(/[^a-zA-Z0-9-_\p{L}]/gu,'_') || 'voxcut'}.voxcut.json`);
}
