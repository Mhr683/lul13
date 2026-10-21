import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Trash2, Megaphone, MessageSquare, Plus } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';

// Admin: the sellers' complaint box (kept apart from the customer inbox) and notices / alerts the
// store sends to all sellers or to one seller. Everything goes through /api/admin/seller-*.

type ThreadMessage = { id: string; from: 'SELLER' | 'ADMIN'; author: string; text: string; at: string };
type Thread = {
  id: string;
  sellerId: string;
  sellerName: string;
  subject: string;
  category: string;
  orderNumber?: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  startedBy: 'SELLER' | 'ADMIN';
  createdAt: string;
  lastMessageAt: string;
  lastFrom: 'SELLER' | 'ADMIN';
  lastMessagePreview: string;
  unreadForAdmin: boolean;
  messages?: ThreadMessage[];
};
type Notice = {
  id: string;
  title: string;
  body: string;
  level: 'INFO' | 'WARNING' | 'URGENT';
  audience: string;
  audienceName: string;
  createdAt: string;
  createdBy: string;
};
type SellerOption = { id: string; shopName: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

const CATEGORY: Record<string, string> = {
  ORDER: 'Order problem',
  PAYOUT: 'Payout / payment',
  PRODUCT: 'Product / listing',
  ACCOUNT: 'Account',
  OTHER: 'Other',
};
const STATUS_TONE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-900 border-amber-400',
  ANSWERED: 'bg-sky-100 text-sky-900 border-sky-400',
  CLOSED: 'bg-slate-100 text-slate-800 border-slate-400',
};
const STATUS_LABEL: Record<string, string> = { OPEN: 'Needs reply', ANSWERED: 'Replied', CLOSED: 'Closed' };
const LEVEL_TONE: Record<string, string> = {
  INFO: 'bg-sky-50 border-sky-300',
  WARNING: 'bg-amber-50 border-amber-400',
  URGENT: 'bg-rose-50 border-rose-400',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const inputCls = 'w-full px-3 py-2 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';

export const AdminSellerInbox: React.FC<{ onUnreadChange?: (n: number) => void }> = ({ onUnreadChange }) => {
  const { showToast } = useStore();
  const [view, setView] = useState<'THREADS' | 'NOTICES'>('THREADS');
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [filter, setFilter] = useState<'OPEN' | 'ANSWERED' | 'CLOSED' | 'ALL'>('OPEN');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api<{ threads: Thread[]; unread: number }>('/api/admin/seller-threads');
      setThreads(d.threads);
      onUnreadChange?.(d.unread);
    } catch (err: any) {
      showToast(err.message);
      setThreads((t) => t || []);
    }
  }, [showToast, onUnreadChange]);

  useEffect(() => {
    load();
    api<{ sellers: SellerOption[] }>('/api/admin/seller-list')
      .then((d) => setSellers(d.sellers))
      .catch(() => {});
  }, [load]);

  const visible = useMemo(
    () => (threads || []).filter((t) => filter === 'ALL' || t.status === filter),
    [threads, filter]
  );
  const count = (s: string) => (threads || []).filter((t) => s === 'ALL' || t.status === s).length;

  if (openId) return <AdminThreadView id={openId} onBack={() => setOpenId(null)} onChanged={load} />;
  if (composing)
    return (
      <AdminNewThread
        sellers={sellers}
        onCancel={() => setComposing(false)}
        onSent={async (id) => {
          setComposing(false);
          await load();
          setOpenId(id);
        }}
      />
    );

  return (
    <div className="space-y-4 text-[#141413] text-xs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display">Seller Messages</h1>
          <p className="text-[#575653]">
            Complaints and questions from sellers, and notices you send them. Customer inquiries stay in the Customer Inbox.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('THREADS')}
            className={`px-3 py-2 border font-semibold flex items-center gap-1 cursor-pointer ${
              view === 'THREADS' ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Complaint box
          </button>
          <button
            type="button"
            onClick={() => setView('NOTICES')}
            className={`px-3 py-2 border font-semibold flex items-center gap-1 cursor-pointer ${
              view === 'NOTICES' ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
            }`}
          >
            <Megaphone className="w-4 h-4" /> Notices to sellers
          </button>
        </div>
      </div>

      {view === 'NOTICES' ? (
        <NoticesPanel sellers={sellers} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['OPEN', 'ANSWERED', 'CLOSED', 'ALL'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 font-semibold border cursor-pointer ${
                  filter === s ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
                }`}
              >
                {s === 'ALL' ? 'All' : STATUS_LABEL[s]} ({count(s)})
              </button>
            ))}
            <button type="button" onClick={load} className="ml-auto px-3 py-1.5 border border-black/20 bg-white cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="px-3 py-1.5 bg-[#141413] text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Message a seller
            </button>
          </div>

          {threads === null ? (
            <p className="text-[#575653]">Loading...</p>
          ) : visible.length === 0 ? (
            <p className="p-6 bg-white border border-black/10 text-center text-[#575653]">No conversations in this list.</p>
          ) : (
            <div className="bg-white border border-black/10 divide-y divide-black/[0.06]">
              {visible.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className={`w-full p-3 text-left flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-black/[0.02] ${
                    t.unreadForAdmin ? 'bg-amber-50/60' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {t.unreadForAdmin && <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />}
                      <strong className="text-[13px] truncate">{t.subject}</strong>
                    </span>
                    <span className="block text-[#575653] truncate">
                      <strong className="text-[#141413]">{t.sellerName}</strong> · {t.lastFrom === 'ADMIN' ? 'You: ' : ''}
                      {t.lastMessagePreview}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className={`inline-block px-2 py-0.5 border text-[10px] font-bold ${STATUS_TONE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className="block text-[#575653] mt-0.5">
                      {CATEGORY[t.category] || t.category}
                      {t.orderNumber ? ` · ${t.orderNumber}` : ''} · {when(t.lastMessageAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AdminThreadView: React.FC<{ id: string; onBack: () => void; onChanged: () => Promise<void> }> = ({ id, onBack, onChanged }) => {
  const { showToast } = useStore();
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/admin/seller-threads/${encodeURIComponent(id)}`)
      .then((d) => {
        setThread(d.thread);
        onChanged();
      })
      .catch((err) => showToast(err.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (close: boolean) => {
    setBusy(true);
    try {
      const d = await api(`/api/admin/seller-threads/${encodeURIComponent(id)}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: reply.trim(), close }),
      });
      setThread(d.thread);
      setReply('');
      showToast(close ? 'Conversation closed.' : 'Reply sent to the seller.');
      onChanged();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/seller-threads/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status: 'OPEN' }) });
      setThread((t) => (t ? { ...t, status: 'OPEN' } : t));
      onChanged();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-black/10 p-4 space-y-4 text-xs text-[#141413]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-display">{thread?.subject || 'Loading...'}</h2>
          {thread && (
            <p className="text-[#575653]">
              <strong className="text-[#141413]">{thread.sellerName}</strong> · {CATEGORY[thread.category] || thread.category}
              {thread.orderNumber ? ` · Order ${thread.orderNumber}` : ''} · started {when(thread.createdAt)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {thread && (
            <span className={`px-2 py-1 border text-[10px] font-bold ${STATUS_TONE[thread.status]}`}>{STATUS_LABEL[thread.status]}</span>
          )}
          <button type="button" onClick={onBack} className="px-4 py-1.5 border border-black/20 cursor-pointer">
            Back
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {(thread?.messages || []).map((m) => (
          <div key={m.id} className={`flex ${m.from === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 border whitespace-pre-line ${
                m.from === 'ADMIN' ? 'bg-[#141413] text-white border-[#141413]' : 'bg-amber-50 border-amber-300'
              }`}
            >
              <div className={`text-[10px] font-bold mb-0.5 ${m.from === 'ADMIN' ? 'text-white/70' : 'text-amber-900'}`}>
                {m.from === 'ADMIN' ? 'You (store team)' : m.author} · {when(m.at)}
              </div>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {thread && (
        <div className="space-y-2 pt-2 border-t border-black/10">
          <textarea className={inputCls} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to the seller..." />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !reply.trim()}
              onClick={() => send(false)}
              className="px-4 py-2 bg-[#141413] text-white font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" /> Send reply
            </button>
            {thread.status !== 'CLOSED' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => send(true)}
                className="px-4 py-2 border border-black/30 font-semibold disabled:opacity-50 cursor-pointer"
              >
                {reply.trim() ? 'Send and close' : 'Close (solved)'}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={reopen} className="px-4 py-2 border border-black/30 font-semibold disabled:opacity-50 cursor-pointer">
                Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminNewThread: React.FC<{ sellers: SellerOption[]; onCancel: () => void; onSent: (id: string) => void }> = ({
  sellers,
  onCancel,
  onSent,
}) => {
  const { showToast } = useStore();
  const [form, setForm] = useState({ sellerId: '', category: 'OTHER', orderNumber: '', subject: '', text: '' });
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#141413]"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        try {
          const { thread } = await api('/api/admin/seller-threads', { method: 'POST', body: JSON.stringify(form) });
          showToast('Message sent to the seller.');
          onSent(thread.id);
        } catch (err: any) {
          showToast(err.message);
        } finally {
          setSending(false);
        }
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-display">Message a seller</h2>
      <div>
        <label className={labelCls}>Seller *</label>
        <select className={inputCls} value={form.sellerId} onChange={set('sellerId')} required>
          <option value="">Choose a seller</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shopName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>About</label>
        <select className={inputCls} value={form.category} onChange={set('category')}>
          {Object.entries(CATEGORY).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Subject *</label>
        <input className={inputCls} value={form.subject} onChange={set('subject')} required />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Order number (optional)</label>
        <input className={inputCls} value={form.orderNumber} onChange={set('orderNumber')} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Message *</label>
        <textarea className={inputCls} rows={6} value={form.text} onChange={set('text')} required />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={sending} className="px-5 py-2 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer">
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 border border-black/20 cursor-pointer">
          Back
        </button>
      </div>
    </form>
  );
};

const NoticesPanel: React.FC<{ sellers: SellerOption[] }> = ({ sellers }) => {
  const { showToast } = useStore();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [form, setForm] = useState({ title: '', body: '', level: 'INFO', audience: 'ALL' });
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    try {
      setNotices((await api<{ notices: Notice[] }>('/api/admin/seller-notices')).notices);
    } catch (err: any) {
      showToast(err.message);
      setNotices((n) => n || []);
    }
  }, [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <form
        className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          try {
            await api('/api/admin/seller-notices', { method: 'POST', body: JSON.stringify(form) });
            showToast('Notice sent. Sellers see it in Seller Center → Messages.');
            setForm({ title: '', body: '', level: 'INFO', audience: 'ALL' });
            await load();
          } catch (err: any) {
            showToast(err.message);
          } finally {
            setSending(false);
          }
        }}
      >
        <h2 className="sm:col-span-2 text-lg font-display">Send a notice / alert</h2>
        <div>
          <label className={labelCls}>Send to</label>
          <select className={inputCls} value={form.audience} onChange={set('audience')}>
            <option value="ALL">All sellers</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                Only {s.shopName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={form.level} onChange={set('level')}>
            <option value="INFO">Information</option>
            <option value="WARNING">Warning</option>
            <option value="URGENT">Urgent alert (shown at the top of Seller Center)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Title *</label>
          <input className={inputCls} value={form.title} onChange={set('title')} placeholder="e.g. Eid holidays: courier pickups" required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notice *</label>
          <textarea className={inputCls} rows={5} value={form.body} onChange={set('body')} required />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={sending} className="px-5 py-2 bg-[#141413] text-white font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer">
            <Megaphone className="w-4 h-4" /> {sending ? 'Sending...' : 'Send notice'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">Sent notices</h2>
        {notices === null ? (
          <p className="text-[#575653]">Loading...</p>
        ) : notices.length === 0 ? (
          <p className="p-4 bg-white border border-black/10 text-[#575653]">No notices sent yet.</p>
        ) : (
          notices.map((n) => (
            <div key={n.id} className={`p-3 border ${LEVEL_TONE[n.level] || LEVEL_TONE.INFO}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[13px]">{n.title}</strong>
                <span className="flex items-center gap-2 text-[#454441]">
                  {n.audienceName} · {when(n.createdAt)}
                  <button
                    type="button"
                    title="Delete notice"
                    onClick={async () => {
                      if (!window.confirm(`Delete the notice "${n.title}"? Sellers will no longer see it.`)) return;
                      try {
                        await api(`/api/admin/seller-notices/${encodeURIComponent(n.id)}`, { method: 'DELETE' });
                        await load();
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                    className="p-1 border border-rose-400 text-rose-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line">{n.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
