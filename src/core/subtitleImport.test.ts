import { describe, expect, it } from 'vitest';
import { cuesToSrt, cuesToVtt, parseSubtitles, parseTimestamp } from './subtitles';

let n = 0; const id = () => `c${++n}`;

describe('parseTimestamp', () => {
  it('SRT virgüllü ve VTT noktalı biçimleri okur', () => {
    expect(parseTimestamp('00:01:02,500')).toBeCloseTo(62.5);
    expect(parseTimestamp('01:02.500')).toBeCloseTo(62.5);
    expect(parseTimestamp('01:00:00.000')).toBe(3600);
    expect(parseTimestamp('00:00:01,5')).toBeCloseTo(1.5);
  });
  it('geçersizleri reddeder', () => {
    for (const bad of ['', 'abc', '00:61:00,000', '00:00:61,000', '12']) expect(parseTimestamp(bad)).toBeNull();
  });
});

describe('parseSubtitles', () => {
  it('SRT okur (BOM, CRLF, çok satırlı metin)', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nMerhaba\r\nDünya\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nİkinci\r\n';
    const { cues, skipped } = parseSubtitles(srt, id);
    expect(skipped).toBe(0);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 2.5, text: 'Merhaba\nDünya' });
  });

  it('WebVTT okur: başlık, NOTE, cue kimliği, ayarlar, saat opsiyonel', () => {
    const vtt = 'WEBVTT - başlık\n\nNOTE bu bir not\n\nintro\n00:01.000 --> 00:02.000 align:start position:10%\nİlk <i>satır</i>\n\n00:00:03.000 --> 00:00:04.000\n<v Ali>Merhaba &amp; selam</v>\n';
    const { cues, skipped } = parseSubtitles(vtt, id);
    expect(skipped).toBe(0);
    expect(cues.map(c => c.text)).toEqual(['İlk satır', 'Merhaba & selam']);
    expect(cues[0]).toMatchObject({ start: 1, end: 2 });
  });

  it('ASS etiketlerini temizler', () => {
    const srt = ['1', '00:00:00,000 --> 00:00:01,000', '{\\an8}Üstte', ''].join('\n');
    expect(srt).toContain('{\\an8}');
    expect(parseSubtitles(srt, id).cues[0].text).toBe('Üstte');
  });

  it('geçersiz blokları atlar ve sayar, geçerlileri sıralı döndürür', () => {
    const srt = '1\n00:00:05,000 --> 00:00:06,000\nSon\n\n2\n00:00:03,000 --> 00:00:02,000\nTers\n\n3\n00:00:00,000 --> 00:00:01,000\n\n\n4\n00:00:01,000 --> 00:00:02,000\nİlk\n';
    const { cues, skipped } = parseSubtitles(srt, id);
    expect(skipped).toBe(2);
    expect(cues.map(c => c.text)).toEqual(['İlk', 'Son']);
  });

  it('hiç geçerli altyazı yoksa hata verir', () => {
    expect(() => parseSubtitles('', id)).toThrow(/geçerli altyazı/);
    expect(() => parseSubtitles('rastgele metin', id)).toThrow();
    expect(() => parseSubtitles('WEBVTT\n', id)).toThrow();
  });

  it('SRT → içe aktar → SRT gidiş-dönüşünde içerik korunur', () => {
    const original = [{ id: 'a', start: 1.25, end: 3, text: 'Çok güzel\nİkinci satır' }, { id: 'b', start: 4, end: 5.5, text: 'ĞÜŞİÖÇ' }];
    const back = parseSubtitles(cuesToSrt(original), id).cues;
    expect(back.map(({ start, end, text }) => ({ start, end, text }))).toEqual(original.map(({ start, end, text }) => ({ start, end, text })));
  });
});

describe('cuesToVtt', () => {
  it('WEBVTT başlığı ve noktalı zaman üretir; VTT → içe aktarma gidiş-dönüşü', () => {
    const cues = [{ id: 'a', start: 0.5, end: 2, text: 'Merhaba' }];
    const vtt = cuesToVtt(cues);
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nMerhaba')).toBe(true);
    expect(parseSubtitles(vtt, id).cues[0]).toMatchObject({ start: 0.5, end: 2, text: 'Merhaba' });
  });
  it('geçerli cue yoksa boş döner; "-->" metni kırılmaz', () => {
    expect(cuesToVtt([{ id: 'x', start: 0, end: 1, text: ' ' }])).toBe('');
    expect(cuesToVtt([{ id: 'x', start: 0, end: 1, text: 'a --> b' }])).not.toMatch(/a --> b/);
  });
});
