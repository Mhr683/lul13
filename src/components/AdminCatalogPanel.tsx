import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import type { Product } from '../types/store';

// Admin: every seller's products, read-only. Sellers list and edit their products in Seller Center;
// the store can take a product off the store (with a reason the seller sees) and put it back.

const PAGE = 60;
type Filter = 'LIVE' | 'HIDDEN' | 'DRAFT' | 'ALL';

export const AdminCatalogPanel: React.FC = () => {
  const { products, showToast } = useStore();
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState('ALL');
  const [filter, setFilter] = useState<Filter>('LIVE');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);

  const all = products as (Product & { adminHidden?: boolean; adminHiddenReason?: string })[];
  const sellers = useMemo(() => Array.from(new Set(all.map((p) => p.sellerName || 'Store'))).sort((a, b) => a.localeCompare(b)), [all]);

  const inFilter = (p: (typeof all)[number], f: Filter) =>
    f === 'ALL'
      ? p.status !== 'ARCHIVED'
      : f === 'LIVE'
      ? p.status === 'ACTIVE'
      : f === 'HIDDEN'
      ? p.adminHidden === true
      : p.status === 'DRAFT' && !p.adminHidden;

  const bySeller = useMemo(() => all.filter((p) => seller === 'ALL' || (p.sellerName || 'Store') === seller), [all, seller]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bySeller.filter(
      (p) => inFilter(p, filter) && (!q || [p.name, p.sku, p.category, p.sellerName].some((v) => String(v || '').toLowerCase().includes(q)))
    );
  }, [bySeller, filter, search]);

  const moderate = async (p: Product, hidden: boolean) => {
    let reason = '';
    if (hidden) {
      const r = window.prompt(`Why are you taking "${p.name}" off the store? (the seller will see this)`);
      if (r === null) return;
      reason = r.trim();
    } else if (!window.confirm(`Put "${p.name}" back on the store?`)) {
      return;
    }
    setBusy(p.id);
    try {
      await auth.authStateReady();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/admin/products/${encodeURIComponent(p.id)}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hidden, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
      showToast(hidden ? 'Product taken off the store.' : 'Product is live again.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const filters: [Filter, string][] = [
    ['LIVE', 'Live'],
    ['HIDDEN', 'Hidden by store'],
    ['DRAFT', 'Seller drafts'],
    ['ALL', 'All'],
  ];

  return (
    <div className="space-y-4 text-[#141413]">
      <div>
        <h1 className="text-2xl font-display">Products (all sellers)</h1>
        <p className="text-xs text-[#575653]">
          Sellers add and edit their products in{' '}
          <a href="/seller" className="underline font-semibold">
            Seller Center
          </a>
          . Here you can review every product and take one off the store if it breaks the rules.
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
            placeholder="Search name, SKU, category or seller"
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
            {label} ({bySeller.filter((p) => inFilter(p, id)).length})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">No products in this list.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.slice(0, shown).map((p) => (
            <div key={p.id} className="bg-white border border-black/10 p-3 flex gap-3 text-xs [content-visibility:auto] [contain-intrinsic-size:auto_100px]">
              <div className="w-16 h-16 bg-[#F4F3EF] shrink-0 overflow-hidden">
                {p.primaryImage ? (
                  <img src={p.primaryImage} alt="" width={64} height={64} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-[#454441] truncate">
                  {p.sellerName || 'Store'} · {p.category}
                </div>
                <div>
                  {formatPKR(p.price)} · Stock {p.stock} · <span className="font-mono">{p.sku}</span>
                </div>
                {p.adminHidden && <div className="text-rose-800">Hidden: {p.adminHiddenReason || 'by the store'}</div>}
                <div className="pt-1">
                  {p.adminHidden ? (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => moderate(p, false)}
                      className="px-2 py-1 border border-emerald-600 text-emerald-800 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Put back on store
                    </button>
                  ) : p.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => moderate(p, true)}
                      className="px-2 py-1 border border-rose-500 text-rose-800 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Take off store
                    </button>
                  ) : (
                    <span className="text-[#575653]">Draft (not visible to customers)</span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
