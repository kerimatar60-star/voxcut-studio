import {Video} from 'lucide-react';
import type {Tasks} from '../../../shared/tasks';
import {DenoisePanel} from '../../audio/components/DenoisePanel';
import {StemPanel} from '../../audio/components/StemPanel';
import {CenterSplitPanel} from '../../audio/components/CenterSplitPanel';
import {TimelinePanel} from './TimelinePanel';
import {VideoTrimPanel} from './VideoTrimPanel';
import type {AudioMixState} from '../../../core/audioMixModel';
import type {TimelineState} from '../../../core/timelineModel';
import type {MediaAsset,SubtitleCue} from '../../../core/types';

type Props={workspace:'video'|'audio';asset:MediaAsset|undefined;videoVolume:number;audioVolume:number;setVideoVolume:(v:number)=>void;setAudioVolume:(v:number)=>void;timeline:TimelineState;onTimelineChange:(fn:(t:TimelineState)=>TimelineState)=>void;timelineLoadToken:number;cues:SubtitleCue[];mix:AudioMixState;task:Tasks};

/** Video ve ses sekmelerinin sağ paneli: ön izleme ses düzeyi + gerçek MP4 kesme / planlanan araçlar. */
export function MediaProperties({workspace,asset,videoVolume,audioVolume,setVideoVolume,setAudioVolume,timeline,onTimelineChange,timelineLoadToken,cues,mix,task}:Props){
  return <div className="property-body"><span className="small-heading">{workspace==='audio'?'SES ARAÇLARI':'VİDEO ARAÇLARI'}</span>
    <div className="selected-title"><Video size={17}/>{asset?.name||'Medya seçilmedi'}</div>
    <div className="field"><label>{workspace==='audio'?'Ses düzeyi':'Video ses düzeyi'}: {Math.round((workspace==='audio'?audioVolume:videoVolume)*100)}%</label><input aria-label={workspace==='audio'?'Ses düzeyi':'Video ses düzeyi'} type="range" min={0} max={1} step="0.01" value={workspace==='audio'?audioVolume:videoVolume} onChange={e=>workspace==='audio'?setAudioVolume(Number(e.target.value)):setVideoVolume(Number(e.target.value))}/></div>
    {workspace==='audio'
      ?<>
        <div hidden={task.audio!=='denoise'}><DenoisePanel/></div>
        <div hidden={task.audio!=='vocal'}><CenterSplitPanel/></div>
        <div hidden={task.audio!=='stems'}><StemPanel/></div>
      </>
      :<>
        <div hidden={task.video!=='merge'}><TimelinePanel timeline={timeline} onChange={onTimelineChange} loadToken={timelineLoadToken} cues={cues} mix={mix}/></div>
        <div hidden={task.video!=='trim'}><VideoTrimPanel/></div>
      </>}
  </div>;
}
