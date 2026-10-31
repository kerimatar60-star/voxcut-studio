import { useMemo, useState } from 'react';
import { Check, ListChecks, Play, Undo2 } from 'lucide-react';
import { applyActions, describeAction, MAX_COMMAND_LENGTH, parseCommand, type ActionResult } from '../../../core/editCommands';
import type { ProjectDocument, UpdateProject } from '../../../core/types';

type Entry = { at: number; text: string; results: ActionResult[] };
const EXAMPLES = ['Konuşurken müziği %25\'e indir', '2. sesi %50 yap, başına 1 sn fade koy', 'Altyazıyı 2 sn ileri al', 'Geçişleri çapraz yap 0,5 sn'];

/**
 * Komutla düzenleme: Türkçe cümle → kapalı işlem şeması → önce plan, sonra onay. Terminal/kabuk yoktur, model çağrısı yoktur;
 * uygulanan her işlem normal proje değişikliğidir, bu yüzden üstteki "Geri al" ile geri alınır. Kayıt (denetim) yalnız bu oturumda tutulur.
 */
export function CommandPanel({ project, update, onApplied, onUndo }: { project: ProjectDocument; update: UpdateProject; onApplied: (text: string) => void; onUndo: () => void }) {
  const [text, setText] = useState('');
  const [log, setLog] = useState<Entry[]>([]);
  const parsed = useMemo(() => parseCommand(text), [text]);
  const preview = useMemo(() => applyActions(project, parsed.actions).results, [project, parsed.actions]);
  const applicable = preview.filter(r => r.ok).length;

  function apply() {
    if (!applicable) return;
    const results = applyActions(project, parsed.actions).results;
    update(p => applyActions(p, parsed.actions).project);
    setLog(list => [{ at: Date.now(), text: text.trim(), results }, ...list].slice(0, 20));
    onApplied(`${results.filter(r => r.ok).length} işlem uygulandı${results.some(r => !r.ok) ? `, ${results.filter(r => !r.ok).length} işlem uygulanamadı` : ''}. Geri almak için üstteki Geri al düğmesini kullan.`);
    setText('');
  }

  return (
    <details className="vc-trim-panel" style={{ marginTop: 12 }}>
      <summary className="vc-trim-heading" style={{ cursor: 'pointer' }}><ListChecks size={16} /> Komutla düzenle</summary>
      <p className="vc-trim-hint">Türkçe bir cümle yaz; önce ne yapılacağını gösteririm, sen onaylayınca uygularım. Yalnızca aşağıdaki güvenli işlem türleri vardır (ses seviyesi/kısma/fade, altyazı kaydırma, geçişler); dosya silme veya sistem komutu yoktur.</p>
      <label className="field">Komut
        <textarea rows={2} value={text} maxLength={MAX_COMMAND_LENGTH} placeholder={EXAMPLES[0]} onChange={e => setText(e.target.value)} />
      </label>
      {text.trim() === '' && <p className="vc-trim-hint">Örnekler: {EXAMPLES.map(e => <button key={e} type="button" className="btn btn-dark" style={{ margin: '2px 4px 2px 0' }} onClick={() => setText(e)}>{e}</button>)}</p>}
      {text.trim() !== '' && (
        <div aria-live="polite">
          {parsed.actions.length > 0 && <ol style={{ paddingLeft: 18, margin: '6px 0' }}>{parsed.actions.map((a, i) => <li key={i}>{describeAction(a)}{!preview[i]?.ok && <strong className="vc-trim-error"> — uygulanamaz: {preview[i]?.message}</strong>}</li>)}</ol>}
          {parsed.unknown.length > 0 && <p className="vc-trim-alert" role="status">Anlaşılamadı: {parsed.unknown.map(u => `"${u}"`).join(', ')}</p>}
          {parsed.actions.length === 0 && parsed.unknown.length === 0 && <p className="vc-trim-hint">Boş komut.</p>}
        </div>
      )}
      <button className="btn btn-primary wide" type="button" disabled={applicable === 0} onClick={apply}><Play size={15} /> Onayla ve uygula ({applicable} işlem)</button>
      <button className="btn btn-dark wide" type="button" onClick={onUndo}><Undo2 size={15} /> Geri al</button>
      {log.length > 0 && (
        <div>
          <p className="vc-trim-hint">Bu oturumun işlem kaydı:</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>{log.map(e => <li key={e.at}><Check size={12} /> {new Date(e.at).toLocaleTimeString('tr-TR')} — {e.text} ({e.results.filter(r => r.ok).length}/{e.results.length})</li>)}</ul>
        </div>
      )}
    </details>
  );
}
