import { describe, expect, it } from 'vitest';
import { emptyAudioMix } from './audioMixModel';
import { buildManifest, fromPortableProject, isAbsolutePath, mapProjectPaths, projectMediaPaths, resolvePortablePath, toPortablePath, toPortableProject } from './packagePaths';
import { exampleProject, parseProject, serializeProject } from './project';
import type { ProjectDocument } from './types';

const DIR = 'D:\\Projeler\\Klip ğ.voxcut';
const FP = 'd'.repeat(64);

function sample(): ProjectDocument {
  const base = exampleProject();
  return {
    ...base,
    assets: [
      { id: 'a1', name: 'ic.mp4', kind: 'video', mimeType: 'video/mp4', size: 10, addedAt: 1, path: `${DIR}\\media\\ic.mp4`, fingerprint: FP },
      { id: 'a2', name: 'dis.wav', kind: 'audio', mimeType: 'audio/wav', size: 20, addedAt: 2, path: 'E:\\Muzik\\dis.wav' },
      { id: 'a3', name: 'oturum.png', kind: 'image', mimeType: 'image/png', size: 5, addedAt: 3 },
    ],
    audioMix: { ...emptyAudioMix(), videoPath: `${DIR}\\media\\alt\\v.mp4`, videoDuration: 5, videoSize: 99, videoFingerprint: FP,
      tracks: [{ id: 't1', path: 'E:\\Muzik\\fon.mp3', gain: 1, pan: 0, start: 0, sourceIn: 0, length: 1, fadeIn: 0, fadeOut: 0, mute: false, solo: false, sourceDuration: 2 }] },
  };
}

describe('yol dönüşümü', () => {
  it('mutlak yolları tanır', () => {
    for (const p of ['C:\\a', 'c:/a', '\\\\sunucu\\paylasim\\a', '/home/a']) expect(isAbsolutePath(p)).toBe(true);
    for (const p of ['media/a.mp4', 'a.mp4', '..\\a']) expect(isAbsolutePath(p)).toBe(false);
  });

  it('paket içindeki yol göreli olur (harf büyüklüğüne duyarsız), dışarıdaki aynen kalır', () => {
    expect(toPortablePath(`${DIR}\\media\\ic.mp4`, DIR)).toBe('media/ic.mp4');
    expect(toPortablePath(`${DIR.toUpperCase()}\\MEDIA\\X.MP4`, DIR)).toBe('MEDIA/X.MP4');
    expect(toPortablePath(`${DIR}\\`, DIR)).toBe(`${DIR}\\`);
    expect(toPortablePath('E:\\Muzik\\dis.wav', DIR)).toBe('E:\\Muzik\\dis.wav');
    expect(toPortablePath(`${DIR}Kardes\\a.mp4`, DIR)).toBe(`${DIR}Kardes\\a.mp4`);
    expect(toPortablePath('media/zaten.mp4', DIR)).toBe('media/zaten.mp4');
  });

  it('göreli yol paket klasörüne göre çözülür; farklı sürücü/klasöre taşınınca da çalışır', () => {
    expect(resolvePortablePath('media/ic.mp4', DIR)).toBe(`${DIR}\\media\\ic.mp4`);
    expect(resolvePortablePath('media/ic.mp4', 'F:\\Yedek\\Baska.voxcut')).toBe('F:\\Yedek\\Baska.voxcut\\media\\ic.mp4');
    expect(resolvePortablePath('x/y.mp4', '/home/a/p.voxcut')).toBe('/home/a/p.voxcut/x/y.mp4');
    expect(resolvePortablePath('E:\\Muzik\\dis.wav', DIR)).toBe('E:\\Muzik\\dis.wav');
  });

  it('paket dışına çıkan veya tehlikeli göreli yolları çözmez (göreli kalır)', () => {
    for (const bad of ['../gizli.mp4', 'media/../../gizli.mp4', './a.mp4', 'media//a.mp4', 'C:gizli.mp4', 'media/C:/a.mp4', '']) {
      expect(resolvePortablePath(bad, DIR)).toBe(bad);
    }
  });
});

describe('proje taşınabilirliği', () => {
  it('kaydederken içerdeki medya göreli olur, ses miksi dahil; dışarıdakiler ve yolsuz kayıtlar bozulmaz', () => {
    const stored = toPortableProject(sample(), DIR);
    expect(stored.assets[0].path).toBe('media/ic.mp4');
    expect(stored.assets[1].path).toBe('E:\\Muzik\\dis.wav');
    expect('path' in stored.assets[2]).toBe(false);
    expect(stored.audioMix?.videoPath).toBe('media/alt/v.mp4');
    expect(stored.audioMix?.tracks[0].path).toBe('E:\\Muzik\\fon.mp3');
  });

  it('kaydet → başka yerde aç gidiş-dönüşü: yollar yeni klasöre göre çözülür, parmak izleri korunur', () => {
    const text = serializeProject(toPortableProject(sample(), DIR));
    const reopened = fromPortableProject(parseProject(JSON.parse(text)), 'G:\\Tasindi\\Yeni.voxcut');
    expect(reopened.assets[0].path).toBe('G:\\Tasindi\\Yeni.voxcut\\media\\ic.mp4');
    expect(reopened.assets[0].fingerprint).toBe(FP);
    expect(reopened.assets[1].path).toBe('E:\\Muzik\\dis.wav');
    expect(reopened.audioMix?.videoPath).toBe('G:\\Tasindi\\Yeni.voxcut\\media\\alt\\v.mp4');
    expect(reopened.audioMix?.videoFingerprint).toBe(FP);
  });

  it('dönüşümler girdi nesnesini değiştirmez', () => {
    const doc = sample();
    const before = JSON.stringify(doc);
    toPortableProject(doc, DIR); fromPortableProject(doc, DIR);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('ses miksi olmayan projede de çalışır', () => {
    const { audioMix: _drop, ...rest } = sample();
    expect(toPortableProject(rest as ProjectDocument, DIR).assets[0].path).toBe('media/ic.mp4');
  });
});

describe('pakete kopyalama yardımcıları', () => {
  it('projectMediaPaths kütüphane ve ses miksi yollarını toplar; yolsuz kayıtları atlar', () => {
    expect(projectMediaPaths(sample())).toEqual([`${DIR}\\media\\ic.mp4`, 'E:\\Muzik\\dis.wav', `${DIR}\\media\\alt\\v.mp4`, 'E:\\Muzik\\fon.mp3']);
    expect(projectMediaPaths({ ...exampleProject(), assets: [] })).toEqual([]);
  });

  it('kopyalama eşlemesi uygulanınca dışarıdaki dosyalar pakete taşınmış sayılır ve kaydedilirken göreli olur', () => {
    const map = new Map([['E:\\Muzik\\dis.wav', `${DIR}\\media\\dis.wav`], ['E:\\Muzik\\fon.mp3', `${DIR}\\media\\fon.mp3`]]);
    const moved = mapProjectPaths(sample(), p => map.get(p) ?? p);
    const stored = toPortableProject(moved, DIR);
    expect(stored.assets.map(a => a.path)).toEqual(['media/ic.mp4', 'media/dis.wav', undefined]);
    expect(stored.audioMix?.tracks[0].path).toBe('media/fon.mp3');
    expect(buildManifest(stored, 1).media.every(m => m.portable)).toBe(true);
  });
});

describe('manifest', () => {
  it('medya özeti: rol, taşınabilirlik ve parmak izi', () => {
    const m = buildManifest(toPortableProject(sample(), DIR), 123);
    expect(m).toMatchObject({ format: 'voxcut-package', formatVersion: 1, projectFile: 'project.json', savedAt: 123 });
    expect(m.media.map(x => [x.role, x.portable])).toEqual([['asset', true], ['asset', false], ['mix-video', true], ['mix-track', false]]);
    expect(m.media[0]).toMatchObject({ name: 'ic.mp4', path: 'media/ic.mp4', fingerprint: FP, size: 10 });
    expect(m.media[2].fingerprint).toBe(FP);
  });
  it('medya yoksa boş liste', () => {
    expect(buildManifest({ ...exampleProject(), assets: [] }, 1).media).toEqual([]);
  });
});

describe('zaman çizelgesi klipleri paket yollarına dahil', () => {
  const withTimeline = (): ProjectDocument => ({
    ...exampleProject(),
    timeline: { width: 1280, height: 720, fps: 30, clips: [
      { id: 'c1', path: `${DIR}\\media\\k1.mp4`, in: 0, out: 2, sourceDuration: 5, size: 7, fingerprint: FP },
      { id: 'c2', path: 'E:\\Klipler\\k2.mp4', in: 1, out: 3, sourceDuration: 4 },
    ] },
  });
  it('projectMediaPaths, göreli/mutlak dönüşüm ve manifest klipleri kapsar', () => {
    expect(projectMediaPaths(withTimeline())).toEqual([`${DIR}\\media\\k1.mp4`, 'E:\\Klipler\\k2.mp4']);
    const stored = toPortableProject(withTimeline(), DIR);
    expect(stored.timeline?.clips.map(c => c.path)).toEqual(['media/k1.mp4', 'E:\\Klipler\\k2.mp4']);
    const back = fromPortableProject(parseProject(JSON.parse(serializeProject(stored))), 'G:\\Yeni.voxcut');
    expect(back.timeline?.clips[0]).toMatchObject({ path: 'G:\\Yeni.voxcut\\media\\k1.mp4', in: 0, out: 2, fingerprint: FP });
    const manifest = buildManifest(stored, 1);
    expect(manifest.media.map(m => [m.role, m.portable])).toEqual([['timeline-clip', true], ['timeline-clip', false]]);
  });
  it('eski proje (çizelge yok) etkilenmez', () => {
    const doc = { ...exampleProject(), assets: [] };
    expect('timeline' in toPortableProject(doc, DIR)).toBe(false);
    expect(parseProject(JSON.parse(serializeProject(doc))).timeline).toBeUndefined();
  });
});
