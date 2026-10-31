import {Download,Plus,Upload} from 'lucide-react';
import {FeatureLocked} from '../../../shared/FeatureLocked';
import {SubtitleBurnPanel} from './SubtitleBurnPanel';
import type {SubtitleCue} from '../../../core/types';

type Props={cues:SubtitleCue[];onAdd:()=>void;onExportSrt:()=>void;onExportVtt:()=>void;onImportClick:()=>void};

export function SubtitleTools({cues,onAdd,onExportSrt,onExportVtt,onImportClick}:Props){
  return <div className="tool-section">
    <span className="small-heading">ALTYAZI DÜZENLEYİCİSİ</span>
    <button className="tool-card" onClick={onAdd}><span className="tool-icon purple"><Plus size={20}/></span><span><strong>Altyazı ekle</strong><small>Oynatma zamanından başlat</small></span></button>
    <button className="tool-card" onClick={onExportSrt}><span className="tool-icon cyan"><Download size={20}/></span><span><strong>SRT olarak kaydet</strong><small>Gerçek .srt çıktısı</small></span></button>
    <button className="tool-card" onClick={onExportVtt}><span className="tool-icon cyan"><Download size={20}/></span><span><strong>VTT olarak kaydet</strong><small>Gerçek WebVTT çıktısı</small></span></button>
    <button className="tool-card" onClick={onImportClick}><span className="tool-icon purple"><Upload size={20}/></span><span><strong>SRT / VTT içe aktar</strong><small>Mevcut altyazı dosyasını yükle</small></span></button>
    <div className="divider"/>
    <SubtitleBurnPanel cues={cues}/>
    <FeatureLocked title="Otomatik Türkçe altyazı" detail="Whisper entegrasyonu sonraki aşamada."/>
  </div>;
}
