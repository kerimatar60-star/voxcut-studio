import type { SubtitleCue } from './types';
const pad=(n:number,d=2)=>String(Math.trunc(n)).padStart(d,'0');
export const formatSrtTime=(seconds:number)=>{
  const milliseconds = Math.max(0,Math.round(seconds*1000));
  const ms=milliseconds%1000;
  const total=Math.floor(milliseconds/1000);
  return `${pad(Math.floor(total/3600))}:${pad(Math.floor(total/60)%60)}:${pad(total%60)},${pad(ms,3)}`;
};
export const cuesToSrt = (cues:SubtitleCue[]) => cues
  .filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&c.text.trim())
  .sort((a,b)=>a.start-b.start)
  .map((c,index)=>`${index+1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text.replace(/\r/g,'').trim()}\n`)
  .join('\n');

export const cuesToVtt = (cues:SubtitleCue[]) => {
  const body = cues
    .filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&c.text.trim())
    .sort((a,b)=>a.start-b.start)
    .map(c=>`${formatSrtTime(c.start).replace(',','.')} --> ${formatSrtTime(c.end).replace(',','.')}\n${c.text.replace(/\r/g,'').replace(/-->/g,'->').trim()}\n`)
    .join('\n');
  return body ? `WEBVTT\n\n${body}` : '';
};

const TIME = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;
/** "00:01:02,5" / "01:02.500" biçimlerini saniyeye çevirir; geçersizse null. */
export const parseTimestamp = (raw:string): number|null => {
  const m = TIME.exec(raw.trim());
  if (!m) return null;
  const [, h='0', min, sec, frac] = m;
  if (Number(min) > 59 || Number(sec) > 59) return null;
  return Number(h)*3600 + Number(min)*60 + Number(sec) + Number(frac.padEnd(3,'0'))/1000;
};

const cleanCueText = (lines:string[]) => lines.join('\n')
  .replace(/<[^>]*>/g,'').replace(/\{\\[^}]*\}/g,'')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
  .split('\n').map(l=>l.trim()).filter(Boolean).join('\n').slice(0,2000);

export const MAX_SUBTITLE_IMPORT = 10000;
/** SRT ve WebVTT metnini okur. Geçersiz zaman/boş metinli bloklar `skipped` olarak sayılır; hiç altyazı yoksa hata verir. */
export function parseSubtitles(input:string, makeId:()=>string): { cues: SubtitleCue[]; skipped: number } {
  const text = input.replace(/^﻿/,'').replace(/\r\n?/g,'\n');
  const blocks = text.split(/\n[ \t]*\n+/);
  const cues: SubtitleCue[] = [];
  let skipped = 0;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l,i,a)=>!(l.trim()===''&&(i===0||i===a.length-1)));
    if (!lines.length) continue;
    const first = lines[0].trim();
    if (/^WEBVTT/.test(first) && !first.includes('-->') ) { if (lines.length === 1) continue; }
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(first)) continue;
    const at = lines.findIndex(l=>l.includes('-->'));
    if (at < 0) { if (!/^WEBVTT/.test(first)) skipped++; continue; }
    const [a, rest=''] = lines[at].split('-->');
    const start = parseTimestamp(a), end = parseTimestamp(rest.trim().split(/\s+/)[0] ?? '');
    const body = cleanCueText(lines.slice(at+1));
    if (start===null || end===null || end<=start || !body) { skipped++; continue; }
    if (cues.length >= MAX_SUBTITLE_IMPORT) throw new Error(`En fazla ${MAX_SUBTITLE_IMPORT} altyazı içe aktarılabilir.`);
    cues.push({ id: makeId(), start, end, text: body });
  }
  if (!cues.length) throw new Error('Dosyada geçerli altyazı bulunamadı. SRT veya WebVTT biçimi bekleniyor.');
  return { cues: cues.sort((x,y)=>x.start-y.start), skipped };
}
