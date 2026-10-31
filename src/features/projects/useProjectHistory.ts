import {useEffect,useRef,useState} from 'react';
import {emptyHistory,recordChange,redoStep,undoStep,type History} from '../../core/history';
import type {ProjectDocument} from '../../core/types';

/**
 * Geri al / yinele: tüm proje değişiklikleri tek noktadan (project değişimi) izlenir; art arda hızlı değişiklikler birleşir.
 * Başka bir proje açılırken `resetHistory` çağrılır.
 */
export function useProjectHistory(project:ProjectDocument,setProject:(p:ProjectDocument)=>void){
  const historyRef=useRef<History<ProjectDocument>>(emptyHistory());
  const prevProjectRef=useRef(project);
  const historyModeRef=useRef<'edit'|'undo'|'reset'>('edit');
  const [histInfo,setHistInfo]=useState({undo:0,redo:0});
  useEffect(()=>{
    const prev=prevProjectRef.current;prevProjectRef.current=project;
    if(prev===project)return;
    const mode=historyModeRef.current;historyModeRef.current='edit';
    if(mode==='reset')historyRef.current=emptyHistory();
    else if(mode==='edit')historyRef.current=recordChange(historyRef.current,prev,Date.now());
    setHistInfo({undo:historyRef.current.past.length,redo:historyRef.current.future.length});
  },[project]);
  const stepHistory=(dir:'undo'|'redo')=>{
    const r=(dir==='undo'?undoStep:redoStep)(historyRef.current,project);
    if(!r)return;
    historyRef.current=r.history;historyModeRef.current='undo';
    setProject({...r.state,updatedAt:Date.now()});
    setHistInfo({undo:r.history.past.length,redo:r.history.future.length});
  };
  const undo=()=>stepHistory('undo');
  const redo=()=>stepHistory('redo');
  const resetHistory=()=>{historyModeRef.current='reset';};
  return {undo,redo,histInfo,resetHistory};
}
