import React, { useEffect, useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { courierApi as api } from '../services/courierClient';
import { HelpDot } from './HelpDot';

// Admin → Settings → AI keys. Each free Gemini key (from a different Gmail / Google account) has its
// own daily limit; when one is used up the next is used by itself (server/aiFallback.ts), so the
// AI keeps working. Keys are tested before they are saved and never shown again in full.

interface KeyRow {
  key: string;
  index: number;
  saved: boolean;
  resting: boolean;
  restingUntil: string | null;
  lastOkAt: string | null;
  lastError: string;
}

export const AdminAiKeysPanel: React.FC = () => {
  const [data, setData] = useState<{ fromEnv: number; keys: KeyRow[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api('/api/admin/ai-keys').then(setData, (e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<any>('/api/admin/ai-keys', { method: 'POST', body: JSON.stringify({ key: draft.trim() }) });
      setData(r);
      setDraft('');
      setMsg({ ok: true, text: r.note || 'Key added.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (k: KeyRow) => {
    if (!window.confirm(`Remove the AI key ${k.key}?`)) return;
    try {
      setData(await api('/api/admin/ai-keys/remove', { method: 'POST', body: JSON.stringify({ key: k.key }) }));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  };

  return (
    <div className="border border-black/15 p-4 space-y-3 text-xs text-[#141413]">
      <div className="font-bold text-sm inline-flex items-center gap-2">
        <Sparkles className="w-4 h-4" /> AI keys (Gemini) — backup keys keep the AI working <HelpDot id="admin.aiKeys" />
      </div>
      <p className="text-[#575653]">
        Every free key has a daily limit. Add one key from <strong>each</strong> of your Gmail accounts: when one key's limit is used up, the
        next key is used by itself. (Keys from the same Gmail share one limit, so use different Gmails.)
      </p>
      <ol className="list-decimal pl-5 text-[#575653] space-y-0.5">
        <li>Open aistudio.google.com/apikey and sign in with a Gmail.</li>
        <li>Press "Create API key" (choose "Create in new project" if asked), then copy the key (starts with AIza...).</li>
        <li>Paste it below and press Add. You can paste many keys at once, one per line. There is no limit on the number of keys.</li>
      </ol>
      {data && (
        <div className="space-y-1">
          <div className="font-semibold">
            {data.keys.length} key(s) working together{data.fromEnv ? ` (${data.fromEnv} from the server settings)` : ''}
          </div>
          {data.keys.map((k) => (
            <div key={k.index} className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-[#F7F6F2] border border-black/10">
              <span className="font-mono">
                {k.index + 1}. {k.key}
              </span>
              {k.resting ? (
                <span className="px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900">limit used — resting</span>
              ) : (
                <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-900">ready</span>
              )}
              {k.lastOkAt && <span className="text-[#575653]">last used {new Date(k.lastOkAt).toLocaleString('en-PK')}</span>}
              {k.saved && (
                <button type="button" onClick={() => remove(k)} className="ml-auto text-rose-700 inline-flex items-center gap-1 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'Paste one or more Gemini API keys (AIza...), one per line'}
          autoComplete="off"
          spellCheck={false}
          rows={3}
          className="flex-1 min-w-[220px] px-2 py-1.5 border border-black/20 font-mono"
          style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
        />
        <button
          type="button"
          disabled={busy || draft.trim().length < 30}
          onClick={add}
          className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer disabled:opacity-50"
        >
          {busy ? 'Testing keys...' : 'Add key(s)'}
        </button>
      </div>
      {msg && <p className={msg.ok ? 'text-emerald-800' : 'text-rose-700'}>{msg.text}</p>}
    </div>
  );
};
