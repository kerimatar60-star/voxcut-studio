export type VideoTask = 'trim' | 'merge';
export type AudioTask = 'denoise' | 'stems' | 'vocal' | 'mix';
export type Tasks = { video: VideoTask; audio: AudioTask };
export const DEFAULT_TASKS: Tasks = { video: 'trim', audio: 'denoise' };

export type TaskInfo<T extends string> = { id: T; title: string; detail: string; tip: string };

/** Video sekmesinde tek seferde tek iş gösterilir; her iş sade bir cümleyle anlatılır. */
export const VIDEO_TASKS: TaskInfo<VideoTask>[] = [
  { id: 'trim', title: 'Videoyu kes', detail: 'Baştan ve sondan fazlalığı at.', tip: 'Seçtiğin aralığı yeni bir MP4 olarak kaydeder. Orijinal videon değişmez.' },
  { id: 'merge', title: 'Videoları birleştir', detail: 'Birden çok klibi art arda diz.', tip: 'Klipler arasına yumuşak geçiş ekleyebilir, altyazı yakabilir ve müzik katabilirsin.' },
];

export const AUDIO_TASKS: TaskInfo<AudioTask>[] = [
  { id: 'denoise', title: 'Gürültüyü azalt', detail: 'Fan, uğultu, oda sesi.', tip: 'Kayıttaki sürekli arka plan gürültüsünü azaltır. Önce kısa bir örneği dinle, beğenirsen tamamını kaydet.' },
  { id: 'stems', title: 'Şarkıyı parçalara ayır', detail: 'Vokal, davul, bas, eşlik.', tip: 'Şarkıyı vokal, davul, bas ve eşliğe ayırır. Kayıt süresinden uzun sürebilir; pencereyi kapatma.' },
  { id: 'vocal', title: 'Vokali azalt (karaoke)', detail: 'Hızlı ve basit yöntem.', tip: 'Ortadaki sesi azaltır. Hızlıdır ama kusursuz değildir; vokal ortada değilse sonuç zayıf olur.' },
  { id: 'mix', title: 'Ses ve müzik karıştır', detail: 'Videoya müzik ekle.', tip: 'Videonun sesine müzik ekler, seviyeleri ayarlarsın. Biri konuşurken müziği otomatik kısabilirsin.' },
];
