import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Ban, Wallet } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import type { SellerShop, SellerPrivate, SellerPayout } from '../types/store';
import { SellerAvatar } from './SellerAvatar';

// Admin: marketplace sellers (applications, approval, suspension, commission) and payouts.

type AdminSeller = SellerShop & {
  privateData: SellerPrivate | null;
  summary: { pending: number; available: number; paid: number; commission: number };
  productCount: number;
};

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Kuch ghalat ho gaya.');
  return data as T;
}

const tone: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900 border-amber-400',
  APPROVED: 'bg-emerald-100 text-emerald-900 border-emerald-400',
  REJECTED: 'bg-rose-100 text-rose-900 border-rose-400',
  SUSPENDED: 'bg-slate-200 text-slate-900 border-slate-500',
};

export const AdminSellersPanel: React.FC = () => {
  const { showToast, settings, updateStoreSettings } = useStore();
  const [sellers, setSellers] = useState<AdminSeller[] | null>(null);
  const [defaultCommission, setDefaultCommission] = useState<number>(10);
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'OTHER' | 'ALL'>('PENDING');
  const [busy, setBusy] = useState<string | null>(null);
  const [commissionDraft, setCommissionDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api('/api/admin/sellers'), api('/api/admin/payouts')]);
      setSellers(s.sellers);
      setDefaultCommission(s.defaultCommission);
      setCommissionDraft(String(s.defaultCommission));
      setPayouts(p.payouts);
    } catch (err: any) {
      showToast(err.message);
      setSellers([]);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (sellers && filter === 'PENDING' && !sellers.some((s) => s.status === 'PENDING') && sellers.length > 0) setFilter('APPROVED');
  }, [sellers]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const list = sellers || [];
    if (filter === 'ALL') return list;
    if (filter === 'OTHER') return list.filter((s) => s.status === 'REJECTED' || s.status === 'SUSPENDED');
    return list.filter((s) => s.status === filter);
  }, [sellers, filter]);

  const shopById = useMemo(() => new Map((sellers || []).map((s) => [s.id, s.shopName])), [sellers]);

  const update = async (s: AdminSeller, body: Record<string, any>, done: string) => {
    setBusy(s.id);
    try {
      const r = await api(`/api/admin/sellers/${encodeURIComponent(s.id)}`, { method: 'POST', body: JSON.stringify(body) });
      showToast(done + (r.changedProducts ? ` (${r.changedProducts} products)` : ''));
      await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const payout = async (s: AdminSeller) => {
    const reference = window.prompt(
      `${s.shopName} ko ${formatPKR(s.summary.available)} bhejein.\n\n` +
        `Bank: ${s.privateData?.bankName || '-'} · ${s.privateData?.accountTitle || '-'} · ${s.privateData?.accountNumber || '-'}\n\n` +
        'Transfer karne ke baad bank ka reference / TID likhein:'
    );
    if (reference === null || !reference.trim()) return;
    setBusy(s.id);
    try {
      const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify({ sellerId: s.id, reference: reference.trim() }) });
      showToast(`Payout record ho gaya: ${formatPKR(r.amount)} (${r.orders} orders).`);
      await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    PENDING: (sellers || []).filter((s) => s.status === 'PENDING').length,
    APPROVED: (sellers || []).filter((s) => s.status === 'APPROVED').length,
    OTHER: (sellers || []).filter((s) => s.status === 'REJECTED' || s.status === 'SUSPENDED').length,
  };

  return (
    <div className="space-y-5 text-[#141413]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display">Sellers &amp; Payouts</h1>
          <p className="text-xs text-[#575653]">
            Seller Center ka link: <a href="/seller" className="underline font-mono">{window.location.origin}/seller</a> — sellers yahan
            se apply karte hain.
          </p>
        </div>
        <button type="button" onClick={load} className="px-3 py-2 border border-black/20 bg-white text-xs cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
        </button>
      </div>

      {/* Default commission */}
      <div className="p-4 bg-white border border-black/10 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <label className="block font-bold mb-1">Default commission (har seller sale par %)</label>
          <input
            value={commissionDraft}
            onChange={(e) => setCommissionDraft(e.target.value)}
            inputMode="decimal"
            className="w-24 px-3 py-2 border border-black/20"
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            const pct = Number(commissionDraft);
            if (!(pct >= 0 && pct <= 100)) return showToast('Commission 0 se 100 ke darmiyan likhein.');
            await updateStoreSettings({ marketplaceCommissionPercent: pct });
            setDefaultCommission(pct);
          }}
          className="px-4 py-2 bg-[#141413] text-white font-bold cursor-pointer"
        >
          Save
        </button>
        <span className="text-[#575653]">
          Abhi: {settings.marketplaceCommissionPercent ?? defaultCommission}%. Kisi seller ka alag commission neeche set karein. Naye
          orders par lagega.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['PENDING', `Nayi applications (${counts.PENDING})`],
            ['APPROVED', `Active sellers (${counts.APPROVED})`],
            ['OTHER', `Rejected / band (${counts.OTHER})`],
            ['ALL', 'Sab'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
              filter === id ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
            } ${id === 'PENDING' && counts.PENDING > 0 && filter !== id ? 'border-amber-500 text-amber-900' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sellers === null ? (
        <p className="text-xs text-[#575653]">Load ho raha hai...</p>
      ) : visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">Is list mein koi seller nahi.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.id} className="p-4 bg-white border border-black/10 text-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SellerAvatar src={s.logoUrl} name={s.shopName} size={32} />
                  <strong className="text-sm">{s.shopName}</strong>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold ${tone[s.status]}`}>{s.status}</span>
                </div>
                <span className="text-[#575653]">Apply: {new Date(s.createdAt).toLocaleDateString('en-PK')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="font-bold">Malik</div>
                  <div>{s.ownerName}</div>
                  <div>{s.ownerEmail}</div>
                  <div className="font-mono">{s.phone}</div>
                  <div>{s.city}</div>
                </div>
                <div>
                  <div className="font-bold">CNIC / Bank</div>
                  <div className="font-mono">{s.privateData?.cnic || '-'}</div>
                  <div>{s.privateData?.bankName} · {s.privateData?.accountTitle}</div>
                  <div className="font-mono">{s.privateData?.accountNumber}</div>
                  <div className="text-[#454441]">{s.privateData?.address}</div>
                </div>
                <div>
                  <div className="font-bold">Hisaab</div>
                  <div>Products: {s.productCount}</div>
                  <div>Commission: {typeof s.commissionPercent === 'number' ? `${s.commissionPercent}% (khaas)` : `${defaultCommission}% (default)`}</div>
                  <div>Store ki kamai: {formatPKR(s.summary.commission)}</div>
                  <div>Aane wali seller kamai: {formatPKR(s.summary.pending)}</div>
                  <div className="font-bold text-emerald-800">Payout baqi: {formatPKR(s.summary.available)}</div>
                  <div>Ab tak payout: {formatPKR(s.summary.paid)}</div>
                </div>
              </div>
              {s.statusReason && <div className="text-[#454441]">Note: {s.statusReason}</div>}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-black/10">
                {s.status !== 'APPROVED' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => update(s, { status: 'APPROVED', statusReason: '' }, `${s.shopName} approve ho gaya.`)}
                    className="px-3 py-1.5 bg-emerald-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Approve
                  </button>
                )}
                {s.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => {
                      const reason = window.prompt('Reject karne ki wajah (seller ko dikhegi):');
                      if (reason !== null) update(s, { status: 'REJECTED', statusReason: reason.trim() }, 'Application reject ho gayi.');
                    }}
                    className="px-3 py-1.5 border border-rose-500 text-rose-800 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 inline mr-1" /> Reject
                  </button>
                )}
                {s.status === 'APPROVED' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => {
                      const reason = window.prompt(`${s.shopName} ko band karne ki wajah? (us ke saare products store se hat jayenge)`);
                      if (reason !== null) update(s, { status: 'SUSPENDED', statusReason: reason.trim() }, `${s.shopName} band ho gaya.`);
                    }}
                    className="px-3 py-1.5 border border-slate-500 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5 inline mr-1" /> Band karein
                  </button>
                )}
                {(s.status === 'APPROVED' || s.status === 'SUSPENDED') && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => {
                      const v = window.prompt(
                        `${s.shopName} ka commission % (khali chhorein to default ${defaultCommission}% lagega):`,
                        typeof s.commissionPercent === 'number' ? String(s.commissionPercent) : ''
                      );
                      if (v !== null) update(s, { commissionPercent: v.trim() === '' ? null : Number(v) }, 'Commission save ho gaya.');
                    }}
                    className="px-3 py-1.5 border border-black/30 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Commission %
                  </button>
                )}
                {s.summary.available > 0 && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => payout(s)}
                    className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer disabled:opacity-50 ml-auto"
                  >
                    <Wallet className="w-3.5 h-3.5 inline mr-1" /> Payout record karein ({formatPKR(s.summary.available)})
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payout history */}
      <div className="bg-white border border-black/10">
        <div className="px-4 py-2 border-b border-black/10 text-xs font-bold">Payout history</div>
        {payouts.length === 0 ? (
          <p className="p-4 text-xs text-[#575653]">Abhi koi payout nahi hua.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06] text-xs">
            {payouts.map((p) => (
              <li key={p.id} className="px-4 py-2 flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{shopById.get(p.sellerId) || p.sellerId}</span>
                <span>{new Date(p.paidAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="font-mono font-bold">{formatPKR(p.amount)}</span>
                <span className="text-[#575653]">
                  {p.orderIds.length} orders · Ref {p.reference} · {p.paidBy}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
