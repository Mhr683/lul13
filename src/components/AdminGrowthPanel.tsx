import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Users, Zap, CalendarHeart, ShoppingCart, Eye, Store, MessageCircle, Trash2, Plus } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import {
  welcomeOf,
  referralOf,
  isFlashActive,
  isCampaignLive,
  DEFAULT_NEW_SELLER_FREE_DAYS,
  MAX_FLASH_DAYS,
  type Campaign,
} from '../services/promotions';

// Admin → Marketing & Growth: welcome offer, refer & earn, live purchase notifications, new-seller
// 0% commission, flash deals, festival campaigns and abandoned checkouts (WhatsApp reminders).

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

const box = 'p-4 bg-white border border-black/10 rounded-lg space-y-3';
const input = 'px-3 py-1.5 border border-black/20 text-xs bg-white focus:border-black focus:outline-none';
const toLocal = (iso?: string) => (iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : '');

export const AdminGrowthPanel: React.FC = () => {
  const { settings, updateStoreSettings, products, showToast } = useStore();
  const w = welcomeOf(settings);
  const r = referralOf(settings);
  const [welcome, setWelcome] = useState(w);
  const [referral, setReferral] = useState(r);
  const [freeDays, setFreeDays] = useState(String(settings.newSellerFreeDays ?? DEFAULT_NEW_SELLER_FREE_DAYS));
  const [proof, setProof] = useState(settings.socialProofEnabled !== false);

  const saveGrowth = () => {
    const pct = Math.min(50, Math.max(1, Number(welcome.percent) || 10));
    updateStoreSettings({
      welcomeOffer: { ...welcome, code: welcome.code.trim().toUpperCase() || 'WELCOME10', percent: pct, maxDiscount: Number(welcome.maxDiscount) || 0 },
      referral: { ...referral, rewardPkr: Math.max(0, Number(referral.rewardPkr) || 0), maxPercentOfOrder: Math.min(100, Math.max(1, Number(referral.maxPercentOfOrder) || 30)) },
      newSellerFreeDays: Math.max(0, Math.floor(Number(freeDays) || 0)),
      socialProofEnabled: proof,
    });
  };

  // ---------------------------------------------------------------- flash deals
  const [dealQuery, setDealQuery] = useState('');
  const [dealProduct, setDealProduct] = useState<string>('');
  const [dealPrice, setDealPrice] = useState('');
  const [dealEnds, setDealEnds] = useState(() => toLocal(new Date(Date.now() + 24 * 3600_000).toISOString()));
  const [dealBusy, setDealBusy] = useState(false);
  const matches = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return products.filter((p) => p.status === 'ACTIVE' && `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 8);
  }, [dealQuery, products]);
  const liveDeals = products.filter((p) => isFlashActive(p as any) || (p.flashEndsAt && Date.parse(p.flashEndsAt) > Date.now() && Number(p.flashPrice) > 0));
  const chosen = products.find((p) => p.id === dealProduct);
  const saveDeal = async (productId: string, body: any) => {
    setDealBusy(true);
    try {
      await api('/api/admin/flash-deal', { method: 'POST', body: JSON.stringify({ productId, ...body }) });
      showToast(body.clear ? 'Deal removed.' : 'Flash deal saved. It shows in the store within a minute.');
      if (!body.clear) {
        setDealProduct('');
        setDealPrice('');
        setDealQuery('');
      }
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setDealBusy(false);
    }
  };

  // ---------------------------------------------------------------- campaigns
  const campaigns = settings.campaigns || [];
  const blank: Campaign = { id: '', slug: '', title: '', subtitle: '', badge: '', bannerUrl: '', keywords: '', categories: [], onlyDiscounted: false, startsAt: '', endsAt: '', active: true };
  const [editing, setEditing] = useState<Campaign | null>(null);
  const saveCampaign = () => {
    if (!editing || editing.title.trim().length < 3) return showToast('Give the campaign a title.');
    const slug = (editing.slug || editing.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const c: Campaign = { ...editing, id: editing.id || `cmp-${Date.now()}`, slug };
    const next = editing.id ? campaigns.map((x) => (x.id === c.id ? c : x)) : [...campaigns, c];
    updateStoreSettings({ campaigns: next.slice(0, 20) });
    setEditing(null);
  };
  const presets: Partial<Campaign>[] = [
    { title: 'Eid Gifts Festival', badge: 'EID SPECIAL', subtitle: 'Anokhe tohfay for your loved ones', keywords: 'gift, perfume, watch, jewel, eid, bag' },
    { title: 'Black Friday Mega Sale', badge: 'BLACK FRIDAY', subtitle: 'The biggest discounts of the year', onlyDiscounted: true },
    { title: 'New Year Deals', badge: 'NEW YEAR', subtitle: 'Start the year with something anokha', keywords: 'gift, smart, watch, gadget' },
  ];

  // ---------------------------------------------------------------- abandoned carts
  const [carts, setCarts] = useState<any[] | null>(null);
  const loadCarts = useCallback(() => {
    api('/api/admin/carts')
      .then((d) => setCarts(d.carts || []))
      .catch(() => setCarts([]));
  }, []);
  useEffect(() => {
    loadCarts();
  }, [loadCarts]);
  const remind = async (c: any) => {
    const digits = String(c.phone).replace(/\D/g, '').replace(/^0/, '92');
    const items = (c.items || []).map((it: any) => it.name).slice(0, 3).join(', ');
    const msg = `Assalam-o-Alaikum ${c.name || ''}! You left ${items} in your bag at ${settings.storeName || 'our store'}. Your items are still available — complete your order here: ${window.location.origin}/  (Cash on Delivery available)`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    try {
      await api(`/api/admin/carts/${encodeURIComponent(c.id)}/reminded`, { method: 'POST', body: '{}' });
      setCarts((l) => l && l.map((x) => (x.id === c.id ? { ...x, status: 'REMINDED' } : x)));
    } catch {}
  };
  const removeCart = async (c: any) => {
    try {
      await api(`/api/admin/carts/${encodeURIComponent(c.id)}/reminded`, { method: 'POST', body: JSON.stringify({ remove: true }) });
      setCarts((l) => l && l.filter((x) => x.id !== c.id));
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="space-y-5 text-xs text-[#141413]">
      <div>
        <h2 className="text-lg font-bold">Marketing & Growth</h2>
        <p className="text-[#575653]">Bring more customers and sellers. Every discount here is checked again by the server at checkout.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={box}>
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <Gift className="w-4 h-4 text-[#0E7A43]" /> Welcome discount (first order)
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={welcome.enabled} onChange={(e) => setWelcome({ ...welcome, enabled: e.target.checked })} /> New visitors see a popup with the code
          </label>
          <div className="flex flex-wrap gap-2">
            <input className={input} value={welcome.code} onChange={(e) => setWelcome({ ...welcome, code: e.target.value })} placeholder="Code" />
            <input className={`${input} w-20`} value={welcome.percent} onChange={(e) => setWelcome({ ...welcome, percent: Number(e.target.value) })} inputMode="numeric" />
            <span className="self-center">% off, max PKR</span>
            <input className={`${input} w-24`} value={welcome.maxDiscount ?? ''} onChange={(e) => setWelcome({ ...welcome, maxDiscount: Number(e.target.value) })} inputMode="numeric" />
          </div>
          <p className="text-[#575653]">Only a customer's first order (by phone number and account). Paid by the store, not the seller.</p>
        </div>

        <div className={box}>
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <Users className="w-4 h-4 text-[#0E7A43]" /> Refer & Earn
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={referral.enabled} onChange={(e) => setReferral({ ...referral, enabled: e.target.checked })} /> Customers get a share link in My Account
          </label>
          <div className="flex flex-wrap items-center gap-2">
            Reward PKR
            <input className={`${input} w-24`} value={referral.rewardPkr} onChange={(e) => setReferral({ ...referral, rewardPkr: Number(e.target.value) })} inputMode="numeric" />
            per friend · use up to
            <input className={`${input} w-16`} value={referral.maxPercentOfOrder} onChange={(e) => setReferral({ ...referral, maxPercentOfOrder: Number(e.target.value) })} inputMode="numeric" />% of an order
          </div>
          <p className="text-[#575653]">Credit is earned only when the friend's first order is delivered.</p>
        </div>

        <div className={box}>
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <Eye className="w-4 h-4 text-[#0E7A43]" /> Live purchase notifications
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={proof} onChange={(e) => setProof(e.target.checked)} /> Show "Ayesha (Lahore) bought ..." in the store
          </label>
          <p className="text-[#575653]">Only real orders of the last 7 days, first name and city only. Customers can close it.</p>
        </div>

        <div className={box}>
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <Store className="w-4 h-4 text-[#0E7A43]" /> New sellers: 0% commission
          </div>
          <div className="flex items-center gap-2">
            First
            <input className={`${input} w-20`} value={freeDays} onChange={(e) => setFreeDays(e.target.value)} inputMode="numeric" />
            days after approval (0 = off)
          </div>
          <p className="text-[#575653]">Sellers see it in Seller Center. Orders in this period are recorded with 0% commission.</p>
        </div>
      </div>
      <button type="button" onClick={saveGrowth} className="px-5 py-2 bg-[#0E7A43] text-white font-bold cursor-pointer">
        Save these settings
      </button>

      {/* Flash deals */}
      <div className={box}>
        <div className="font-bold flex items-center gap-1.5 text-sm">
          <Zap className="w-4 h-4 text-[#B91C1C]" /> Flash deals (Anokhi Daily Deals, with a countdown)
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input className={`${input} w-64`} value={dealQuery} onChange={(e) => setDealQuery(e.target.value)} placeholder="Search a product by name or SKU" />
          {chosen && (
            <>
              <span className="font-semibold">
                {chosen.name.slice(0, 40)} · now {formatPKR(chosen.price)}
              </span>
              <input className={`${input} w-28`} value={dealPrice} onChange={(e) => setDealPrice(e.target.value)} placeholder="Deal price" inputMode="numeric" />
              <span>ends</span>
              <input type="datetime-local" className={input} value={dealEnds} onChange={(e) => setDealEnds(e.target.value)} />
              <button
                type="button"
                disabled={dealBusy}
                onClick={() => saveDeal(chosen.id, { flashPrice: Number(dealPrice), endsAt: fromLocal(dealEnds) })}
                className="px-3 py-1.5 bg-[#B91C1C] text-white font-bold disabled:opacity-50 cursor-pointer"
              >
                Start deal
              </button>
            </>
          )}
        </div>
        {matches.length > 0 && !chosen && (
          <div className="flex flex-wrap gap-1">
            {matches.map((p) => (
              <button key={p.id} type="button" onClick={() => setDealProduct(p.id)} className="px-2 py-1 border border-black/15 hover:border-black cursor-pointer">
                {p.name.slice(0, 45)} · {formatPKR(p.price)}
              </button>
            ))}
          </div>
        )}
        <p className="text-[#575653]">Up to {MAX_FLASH_DAYS} days. Sellers can also start deals on their own products in Seller Center.</p>
        {liveDeals.length > 0 && (
          <ul className="divide-y divide-black/[0.06]">
            {liveDeals.map((p) => (
              <li key={p.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {p.name.slice(0, 50)} · <strong className="text-[#B91C1C]">{formatPKR(Number(p.flashPrice))}</strong> instead of {formatPKR(p.price)} · until{' '}
                  {new Date(p.flashEndsAt!).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
                <button type="button" disabled={dealBusy} onClick={() => saveDeal(p.id, { clear: true })} className="px-2 py-1 border border-black/20 cursor-pointer">
                  End deal
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Festival campaigns */}
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <CalendarHeart className="w-4 h-4 text-[#0E7A43]" /> Event & festival zones (Eid, Black Friday, New Year...)
          </div>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button key={p.title} type="button" onClick={() => setEditing({ ...blank, ...p } as Campaign)} className="px-2 py-1 border border-black/15 cursor-pointer">
                + {p.title}
              </button>
            ))}
            <button type="button" onClick={() => setEditing({ ...blank })} className="px-2 py-1 bg-[#141413] text-white flex items-center gap-1 cursor-pointer">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
        </div>
        {editing && (
          <div className="p-3 bg-[#FBFBF9] border border-black/10 grid gap-2 sm:grid-cols-2">
            <input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title (e.g. Eid Gifts Festival)" />
            <input className={input} value={editing.badge || ''} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="Badge (e.g. EID SPECIAL)" />
            <input className={`${input} sm:col-span-2`} value={editing.subtitle || ''} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Subtitle" />
            <input className={`${input} sm:col-span-2`} value={editing.bannerUrl || ''} onChange={(e) => setEditing({ ...editing, bannerUrl: e.target.value })} placeholder="Banner picture link (https://..., optional)" />
            <input className={`${input} sm:col-span-2`} value={editing.keywords || ''} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} placeholder="Products with these words (comma separated): gift, perfume, watch" />
            <input
              className={`${input} sm:col-span-2`}
              value={(editing.categories || []).join(', ')}
              onChange={(e) => setEditing({ ...editing, categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
              placeholder="And/or whole categories (comma separated)"
            />
            <label className="flex items-center gap-1">
              Starts <input type="datetime-local" className={input} value={toLocal(editing.startsAt)} onChange={(e) => setEditing({ ...editing, startsAt: fromLocal(e.target.value) })} />
            </label>
            <label className="flex items-center gap-1">
              Ends <input type="datetime-local" className={input} value={toLocal(editing.endsAt)} onChange={(e) => setEditing({ ...editing, endsAt: fromLocal(e.target.value) })} />
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!editing.onlyDiscounted} onChange={(e) => setEditing({ ...editing, onlyDiscounted: e.target.checked })} /> Only products on sale
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" onClick={saveCampaign} className="px-4 py-1.5 bg-[#0E7A43] text-white font-bold cursor-pointer">
                Save campaign
              </button>
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-1.5 border border-black/20 cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        )}
        {campaigns.length === 0 ? (
          <p className="text-[#575653]">No campaigns yet. Live campaigns show as banners on the home page, each with its own page.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {campaigns.map((c) => (
              <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{c.title}</strong> {isCampaignLive(c) ? <span className="text-emerald-700 font-bold">· LIVE</span> : <span className="text-[#787774]">· not live</span>}
                  <span className="text-[#575653]"> · /#campaign/{c.slug}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => setEditing(c)} className="px-2 py-1 border border-black/20 cursor-pointer">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Delete "${c.title}"?`) && updateStoreSettings({ campaigns: campaigns.filter((x) => x.id !== c.id) })}
                    className="px-2 py-1 border border-rose-300 text-rose-700 cursor-pointer"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Abandoned checkouts */}
      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <ShoppingCart className="w-4 h-4 text-[#0E7A43]" /> Abandoned checkouts ({carts?.length ?? '…'})
          </div>
          <button type="button" onClick={loadCarts} className="px-2 py-1 border border-black/20 cursor-pointer">
            Refresh
          </button>
        </div>
        <p className="text-[#575653]">
          Customers who entered their phone at checkout, agreed to a reminder, and did not order within 30 minutes. "Send WhatsApp" opens WhatsApp
          with a ready message; you press send.
        </p>
        {carts === null ? (
          <p>Loading...</p>
        ) : carts.length === 0 ? (
          <p className="text-[#575653]">None right now.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {carts.map((c) => (
              <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{c.name || 'Customer'}</strong> · <span className="font-mono">{c.phone}</span> · {formatPKR(c.total)} ·{' '}
                  {(c.items || []).map((it: any) => `${String(it.name).slice(0, 30)} ×${it.quantity}`).join(', ')}
                  <span className="text-[#787774]"> · {new Date(c.updatedAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  {c.status === 'REMINDED' && <span className="ml-1 text-emerald-700 font-bold">· reminded</span>}
                </span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => remind(c)} className="px-2.5 py-1 bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer">
                    <MessageCircle className="w-3.5 h-3.5" /> Send WhatsApp
                  </button>
                  <button type="button" onClick={() => removeCart(c)} aria-label="Remove" className="px-2 py-1 border border-black/20 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
