import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Ban, Wallet } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import type { SellerShop, SellerPrivate, SellerPayout } from '../types/store';
import { SellerAvatar } from './SellerAvatar';
import { AdminSellerDetail, HEALTH_STYLE } from './AdminSellerDetail';

// Admin: marketplace sellers (applications, approval, suspension, commission) and payouts.

type AdminSeller = SellerShop & {
  privateData: SellerPrivate | null;
  summary: { pending: number; available: number; paid: number; commission: number };
  productCount: number;
  overview: null | {
    health: { level: 'GREEN' | 'YELLOW' | 'RED'; score: number; reason: string };
    counts: { total: number; new: number; toPack: number; packed: number; inTransit: number; delivered: number; cancelled: number; returned: number; refunded: number };
    unitsSold: number;
    sales: number;
    lateToShip: number;
  };
};

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

const SELLERS_CACHE_KEY = 'admin_sellers_cache_v1';

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
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<'ALL' | 'GREEN' | 'YELLOW' | 'RED'>('ALL');
  const [detailId, setDetailId] = useState<string | null>(null);

  // The last list that loaded is kept on this device and shown when the database cannot answer
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api('/api/admin/sellers'), api('/api/admin/payouts')]);
      setSellers(s.sellers);
      setDefaultCommission(s.defaultCommission);
      setCommissionDraft(String(s.defaultCommission));
      setPayouts(p.payouts);
      setSavedAt(null);
      try {
        localStorage.setItem(
          SELLERS_CACHE_KEY,
          JSON.stringify({ at: new Date().toISOString(), sellers: s.sellers, defaultCommission: s.defaultCommission, payouts: p.payouts })
        );
      } catch {}
    } catch (err: any) {
      showToast(err.message);
      let cached: any = null;
      try {
        cached = JSON.parse(localStorage.getItem(SELLERS_CACHE_KEY) || 'null');
      } catch {}
      if (cached?.sellers) {
        setSellers(cached.sellers);
        setDefaultCommission(cached.defaultCommission ?? 10);
        setCommissionDraft(String(cached.defaultCommission ?? 10));
        setPayouts(cached.payouts || []);
        setSavedAt(cached.at);
      } else {
        setSellers((prev) => prev || []);
        setSavedAt('never');
      }
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (sellers && filter === 'PENDING' && !sellers.some((s) => s.status === 'PENDING') && sellers.length > 0) setFilter('APPROVED');
  }, [sellers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search by shop / owner name, email, phone or city (e.g. the shop a complaint is about)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sellers || [];
    if (q) {
      list = list.filter((s) =>
        [s.shopName, s.ownerName, s.ownerEmail, s.phone, s.city].some((v) => String(v || '').toLowerCase().includes(q))
      );
    } else if (filter === 'OTHER') list = list.filter((s) => s.status === 'REJECTED' || s.status === 'SUSPENDED');
    else if (filter !== 'ALL') list = list.filter((s) => s.status === filter);
    if (healthFilter !== 'ALL') list = list.filter((s) => s.overview?.health.level === healthFilter);
    return list;
  }, [sellers, filter, search, healthFilter]);

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
      `Send ${formatPKR(s.summary.available)} to ${s.shopName}.\n\n` +
        `Bank: ${s.privateData?.bankName || '-'} · ${s.privateData?.accountTitle || '-'} · ${s.privateData?.accountNumber || '-'}\n\n` +
        'After the transfer, enter the bank reference / TID:'
    );
    if (reference === null || !reference.trim()) return;
    setBusy(s.id);
    try {
      const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify({ sellerId: s.id, reference: reference.trim() }) });
      showToast(`Payout recorded: ${formatPKR(r.amount)} (${r.orders} orders).`);
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
  const healthCount = (level: string) => (sellers || []).filter((s) => s.overview?.health.level === level).length;
  const totals = (sellers || []).reduce(
    (a, s) => ({
      toShip: a.toShip + (s.overview ? s.overview.counts.new + s.overview.counts.toPack + s.overview.counts.packed : 0),
      inTransit: a.inTransit + (s.overview?.counts.inTransit || 0),
      delivered: a.delivered + (s.overview?.counts.delivered || 0),
      returned: a.returned + (s.overview ? s.overview.counts.returned + s.overview.counts.refunded : 0),
      sales: a.sales + (s.overview?.sales || 0),
    }),
    { toShip: 0, inTransit: 0, delivered: 0, returned: 0, sales: 0 }
  );

  if (detailId) {
    return (
      <AdminSellerDetail
        id={detailId}
        onBack={() => {
          setDetailId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-5 text-[#141413]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display">Sellers &amp; Payouts</h1>
          <p className="text-xs text-[#575653]">
            Seller Center link: <a href="/seller" className="underline font-mono">{window.location.origin}/seller</a> — sellers
            apply here.
          </p>
        </div>
        <button type="button" onClick={load} className="px-3 py-2 border border-black/20 bg-white text-xs cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
        </button>
      </div>

      {savedAt && (
        <div className="p-3 bg-amber-50 border border-amber-400 text-amber-950 text-xs">
          {savedAt === 'never'
            ? 'The seller list could not be loaded right now (the database may have reached its daily limit, which resets at 12:00 noon Pakistan time). Press Refresh later.'
            : `Showing the list saved on ${new Date(savedAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}; the database could not answer right now (daily limit resets at 12:00 noon Pakistan time).`}
        </div>
      )}

      {/* All sellers at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
        {(
          [
            ['Sellers', (sellers || []).length, ''],
            ['Active', counts.APPROVED, ''],
            ['New applications', counts.PENDING, counts.PENDING > 0 ? 'bg-amber-50 border-amber-400' : ''],
            ['Orders to ship', totals.toShip, ''],
            ['In transit', totals.inTransit, ''],
            ['Delivered', totals.delivered, ''],
            ['Returned', totals.returned, ''],
            ['Sales (all sellers)', formatPKR(totals.sales), ''],
          ] as [string, React.ReactNode, string][]
        ).map(([label, value, cls]) => (
          <div key={label} className={`p-3 border ${cls || 'bg-white border-black/10'}`}>
            <div className="text-[11px] text-[#575653]">{label}</div>
            <div className="text-lg font-bold font-mono">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold">Account health:</span>
        {(['ALL', 'GREEN', 'YELLOW', 'RED'] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setHealthFilter(lvl)}
            className={`px-3 py-1.5 border font-semibold cursor-pointer ${
              healthFilter === lvl ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
            }`}
          >
            {lvl === 'ALL' ? 'All' : `${HEALTH_STYLE[lvl].label} (${healthCount(lvl)})`}
          </button>
        ))}
      </div>

      {/* Default commission */}
      <div className="p-4 bg-white border border-black/10 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <label className="block font-bold mb-1">Default commission (% of each seller sale)</label>
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
            if (!(pct >= 0 && pct <= 100)) return showToast('Enter a commission between 0 and 100.');
            await updateStoreSettings({ marketplaceCommissionPercent: pct });
            setDefaultCommission(pct);
          }}
          className="px-4 py-2 bg-[#141413] text-white font-bold cursor-pointer"
        >
          Save
        </button>
        <span className="text-[#575653]">
          Current: {settings.marketplaceCommissionPercent ?? defaultCommission}%. Set a different commission for a seller below.
          Applies to new orders.
        </span>
      </div>

      {/* Search and filters */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search a shop by name, owner, email, phone or city (e.g. the shop a complaint is about)"
        className="w-full px-3 py-2.5 bg-white border border-black/20 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['PENDING', `New applications (${counts.PENDING})`],
            ['APPROVED', `Active sellers (${counts.APPROVED})`],
            ['OTHER', `Rejected / suspended (${counts.OTHER})`],
            ['ALL', 'All'],
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
        <p className="text-xs text-[#575653]">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">No sellers in this list.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.id} className="p-4 bg-white border border-black/10 text-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailId(s.id)}
                  title="Open the full seller report"
                  className="flex items-center gap-2 cursor-pointer text-left"
                >
                  <SellerAvatar src={s.logoUrl} name={s.shopName} size={32} />
                  <strong className="text-sm underline decoration-dotted">{s.shopName}</strong>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold ${tone[s.status]}`}>{s.status}</span>
                  {s.overview && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${HEALTH_STYLE[s.overview.health.level].badge}`}>
                      {HEALTH_STYLE[s.overview.health.level].label} · {s.overview.health.score}
                    </span>
                  )}
                </button>
                <span className="text-[#575653]">Apply: {new Date(s.createdAt).toLocaleDateString('en-PK')}</span>
              </div>
              {s.overview && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 bg-[#F4F3EF] border border-black/[0.06]">
                  <span>To ship: <strong>{s.overview.counts.new + s.overview.counts.toPack + s.overview.counts.packed}</strong></span>
                  <span>In transit: <strong>{s.overview.counts.inTransit}</strong></span>
                  <span>Delivered: <strong>{s.overview.counts.delivered}</strong></span>
                  <span>Returned: <strong>{s.overview.counts.returned + s.overview.counts.refunded}</strong></span>
                  <span>Cancelled: <strong>{s.overview.counts.cancelled}</strong></span>
                  <span>Units sold: <strong>{s.overview.unitsSold}</strong></span>
                  {s.overview.lateToShip > 0 && <span className="text-rose-800 font-bold">{s.overview.lateToShip} late to ship</span>}
                  {s.overview.health.level !== 'GREEN' && <span className="text-[#454441]">· {s.overview.health.reason}</span>}
                  <button type="button" onClick={() => setDetailId(s.id)} className="ml-auto font-bold underline cursor-pointer">
                    Full report →
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="font-bold">Owner</div>
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
                  <div className="font-bold">Account</div>
                  <div>Products: {s.productCount}</div>
                  <div>Commission: {typeof s.commissionPercent === 'number' ? `${s.commissionPercent}% (custom)` : `${defaultCommission}% (default)`}</div>
                  <div>Store earnings: {formatPKR(s.summary.commission)}</div>
                  <div>Upcoming seller earnings: {formatPKR(s.summary.pending)}</div>
                  <div className="font-bold text-emerald-800">Payout due: {formatPKR(s.summary.available)}</div>
                  <div>Paid out so far: {formatPKR(s.summary.paid)}</div>
                </div>
              </div>
              {s.statusReason && <div className="text-[#454441]">Note: {s.statusReason}</div>}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-black/10">
                {s.status !== 'APPROVED' && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => update(s, { status: 'APPROVED', statusReason: '' }, `${s.shopName} approved.`)}
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
                      const reason = window.prompt('Reason for rejecting (shown to the seller):');
                      if (reason !== null) update(s, { status: 'REJECTED', statusReason: reason.trim() }, 'Application rejected.');
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
                      const reason = window.prompt(`Reason for suspending ${s.shopName}? (all their products will be removed from the store)`);
                      if (reason !== null) update(s, { status: 'SUSPENDED', statusReason: reason.trim() }, `${s.shopName} suspended.`);
                    }}
                    className="px-3 py-1.5 border border-slate-500 text-slate-900 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5 inline mr-1" /> Suspend
                  </button>
                )}
                {(s.status === 'APPROVED' || s.status === 'SUSPENDED') && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => {
                      const v = window.prompt(
                        `Commission % for ${s.shopName} (leave empty to use the default ${defaultCommission}%):`,
                        typeof s.commissionPercent === 'number' ? String(s.commissionPercent) : ''
                      );
                      if (v !== null) update(s, { commissionPercent: v.trim() === '' ? null : Number(v) }, 'Commission saved.');
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
                    <Wallet className="w-3.5 h-3.5 inline mr-1" /> Record payout ({formatPKR(s.summary.available)})
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
          <p className="p-4 text-xs text-[#575653]">No payouts yet.</p>
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
