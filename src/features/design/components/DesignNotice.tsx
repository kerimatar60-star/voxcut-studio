import {FeatureLocked} from '../../../shared/FeatureLocked';

/** Tasarım oluşturma aracı şimdilik yok (eski düzenleyici kaldırıldı, yapay zekâ bağlantısı istenmedi); sahte düğme göstermeyiz. */
export function DesignNotice(){
  return <div className="vc-trim-hint" style={{padding:12}}>
    <FeatureLocked title="Tasarım aracı" detail="Yeni tasarım aracı henüz belirlenmedi. Açık olan projelerdeki tasarımlar görünür ve PNG, JPEG veya WebP olarak kaydedilir."/>
  </div>;
}
