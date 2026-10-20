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
  Upload,
  Download,
  Camera,
  Search,
} from 'lucide-react';
import { SELLER_CSV_TEMPLATE, parseSellerCsv, type SellerCsvRow } from '../services/sellerCsv';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { AuthPanel } from './AuthPanel';
import { PWAInstallButton } from './PWAInstallButton';
import { SellerAvatar } from './SellerAvatar';
import { formatPKR } from '../services/abstractions';
import type { Product, Order, SellerShop, SellerPrivate, SellerPayout } from '../types/store';

// Seller Center (/seller): marketplace sellers apply, then manage their own products, orders,
// shipping/tracking and earnings. Everything goes through the /api/seller/* server routes.
//
// It opens instantly: the shop and product list from the last visit are shown at once (Firebase can
// take many seconds to restore a sign-in) and refreshed in the background.

type Tab = 'DASHBOARD' | 'PRODUCTS' | 'ORDERS' | 'EARNINGS' | 'PROFILE';
type SupplierItem = { productId: string; supplierName?: string; supplierSku?: string; supplierProductUrl?: string; supplierCostPrice?: number };
type SellerOrder = Order & {
  commissionAmount: number;
  commissionPercent: number;
  sellerEarning: number;
  payoutId: string | null;
  supplierItems?: SupplierItem[];
  supplierCost?: number;
};
type ListProduct = Pick<Product, 'id' | 'sku' | 'name' | 'price' | 'stock' | 'category' | 'status' | 'primaryImage'> & {
  compareAtPrice?: number;
  adminHidden?: boolean;
  adminHiddenReason?: string;
  createdAt?: string;
  updatedAt?: string;
};

// wa.me link with a ready message (Pakistani 03xx numbers become 923xx)
const whatsAppLink = (phone: string | undefined, text: string) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

const COURIERS = ['TCS', 'Leopards', 'PostEx', 'Trax', 'M&P', 'Call Courier', 'BlueEx', 'Swyft', 'Daewoo', 'Pakistan Post', 'Other'];
const OPEN_STATUSES = ['PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'];
const PAGE_SIZE = 40;

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  // Wait until Firebase has restored the saved sign-in, so the request carries the seller's token
  await auth.authStateReady();
  if (!auth.currentUser) throw Object.assign(new Error('Please sign in again.'), { code: 'SIGNED_OUT' });
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { code: data?.code });
  return data as T;
}

// ------------------------------------------------------------------ local cache (this device only)

const ME_CACHE_KEY = 'seller_me_cache_v1';
const PRODUCTS_CACHE_KEY = 'seller_products_cache_v1';

function readCache<T>(key: string, uid: string | undefined): T | null {
  if (!uid) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && parsed.uid === uid ? (parsed.data as T) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, uid: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ uid, data }));
  } catch {}
}
function clearSellerCache() {
  try {
    localStorage.removeItem(ME_CACHE_KEY);
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch {}
}

// Orders and earnings stay in memory while the app is open, so switching tabs is instant
const memo: { orders?: SellerOrder[]; earnings?: { summary: any; commissionPercent: number; payouts: SellerPayout[] } } = {};

const inputCls = 'w-full px-3 py-2 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';

const statusLabel: Record<string, string> = {
  PENDING_CONFIRMATION: 'New order',
  PENDING: 'New order',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
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
  const {
    firebaseUser,
    userProfile,
    authReady,
    emailVerified,
    refreshAccount,
    resendVerificationEmail,
    signOut,
    settings,
    categories,
    showToast,
  } = useStore();
  const storeName = settings.storeName || 'My Store';
  // The signed-in user, or the one remembered from the last visit while Firebase restores the sign-in
  const uid = firebaseUser?.uid || userProfile?.uid;

  type Me = { seller: SellerShop | null; commissionPercent: number | null };
  const cachedMe = readCache<Me>(ME_CACHE_KEY, uid);
  const [seller, setSeller] = useState<SellerShop | null>(cachedMe?.seller || null);
  const [commissionPercent, setCommissionPercent] = useState<number | null>(cachedMe?.commissionPercent ?? null);
  const [sellerPrivate, setSellerPrivate] = useState<SellerPrivate | null>(null);
  const [loadingMe, setLoadingMe] = useState(!cachedMe);
  const [tab, setTab] = useState<Tab>('DASHBOARD');

  const loadMe = useCallback(async () => {
    if (!uid) {
      setSeller(null);
      setLoadingMe(false);
      return;
    }
    try {
      const data = await api('/api/seller/me');
      setSeller(data.seller);
      setSellerPrivate(data.privateData);
      setCommissionPercent(data.commissionPercent);
      writeCache(ME_CACHE_KEY, uid, { seller: data.seller, commissionPercent: data.commissionPercent });
    } catch (err: any) {
      if (err.code === 'SIGNED_OUT') {
        setSeller(null);
        clearSellerCache();
      } else {
        showToast(err.message);
      }
    } finally {
      setLoadingMe(false);
    }
  }, [uid, showToast]);

  useEffect(() => {
    if (authReady) loadMe();
  }, [authReady, loadMe]);

  const handleSignOut = async () => {
    clearSellerCache();
    delete memo.orders;
    delete memo.earnings;
    await signOut();
  };

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
              View store
            </a>
            <PWAInstallButton variant="onDark" />
            {uid && (
              <button
                type="button"
                onClick={handleSignOut}
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

  if (!authReady || (uid && loadingMe && !seller)) {
    return shell(<div className="p-10 text-center text-sm text-[#575653]">Opening Seller Center...</div>);
  }

  if (!uid) {
    return shell(
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="space-y-4">
          <h1 className="text-3xl font-display">Open your shop on {storeName}</h1>
          <p className="text-sm text-[#454441]">
            Reach thousands of customers with your products. You list your products, ship the parcel when an order comes
            in, and receive your earnings for every delivered order in your bank account.
          </p>
          <ul className="text-sm space-y-2 text-[#141413]">
            <li>✓ Free account and your own Seller Center</li>
            <li>✓ Only a commission per sale, no monthly fees</li>
            <li>✓ The store collects Cash on Delivery payments and pays you out</li>
            <li>✓ Orders, tracking and earnings in one place</li>
          </ul>
        </div>
        <div className="bg-white border border-black/10 p-6">
          <AuthPanel
            title="Seller login / new account"
            subtitle="Create an account or sign in, then fill in the seller application."
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
        rejectedReason={seller?.status === 'REJECTED' ? seller.statusReason || 'Your application was not accepted.' : ''}
        emailVerified={emailVerified}
        onResendVerification={async () => {
          const r = await resendVerificationEmail();
          showToast(r.ok ? 'Verification email sent.' : r.message || 'Could not send the email.');
        }}
        onRecheck={async () => {
          await refreshAccount();
          await loadMe();
        }}
        defaultName={firebaseUser?.displayName || userProfile?.name || ''}
        onSubmitted={loadMe}
      />
    );
  }

  if (seller.status === 'PENDING') {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-display">Your application is under review</h1>
        <p className="text-sm text-[#454441]">
          We have received the application for <strong>{seller.shopName}</strong>. The {storeName} team will review and
          approve it. Once approved you can start adding products here.
        </p>
        <button type="button" onClick={loadMe} className="px-4 py-2 border border-black/20 text-xs font-semibold cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Check again
        </button>
      </div>
    );
  }

  if (seller.status === 'SUSPENDED') {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-2xl font-display">Your seller account is suspended</h1>
        <p className="text-sm text-[#454441]">{seller.statusReason || `Please contact ${storeName} for more information.`}</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ORDERS', label: 'Orders', icon: ShoppingCart },
    { id: 'PRODUCTS', label: 'Products', icon: Package },
    { id: 'EARNINGS', label: 'Earnings', icon: Wallet },
    { id: 'PROFILE', label: 'Profile', icon: UserCog },
  ];

  return shell(
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setTab('PROFILE')} title="Profile picture" className="cursor-pointer">
          <SellerAvatar src={seller.logoUrl || firebaseUser?.photoURL} name={seller.shopName} size={52} className="border border-black/10" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-display truncate">{seller.shopName}</h1>
          <p className="text-xs text-[#575653]">
            Commission: {commissionPercent ?? 0}% per sale · {seller.city}
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
      {tab === 'PRODUCTS' && <ProductsTab uid={uid} categoryNames={categories.map((c) => c.name)} />}
      {tab === 'EARNINGS' && <EarningsTab />}
      {tab === 'PROFILE' &&
        (sellerPrivate ? (
          <ProfileTab seller={seller} privateData={sellerPrivate} onSaved={loadMe} />
        ) : (
          <p className="text-xs text-[#575653]">Loading your profile...</p>
        ))}
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
          Fill in these details to sell on {storeName}. Your CNIC and bank details are only visible to the store team, for
          payouts.
        </p>
      </div>
      {rejectedReason && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs">
          Your previous application was not accepted: <strong>{rejectedReason}</strong>. Please correct the details and
          apply again.
        </div>
      )}
      {!emailVerified && (
        <div className="p-3 bg-amber-50 border border-amber-400 text-amber-950 text-xs space-y-2">
          <p>Please verify your email before applying. Click the link we sent to your inbox (or spam folder).</p>
          <div className="flex gap-2">
            <button type="button" onClick={onResendVerification} className="px-3 py-1.5 border border-amber-500 font-semibold cursor-pointer">
              Resend email
            </button>
            <button type="button" onClick={onRecheck} className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer">
              I have verified it
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
            showToast('Application sent. Please wait for approval.');
            onSubmitted();
          } catch (err: any) {
            showToast(err.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div>
          <label className={labelCls}>Shop name *</label>
          <input className={inputCls} value={form.shopName} onChange={set('shopName')} placeholder="e.g. Ali Electronics" required />
        </div>
        <div>
          <label className={labelCls}>Your full name *</label>
          <input className={inputCls} value={form.ownerName} onChange={set('ownerName')} required />
        </div>
        <div>
          <label className={labelCls}>Mobile number *</label>
          <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="03XXXXXXXXX" inputMode="tel" required />
        </div>
        <div>
          <label className={labelCls}>City *</label>
          <input className={inputCls} value={form.city} onChange={set('city')} placeholder="e.g. Lahore" required />
        </div>
        <div>
          <label className={labelCls}>CNIC *</label>
          <input className={inputCls} value={form.cnic} onChange={set('cnic')} placeholder="XXXXX-XXXXXXX-X" required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Shop / warehouse address *</label>
          <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} required />
        </div>
        <div>
          <label className={labelCls}>Bank / wallet *</label>
          <input className={inputCls} value={form.bankName} onChange={set('bankName')} placeholder="e.g. MCB, Meezan, NayaPay" required />
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
            {saving ? 'Sending...' : 'Send application'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ------------------------------------------------------------------ dashboard

const DashboardTab: React.FC<{ onGo: (t: Tab) => void }> = ({ onGo }) => {
  const [orders, setOrders] = useState<SellerOrder[] | null>(memo.orders || null);
  const [summary, setSummary] = useState<any>(memo.earnings?.summary || null);
  useEffect(() => {
    api('/api/seller/orders')
      .then((d) => {
        memo.orders = d.orders;
        setOrders(d.orders);
      })
      .catch(() => setOrders((o) => o || []));
    api('/api/seller/earnings')
      .then((d) => {
        memo.earnings = d;
        setSummary(d.summary);
      })
      .catch(() => {});
  }, []);
  const toShip = (orders || []).filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const onTheWay = (orders || []).filter((o) => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
  const cards = [
    { label: 'Orders to ship', value: orders ? String(toShip) : '…', tab: 'ORDERS' as Tab, strong: toShip > 0 },
    { label: 'On the way', value: orders ? String(onTheWay) : '…', tab: 'ORDERS' as Tab },
    { label: 'Ready for payout', value: summary ? formatPKR(summary.available) : '…', tab: 'EARNINGS' as Tab },
    { label: 'Paid out so far', value: summary ? formatPKR(summary.paid) : '…', tab: 'EARNINGS' as Tab },
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
        <strong className="block text-[#141413]">When an order comes in</strong>
        <p>1. Call / WhatsApp the customer to confirm, then press <strong>Confirm</strong>.</p>
        <p>2. Pack the item, then press <strong>Packed</strong>.</p>
        <p>3. Hand the parcel to the courier, enter the courier and tracking number, then press <strong>Ship</strong>.</p>
        <p>4. When the courier delivers it, press <strong>Delivered</strong>. Your earning then becomes ready for payout.</p>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ orders

const OrdersTab: React.FC = () => {
  const { showToast } = useStore();
  const [orders, setOrders] = useState<SellerOrder[] | null>(memo.orders || null);
  const [filter, setFilter] = useState<'OPEN' | 'SHIPPED' | 'DONE' | 'ALL'>('OPEN');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/seller/orders');
      memo.orders = d.orders;
      setOrders(d.orders);
    } catch (err: any) {
      showToast(err.message);
      setOrders((o) => o || []);
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
      showToast(`${o.orderNumber}: saved.`);
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
            ['OPEN', 'To ship'],
            ['SHIPPED', 'On the way'],
            ['DONE', 'Completed / closed'],
            ['ALL', 'All'],
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
        <p className="text-xs text-[#575653]">Loading orders...</p>
      ) : visible.length === 0 ? (
        <p className="p-6 bg-white border border-black/10 text-xs text-[#575653] text-center">No orders in this list.</p>
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
  const { settings, showToast } = useStore();
  const [courier, setCourier] = useState(o.courierName || 'TCS');
  const [tracking, setTracking] = useState(o.trackingNumber || '');
  const closed = ['CANCELLED', 'RETURNED', 'REFUNDED', 'DELIVERED'].includes(o.status);
  const shipped = ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status);
  const btn = 'px-2.5 py-1.5 text-[11px] font-semibold border cursor-pointer disabled:opacity-50';
  const storeName = settings.storeName || 'our store';
  const supplierFor = (productId: string) => (o.supplierItems || []).find((s) => s.productId === productId);
  const hasSupplier = (o.items || []).some((it) => {
    const s = supplierFor(it.productId);
    return s && (s.supplierName || s.supplierProductUrl || s.supplierSku);
  });
  const profit = (Number(o.sellerEarning) || 0) - (Number(o.supplierCost) || 0);

  const confirmText =
    `Hello ${o.customerName}!\n\n` +
    `We have received your order #${o.orderNumber} at ${storeName}:\n` +
    (o.items || []).map((i) => `• ${i.name} x${i.quantity}`).join('\n') +
    `\n\nTotal: ${formatPKR(o.total)} (${o.paymentMethod === 'COD' ? 'Cash on Delivery' : o.paymentMethod})\n` +
    `Address: ${o.shippingAddressSummary || ''}\n\nPlease reply "YES" to confirm your order. Thank you!`;

  // Text to paste into the supplier's portal / WhatsApp when forwarding a dropshipping order
  const supplierText =
    `Order ${o.orderNumber}\n` +
    (o.items || [])
      .map((i) => {
        const s = supplierFor(i.productId);
        return `• ${i.name} x${i.quantity}${s?.supplierSku ? ` (SKU ${s.supplierSku})` : ''}${s?.supplierProductUrl ? `\n  ${s.supplierProductUrl}` : ''}`;
      })
      .join('\n') +
    `\n\nDeliver to: ${o.customerName}, ${o.customerPhone}\n${o.shippingAddressSummary || ''}\n` +
    (o.paymentMethod === 'COD' ? `Collect cash on delivery: ${formatPKR(o.total)}\n` : 'Prepaid, do not collect cash\n');

  const copySupplierText = async () => {
    try {
      await navigator.clipboard.writeText(supplierText);
      showToast('Order details copied. Paste them into the supplier portal.');
    } catch {
      window.prompt('Copy these order details for the supplier:', supplierText);
    }
  };

  return (
    <div className="bg-white border border-black/10 p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{o.orderNumber}</span>
          <span className={`px-2 py-0.5 border text-[10px] font-bold ${statusTone(o.status)}`}>{statusLabel[o.status] || o.status}</span>
        </div>
        <span className="text-[#575653]">
          {new Date(o.createdAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="font-bold text-[#141413]">Customer</div>
          <div>{o.customerName}</div>
          <div className="font-mono">{o.customerPhone}</div>
          <div className="text-[#454441]">{o.shippingAddressSummary}</div>
        </div>
        <div>
          <div className="font-bold text-[#141413]">Items</div>
          {(o.items || []).map((it, i) => (
            <div key={i}>
              {it.quantity} × {it.name}
            </div>
          ))}
        </div>
        <div>
          <div className="font-bold text-[#141413]">Amount</div>
          <div>
            Customer pays: <strong>{formatPKR(o.total)}</strong> ({o.paymentMethod === 'COD' ? 'COD' : o.paymentMethod})
          </div>
          <div>
            Commission ({o.commissionPercent}%): {formatPKR(o.commissionAmount)}
          </div>
          <div className="text-emerald-800 font-bold">Your earning: {formatPKR(o.sellerEarning)}</div>
          {Number(o.supplierCost) > 0 && (
            <>
              <div>Supplier cost: {formatPKR(Number(o.supplierCost))}</div>
              <div className={`font-bold ${profit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>Profit: {formatPKR(profit)}</div>
            </>
          )}
          {o.payoutId && <div className="text-emerald-800">✓ {o.payoutId === 'OWN_SHOP' ? 'Settled' : 'Paid out'}</div>}
        </div>
      </div>

      {hasSupplier && !closed && !shipped && (
        <div className="p-3 bg-violet-50 border border-violet-300 space-y-2">
          <div className="font-bold text-violet-950">Supplier (dropshipping)</div>
          {(o.items || []).map((it, i) => {
            const s = supplierFor(it.productId);
            if (!s) return null;
            return (
              <div key={i} className="text-[#141413]">
                {it.quantity} × {it.name} — {s.supplierName || 'Supplier'}
                {s.supplierSku ? ` · SKU ${s.supplierSku}` : ''}
                {Number(s.supplierCostPrice) > 0 ? ` · cost ${formatPKR(Number(s.supplierCostPrice))}` : ''}
                {s.supplierProductUrl && (
                  <a href={s.supplierProductUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-violet-900">
                    Open supplier page
                  </a>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copySupplierText} className={`${btn} bg-white border-violet-500 text-violet-950`}>
              Copy order for supplier
            </button>
            {o.status === 'CONFIRMED' && (
              <button type="button" disabled={busy} onClick={() => act(o, { status: 'PROCESSING' })} className={`${btn} bg-violet-700 text-white border-violet-700`}>
                ✓ Sent to supplier
              </button>
            )}
          </div>
        </div>
      )}

      {!closed && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/10">
          {['PENDING_CONFIRMATION', 'PENDING'].includes(o.status) && (
            <>
              <a
                href={whatsAppLink(o.customerPhone, confirmText)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-[#128C4A] text-white border-[#128C4A]`}
              >
                Confirm on WhatsApp
              </a>
              <button type="button" disabled={busy} onClick={() => act(o, { status: 'CONFIRMED' })} className={`${btn} bg-emerald-700 text-white border-emerald-700`}>
                ✓ Confirm
              </button>
            </>
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
          {shipped && o.trackingNumber && (
            <a
              href={whatsAppLink(
                o.customerPhone,
                `Hello ${o.customerName}!\n\nYour order #${o.orderNumber} has been handed to ${o.courierName || 'the courier'}.\n` +
                  `Tracking number: ${o.trackingNumber}\n` +
                  (o.paymentMethod === 'COD' ? `Please pay ${formatPKR(o.total)} on delivery.\n` : '') +
                  `Thank you! ${storeName}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} bg-white border-[#128C4A] text-[#0B5C30]`}
            >
              Send tracking on WhatsApp
            </a>
          )}
          {shipped && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const location = window.prompt('Where is the parcel now? (e.g. "Lahore hub")');
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
              const note = window.prompt('Message to the customer:');
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
                const reason = window.prompt(`Reason for cancelling order ${o.orderNumber}? (the stock will be restored)`);
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
  supplierName: '',
  supplierCostPrice: '',
  supplierProductUrl: '',
  supplierSku: '',
  adminHiddenReason: '',
};

type ProductFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'OUT' | 'ARCHIVED';

const ProductsTab: React.FC<{ uid: string; categoryNames: string[] }> = ({ uid, categoryNames }) => {
  const { showToast } = useStore();
  const [products, setProducts] = useState<ListProduct[] | null>(() => readCache<ListProduct[]>(PRODUCTS_CACHE_KEY, uid));
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<typeof emptyProduct | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('ALL');
  const [shown, setShown] = useState(PAGE_SIZE);

  const applyList = useCallback(
    (list: ListProduct[]) => {
      setProducts(list);
      writeCache(PRODUCTS_CACHE_KEY, uid, list);
    },
    [uid]
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await api('/api/seller/products');
      applyList(d.products);
    } catch (err: any) {
      showToast(err.message);
      setProducts((p) => p || []);
    } finally {
      setRefreshing(false);
    }
  }, [applyList, showToast]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setShown(PAGE_SIZE), [search, filter]);

  const counts = useMemo(() => {
    const list = products || [];
    return {
      ALL: list.filter((p) => p.status !== 'ARCHIVED').length,
      ACTIVE: list.filter((p) => p.status === 'ACTIVE').length,
      DRAFT: list.filter((p) => p.status === 'DRAFT').length,
      OUT: list.filter((p) => p.status !== 'ARCHIVED' && Number(p.stock) <= 0).length,
      ARCHIVED: list.filter((p) => p.status === 'ARCHIVED').length,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (filter === 'ALL' && p.status === 'ARCHIVED') return false;
      if (filter === 'ACTIVE' && p.status !== 'ACTIVE') return false;
      if (filter === 'DRAFT' && p.status !== 'DRAFT') return false;
      if (filter === 'OUT' && (p.status === 'ARCHIVED' || Number(p.stock) > 0)) return false;
      if (filter === 'ARCHIVED' && p.status !== 'ARCHIVED') return false;
      return !q || [p.name, p.sku, p.category].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [products, search, filter]);

  const openEditor = async (p: ListProduct) => {
    setOpening(p.id);
    try {
      const { product: full, supplier } = await api(`/api/seller/products/${encodeURIComponent(p.id)}`);
      setEditing({
        supplierName: supplier?.supplierName || '',
        supplierCostPrice: supplier?.supplierCostPrice ? String(supplier.supplierCostPrice) : '',
        supplierProductUrl: supplier?.supplierProductUrl || '',
        supplierSku: supplier?.supplierSku || '',
        adminHiddenReason: full.adminHidden ? full.adminHiddenReason || 'Hidden by the store' : '',
        id: full.id,
        name: full.name,
        price: String(full.price),
        compareAtPrice: full.compareAtPrice ? String(full.compareAtPrice) : '',
        stock: String(full.stock),
        category: full.category,
        primaryImage: full.primaryImage || '',
        shortDescription: full.shortDescription || '',
        description: full.description || '',
        weightKg: String(full.weightKg || 0.5),
        status: full.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
      });
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setOpening(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { product } = await api('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          ...editing,
          price: Number(editing.price),
          compareAtPrice: Number(editing.compareAtPrice) || 0,
          stock: Number(editing.stock),
          weightKg: Number(editing.weightKg),
          supplierCostPrice: Number(editing.supplierCostPrice) || 0,
        }),
      });
      showToast(
        product.adminHidden
          ? 'Saved. The store has hidden this product, so it stays hidden until the store restores it.'
          : editing.status === 'ACTIVE'
          ? 'Product saved and live in the store.'
          : 'Draft saved.'
      );
      setEditing(null);
      const rest = (products || []).filter((p) => p.id !== product.id);
      applyList([product, ...rest]);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Copies the pictures in batches of 150 until all are stored
  const archiveImages = async () => {
    setArchiving(true);
    try {
      let total = 0;
      for (let round = 0; round < 40; round++) {
        const r = await api('/api/seller/media/archive', { method: 'POST' });
        total += r.archived || 0;
        if (!r.remaining || !r.archived) break;
        showToast(`${total} images saved, ${r.remaining} to go...`);
      }
      showToast(total ? `${total} images saved to the store.` : 'All images are already saved.');
      if (total) await load();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setArchiving(false);
    }
  };

  const archive = async (p: ListProduct) => {
    if (!window.confirm(`Remove "${p.name}" from the store?`)) return;
    try {
      await api(`/api/seller/products/${encodeURIComponent(p.id)}/archive`, { method: 'POST' });
      applyList((products || []).map((x) => (x.id === p.id ? { ...x, status: 'ARCHIVED' } : x)));
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const set = (k: keyof typeof emptyProduct) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditing((p) => (p ? { ...p, [k]: e.target.value } : p));

  if (bulkOpen) {
    return (
      <BulkUpload
        categoryNames={categoryNames}
        onClose={() => setBulkOpen(false)}
        onDone={async () => {
          setBulkOpen(false);
          await load();
        }}
      />
    );
  }

  const writeWithAi = async () => {
    if (!editing || editing.name.trim().length < 3) return showToast('Enter the product name first.');
    setAiBusy(true);
    try {
      const r = await api('/api/ai/generate-product-content', {
        method: 'POST',
        body: JSON.stringify({ name: editing.name, category: editing.category, price: Number(editing.price) || 0 }),
      });
      setEditing((p) =>
        p ? { ...p, shortDescription: r.shortDescription || p.shortDescription, description: r.description || p.description } : p
      );
      showToast('Description written. Check it before saving.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  if (editing) {
    const cost = Number(editing.supplierCostPrice) || 0;
    const price = Number(editing.price) || 0;
    return (
      <div className="bg-white border border-black/10 p-5 space-y-4">
        <h2 className="text-lg font-display">{editing.id ? 'Edit product' : 'New product'}</h2>
        {editing.adminHiddenReason && (
          <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs">
            The store has hidden this product: <strong>{editing.adminHiddenReason}</strong>. You can still edit it; please contact the
            store to make it live again.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={editing.name} onChange={set('name')} />
          </div>
          <div>
            <label className={labelCls}>Price (PKR) *</label>
            <input className={inputCls} value={editing.price} onChange={set('price')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Old price (shown crossed out, optional)</label>
            <input className={inputCls} value={editing.compareAtPrice} onChange={set('compareAtPrice')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Stock *</label>
            <input className={inputCls} value={editing.stock} onChange={set('stock')} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>Category *</label>
            <input className={inputCls} value={editing.category} onChange={set('category')} list="seller-categories" placeholder="Choose or type" />
            <datalist id="seller-categories">
              {categoryNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Image link (https://...)</label>
            <input className={inputCls} value={editing.primaryImage} onChange={set('primaryImage')} placeholder="https://..." />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#575653]">Let AI write the short and full description from the name and category.</span>
            <button
              type="button"
              disabled={aiBusy}
              onClick={writeWithAi}
              className="px-3 py-1.5 bg-[#C5A059] text-black text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {aiBusy ? 'Writing...' : '✨ Write description with AI'}
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Short description</label>
            <input className={inputCls} value={editing.shortDescription} onChange={set('shortDescription')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Full description</label>
            <textarea className={inputCls} rows={4} value={editing.description} onChange={set('description')} />
          </div>
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input className={inputCls} value={editing.weightKg} onChange={set('weightKg')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={editing.status} onChange={set('status')}>
              <option value="ACTIVE">Live (visible in the store)</option>
              <option value="DRAFT">Draft (hidden)</option>
            </select>
          </div>
          <div className="sm:col-span-2 pt-2 border-t border-black/10">
            <div className="text-xs font-bold text-[#141413]">Supplier (dropshipping, optional)</div>
            <p className="text-[11px] text-[#575653]">Only you and the store team can see this. It is shown on your orders so you can forward them.</p>
          </div>
          <div>
            <label className={labelCls}>Supplier name</label>
            <input className={inputCls} value={editing.supplierName} onChange={set('supplierName')} placeholder="e.g. AliExpress, local wholesaler" />
          </div>
          <div>
            <label className={labelCls}>Supplier cost per piece (PKR)</label>
            <input className={inputCls} value={editing.supplierCostPrice} onChange={set('supplierCostPrice')} inputMode="decimal" />
            {cost > 0 && price > 0 && (
              <span className={`block mt-1 text-[11px] font-semibold ${price - cost >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                Margin before commission: {formatPKR(price - cost)} ({Math.round(((price - cost) / price) * 100)}%)
              </span>
            )}
          </div>
          <div>
            <label className={labelCls}>Supplier product link</label>
            <input className={inputCls} value={editing.supplierProductUrl} onChange={set('supplierProductUrl')} placeholder="https://..." />
          </div>
          <div>
            <label className={labelCls}>Supplier SKU / code</label>
            <input className={inputCls} value={editing.supplierSku} onChange={set('supplierSku')} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={save} className="px-5 py-2 bg-[#141413] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="px-5 py-2 border border-black/20 text-xs cursor-pointer">
            Back
          </button>
        </div>
      </div>
    );
  }

  const filterTabs: [ProductFilter, string][] = [
    ['ALL', 'All'],
    ['ACTIVE', 'Live'],
    ['DRAFT', 'Draft'],
    ['OUT', 'Out of stock'],
    ['ARCHIVED', 'Removed'],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#575653]">
          {products ? `${counts.ALL} products` : 'Loading products...'}
          {refreshing && products ? ' · updating…' : ''}
        </span>
        <div className="flex flex-wrap gap-2">
          {products && products.length > 0 && (
            <button
              type="button"
              disabled={archiving}
              onClick={archiveImages}
              title="Copy product pictures into the store's storage so they stay even if the supplier deletes them"
              className="px-4 py-2 bg-white border border-black/30 text-[#141413] text-xs font-bold cursor-pointer hover:bg-black/[0.04] disabled:opacity-50"
            >
              {archiving ? 'Saving images...' : 'Save images to store'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="px-4 py-2 bg-white border border-black/30 text-[#141413] text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-black/[0.04]"
          >
            <Upload className="w-4 h-4" /> CSV / Bulk listing
          </button>
          <button
            type="button"
            onClick={() => setEditing({ ...emptyProduct })}
            className="px-4 py-2 bg-[#141413] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New product
          </button>
        </div>
      </div>

      {products && products.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#575653]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU or category"
              className={`${inputCls} pl-8`}
            />
          </div>
          {filterTabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                filter === id ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/20 text-[#141413]'
              }`}
            >
              {label} ({counts[id]})
            </button>
          ))}
        </div>
      )}

      {products && products.length === 0 && (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">
          No products yet. Start with "New product" or "CSV / Bulk listing".
        </p>
      )}
      {products && products.length > 0 && filtered.length === 0 && (
        <p className="p-6 bg-white border border-black/10 text-xs text-center text-[#575653]">No products match.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.slice(0, shown).map((p) => (
          <div key={p.id} className="bg-white border border-black/10 p-3 flex gap-3 text-xs [content-visibility:auto] [contain-intrinsic-size:auto_112px]">
            <div className="w-20 h-20 bg-[#F4F3EF] shrink-0 overflow-hidden">
              {p.primaryImage ? (
                <img src={p.primaryImage} alt="" width={80} height={80} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : null}
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
                {p.status === 'ACTIVE' ? 'Live' : p.status === 'DRAFT' ? 'Draft' : 'Removed'}
              </span>
              {p.adminHidden && (
                <span className="ml-1 inline-block px-1.5 py-0.5 border text-[10px] font-bold bg-rose-100 text-rose-900 border-rose-400" title={p.adminHiddenReason}>
                  Hidden by store
                </span>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={opening === p.id}
                  onClick={() => openEditor(p)}
                  className="px-2 py-1 border border-black/30 font-semibold cursor-pointer disabled:opacity-50"
                >
                  {opening === p.id ? 'Opening...' : 'Edit'}
                </button>
                {p.status !== 'ARCHIVED' && (
                  <button
                    type="button"
                    onClick={() => archive(p)}
                    className="px-2 py-1 border border-rose-400 text-rose-800 font-semibold cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {filtered.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE * 2)}
          className="w-full py-2.5 bg-white border border-black/20 text-xs font-bold text-[#141413] cursor-pointer hover:bg-black/[0.03]"
        >
          Show more ({filtered.length - shown} more)
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ bulk listing (CSV)

const BULK_CHUNK = 200;

const BulkUpload: React.FC<{ categoryNames: string[]; onClose: () => void; onDone: () => void }> = ({
  categoryNames,
  onClose,
  onDone,
}) => {
  const { showToast, settings } = useStore();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<SellerCsvRow[]>([]);
  const [defaultCategory, setDefaultCategory] = useState('');
  const [asDraft, setAsDraft] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; error: string }[] } | null>(null);

  // Rows without their own category take the one chosen here
  const prepared = useMemo(
    () =>
      rows.map((r) => {
        const category = r.category || defaultCategory.trim();
        const problem = r.problem === 'No category' && category.length >= 2 ? '' : r.problem;
        return { ...r, category, problem, status: asDraft ? ('DRAFT' as const) : r.status };
      }),
    [rows, defaultCategory, asDraft]
  );
  const ready = prepared.filter((r) => !r.problem);
  const skipped = prepared.length - ready.length;

  const readFile = async (file: File) => {
    setResult(null);
    if (file.size > 15 * 1024 * 1024) {
      showToast('The file is larger than 15 MB. Please split it into smaller files.');
      return;
    }
    const text = await file.text();
    const parsed = parseSellerCsv(text, settings.usdToPkrRate);
    if (parsed.error) {
      showToast(parsed.error);
      setRows([]);
      return;
    }
    setFileName(file.name);
    setRows(parsed.rows);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + SELLER_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seller-products-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const upload = async () => {
    if (!ready.length) return;
    const total = ready.length;
    const sum = { created: 0, updated: 0, errors: [] as { row: number; error: string }[] };
    setProgress({ done: 0, total });
    try {
      for (let i = 0; i < total; i += BULK_CHUNK) {
        const chunk = ready.slice(i, i + BULK_CHUNK).map(({ problem, ...r }) => r);
        const d = await api('/api/seller/products/bulk', { method: 'POST', body: JSON.stringify({ products: chunk }) });
        sum.created += d.created || 0;
        sum.updated += d.updated || 0;
        sum.errors.push(...(d.errors || []));
        setProgress({ done: Math.min(total, i + BULK_CHUNK), total });
      }
      setResult(sum);
      showToast(`${sum.created} new products, ${sum.updated} updated.`);
    } catch (err: any) {
      setResult(sum);
      showToast(err.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="bg-white border border-black/10 p-5 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-display">Bulk listing from CSV</h2>
        <button type="button" onClick={onClose} className="px-4 py-2 border border-black/20 cursor-pointer">
          Back
        </button>
      </div>

      <div className="p-3 bg-[#F4F3EF] border border-black/10 space-y-1.5 text-[#141413]">
        <p>
          Make a product list in Excel or Google Sheets and save it as <strong>CSV</strong>. Export files from Daraz, Shopify
          or WooCommerce also work.
        </p>
        <p>
          Required columns: <strong>name, price, category</strong>. Optional: sku, old_price, stock, image_url,
          short_description, description, weight_kg. For dropshipping: supplier, supplier_cost, supplier_link, supplier_sku
          (only you and the store team see these).
        </p>
        <p>
          Uploading a file again with the same <strong>sku</strong> does not create duplicates: it updates the price and stock
          of the existing products.
        </p>
        <button type="button" onClick={downloadTemplate} className="mt-1 px-3 py-1.5 bg-white border border-black/30 font-semibold flex items-center gap-1 cursor-pointer">
          <Download className="w-3.5 h-3.5" /> Download a sample (template) file
        </button>
      </div>

      <label className="block p-6 border-2 border-dashed border-black/25 text-center cursor-pointer hover:bg-black/[0.02]">
        <Upload className="w-6 h-6 mx-auto mb-2 text-[#454441]" />
        <span className="font-bold text-[#141413]">{fileName ? `${fileName}: click to choose another file` : 'Choose a CSV file'}</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category for products that have none</label>
              <input
                className={inputCls}
                value={defaultCategory}
                onChange={(e) => setDefaultCategory(e.target.value)}
                list="seller-bulk-categories"
                placeholder="Choose or type"
              />
              <datalist id="seller-bulk-categories">
                {categoryNames.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <label className="flex items-center gap-2 font-semibold text-[#141413] sm:pt-5">
              <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />
              Save all as Draft (I will review them and make them live later)
            </label>
          </div>

          <p className="text-[#141413]">
            <strong>{ready.length}</strong> products ready
            {skipped > 0 && (
              <>
                {' '}· <strong className="text-rose-800">{skipped}</strong> will be skipped (see the reason below)
              </>
            )}
          </p>

          <div className="max-h-80 overflow-auto border border-black/10">
            <table className="w-full text-left">
              <thead className="bg-[#F4F3EF] sticky top-0">
                <tr>
                  <th className="p-2">Line</th>
                  <th className="p-2">Image</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Check</th>
                </tr>
              </thead>
              <tbody>
                {prepared.slice(0, 300).map((r) => (
                  <tr key={r.row} className={`border-t border-black/[0.06] ${r.problem ? 'bg-rose-50' : ''}`}>
                    <td className="p-2 font-mono">{r.row}</td>
                    <td className="p-2">
                      {r.primaryImage ? <img src={r.primaryImage} alt="" className="w-9 h-9 object-cover" loading="lazy" decoding="async" /> : '—'}
                    </td>
                    <td className="p-2 max-w-[220px] truncate">{r.name || '—'}</td>
                    <td className="p-2 font-mono">{r.price ? formatPKR(r.price) : '—'}</td>
                    <td className="p-2 font-mono">{r.stock}</td>
                    <td className="p-2">{r.category || '—'}</td>
                    <td className={`p-2 font-semibold ${r.problem ? 'text-rose-800' : 'text-emerald-800'}`}>{r.problem || 'OK'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prepared.length > 300 && <p className="p-2 text-[#575653]">…and {prepared.length - 300} more products (all will be uploaded)</p>}
          </div>

          <button
            type="button"
            disabled={!ready.length || !!progress}
            onClick={upload}
            className="w-full py-2.5 bg-[#141413] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
          >
            {progress ? `Uploading... ${progress.done} / ${progress.total}` : `Upload ${ready.length} products`}
          </button>
        </>
      )}

      {result && (
        <div className="p-3 border border-emerald-400 bg-emerald-50 text-emerald-950 space-y-1">
          <p>
            ✓ {result.created} new products created, {result.updated} existing products updated.
          </p>
          {result.errors.length > 0 && (
            <p className="text-rose-800">
              {result.errors.length} lines were not saved: {result.errors.slice(0, 5).map((e) => `line ${e.row} (${e.error})`).join(', ')}
            </p>
          )}
          <button type="button" onClick={onDone} className="mt-1 px-4 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer">
            View products
          </button>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ earnings

const EarningsTab: React.FC = () => {
  const { showToast } = useStore();
  const [data, setData] = useState(memo.earnings || null);
  useEffect(() => {
    api('/api/seller/earnings')
      .then((d) => {
        memo.earnings = d;
        setData(d);
      })
      .catch((err) => showToast(err.message));
  }, [showToast]);
  if (!data) return <p className="text-xs text-[#575653]">Loading...</p>;
  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Ready for payout', s.available, 'Delivered orders, not yet paid out'],
          ['Upcoming earnings', s.pending, 'Orders not delivered yet'],
          ['Paid out', s.paid, 'Already sent to your bank'],
          ['Store commission', s.commission, `${data.commissionPercent}% per sale`],
          ...(Number(s.supplierCost) > 0
            ? [
                ['Supplier cost', s.supplierCost, 'Dropshipping cost of your orders'],
                ['Estimated profit', s.profit, 'Earnings minus supplier cost (returns not included)'],
              ]
            : []),
        ].map(([label, value, hint]) => (
          <div key={label as string} className="p-4 bg-white border border-black/10">
            <div className="text-[11px] text-[#575653]">{label}</div>
            <div className="text-xl font-bold font-mono mt-1">{formatPKR(Number(value))}</div>
            <div className="text-[10px] text-[#575653] mt-1">{hint}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#454441]">
        The store collects the customer's Cash on Delivery payment. Once an order is delivered, your earning (amount −
        commission + shipping) moves to "Ready for payout" and the store transfers it to your bank account.
      </p>
      <div className="bg-white border border-black/10">
        <div className="px-4 py-2 border-b border-black/10 text-xs font-bold">Payouts</div>
        {data.payouts.length === 0 ? (
          <p className="p-4 text-xs text-[#575653]">No payouts yet.</p>
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

// Square-crops and shrinks a chosen photo to a small JPEG (about 15-40 KB) so it can be kept on the
// shop record without Firebase Storage
async function shrinkToSquareJpeg(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This picture could not be opened. Please choose a JPG or PNG.'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ProfileTab: React.FC<{ seller: SellerShop; privateData: SellerPrivate; onSaved: () => void }> = ({
  seller,
  privateData,
  onSaved,
}) => {
  const { showToast, firebaseUser } = useStore();
  const [photoBusy, setPhotoBusy] = useState(false);
  const photo = seller.logoUrl || firebaseUser?.photoURL || '';
  const [form, setForm] = useState({
    phone: seller.phone || '',
    city: seller.city || '',
    address: privateData.address || '',
    bankName: privateData.bankName || '',
    accountTitle: privateData.accountTitle || '',
    accountNumber: privateData.accountNumber || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const savePhoto = async (logoUrl: string) => {
    setPhotoBusy(true);
    try {
      await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify({ logoUrl }) });
      showToast(logoUrl ? 'Picture saved.' : 'Picture removed.');
      onSaved();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <form
      className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify(form) });
          showToast('Profile saved.');
          onSaved();
        } catch (err: any) {
          showToast(err.message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <SellerAvatar src={photo} name={seller.shopName} size={88} className="border border-black/10" />
        <div className="space-y-2 text-xs text-[#575653]">
          <div>
            Shop: <strong className="text-[#141413]">{seller.shopName}</strong> · {seller.ownerEmail}
            <span className="block">To change the shop name, please contact the store.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label
              className={`px-3 py-1.5 bg-[#141413] text-white font-semibold flex items-center gap-1 cursor-pointer ${
                photoBusy ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> {photoBusy ? 'Saving...' : seller.logoUrl ? 'Change picture' : 'Add picture'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    await savePhoto(await shrinkToSquareJpeg(f));
                  } catch (err: any) {
                    showToast(err.message);
                  }
                }}
              />
            </label>
            {seller.logoUrl && (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => savePhoto('')}
                className="px-3 py-1.5 border border-black/30 text-[#141413] font-semibold cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Mobile</label>
        <input className={inputCls} value={form.phone} onChange={set('phone')} />
      </div>
      <div>
        <label className={labelCls}>City</label>
        <input className={inputCls} value={form.city} onChange={set('city')} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Address</label>
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
        <label className={labelCls}>Account number / IBAN (payouts are sent here)</label>
        <input className={inputCls} value={form.accountNumber} onChange={set('accountNumber')} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-[#141413] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
};
