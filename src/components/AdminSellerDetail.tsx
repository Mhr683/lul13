import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion, Send, ExternalLink } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import { SellerAvatar } from './SellerAvatar';

// Admin: one seller's full profile and performance report: bio and payout details, orders by
// stage, sales and earnings (today / 7 days / 30 days / all time), returns and cancellations,
// best-selling products, account health (green / yellow / red, with the reasons) and a one-click
// warning that lands in the seller's Seller Center.

type Health = { level: 'GREEN' | 'YELLOW' | 'RED'; score: number; reasons: { level: string; text: string }[]; advice: string };
type Period = { orders: number; units: number; sales: number; sellerEarning: number; storeCommission: number; returns: number; cancellations: number };
type Report = {
  counts: Record<'total' | 'new' | 'toPack' | 'packed' | 'inTransit' | 'delivered' | 'cancelled' | 'returned' | 'refunded', number>;
  periods: Record<'today' | 'week' | 'month' | 'all', Period>;
  rates: { cancelRate: number; returnRate: number };
  lateToShip: number;
  oldestOpenDays: number;
  products: { total: number; live: number; draft: number; outOfStock: number; hiddenByStore: number; reviews: number; avgRating: number };
  topProducts: { productId: string; name: string; units: number; sales: number }[];
  health: Health;
  earnings: { pending: number; available: number; paid: number; commission: number; supplierCost?: number; profit?: number };
  recentOrders: { id: string; orderNumber: string; status: string; total: number; units: number; customerName: string; city: string; createdAt: string }[];
};

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

export const HEALTH_STYLE: Record<string, { box: string; badge: string; label: string; Icon: any }> = {
  GREEN: { box: 'bg-emerald-50 border-emerald-400 text-emerald-950', badge: 'bg-emerald-600 text-white', label: 'Good', Icon: ShieldCheck },
  YELLOW: { box: 'bg-amber-50 border-amber-400 text-amber-950', badge: 'bg-amber-500 text-black', label: 'Watch', Icon: ShieldQuestion },
  RED: { box: 'bg-rose-50 border-rose-400 text-rose-950', badge: 'bg-rose-600 text-white', label: 'Warn now', Icon: ShieldAlert },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_CONFIRMATION: 'New',
  PENDING: 'New',
  CONFIRMED: 'To pack',
  PROCESSING: 'To pack',
  PACKED: 'Packed',
  SHIPPED: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  REFUNDED: 'Refunded',
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; strong?: boolean }> = ({ label, value, hint, strong }) => (
  <div className={`p-3 border ${strong ? 'bg-amber-50 border-amber-400' : 'bg-white border-black/10'}`}>
    <div className="text-[11px] text-[#575653]">{label}</div>
    <div className="text-lg font-bold font-mono text-[#141413] mt-0.5">{value}</div>
    {hint && <div className="text-[10px] text-[#575653] mt-0.5">{hint}</div>}
  </div>
);

export const AdminSellerDetail: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const { showToast } = useStore();
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [warning, setWarning] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/sellers/${encodeURIComponent(id)}/report`));
    } catch (err: any) {
      showToast(err.message);
    }
  }, [id, showToast]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-3 text-xs">
        <button type="button" onClick={onBack} className="font-semibold flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> All sellers
        </button>
        <p className="text-[#575653]">Loading the seller report...</p>
      </div>
    );
  }

  const s = data.seller;
  const p = data.privateData || {};
  const r: Report = data.report;
  const h = HEALTH_STYLE[r.health.level];
  const per = r.periods[period];
  const joined = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const defaultWarning =
    `Dear ${s.shopName},\n\nThe store has reviewed your shop's performance:\n` +
    r.health.reasons.filter((x) => x.level !== 'GREEN').map((x) => `• ${x.text}`).join('\n') +
    `\n\nPlease fix this as soon as possible: ship confirmed orders within 3 days, keep stock up to date and avoid cancellations. ` +
    `If it continues, your products may be taken off the store.`;

  const sendWarning = async () => {
    if (!warning?.trim()) return;
    setSending(true);
    try {
      await api('/api/admin/seller-notices', {
        method: 'POST',
        body: JSON.stringify({
          audience: s.id,
          level: r.health.level === 'RED' ? 'URGENT' : 'WARNING',
          title: r.health.level === 'RED' ? 'Urgent: your shop needs attention' : 'Reminder about your shop',
          body: warning.trim(),
        }),
      });
      showToast(`Warning sent to ${s.shopName}. It shows in their Seller Center.`);
      setWarning(null);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSending(false);
    }
  };

  const pipeline: [string, number, boolean?][] = [
    ['New (to confirm)', r.counts.new, r.counts.new > 0],
    ['To pack', r.counts.toPack, r.counts.toPack > 0],
    ['Packed', r.counts.packed],
    ['In transit', r.counts.inTransit],
    ['Delivered', r.counts.delivered],
    ['Cancelled', r.counts.cancelled],
    ['Returned', r.counts.returned + r.counts.refunded],
  ];

  return (
    <div className="space-y-5 text-xs text-[#141413]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="font-semibold flex items-center gap-1 cursor-pointer hover:underline">
          <ArrowLeft className="w-4 h-4" /> All sellers
        </button>
        <div className="flex gap-2">
          <a
            href={`/#shop/${encodeURIComponent(s.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-black/20 bg-white font-semibold flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open shop page
          </a>
          <button type="button" onClick={load} className="px-3 py-1.5 border border-black/20 bg-white cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
          </button>
        </div>
      </div>

      {/* Bio */}
      <div className="p-4 bg-white border border-black/10 flex flex-wrap gap-4">
        <SellerAvatar src={s.logoUrl} name={s.shopName} size={72} className="border border-black/10" />
        <div className="flex-1 min-w-[220px] space-y-1">
          <h1 className="text-2xl font-display">{s.shopName}</h1>
          <div className="text-[#454441]">
            {s.status} · joined {joined} · commission {data.commissionPercent}%
            {typeof data.conversations === 'number' ? ` · ${data.conversations} conversations with the store` : ''}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 pt-1">
            <div>
              <strong>Owner:</strong> {s.ownerName || '-'}
            </div>
            <div>
              <strong>Email:</strong> {s.ownerEmail || '-'}
            </div>
            <div>
              <strong>Phone:</strong> <span className="font-mono">{s.phone || '-'}</span>
            </div>
            <div>
              <strong>City:</strong> {s.city || '-'}
            </div>
            <div className="sm:col-span-2">
              <strong>Address:</strong> {p.address || '-'}
            </div>
            <div>
              <strong>CNIC:</strong> <span className="font-mono">{p.cnic || '-'}</span>
            </div>
            <div>
              <strong>Bank:</strong> {p.bankName || '-'} · {p.accountTitle || '-'} · <span className="font-mono">{p.accountNumber || '-'}</span>
            </div>
          </div>
          {s.statusReason && <div className="text-rose-800">Note: {s.statusReason}</div>}
        </div>
      </div>

      {/* Health */}
      <div className={`p-4 border-2 ${h.box} space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h.Icon className="w-6 h-6" />
            <div>
              <div className="text-sm font-bold">
                Account health: <span className={`px-2 py-0.5 rounded ${h.badge}`}>{h.label}</span>{' '}
                <span className="font-mono">{r.health.score}/100</span>
              </div>
              <div>{r.health.advice}</div>
            </div>
          </div>
          {r.health.level !== 'GREEN' && warning === null && (
            <button
              type="button"
              onClick={() => setWarning(defaultWarning)}
              className="px-4 py-2 bg-[#141413] text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-4 h-4" /> Send warning
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {r.health.reasons.map((x, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                  x.level === 'RED' ? 'bg-rose-600' : x.level === 'YELLOW' ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
              />
              {x.text}
            </li>
          ))}
        </ul>
        <div className="text-[11px] opacity-80">
          Rules: green when cancellations and returns stay under 5%, orders ship within 3 days and nothing is hidden by the store;
          yellow (watch) above 5% or 1–2 late orders; red (warn now) above 10%, 3+ late orders, very low ratings or a suspended
          account.
        </div>
        {warning !== null && (
          <div className="space-y-2 pt-2 border-t border-current/20">
            <label className="block font-bold">Warning to {s.shopName} (shown in their Seller Center → Messages)</label>
            <textarea
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
              rows={7}
              className="w-full px-3 py-2 bg-white border border-black/20 text-[#141413]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={sendWarning}
                className="px-4 py-2 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button type="button" onClick={() => setWarning(null)} className="px-4 py-2 border border-black/30 bg-white cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders by stage */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">Orders ({r.counts.total})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {pipeline.map(([label, value, strong]) => (
            <Stat key={label} label={label} value={value} strong={strong} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Cancellation rate" value={`${r.rates.cancelRate}%`} hint="last 30 days" strong={r.rates.cancelRate > 5} />
          <Stat label="Return rate" value={`${r.rates.returnRate}%`} hint="of finished orders" strong={r.rates.returnRate > 5} />
          <Stat label="Late to ship (3+ days)" value={r.lateToShip} hint={r.oldestOpenDays ? `oldest waiting ${r.oldestOpenDays} days` : 'none waiting'} strong={r.lateToShip > 0} />
          <Stat label="Units sold (all time)" value={r.periods.all.units} />
        </div>
      </section>

      {/* Sales & earnings by period */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Sales &amp; earnings</h2>
          <div className="flex gap-1">
            {(
              [
                ['today', 'Today'],
                ['week', '7 days'],
                ['month', '30 days'],
                ['all', 'All time'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`px-3 py-1.5 border font-semibold cursor-pointer ${
                  period === k ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Orders placed" value={per.orders} />
          <Stat label="Units sold" value={per.units} />
          <Stat label="Sales (customers paid)" value={formatPKR(per.sales)} />
          <Stat label="Seller earning (delivered)" value={formatPKR(per.sellerEarning)} />
          <Stat label="Store commission (delivered)" value={formatPKR(per.storeCommission)} />
          <Stat label="Returns / cancellations" value={`${per.returns} / ${per.cancellations}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Payout due now" value={formatPKR(r.earnings.available)} strong={r.earnings.available > 0} />
          <Stat label="Upcoming (not delivered yet)" value={formatPKR(r.earnings.pending)} />
          <Stat label="Paid out so far" value={formatPKR(r.earnings.paid)} />
          <Stat label="Store commission (all time)" value={formatPKR(r.earnings.commission)} />
        </div>
      </section>

      {/* Products */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">Products</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Listed" value={r.products.total} />
          <Stat label="Live" value={r.products.live} />
          <Stat label="Drafts" value={r.products.draft} />
          <Stat label="Out of stock" value={r.products.outOfStock} strong={r.products.live > 0 && r.products.outOfStock / r.products.live > 0.5} />
          <Stat label="Hidden by you" value={r.products.hiddenByStore} strong={r.products.hiddenByStore > 0} />
          <Stat label="Rating" value={r.products.avgRating ? `${r.products.avgRating}/5` : '–'} hint={`${r.products.reviews} reviews`} />
        </div>
        {r.topProducts.length > 0 && (
          <div className="bg-white border border-black/10">
            <div className="px-3 py-2 border-b border-black/10 font-bold">Best sellers</div>
            {r.topProducts.map((t) => (
              <div key={t.productId} className="px-3 py-2 border-b border-black/[0.06] flex justify-between gap-3">
                <span className="truncate">{t.name}</span>
                <span className="font-mono shrink-0">
                  {t.units} sold · {formatPKR(t.sales)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">Recent orders</h2>
        {r.recentOrders.length === 0 ? (
          <p className="p-4 bg-white border border-black/10 text-[#575653]">No orders yet.</p>
        ) : (
          <div className="bg-white border border-black/10 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F4F3EF]">
                <tr>
                  <th className="p-2">Order</th>
                  <th className="p-2">Stage</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Items</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {r.recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-black/[0.06]">
                    <td className="p-2 font-mono font-bold">{o.orderNumber}</td>
                    <td className="p-2">{STATUS_LABEL[o.status] || o.status}</td>
                    <td className="p-2">
                      {o.customerName}
                      {o.city ? ` · ${o.city}` : ''}
                    </td>
                    <td className="p-2 font-mono">{o.units}</td>
                    <td className="p-2 font-mono">{formatPKR(o.total)}</td>
                    <td className="p-2">{new Date(o.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payouts */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">Payouts</h2>
        {data.payouts.length === 0 ? (
          <p className="p-4 bg-white border border-black/10 text-[#575653]">No payouts yet.</p>
        ) : (
          <div className="bg-white border border-black/10 divide-y divide-black/[0.06]">
            {data.payouts.map((po: any) => (
              <div key={po.id} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                <span>{new Date(po.paidAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="font-mono font-bold">{formatPKR(po.amount)}</span>
                <span className="text-[#575653]">
                  {po.orderIds?.length || 0} orders · Ref {po.reference}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
