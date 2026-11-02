import type {TaskInfo} from './tasks';

type Props<T extends string>={tasks:TaskInfo<T>[];value:T;onChange:(id:T)=>void};

/** "Ne yapmak istiyorsun?" kartları: aynı anda tek iş seçilir, sağ panel yalnız o işin araçlarını gösterir. */
export function TaskPicker<T extends string>({tasks,value,onChange}:Props<T>){
  const current=tasks.find(t=>t.id===value);
  return <div className="task-picker" role="radiogroup" aria-label="Ne yapmak istiyorsun?">
    <div className="eyebrow">NE YAPMAK İSTİYORSUN?</div>
    {tasks.map(t=><button key={t.id} type="button" role="radio" aria-checked={t.id===value} className={`task-card${t.id===value?' on':''}`} onClick={()=>onChange(t.id)}><strong>{t.title}</strong><span>{t.detail}</span></button>)}
    {current&&<div className="task-tip"><b>Bu ne işe yarar?</b> {current.tip}</div>}
  </div>;
}
