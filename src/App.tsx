import {useCallback,useEffect,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {Check,Mic2,Scissors,Settings2,ShieldCheck,Video} from 'lucide-react';
import {exampleProject} from './core/project';
import {emptyAudioMix} from './core/audioMixModel';
import {emptyTimeline} from './core/timelineModel';
import type {TimelineState} from './core/timelineModel';
import type {AudioMixState} from './core/audioMixModel';
import type {ProjectDocument,UpdateProject,Workspace} from './core/types';
import {describeToolProblems} from './core/toolCheck';
import type {ToolCheck} from './core/toolCheck';
import {tabs} from './shared/workspaces';
import {useTheme} from './shared/useTheme';
import {AudioMixPanel} from './features/audio/components/AudioMixPanel';
import {PreviewDialog} from './features/preview/components/PreviewDialog';
import {CoverScreen} from './features/cover/components/CoverScreen';
import {MediaLibrary} from './features/library/components/MediaLibrary';
import {useMediaLibrary} from './features/library/useMediaLibrary';
import {TopBar} from './features/projects/components/TopBar';
import {useProjectFiles} from './features/projects/useProjectFiles';
import {useProjectHistory} from './features/projects/useProjectHistory';
import {CueList} from './features/subtitles/components/CueList';
import {SubtitleTools} from './features/subtitles/components/SubtitleTools';
import {CommandPanel} from './features/commands/components/CommandPanel';
import {useSubtitles} from './features/subtitles/useSubtitles';
import {MediaPreview} from './features/video/components/MediaPreview';
import {MediaProperties} from './features/video/components/MediaProperties';
import {Timeline} from './features/video/components/Timeline';

export default function App(){
  const {theme,toggle:toggleTheme}=useTheme();
  const [project,setProject]=useState<ProjectDocument>(()=>exampleProject());
  const [workspace,setWorkspace]=useState<Workspace>('video');
  const [notice,setNotice]=useState('');
  const [previewOpen,setPreviewOpen]=useState(false);
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
  const subs=useSubtitles({subtitles:project.subtitles,projectName:project.name,update,setNotice,currentTime});
  const files=useProjectFiles({
    project,setProject,setNotice,undo:history.undo,redo:history.redo,resetHistory:history.resetHistory,
    onLoaded:parsed=>{
      media.clearSession();void media.verifyAssets(parsed.assets);
      const hasMix=!!parsed.audioMix&&(!!parsed.audioMix.videoPath||parsed.audioMix.tracks.length>0);
      const hasTimeline=(parsed.timeline?.clips.length??0)>0;
      if(hasTimeline){setTimelineLoadToken(t=>t+1);}
      if(hasMix){setMixLoadToken(t=>t+1);setWorkspace('audio');}else if(hasTimeline){setWorkspace('video');}
      setNotice(hasMix?'Proje açıldı. Ses miksi yüklendi; dosyalar yeniden doğrulanıyor (Ses sekmesi).':hasTimeline?'Proje açıldı. Video klipleri yüklendi; dosyalar yeniden doğrulanıyor (Video sekmesi).':'Proje açıldı. Medya kütüphanesi dosyalarının tekrar eklenmesi gerekir.');
    },
  });

  const asset=project.assets.find(a=>a.id===media.selectedAsset);
  const src=media.selectedAsset?media.urls[media.selectedAsset]:undefined;
  const exportCurrent=()=>setPreviewOpen(true);
  const pickMedia=()=>isTauri()?void media.addFromDialog():media.mediaInputRef.current?.click();

  return <div className="app">
    {media.dragging&&<div className="drop-overlay" role="status"><strong>Medya eklemek için bırak</strong><span>Video, ses veya görsel dosyaları kütüphaneye eklenir</span></div>}
    <aside className="rail" aria-label="Çalışma alanları">
      <div className="brand-icon"><Video size={27} fill="currentColor" strokeWidth={1.8}/></div>
      <span className="rail-divider"/>
      {tabs.map(t=><button key={t.id} title={t.label} className={`rail-item ${workspace===t.id?'active':''}`} onClick={()=>setWorkspace(t.id)}><t.icon size={21}/><span>{t.label}</span></button>)}
      <div className="rail-spacer"/>
      <div className="rail-item ghost" title="Yerel depolama"><ShieldCheck size={21}/><span>Yerel</span></div>
    </aside>

    <main className="shell">
      <h1 className="sr-only">VoxCut Studio</h1>
      <TopBar theme={theme} onToggleTheme={toggleTheme} name={project.name} onRename={name=>update(p=>({...p,name}))} dirty={files.dirty} projectPath={files.projectPath} isPackage={files.isPackage}
        histInfo={history.histInfo} undo={history.undo} redo={history.redo}
        recent={files.recent} recentOpen={files.recentOpen} setRecentOpen={files.setRecentOpen} refreshRecent={files.refreshRecent} openRecent={files.openRecent} forgetRecent={files.forgetRecent}
        openProject={files.openProject} openPackage={files.openPackage} savePackage={files.savePackage} collectMedia={files.collectMedia} backups={files.backups} refreshBackups={files.refreshBackups} restoreBackup={files.restoreBackup} saveProject={files.saveProject} onExport={exportCurrent}/>
      {toolProblems.map((text,i)=><div key={i} className="notice notice-warn" role="alert"><span>⚠ {text}</span><button onClick={()=>setToolProblems(list=>list.filter((_,k)=>k!==i))}>×</button></div>)}
      {files.recovery&&<div className="notice"><Check size={15}/><span>Kaydedilmemiş önceki oturum bulundu.</span><button style={{fontSize:12}} onClick={files.restoreRecovery}>Geri yükle</button><button style={{fontSize:12}} onClick={files.clearRecovery}>Sil</button></div>}
      {notice && <div className="notice"><Check size={15}/><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}
      <div className="workspace">
        {workspace==='cover'?<CoverScreen setNotice={setNotice}/>:<>
        <section className="panel left-panel">
          <div className="panel-heading"><div><span className="eyebrow">ÇALIŞMA ALANI</span><h2>{tabs.find(t=>t.id===workspace)?.label} Stüdyosu</h2></div><Settings2 size={18} className="muted-icon"/></div>
          {(workspace==='video'||workspace==='audio')&&<MediaLibrary library={media.library} filter={media.filter} setFilter={media.setFilter} selectedAsset={media.selectedAsset} setSelectedAsset={media.setSelectedAsset} urls={media.urls} problems={media.problems} busy={media.busy} onPickFile={pickMedia} removeAsset={media.removeAsset} onRelink={id=>void media.relinkAsset(id)} onRelinkFolder={()=>void media.relinkFromFolder()}/>}
          {workspace==='subtitles'&&<SubtitleTools cues={project.subtitles} onAdd={subs.addCue} onExportSrt={subs.exportSrt} onExportVtt={subs.exportVtt} onImportClick={()=>subs.subtitleInputRef.current?.click()} onAutoResult={subs.importSrtText}/>}
          <div className="panel-bottom"><ShieldCheck size={16}/><div><strong>Önce yerel, sonra bulut</strong><span>Dosyalar izinsiz yüklenmez.</span></div></div>
        </section>

        <section className="editor">
          <div className="editor-header"><div className="breadcrumb">PROJE / <span>{tabs.find(t=>t.id===workspace)?.label.toUpperCase()}</span></div><div className="editor-header-right"><span className="status-online"/> Çalışma alanı hazır <span className="sep">•</span> <span className="resolution">Yerel ön izleme</span></div></div>
          <div className="preview-area">
            <MediaPreview workspace={workspace} asset={asset} src={src} cues={project.subtitles} currentTime={currentTime} onTime={setCurrentTime} videoVolume={videoVolume} audioVolume={audioVolume} onPickFile={pickMedia}/>
          </div>
          <Timeline project={project} onSelectAsset={media.setSelectedAsset} onOpenSubtitles={()=>setWorkspace('subtitles')}/>
        </section>

        <aside className={`panel properties ${workspace === 'audio' || workspace === 'video' ? 'vc-audio-properties' : ''}`}>
          <div className="panel-heading"><div><span className="eyebrow">DÜZENLE</span><h2>Özellikler</h2></div><Settings2 size={18} className="muted-icon"/></div>
          <div className="vc-mix-container" hidden={workspace!=='audio'}><AudioMixPanel mix={project.audioMix??emptyAudioMix()} onChange={changeMix} loadToken={mixLoadToken}/></div>
          {workspace==='subtitles'
              ?<CueList cues={project.subtitles} onUpdate={subs.updateCue} onRemove={subs.removeCue} onAdd={subs.addCue} onExportSrt={subs.exportSrt}/>
              :<MediaProperties workspace={workspace} asset={asset} videoVolume={videoVolume} audioVolume={audioVolume} setVideoVolume={setVideoVolume} setAudioVolume={setAudioVolume} timeline={project.timeline??emptyTimeline()} onTimelineChange={changeTimeline} timelineLoadToken={timelineLoadToken} cues={project.subtitles} mix={project.audioMix??emptyAudioMix()}/>}
          <CommandPanel project={project} update={update} onApplied={setNotice} onUndo={history.undo}/>
        </aside>
      
        </>}
      </div>
      <footer className="statusbar"><span><span className="status-online"/> Yerel oturum</span><span className="footer-right"><Mic2 size={13}/> Yapay zekâ araçları hazır <span className="sep">•</span> <Scissors size={13}/> Birleştirme ve kesme hazır</span></footer>
    </main>
    <input ref={media.mediaInputRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={e=>media.addMedia(e.target.files)}/>
    <input ref={subs.subtitleInputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={e=>void subs.importSubtitles(e.target.files)}/>
    <input ref={files.projectInputRef} type="file" accept=".json,.voxcut.json,application/json" hidden onChange={files.importProject}/>
    {previewOpen&&<PreviewDialog workspace={workspace} project={project} update={update} changeTimeline={changeTimeline} changeMix={changeMix} onExportSrt={subs.exportSrt} onExportVtt={subs.exportVtt} onClose={()=>setPreviewOpen(false)} setNotice={setNotice}/>}
  </div>;
}
