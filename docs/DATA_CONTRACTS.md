# Veri Sözleşmeleri — VoxCut Studio

## A0 manifest (`schemaVersion: 1`)

Bugünkü `src/core/types.ts` yapısı: `ProjectDocument` içinde `id/name/timestamps`, `design {width,height,background,elements}`, `assets {id,name,kind,mimeType,size,addedAt}`, `subtitles {id,start,end,text}`. JSON medya baytı, ses miks ve gerçek zaman çizelgesi **içermez**. Kullanıcının JSON'u yeniden açınca dosyalarını tekrar eklemesi gerekir. Bu durum A1 öncesi normaldir.

## A1 hedefi (`schemaVersion: 2`) — taslak sözleşme

```ts
type Us = number; // integer microseconds; bütün medya zaman verisi bu birimde

type Asset = {
  id: string; kind: 'video'|'audio'|'image'; displayName: string;
  source: { uri: string; relativePath?: string; sha256?: string };
  probe?: { durationUs?: Us; width?: number; height?: number; fpsNum?: number;
            fpsDen?: number; sampleRate?: number; channels?: number;
            videoCodec?: string; audioCodec?: string; rotation?: number };
  status: 'ready'|'offline'|'analyzing'|'error';
};

type Track = { id: string; kind: 'video'|'audio'|'subtitle'; order: number;
               muted: boolean; locked: boolean; name: string };

type Clip = { id: string; trackId: string; assetId: string;
              timelineStartUs: Us; sourceInUs: Us; sourceOutUs: Us;
              playbackRate: number; opacity?: number; gainDb?: number;
              fadeInUs?: Us; fadeOutUs?: Us };

type SubtitleCueV2 = { id: string; startUs: Us; endUs: Us;
                       text: string; styleId?: string; language?: string };

type RenderPreset = { id: string; container: 'mp4'|'webm'|'wav'|'mp3';
  width?: number; height?: number; fpsNum?: number; fpsDen?: number;
  videoCodec?: string; audioCodec?: string; videoBitrate?: number;
  audioBitrate?: number; burnSubtitles?: boolean };

type ExportJob = { id: string; projectId: string; presetId: string;
  outputPath: string; status: 'queued'|'running'|'cancelled'|'failed'|'succeeded';
  progress: number; errorCode?: string; createdAt: number; finishedAt?: number };
```

### Varlık doğrulama

- Her `Clip.assetId` mevcut `Asset.id`'ye bağlanır; kayıpsa `offline` status ve relink diyaloğu.
- Her `Clip.trackId` mevcut track'e bağlanır; tip uyumu (`audio` clip'i ses/video track'inde) doğrulanır.
- Zamanlar negatif olamaz, `sourceOutUs>sourceInUs`, `playbackRate>0`, `gainDb` örn. -60..+12, timeline/asset limiti belirlenir.
- JSON harici kod/HTML/komut işletmez. Dosya yolları Tauri tarafında normalize edilip izin denetiminden geçer.
- Şema migrasyonu **v1→v2** mevcut kullanıcı verisini kaybetmeden ve testle yapılır; eski JSON salt-okunur import seçeneği.

### Undo/Redo modeli

```ts
type EditAction =
  | { type:'clip.add'; clip: Clip }
  | { type:'clip.remove'; clipId: string }
  | { type:'clip.trim'; clipId: string; sourceInUs: Us; sourceOutUs: Us }
  | { type:'clip.move'; clipId: string; timelineStartUs: Us; trackId: string }
  | { type:'audio.gain'; clipId: string; gainDb: number }
  | { type:'subtitle.edit'; cueId: string; text: string; startUs: Us; endUs: Us };
```

Undo planı: doğrulanabilir eylem, değişiklikten önceki durumu veya ters işlem, transaction grubu, autosave checkpoint. Ücretli AI komutları `EditAction[]` dışında rastgele shell/SQL çalıştıramaz.

### Dosya formatı yaklaşımı

- `project.voxcut` → JSON veya ZIP manifest (karar A1'de alınacak). İmza/zip bomb ve traversal kontrolü.
- Assets dışarıda referansla tutulur, portable paket **kullanıcı açıkça seçerse** medya kopyalar.
- Render job cache ve proxy dosyaları kalıcı projeyle karıştırılmaz.

## audioMix (A27)
Proje JSON'unda isteğe bağlı `audioMix`: `{ videoPath, videoDuration, hasOriginal, gain, mute, solo, tracks[≤8] }`. Kanal: `{ id, path, gain 0–2, pan −1..1, start, sourceIn, length, fadeIn, fadeOut, mute, solo, sourceDuration }`. Yalnız yol + ayar; medya baytı yok. Süreler ipucudur: açılışta FFprobe ile yeniden okunur (`reconcileMix`). Alan yoksa proje eski sürümdür ve değişiklik gerektirmez.
