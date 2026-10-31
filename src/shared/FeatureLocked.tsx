import {Sparkles} from 'lucide-react';

/** Henüz yazılmamış özellik: devre dışı ve "Planlandı" etiketli (sahte düğme yok). */
export function FeatureLocked({title,detail}:{title:string;detail:string}) {
  return <div className="feature-lock"><div className="feature-lock-icon"><Sparkles size={19}/></div><div><strong>{title}</strong><p>{detail}</p></div><span className="pill soon">Planlandı</span></div>;
}
