import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';

// Admin: customers' return / replacement requests (Customer Protection Policy). Approving with
// "seller's fault" applies the Seller Rules automatically: return charge off the payout, product
// strikes (fake = locked, 3 customers = delisted), and a second fake complaint suspends the seller.

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

const REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Damaged or defective',
  WRONG_ITEM: 'Wrong item, colour or size',
  QUALITY: 'Quality does not match the description',
  FAKE: 'Fake or replica product',
};

type Filter = 'OPEN' | 'APPROVED' | 'REJECTED' | 'ALL';

export const AdminReturnsPanel: React.FC<{ onOpenCount?: (n: number) => void }> = ({ onOpenCount }) => {
  const { showToast } = useStore();
  const [list, setList] = useState<any[] | null>(null);
  const [charge, setCharge] = useState(0);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [deciding, setDeciding] = useState<{ id: string; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [fault, setFault] = useState<'SELLER' | 'OTHER'>('SELLER');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/admin/returns');
      setList(d.returns || []);
      setCharge(Number(d.returnCharge) || 0);
      onOpenCount?.((d.returns || []).filter((r: any) => r.status === 'OPEN').length);
    } catch (err: any) {
      showToast(err.message);
      setList((l) => l || []);
    }
  }, [showToast, onOpenCount]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async () => {
    if (!deciding) return;
    setSaving(true);
    try {
      await api(`/api/admin/returns/${encodeURIComponent(deciding.id)}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: deciding.decision, fault, note }),
      });
      showToast(deciding.decision === 'APPROVE' ? 'Return approved. The rules were applied.' : 'Request rejected. The customer can see the reason.');
      setDeciding(null);
      setNote('');
      await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shown = (list || []).filter((r) => filter === 'ALL' || r.status === filter);
  const count = (s: Filter) => (list || []).filter((r) => s === 'ALL' || r.status === s).length;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <RotateCcw className="w-5 h-5" /> Returns & complaints
          </h2>
          <p className="text-[#575653]">
            Customers ask within 7 days of delivery. Decide within 24–48 hours. Seller's fault = PKR {charge} return charge + product strike.
          </p>
        </div>
        <button type="button" onClick={load} className="px-3 py-1.5 border border-black/20 font-semibold flex items-center gap-1 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(['OPEN', 'APPROVED', 'REJECTED', 'ALL'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 border font-semibold cursor-pointer ${filter === f ? 'bg-[#141413] text-white border-[#141413]' : 'border-black/15'}`}
          >
            {f === 'OPEN' ? 'To decide' : f === 'ALL' ? 'All' : f === 'APPROVED' ? 'Approved' : 'Rejected'} ({count(f)})
          </button>
        ))}
      </div>

      {list === null ? (
        <p className="text-[#575653]">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="p-4 bg-white border border-black/10 text-[#575653]">Nothing here.</p>
      ) : (
        shown.map((r) => (
          <div key={r.id} className={`p-4 bg-white border space-y-2 ${r.reason === 'FAKE' && r.status === 'OPEN' ? 'border-rose-400' : 'border-black/10'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono text-sm">{r.orderNumber}</strong>
              <span className="px-2 py-0.5 bg-black/5 font-bold">{REASON_LABEL[r.reason] || r.reason}</span>
              <span>wants a {r.resolution === 'REPLACEMENT' ? 'replacement' : 'refund'}</span>
              <span className="text-[#575653]">
                {r.customerName} · {new Date(r.createdAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="ml-auto font-semibold">
                Seller: {r.sellerName || r.sellerId} · {formatPKR(r.total || 0)}
              </span>
            </div>
            <p>{(r.items || []).map((it: any) => `${it.name} ×${it.quantity}`).join(', ')}</p>
            <p className="whitespace-pre-line text-[#454441]">"{r.details}"</p>
            {r.photos?.length > 0 && (
              <div className="flex gap-2">
                {r.photos.map((p: string) => (
                  <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                    <img src={p} alt="" className="w-20 h-20 object-cover border border-black/10" />
                  </a>
                ))}
              </div>
            )}
            {r.sellerResponse && (
              <p className="pl-3 border-l-2 border-[#0E7A43]">
                <strong>Seller says:</strong> {r.sellerResponse}
              </p>
            )}
            {r.status !== 'OPEN' ? (
              <p className={`font-semibold ${r.status === 'APPROVED' ? 'text-rose-800' : 'text-emerald-800'}`}>
                {r.status === 'APPROVED' ? `Approved (${r.fault === 'SELLER' ? `seller's fault, −${formatPKR(r.returnCharge || 0)}` : 'not the seller’s fault'})` : 'Rejected'}
                {r.decisionNote ? ` — ${r.decisionNote}` : ''}
              </p>
            ) : deciding && deciding.id === r.id ? (
              <div className="p-3 bg-[#FBFBF9] border border-black/10 space-y-2">
                {deciding.decision === 'APPROVE' && (
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={fault === 'SELLER'} onChange={() => setFault('SELLER')} />
                      Seller's fault (charge PKR {charge}, product strike{r.reason === 'FAKE' ? ', product locked' : ''})
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={fault === 'OTHER'} onChange={() => setFault('OTHER')} />
                      Not the seller's fault (courier / customer)
                    </label>
                  </div>
                )}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={deciding.decision === 'APPROVE' ? 'Message to the customer (optional): pickup details, refund timing' : 'Reason for the customer (required)'}
                  className="w-full px-3 py-2 border border-black/20"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={decide}
                    className={`px-4 py-1.5 text-white font-bold disabled:opacity-50 cursor-pointer ${deciding.decision === 'APPROVE' ? 'bg-[#0E7A43]' : 'bg-rose-700'}`}
                  >
                    {saving ? 'Saving...' : deciding.decision === 'APPROVE' ? 'Confirm approval' : 'Confirm rejection'}
                  </button>
                  <button type="button" onClick={() => setDeciding(null)} className="px-4 py-1.5 border border-black/20 cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeciding({ id: r.id, decision: 'APPROVE' });
                    setFault(r.reason === 'DAMAGED' ? 'OTHER' : 'SELLER');
                    setNote('');
                  }}
                  className="px-4 py-1.5 bg-[#0E7A43] text-white font-bold cursor-pointer"
                >
                  Approve return
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeciding({ id: r.id, decision: 'REJECT' });
                    setNote('');
                  }}
                  className="px-4 py-1.5 border border-rose-400 text-rose-800 font-bold cursor-pointer"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
