import { describe, expect, it } from 'vitest';
import { friendlyError } from './stems';

describe('friendlyError', () => {
  it('404 hatasını anlaşılır bir cümleye çevirir', () => {
    expect(friendlyError('İndirme başarısız: curl: (22) The requested URL returned error: 404')).toContain('henüz yayımlanmamış');
  });
  it('ağ hatasında bağlantıyı kontrol etmeyi söyler ve özgün metni korur', () => {
    const t = friendlyError('curl: (6) Could not resolve host: github.com');
    expect(t).toContain('İnternet bağlantını');
    expect(t).toContain('Could not resolve host');
  });
  it('diğer hataları olduğu gibi bırakır, çok uzunsa kısaltır', () => {
    expect(friendlyError('Ses çözülemedi.')).toBe('Ses çözülemedi.');
    const long = friendlyError('x'.repeat(900));
    expect(long.length).toBeLessThanOrEqual(401);
    expect(long.endsWith('…')).toBe(true);
  });
  it('404 sayısı başka bir sayının parçasıysa tetiklenmez', () => {
    expect(friendlyError('hata kodu 14040')).toBe('hata kodu 14040');
  });
});
