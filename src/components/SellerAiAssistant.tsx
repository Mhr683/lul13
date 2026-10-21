import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Check, X, Sparkles } from 'lucide-react';

// Seller Center → AI Assistant: the seller's own AI command center. It only works on this
// seller's shop (the server enforces it; see server/sellerAi.ts). Changes appear as cards with an
// "Apply" button and are made only after the seller confirms.

type Action = { actionId: string; title: string; total: number; changes: Record<string, any>[]; state?: 'applied' | 'cancelled' | 'busy'; result?: string };
type Message = { role: 'user' | 'model'; text: string; actions?: Action[] };

const SUGGESTIONS = [
  'Which orders do I need to ship today?',
  'Show my products with low stock',
  'Give me my sales report for the last 30 days',
  'Put a 10% sale on all products in one category',
  'Rewrite the description of my best-selling product',
  'Suggest a price with 30% margin for my newest product',
];

const STORAGE_KEY = 'seller_ai_chat_v1';

export const SellerAiAssistant: React.FC<{
  shopName: string;
  call: <T = any>(path: string, init?: RequestInit) => Promise<T>;
  onChanged: () => void;
}> = ({ shopName, call, onChanged }) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: prompt }]);
    setInput('');
    setBusy(true);
    try {
      const d = await call<{ text: string; actions: Action[] }>('/api/seller/ai/command', {
        method: 'POST',
        body: JSON.stringify({ prompt, history }),
      });
      setMessages((m) => [...m, { role: 'model', text: d.text, actions: d.actions || [] }]);
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'model', text: `⚠️ ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const updateAction = (actionId: string, patch: Partial<Action>) =>
    setMessages((ms) => ms.map((m) => ({ ...m, actions: m.actions?.map((a) => (a.actionId === actionId ? { ...a, ...patch } : a)) })));

  const apply = async (a: Action) => {
    updateAction(a.actionId, { state: 'busy' });
    try {
      const r = await call<{ updated: number; skipped: { name?: string; reason: string }[] }>('/api/seller/ai/apply', {
        method: 'POST',
        body: JSON.stringify({ actionId: a.actionId }),
      });
      const skipped = r.skipped?.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).map((s) => `${s.name || ''} (${s.reason})`).join('; ')}` : '';
      updateAction(a.actionId, { state: 'applied', result: `✓ ${r.updated} product(s) updated.${skipped}` });
      onChanged();
    } catch (err: any) {
      updateAction(a.actionId, { state: undefined, result: `⚠️ ${err.message}` });
    }
  };

  return (
    <div className="bg-white border border-black/10 flex flex-col h-[70vh] min-h-[420px]">
      <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#0E7A43]" />
          <div>
            <div className="text-sm font-bold">AI Assistant · {shopName}</div>
            <div className="text-[10px] text-[#575653]">Works only on your own shop. Changes need your “Apply”.</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="text-[11px] text-[#575653] underline cursor-pointer">
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#575653]">
              Ask in English, Urdu or Roman Urdu. For example “sab products ki price 100 rupay barha do” or “aaj kaun se orders ship karne hain?”.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="px-3 py-1.5 border border-black/15 rounded-full text-xs hover:border-[#0E7A43] flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-[#0E7A43]" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] space-y-2 ${m.role === 'user' ? 'bg-[#141413] text-white' : 'bg-[#F4F3EF] text-[#141413]'} px-3 py-2 rounded-lg`}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.actions?.map((a) => (
                <div key={a.actionId} className="bg-white text-[#141413] border border-black/15 rounded p-2.5 space-y-2 text-xs">
                  <div className="font-bold">{a.title}</div>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {a.changes.map((c, k) => (
                      <li key={k} className="text-[#454441]">
                        <strong>{c.name}</strong>
                        {c.price ? ` · price ${c.price}` : ''}
                        {c.stock ? ` · stock ${c.stock}` : ''}
                        {c.status ? ` · ${c.status}` : ''}
                        {c.shortDescription ? ` — ${c.shortDescription}` : ''}
                      </li>
                    ))}
                    {a.total > a.changes.length && <li className="text-[#575653]">…and {a.total - a.changes.length} more</li>}
                  </ul>
                  {a.result && <p className={a.state === 'applied' ? 'text-emerald-700 font-semibold' : 'text-rose-700'}>{a.result}</p>}
                  {a.state !== 'applied' && a.state !== 'cancelled' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={a.state === 'busy'}
                        onClick={() => apply(a)}
                        className="px-3 py-1.5 bg-[#0E7A43] text-white font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> {a.state === 'busy' ? 'Applying...' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAction(a.actionId, { state: 'cancelled', result: 'Cancelled.' })}
                        className="px-3 py-1.5 border border-black/20 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-[#575653]">Thinking...</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="p-3 border-t border-black/10 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ask your assistant..."
          className="flex-1 min-w-0 px-3 py-2 border border-black/20 text-sm focus:border-black focus:outline-none"
        />
        <button type="submit" disabled={busy || !input.trim()} className="px-4 py-2 bg-[#141413] text-white disabled:opacity-40 cursor-pointer" aria-label="Send">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
