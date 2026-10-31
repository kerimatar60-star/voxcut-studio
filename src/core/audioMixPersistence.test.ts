import { describe, expect, it } from 'vitest';
import { emptyAudioMix, mixRequest, parseAudioMix, reconcileMix, type AudioMixState, type MixTrack } from './audioMixModel';
import { exampleProject, parseProject } from './project';

const track = (patch: Partial<MixTrack> = {}): MixTrack => ({ id: 't1', path: 'D:\Müzik\şarkı ğüş.wav', gain: 0.6, pan: -0.4, start: 1.5, sourceIn: 2, length: 4, fadeIn: 0.5, fadeOut: 1, mute: false, solo: true, sourceDuration: 10, ...patch });
const mix = (): AudioMixState => ({ videoPath: 'D:\Videolar\klip.mp4', videoDuration: 12, hasOriginal: true, gain: 0.7, mute: false, solo: false, tracks: [track(), track({ id: 't2', path: 'D:\b.mp3', mute: true, solo: false })] });
const roundTrip = (project: unknown) => parseProject(JSON.parse(JSON.stringify(project)));

describe('ses miksi proje kalıcılığı', () => {
  it('kaydet → kapat → aç: tüm kanal ayarları aynen korunur', () => {
    const saved = { ...exampleProject(), audioMix: mix() };
    expect(roundTrip(saved).audioMix).toEqual(mix());
  });
  it('eski proje (audioMix alanı yok) hâlâ açılır', () => {
    const old = JSON.parse(JSON.stringify(exampleProject()));
    expect('audioMix' in old).toBe(false);
    const opened = parseProject(old);
    expect(opened.audioMix).toBeUndefined();
    expect(opened.name).toBe('İlk Projem');
  });
  it('JSON yalnız yol ve ayar içerir; medya baytı/base64 gömülmez', () => {
    const json = JSON.stringify({ ...exampleProject(), audioMix: mix() });
    expect(json.length).toBeLessThan(20_000);
    expect(json).not.toMatch(/data:(audio|video)/);
    const hostile = { ...exampleProject(), audioMix: { ...mix(), blob: 'A'.repeat(100000), tracks: [{ ...track(), bytes: 'B'.repeat(100000) }] } };
    const reopened = JSON.stringify(roundTrip(hostile));
    expect(reopened).not.toContain('AAAAAAAAAA');
    expect(reopened).not.toContain('BBBBBBBBBB');
  });
  it('bozuk veya sınır dışı miks verisini reddeder / sınırlar', () => {
    expect(() => parseAudioMix('x')).toThrow();
    expect(() => parseAudioMix({ tracks: Array.from({ length: 9 }, () => track()) })).toThrow();
    expect(() => parseAudioMix({ tracks: [{ ...track(), path: '' }] })).toThrow();
    const clamped = parseAudioMix({ gain: 99, tracks: [{ ...track(), pan: 5, gain: NaN }] })!;
    expect(clamped.gain).toBe(2);
    expect(clamped.tracks[0].pan).toBe(1);
    expect(clamped.tracks[0].gain).toBe(0.8);
  });
  it('boş miks ile eski varsayılanlar korunur', () => {
    expect(parseAudioMix({})).toEqual(emptyAudioMix());
  });
});

describe('açılışta medya yeniden doğrulama', () => {
  const ok = (duration: number, hasAudio = true, hasVideo = false) => ({ ok: true as const, duration, hasAudio, hasVideo });
  it('değişmemiş dosyalar sorunsuz geçer', () => {
    const r = reconcileMix(mix(), ok(12, true, true), [ok(10), ok(10)]);
    expect(r.issues).toEqual({});
    expect(r.notes).toEqual([]);
    expect(r.mix).toEqual(mix());
  });
  it('kayıtlı süreye güvenmez: gerçek süre kullanılır, kesit sığdırılır', () => {
    const r = reconcileMix(mix(), ok(8, true, true), [ok(4), ok(10)]);
    expect(r.mix.videoDuration).toBe(8);
    expect(r.mix.tracks[0].sourceDuration).toBe(4);
    expect(r.mix.tracks[0].length).toBeCloseTo(2);
    expect(r.mix.tracks[0].fadeIn + r.mix.tracks[0].fadeOut).toBeCloseTo(1.5);
    expect(r.notes.length).toBeGreaterThan(0);
    expect(() => mixRequest(r.mix.videoDuration, r.mix.gain, r.mix.mute, r.mix.solo, r.mix.tracks)).not.toThrow();
  });
  it('taşınmış/silinmiş dosyayı bildirir, yolu ve ayarları silmez', () => {
    const r = reconcileMix(mix(), { ok: false, error: 'Medya dosyası bulunamadı.' }, [{ ok: false, error: 'yok' }, ok(10)]);
    expect(r.issues.video).toContain('klip.mp4');
    expect(r.issues.t1).toContain('Kanal 1');
    expect(r.issues.t2).toBeUndefined();
    expect(r.mix.videoPath).toBe(mix().videoPath);
    expect(r.mix.tracks[0]).toEqual(mix().tracks[0]);
  });
  it('artık ses/video içermeyen dosyayı sorun sayar', () => {
    const r = reconcileMix(mix(), ok(12, true, false), [ok(10, false), ok(10)]);
    expect(r.issues.video).toBeDefined();
    expect(r.issues.t1).toContain('ses içermiyor');
  });
  it('video seçilmemiş boş miksi sorunsuz geçer', () => {
    expect(reconcileMix(emptyAudioMix(), null, []).issues).toEqual({});
  });
});

describe('fade taşması', () => {
  it('kesit fade toplamından kısalırsa fade sıfırlanır', () => {
    const m = mix(); m.tracks[0].sourceIn = 2; m.tracks[0].length = 4; m.tracks[0].fadeIn = 1.5; m.tracks[0].fadeOut = 1.5;
    const r = reconcileMix(m, { ok: true, duration: 12, hasAudio: true, hasVideo: true }, [{ ok: true, duration: 3, hasAudio: true, hasVideo: false }, { ok: true, duration: 10, hasAudio: true, hasVideo: false }]);
    expect(r.mix.tracks[0].fadeIn + r.mix.tracks[0].fadeOut).toBe(0);
  });
});
