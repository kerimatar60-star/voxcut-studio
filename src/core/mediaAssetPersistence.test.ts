import { describe, expect, it } from 'vitest';
import { kindFromPath, MEDIA_EXTENSIONS } from './mediaKinds';
import { exampleProject, parseProject, serializeProject } from './project';
import type { MediaAsset } from './types';

const FP = 'c'.repeat(64);
const NUL = String.fromCharCode(0);
const asset = (extra: Record<string, unknown> = {}): MediaAsset => ({ id: 'a1', name: 'klip.mp4', kind: 'video', mimeType: 'video/mp4', size: 5000, addedAt: 1, ...extra } as MediaAsset);
const withAssets = (assets: unknown[]) => parseProject(JSON.parse(JSON.stringify({ ...exampleProject(), assets })));

describe('kindFromPath', () => {
  it('uzantıdan tür ve mime çıkarır (büyük/küçük harf, Windows ve Unix yolu)', () => {
    expect(kindFromPath('C:\\Videolar\\Klip ğ.MP4')).toEqual({ kind: 'video', mimeType: 'video/mp4' });
    expect(kindFromPath('/home/a/ses.flac')?.kind).toBe('audio');
    expect(kindFromPath('D:\\x\\kapak.JPEG')?.kind).toBe('image');
  });
  it('bilinmeyen, uzantısız ve gizli dosyaları reddeder', () => {
    for (const bad of ['a.exe', 'a.txt', 'uzantisiz', 'C:\\x\\.mp4', 'a.', '', 'C:\\klasor.mp4\\dosya']) expect(kindFromPath(bad)).toBeNull();
  });
  it('MEDIA_EXTENSIONS Rust beyaz listesiyle aynı sayıda (19)', () => expect(MEDIA_EXTENSIONS).toHaveLength(19));
});

describe('MediaAsset yol + parmak izi kalıcılığı', () => {
  it('kaydet → aç gidiş-dönüşünde yol ve parmak izi korunur', () => {
    const a = asset({ path: 'C:\\Videolar\\klip.mp4', fingerprint: FP });
    const back = parseProject(JSON.parse(serializeProject({ ...exampleProject(), assets: [a] })));
    expect(back.assets[0]).toMatchObject({ path: 'C:\\Videolar\\klip.mp4', fingerprint: FP, size: 5000 });
  });
  it('eski proje (yol/parmak izi yok) aynen açılır', () => {
    const a = withAssets([asset()]).assets[0];
    expect('path' in a).toBe(false);
    expect('fingerprint' in a).toBe(false);
  });
  it('bozuk parmak izi ve boyutsuz kayıt sessizce atılır; yol kırpılır ve NUL temizlenir', () => {
    expect(withAssets([asset({ path: 'C:\\a.mp4', fingerprint: 'zz' })]).assets[0].fingerprint).toBeUndefined();
    expect(withAssets([asset({ size: 0, fingerprint: FP })]).assets[0].fingerprint).toBeUndefined();
    const p = withAssets([asset({ path: `C:\\a${NUL}b${'x'.repeat(3000)}.mp4` })]).assets[0].path!;
    expect(p.length).toBe(1024);
    expect(p.includes(NUL)).toBe(false);
    expect('path' in withAssets([asset({ path: 42 })]).assets[0]).toBe(false);
  });
  it('medya baytı/base64 alanları serileştirmeye sızmaz', () => {
    const a = withAssets([asset({ path: 'C:\\a.mp4', data: 'AAAA'.repeat(1000), base64: 'xx', blob: 'yy' })]).assets[0] as Record<string, unknown>;
    expect(a.data).toBeUndefined(); expect(a.base64).toBeUndefined(); expect(a.blob).toBeUndefined();
  });
});
