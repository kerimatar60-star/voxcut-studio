import {useRef} from 'react';
import {newId} from '../../core/project';
import {saveExport} from '../../core/saveFile';
import {cuesToSrt,cuesToVtt,parseSubtitles} from '../../core/subtitles';
import type {SubtitleCue,UpdateProject} from '../../core/types';

type Options={subtitles:SubtitleCue[];projectName:string;update:UpdateProject;setNotice:(text:string)=>void;currentTime:number};

/** Altyazı düzenleme, SRT/VTT dışa ve içe aktarma. */
export function useSubtitles({subtitles,projectName,update,setNotice,currentTime}:Options){
  const subtitleInputRef=useRef<HTMLInputElement>(null);
  const addCue=()=>{const start=Math.round(currentTime*10)/10;const newCue={id:newId(),start,end:start+2.5,text:'Yeni altyazı'};update(p=>({...p,subtitles:[...p.subtitles,newCue].sort((a,b)=>a.start-b.start)}));};
  const updateCue=(id:string,changes:Partial<SubtitleCue>)=>update(p=>({...p,subtitles:p.subtitles.map(c=>c.id===id?{...c,...changes}:c)}));
  const removeCue=(id:string)=>update(p=>({...p,subtitles:p.subtitles.filter(c=>c.id!==id)}));
  const saveAs=async(blob:Blob,fileName:string,filterName:string)=>{
    try{const r=await saveExport(blob,fileName,filterName);if(r.saved)setNotice(`Kaydedildi: ${r.where}`);}
    catch(error){setNotice(error instanceof Error?error.message:String(error));}
  };
  const baseName=projectName.replace(/[^a-zA-Z0-9-_\p{L}]/gu,'_').replace(/^_+|_+$/g,'')||'altyazi';
  const exportSrt=()=>{
    const valid=subtitles.filter(c=>c.start>=0 && c.end>c.start && c.text.trim());
    if(!valid.length){setNotice('Önce geçerli bir altyazı gir.');return;}
    void saveAs(new Blob([cuesToSrt(valid)],{type:'text/plain;charset=utf-8'}),`${baseName}.srt`,'SRT altyazı');
  };
  const exportVtt=()=>{
    const vtt=cuesToVtt(subtitles);
    if(!vtt){setNotice('Önce geçerli bir altyazı gir.');return;}
    void saveAs(new Blob([vtt],{type:'text/vtt;charset=utf-8'}),`${baseName}.vtt`,'WebVTT altyazı');
  };
  const applyImported=(text:string,verb:string)=>{
    const {cues,skipped}=parseSubtitles(text,newId);
    const existing=subtitles.length;
    const replace=existing>0&&window.confirm(`Mevcut ${existing} altyazı silinip ${cues.length} yeni altyazıyla değiştirilsin mi?\n\nİptal: mevcut altyazılara eklenir.`);
    update(p=>({...p,subtitles:(replace?cues:[...p.subtitles,...cues]).sort((a,b)=>a.start-b.start)}));
    setNotice(`${cues.length} altyazı ${replace?'değiştirilerek':existing?'eklenerek':''} ${verb}${skipped?`, ${skipped} geçersiz blok atlandı`:''}.`.replace('  ',' '));
  };
  const importSubtitles=async(files:FileList|null)=>{
    const file=files?.[0];
    if(subtitleInputRef.current)subtitleInputRef.current.value='';
    if(!file)return;
    if(!/\.(srt|vtt)$/i.test(file.name)){setNotice('Yalnızca .srt veya .vtt dosyası seçebilirsin.');return;}
    if(file.size===0||file.size>2_000_000){setNotice('Altyazı dosyası boş veya 2 MB sınırından büyük.');return;}
    try{applyImported(await file.text(),'içe aktarıldı');}
    catch(error){setNotice(error instanceof Error?error.message:'Altyazı dosyası okunamadı.');}
  };
  /** Otomatik tanımadan gelen SRT metnini aynı kurallarla (değiştir/ekle onayı) projeye alır. */
  const importSrtText=(text:string)=>{
    try{applyImported(text,'otomatik oluşturuldu');}
    catch(error){setNotice(error instanceof Error?error.message:'Altyazı çıktısı okunamadı.');}
  };
  return {subtitleInputRef,addCue,updateCue,removeCue,exportSrt,exportVtt,importSubtitles,importSrtText};
}
