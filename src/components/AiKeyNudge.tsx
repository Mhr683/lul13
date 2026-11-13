import React, { useEffect, useState } from 'react';
import { KeyRound, Sparkles, X } from 'lucide-react';
import { auth } from '../lib/firebase';

// Gets sellers to add their own free Gemini key (Seller Center → AI Assistant → My AI keys):
//  - once, a welcome step for a shop without a key ("Later" hides it for 3 days)
//  - every time the store says today's free AI uses are finished (code AI_KEY_NEEDED / aiKeyNeeded)
// Selling, orders and payouts never depend on the key; only the AI extras do.

export const AI_KEY_EVENT = 'anokha:ai-key-needed';
/** Opens the "add your key" window (any part of Seller Center can call it) */
export const askForAiKey = (reason?: string) => {
  try {
    window.dispatchEvent(new CustomEvent(AI_KEY_EVENT, { detail: { reason: reason || '' } }));
  } catch {}
};

const LATER_KEY = 'anokha.aiKeyLater';
const readLater = () => {
  try {
    return Number(localStorage.getItem(LATER_KEY)) || 0;
  } catch {
    return 0;
  }
};

export const AiKeySteps: React.FC = () => (
  <ol className="list-decimal pl-5 space-y-1 text-xs text-[#33322F]">
    <li>
      Open{' '}
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[#0E7A43] font-semibold underline">
        aistudio.google.com/apikey
      </a>{' '}
      and sign in with your Gmail.
    </li>
    <li>
      Press <strong>"Create API key"</strong>, then <strong>"Create API key in new project"</strong>.
    </li>
    <li>Press the copy button next to the new key.</li>
    <li>
      Come back here, paste it in <strong>"My AI keys"</strong> (top of the AI Assistant page) and press <strong>Add</strong>.
    </li>
  </ol>
);

export const AiKeyNudge: React.FC<{ onAddKey: () => void }> = ({ onAddKey }) => {
  const [open, setOpen] = useState<null | { welcome: boolean; reason: string }>(null);
  const [state, setState] = useState<{ hasKey: boolean; freeLeft: number; freePerDay: number } | null>(null);

  // Welcome step: only for shops without a key, at most once every 3 days
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await auth.authStateReady();
        if (!auth.currentUser) return;
        const token = await auth.currentUser.getIdToken();
        const r = await fetch('/api/seller/ai-status', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const s = await r.json();
        if (!alive) return;
        setState(s);
        if (!s.hasKey && Date.now() - readLater() > 3 * 24 * 3600_000) setOpen({ welcome: true, reason: '' });
      } catch {}
    })();
    const onAsk = (e: Event) => {
      setOpen({ welcome: false, reason: String((e as CustomEvent).detail?.reason || '') });
      setState((s) => (s ? { ...s, freeLeft: 0 } : s));
    };
    window.addEventListener(AI_KEY_EVENT, onAsk);
    return () => {
      alive = false;
      window.removeEventListener(AI_KEY_EVENT, onAsk);
    };
  }, []);

  if (!open || state?.hasKey) return null;
  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {}
    setOpen(null);
  };
  const perDay = state?.freePerDay ?? 3;

  return (
    <div className="fixed inset-0 z-[140] bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Add your free AI key">
      <div className="bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-[#141413]">
        <div className="flex items-start gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-[#0E7A43]" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm">{open.welcome ? 'One step: add your free AI key' : "Today's free AI uses are finished"}</div>
            <div className="text-[11px] text-[#575653]">2 minutes · free · no card needed</div>
          </div>
          <button type="button" onClick={later} aria-label="Close" className="p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-[#33322F]">
          {open.welcome
            ? `Your shop gets only ${perDay} AI uses a day from the store. With your own free Google AI key you get 150 a day: AI videos, AI descriptions and the AI Assistant whenever you need them.`
            : open.reason || `Without your own key you get ${perDay} AI uses a day. Add your free key to keep using AI videos, descriptions and the AI Assistant today.`}
        </p>
        <div className="p-3 bg-[#FBFBF9] rounded-xl border border-[#E7E5DF] rounded-lg space-y-2">
          <div className="text-xs font-bold">How to get it</div>
          <AiKeySteps />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
          <Sparkles className="w-4 h-4 shrink-0" /> Shops with their own key get the <strong>"AI Powered Shop ✨"</strong> badge on their shop page.
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            onAddKey();
          }}
          className="w-full py-2.5 bg-[#0E7A43] text-white font-bold text-sm rounded cursor-pointer"
        >
          Add my free key now
        </button>
        <button type="button" onClick={later} className="w-full py-2 text-xs text-[#575653] underline cursor-pointer">
          Later
        </button>
      </div>
    </div>
  );
};
