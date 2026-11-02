import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyRound, LoaderCircle, X } from 'lucide-react';
import { pickDefaultModel } from '../../../core/aiSettings';
import type { AiStatus } from '../../../core/aiSettings';

type Props = { status: AiStatus | null; onClose: () => void; onChanged: () => void };

/** OpenAI (ChatGPT) bağlantısı ayarları: anahtar + açık onay + model. Anahtar yalnızca bu bilgisayarda şifreli saklanır. */
export function AiSettings({ status, onClose, onChanged }: Props) {
  const [key, setKey] = useState('');
  const [consent, setConsent] = useState(!!status?.consent);
  const [models, setModels] = useState<string[]>(status?.model ? [status.model] : []);
  const [model, setModel] = useState(status?.model ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const say = (text: string, error = false) => { setMessage(text); setIsError(error); };
  const fail = (e: unknown) => say(e instanceof Error ? e.message : String(e), true);

  async function saveAndTest() {
    say('');
    if (!key.trim() && !status?.hasKey) { say('Önce API anahtarını yapıştır.', true); return; }
    if (!consent) { say('Devam etmek için onay kutusunu işaretle.', true); return; }
    setBusy(true);
    try {
      await invoke('ai_save', { key: key.trim() || null, consent, model });
      const list = await invoke<string[]>('ai_models');
      setModels(list);
      const chosen = list.includes(model) ? model : pickDefaultModel(list);
      setModel(chosen);
      await invoke('ai_save', { key: null, consent, model: chosen });
      setKey('');
      onChanged();
      say(`Bağlantı kuruldu. ${list.length} model bulundu; "${chosen}" seçildi.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function saveModel(next: string) {
    setModel(next);
    try { await invoke('ai_save', { key: null, consent, model: next }); onChanged(); } catch (e) { fail(e); }
  }

  async function clearKey() {
    setBusy(true);
    try { await invoke('ai_clear'); setKey(''); setConsent(false); setModels([]); setModel(''); onChanged(); say('Anahtar bu bilgisayardan silindi.'); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return <div className="vc-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="vc-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
      <div className="vc-modal-head"><h2 id="ai-settings-title"><KeyRound size={18} /> Yapay zekâ bağlantısı (ChatGPT)</h2><button className="btn btn-dark" type="button" aria-label="Kapat" onClick={onClose}><X size={16} /></button></div>
      <ol className="vc-modal-steps">
        <li>OpenAI'nin geliştirici sitesine (platform.openai.com) gir veya hesap aç. <b>ChatGPT abonelik girişi yetmez</b>; geliştirici hesabı ayrıdır.</li>
        <li>Sitede <b>API keys</b> bölümünden <b>Create new secret key</b> ile bir anahtar oluştur, kopyala. Anahtarı kimseyle paylaşma.</li>
        <li>Sitede <b>Billing</b> bölümünden kredi yükle. Her tasarım isteği hesabından küçük bir ücret keser; tutarı OpenAI'nin fiyat sayfasından kontrol et.</li>
        <li>Anahtarı aşağıya yapıştır.</li>
      </ol>
      <label className="field">API anahtarı {status?.hasKey && <span className="muted-line">(kayıtlı: {status.hint}; değiştirmek için yenisini yapıştır)</span>}
        <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={key} onChange={e => setKey(e.target.value)} />
      </label>
      <label className="vc-modal-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>Yazdığım tasarım isteklerinin <b>internet üzerinden OpenAI'ye gönderileceğini</b> anlıyorum. Dosyalarım ve videolarım gönderilmez.</span></label>
      <div className="vc-modal-row">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void saveAndTest()}>{busy ? <><LoaderCircle size={15} className="spin" /> Deneniyor…</> : 'Kaydet ve bağlantıyı dene'}</button>
        {status?.hasKey && <button className="btn btn-dark" type="button" disabled={busy} onClick={() => void clearKey()}>Anahtarı sil</button>}
      </div>
      {models.length > 0 && <label className="field">Kullanılacak model
        <select value={model} onChange={e => void saveModel(e.target.value)}>{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
        <span className="muted-line">Küçük (mini) modeller daha ucuz ve hızlıdır.</span>
      </label>}
      {message && <p className={isError ? 'vc-trim-alert' : 'vc-trim-ok'} role={isError ? 'alert' : 'status'}>{message}</p>}
    </div>
  </div>;
}
