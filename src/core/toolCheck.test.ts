import { describe, expect, it } from 'vitest';
import { describeToolProblems, type ToolCheck } from './toolCheck';

const full: ToolCheck[] = [
  ['ffmpeg', true, 'ffmpeg version 9.0.2'], ['ffprobe', true, 'ffprobe version 9.0.2'],
  ['kodlayıcı:libx264', true, 'H.264 video kodlayıcı'], ['filtre:subtitles', true, 'altyazı yakma (libass)'],
];

describe('describeToolProblems', () => {
  it('her şey tamamsa uyarı yok', () => expect(describeToolProblems(full)).toEqual([]));

  it('FFmpeg eksikse tek ve açık bir uyarı verir, yetenek listesi eklenmez', () => {
    const out = describeToolProblems([['ffmpeg', false, 'bulunamadı'], ['ffprobe', false, 'bulunamadı']]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/FFmpeg ve FFprobe bulunamadı/);
    expect(out[0]).toMatch(/PATH/);
  });

  it('yalnız FFprobe eksikse onu adıyla söyler', () => {
    const out = describeToolProblems([['ffmpeg', true, 'v'], ['ffprobe', false, 'yok']]);
    expect(out[0]).toMatch(/^FFprobe bulunamadı/);
  });

  it('boş sonuç (denetim yapılamadı) FFmpeg yok sayılır', () => {
    expect(describeToolProblems([])[0]).toMatch(/FFmpeg ve FFprobe bulunamadı/);
  });

  it('eksik kodlayıcı/filtreleri insan okuyabilir ayrıntıyla listeler', () => {
    const out = describeToolProblems([...full, ['kodlayıcı:libmp3lame', false, 'MP3 kodlayıcı'], ['filtre:sidechaincompress', false, 'otomatik müzik kısma']]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('MP3 kodlayıcı');
    expect(out[0]).toContain('otomatik müzik kısma');
    expect(out[0]).not.toContain('H.264');
  });
});
