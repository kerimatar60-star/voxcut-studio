import {useCallback,useEffect,useRef,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {BookOpen,Check,Mic2,Scissors,Settings2,ShieldCheck,Video,WandSparkles} from 'lucide-react';
import {exampleProject} from './core/project';
import {exportDesign} from './core/designExport';
import type {ExportFormat} from './core/designExport';
import {emptyAudioMix} from './core/audioMixModel';
import {emptyTimeline} from './core/timelineModel';
import type {TimelineState} from './core/timelineModel';
import type {AudioMixState} from './core/audioMixModel';
import type {MediaAsset,ProjectDocument,UpdateProject,Workspace} from './core/types';
import {measureImage} from './core/imageSize';
import {describeToolProblems} from './core/toolCheck';
import type {ToolCheck} from './core/toolCheck';
import {tabs} from './shared/workspaces';
import {AudioMixPanel} from './features/audio/components/AudioMixPanel';
import {DesignProperties} from './features/design/components/DesignProperties';
import {DesignStage} from './features/design/components/DesignStage';
import {DesignTools} from './features/design/components/DesignTools';
import {useDesignActions} from './features/design/useDesignActions';
import {MediaLibrary} from './features/library/components/MediaLibrary';
import {useMediaLibrary} from './features/library/useMediaLibrary';
import {TopBar} from './features/projects/components/TopBar';
import {useProjectFiles} from './features/projects/useProjectFiles';
import {useProjectHistory} from './features/projects/useProjectHistory';
import {CueList} from './features/subtitles/components/CueList';
import {SubtitleTools} from './features/subtitles/components/SubtitleTools';
import {useSubtitles} from './features/subtitles/useSubtitles';
import {MediaPreview} from './features/video/components/MediaPreview';
import {MediaProperties} from './features/video/components/MediaProperties';
import {Timeline} from './features/video/components/Timeline';

export default function App(){
  const [project,setProject]=useState<ProjectDocument>(()=>exampleProject());
  const [workspace,setWorkspace]=useState<Workspace>('design');
  const [selectedElement,setSelectedElement]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [videoVolume,setVideoVolume]=useState(0.85);
  const [audioVolume,setAudioVolume]=useState(0.8);
  const [currentTime,setCurrentTime]=useState(0);
  const [mixLoadToken,setMixLoadToken]=useState(0);
  const [timelineLoadToken,setTimelineLoadToken]=useState(0);
  // FFmpeg/FFprobe ve gerekli yetenekler açılışta bir kez denetlenir (masaüstü); eksikse açık uyarı gösterilir.
  const [toolProblems,setToolProblems]=useState<string[]>([]);
  useEffect(()=>{if(isTauri())invoke<ToolCheck[]>('check_tools').then(c=>setToolProblems(describeToolProblems(c))).catch(()=>{});},[]);
  const update:UpdateProject=fn=>setProject(p=>({...fn(p),updatedAt:Date.now()}));
  const changeTimeline=useCallback((fn:(t:TimelineState)=>TimelineState)=>setProject(p=>({...p,timeline:fn(p.timeline??emptyTimeline()),updatedAt:Date.now()})),[]);
  const changeMix=useCallback((fn:(m:AudioMixState)=>AudioMixState)=>setProject(p=>({...p,audioMix:fn(p.audioMix??emptyAudioMix()),updatedAt:Date.now()})),[]);

  const history=useProjectHistory(project,setProject);
  const media=useMediaLibrary(project.assets,update,setNotice);
  const design=useDesignActions(update,selectedElement,setSelectedElement);
  const subs=useSubtitles({subtitles:project.subtitles,projectName:project.name,update,setNotice,currentTime});
  const files=useProjectFiles({
    project,setProject,setNotice,undo:history.undo,redo:history.redo,resetHistory:history.resetHistory,
    onLoaded:parsed=>{
      media.clearSession();setSelectedElement(null);void media.verifyAssets(parsed.assets);
      const hasMix=!!parsed.audioMix&&(!!parsed.audioMix.videoPath||parsed.audioMix.tracks.length>0);
      const hasTimeline=(parsed.timeline?.clips.length??0)>0;
      if(hasTimeline){setTimelineLoadToken(t=>t+1);}
      if(hasMix){setMixLoadToken(t=>t+1);setWorkspace('audio');}else if(hasTimeline){setWorkspace('video');}
      setNotice(hasMix?'Proje açıldı. Ses miksi yüklendi; dosyalar yeniden doğrulanıyor (Ses sekmesi).':hasTimeline?'Proje açıldı. Video klipleri yüklendi; dosyalar yeniden doğrulanıyor (Video sekmesi).':'Proje açıldı. Medya kütüphanesi dosyalarının tekrar eklenmesi gerekir.');
    },
  });

  const element=project.design.elements.find(e=>e.id===selectedElement);
  const asset=project.assets.find(a=>a.id===media.selectedAsset);
  const src=media.selectedAsset?media.urls[media.selectedAsset]:undefined;
  const designImageInputRef=useRef<HTMLInputElement>(null);
  /** Kütüphanedeki bir görseli tasarıma katman olarak ekler (oran korunur, tuvale ortalanır). */
  const useImageAsset=async(asset:MediaAsset)=>{
    try{
      const url=media.imageUrlFor(asset.id)??media.imageSources[asset.id];
      if(!url){setNotice('Görsel okunamadı. Medya sekmesinden dosyayı yeniden bağlamayı dene.');return;}
      const {width,height}=await measureImage(url);
      design.addImageLayer(asset.id,width,height);
    }catch{setNotice('Görsel açılamadı; dosya bozuk olabilir.');}
  };
  const addImageToDesign=async()=>{
    if(isTauri()){const asset=await media.pickImage();if(asset)await useImageAsset(asset);}
    else designImageInputRef.current?.click();
  };
  const onDesignImageFiles=async(files:FileList|null)=>{
    const added=media.addMedia(files).find(a=>a.kind==='image');
    if(designImageInputRef.current)designImageInputRef.current.value='';
    if(added)await useImageAsset(added);
  };
  const exportImage=(format:ExportFormat,scale:number)=>{exportDesign(project,{format,scale,imageSources:media.imageSources}).then(info=>{if(info)setNotice(`Kaydedildi: ${info}`);}).catch(err=>setNotice(err instanceof Error?err.message:String(err)));};
  const exportCurrent=()=>workspace==='design'?exportImage('png',1):workspace==='subtitles'?subs.exportSrt():setNotice(workspace==='video'?'MP4 kesmek için sağdaki Gerçek MP4 kesme panelini kullan.':'Ses miksli MP4 için sağdaki A26 ses panelini kullan. MP3 çıktısı henüz yok.');
  const pickMedia=()=>isTauri()?void media.addFromDialog():media.mediaInputRef.current?.click();

  return <div className="app">
    {media.dragging&&<div className="drop-overlay" role="status"><strong>Medya eklemek için bırak</strong><span>Video, ses veya görsel dosyaları kütüphaneye eklenir</span></div>}
    <aside className="rail">
      <div className="brand-icon"><Video size={27} fill="currentColor" strokeWidth={1.8}/></div>
      <span className="rail-divider"/>
      {tabs.map(t=><button key={t.id} title={t.label} className={`rail-item ${workspace===t.id?'active':''}`} onClick={()=>setWorkspace(t.id)}><t.icon size={21}/><span>{t.label}</span></button>)}
      <div className="rail-spacer"/>
      <div className="rail-item ghost" title="Yerel depolama"><ShieldCheck size={21}/><span>Yerel</span></div>
    </aside>

    <main className="shell">
      <TopBar name={project.name} onRename={name=>update(p=>({...p,name}))} dirty={files.dirty} projectPath={files.projectPath} isPackage={files.isPackage}
        histInfo={history.histInfo} undo={history.undo} redo={history.redo}
        recent={files.recent} recentOpen={files.recentOpen} setRecentOpen={files.setRecentOpen} refreshRecent={files.refreshRecent} openRecent={files.openRecent} forgetRecent={files.forgetRecent}
        openProject={files.openProject} openPackage={files.openPackage} savePackage={files.savePackage} collectMedia={files.collectMedia} backups={files.backups} refreshBackups={files.refreshBackups} restoreBackup={files.restoreBackup} saveProject={files.saveProject} onExport={exportCurrent}/>
      {toolProblems.map((text,i)=><div key={i} className="notice notice-warn" role="alert"><span>⚠ {text}</span><button onClick={()=>setToolProblems(list=>list.filter((_,k)=>k!==i))}>×</button></div>)}
      {files.recovery&&<div className="notice"><Check size={15}/><span>Kaydedilmemiş önceki oturum bulundu.</span><button style={{fontSize:12}} onClick={files.restoreRecovery}>Geri yükle</button><button style={{fontSize:12}} onClick={files.clearRecovery}>Sil</button></div>}
      {notice && <div className="notice"><Check size={15}/><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}
      <div className="workspace">
        <section className="panel left-panel">
          <div className="panel-heading"><div><span className="eyebrow">ÇALIŞMA ALANI</span><h2>{tabs.find(t=>t.id===workspace)?.label} Stüdyosu</h2></div><Settings2 size={18} className="muted-icon"/></div>
          {workspace==='design'&&<DesignTools design={project.design} update={update} addElement={design.addElement} onCanvas={design.setCanvas} onExport={exportImage} images={project.assets.filter(a=>a.kind==='image')} imageSources={media.imageSources} onAddImage={()=>void addImageToDesign()} onUseImage={a=>void useImageAsset(a)} onTemplate={id=>{design.applyTemplate(id);setNotice('Şablon uygulandı. Beğenmezsen üstteki Geri al ile önceki tasarıma dönebilirsin.');}}/>}
          {(workspace==='video'||workspace==='audio')&&<MediaLibrary library={media.library} filter={media.filter} setFilter={media.setFilter} selectedAsset={media.selectedAsset} setSelectedAsset={media.setSelectedAsset} urls={media.urls} problems={media.problems} busy={media.busy} onPickFile={pickMedia} removeAsset={media.removeAsset} onRelink={id=>void media.relinkAsset(id)} onRelinkFolder={()=>void media.relinkFromFolder()}/>}
          {workspace==='subtitles'&&<SubtitleTools cues={project.subtitles} onAdd={subs.addCue} onExportSrt={subs.exportSrt} onExportVtt={subs.exportVtt} onImportClick={()=>subs.subtitleInputRef.current?.click()}/>}
          <div className="panel-bottom"><ShieldCheck size={16}/><div><strong>Önce yerel, sonra bulut</strong><span>Dosyalar izinsiz yüklenmez.</span></div></div>
        </section>

        <section className="editor">
          <div className="editor-header"><div className="breadcrumb">PROJE / <span>{tabs.find(t=>t.id===workspace)?.label.toUpperCase()}</span></div><div className="editor-header-right"><span className="status-online"/> Çalışma alanı hazır <span className="sep">•</span> <span className="resolution">{workspace==='design'?`${project.design.width} × ${project.design.height}`:'Yerel ön izleme'}</span></div></div>
          <div className="preview-area">
            {workspace==='design'
              ?<DesignStage design={project.design} selectedElement={selectedElement} onSelect={setSelectedElement} update={update} onDelete={design.removeElement} onNudge={design.nudgeSelected} imageSources={media.imageSources}/>
              :<MediaPreview workspace={workspace} asset={asset} src={src} cues={project.subtitles} currentTime={currentTime} onTime={setCurrentTime} videoVolume={videoVolume} audioVolume={audioVolume} onPickFile={pickMedia}/>}
          </div>
          <Timeline workspace={workspace} project={project} selectedElement={selectedElement} onSelectElement={setSelectedElement} onSelectAsset={media.setSelectedAsset} onOpenSubtitles={()=>setWorkspace('subtitles')}/>
        </section>

        <aside className={`panel properties ${workspace === 'audio' || workspace === 'video' ? 'vc-audio-properties' : ''}`}>
          <div className="panel-heading"><div><span className="eyebrow">DÜZENLE</span><h2>Özellikler</h2></div><Settings2 size={18} className="muted-icon"/></div>
          <div className="vc-mix-container" hidden={workspace!=='audio'}><AudioMixPanel mix={project.audioMix??emptyAudioMix()} onChange={changeMix} loadToken={mixLoadToken}/></div>
          {workspace==='design'
            ?<DesignProperties element={element} changeElement={design.changeElement} removeElement={design.removeElement} onMove={design.moveSelected} onDuplicate={design.duplicateSelected} onAlign={design.alignSelected}/>
            :workspace==='subtitles'
              ?<CueList cues={project.subtitles} onUpdate={subs.updateCue} onRemove={subs.removeCue} onAdd={subs.addCue} onExportSrt={subs.exportSrt}/>
              :<MediaProperties workspace={workspace} asset={asset} videoVolume={videoVolume} audioVolume={audioVolume} setVideoVolume={setVideoVolume} setAudioVolume={setAudioVolume} timeline={project.timeline??emptyTimeline()} onTimelineChange={changeTimeline} timelineLoadToken={timelineLoadToken} cues={project.subtitles} mix={project.audioMix??emptyAudioMix()}/>}
          <div className="properties-footer"><WandSparkles size={15}/> AI modelleri isteğe bağlı kurulacak.</div>
        </aside>
      </div>
      <footer className="statusbar"><span><span className="status-online"/> Yerel oturum</span><span><BookOpen size={13}/> Kılavuz: README.md</span><span className="footer-right"><Mic2 size={13}/> Ses AI planlandı <span className="sep">•</span> <Scissors size={13}/> MP4 kesme modülü hazır</span></footer>
    </main>
    <input ref={designImageInputRef} type="file" accept="image/*" hidden onChange={e=>void onDesignImageFiles(e.target.files)}/>
    <input ref={media.mediaInputRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={e=>media.addMedia(e.target.files)}/>
    <input ref={subs.subtitleInputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={e=>void subs.importSubtitles(e.target.files)}/>
    <input ref={files.projectInputRef} type="file" accept=".json,.voxcut.json,application/json" hidden onChange={files.importProject}/>
  </div>;
}
