import {Clapperboard,Clock3,Music2,Subtitles} from 'lucide-react';
import {LayerList} from '../../design/components/LayerList';
import type {ProjectDocument,Workspace} from '../../../core/types';

type Props={workspace:Workspace;project:ProjectDocument;selectedElement:string|null;onSelectElement:(id:string)=>void;onSelectAsset:(id:string)=>void;onOpenSubtitles:()=>void};

/** Tasarımda katman listesi, diğer alanlarda (şimdilik görsel taslak) zaman çizelgesi. */
export function Timeline({workspace,project,selectedElement,onSelectElement,onSelectAsset,onOpenSubtitles}:Props){
  return <div className="timeline">
    <div className="timeline-heading"><div><Clock3 size={17}/> <strong>{workspace==='design'?'Katmanlar':'Zaman Çizelgesi'}</strong><span className="timeline-count">{workspace==='design'?project.design.elements.length:project.assets.length} öğe</span></div><span className="timeline-info">{workspace==='design'?'Katman seçerek özelliklerini düzenle':'Görsel özet; klipleri sağdaki birleştirme panelinden düzenle'}</span></div>
    {workspace==='design'?<LayerList elements={project.design.elements} selected={selectedElement} onSelect={onSelectElement}/>:<div className="tracks">
      <div className="time-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span><span>00:40</span><span>00:50</span></div>
      <div className="track-row"><span className="track-title"><Clapperboard size={14}/> Video</span><div className="track-line">{project.assets.filter(a=>a.kind==='video').map((a,i)=><button key={a.id} onClick={()=>onSelectAsset(a.id)} className="clip video-clip" style={{width:'28%',left:`${Math.min(70,i*30)}%`}}>{a.name}</button>)}</div></div>
      <div className="track-row"><span className="track-title"><Music2 size={14}/> Ses</span><div className="track-line">{project.assets.filter(a=>a.kind==='audio').map((a,i)=><button key={a.id} onClick={()=>onSelectAsset(a.id)} className="clip audio-clip" style={{width:'27%',left:`${Math.min(70,i*29)}%`}}>{a.name}</button>)}</div></div>
      <div className="track-row"><span className="track-title"><Subtitles size={14}/> Altyazı</span><div className="track-line">{project.subtitles.map(c=><button key={c.id} className="clip subtitle-clip" onClick={onOpenSubtitles} style={{left:`${Math.min(90,c.start/60*100)}%`,width:`${Math.max(5,Math.min(100,(c.end-c.start)/60*100))}%`}}>{c.text}</button>)}</div></div>
    </div>}
  </div>;
}
