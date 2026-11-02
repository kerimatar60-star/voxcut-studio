import {useEffect,useState} from 'react';

const STEPS:[title:string,text:string][]=[
  ['Ana sayfadan başla','Ne yapmak istediğini seç; program seni doğru bölüme götürür. Her bölümde tek iş gösterilir, kafan karışmaz.'],
  ['Soldaki menü','Ana sayfa, Video, Ses, Altyazı ve Kapak bölümleri arasında buradan geçersin. Bölümün içinde "Ne yapmak istiyorsun?" kartlarından işi seçersin.'],
  ['Orijinal dosyaların güvende','Hiçbir işlem orijinal dosyanı değiştirmez; sonuç hep yeni bir dosya olarak kaydedilir. Kaydetmeden önce "Dışa Aktar" ile sonucu görebilirsin. Yanlış yaparsan üstteki Geri al düğmesi var.'],
];

/** İlk kullanımda bir kez ve istenince açılan 3 adımlık tanıtım. */
export function HelpTour({onClose}:{onClose:()=>void}){
  const [i,setI]=useState(0);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[onClose]);
  const last=i===STEPS.length-1;
  return <div className="vc-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="vc-modal" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <span className="chip">{i+1} / {STEPS.length}</span>
      <h2 id="tour-title" style={{margin:'6px 0 0'}}>{STEPS[i][0]}</h2>
      <p style={{margin:0,color:'var(--text-2)'}}>{STEPS[i][1]}</p>
      <div className="vc-modal-row" style={{justifyContent:'flex-end'}}>
        <button className="btn btn-dark" type="button" onClick={onClose}>Geç</button>
        <button className="btn btn-primary" type="button" autoFocus onClick={()=>last?onClose():setI(i+1)}>{last?'Bitti':'İleri'}</button>
      </div>
    </div>
  </div>;
}

const KEY='voxcut-tour-seen';
/** Tanıtım turu bu cihazda daha önce gösterildi mi (depolama kapalıysa her seferinde gösterilmez: false döner ve tur açılmaz). */
export function tourSeen():boolean{try{return localStorage.getItem(KEY)==='1';}catch{return true;}}
export function markTourSeen(){try{localStorage.setItem(KEY,'1');}catch{/* depolama kapalı: sorun değil */}}
