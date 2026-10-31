import {useEffect,useRef,useState} from 'react';
import type {ChangeEvent} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {open,save} from '@tauri-apps/plugin-dialog';
import {buildManifest,fromPortableProject,isAbsolutePath,mapProjectPaths,projectMediaPaths,toPortableProject} from '../../core/packagePaths';
import {parseProject,projectFileName,saveProjectJson,serializeProject} from '../../core/project';
import type {ProjectDocument} from '../../core/types';

/** [yol, ad, açılış zamanı, dosya/klasör hâlâ var mı] */
export type RecentProject=[path:string,name:string,openedAt:number,exists:boolean];
/** `.voxcut` uzantılı yol bir paket klasörüdür; `.json` uzantılı yol tek dosyalı projedir. */
export const isPackagePath=(path:string)=>/\.voxcut$/i.test(path);

type Options={
  project:ProjectDocument;
  setProject:(p:ProjectDocument)=>void;
  setNotice:(text:string)=>void;
  undo:()=>void;
  redo:()=>void;
  resetHistory:()=>void;
  /** Bir proje yüklendikten sonra çağrılır (medya oturumunu bırak, seçimleri sıfırla, bildirim göster). */
  onLoaded:(parsed:ProjectDocument)=>void;
};

/** Proje dosyası yaşam döngüsü: aç / kaydet / farklı kaydet (JSON veya .voxcut paketi), otomatik kayıt, kurtarma, son projeler, kısayollar. */
export function useProjectFiles({project,setProject,setNotice,undo,redo,resetHistory,onLoaded}:Options){
  const [projectPath,setProjectPath]=useState('');
  const [savedStamp,setSavedStamp]=useState(0);
  const [recovery,setRecovery]=useState<string|null>(()=>{try{return localStorage.getItem('voxcut.recovery');}catch{return null;}});
  const projectInputRef=useRef<HTMLInputElement>(null);
  const dirty=savedStamp!==project.updatedAt;
  const isPackage=isPackagePath(projectPath);

  // Son projeler (yerel SQLite, yalnız yol/ad/zaman). Veritabanı hatası kaydetme/açmayı asla engellemez.
  const [recent,setRecent]=useState<RecentProject[]>([]);
  const [recentOpen,setRecentOpen]=useState(false);
  const refreshRecent=()=>{if(isTauri())invoke<RecentProject[]>('recent_projects_list').then(setRecent).catch(()=>setRecent([]));};
  const touchRecent=(path:string,name:string)=>{if(isTauri()&&path)invoke('recent_projects_touch',{path,name}).then(refreshRecent).catch(()=>{});};
  useEffect(()=>{refreshRecent();},[]);

  const applyParsed=(parsed:ProjectDocument,path:string)=>{
    resetHistory();setProject(parsed);setSavedStamp(parsed.updatedAt);setProjectPath(path);
    onLoaded(parsed);
    return parsed;
  };
  const applyProject=(text:string,path:string)=>{
    if(text.length>10_000_000)throw new Error('Proje JSON dosyası 10 MB sınırını aşıyor.');
    return applyParsed(parseProject(JSON.parse(text)),path);
  };
  const importProject=async(e:ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];if(!f)return;
    try{applyProject(await f.text(),'');}catch(err){setNotice(err instanceof Error?err.message:'Proje açılamadı.');}
    e.target.value='';
  };
  const clearRecovery=()=>{try{localStorage.removeItem('voxcut.recovery');}catch{/* depolama kapalı olabilir */}setRecovery(null);};
  const restoreRecovery=()=>{
    if(!recovery)return;
    try{applyProject(recovery,'');clearRecovery();}catch(err){setNotice(err instanceof Error?err.message:'Kurtarma açılamadı.');}
  };
  const loadProjectFile=async(path:string)=>{
    const parsed=applyProject(await invoke<string>('read_project_file',{path}),path);
    touchRecent(path,parsed.name);
  };
  /** Paket klasöründen okur; pakete göreli medya yolları bu klasöre göre mutlak yapılır. */
  const loadPackage=async(dir:string)=>{
    const [projectJson]=await invoke<[string,string]>('read_package',{dir});
    if(projectJson.length>10_000_000)throw new Error('Paketteki proje 10 MB sınırını aşıyor.');
    const parsed=fromPortableProject(parseProject(JSON.parse(projectJson)),dir);
    applyParsed(parsed,dir);
    touchRecent(dir,parsed.name);
  };
  const confirmDiscard=()=>!dirty||window.confirm('Kaydedilmemiş değişiklikler var. Yine de başka proje açılsın mı?');
  const openRecent=async(path:string,exists:boolean)=>{
    setRecentOpen(false);
    if(!exists){setNotice('Bu proje artık yerinde yok. Listeden kaldırabilir veya "Proje Aç" / "Paket" menüsüyle yeni yerini seçebilirsin.');return;}
    if(!confirmDiscard())return;
    try{await (isPackagePath(path)?loadPackage(path):loadProjectFile(path));}catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };
  const forgetRecent=(path:string)=>{invoke('recent_projects_forget',{path}).then(refreshRecent).catch(()=>{});};
  const openProject=async()=>{
    if(!isTauri()){projectInputRef.current?.click();return;}
    if(!confirmDiscard())return;
    try{
      const chosen=await open({multiple:false,directory:false,title:'Proje aç',filters:[{name:'VoxCut projesi',extensions:['json']}]});
      if(typeof chosen!=='string')return;
      await loadProjectFile(chosen);
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };
  const openPackage=async()=>{
    if(!isTauri()){setNotice('Paket açma yalnız masaüstü uygulamasında çalışır.');return;}
    if(!confirmDiscard())return;
    try{
      const chosen=await open({multiple:false,directory:true,title:'VoxCut paketini (.voxcut klasörü) seç'});
      if(typeof chosen!=='string')return;
      await loadPackage(chosen);
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };

  /** Paketi yazar: içerideki medya yolları göreli saklanır, manifest ve yedek Rust tarafında atomik yazılır. */
  const writePackage=async(dir:string)=>{
    const stored=toPortableProject(project,dir);
    return invoke<string>('write_package',{dir,projectJson:serializeProject(stored),manifestJson:JSON.stringify(buildManifest(stored,Date.now()))});
  };
  const savePackage=async(forceDialog=false)=>{
    if(!isTauri()){setNotice('Paket kaydetme yalnız masaüstü uygulamasında çalışır.');return;}
    try{
      let dir=forceDialog||!isPackage?'':projectPath;
      if(!dir){
        const base=projectFileName(project.name).replace(/\.voxcut\.json$/i,'');
        const chosen=await save({title:'Paket olarak kaydet (.voxcut klasörü oluşturulur)',defaultPath:`${base}.voxcut`,filters:[{name:'VoxCut paketi',extensions:['voxcut']}]});
        if(!chosen)return;
        dir=isPackagePath(chosen)?chosen:`${chosen}.voxcut`;
      }
      const msg=await writePackage(dir);
      setProjectPath(dir);setSavedStamp(project.updatedAt);clearRecovery();setNotice(msg);touchRecent(dir,project.name);
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };

  /**
   * Projedeki tüm medyayı paketin media/ klasörüne KOPYALAR (kaynaklar silinmez/değişmez). Önce kuru çalıştırma ile boyut ve
   * boş disk alanı gösterilip onay alınır; kopyalar boyut + parmak iziyle doğrulanır; hata olursa hepsi geri alınır.
   */
  const collectingRef=useRef(false);
  const collectMedia=async()=>{
    if(!isTauri()||!isPackage){setNotice('Önce projeyi paket olarak kaydet (Paket menüsü → Paket olarak kaydet).');return;}
    if(collectingRef.current)return;
    const sources=[...new Set(projectMediaPaths(project).filter(isAbsolutePath))];
    if(!sources.length){setNotice('Pakete kopyalanacak medya yok (yolu kayıtlı dosya bulunamadı).');return;}
    collectingRef.current=true;
    try{
      type Result=[[string,string][],number,number];
      const [, total, free]=await invoke<Result>('collect_media',{dir:projectPath,sources,dryRun:true});
      const mb=(n:number)=>`${(n/1_048_576).toFixed(1)} MB`;
      if(total>0&&!window.confirm(`${mb(total)} medya pakete kopyalanacak (pakette zaten olanlar atlanır).\n${free?`Boş disk alanı: ${mb(free)}.\n`:''}Kaynak dosyalar silinmez ve değişmez. Büyük dosyalarda bu işlem dakikalar sürebilir ve iptal edilemez.\n\nDevam edilsin mi?`))return;
      setNotice('Medya pakete kopyalanıyor… Lütfen bekle.');
      const [mapping,copied]=await invoke<Result>('collect_media',{dir:projectPath,sources,dryRun:false});
      const map=new Map(mapping);
      setProject({...mapProjectPaths(project,p=>map.get(p)??p),updatedAt:Date.now()});
      setNotice(copied>0?`${mb(copied)} medya pakete kopyalandı; yollar birazdan otomatik kaydedilir ve pakete göreli olur.`:'Medya zaten pakette; yollar pakete göre düzenlendi.');
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
    finally{collectingRef.current=false;}
  };

  /** Paketin yedekleri (en yeni başta): [dosya adı, zaman damgası ms, bayt]. Menü açılınca yenilenir. */
  const [backups,setBackups]=useState<[name:string,millis:number,bytes:number][]>([]);
  const refreshBackups=()=>{
    if(!isTauri()||!isPackage){setBackups([]);return;}
    invoke<[string,number,number][]>('list_backups',{dir:projectPath}).then(setBackups).catch(()=>setBackups([]));
  };
  /** Seçilen yedeği geri yükler; mevcut durum önce ayrı bir yedek olarak saklanır, sonra paket yeniden açılır. */
  const restoreBackup=async(name:string)=>{
    if(!isTauri()||!isPackage)return;
    if(!window.confirm('Bu yedek geri yüklensin mi?\n\nŞu anki durum da otomatik olarak yeni bir yedek olarak saklanır; istersen ona geri dönebilirsin.'))return;
    try{
      const msg=await invoke<string>('restore_backup',{dir:projectPath,name});
      await loadPackage(projectPath);
      setNotice(msg);
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };

  const saveProject=async(forceDialog=false)=>{
    if(!isTauri()){saveProjectJson(project);setSavedStamp(project.updatedAt);setNotice('Proje JSON olarak indirildi.');return;}
    if(isPackage){await savePackage(forceDialog);return;}
    try{
      let path=forceDialog?'':projectPath;
      if(!path){
        const chosen=await save({title:'Projeyi kaydet',defaultPath:projectFileName(project.name),filters:[{name:'VoxCut projesi',extensions:['json']}]});
        if(!chosen)return;
        path=/\.json$/i.test(chosen)?chosen:`${chosen}.voxcut.json`;
      }
      const msg=await invoke<string>('write_project_file',{path,contents:serializeProject(project)});
      setProjectPath(path);setSavedStamp(project.updatedAt);clearRecovery();setNotice(msg);touchRecent(path,project.name);
    }catch(err){setNotice(err instanceof Error?err.message:String(err));}
  };

  // Otomatik kayıt: dosya/paket seçildiyse 2 sn sonra aynı yere; seçilmediyse yerel kurtarma kopyası (yalnız yol+ayar, medya baytı yok).
  useEffect(()=>{
    if(!dirty)return;
    const id=window.setTimeout(()=>{
      if(isTauri()&&projectPath){
        const done=isPackagePath(projectPath)?writePackage(projectPath):invoke<string>('write_project_file',{path:projectPath,contents:serializeProject(project)});
        done.then(()=>setSavedStamp(project.updatedAt)).catch(err=>setNotice(`Otomatik kayıt başarısız: ${String(err)}`));
      }else{
        try{localStorage.setItem('voxcut.recovery',serializeProject(project));}catch{/* depolama dolu/kapalı */}
      }
    },2000);
    return()=>window.clearTimeout(id);
    // writePackage/setNotice her render yeniden oluşur; yalnız proje, yol ve kirli durumu değişince yeniden planlanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[project,projectPath,dirty]);

  // Kısayollar: Ctrl+S kaydet, Ctrl+Z geri al, Ctrl+Shift+Z / Ctrl+Y yinele. Metin alanlarında tarayıcının kendi geri alması korunur.
  const actionsRef=useRef({undo,redo,save:()=>saveProject()});
  actionsRef.current={undo,redo,save:()=>saveProject()};
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(!(e.ctrlKey||e.metaKey))return;
      const key=e.key.toLowerCase();
      const t=e.target as HTMLElement|null;
      const typing=!!t&&(t.tagName==='TEXTAREA'||t.isContentEditable||(t.tagName==='INPUT'&&/^(text|number|search|email|url|password|tel)$/.test((t as HTMLInputElement).type)));
      if(key==='s'){e.preventDefault();void actionsRef.current.save();return;}
      if(typing)return;
      if(key==='z'&&!e.shiftKey){e.preventDefault();actionsRef.current.undo();}
      else if(key==='y'||(key==='z'&&e.shiftKey)){e.preventDefault();actionsRef.current.redo();}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);

  return {dirty,projectPath,isPackage,recovery,restoreRecovery,clearRecovery,recent,recentOpen,setRecentOpen,refreshRecent,openRecent,forgetRecent,openProject,openPackage,savePackage,collectMedia,backups,refreshBackups,restoreBackup,saveProject,importProject,projectInputRef};
}
