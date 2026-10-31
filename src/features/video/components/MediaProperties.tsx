import {Video} from 'lucide-react';
import {FeatureLocked} from '../../../shared/FeatureLocked';
import {VideoTrimPanel} from './VideoTrimPanel';
import type {MediaAsset} from '../../../core/types';

type Props={workspace:'video'|'audio';asset:MediaAsset|undefined;videoVolume:number;audioVolume:number;setVideoVolume:(v:number)=>void;setAudioVolume:(v:number)=>void};

/** Video ve ses sekmelerinin sağ paneli: ön izleme ses düzeyi + gerçek MP4 kesme / planlanan araçlar. */
export function MediaProperties({workspace,asset,videoVolume,audioVolume,setVideoVolume,setAudioVolume}:Props){
  return <div className="property-body"><span className="small-heading">{workspace==='audio'?'SES ARAÇLARI':'VİDEO ARAÇLARI'}</span>
    <div className="selected-title"><Video size={17}/>{asset?.name||'Medya seçilmedi'}</div>
    <div className="field"><label>{workspace==='audio'?'Ses düzeyi':'Video ses düzeyi'}: {Math.round((workspace==='audio'?audioVolume:videoVolume)*100)}%</label><input type="range" min={0} max={1} step="0.01" value={workspace==='audio'?audioVolume:videoVolume} onChange={e=>workspace==='audio'?setAudioVolume(Number(e.target.value)):setVideoVolume(Number(e.target.value))}/></div>
    {workspace==='audio'?<><FeatureLocked title="Gürültü temizleme" detail="FFmpeg / AI modeli bağlandığında aktif olur."/><FeatureLocked title="Enstrüman ayrıştırma" detail="Vokal, davul, bas ve diğerleri için model gerekir."/></>:<><VideoTrimPanel/><FeatureLocked title="Geçişler ve efektler" detail="Animasyon ve sahne geçiş motoru planlandı."/></>}
  </div>;
}
