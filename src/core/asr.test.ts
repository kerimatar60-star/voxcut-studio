import { describe, expect, it } from 'vitest';
import { defaultModel, formatBytes, parseAsrStatus, transcribeBlocker, type AsrStatus } from './asr';

const status = (engine: boolean, installed: string[]): AsrStatus => ({
  engineInstalled: engine, engineSize: 100,
  models: [['tiny', 10], ['base', 20], ['small', 50], ['medium', 150]].map(([id, size]) => ({ id: id as string, label: id as string, size: size as number, installed: installed.includes(id as string) })),
});

describe('asr', () => {
  it('boyutları okunur biçimde yazar', () => {
    expect(formatBytes(1_533_763_059)).toBe('1.4 GB');
    expect(formatBytes(487_601_967)).toBe('465 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
  it('Rust durumunu doğrular, bozuk veriyi reddeder', () => {
    expect(parseAsrStatus({ engineInstalled: true, engineSize: 5, models: [{ id: 'base', label: 'Base', size: 9, installed: false }] })?.models[0].id).toBe('base');
    expect(parseAsrStatus(null)).toBeNull();
    expect(parseAsrStatus({ engineInstalled: 'evet', models: [] })).toBeNull();
    expect(parseAsrStatus({ engineInstalled: true, models: [{ id: 1 }] })).toBeNull();
    expect(parseAsrStatus({ engineInstalled: true, models: [null] })).toBeNull();
  });
  it('çalıştırma engellerini doğru sırayla bildirir', () => {
    expect(transcribeBlocker(null, 'small', true)).toMatch(/okunamadı/);
    expect(transcribeBlocker(status(false, []), 'small', true)).toMatch(/motor/);
    expect(transcribeBlocker(status(true, []), 'small', true)).toMatch(/modeli indir/);
    expect(transcribeBlocker(status(true, ['small']), 'small', false)).toMatch(/dosyası seç/);
    expect(transcribeBlocker(status(true, ['small']), 'small', true)).toBeNull();
  });
  it('varsayılan modeli seçer', () => {
    expect(defaultModel(null)).toBe('small');
    expect(defaultModel(status(true, []))).toBe('small');
    expect(defaultModel(status(true, ['tiny', 'small']))).toBe('small');
    expect(defaultModel(status(true, ['tiny', 'base']))).toBe('base');
  });
});
