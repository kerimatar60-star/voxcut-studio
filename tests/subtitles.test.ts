import {describe,it,expect} from 'vitest';
import {formatSrtTime,cuesToSrt} from '../src/core/subtitles';
describe('SRT üretimi',()=>{
  it('milisaniyeleri doğru yuvarlar',()=>expect(formatSrtTime(61.2346)).toBe('00:01:01,235'));
  it('kayıtları sıraya koyar',()=>{
    const result=cuesToSrt([{id:'b',start:4,end:5,text:'İkinci'},{id:'a',start:1,end:2,text:'Birinci'}]);
    expect(result.indexOf('Birinci')).toBeLessThan(result.indexOf('İkinci'));
  });
  it('boş metni dışarıda bırakır',()=>expect(cuesToSrt([{id:'x',start:0,end:1,text:' '}])).toBe(''));
});
