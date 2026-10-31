import {Video} from 'lucide-react';
import {FeatureLocked} from '../../../shared/FeatureLocked';
import {DenoisePanel} from '../../audio/components/DenoisePanel';
import {TimelinePanel} from './TimelinePanel';
import {VideoTrimPanel} from './VideoTrimPanel';
import type {AudioMixState} from '../../../core/audioMixModel';
import type {TimelineState} from '../../../core/timelineModel';
import type {MediaAsset,SubtitleCue} from '../../../core/types';

type Props={workspace:'video'|'audio';asset:MediaAsset|undefined;videoVolume:number;audioVolume:number;setVideoVolume:(v:number)=>void;setAudioVolume:(v:number)=>void;timeline:TimelineState;onTimelineChange:(fn:(t:TimelineState)=>TimelineState)=>void;timelineLoadToken:number;cues:SubtitleCue[];mix:AudioMixState};

/** Video ve ses sekmelerinin sağ paneli: ön izleme ses düzeyi + gerçek MP4 kesme / planlanan araçlar. */
export function MediaProperties({workspace,asset,videoVolume,audioVolume,setVideoVolume,setAudioVolume,timeline,onTimelineChange,timelineLoadToken,cues,mix}:Props){
  return <div className="property-body"><span className="small-heading">{workspace==='audio'?'SES ARAÇLARI':'VİDEO ARAÇLARI'}</span>
    <div className="selected-title"><Video size={17}/>{asset?.name||'Medya seçilmedi'}</div>
    <div className="field"><label>{workspace==='audio'?'Ses düzeyi':'Video ses düzeyi'}: {Math.round((workspace==='audio'?audioVolume:videoVolume)*100)}%</label><input type="range" min={0} max={1} step="0.01" value={workspace==='audio'?audioVolume:videoVolume} onChange={e=>workspace==='audio'?setAudioVolume(Number(e.target.value)):setVideoVolume(Number(e.target.value))}/></div>
    {workspace==='audio'?<><DenoisePanel/><FeatureLocked title="Yapay zekâ ile gürültü temizleme" detail="Daha güçlü model tabanlı temizleme için model indirme onayı gerekir."/><FeatureLocked title="Enstrüman ayrıştırma" detail="Vokal, davul, bas ve diğerleri için model gerekir."/></>:<><TimelinePanel timeline={timeline} onChange={onTimelineChange} loadToken={timelineLoadToken} cues={cues} mix={mix}/><VideoTrimPanel/><FeatureLocked title="Geçişler ve efektler" detail="Animasyon ve sahne geçiş motoru planlandı."/></>}
  </div>;
}
