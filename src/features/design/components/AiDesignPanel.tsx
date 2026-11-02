import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { LoaderCircle, Settings2, Sparkles, Wand2 } from 'lucide-react';
import { AI_DESIGN_SCHEMA, AI_MAX_PROMPT, editDesignMessages, newDesignMessages, normalizeAiDesigns } from '../../../core/aiDesign';
import type { AiMessage } from '../../../core/aiDesign';
import { aiReady } from '../../../core/aiSettings';
import type { AiStatus } from '../../../core/aiSettings';
import { DESIGN_PRESETS } from '../../../core/designCanvas';
import { renderDesign } from '../../../core/designExport';
import type { ProjectDocument } from '../../../core/types';
import { AiSettings } from './AiSettings';

type Design = ProjectDocument['design'];
type Props = { project: ProjectDocument; onApply: (design: Design) => void; setNotice: (text: string) => void };

const EXAMPLES = ['Mor tonlarda teknoloji kanalı YouTube kapağı. Başlık: Yeni telefonu inceledim', 'Turuncu indirim afişi: %50 büyük indirim, ikinci satırda "Bu hafta sonu"', 'Minimal profil resmi, koyu zemin, ortada büyük K harfi'];

/** Küçük önizleme: tasarım gerçek çizim hattıyla (dışa aktarmayla aynı) çizilip resme çevrilir. */
function thumbnail(project: ProjectDocument, design: Design): string {
  try { return renderDesign({ ...project, design }, Math.min(1, 240 / design.width)).toDataURL('image/png'); } catch { return ''; }
}

/** "Yazıyla tasarla": ChatGPT'ye yazıyla tasarım yaptırır; sonuç tuvalde gösterilir, yazıyla düzeltilir, PNG/JPEG/WebP olarak kaydedilir. */
export function AiDesignPanel({ project, onApply, setNotice }: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sizeId, setSizeId] = useState('auto');
  const [count, setCount] = useState(3);
  const [edit, setEdit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<Design[]>([]);
  const [chosen, setChosen] = useState(-1);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try { setStatus(await invoke<AiStatus>('ai_status')); } catch { setStatus(null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const size = DESIGN_PRESETS.find(p => p.id === sizeId);
  const ready = aiReady(status);
  const thumbs = useMemo(() => options.map(d => thumbnail(project, d)), [options, project]);

  async function ask(messages: AiMessage[], n: number, fallback?: { width: number; height: number }): Promise<Design[]> {
    const texts = await invoke<string[]>('ai_chat', { messages: JSON.stringify(messages), schema: JSON.stringify(AI_DESIGN_SCHEMA), n });
    return normalizeAiDesigns(texts, fallback);
  }

  async function generate() {
    if (!prompt.trim()) { setError('Önce ne tasarlamak istediğini yaz.'); return; }
    setError(''); setBusy(true);
    try {
      const fallback = size ? { width: size.width, height: size.height } : undefined;
      const designs = await ask(newDesignMessages(prompt, fallback), count, fallback);
      setOptions(designs); setChosen(0); onApply(designs[0]);
      setNotice(`${designs.length} öneri hazır. Beğenmezsen aşağıdan başkasını seç veya yazıyla değiştir.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function refine() {
    if (!edit.trim()) { setError('Ne değiştirmek istediğini yaz.'); return; }
    setError(''); setBusy(true);
    try {
      const [design] = await ask(editDesignMessages(project.design, edit), 1, { width: project.design.width, height: project.design.height });
      onApply(design); setOptions([]); setChosen(-1); setEdit('');
      setNotice('Değişiklik uygulandı. Beğenmezsen üstteki Geri al ile önceki hâline dönebilirsin.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!isTauri()) return <div className="vc-trim-hint" style={{ padding: 12 }}><h3><Sparkles size={15} /> Yazıyla tasarla</h3><p className="vc-trim-alert">Bu özellik yalnızca kurulu VoxCut Studio uygulamasında çalışır.</p></div>;

  return <div className="ai-design" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', flex: 1, minHeight: 0, paddingBottom: 84 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h3 style={{ margin: 0, flex: 1 }}><Sparkles size={15} /> Yazıyla tasarla</h3>
      <button className="btn btn-dark" type="button" aria-label="Yapay zekâ ayarları" title="Yapay zekâ ayarları" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></button></div>
    {!ready && <div className="vc-trim-hint"><p><b>Yapay zekâ bağlantısı kurulmadı.</b> ChatGPT ile tasarım yaptırmak için kendi OpenAI anahtarını bir kez kaydetmen gerekir.</p>
      <button className="btn btn-primary wide" type="button" onClick={() => setSettingsOpen(true)}>Bağlantıyı kur</button></div>}
    <label className="field">Ne tasarlayalım?
      <textarea rows={5} maxLength={AI_MAX_PROMPT} value={prompt} placeholder="Örn: Mor tonlarda teknoloji kanalım için YouTube kapağı. Başlık: Yeni telefonu inceledim" onChange={e => setPrompt(e.target.value)} disabled={busy} />
    </label>
    <div>{EXAMPLES.map(x => <button key={x} type="button" className="chip" style={{ margin: '0 4px 4px 0', cursor: 'pointer' }} onClick={() => setPrompt(x)}>{x.split('.')[0].slice(0, 28)}…</button>)}</div>
    <label className="field">Boyut
      <select value={sizeId} onChange={e => setSizeId(e.target.value)} disabled={busy}><option value="auto">Otomatik (yazıdan anla)</option>{DESIGN_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
    </label>
    <label className="field">Öneri sayısı
      <select value={count} onChange={e => setCount(Number(e.target.value))} disabled={busy}><option value={1}>1 (daha ucuz)</option><option value={3}>3 öneri</option></select>
    </label>
    <button className="btn btn-primary wide" type="button" disabled={busy || !ready} onClick={() => void generate()}>{busy ? <><LoaderCircle size={15} className="spin" /> Hazırlanıyor…</> : <><Wand2 size={15} /> Tasarla</>}</button>
    <div className="muted-line">Her istek OpenAI hesabından küçük bir ücret keser; yazdıkların internet üzerinden gönderilir.</div>
    {error && <p className="vc-trim-alert" role="alert">{error}</p>}
    {options.length > 1 && <div aria-label="Öneriler"><div className="muted-line" style={{ marginBottom: 4 }}>Öneriler</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
        {options.map((d, i) => <button key={i} type="button" aria-label={`Öneri ${i + 1}`} aria-pressed={chosen === i} onClick={() => { setChosen(i); onApply(d); }} style={{ padding: 2, borderRadius: 8, border: chosen === i ? '2px solid var(--accent)' : '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer' }}>
          {thumbs[i] ? <img src={thumbs[i]} alt="" style={{ width: '100%', display: 'block', borderRadius: 6 }} /> : `Öneri ${i + 1}`}</button>)}
      </div></div>}
    <label className="field">Yazıyla değiştir
      <input type="text" maxLength={AI_MAX_PROMPT} value={edit} placeholder="Örn: başlığı büyüt, rengi maviye çevir" onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ready && !busy) void refine(); }} disabled={busy} />
    </label>
    <button className="btn btn-dark wide" type="button" disabled={busy || !ready} onClick={() => void refine()}>Değişikliği uygula</button>
    {settingsOpen && <AiSettings status={status} onClose={() => setSettingsOpen(false)} onChanged={() => void refresh()} />}
  </div>;
}
