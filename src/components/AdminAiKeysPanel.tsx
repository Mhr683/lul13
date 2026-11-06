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

export const AdminAiKeysPanel: React.FC<{
  /** '/api/admin/ai-keys' (store keys) or '/api/seller/ai-keys' (a seller's own keys) */
  apiBase?: string;
  forSeller?: boolean;
}> = ({ apiBase = '/api/admin/ai-keys', forSeller = false }) => {
  const [data, setData] = useState<{ fromEnv: number; keys: KeyRow[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api(apiBase).then(setData, (e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<any>(apiBase, { method: 'POST', body: JSON.stringify({ key: draft.trim() }) });
      setData(r);
      setDraft('');
      setMsg({ ok: true, text: r.note || 'Key added.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  // Which keys share one Google project (and so one free limit)
  const [projects, setProjects] = useState<{ projects: number; keys: number; groups: Array<Array<{ key: string; saved: boolean }>> } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkProjects = async () => {
    setChecking(true);
    setMsg(null);
    try {
      setProjects(await api(`${apiBase}/check-projects`, { method: 'POST' }));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setChecking(false);
    }
  };

  const remove = async (k: KeyRow) => {
    if (!window.confirm(`Remove the AI key ${k.key}?`)) return;
    try {
      setData(await api(`${apiBase}/remove`, { method: 'POST', body: JSON.stringify({ key: k.key }) }));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  };

  return (
    <div className="border border-black/15 p-4 space-y-3 text-xs text-[#141413]">
      <div className="font-bold text-sm inline-flex items-center gap-2">
        <Sparkles className="w-4 h-4" /> {forSeller ? 'My AI keys (Gemini) — your own free AI' : 'AI keys (Gemini) — backup keys keep the AI working'}{' '}
        <HelpDot id={forSeller ? 'seller.aiKeys' : 'admin.aiKeys'} />
      </div>
      {forSeller && (
        <p className="p-2.5 bg-violet-50 border border-violet-200 text-violet-950">
          Your AI Assistant, "Write with AI" descriptions and Shop Coach use <strong>your own</strong> free Gemini key first, so your AI
          never waits for others. Without a key (or when your keys' daily limit is used) the store's shared AI is used, which can be
          busy. Your key is used only for your shop and is never shown to anyone.
        </p>
      )}
      <p className="text-[#575653]">
        Every free key has a daily limit. Add several keys: when one key's limit is used up, the
        next key is used by itself. The free limit belongs to each Google Cloud <strong>project</strong>, so create every key with "Create API key in new project" (one Gmail can have about 10 projects).
      </p>
      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white text-sm font-bold shadow"
      >
        <Sparkles className="w-4 h-4" /> Create Gemini API key (opens Google AI Studio)
      </a>
      <ol className="list-decimal pl-5 text-[#575653] space-y-0.5">
        <li>Press the button above and sign in with a Gmail (to switch Gmail, use your picture at the top right of that page).</li>
        <li>
          Press "Create API key" (choose "Create API key in new project" if asked). Then press the <strong>copy</strong> button next to the
          new key. Do not copy the shortened key shown in the list.
        </li>
        <li>
          Paste it below and press Add. You can paste many keys at once, one per line.{' '}
          {forSeller ? 'Up to 20 keys.' : 'There is no limit on the number of keys.'}
        </li>
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
              {k.saved ? (
                <button
                  type="button"
                  onClick={() => remove(k)}
                  className="ml-auto px-2.5 py-1 rounded border border-rose-400 bg-rose-50 text-rose-800 font-semibold inline-flex items-center gap-1 cursor-pointer hover:bg-rose-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              ) : (
                <span className="ml-auto text-[#575653]" title="This key is in the server settings file (.env), not added here">server key</span>
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
      {data && data.keys.length > 1 && (
        <div className="space-y-2 pt-2 border-t border-black/10">
          <button
            type="button"
            disabled={checking}
            onClick={checkProjects}
            className="px-3 py-1.5 border border-violet-400 text-violet-900 font-semibold cursor-pointer disabled:opacity-50"
          >
            {checking ? 'Checking projects...' : 'Check projects (find keys that share one limit)'}
          </button>
          {projects && (
            <div className="space-y-1">
              <p className="font-semibold">
                {projects.keys} key(s) in {projects.projects} separate Google project(s) = {projects.projects} separate daily limit(s).
              </p>
              {projects.groups.map((g, i) => (
                <div
                  key={i}
                  className={`px-2 py-1.5 border ${g.length > 1 ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950'}`}
                >
                  <div>
                    Project {i + 1}: {g.map((k) => k.key).join(', ')}
                    {g.length > 1 && <span> — these {g.length} keys share ONE limit; keep one and remove the others.</span>}
                  </div>
                  {g.length > 1 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {/* The first key of the project is kept; the others can be removed here */}
                      {g.slice(1).filter((k) => k.saved).map((k) => (
                        <button
                          key={k.key}
                          type="button"
                          onClick={async () => {
                            await remove({ key: k.key } as KeyRow);
                            setProjects((p) => (p ? { ...p, keys: p.keys - 1, groups: p.groups.map((x) => x.filter((y) => y.key !== k.key)) } : p));
                          }}
                          className="px-2.5 py-1 rounded border border-rose-400 bg-white text-rose-800 font-semibold inline-flex items-center gap-1 cursor-pointer hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove {k.key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
