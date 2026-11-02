import { describe, expect, it } from 'vitest';
import { coverOutputName, fileNameOf, friendlyCoverError, isCoverImage, isCoverVideo } from './cover';

describe('kapak yardımcıları', () => {
  it('uzantıları büyük/küçük harfe bakmadan tanır', () => {
    expect(isCoverVideo('C:\\v\\Klip.MP4')).toBe(true);
    expect(isCoverVideo('/a/b.mov')).toBe(true);
    expect(isCoverVideo('C:\\v\\klip.mkv')).toBe(false);
    expect(isCoverVideo('C:\\v\\klip')).toBe(false);
    expect(isCoverImage('x.JPG')).toBe(true);
    expect(isCoverImage('x.gif')).toBe(false);
  });
  it('dosya adını yoldan ayırır (Windows ve Unix)', () => {
    expect(fileNameOf('C:\\Videolar\\Tatil ğş.mp4')).toBe('Tatil ğş.mp4');
    expect(fileNameOf('/a/b/c.mov')).toBe('c.mov');
  });
  it('önerilen çıktı adı uzantıyı korur', () => {
    expect(coverOutputName('C:\\v\\Tatil ğş.mp4')).toBe('Tatil ğş_kapakli.mp4');
    expect(coverOutputName('/a/klip.v2.MOV')).toBe('klip.v2_kapakli.MOV');
    expect(coverOutputName('C:\\v\\uzantisiz')).toBe('uzantisiz_kapakli.mp4');
  });
  it('hata mesajlarını sadeleştirir, bilinmeyeni kısaltır', () => {
    expect(friendlyCoverError('Yeni bir .mp4 dosya adı seçin; mevcut dosyaların üzerine yazılmaz.')).toContain('zaten var');
    expect(friendlyCoverError('Bu dosyada video akışı yok; kapak yalnızca videoya eklenir.')).toContain('yalnızca ses');
    expect(friendlyCoverError('x'.repeat(500)).length).toBeLessThanOrEqual(301);
    expect(friendlyCoverError('başka hata')).toBe('başka hata');
  });
});
