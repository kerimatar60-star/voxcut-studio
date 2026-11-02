import {useEffect,useRef} from 'react';
import {Clapperboard,Music2,Upload,Video} from 'lucide-react';
import {seconds} from '../../../shared/workspaces';
import type {MediaAsset,SubtitleCue,Workspace} from '../../../core/types';

type Props={workspace:Workspace;asset:MediaAsset|undefined;src:string|undefined;cues:SubtitleCue[];currentTime:number;onTime:(seconds:number)=>void;videoVolume:number;audioVolume:number;onPickFile:()=>void};

/** Video / ses / görsel ön izleme (yerel blob URL). Altyazı ön izlemesi oynatma konumuna göre gösterilir. */
export function MediaPreview({workspace,asset,src,cues,currentTime,onTime,videoVolume,audioVolume,onPickFile}:Props){
  const videoRef=useRef<HTMLVideoElement>(null);
  const audioRef=useRef<HTMLAudioElement>(null);
  useEffect(()=>{if(videoRef.current)videoRef.current.volume=videoVolume;},[src,videoVolume,workspace]);
  useEffect(()=>{if(audioRef.current)audioRef.current.volume=audioVolume;},[src,audioVolume,workspace]);
  const activeSubtitle=cues.find(c=>currentTime>=c.start&&currentTime<=c.end);
  return <>
    <div className="board-tools"><span className="chip"><Video size={14}/> {workspace==='audio'?'Ses oynatıcı':'Video ön izleme'}</span><span className="chip pale">Yerel dosyalar</span></div>
    <div className="stage-frame media-frame">
      {asset?.kind==='video' && src ? <div className="video-container"><video ref={videoRef} key={src} src={src} controls playsInline onTimeUpdate={e=>onTime(e.currentTarget.currentTime)} /><div className="caption-preview">{activeSubtitle?.text}</div></div>
      : asset?.kind==='audio'&&src ? <div className="audio-placeholder"><div className="audio-avatar"><Music2 size={55}/></div><strong>{asset.name}</strong><audio ref={audioRef} key={src} src={src} controls onTimeUpdate={e=>onTime(e.currentTarget.currentTime)}/></div>
      : asset?.kind==='image'&&src?<img className="preview-image" alt="Seçilen proje görseli" src={src}/>
      : <div className="empty-preview"><div className="empty-preview-icon"><Clapperboard size={40}/></div><strong>{asset?'Medya dosyası yeniden bağlanmalı':'Ön izlemek için medya ekle'}</strong><span>Yerel dosyayı seçerek video veya ses ön izlemesi yapabilirsin.</span><button className="btn btn-primary" onClick={onPickFile}><Upload size={15}/> Dosya ekle</button></div>}
    </div>
    <div className="below-preview"><span>Oynatma konumu: {seconds(currentTime)}</span><span>{workspace==='video'?'Birleştirmek için soldan "Videoları birleştir" kartını seç':''}</span></div>
  </>;
}
