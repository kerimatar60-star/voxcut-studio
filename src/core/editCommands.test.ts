import { describe, expect, it } from 'vitest';
import { applyAction, applyActions, describeAction, parseCommand, type EditAction } from './editCommands';
import { exampleProject } from './project';
import type { MixTrack } from './audioMixModel';
import type { TimelineClip } from './timelineModel';
import type { ProjectDocument } from './types';

const track = (i: number, over: Partial<MixTrack> = {}): MixTrack => ({ id: `t${i}`, path: `C:\\ses${i}.wav`, gain: 1, pan: 0, start: 0, sourceIn: 0, length: 10, fadeIn: 0, fadeOut: 0, mute: false, solo: false, sourceDuration: 30, ...over });
const clip = (i: number): TimelineClip => ({ id: `c${i}`, path: `C:\\k${i}.mp4`, in: 0, out: 10, sourceDuration: 20 });
const project = (): ProjectDocument => ({
  ...exampleProject(),
  subtitles: [{ id: 'a', start: 1, end: 2, text: 'bir' }, { id: 'b', start: 3, end: 4, text: '  ' }],
  audioMix: { videoPath: 'C:\\v.mp4', videoDuration: 30, hasOriginal: true, gain: 1, mute: false, solo: false, tracks: [track(1), track(2)] },
  timeline: { clips: [clip(1), clip(2), clip(3)], width: 1280, height: 720, fps: 30 },
});
const one = (text: string): EditAction => {
  const p = parseCommand(text);
  expect(p.unknown, text).toEqual([]);
  expect(p.actions, text).toHaveLength(1);
  return p.actions[0];
};

describe('komut ayrıştırma', () => {
  it('kullanıcının örnek cümlesini işlemlere böler, anlamadığını açıkça bildirir', () => {
    const p = parseCommand("Konuşurken müziği %25'e indir, başına 1 sn fade koy, Türkçe altyazı ekle");
    expect(p.actions[0]).toEqual({ type: 'setDucking', strength: 0.75 });
    expect(p.actions[1]).toEqual({ type: 'setFade', track: 'all', fadeIn: 1 });
    expect(p.unknown).toEqual(['türkçe altyazı ekle']); // otomatik altyazı komutla başlatılmaz
  });
  it('müzik kısma', () => {
    expect(one('konuşma sırasında müziği kıs')).toEqual({ type: 'setDucking', strength: 0.6 });
    expect(one('ducking kapat')).toEqual({ type: 'setDucking', strength: 0 });
  });
  it('ek ses seviyesi, sustur, aç', () => {
    expect(one('2. sesi %50 yap')).toEqual({ type: 'setTrackGain', track: 2, percent: 50 });
    expect(one('ikinci sesi yüzde 30 yap')).toEqual({ type: 'setTrackGain', track: 2, percent: 30 });
    expect(one('tüm ek sesleri %80 yap')).toEqual({ type: 'setTrackGain', track: 'all', percent: 80 });
    expect(one('1. sesi sustur')).toEqual({ type: 'setTrackMute', track: 1, mute: true });
    expect(one('1. sesin susturmasını kaldır')).toEqual({ type: 'setTrackMute', track: 1, mute: false });
  });
  it('videonun kendi sesi', () => {
    expect(one('videonun sesini %50 yap')).toEqual({ type: 'setMasterGain', percent: 50 });
    expect(one('orijinal sesi sustur')).toEqual({ type: 'setOriginalMute', mute: true });
    expect(parseCommand('videonun sesini kıs').actions).toEqual([]); // yüzde yoksa tahmin yürütülmez
  });
  it('fade yönleri ve süre', () => {
    expect(one('sonuna 2 saniye fade ekle')).toEqual({ type: 'setFade', track: 'all', fadeOut: 2 });
    expect(one('3. sese giriş fade 1,5 sn koy')).toEqual({ type: 'setFade', track: 3, fadeIn: 1.5 });
    expect(one('fade ekle')).toEqual({ type: 'setFade', track: 'all', fadeIn: 1, fadeOut: 1 });
  });
  it('altyazı kaydırma, boş silme, videoya yazma', () => {
    expect(one('altyazıyı 2 sn ileri al')).toEqual({ type: 'shiftSubtitles', seconds: 2 });
    expect(one('altyazıları 0,5 saniye geri al')).toEqual({ type: 'shiftSubtitles', seconds: -0.5 });
    expect(one('boş altyazıları sil')).toEqual({ type: 'removeEmptySubtitles' });
    expect(one('altyazıyı videoya yaz')).toEqual({ type: 'setBurnSubtitles', on: true });
    expect(one('altyazıyı videoya yazma')).toEqual({ type: 'setBurnSubtitles', on: false });
  });
  it('geçişler', () => {
    expect(one('geçişleri çapraz yap 0,5 sn')).toEqual({ type: 'setTransitions', kind: 'dissolve', duration: 0.5 });
    expect(one('tüm geçişleri siyaha solma yap')).toEqual({ type: 'setTransitions', kind: 'fadeblack', duration: undefined });
    expect(one('geçişleri kaldır')).toEqual({ type: 'setTransitions', kind: 'cut', duration: undefined });
  });
  it('miks bayrağı', () => {
    expect(one('ses miksini uygula')).toEqual({ type: 'setApplyMix', on: true });
    expect(one('ses miksini uygulama')).toEqual({ type: 'setApplyMix', on: false });
  });
  it('büyük harf, Türkçe İ/I ve ondalık sayıları doğru okur', () => {
    expect(one("KONUŞURKEN MÜZİĞİ %25'E İNDİR")).toEqual({ type: 'setDucking', strength: 0.75 });
    expect(one('ALTYAZIYI 2 SN İLERİ AL')).toEqual({ type: 'shiftSubtitles', seconds: 2 });
    expect(one('altyazıyı 1.25 sn geri al')).toEqual({ type: 'shiftSubtitles', seconds: -1.25 });
    expect(parseCommand('1. sesi sustur. 2. sesi %50 yap').actions).toHaveLength(2);
  });
  it('anlaşılmayanı ve tehlikeli girdiyi eylem yapmaz', () => {
    for (const t of ['dosyaları sil', 'del /s C:\\', 'rm -rf /', 'bana bir fıkra anlat', '', '   ', '; ;']) expect(parseCommand(t).actions, t).toEqual([]);
    expect(parseCommand('x'.repeat(5000)).actions).toEqual([]);
  });
  it('her işlem için Türkçe açıklama üretir', () => {
    for (const t of ['konuşurken müziği kıs', '2. sesi %50 yap', 'altyazıyı 2 sn ileri al', 'geçişleri çapraz yap', 'sonuna 2 sn fade ekle', 'ducking kapat', 'orijinal sesi sustur', 'boş altyazıları sil', 'altyazıyı videoya yaz', 'ses miksini uygula', '1. sesi sustur', 'videonun sesini %50 yap']) {
      expect(describeAction(one(t)).length, t).toBeGreaterThan(8);
    }
  });
});

describe('komut uygulama', () => {
  it('müzik kısma ve ses düzeyi miks durumuna yazılır, girdi değişmez', () => {
    const p = project();
    const out = applyActions(p, [{ type: 'setDucking', strength: 0.75 }, { type: 'setTrackGain', track: 2, percent: 50 }, { type: 'setMasterGain', percent: 80 }]);
    expect(out.results.every(r => r.ok)).toBe(true);
    expect(out.project.audioMix?.ducking).toBe(0.75);
    expect(out.project.audioMix?.tracks[1].gain).toBe(0.5);
    expect(out.project.audioMix?.tracks[0].gain).toBe(1);
    expect(out.project.audioMix?.gain).toBe(0.8);
    expect(p.audioMix?.ducking).toBeUndefined();
  });
  it('olmayan kanal, sınır dışı değer ve fazla uzun fade reddedilir; proje aynı kalır', () => {
    const p = project();
    const bad: EditAction[] = [{ type: 'setTrackGain', track: 5, percent: 50 }, { type: 'setTrackGain', track: 1, percent: 500 }, { type: 'setFade', track: 1, fadeIn: 8, fadeOut: 8 }, { type: 'setDucking', strength: 2 }, { type: 'setTrackMute', track: 9, mute: true }];
    const out = applyActions(p, bad);
    expect(out.results.every(r => !r.ok)).toBe(true);
    expect(out.project).toBe(p);
    expect(out.results[0].message).toMatch(/5\. ek ses yok/);
  });
  it('miks yokken kanal komutu reddedilir, ana düzey yine de ayarlanabilir', () => {
    const p = { ...project(), audioMix: undefined };
    expect(applyAction(p, { type: 'setTrackMute', track: 'all', mute: true }).result.ok).toBe(false);
    expect(applyAction(p, { type: 'setMasterGain', percent: 70 }).project.audioMix?.gain).toBe(0.7);
  });
  it('fade yalnız istenen yönü değiştirir', () => {
    const p = project();
    p.audioMix!.tracks[0].fadeOut = 2;
    const out = applyAction(p, { type: 'setFade', track: 1, fadeIn: 1 });
    expect(out.project.audioMix?.tracks[0]).toMatchObject({ fadeIn: 1, fadeOut: 2 });
  });
  it('altyazı kaydırma sınırları korur, boşları siler', () => {
    const p = project();
    const shifted = applyAction(p, { type: 'shiftSubtitles', seconds: 2 });
    expect(shifted.project.subtitles.map(c => [c.start, c.end])).toEqual([[3, 4], [5, 6]]);
    expect(applyAction(p, { type: 'shiftSubtitles', seconds: -5 }).result.ok).toBe(false);
    expect(applyAction({ ...p, subtitles: [] }, { type: 'shiftSubtitles', seconds: 1 }).result.ok).toBe(false);
    expect(applyAction(p, { type: 'removeEmptySubtitles' }).project.subtitles).toHaveLength(1);
    expect(applyAction({ ...p, subtitles: [p.subtitles[0]] }, { type: 'removeEmptySubtitles' }).result.ok).toBe(false);
  });
  it('geçişler yalnız son olmayan kliplere yazılır; tek klipte reddedilir', () => {
    const p = project();
    const out = applyAction(p, { type: 'setTransitions', kind: 'dissolve', duration: 0.5 });
    expect(out.project.timeline?.clips.map(c => c.transition?.kind)).toEqual(['dissolve', 'dissolve', undefined]);
    const back = applyAction(out.project, { type: 'setTransitions', kind: 'cut' });
    expect(back.project.timeline?.clips.every(c => !c.transition)).toBe(true);
    expect(applyAction({ ...p, timeline: { ...p.timeline!, clips: [clip(1)] } }, { type: 'setTransitions', kind: 'fade' }).result.ok).toBe(false);
  });
  it('bayraklar zaman çizelgesi durumuna yazılır', () => {
    const out = applyActions({ ...project(), timeline: undefined }, [{ type: 'setBurnSubtitles', on: true }, { type: 'setApplyMix', on: true }]);
    expect(out.project.timeline).toMatchObject({ burnSubtitles: true, applyMix: true });
  });
  it('bir işlem başarısız olsa da diğerleri uygulanır ve sonuçlar sırayla raporlanır', () => {
    const out = applyActions(project(), [{ type: 'setTrackGain', track: 7, percent: 10 }, { type: 'setDucking', strength: 0.5 }]);
    expect(out.results.map(r => r.ok)).toEqual([false, true]);
    expect(out.project.audioMix?.ducking).toBe(0.5);
  });
});
