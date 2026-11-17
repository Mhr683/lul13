import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Check, X, Sparkles, Paperclip, FileText } from 'lucide-react';
import { ShopCoachReport, type Coach } from './ShopCoachReport';
import { shrinkImage } from './ProductMediaEditor';

// Files attached to a question: pictures / screenshots, PDF, text or CSV (read by the assistant only,
// for that one answer; nothing is saved or shared)
type Attachment = { id: string; name: string; kind: 'image' | 'pdf' | 'text'; blob: Blob; preview?: string };
const MAX_FILES = 3;
const MAX_TOTAL = 7 * 1024 * 1024;
const kindOf = (f: File): Attachment['kind'] | null =>
  /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name)
    ? 'image'
    : f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    ? 'pdf'
    : /^text\//.test(f.type) || /\.(txt|csv|tsv)$/i.test(f.name)
    ? 'text'
    : null;
const toBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(b);
  });

// Seller Center → AI Assistant: the seller's own AI command center. It only works on this
// seller's shop (the server enforces it; see server/sellerAi.ts). Changes appear as cards with an
// "Apply" button and are made only after the seller confirms.

type Action = { actionId: string; title: string; total: number; changes: Record<string, any>[]; state?: 'applied' | 'cancelled' | 'busy'; result?: string };
type Message = { role: 'user' | 'model'; text: string; actions?: Action[]; reports?: Coach[]; files?: string[]; thumbs?: string[] };

const SUGGESTIONS = [
  'How is my shop doing? Give me the full report',
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
  onGo?: (tab: string) => void;
}> = ({ shopName, call, onChanged, onGo }) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // Pictures are not kept after a reload; only the file names
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30).map(({ reports, thumbs, ...m }) => m)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const addFiles = async (list: File[]) => {
    setFileNote('');
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) {
        setFileNote(`At most ${MAX_FILES} files in one question.`);
        break;
      }
      const kind = kindOf(f);
      if (!kind) {
        setFileNote(`"${f.name}" cannot be read. Send a picture (JPG, PNG, WEBP), a PDF, or a text / CSV file.`);
        continue;
      }
      const blob = kind === 'image' ? await shrinkImage(f) : f;
      if (next.reduce((s, a) => s + a.blob.size, 0) + blob.size > MAX_TOTAL) {
        setFileNote('The files are too big. Send at most 7 MB in one question.');
        continue;
      }
      next.push({ id: `${Date.now()}-${Math.random()}`, name: f.name || 'screenshot.png', kind, blob, preview: kind === 'image' ? URL.createObjectURL(blob) : undefined });
    }
    setFiles(next);
  };
  const removeFile = (id: string) => setFiles((fs) => fs.filter((f) => f.id !== id));

  // A screenshot copied to the clipboard can be pasted straight into the box (Ctrl+V)
  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData?.files || []);
    if (!pasted.length) return;
    e.preventDefault();
    addFiles(pasted);
  };

  const send = async (text: string) => {
    const attached = files;
    const prompt = text.trim();
    if ((!prompt && !attached.length) || busy) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [
      ...m,
      {
        role: 'user',
        text: prompt || '(file)',
        files: attached.map((f) => f.name),
        thumbs: attached.filter((f) => f.preview).map((f) => f.preview!),
      },
    ]);
    setInput('');
    setFiles([]);
    setFileNote('');
    setBusy(true);
    try {
      const payload = await Promise.all(attached.map(async (f) => ({ name: f.name, data: await toBase64(f.blob) })));
      const d = await call<{ text: string; actions: Action[]; reports?: Coach[] }>('/api/seller/ai/command', {
        method: 'POST',
        body: JSON.stringify({ prompt, history, files: payload }),
      });
      setMessages((m) => [...m, { role: 'model', text: d.text, actions: d.actions || [], reports: d.reports || [] }]);
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
    <div className="bg-white rounded-xl border border-[#E7E5DF] flex flex-col h-[70vh] min-h-[420px]">
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
                  className="px-3 py-1.5 border border-[#DCD9D2] rounded-full text-xs hover:border-[#0E7A43] flex items-center gap-1 cursor-pointer"
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
              {!!m.thumbs?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {m.thumbs.map((t, k) => (
                    <img key={k} src={t} alt="" className="w-20 h-20 rounded object-cover bg-white" />
                  ))}
                </div>
              )}
              {!!m.files?.length && <p className="text-[11px] opacity-75">📎 {m.files.join(', ')}</p>}
              <p className="whitespace-pre-line">{m.text}</p>
              {m.reports?.map((r, k) => (
                <div key={k} className="bg-white rounded p-2 -mx-1">
                  <ShopCoachReport coach={r} onGo={onGo} />
                </div>
              ))}
              {m.actions?.map((a) => (
                <div key={a.actionId} className="bg-white text-[#141413] border border-[#DCD9D2] rounded p-2.5 space-y-2 text-xs">
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
                        className="px-3 py-1.5 bg-[#0E7A43] text-white rounded-lg font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> {a.state === 'busy' ? 'Applying...' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAction(a.actionId, { state: 'cancelled', result: 'Cancelled.' })}
                        className="px-3 py-1.5 rounded-lg border border-[#DCD9D2] flex items-center gap-1 cursor-pointer"
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
        className="p-3 border-t border-black/10 space-y-2"
      >
        {(files.length > 0 || fileNote) && (
          <div className="flex flex-wrap items-center gap-2">
            {files.map((f) => (
              <span key={f.id} className="relative inline-flex items-center gap-1.5 pl-1 pr-6 py-1 rounded-lg border border-[#DCD9D2] bg-[#FBFBF9] text-[11px] max-w-[180px]">
                {f.preview ? (
                  <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <FileText className="w-4 h-4 text-[#575653] shrink-0" />
                )}
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[#575653] hover:text-black cursor-pointer"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {fileNote && <span className="text-[11px] text-rose-700">{fileNote}</span>}
          </div>
        )}
        <div className="flex gap-2">
          {/* Picture, screenshot, PDF or text file from the phone / computer */}
          <label
            className={`px-3 py-2 rounded-lg border border-[#DCD9D2] flex items-center cursor-pointer hover:border-black ${files.length >= MAX_FILES ? 'opacity-40 pointer-events-none' : ''}`}
            title="Attach a picture, screenshot, PDF or text file"
            aria-label="Attach a file"
          >
            <Paperclip className="w-4 h-4" />
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.txt,.csv,.tsv,text/plain,text/csv"
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            maxLength={2000}
            placeholder={files.length ? 'What do you want to know about it?' : 'Ask your assistant...'}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#DCD9D2] text-sm focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || (!input.trim() && !files.length)}
            className="px-4 py-2 bg-[#141413] text-white rounded-lg disabled:opacity-40 cursor-pointer"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-[#8A8780]">📎 Picture, screenshot, PDF or text file (up to 3). Only the assistant reads them for this answer; they are not saved or shared.</p>
      </form>
    </div>
  );
};
