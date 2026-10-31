import {useEffect,useMemo,useRef,useState} from 'react';
import {convertFileSrc,invoke,isTauri} from '@tauri-apps/api/core';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {open} from '@tauri-apps/plugin-dialog';
import {baseName,printChanged} from '../../core/audioMixModel';
import {kindFromPath,MEDIA_EXTENSIONS} from '../../core/mediaKinds';
import {detectKind,newId} from '../../core/project';
import type {AssetKind,MediaAsset,UpdateProject} from '../../core/types';

const revoke=(url:string)=>{if(url.startsWith('blob:'))URL.revokeObjectURL(url);};
type Print={size:number;fingerprint:string};
/** Dosya yoksa/okunamazsa null: parmak izi yalnız yeniden bağlama yardımıdır. */
const fingerprintOf=async(path:string):Promise<Print|null>=>{try{const [size,fingerprint]=await invoke<[number,string]>('file_fingerprint',{path});return {size,fingerprint};}catch{return null;}};
/** Kayıtlı yolları bu oturumda önizlenebilir yapar (uzantı beyaz listesi Rust tarafında zorunlu). */
const authorize=async(path:string)=>{try{await invoke('authorize_media',{path});return true;}catch{return false;}};
const dialogExtensions=(kind?:AssetKind)=>kind?MEDIA_EXTENSIONS.filter(e=>kindFromPath(`x.${e}`)?.kind===kind):MEDIA_EXTENSIONS;

/**
 * Medya kütüphanesi. Masaüstünde dosyalar yol + parmak iziyle kaydedilir ve diskten akıtılır (belleğe yüklenmez);
 * tarayıcı modunda yalnız oturum içi blob URL'leri vardır. Dosya baytları projeye asla yazılmaz.
 */
export function useMediaLibrary(assets:MediaAsset[],update:UpdateProject,setNotice:(text:string)=>void){
  const [urls,setUrls]=useState<Record<string,string>>({});
  const [problems,setProblems]=useState<Record<string,string>>({});
  const [selectedAsset,setSelectedAsset]=useState<string|null>(null);
  const [filter,setFilter]=useState<'all'|AssetKind>('all');
  const [busy,setBusy]=useState(false);
  const mediaInputRef=useRef<HTMLInputElement>(null);
  const urlsRef=useRef<Record<string,string>>({});
  useEffect(()=>{urlsRef.current=urls;},[urls]);
  useEffect(()=>()=>{Object.values(urlsRef.current).forEach(revoke);},[]);
  const library=useMemo(()=>assets.filter(a=>filter==='all'||a.kind===filter),[assets,filter]);

  // ---- Tarayıcı modu: oturum içi dosyalar ----
  const addMedia=(files:FileList|null)=>{
    if(!files?.length)return;
    const additions:MediaAsset[]=[];
    const newUrls:Record<string,string>={};
    for(const f of Array.from(files)){
      const kind=detectKind(f);
      if(!kind || f.size>2_000_000_000){setNotice(`Desteklenmeyen ya da çok büyük dosya: ${f.name}`);continue;}
      const id=newId();
      additions.push({id,name:f.name,kind,mimeType:f.type,size:f.size,addedAt:Date.now()});
      newUrls[id]=URL.createObjectURL(f);
    }
    if(!additions.length)return;
    update(p=>({...p,assets:[...p.assets,...additions]}));
    setUrls(old=>({...old,...newUrls}));
    setSelectedAsset(additions[0].id);
    setNotice(`${additions.length} dosya oturuma eklendi. JSON projeleri medya dosyalarını içermez.`);
    if(mediaInputRef.current)mediaInputRef.current.value='';
  };

  // ---- Masaüstü: yol + parmak izi ----
  const addFromDialog=async()=>{
    try{
      const chosen=await open({multiple:true,directory:false,title:'Medya dosyaları seç',filters:[{name:'Medya',extensions:dialogExtensions()}]});
      await addPaths(Array.isArray(chosen)?chosen:typeof chosen==='string'?[chosen]:[]);
    }catch(error){setNotice(error instanceof Error?error.message:String(error));}
  };
  /** Diyalogdan veya sürükle-bırakla gelen dosya yollarını kütüphaneye ekler (tür, parmak izi, tekrar kontrolü). */
  const addPaths=async(paths:string[])=>{
    if(!paths.length)return;
    setBusy(true);
    try{
      const additions:MediaAsset[]=[];const newUrls:Record<string,string>={};const skipped:string[]=[];
      for(const path of paths){
        const known=kindFromPath(path);
        if(!known){skipped.push(baseName(path));continue;}
        if(assets.some(a=>a.path===path)||additions.some(a=>a.path===path)){skipped.push(`${baseName(path)} (zaten ekli)`);continue;}
        const fp=await fingerprintOf(path);
        if(!fp){skipped.push(`${baseName(path)} (okunamadı)`);continue;}
        await authorize(path);
        const id=newId();
        additions.push({id,name:baseName(path),kind:known.kind,mimeType:known.mimeType,size:fp.size,addedAt:Date.now(),path,fingerprint:fp.fingerprint});
        newUrls[id]=convertFileSrc(path);
      }
      if(additions.length){
        update(p=>({...p,assets:[...p.assets,...additions]}));
        setUrls(old=>({...old,...newUrls}));
        setSelectedAsset(additions[0].id);
      }
      setNotice(additions.length?`${additions.length} dosya eklendi; dosya yolları projeyle kaydedilir (içerik kopyalanmaz).${skipped.length?` Atlanan: ${skipped.join(', ')}.`:''}`:skipped.length?`Eklenemedi: ${skipped.join(', ')}.`:'');
    }catch(error){setNotice(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };

  // Sürükle-bırak: masaüstünde Tauri olayı (gerçek yollar), tarayıcıda HTML5 dosyaları (oturum içi).
  const [dragging,setDragging]=useState(false);
  const addPathsRef=useRef(addPaths);addPathsRef.current=addPaths;
  const addMediaRef=useRef(addMedia);addMediaRef.current=addMedia;
  useEffect(()=>{
    if(isTauri()){
      let unlisten:(()=>void)|undefined;let cancelled=false;
      void getCurrentWebview().onDragDropEvent(e=>{
        const t=e.payload.type;
        if(t==='enter'||t==='over')setDragging(true);
        else if(t==='leave')setDragging(false);
        else if(t==='drop'){setDragging(false);void addPathsRef.current(e.payload.paths);}
      }).then(fn=>{if(cancelled)fn();else unlisten=fn;}).catch(()=>{});
      return()=>{cancelled=true;unlisten?.();};
    }
    const over=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();setDragging(true);}};
    const leave=(e:DragEvent)=>{if(!e.relatedTarget)setDragging(false);};
    const drop=(e:DragEvent)=>{if(e.dataTransfer?.files.length){e.preventDefault();setDragging(false);addMediaRef.current(e.dataTransfer.files);}};
    window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
  },[]);

  /** Proje açıldığında kayıtlı yolları yeniden doğrular: bulunanları önizlenebilir yapar, eksikleri işaretler. */
  const verifyAssets=async(list:MediaAsset[])=>{
    const withPath=list.filter(a=>a.path);
    if(!isTauri()||!withPath.length)return;
    setBusy(true);
    try{
      const found:Record<string,string>={};const bad:Record<string,string>={};const changed:string[]=[];
      for(const a of withPath){
        const fp=await fingerprintOf(a.path!);
        if(!fp){bad[a.id]='Dosya bulunamadı veya okunamadı.';continue;}
        if(!(await authorize(a.path!))){bad[a.id]='Dosya önizleme için açılamadı.';continue;}
        found[a.id]=convertFileSrc(a.path!);
        if(printChanged({size:a.size,fingerprint:a.fingerprint},fp))changed.push(a.name);
      }
      setUrls(found);setProblems(bad);
      const missing=Object.keys(bad).length;
      setNotice(`Medya doğrulandı: ${Object.keys(found).length} dosya hazır${missing?`, ${missing} dosya bulunamadı ("Yeniden bağla" veya "Klasörde ara")`:''}${changed.length?`. İçeriği değişmiş görünen: ${changed.join(', ')}`:''}.`);
    }finally{setBusy(false);}
  };

  const applyPatches=(patches:Record<string,Partial<MediaAsset>>,newUrls:Record<string,string>)=>{
    update(p=>({...p,assets:p.assets.map(a=>patches[a.id]?{...a,...patches[a.id]}:a)}));
    setUrls(old=>({...old,...newUrls}));
    setProblems(old=>{const c={...old};Object.keys(patches).forEach(id=>delete c[id]);return c;});
  };

  const relinkAsset=async(id:string)=>{
    const a=assets.find(x=>x.id===id);if(!a)return;
    setBusy(true);
    try{
      const path=await open({multiple:false,directory:false,title:`"${a.name}" için dosyayı seç`,filters:[{name:'Medya',extensions:dialogExtensions(a.kind)}]});
      if(typeof path!=='string')return;
      const known=kindFromPath(path);
      if(!known||known.kind!==a.kind){setNotice('Seçilen dosya türü bu kayıtla uyuşmuyor.');return;}
      const fp=await fingerprintOf(path);
      if(!fp){setNotice('Seçilen dosya okunamadı.');return;}
      await authorize(path);
      applyPatches({[id]:{path,name:baseName(path),size:fp.size,fingerprint:fp.fingerprint,mimeType:known.mimeType}},{[id]:convertFileSrc(path)});
      setNotice('Dosya yeniden bağlandı.');
    }catch(error){setNotice(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };

  /** Kullanıcının seçtiği klasörde (alt klasörler dahil) parmak iziyle eşleşen eksik dosyaları toplu bulur. */
  const relinkFromFolder=async()=>{
    setBusy(true);
    try{
      const folder=await open({multiple:false,directory:true,title:'Eksik dosyaların taşındığı klasörü seç (alt klasörler de aranır)'});
      if(typeof folder!=='string')return;
      const targets=assets.filter(a=>!urls[a.id]);
      const patches:Record<string,Partial<MediaAsset>>={};const newUrls:Record<string,string>={};
      let notFound=0,noPrint=0;
      for(const a of targets){
        if(!a.fingerprint||!a.size){noPrint++;continue;}
        const hits=await invoke<string[]>('find_moved_media',{folder,size:a.size,fingerprint:a.fingerprint,name:a.name});
        const path=hits[0];
        if(!path||!(await authorize(path))){notFound++;continue;}
        patches[a.id]={path,name:baseName(path)};newUrls[a.id]=convertFileSrc(path);
      }
      if(Object.keys(patches).length)applyPatches(patches,newUrls);
      setNotice(`${Object.keys(patches).length} dosya yeniden bağlandı${notFound?`, ${notFound} dosya bu klasörde bulunamadı`:''}${noPrint?`, ${noPrint} kaydın parmak izi yok ("Yeniden bağla" kullan)`:''}.`);
    }catch(error){setNotice(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };

  const removeAsset=(id:string)=>{
    if(urls[id])revoke(urls[id]);
    setUrls(u=>{const copy={...u};delete copy[id];return copy;});
    setProblems(p=>{const copy={...p};delete copy[id];return copy;});
    update(p=>({...p,assets:p.assets.filter(a=>a.id!==id)}));
    if(selectedAsset===id)setSelectedAsset(null);
  };
  /** Başka bir proje açılırken oturum medyasını bırakır. */
  const clearSession=()=>{Object.values(urlsRef.current).forEach(revoke);setUrls({});setProblems({});setSelectedAsset(null);};
  return {dragging,urls,problems,busy,selectedAsset,setSelectedAsset,filter,setFilter,library,addMedia,addFromDialog,verifyAssets,relinkAsset,relinkFromFolder,removeAsset,clearSession,mediaInputRef};
}
