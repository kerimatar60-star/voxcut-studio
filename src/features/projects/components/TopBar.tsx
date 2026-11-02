import {useState} from 'react';
import {ChevronDown,Clock3,Download,FolderOpen,HelpCircle,Moon,Package,Redo2,Save,Sun,Undo2,Video} from 'lucide-react';
import {isTauri} from '@tauri-apps/api/core';
import type {RecentProject} from '../useProjectFiles';

type Props={
  name:string;onRename:(name:string)=>void;
  dirty:boolean;projectPath:string;isPackage:boolean;
  histInfo:{undo:number;redo:number};undo:()=>void;redo:()=>void;
  recent:RecentProject[];recentOpen:boolean;setRecentOpen:(open:boolean|((o:boolean)=>boolean))=>void;refreshRecent:()=>void;
  openRecent:(path:string,exists:boolean)=>void;forgetRecent:(path:string)=>void;
  openProject:()=>void;openPackage:()=>void;savePackage:(forceDialog?:boolean)=>void;collectMedia:()=>void;
  backups:[name:string,millis:number,bytes:number][];refreshBackups:()=>void;restoreBackup:(name:string)=>void;saveProject:(forceDialog?:boolean)=>void;
  onExport:()=>void;onHelp:()=>void;
  theme:'dark'|'light';onToggleTheme:()=>void;
};

export function TopBar(p:Props){
  const {dirty,projectPath,histInfo,recent,recentOpen}=p;
  const [packageOpen,setPackageOpen]=useState(false);
  const pick=(fn:()=>void)=>()=>{setPackageOpen(false);fn();};
  return <header className="topbar">
    <div className="top-title"><div className="tiny-mark"><Video size={16}/></div><b>VoxCut <span>Studio</span></b><span className="version">ALFA {__APP_VERSION__}</span></div>
    <div className="project-title"><input aria-label="Proje adı" value={p.name} maxLength={80} onChange={e=>p.onRename(e.target.value)}/><ChevronDown size={15}/><span className="saved-dot" style={dirty?{background:'#e9b44c',boxShadow:'0 0 0 3px #7a5a1a33'}:undefined} title={dirty?(projectPath?'Değişiklikler birazdan otomatik kaydedilecek':'Kaydedilmemiş değişiklikler'):(projectPath?`Kaydedildi: ${projectPath}`:'Yerel oturum')}/></div>
    <div className="actions">
      <button className="btn btn-dark" onClick={p.undo} disabled={!histInfo.undo} title="Geri al (Ctrl+Z)" aria-label="Geri al"><Undo2 size={16}/></button>
      <button className="btn btn-dark" onClick={p.redo} disabled={!histInfo.redo} title="Yinele (Ctrl+Shift+Z)" aria-label="Yinele"><Redo2 size={16}/></button>
      {isTauri()&&<span className="recent-wrap"><button className="btn btn-dark" onClick={()=>{p.refreshRecent();p.setRecentOpen(o=>!o);setPackageOpen(false);}} aria-expanded={recentOpen} aria-haspopup="menu"><Clock3 size={16}/> <span>Son projeler</span><ChevronDown size={14}/></button>
        {recentOpen&&<div className="recent-menu" role="menu">{recent.length?recent.map(([path,name,,exists])=><div key={path} className={`recent-item ${exists?'':'missing'}`}><button role="menuitem" onClick={()=>p.openRecent(path,exists)} title={path}><strong>{name||'Adsız proje'}</strong><small>{exists?path.split(/[\\/]/).slice(-2).join(' / '):'Dosya bulunamadı'}</small></button><button className="recent-forget" onClick={()=>p.forgetRecent(path)} title="Listeden kaldır" aria-label="Listeden kaldır">×</button></div>):<p className="recent-empty">Henüz kayıtlı proje yok. Bir projeyi kaydedince burada görünür.</p>}</div>}</span>}
      {isTauri()&&<span className="recent-wrap"><button className="btn btn-dark" onClick={()=>{if(!packageOpen)p.refreshBackups();setPackageOpen(o=>!o);p.setRecentOpen(false);}} aria-expanded={packageOpen} aria-haspopup="menu" title="Taşınabilir .voxcut paketi"><Package size={16}/> <span>Paket</span><ChevronDown size={14}/></button>
        {packageOpen&&<div className="recent-menu" role="menu">
          <div className="recent-item"><button role="menuitem" onClick={pick(()=>p.savePackage(!p.isPackage))}><strong>{p.isPackage?'Pakete kaydet':'Paket olarak kaydet…'}</strong><small>Yedekli, taşınabilir .voxcut klasörü</small></button></div>
          {p.isPackage&&<div className="recent-item"><button role="menuitem" onClick={pick(()=>p.savePackage(true))}><strong>Paketi farklı kaydet…</strong><small>Yeni bir .voxcut klasörü oluşturur</small></button></div>}
          {p.isPackage&&<div className="recent-item"><button role="menuitem" onClick={pick(p.collectMedia)}><strong>Medyayı pakete kopyala…</strong><small>Dosyalar media/ klasörüne kopyalanır, kaynaklar silinmez</small></button></div>}
          {p.isPackage&&<><p className="recent-empty"><strong>Yedekler</strong>{p.backups.length?'':' — henüz yedek yok (5 dakikada bir alınır, en çok 10).'}</p>
            {p.backups.map(([name,millis,bytes])=><div key={name} className="recent-item"><button role="menuitem" onClick={pick(()=>p.restoreBackup(name))} title={name}><strong>{new Date(millis).toLocaleString('tr-TR')}</strong><small>{(bytes/1024).toFixed(0)} KB · geri yükle</small></button></div>)}</>}
          <div className="recent-item"><button role="menuitem" onClick={pick(p.openPackage)}><strong>Paket aç…</strong><small>Bir .voxcut klasörünü seç</small></button></div>
          <p className="recent-empty">Paket içindeki medya göreli yolla saklanır; klasörü taşırsan açılışta çözülür. Dışarıdaki dosyalar mutlak yolla kalır.</p>
        </div>}</span>}
      <button className="btn btn-dark" onClick={p.openProject}><FolderOpen size={16}/> <span>Proje Aç</span></button>
      <button className="btn btn-dark" onClick={()=>p.saveProject()}><Save size={16}/> <span>{isTauri()?'Kaydet':'Projeyi kaydet'}</span></button>
      {isTauri()&&projectPath&&<button className="btn btn-dark" onClick={()=>p.saveProject(true)}><span>Farklı Kaydet</span></button>}
      <button className="btn btn-dark" onClick={p.onHelp}><HelpCircle size={16}/> <span>Yardım</span></button>
      <button className="btn btn-dark btn-icon" onClick={p.onToggleTheme} title={p.theme==='dark'?'Açık temaya geç':'Koyu temaya geç'} aria-label={p.theme==='dark'?'Açık temaya geç':'Koyu temaya geç'}>{p.theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</button>
      <button className="btn btn-primary" onClick={p.onExport}><Download size={16}/> Dışa Aktar</button>
    </div>
  </header>;
}
