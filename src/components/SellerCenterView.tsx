import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  Package,
  ShoppingCart,
  Wallet,
  UserCog,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Truck,
  MapPin,
  MessageSquare,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { AuthPanel } from './AuthPanel';
import { formatPKR } from '../services/abstractions';
import type { Product, Order, SellerShop, SellerPrivate, SellerPayout } from '../types/store';

// Seller Center (/seller): marketplace sellers apply, then manage their own products, orders,
// shipping/tracking and earnings. Everything goes through the /api/seller/* server routes.

type Tab = 'DASHBOARD' | 'PRODUCTS' | 'ORDERS' | 'EARNINGS' | 'PROFILE';
type SellerOrder = Order & { commissionAmount: number; commissionPercent: number; sellerEarning: number; payoutId: string | null };

const COURIERS = ['TCS', 'Leopards', 'PostEx', 'Trax', 'M&P', 'Call Courier', 'BlueEx', 'Swyft', 'Daewoo', 'Pakistan Post', 'Other'];
const OPEN_STATUSES = ['PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'];

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Kuch ghalat ho gaya. Dobara try karein.'), { code: data?.code });
  return data as T;
}

const inputCls = 'w-full px-3 py-2 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';

const statusLabel: Record<string, string> = {
  PENDING_CONFIRMATION: 'Naya order',
  PENDING: 'Naya order',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Tayyar ho raha',
  PACKED: 'Packed',
  SHIPPED: 'Bhej diya',
  OUT_FOR_DELIVERY: 'Delivery par',
  DELIVERED: 'Deliver ho gaya',
  CANCELLED: 'Cancelled',
  RETURNED: 'Wapas aaya',
  REFUNDED: 'Refunded',
};

const statusTone = (s: string) =>
  s === 'DELIVERED'
    ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
    : ['CANCELLED', 'RETURNED', 'REFUNDED'].includes(s)
    ? 'bg-rose-100 text-rose-900 border-rose-400'
    : ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(s)
    ? 'bg-sky-100 text-sky-900 border-sky-400'
    : 'bg-amber-100 text-amber-900 border-amber-400';

export const SellerCenterView: React.FC = () => {
  const { firebaseUser, authReady, emailVerified, refreshAccount, resendVerificationEmail, signOut, settings, categories, showToast } =
    useStore();
  const storeName = settings.storeName || 'My Store';

  const [loadingMe, setLoadingMe] = useState(true);
  const [seller, setSeller] = useState<SellerShop | null>(null);
  const [sellerPrivate, setSellerPrivate] = useState<SellerPrivate | null>(null);
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('DASHBOARD');

  const loadMe = useCallback(async () => {
    if (!firebaseUser) {
      setSeller(null);
      setLoadingMe(false);
      return;
    }
    setLoadingMe(true);
    try {
      const data = await api('/api/seller/me');
      setSeller(data.seller);
      setSellerPrivate(data.privateData);
      setCommissionPercent(data.commissionPercent);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setLoadingMe(false);
    }
  }, [firebaseUser, showToast]);

  useEffect(() => {
    if (authReady) loadMe();
  }, [authReady, loadMe]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#FBFBF9] text-[#141413]">
      <header className="sticky top-0 z-30 bg-[#141413] text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-5 h-5 text-[#E5C98A] shrink-0" />
            <span className="font-display text-lg truncate">{storeName}</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#E5C98A] shrink-0">Seller Center</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/" className="text-xs text-white/80 hover:text-white underline hidden sm:inline">
              Store dekhein
            </a>
            {firebaseUser && (
              <button
                type="button"
                onClick={signOut}
                className="px-2.5 py-1.5 border border-white/30 text-xs flex items-center gap-1 cursor-pointer hover:bg-white/10"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );

  if (!authReady || (firebaseUser && loadingMe)) {
    return shell(<div className="p-10 text-center text-sm text-[#575653]">Seller Center khul raha hai...</div>);
  }

  if (!firebaseUser) {
    return shell(
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="space-y-4">
          <h1 className="text-3xl font-display">{storeName} par apni dukaan kholein</h1>
          <p className="text-sm text-[#454441]">
            Apne products laakhon customers tak pohnchayein. Aap products daalein, order aane par khud parcel bhejein, aur
            har delivered order ki kamai apne bank account mein payout ke zariye lein.
          </p>
          <ul className="text-sm space-y-2 text-[#141413]">
            <li>✓ Muft account aur apna Seller Center</li>
            <li>✓ Har sale par sirf commission, koi mahana fees nahi</li>
            <li>✓ Cash on Delivery ka paisa store collect karta hai, aap ko payout milta hai</li>
            <li>✓ Orders, tracking aur kamai sab ek jagah</li>
          </ul>
        </div>
        <div className="bg-white border border-black/10 p-6">
          <AuthPanel
            title="Seller login / naya account"
            subtitle="Pehle account banayein ya login karein, phir seller application bharein."
            allowSignup
          />
        </div>
      </div>
    );
  }

  if (!seller || seller.status === 'REJECTED') {
    return shell(
      <ApplyForm
        storeName={storeName}
        rejectedReason={seller?.status === 'REJECTED' ? seller.statusReason || 'Application qubool nahi hui.' : ''}
        emailVerified={emailVerified}
        onResendVerification={async () => {
          const r = await resendVerificationEmail();
          showToast(r.ok ? 'Verification email bhej di gayi.' : r.message || 'Email nahi gayi.');
        }}
        onRecheck={async () => {
          await refreshAccount();
          await loadMe();
        }}
        defaultName={firebaseUser.displayName || ''}
        onSubmitted={loadMe}
      />
    );
  }

  if (seller.status === 'PENDING') {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-display">Application review mein hai</h1>
        <p className="text-sm text-[#454441]">
          <strong>{seller.shopName}</strong> ki application mil gayi hai. {storeName} ki team check karke approve karegi.
          Approve hote hi aap yahan products daal sakenge.
        </p>
        <button type="button" onClick={loadMe} className="px-4 py-2 border border-black/20 text-xs font-semibold cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Dobara check karein
        </button>
      </div>
    );
  }

  if (seller.status === 'SUSPENDED') {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-2xl font-display">Seller account band hai</h1>
        <p className="text-sm text-[#454441]">{seller.statusReason || `Mazeed maloomat ke liye ${storeName} se rabta karein.`}</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ORDERS', label: 'Orders', icon: ShoppingCart },
    { id: 'PRODUCTS', label: 'Products', icon: Package },
    { id: 'EARNINGS', label: 'Kamai', icon: Wallet },
    { id: 'PROFILE', label: 'Profile', icon: UserCog },
  ];

  return shell(
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-display">{seller.shopName}</h1>
          <p className="text-xs text-[#575653]">
            Commission: {commissionPercent ?? 0}% har sale par · {seller.city}
          </p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-black/10">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap border-b-2 cursor-pointer ${
                tab === t.id ? 'border-[#141413] text-[#141413]' : 'border-transparent text-[#575653] hover:text-[#141413]'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </nav>
      {tab === 'DASHBOARD' && <DashboardTab onGo={setTab} />}
      {tab === 'ORDERS' && <OrdersTab />}
      {tab === 'PRODUCTS' && <ProductsTab categoryNames={categories.map((c) => c.name)} />}
      {tab === 'EARNINGS' && <EarningsTab />}
      {tab === 'PROFILE' && <ProfileTab seller={seller} privateData={sellerPrivate} onSaved={loadMe} />}
    </div>
  );
};

// ------------------------------------------------------------------ apply form

const ApplyForm: React.FC<{
  storeName: string;
  rejectedReason: string;
  emailVerified: boolean;
  defaultName: string;
  onResendVerification: () => void;
  onRecheck: () => void;
  onSubmitted: () => void;
}> = ({ storeName, rejectedReason, emailVerified, defaultName, onResendVerification, onRecheck, onSubmitted }) => {
  const { showToast } = useStore();
  const [form, setForm] = useState({
    shopName: '',
    ownerName: defaultName,
    phone: '',
    city: '',
    cnic: '',
    address: '',
    bankName: '',
    accountTitle: '',
    accountNumber: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-display">Seller application</h1>
        <p className="text-xs text-[#575653]">
          {storeName} par bechne ke liye ye maloomat bharein. CNIC aur bank details sirf store ki team dekhti hai, payout ke liye.
        </p>
      </div>
      {rejectedReason && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs">
          Pichli application qubool nahi hui: <strong>{rejectedReason}</strong>. Maloomat theek karke dobara bhejein.
        </div>
      )}
      {!emailVerified && (
        <div className="p-3 bg-amber-50 border border-amber-400 text-amber-950 text-xs space-y-2">
          <p>Apply karne se pehle apni email verify karein. Inbox (ya spam) mein aaye link par click karein.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onResendVerification} className="px-3 py-1.5 border border-amber-500 font-semibold cursor-pointer">
              Email dobara bhejein
            </button>
            <button type="button" onClick={onRecheck} className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer">
              Maine verify kar li
            </button>
          </div>
        </div>
      )}
      <form
        className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api('/api/seller/apply', { method: 'POST', body: JSON.stringify(form) });
            showToast('Application bhej di gayi. Approval ka intezar karein.');
            onSubmitted();
          } catch (err: any) {
            showToast(err.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div>
          <label className={labelCls}>Dukaan ka naam *</label>
          <input className={inputCls} value={form.shopName} onChange={set('shopName')} placeholder="misal: Ali Electronics" required />
        </div>
        <div>
          <label className={labelCls}>Aap ka poora naam *</label>
          <input className={inputCls} value={form.ownerName} onChange={set('ownerName')} required />
        </div>
        <div>
          <label className={labelCls}>Mobile number *</label>
          <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="03XXXXXXXXX" inputMode="tel" required />
        </div>
        <div>
          <label className={labelCls}>Shehar *</label>
          <input className={inputCls} value={form.city} onChange={set('city')} placeholder="misal: Lahore" required />
        </div>
        <div>
          <label className={labelCls}>CNIC *</label>
          <input className={inputCls} value={form.cnic} onChange={set('cnic')} placeholder="XXXXX-XXXXXXX-X" required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Dukaan / godaam ka pata *</label>
          <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} required />
        </div>
        <div>
          <label className={labelCls}>Bank / wallet *</label>
          <input className={inputCls} value={form.bankName} onChange={set('bankName')} placeholder="misal: MCB, Meezan, NayaPay" required />
        </div>
        <div>
          <label className={labelCls}>Account title *</label>
          <input className={inputCls} value={form.accountTitle} onChange={set('accountTitle')} required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Account number / IBAN *</label>
          <input className={inputCls} value={form.accountNumber} onChange={set('accountNumber')} required />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !emailVerified}
            className="w-full py-2.5 bg-[#141413] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Bhej rahe hain...' : 'Application bhejein'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ------------------------------------------------------------------ dashboard

const DashboardTab: React.FC<{ onGo: (t: Tab) => void }> = ({ onGo }) => {
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  useEffect(() => {
    api('/api/seller/orders').then((d) => setOrders(d.orders)).catch(() => setOrders([]));
    api('/api/seller/earnings').then((d) => setSummary(d.summary)).catch(() => setSummary(null));
  }, []);
  const toShip = (orders || []).filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const onTheWay = (orders || []).filter((o) => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
  const cards = [
    { label: 'Bhejne wale orders', value: orders ? String(toShip) : '…', tab: 'ORDERS' as Tab, strong: toShip > 0 },
    { label: 'Raste mein', value: orders ? String(onTheWay) : '…', tab: 'ORDERS' as Tab },
    { label: 'Payout ke liye tayyar', value: summary ? formatPKR(summary.available) : '…', tab: 'EARNINGS' as Tab },
    { label: 'Ab tak payout', value: summary ? formatPKR(summary.paid) : '…', tab: 'EARNINGS' as Tab },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onGo(c.tab)}
            className={`p-4 text-left border cursor-pointer ${c.strong ? 'bg-amber-50 border-amber-400' : 'bg-white border-black/10'}`}
          >
            <div className="text-[11px] text-[#575653]">{c.label}</div>
            <div className="text-xl font-bold font-mono mt-1">{c.value}</div>
          </button>
        ))}
      </div>
      <div className="p-4 bg-white border border-black/10 text-xs text-[#454441] space-y-1">
        <strong className="block text-[#141413]">Order aane par kya karein</strong>
        <p>1. Customer ko call/WhatsApp karke confirm karein → <strong>Confirm</strong> dabayein.</p>
        <p>2. Maal pack karein → <strong>Packed</strong>.</p>
        <p>3. Courier ko parcel dein, courier aur tracking number daal kar → <strong>Ship</strong>.</p>
        <p>4. Courier deliver kare to → <strong>Delivered</strong>. Isi ke baad kamai payout ke liye tayyar hoti hai.</p>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ orders

const OrdersTab: React.FC = () => {
  const { showToast } = useStore();
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [filter, setFilter] = useState<'OPEN' | 'SHIPPED' | 'DONE' | 'ALL'>('OPEN');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/seller/orders');
      setOrders(d.orders);
    } catch (err: any) {
      showToast(err.message);
      setOrders([]);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const visible = useMemo(() => {
    const list = orders || [];
    if (filter === 'OPEN') return list.filter((o) => OPEN_STATUSES.includes(o.status));
    if (filter === 'SHIPPED') return list.filter((o) => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status));
    if (filter === 'DONE') return list.filter((o) => !OPEN_STATUSES.includes(o.status) && !['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status));
    return list;
  }, [orders, filter]);

  const act = async (o: SellerOrder, body: Record<string, any>, path = '/api/seller/orders/status') => {
    setBusy(o.id);
    try {
      await api(path, { method: 'POST', body: JSON.stringify({ orderId: o.id, ...body }) });
      showToast(`${o.orderNumber}: save ho gaya.`);
      await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['OPEN', 'Bhejne wale'],
            ['SHIPPED', 'Raste mein'],
            ['DONE', 'Mukammal / band'],
            ['ALL', 'Sab'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
              filter === id ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20'
            }`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={load} className="ml-auto px-3 py-1.5 text-xs border border-black/20 bg-white cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
        </button>
      </div>

      {orders === null ? (
        <p className="text-xs text-[#575653]">Orders load ho rahe hain...</p>
      ) : visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-[#575653] text-center">Is list mein koi order nahi.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((o) => (
            <SellerOrderCard key={o.id} order={o} busy={busy === o.id} act={act} />
          ))}
        </div>
      )}
    </div>
  );
};

const SellerOrderCard: React.FC<{
  order: SellerOrder;
  busy: boolean;
  act: (o: SellerOrder, body: Record<string, any>, path?: string) => Promise<void>;
}> = ({ order: o, busy, act }) => {
  const [courier, setCourier] = useState(o.courierName || 'TCS');
  const [tracking, setTracking] = useState(o.trackingNumber || '');
  const closed = ['CANCELLED', 'RETURNED', 'REFUNDED', 'DELIVERED'].includes(o.status);
  const shipped = ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status);
  const btn = 'px-2.5 py-1.5 text-[11px] font-semibold border cursor-pointer disabled:opacity-50';

  return (
    <div className="bg-white border border-black/10 p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{o.orderNumber}</span>
          <span className={`px-2 py-0.5 border text-[10px] font-bold ${statusTone(o.status)}`}>{statusLabel[o.status] || o.status}</span>
        </div>
        <span className="text-[#575653]">{new Date(o.createdAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="font-bold text-[#141413]">Customer</div>
          <div>{o.customerName}</div>
          <div className="font-mono">{o.customerPhone}</div>
          <div className="text-[#454441]">{o.shippingAddressSummary}</div>
        </div>
        <div>
          <div className="font-bold text-[#141413]">Saman</div>
          {(o.items || []).map((it, i) => (
            <div key={i}>
              {it.quantity} × {it.name}
            </div>
          ))}
        </div>
        <div>
          <div className="font-bold text-[#141413]">Raqam</div>
          <div>
            Customer dega: <strong>{formatPKR(o.total)}</strong> ({o.paymentMethod === 'COD' ? 'COD' : o.paymentMethod})
          </div>
          <div>Commission ({o.commissionPercent}%): {formatPKR(o.commissionAmount)}</div>
          <div className="text-emerald-800 font-bold">Aap ki kamai: {formatPKR(o.sellerEarning)}</div>
          {o.payoutId && <div className="text-emerald-800">✓ Payout ho gaya</div>}
        </div>
      </div>

      {!closed && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/10">
          {['PENDING_CONFIRMATION', 'PENDING'].includes(o.status) && (
            <button type="button" disabled={busy} onClick={() => act(o, { status: 'CONFIRMED' })} className={`${btn} bg-emerald-700 text-white border-emerald-700`}>
              ✓ Confirm
            </button>
          )}
          {['CONFIRMED', 'PROCESSING'].includes(o.status) && (
            <button type="button" disabled={busy} onClick={() => act(o, { status: 'PACKED' })} className={`${btn} bg-white border-black/30`}>
              📦 Packed
            </button>
          )}
          {!shipped && (
            <span className="flex flex-wrap items-center gap-1">
              <select value={courier} onChange={(e) => setCourier(e.target.value)} className="px-2 py-1.5 border border-black/20 bg-white">
                {COURIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Courier tracking #"
                className="w-36 px-2 py-1.5 border border-black/20 font-mono"
              />
              <button
                type="button"
                disabled={busy || tracking.trim().length < 4}
                onClick={() => act(o, { status: 'SHIPPED', courierName: courier, trackingNumber: tracking.trim() })}
                className={`${btn} bg-sky-700 text-white border-sky-700`}
              >
                <Truck className="w-3.5 h-3.5 inline mr-1" /> Ship
              </button>
            </span>
          )}
          {o.status === 'SHIPPED' && (
            <button type="button" disabled={busy} onClick={() => act(o, { status: 'OUT_FOR_DELIVERY' })} className={`${btn} bg-white border-sky-600 text-sky-900`}>
              🛵 Out for delivery
            </button>
          )}
          {shipped && (
            <button type="button" disabled={busy} onClick={() => act(o, { status: 'DELIVERED' })} className={`${btn} bg-emerald-700 text-white border-emerald-700`}>
              ✓ Delivered
            </button>
          )}
          {shipped && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const location = window.prompt('Parcel abhi kahan hai? (misal: "Lahore hub")');
                if (location && location.trim()) act(o, { location: location.trim() }, '/api/seller/orders/event');
              }}
              className={`${btn} bg-white border-black/30`}
            >
              <MapPin className="w-3.5 h-3.5 inline mr-1" /> Location
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const note = window.prompt('Customer ko kya message bhejna hai?');
              if (note && note.trim()) act(o, { note: note.trim() }, '/api/seller/orders/event');
            }}
            className={`${btn} bg-white border-black/30`}
          >
            <MessageSquare className="w-3.5 h-3.5 inline mr-1" /> Message
          </button>
          {!shipped && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(`Order ${o.orderNumber} cancel karne ki wajah? (stock wapas aa jayega)`);
                if (reason !== null) act(o, { status: 'CANCELLED', reason: reason.trim() });
              }}
              className={`${btn} bg-white border-rose-500 text-rose-800 ml-auto`}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {o.trackingNumber && (
        <div className="text-[11px] text-[#454441]">
          {o.courierName}: <span className="font-mono">{o.trackingNumber}</span>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ products

const emptyProduct = {
  id: '',
  name: '',
  price: '',
  compareAtPrice: '',
  stock: '10',
  category: '',
  primaryImage: '',
  shortDescription: '',
  description: '',
  weightKg: '0.5',
  status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
};

const ProductsTab: React.FC<{ categoryNames: string[] }> = ({ categoryNames }) => {
  const { showToast } = useStore();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<typeof emptyProduct | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/seller/products');
      setProducts(d.products);
    } catch (err: any) {
      showToast(err.message);
      setProducts([]);
    }
  }, [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          ...editing,
          price: Number(editing.price),
          compareAtPrice: Number(editing.compareAtPrice) || 0,
          stock: Number(editing.stock),
          weightKg: Number(editing.weightKg),
        }),
      });
      showToast(editing.status === 'ACTIVE' ? 'Product save ho gaya aur store par live hai.' : 'Draft save ho gaya.');
      setEditing(null);
      await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof emptyProduct) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditing((p) => (p ? { ...p, [k]: e.target.value } : p));

  if (editing) {
    return (
      <div className="bg-white border border-black/10 p-5 space-y-4">
        <h2 className="text-lg font-display">{editing.id ? 'Product edit karein' : 'Naya product'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Naam *</label>
            <input className={inputCls} value={editing.name} onChange={set('name')} />
          </div>
          <div>
            <label className={labelCls}>Qeemat (PKR) *</label>
            <input className={inputCls} value={editing.price} onChange={set('price')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Purani qeemat (kat-ti hui, optional)</label>
            <input className={inputCls} value={editing.compareAtPrice} onChange={set('compareAtPrice')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Stock *</label>
            <input className={inputCls} value={editing.stock} onChange={set('stock')} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>Category *</label>
            <input className={inputCls} value={editing.category} onChange={set('category')} list="seller-categories" placeholder="Chunein ya likhein" />
            <datalist id="seller-categories">
              {categoryNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Tasveer ka link (https://...)</label>
            <input className={inputCls} value={editing.primaryImage} onChange={set('primaryImage')} placeholder="https://..." />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Mukhtasar tafseel</label>
            <input className={inputCls} value={editing.shortDescription} onChange={set('shortDescription')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Poori tafseel</label>
            <textarea className={inputCls} rows={4} value={editing.description} onChange={set('description')} />
          </div>
          <div>
            <label className={labelCls}>Wazan (kg)</label>
            <input className={inputCls} value={editing.weightKg} onChange={set('weightKg')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={editing.status} onChange={set('status')}>
              <option value="ACTIVE">Live (store par dikhe)</option>
              <option value="DRAFT">Draft (chhupa hua)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={save} className="px-5 py-2 bg-[#141413] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
            {saving ? 'Save ho raha...' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="px-5 py-2 border border-black/20 text-xs cursor-pointer">
            Wapas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#575653]">{products ? `${products.length} products` : 'Load ho rahe hain...'}</span>
        <button
          type="button"
          onClick={() => setEditing({ ...emptyProduct })}
          className="px-4 py-2 bg-[#141413] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Naya product
        </button>
      </div>
      {products && products.length === 0 && (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">Abhi koi product nahi. "Naya product" se shuru karein.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(products || []).map((p) => (
          <div key={p.id} className="bg-white border border-black/10 p-3 flex gap-3 text-xs">
            <div className="w-20 h-20 bg-[#F4F3EF] shrink-0 overflow-hidden">
              {p.primaryImage ? <img src={p.primaryImage} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-bold truncate">{p.name}</div>
              <div>
                {formatPKR(p.price)} · Stock {p.stock}
              </div>
              <span
                className={`inline-block px-1.5 py-0.5 border text-[10px] font-bold ${
                  p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-900 border-emerald-400' : 'bg-slate-100 text-slate-900 border-slate-400'
                }`}
              >
                {p.status === 'ACTIVE' ? 'Live' : p.status === 'DRAFT' ? 'Draft' : 'Archived'}
              </span>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      name: p.name,
                      price: String(p.price),
                      compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : '',
                      stock: String(p.stock),
                      category: p.category,
                      primaryImage: p.primaryImage || '',
                      shortDescription: p.shortDescription || '',
                      description: p.description || '',
                      weightKg: String(p.weightKg || 0.5),
                      status: p.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
                    })
                  }
                  className="px-2 py-1 border border-black/30 font-semibold cursor-pointer"
                >
                  Edit
                </button>
                {p.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`"${p.name}" store se hata dein?`)) return;
                      try {
                        await api(`/api/seller/products/${encodeURIComponent(p.id)}/archive`, { method: 'POST' });
                        await load();
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                    className="px-2 py-1 border border-rose-400 text-rose-800 font-semibold cursor-pointer"
                  >
                    Hatayein
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ earnings

const EarningsTab: React.FC = () => {
  const { showToast } = useStore();
  const [data, setData] = useState<{ summary: any; commissionPercent: number; payouts: SellerPayout[] } | null>(null);
  useEffect(() => {
    api('/api/seller/earnings')
      .then(setData)
      .catch((err) => showToast(err.message));
  }, [showToast]);
  if (!data) return <p className="text-xs text-[#575653]">Load ho raha hai...</p>;
  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Payout ke liye tayyar', s.available, 'Delivered orders, payout baqi'],
          ['Aane wali kamai', s.pending, 'Orders jo abhi deliver nahi hue'],
          ['Ab tak mila', s.paid, 'Bank mein bheja ja chuka'],
          ['Store commission', s.commission, `${data.commissionPercent}% har sale par`],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="p-4 bg-white border border-black/10">
            <div className="text-[11px] text-[#575653]">{label}</div>
            <div className="text-xl font-bold font-mono mt-1">{formatPKR(Number(value))}</div>
            <div className="text-[10px] text-[#575653] mt-1">{hint}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#454441]">
        Customer ka COD ka paisa store collect karta hai. Order deliver hone ke baad aap ki kamai (raqam − commission + shipping)
        "payout ke liye tayyar" mein aa jati hai, aur store aap ke bank account mein bhej deta hai.
      </p>
      <div className="bg-white border border-black/10">
        <div className="px-4 py-2 border-b border-black/10 text-xs font-bold">Payouts</div>
        {data.payouts.length === 0 ? (
          <p className="p-4 text-xs text-[#575653]">Abhi koi payout nahi hua.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06] text-xs">
            {data.payouts.map((p) => (
              <li key={p.id} className="px-4 py-2 flex flex-wrap justify-between gap-2">
                <span>{new Date(p.paidAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="font-mono font-bold">{formatPKR(p.amount)}</span>
                <span className="text-[#575653]">
                  {p.orderIds.length} orders · Ref {p.reference}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ profile

const ProfileTab: React.FC<{ seller: SellerShop; privateData: SellerPrivate | null; onSaved: () => void }> = ({
  seller,
  privateData,
  onSaved,
}) => {
  const { showToast } = useStore();
  const [form, setForm] = useState({
    phone: seller.phone || '',
    city: seller.city || '',
    address: privateData?.address || '',
    bankName: privateData?.bankName || '',
    accountTitle: privateData?.accountTitle || '',
    accountNumber: privateData?.accountNumber || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify(form) });
          showToast('Profile save ho gaya.');
          onSaved();
        } catch (err: any) {
          showToast(err.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="sm:col-span-2 text-xs text-[#575653]">
        Dukaan: <strong className="text-[#141413]">{seller.shopName}</strong> · {seller.ownerEmail}
        <span className="block">Dukaan ka naam badalne ke liye store se rabta karein.</span>
      </div>
      <div>
        <label className={labelCls}>Mobile</label>
        <input className={inputCls} value={form.phone} onChange={set('phone')} />
      </div>
      <div>
        <label className={labelCls}>Shehar</label>
        <input className={inputCls} value={form.city} onChange={set('city')} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Pata</label>
        <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} />
      </div>
      <div>
        <label className={labelCls}>Bank / wallet</label>
        <input className={inputCls} value={form.bankName} onChange={set('bankName')} />
      </div>
      <div>
        <label className={labelCls}>Account title</label>
        <input className={inputCls} value={form.accountTitle} onChange={set('accountTitle')} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Account number / IBAN (payout isi par aayega)</label>
        <input className={inputCls} value={form.accountNumber} onChange={set('accountNumber')} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-[#141413] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
          {saving ? 'Save ho raha...' : 'Save'}
        </button>
      </div>
    </form>
  );
};
