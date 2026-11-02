import {Sparkles} from 'lucide-react';
import {FeatureLocked} from '../../../shared/FeatureLocked';

/** Eski düzenleyicinin yerine gelecek "yazıyla tasarla" aracı hazırlanana kadar dürüst bir yer tutucu. */
export function DesignComingSoon(){
  return <div className="vc-trim-hint" style={{padding:12}}>
    <FeatureLocked title="Yazıyla tasarla" detail="Ne istediğini yaz, yapay zekâ tasarımı hazırlasın. Hazırlanıyor."/>
    <p style={{marginTop:10,fontSize:12}}><Sparkles size={13}/> Önceki tasarım düzenleyicisi kaldırıldı.</p>
  </div>;
}
