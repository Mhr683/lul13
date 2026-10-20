import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatPKR } from '../services/abstractions';
import { OrderTimeline } from './OrderTimeline';
import type { Order } from '../types/store';

// Admin: every order of every seller, read-only. Sellers confirm, pack and ship their own orders in
// Seller Center; the store only steps in to stop an order (cancel before shipping), or to record a
// return or a refund.

const OPEN = ['PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'];
const MOVING = ['SHIPPED', 'OUT_FOR_DELIVERY'];
const CLOSED = ['CANCELLED', 'RETURNED', 'REFUNDED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'];
const PAGE = 50;

const tone = (s: string) =>
  s === 'DELIVERED'
    ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
    : CLOSED.includes(s)
    ? 'bg-rose-100 text-rose-900 border-rose-400'
    : MOVING.includes(s)
    ? 'bg-sky-100 text-sky-900 border-sky-400'
    : 'bg-amber-100 text-amber-900 border-amber-400';

type Filter = 'OPEN' | 'MOVING' | 'DELIVERED' | 'CLOSED' | 'ALL';

export const AdminOrdersOverview: React.FC = () => {
  const { orders, updateOrderState } = useStore();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [seller, setSeller] = useState('ALL');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const sellers = useMemo(
    () => Array.from(new Set(orders.map((o) => o.sellerName || 'Store'))).sort((a, b) => a.localeCompare(b)),
    [orders]
  );

  const inFilter = (o: Order, f: Filter) =>
    f === 'ALL' ||
    (f === 'OPEN' && OPEN.includes(o.status)) ||
    (f === 'MOVING' && MOVING.includes(o.status)) ||
    (f === 'DELIVERED' && o.status === 'DELIVERED') ||
    (f === 'CLOSED' && CLOSED.includes(o.status));

  const bySeller = useMemo(() => orders.filter((o) => seller === 'ALL' || (o.sellerName || 'Store') === seller), [orders, seller]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bySeller.filter(
      (o) =>
        inFilter(o, filter) &&
        (!q ||
          [o.orderNumber, o.customerName, o.customerPhone, o.trackingNumber, o.sellerName].some((v) =>
            String(v || '').toLowerCase().includes(q)
          ))
    );
  }, [bySeller, filter, search]);

  const count = (f: Filter) => bySeller.filter((o) => inFilter(o, f)).length;

  const setStatus = async (o: Order, status: 'CANCELLED' | 'RETURNED' | 'REFUNDED', question: string) => {
    if (!window.confirm(question)) return;
    setBusy(o.id);
    try {
      await updateOrderState(o.id, status);
    } finally {
      setBusy(null);
    }
  };

  const filters: [Filter, string][] = [
    ['OPEN', 'To be shipped'],
    ['MOVING', 'On the way'],
    ['DELIVERED', 'Delivered'],
    ['CLOSED', 'Cancelled / returned'],
    ['ALL', 'All'],
  ];

  return (
    <div className="space-y-4 text-[#141413]">
      <div>
        <h1 className="text-2xl font-display">Orders (all sellers)</h1>
        <p className="text-xs text-[#575653]">
          Sellers confirm, pack and ship their own orders in Seller Center. Here you can follow every order, stop one before it is
          shipped, or record a return or a refund. Stock is restored automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#575653]" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search order #, customer, phone, tracking or seller"
            className="w-full pl-8 pr-3 py-2 bg-white border border-black/20 text-xs"
          />
        </div>
        <select
          value={seller}
          onChange={(e) => {
            setSeller(e.target.value);
            setShown(PAGE);
          }}
          className="px-3 py-2 bg-white border border-black/20 text-xs"
        >
          <option value="ALL">All sellers</option>
          {sellers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFilter(id);
              setShown(PAGE);
            }}
            className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
              filter === id ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20 text-[#141413]'
            }`}
          >
            {label} ({count(id)})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">No orders in this list.</p>
      ) : (
        <div className="bg-white border border-black/10 divide-y divide-black/[0.06]">
          {visible.slice(0, shown).map((o) => {
            const open = openId === o.id;
            const shipped = MOVING.includes(o.status) || o.status === 'DELIVERED';
            return (
              <div key={o.id} className="text-xs">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : o.id)}
                  className="w-full px-4 py-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-left items-center cursor-pointer hover:bg-black/[0.02]"
                >
                  <span className="font-mono font-bold">{o.orderNumber}</span>
                  <span>
                    <span className={`px-2 py-0.5 border text-[10px] font-bold ${tone(o.status)}`}>{o.status.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="truncate">{o.customerName}</span>
                  <span className="truncate text-[#454441]">{o.sellerName || 'Store'}</span>
                  <span className="font-mono">{formatPKR(o.total)}</span>
                  <span className="text-[#575653]">
                    {new Date(o.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <div className="font-bold">Customer</div>
                        <div>{o.customerName}</div>
                        <div className="font-mono">{o.customerPhone}</div>
                        <div className="text-[#454441]">{o.shippingAddressSummary}</div>
                      </div>
                      <div>
                        <div className="font-bold">Items</div>
                        {(o.items || []).map((it, i) => (
                          <div key={i}>
                            {it.quantity} × {it.name}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-bold">Payment &amp; shipping</div>
                        <div>
                          {o.paymentMethod} · {o.paymentStatus}
                        </div>
                        <div>
                          {o.courierName ? `${o.courierName}: ` : ''}
                          <span className="font-mono">{o.trackingNumber || 'not shipped yet'}</span>
                        </div>
                        {o.cancellationReason && <div className="text-rose-800">Reason: {o.cancellationReason}</div>}
                      </div>
                    </div>
                    <OrderTimeline order={o} compact />
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-black/10">
                      {!shipped && !CLOSED.includes(o.status) && (
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => setStatus(o, 'CANCELLED', `Stop (cancel) order ${o.orderNumber}? The seller and the customer will see it as cancelled.`)}
                          className="px-3 py-1.5 border border-rose-500 text-rose-800 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Cancel order
                        </button>
                      )}
                      {shipped && (
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => setStatus(o, 'RETURNED', `Mark order ${o.orderNumber} as returned? The stock goes back to the seller.`)}
                          className="px-3 py-1.5 border border-black/30 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Mark returned
                        </button>
                      )}
                      {(o.paymentStatus === 'PAID' || o.status === 'RETURNED') && o.status !== 'REFUNDED' && (
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => setStatus(o, 'REFUNDED', `Record a refund for order ${o.orderNumber}? Send the money to the customer first.`)}
                          className="px-3 py-1.5 border border-black/30 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Record refund
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {visible.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full py-2.5 bg-white border border-black/20 text-xs font-bold cursor-pointer"
        >
          Show more ({visible.length - shown} more)
        </button>
      )}
    </div>
  );
};
