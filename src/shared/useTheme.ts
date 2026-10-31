import {useCallback,useEffect,useState} from 'react';

export type Theme='dark'|'light';
const KEY='voxcut-theme';

const initial=():Theme=>{
  try{const saved=localStorage.getItem(KEY);if(saved==='dark'||saved==='light')return saved;}catch{/* depolama kapalı olabilir */}
  return typeof window!=='undefined'&&window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark';
};

/** Koyu/açık tema; seçim yalnız bu cihazda (localStorage) hatırlanır, yoksa sistem tercihi kullanılır. */
export function useTheme(){
  const [theme,setTheme]=useState<Theme>(initial);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  const toggle=useCallback(()=>setTheme(t=>{
    const next=t==='dark'?'light':'dark';
    try{localStorage.setItem(KEY,next);}catch{/* yok say */}
    return next;
  }),[]);
  return {theme,toggle};
}
