import {Clapperboard,AudioLines,Subtitles,ImagePlus,FolderOpen,HelpCircle} from 'lucide-react';
import {isTauri} from '@tauri-apps/api/core';
import type {RecentProject} from '../../projects/useProjectFiles';
import type {Workspace} from '../../../core/types';

type Props={onGo:(workspace:Workspace)=>void;recent:RecentProject[];onOpenRecent:(path:string,exists:boolean)=>void;onHelp:()=>void};

const CARDS:{id:Workspace;icon:typeof Clapperboard;title:string;detail:string}[]=[
  {id:'video',icon:Clapperboard,title:'Video kes veya birleştir',detail:'Parçaları seç, sırala, geçiş ekle, MP4 kaydet.'},
  {id:'audio',icon:AudioLines,title:'Sesi düzenle',detail:'Gürültüyü azalt, şarkıyı vokal ve müziğe ayır.'},
  {id:'subtitles',icon:Subtitles,title:'Altyazı ekle',detail:'Konuşmayı yazıya çevir veya elle yaz, videoya yaz.'},
  {id:'cover',icon:ImagePlus,title:'Videoya kapak ekle',detail:'Bir fotoğrafı videonun kapağı yap.'},
];

/** Açılış sayfası: ne yapmak istediğini sorar, kartlar doğru bölüme götürür. */
export function HomeScreen({onGo,recent,onOpenRecent,onHelp}:Props){
  return <section className="panel home-screen" aria-labelledby="home-title">
    <h2 id="home-title">Merhaba! Ne yapmak istiyorsun?</h2>
    <p className="home-lead">Bir kart seç, gerisini biz yönlendirelim. Her şey bu bilgisayarda çalışır; dosyaların internete gönderilmez.</p>
    <div className="home-cards">
      {CARDS.map(c=><button key={c.id} type="button" className="home-card" onClick={()=>onGo(c.id)}><c.icon size={30} aria-hidden="true"/><strong>{c.title}</strong><span>{c.detail}</span></button>)}
    </div>
    <h3 className="home-sub">Son projeler</h3>
    {isTauri()
      ?recent.length===0
        ?<p className="muted-line">Henüz kayıtlı proje yok. Bir bölümde çalışıp "Kaydet"e basınca burada görünür.</p>
        :<ul className="home-recent">{recent.slice(0,5).map(([path,name,,exists])=><li key={path}><FolderOpen size={16} aria-hidden="true"/><span className={exists?'':'missing'}>{name}</span><button type="button" className="btn btn-dark" disabled={!exists} onClick={()=>onOpenRecent(path,exists)}>Aç</button></li>)}</ul>
      :<p className="muted-line">Son projeler yalnızca kurulu uygulamada görünür.</p>}
    <button type="button" className="btn btn-dark" style={{marginTop:18}} onClick={onHelp}><HelpCircle size={16}/> Kısa tanıtım turu</button>
  </section>;
}
