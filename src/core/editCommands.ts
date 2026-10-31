import { emptyAudioMix, MAX_MIX_TRACKS, type AudioMixState } from './audioMixModel';
import { emptyTimeline, setTransition, TRANSITIONS, type TransitionKind } from './timelineModel';
import type { ProjectDocument } from './types';

/**
 * Komutla düzenleme (A8). Kullanıcının Türkçe cümlesi KAPALI bir `EditAction` şemasına çevrilir; serbest komut, kabuk veya
 * model çıktısı yoktur. Önce plan gösterilir, kullanıcı onaylayınca uygulanır; her işlem proje geçmişine (geri al) düşer.
 * Ayrıştırıcı kural tabanlıdır (yerel, ağ gerektirmez) ve anlamadığı parçaları açıkça "anlaşılamadı" diye bildirir.
 */
export type TrackRef = number | 'all';
export type EditAction =
  | { type: 'setDucking'; strength: number }
  | { type: 'setMasterGain'; percent: number }
  | { type: 'setOriginalMute'; mute: boolean }
  | { type: 'setTrackGain'; track: TrackRef; percent: number }
  | { type: 'setTrackMute'; track: TrackRef; mute: boolean }
  | { type: 'setFade'; track: TrackRef; fadeIn?: number; fadeOut?: number }
  | { type: 'shiftSubtitles'; seconds: number }
  | { type: 'removeEmptySubtitles' }
  | { type: 'setTransitions'; kind: TransitionKind; duration?: number }
  | { type: 'setBurnSubtitles'; on: boolean }
  | { type: 'setApplyMix'; on: boolean };

export type ParsedCommand = { actions: EditAction[]; unknown: string[] };
export type ActionResult = { action: EditAction; ok: boolean; message: string };

export const DEFAULT_DUCKING = 0.6;
export const MAX_COMMAND_LENGTH = 400;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Türkçe harfleri ASCII karşılıklarına katlar; desenler de aynı biçimde yazıldığı için \w ve \b doğru çalışır. */
const fold = (text: string) => text.replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u');

const normalize = (text: string) => text.toLocaleLowerCase('tr-TR').normalize('NFC').replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();

const WORD_NUMBERS: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8 };

/** "1,5" / "1.5" / "2" → sayı. */
const toNumber = (raw: string): number => Number(raw.replace(',', '.'));

function percentOf(c: string): number | null {
  const m = c.match(/%\s*(\d+(?:[.,]\d+)?)/) ?? c.match(/(\d+(?:[.,]\d+)?)\s*%/) ?? c.match(/yuzde\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = toNumber(m[1]);
  return Number.isFinite(v) ? v : null;
}

function secondsOf(c: string): number | null {
  const m = c.match(/(\d+(?:[.,]\d+)?)\s*(?:sn|saniye|s)\b/);
  if (m) { const v = toNumber(m[1]); return Number.isFinite(v) ? v : null; }
  const w = c.match(/\b(bir|iki|uc|dort|bes|alti|yedi|sekiz)\s*(?:sn|saniye)\b/);
  return w ? WORD_NUMBERS[w[1]] : null;
}

/** "2. ses", "3 numaralı kanal", "ikinci ses" ya da "tüm ek sesler". Belirtilmemişse null. */
function trackOf(c: string): TrackRef | null {
  if (/\b(tum|butun|hepsi\w*|tamami\w*)\b[^,]*\b(ek\s+)?(ses|kanal|parca)/.test(c) || /\bek\s+ses\w*/.test(c)) return 'all';
  const num = c.match(/(\d+)\s*(?:\.|'?(?:inci|inci|uncu|uncu|nci|nci)|numarali|nolu)?\s*(?:ek\s+)?(?:ses|kanal|parca)/);
  if (num) { const n = Number(num[1]); if (Number.isInteger(n)) return n; }
  const ord: Record<string, number> = { birinci: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6, yedinci: 7, sekizinci: 8 };
  const w = c.match(/\b(birinci|ikinci|ucuncu|dorduncu|besinci|altinci|yedinci|sekizinci)\s+(?:ek\s+)?(?:ses|kanal|parca)/);
  return w ? ord[w[1]] : null;
}

const TRANSITION_WORDS: [RegExp, TransitionKind][] = [
  [/siyah\w*|karart\w*/, 'fadeblack'], [/beyaz\w*/, 'fadewhite'], [/dissolve|capraz|cozul\w*/, 'dissolve'],
  [/sola\s+sil\w*|wipe\s*left/, 'wipeleft'], [/saga\s+sil\w*|wipe\s*right/, 'wiperight'],
  [/sola\s+kay\w*|slide\s*left/, 'slideleft'], [/saga\s+kay\w*|slide\s*right/, 'slideright'],
  [/daire\w*|circle/, 'circleopen'], [/piksel\w*|pixel\w*/, 'pixelize'], [/radyal\w*|radial/, 'radial'],
  [/solma\w*|fade/, 'fade'], [/\bkes\w*|gecissiz|kaldir\w*|sil(?:\s+hepsini)?\b/, 'cut'],
];

function parseClause(raw: string): EditAction | null {
  const c = normalize(raw);
  if (!c) return null;
  const pct = percentOf(c);
  const secs = secondsOf(c);
  const lower = /\b(kis\w*|indir\w*|dusur\w*|azalt\w*|alcalt\w*)\b/.test(c);

  // Konuşma sırasında müziği kısma (ducking).
  if (/\bducking\b|muzik\w*\s+kisma/.test(c) && /\b(kapat\w*|iptal|kaldir\w*|sifirla\w*)\b/.test(c)) return { type: 'setDucking', strength: 0 };
  if (/\b(konus\w*|soz\w*)\b/.test(c) && /muzi\w*|fon\b|arka\s*plan/.test(c) && lower) {
    return { type: 'setDucking', strength: pct === null ? DEFAULT_DUCKING : round3(clamp(1 - pct / 100, 0, 1)) };
  }

  // Altyazı kaydırma / boş altyazı silme / videoya yakma.
  if (/altyazi\w*/.test(c)) {
    if (/bos/.test(c) && /\b(sil\w*|kaldir\w*|temizle\w*)\b/.test(c)) return { type: 'removeEmptySubtitles' };
    if (secs !== null && /\b(ileri|gec|otele\w*|ilerlet\w*|sonraya)\b/.test(c)) return { type: 'shiftSubtitles', seconds: secs };
    if (secs !== null && /\b(geri|erken\w*|one|oncesine)\b/.test(c)) return { type: 'shiftSubtitles', seconds: -secs };
    if (/(videoya|video\s+uzerine|videonun\s+uzerine|ustune|yak\w*|gom\w*|\byaz\w*)/.test(c)) return { type: 'setBurnSubtitles', on: !/(yakma|yazma|gomme|yazilmasin|yakilmasin)/.test(c) };
  }

  // Geçişler.
  if (/gecis\w*/.test(c)) {
    const kind = TRANSITION_WORDS.find(([re]) => re.test(c.replace(/gecis\w*/g, '')))?.[1];
    if (kind) return { type: 'setTransitions', kind, duration: secs ?? undefined };
  }

  // Ses miksini çıktıya uygulama.
  if (/miks\w*/.test(c) && /\b(uygula\w*|ekle\w*|dahil|kapat\w*|kullan\w*)\b/.test(c)) return { type: 'setApplyMix', on: !/(uygulama|kapat|ekleme|kullanma)/.test(c) };

  // Videonun kendi sesi.
  if (/\b(videonun|orijinal|asil|kamera)\b[^,]*\bses\w*/.test(c)) {
    if (/\b(sustur\w*|kapat\w*)/.test(c) && pct === null) return { type: 'setOriginalMute', mute: true };
    if (/\b(ac\b|ac(?:in|sin)|susturma\w*)/.test(c) && pct === null) return { type: 'setOriginalMute', mute: false };
    if (pct !== null) return { type: 'setMasterGain', percent: pct };
  }

  // Ek ses kanalları: fade, seviye, sustur.
  const fadeWord = /\bfade\b|kararma|yumusak|acilis|kapanis/.test(c);
  const track = trackOf(c);
  if (fadeWord) {
    const length = secs ?? 1;
    const wantsIn = /(giris|basina|basinda|baslangic|acilis|\bin\b|fade\s*in)/.test(c);
    const wantsOut = /(cikis|sonuna|sonunda|bitis|kapanis|\bout\b|fade\s*out)/.test(c);
    return { type: 'setFade', track: track ?? 'all', ...(wantsOut && !wantsIn ? { fadeOut: length } : wantsIn && !wantsOut ? { fadeIn: length } : { fadeIn: length, fadeOut: length }) };
  }
  if (track !== null && /(susturma\w*\s+(kaldir|kapat)|sesini\s+ac\b|sesi\s+ac\b|\bac\b)/.test(c) && pct === null) return { type: 'setTrackMute', track, mute: false };
  if (track !== null && /\b(sustur\w*)/.test(c)) return { type: 'setTrackMute', track, mute: true };
  if (track !== null && pct !== null) return { type: 'setTrackGain', track, percent: pct };
  return null;
}

/** Cümleyi "," ";" "ve" "sonra" "ardından" sınırlarından işlem parçalarına böler ve her parçayı kapalı şemaya eşler. */
export function parseCommand(text: string): ParsedCommand {
  const input = text.slice(0, MAX_COMMAND_LENGTH);
  // Ondalık sayılardaki ("1,5") ve sıra sayılarındaki ("2. ses") nokta/virgül cümle ayırıcısı sayılmaz.
  const protectedText = normalize(input).replace(/(\d)[.,](?=\d)/g, '$1\u0001').replace(/(\d)\.(?=\s)/g, '$1\u0002');
  const clauses = protectedText.split(/\s*(?:[,;.]|\bve\b|\bsonra\b|\bardından\b|\bayrıca\b)\s*/).map(s => s.replace(/[\u0001\u0002]/g, '.').trim()).filter(Boolean);
  const actions: EditAction[] = [];
  const unknown: string[] = [];
  for (const clause of clauses) {
    const action = parseClause(fold(clause));
    if (action) actions.push(action); else unknown.push(clause);
  }
  return { actions, unknown };
}

const trackName = (t: TrackRef) => (t === 'all' ? 'tüm ek sesler' : `${t}. ek ses`);

/** Onay ekranında gösterilen, işlemin ne yapacağını anlatan Türkçe cümle. */
export function describeAction(a: EditAction): string {
  switch (a.type) {
    case 'setDucking': return a.strength === 0 ? 'Konuşma sırasında müzik kısmayı kapat' : `Konuşma sırasında müzik kısma gücünü ${Math.round(a.strength * 100)}% yap (güç; müziğin kalacağı düzey değildir)`;
    case 'setMasterGain': return `Videonun orijinal sesini %${Math.round(a.percent)} yap`;
    case 'setOriginalMute': return a.mute ? 'Videonun orijinal sesini sustur' : 'Videonun orijinal sesinin susturmasını kaldır';
    case 'setTrackGain': return `${trackName(a.track)} düzeyini %${Math.round(a.percent)} yap`;
    case 'setTrackMute': return `${trackName(a.track)} ${a.mute ? 'sustur' : 'sesini aç'}`;
    case 'setFade': return `${trackName(a.track)}: ${[a.fadeIn !== undefined ? `giriş fade ${a.fadeIn} sn` : '', a.fadeOut !== undefined ? `çıkış fade ${a.fadeOut} sn` : ''].filter(Boolean).join(', ')}`;
    case 'shiftSubtitles': return `Tüm altyazıları ${Math.abs(a.seconds)} sn ${a.seconds >= 0 ? 'ileri (geç)' : 'geri (erken)'} al`;
    case 'removeEmptySubtitles': return 'Metni boş olan altyazıları sil';
    case 'setTransitions': return `Klipler arası tüm geçişleri "${TRANSITIONS.find(t => t.id === a.kind)?.label ?? a.kind}" yap${a.duration !== undefined ? ` (${a.duration} sn)` : ''}`;
    case 'setBurnSubtitles': return a.on ? 'Birleştirmede altyazıları videoya yaz' : 'Birleştirmede altyazıları videoya yazma';
    case 'setApplyMix': return a.on ? 'Birleştirmede ses miksini uygula' : 'Birleştirmede ses miksini uygulama';
  }
}

function applyToMix(p: ProjectDocument, fn: (m: AudioMixState) => AudioMixState): ProjectDocument {
  return { ...p, audioMix: fn(p.audioMix ?? emptyAudioMix()) };
}

function trackIndexes(mix: AudioMixState, ref: TrackRef): number[] | string {
  if (ref === 'all') return mix.tracks.length ? mix.tracks.map((_, i) => i) : 'Miksde ek ses yok.';
  if (!Number.isInteger(ref) || ref < 1 || ref > MAX_MIX_TRACKS) return `${ref}. ek ses geçersiz (1–${MAX_MIX_TRACKS}).`;
  return ref <= mix.tracks.length ? [ref - 1] : `${ref}. ek ses yok (şu an ${mix.tracks.length} ek ses var).`;
}

/** Tek işlemi uygular; geçersizse projeyi değiştirmeden nedenini bildirir. Saf fonksiyondur. */
export function applyAction(project: ProjectDocument, a: EditAction): { project: ProjectDocument; result: ActionResult } {
  const fail = (message: string) => ({ project, result: { action: a, ok: false, message } });
  const done = (next: ProjectDocument, message = 'Uygulandı.') => ({ project: next, result: { action: a, ok: true, message } });
  switch (a.type) {
    case 'setDucking': {
      if (!Number.isFinite(a.strength) || a.strength < 0 || a.strength > 1) return fail('Kısma gücü 0 ile %100 arasında olmalı.');
      return done(applyToMix(project, m => ({ ...m, ducking: a.strength })));
    }
    case 'setMasterGain': {
      if (!Number.isFinite(a.percent) || a.percent < 0 || a.percent > 200) return fail('Düzey %0 ile %200 arasında olmalı.');
      return done(applyToMix(project, m => ({ ...m, gain: round3(a.percent / 100) })));
    }
    case 'setOriginalMute': return done(applyToMix(project, m => ({ ...m, mute: a.mute })));
    case 'setTrackGain': {
      if (!Number.isFinite(a.percent) || a.percent < 0 || a.percent > 200) return fail('Düzey %0 ile %200 arasında olmalı.');
      const mix = project.audioMix ?? emptyAudioMix();
      const idx = trackIndexes(mix, a.track);
      if (typeof idx === 'string') return fail(idx);
      return done(applyToMix(project, m => ({ ...m, tracks: m.tracks.map((t, i) => (idx.includes(i) ? { ...t, gain: round3(a.percent / 100) } : t)) })));
    }
    case 'setTrackMute': {
      const idx = trackIndexes(project.audioMix ?? emptyAudioMix(), a.track);
      if (typeof idx === 'string') return fail(idx);
      return done(applyToMix(project, m => ({ ...m, tracks: m.tracks.map((t, i) => (idx.includes(i) ? { ...t, mute: a.mute } : t)) })));
    }
    case 'setFade': {
      const mix = project.audioMix ?? emptyAudioMix();
      const idx = trackIndexes(mix, a.track);
      if (typeof idx === 'string') return fail(idx);
      for (const v of [a.fadeIn, a.fadeOut]) if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 30)) return fail('Fade süresi 0–30 sn olmalı.');
      const tooLong = idx.find(i => { const t = mix.tracks[i]; return (a.fadeIn ?? t.fadeIn) + (a.fadeOut ?? t.fadeOut) > t.length + 1e-9; });
      if (tooLong !== undefined) return fail(`${tooLong + 1}. ek sesin kesit süresi (${mix.tracks[tooLong].length.toFixed(1)} sn) fade toplamından kısa.`);
      return done(applyToMix(project, m => ({ ...m, tracks: m.tracks.map((t, i) => (idx.includes(i) ? { ...t, fadeIn: a.fadeIn ?? t.fadeIn, fadeOut: a.fadeOut ?? t.fadeOut } : t)) })));
    }
    case 'shiftSubtitles': {
      if (!Number.isFinite(a.seconds) || Math.abs(a.seconds) > 3600) return fail('Kaydırma miktarı geçersiz.');
      if (!project.subtitles.length) return fail('Projede altyazı yok.');
      if (project.subtitles.some(c => c.start + a.seconds < 0)) return fail('Kaydırma bazı altyazıları 0 sn öncesine taşırdı; uygulanmadı.');
      return done({ ...project, subtitles: project.subtitles.map(c => ({ ...c, start: round3(c.start + a.seconds), end: round3(c.end + a.seconds) })) }, `${project.subtitles.length} altyazı kaydırıldı.`);
    }
    case 'removeEmptySubtitles': {
      const kept = project.subtitles.filter(c => c.text.trim());
      const removed = project.subtitles.length - kept.length;
      return removed ? done({ ...project, subtitles: kept }, `${removed} boş altyazı silindi.`) : fail('Boş altyazı yok.');
    }
    case 'setTransitions': {
      const timeline = project.timeline ?? emptyTimeline();
      if (timeline.clips.length < 2) return fail('Geçiş için zaman çizelgesinde en az 2 klip gerekir.');
      let clips = timeline.clips;
      for (const clip of timeline.clips.slice(0, -1)) clips = setTransition(clips, clip.id, a.kind, a.duration);
      return done({ ...project, timeline: { ...timeline, clips } }, `${timeline.clips.length - 1} geçiş ayarlandı (süre komşu kliplere göre sınırlanabilir).`);
    }
    case 'setBurnSubtitles': return done({ ...project, timeline: { ...(project.timeline ?? emptyTimeline()), burnSubtitles: a.on } });
    case 'setApplyMix': return done({ ...project, timeline: { ...(project.timeline ?? emptyTimeline()), applyMix: a.on } });
  }
}

/** Planın tamamını sırayla uygular. Hiçbiri başarılı değilse projeyi aynen (aynı nesne) döndürür. */
export function applyActions(project: ProjectDocument, actions: EditAction[]): { project: ProjectDocument; results: ActionResult[] } {
  let current = project;
  const results: ActionResult[] = [];
  for (const action of actions) {
    const out = applyAction(current, action);
    current = out.project;
    results.push(out.result);
  }
  return { project: results.some(r => r.ok) ? current : project, results };
}
