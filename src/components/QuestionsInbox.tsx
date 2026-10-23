import React, { useEffect, useState } from 'react';
import { EyeOff, Eye, MessageCircleQuestion, RefreshCw, Send } from 'lucide-react';
import { auth } from '../lib/firebase';

// Customer questions about products, answered by the seller (Seller Center) or the store (Admin).
// The answer appears on the product page and is emailed to the customer if they left an email.
// Server: server/productExtras.ts

export type StaffQuestion = {
  id: string;
  productId: string;
  productName: string;
  question: string;
  customerName: string;
  willEmail: boolean;
  answer: string;
  answeredBy: string;
  status: 'PENDING' | 'ANSWERED' | 'HIDDEN';
  createdAt: string;
  answeredAt: string;
  sellerId: string;
};

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data as T;
}

/** Number of unanswered questions on the seller's products (for the tab badge) */
export async function sellerWaitingQuestions(): Promise<number> {
  // A count only (1 database read), not the whole list
  const d = await api<{ waiting: number }>('/api/seller/questions/waiting');
  return Number(d.waiting) || 0;
}

const when = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export const QuestionsInbox: React.FC<{ mode: 'seller' | 'admin'; onWaitingChange?: (n: number) => void; houseSellerId?: string }> = ({
  mode,
  onWaitingChange,
  houseSellerId = 'house',
}) => {
  const [list, setList] = useState<StaffQuestion[] | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      const url = mode === 'seller' ? '/api/seller/questions' : `/api/admin/questions${showAll ? '?all=1' : ''}`;
      const d = await api<{ questions: StaffQuestion[] }>(url);
      setList(d.questions);
      onWaitingChange?.(d.questions.filter((q) => q.status === 'PENDING').length);
    } catch (e: any) {
      setError(e.message);
      setList((l) => l || []);
    }
  };
  useEffect(() => {
    load();
  }, [mode, showAll]);

  const answer = async (q: StaffQuestion) => {
    const text = (drafts[q.id] || '').trim();
    if (text.length < 2) return;
    setBusy(q.id);
    try {
      if (mode === 'seller') {
        await api(`/api/seller/questions/${encodeURIComponent(q.id)}/answer`, { method: 'POST', body: JSON.stringify({ answer: text }) });
      } else {
        await api(`/api/admin/questions/${encodeURIComponent(q.id)}`, { method: 'POST', body: JSON.stringify({ answer: text }) });
      }
      setDrafts((d) => ({ ...d, [q.id]: '' }));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const setHidden = async (q: StaffQuestion, hidden: boolean) => {
    setBusy(q.id);
    try {
      await api(`/api/admin/questions/${encodeURIComponent(q.id)}`, { method: 'POST', body: JSON.stringify({ hidden }) });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const waiting = (list || []).filter((q) => q.status === 'PENDING');
  const visible = mode === 'admin' && !showAll ? waiting : list || [];

  return (
    <div className="bg-white border border-black/10 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display flex items-center gap-2">
            <MessageCircleQuestion className="w-5 h-5 text-[#E8590C]" /> Customer questions
          </h2>
          <p className="text-xs text-[#575653]">
            {mode === 'seller'
              ? 'Questions customers asked about your products. Your answer shows on the product page; a quick, clear answer brings more sales.'
              : 'Questions on all products. Sellers answer their own; you can answer any (store products are yours) or hide abusive ones.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'admin' && (
            <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show answered &amp; hidden
            </label>
          )}
          <button type="button" onClick={load} className="px-3 py-1.5 border border-black/20 text-xs font-semibold flex items-center gap-1 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && <p className="p-2.5 bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold">{error}</p>}

      {list === null ? (
        <p className="text-xs text-[#575653]">Loading questions...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[#575653]">{mode === 'admin' && !showAll ? 'No questions are waiting for an answer.' : 'No questions yet.'}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((q) => (
            <li
              key={q.id}
              className={`p-3 border space-y-2 ${q.status === 'PENDING' ? 'border-amber-300 bg-amber-50/50' : q.status === 'HIDDEN' ? 'border-black/10 bg-black/[0.03] opacity-70' : 'border-black/10'}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#575653]">
                <a href={`/#product/${encodeURIComponent(q.productId)}`} target="_blank" rel="noopener noreferrer" className="font-bold text-[#141413] underline truncate max-w-[60%]">
                  {q.productName}
                </a>
                <span>·</span>
                <span>{q.customerName}</span>
                <span>·</span>
                <span>{when(q.createdAt)}</span>
                {mode === 'admin' && <span className="px-1.5 border border-black/15 text-[10px]">{q.sellerId === houseSellerId ? 'Store product' : 'Seller product'}</span>}
                <span
                  className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold ${
                    q.status === 'PENDING' ? 'bg-amber-200 text-amber-950' : q.status === 'HIDDEN' ? 'bg-black/10' : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {q.status === 'PENDING' ? 'Waiting for answer' : q.status === 'HIDDEN' ? 'Hidden' : 'Answered'}
                </span>
              </div>
              <p className="text-sm text-[#141413]">
                <strong className="text-[#E8590C]">Q:</strong> {q.question}
              </p>
              {q.answer && (
                <p className="pl-3 border-l-2 border-[#0E7A43] text-sm text-[#454441] whitespace-pre-line">
                  <strong className="text-[#0E7A43]">A:</strong> {q.answer}
                  <span className="block text-[10px] text-[#787774]">
                    by {q.answeredBy === 'SELLER' ? 'seller' : 'store'} · {when(q.answeredAt)}
                  </span>
                </p>
              )}
              {q.status !== 'HIDDEN' && (
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={drafts[q.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder={q.answer ? 'Change the answer...' : 'Write your answer...'}
                    className="flex-1 min-w-0 px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy === q.id || (drafts[q.id] || '').trim().length < 2}
                    onClick={() => answer(q)}
                    className="px-3 bg-[#141413] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" /> {q.answer ? 'Update' : 'Answer'}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#575653]">
                <span>{q.willEmail ? (q.answer ? 'The customer was emailed the answer.' : 'The customer will get your answer by email.') : 'No email: the answer shows on the product page.'}</span>
                {mode === 'admin' && (
                  <button
                    type="button"
                    disabled={busy === q.id}
                    onClick={() => setHidden(q, q.status !== 'HIDDEN')}
                    className="flex items-center gap-1 underline cursor-pointer disabled:opacity-40"
                  >
                    {q.status === 'HIDDEN' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {q.status === 'HIDDEN' ? 'Show again' : 'Hide (abusive / spam)'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {mode === 'seller' && waiting.length > 0 && (
        <p className="text-[11px] text-[#575653]">{waiting.length} waiting. Customers buy more when questions are answered within a day.</p>
      )}
    </div>
  );
};
