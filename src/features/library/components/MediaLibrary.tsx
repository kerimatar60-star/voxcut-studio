import {FileAudio,FileImage,FileVideo,Trash2,Upload} from 'lucide-react';
import {isTauri} from '@tauri-apps/api/core';
import type {AssetKind,MediaAsset} from '../../../core/types';

const assetIcons:Record<AssetKind,typeof FileVideo>={image:FileImage,video:FileVideo,audio:FileAudio};
type Props={
  library:MediaAsset[];filter:'all'|AssetKind;setFilter:(f:'all'|AssetKind)=>void;
  selectedAsset:string|null;setSelectedAsset:(id:string)=>void;urls:Record<string,string>;problems:Record<string,string>;busy:boolean;
  onPickFile:()=>void;removeAsset:(id:string)=>void;onRelink:(id:string)=>void;onRelinkFolder:()=>void;
};

export function MediaLibrary({library,filter,setFilter,selectedAsset,setSelectedAsset,urls,problems,busy,onPickFile,removeAsset,onRelink,onRelinkFolder}:Props){
  const native=isTauri();
  const unlinked=library.filter(a=>!urls[a.id]);
  return <div className="tool-section">
    <span className="small-heading">MEDYA KÜTÜPHANESİ</span>
    <button className="upload-card" disabled={busy} onClick={onPickFile}><Upload size={28}/><strong>Dosya ekle</strong><small>{native?'Video, ses veya görsel seç (yol kaydedilir)':'Video, ses veya görsel seç'}</small></button>
    <div className="filters">{(['all','video','audio','image'] as const).map(f=><button className={filter===f?'active':''} key={f} onClick={()=>setFilter(f)}>{({all:'Tümü',video:'Video',audio:'Ses',image:'Görsel'})[f]}</button>)}</div>
    {native&&unlinked.length>0&&<div role="alert" className="vc-warn"><strong>⚠ {unlinked.length} dosya bağlı değil</strong>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onRelinkFolder}>Klasörde ara ve toplu bağla</button></div>}
    <div className="asset-list">{library.length?library.map(a=>{const Icon=assetIcons[a.kind];const linked=!!urls[a.id];return <div key={a.id} className={`asset ${selectedAsset===a.id?'selected':''}`}><button onClick={()=>setSelectedAsset(a.id)}>{linked&&a.kind==='image'?<img className="asset-thumb" alt="" src={urls[a.id]}/>:linked&&a.kind==='video'?<video className="asset-thumb" muted preload="metadata" src={`${urls[a.id]}#t=0.1`}/>:<Icon size={21}/>}<span><strong title={a.path||a.name}>{a.name}</strong><small>{(a.size/1024/1024).toFixed(1)} MB {linked?'':`• ${problems[a.id]??'Yeniden bağlanmalı'}`}</small></span></button>{native&&!linked&&<button className="delete-small" title="Dosyayı yeniden bağla" aria-label="Dosyayı yeniden bağla" disabled={busy} onClick={()=>onRelink(a.id)}>↻</button>}<button className="delete-small" title="Kaldır" onClick={()=>removeAsset(a.id)}><Trash2 size={15}/></button></div>;}):<p className="empty-help">Henüz medya eklenmedi.</p>}</div>
  </div>;
}
