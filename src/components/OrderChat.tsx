import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Lock, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';

// Chat between the customer and the seller of one order (server/orderChat.ts). Open while the order
// runs, read-only once it is finished. Phone numbers, e-mails and links are refused by the server.

type ChatMessage = { id: string; from: 'CUSTOMER' | 'SELLER'; text: string; at: string; mine: boolean };
type ChatView = { open: boolean; sellerName: string; customerName: string; messages: ChatMessage[]; unread?: number; available?: boolean };

type Props =
  | { mode: 'customer'; orderNumber: string; token: string }
  | { mode: 'seller'; orderId: string; customerName: string; unread?: number; onRead?: () => void };

const POLL_MS = 20_000;
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function call(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  await auth.authStateReady();
  const t = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Could not reach the store. Please try again.'), { code: data?.code });
  return data;
}

export const OrderChat: React.FC<Props> = (p) => {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatView | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (markRead: boolean) => {
      try {
        const d =
          p.mode === 'customer'
            ? await call('/api/order-chat', { orderNumber: p.orderNumber, token: p.token, markRead })
            : await call(`/api/seller/order-chat/${encodeURIComponent(p.orderId)}`);
        setChat(d);
        if (p.mode === 'seller' && markRead) p.onRead?.();
      } catch {
        /* keep the last view */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.mode, p.mode === 'customer' ? p.orderNumber : p.orderId]
  );

  // Customer: look once to know whether the order has a chat and unread replies
  useEffect(() => {
    if (p.mode === 'customer') load(false);
  }, [load, p.mode]);

  // While the chat is open: refresh now and then (only when the page is visible)
  useEffect(() => {
    if (!open) return;
    load(true);
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat?.messages.length, open]);

  if (p.mode === 'customer' && (!chat || chat.available === false)) return null;

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    try {
      const d =
        p.mode === 'customer'
          ? await call('/api/order-chat/send', { orderNumber: p.orderNumber, token: p.token, text: t })
          : await call(`/api/seller/order-chat/${encodeURIComponent(p.orderId)}`, { text: t });
      setChat((c) => ({ ...(c || ({} as ChatView)), ...d }));
      setText('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const other = p.mode === 'customer' ? chat?.sellerName || 'the seller' : p.customerName.split(/\s+/)[0] || 'the customer';
  const unread = p.mode === 'customer' ? chat?.unread || 0 : p.unread || 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-950 text-xs font-bold cursor-pointer hover:bg-emerald-100"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="flex-1 text-left">
          {p.mode === 'customer' ? `Chat with ${other} about this order` : `Chat with ${other}`}
        </span>
        {unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">{unread} new</span>}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-300 bg-white text-xs overflow-hidden">
      <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-emerald-800" />
        <strong className="flex-1 text-emerald-950">Order chat with {other}</strong>
        <button type="button" onClick={() => setOpen(false)} className="text-emerald-900 font-semibold cursor-pointer">
          Close
        </button>
      </div>
      <div className="px-3 py-1.5 bg-[#FBFBF9] border-b border-[#EFEDE8] text-[11px] text-[#6B6963] flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-700" />
        <span>
          Phone numbers, e-mails and links are not allowed here. Keep the deal on Anokha so your {p.mode === 'customer' ? 'order and money stay' : 'order and payout stay'} protected.
        </span>
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto p-3 space-y-2 bg-[#F7F6F2]">
        {!chat ? (
          <p className="text-[#6B6963]">Loading...</p>
        ) : chat.messages.length === 0 ? (
          <p className="text-[#6B6963]">
            {p.mode === 'customer' ? 'Ask the seller anything about this order: size, colour, when it ships...' : 'No messages yet. Say hello or ask the customer to confirm the order details.'}
          </p>
        ) : (
          chat.messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl whitespace-pre-line break-words ${m.mine ? 'bg-emerald-700 text-white rounded-br-sm' : 'bg-white border border-[#E7E5DF] rounded-bl-sm'}`}>
                {m.text}
                <div className={`mt-0.5 text-[10px] ${m.mine ? 'text-emerald-100' : 'text-[#8A8780]'}`}>{when(m.at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
      {chat && !chat.open ? (
        <div className="px-3 py-2.5 border-t border-[#EFEDE8] text-[#6B6963] flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> This order is finished, so the chat is closed.
        </div>
      ) : (
        <div className="p-2 border-t border-[#EFEDE8] space-y-1.5">
          {error && <p className="px-1 text-rose-700 font-semibold">{error}</p>}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={500}
              placeholder="Write a message..."
              className="flex-1 px-3 py-2 rounded-lg border border-[#DCD9D2] text-[13px] resize-none focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !text.trim()}
              aria-label="Send"
              className="px-3 rounded-lg bg-emerald-700 text-white disabled:opacity-50 cursor-pointer flex items-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
