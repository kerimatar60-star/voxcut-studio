import {AudioLines,Clapperboard,ImagePlus,Subtitles} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {Workspace} from '../core/types';

export const tabs:{id:Workspace;label:string;icon:LucideIcon;detail:string}[]=[
  {id:'video',label:'Video',icon:Clapperboard,detail:'Ön izleme, sahne'},
  {id:'audio',label:'Ses',icon:AudioLines,detail:'Müzik, ses kanalları'},
  {id:'subtitles',label:'Altyazı',icon:Subtitles,detail:'Elle düzenle, SRT, videoya yaz'},
  {id:'cover',label:'Kapak',icon:ImagePlus,detail:'Videoya kapak fotoğrafı ekle'},
];
export const seconds=(s:number)=> `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
