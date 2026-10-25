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
  Star,
  RotateCcw,
  Bot,
  MessageCircleQuestion,
} from 'lucide-react';
import { SellerAiAssistant } from './SellerAiAssistant';
import { QuestionsInbox, sellerWaitingQuestions } from './QuestionsInbox';
import { ProductInfoEditor } from './ProductInfoEditor';
import { ProductShippingEditor, emptyShipping, shippingFormOf, type ShippingForm } from './ProductShippingEditor';
import type { ProductInfo } from '../services/productInfo';
import { famousBrandIn } from '../services/brandRules';
import { ShareProductButton } from './ShareProductButton';
import { PAYOUT_METHODS, type PayoutDetails, type SellerType } from '../services/vendorRules';
import { ALL_WORLD_COUNTRIES } from '../services/addressAndPaymentVerification';
import { callingCodeOf } from '../services/intlAddress';
import { ShopCoachReport, type Coach } from './ShopCoachReport';
import { PolicyDocument } from './PolicyDocument';
import { CONDUCT_VERSION, REINSTATEMENT_FEE, SUPPLIER_CODE } from '../data/policies';
import { SELLER_CSV_TEMPLATE, parseSellerCsv, type SellerCsvRow } from '../services/sellerCsv';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { AuthPanel } from './AuthPanel';
import { PWAInstallButton } from './PWAInstallButton';
import { SellerAvatar } from './SellerAvatar';
import { BrandLogo } from './BrandLogo';
import { ProductMediaEditor } from './ProductMediaEditor';
import { formatPKR } from '../services/abstractions';
import type { Product, Order, SellerShop, SellerPrivate, SellerPayout } from '../types/store';

// Seller Center (/seller): marketplace sellers apply, then manage their own products, orders,
// shipping/tracking and earnings. Everything goes through the /api/seller/* server routes.
//
// It opens instantly: the shop and product list from the last visit are shown at once (Firebase can
// take many seconds to restore a sign-in) and refreshed in the background.

type Tab = 'DASHBOARD' | 'AI' | 'PRODUCTS' | 'ORDERS' | 'RETURNS' | 'EARNINGS' | 'REVIEWS' | 'QUESTIONS' | 'MESSAGES' | 'PROFILE' | 'RULES';

type ThreadMessage = { id: string; from: 'SELLER' | 'ADMIN'; author: string; text: string; at: string };
type SellerThread = {
  id: string;
  subject: string;
  category: string;
  orderNumber?: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  startedBy: 'SELLER' | 'ADMIN';
  createdAt: string;
  lastMessageAt: string;
  lastFrom: 'SELLER' | 'ADMIN';
  lastMessagePreview: string;
  unreadForSeller: boolean;
  messageCount?: number;
  messages?: ThreadMessage[];
};
type StoreNotice = { id: string; title: string; body: string; level: 'INFO' | 'WARNING' | 'URGENT'; createdAt: string; audience: string };
type SellerInbox = {
  threads: SellerThread[];
  notices: StoreNotice[];
  noticesReadAt: string;
  unread: { threads: number; notices: number };
};
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

// Uploads one product picture or video (sent as the raw file) and returns its URL
async function uploadMedia(file: Blob): Promise<string> {
  const { url } = await api<{ url: string }>('/api/seller/media/upload', {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  return url;
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
const memo: {
  coach?: Coach;
  orders?: SellerOrder[];
  earnings?: { summary: any; commissionPercent: number; payouts: SellerPayout[]; charges?: any[]; escrowDays?: number };
} = {};

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

  // Messages with the store and store notices; checked every minute while the app is open
  const [inbox, setInbox] = useState<SellerInbox | null>(null);
  const loadInbox = useCallback(async () => {
    try {
      setInbox(await api<SellerInbox>('/api/seller/inbox'));
    } catch {
      // keep what is shown; the next check will try again
    }
    // New reviews / likes (served from the cached seller record, no extra database read)
    api('/api/seller/activity')
      .then((d) => setActivityUnread(Number(d.activityUnread) || 0))
      .catch(() => {});
  }, []);
  const [activityUnread, setActivityUnread] = useState(0);
  const clearActivity = useCallback(() => setActivityUnread(0), []);
  const approved = seller?.status === 'APPROVED';
  useEffect(() => {
    if (!authReady || !approved) return;
    loadInbox();
    const t = setInterval(() => document.visibilityState === 'visible' && loadInbox(), 60_000);
    return () => clearInterval(t);
  }, [authReady, approved, loadInbox]);
  const unreadTotal = (inbox?.unread.threads || 0) + (inbox?.unread.notices || 0);

  // Unanswered customer questions (badge on "Questions"); checked once when Seller Center opens
  const [questionsWaiting, setQuestionsWaiting] = useState(0);
  useEffect(() => {
    if (!authReady || !approved) return;
    sellerWaitingQuestions()
      .then(setQuestionsWaiting)
      .catch(() => {});
  }, [authReady, approved]);

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
            <BrandLogo name={storeName} tone="dark" size="sm" />
            <span className="ml-1 pl-2 border-l border-white/20 text-[11px] font-bold uppercase tracking-wider text-[#E5C98A] shrink-0">
              Seller Center
            </span>
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
        <h1 className="text-2xl font-display">
          Your seller account is {(seller as any).permanentlySuspended ? 'permanently suspended' : 'suspended'}
        </h1>
        <p className="text-sm text-[#454441]">{seller.statusReason || `Please contact ${storeName} for more information.`}</p>
        {(seller as any).suspensionCause === 'RATING' && (
          <div className="p-4 bg-amber-50 border border-amber-300 text-amber-950 text-sm text-left space-y-2">
            <p>
              <strong>All your payments are frozen</strong> while the account is suspended.
            </p>
            {(seller as any).reinstatementUsed || (seller as any).permanentlySuspended ? (
              <p>You have already used your one reinstatement, so this account cannot be restored again.</p>
            ) : (
              <p>
                You can restore your account <strong>once</strong> by paying a reinstatement fee of{' '}
                <strong>PKR {REINSTATEMENT_FEE.toLocaleString('en-PK')}</strong>. Your rating then starts fresh, your products return to
                the store and your payments are unfrozen. If your rating falls below 3.0 again, the suspension becomes permanent.
                Contact {storeName} on WhatsApp or by message to arrange it.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'AI', label: 'AI Assistant', icon: Bot },
    { id: 'ORDERS', label: 'Orders', icon: ShoppingCart },
    { id: 'PRODUCTS', label: 'Products', icon: Package },
    { id: 'RETURNS', label: 'Returns', icon: RotateCcw },
    { id: 'EARNINGS', label: 'Earnings', icon: Wallet },
    { id: 'REVIEWS', label: 'Reviews', icon: Star, badge: activityUnread },
    { id: 'QUESTIONS', label: 'Questions', icon: MessageCircleQuestion, badge: questionsWaiting },
    { id: 'MESSAGES', label: 'Messages', icon: MessageSquare, badge: unreadTotal },
    { id: 'PROFILE', label: 'Profile', icon: UserCog },
  ];
  const urgentNotice = inbox?.notices.find((n) => n.level === 'URGENT' && String(n.createdAt) > inbox.noticesReadAt);

  // Every seller accepts the current Supplier Code of Conduct before using Seller Center
  if ((seller as any).conductVersion !== CONDUCT_VERSION) {
    return shell(
      <ConductGate
        shopName={seller.shopName}
        onAccepted={(version) => {
          const next = { ...seller, conductVersion: version } as SellerShop;
          setSeller(next);
          writeCache(ME_CACHE_KEY, uid, { seller: next, commissionPercent });
        }}
      />
    );
  }

  return shell(
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setTab('PROFILE')} title="Profile picture" className="cursor-pointer">
          <SellerAvatar src={seller.logoUrl || firebaseUser?.photoURL} name={seller.shopName} size={52} className="border border-black/10" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-display truncate">{seller.shopName}</h1>
          <p className="text-xs text-[#575653]">
            Commission: {commissionPercent ?? 0}% per sale · {seller.city} ·{' '}
            {Number((seller as any).followers) > 0 && (
              <>
                <strong className="text-[#141413]">{Number((seller as any).followers).toLocaleString('en-PK')}</strong>{' '}
                {Number((seller as any).followers) === 1 ? 'follower' : 'followers'} (emailed when you add products) ·{' '}
              </>
            )}
            <a href={`/#shop/${encodeURIComponent(seller.id || uid)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0E7A43] underline">
              My shop page
            </a>{' '}
            ·{' '}
            <button type="button" onClick={() => setTab('RULES')} className="font-semibold text-[#0E7A43] underline cursor-pointer">
              Seller rules
            </button>
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
              {!!t.badge && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {tab !== 'MESSAGES' && unreadTotal > 0 && (
        <button
          type="button"
          onClick={() => setTab('MESSAGES')}
          className={`w-full p-3 text-left text-xs border cursor-pointer ${
            urgentNotice ? 'bg-rose-50 border-rose-400 text-rose-950' : 'bg-sky-50 border-sky-300 text-sky-950'
          }`}
        >
          {urgentNotice ? (
            <>
              <strong>Urgent notice from the store:</strong> {urgentNotice.title} — tap to read.
            </>
          ) : (
            <>
              You have <strong>{unreadTotal}</strong> new {unreadTotal === 1 ? 'message / notice' : 'messages / notices'} from the
              store. Tap to read.
            </>
          )}
        </button>
      )}
      {tab === 'DASHBOARD' && <DashboardTab onGo={setTab} seller={seller} />}
      {tab === 'ORDERS' && <OrdersTab />}
      {tab === 'PRODUCTS' && (
        <ProductsTab
          uid={uid}
          categoryNames={categories.map((c) => c.name)}
          shipsFrom={String(seller?.shipsFromCountry || seller?.warehouseCountry || seller?.countryCode || 'PK').toUpperCase()}
        />
      )}
      {tab === 'EARNINGS' && <EarningsTab />}
      {tab === 'RETURNS' && <ReturnsTab />}
      {tab === 'AI' && (
        <SellerAiAssistant
          shopName={seller.shopName}
          call={api}
          onGo={(t) => setTab(t as Tab)}
          onChanged={() => {
            delete memo.coach;
            // product list and orders are re-read next time those tabs open
            delete memo.orders;
            delete memo.earnings;
          }}
        />
      )}
      {tab === 'RULES' && (
        <div className="bg-white border border-black/10 p-5 space-y-3">
          <h2 className="text-lg font-display">Seller Rules (Supplier Code of Conduct)</h2>
          <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} />
          <p className="text-[11px] text-[#575653]">
            You accepted these rules on{' '}
            {(seller as any).conductAcceptedAt ? new Date((seller as any).conductAcceptedAt).toLocaleDateString('en-PK') : 'joining'}.
          </p>
        </div>
      )}
      {tab === 'REVIEWS' && <ReviewsTab onSeen={clearActivity} />}
      {tab === 'QUESTIONS' && <QuestionsInbox mode="seller" onWaitingChange={setQuestionsWaiting} />}
      {tab === 'MESSAGES' && <MessagesTab inbox={inbox} reload={loadInbox} />}
      {tab === 'PROFILE' &&
        (sellerPrivate ? (
          <ProfileTab seller={seller} privateData={sellerPrivate} onSaved={loadMe} />
        ) : (
          <p className="text-xs text-[#575653]">Loading your profile...</p>
        ))}
      {tab === 'PROFILE' && (
        // The rules this shop has agreed to follow
        <details className="group bg-white border border-black/10">
          <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3">
            <span>
              <strong className="block text-sm">Seller Rules (Supplier Code of Conduct)</strong>
              <span className="text-xs text-[#575653]">
                Accepted on{' '}
                {(seller as any).conductAcceptedAt ? new Date((seller as any).conductAcceptedAt).toLocaleDateString('en-PK') : 'joining'} · tap to
                read
              </span>
            </span>
            <span className="text-xs font-semibold text-[#0E7A43] group-open:hidden">Show</span>
            <span className="text-xs font-semibold text-[#0E7A43] hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-5 pb-5 border-t border-black/[0.06] pt-4">
            <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} compact />
          </div>
        </details>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ Shop Coach auto-fix

// Safe fixes that stop the account health from getting worse (never prices, the score or settings):
// hide live products with no stock, and write clearer descriptions. Runs daily by itself unless
// the seller switches it off; "Fix now" runs it at once after showing what will change.
const AutoFixBox: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { showToast } = useStore();
  const [plan, setPlan] = useState<{ enabled: boolean; lastRunAt: string | null; hide: { id: string; name: string }[]; rewrite: { id: string; name: string }[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const load = useCallback(() => {
    api('/api/seller/coach/autofix')
      .then(setPlan)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!plan) return null;
  const count = plan.hide.length + plan.rewrite.length;

  const toggle = async (enabled: boolean) => {
    try {
      await api('/api/seller/coach/autofix', { method: 'POST', body: JSON.stringify({ enabled }) });
      setPlan((p) => p && { ...p, enabled });
      showToast(enabled ? 'Auto-fix is on: the coach fixes these things once a day.' : 'Auto-fix is off.');
    } catch (err: any) {
      showToast(err.message);
    }
  };
  // One click: apply every safe fix now, switch the daily auto-fix on, and refresh the coach so the
  // fixed problems disappear (the rest stay with their "Fix it" buttons for the seller)
  const run = async () => {
    setBusy(true);
    setResult('');
    try {
      const r = await api('/api/seller/coach/autofix', { method: 'POST', body: '{}' });
      const msg = r.updated
        ? `Fixed: ${r.hidden.length} out-of-stock product(s) hidden, ${r.rewritten.length} description(s) improved. Daily auto-fix is on.`
        : 'Everything the coach can fix is already fine. Daily auto-fix is on.';
      setResult(msg);
      showToast(msg);
      load();
      onDone();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 bg-white border border-emerald-200 rounded-lg space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="px-5 py-2.5 bg-[#0E7A43] hover:bg-[#0B5E34] text-white text-sm font-bold rounded disabled:opacity-60 cursor-pointer"
        >
          {busy ? 'Fixing your account health...' : '⚡ Auto-fix account health'}
        </button>
        <div className="flex flex-wrap items-center gap-3 text-[#575653]">
          <span>
            {count ? `${count} thing${count > 1 ? 's' : ''} can be fixed now` : 'Nothing to fix right now'}
            {plan.lastRunAt ? ` · last run ${new Date(plan.lastRunAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={plan.enabled} onChange={(e) => toggle(e.target.checked)} />
            Also every day
          </label>
          {count > 0 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="underline cursor-pointer">
              {open ? 'Hide details' : 'What will it change?'}
            </button>
          )}
        </div>
      </div>
      {result && <p className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-900">{result} Anything still listed below needs you: press its “Fix it” button — once you fix it, it disappears from the list.</p>}
      {open && (
        <div className="p-2 bg-[#FBFBF9] border border-black/10 space-y-2">
          {plan.hide.length > 0 && (
            <div>
              <strong>Hide (out of stock, so no order gets cancelled):</strong>
              <ul className="list-disc pl-5">
                {plan.hide.slice(0, 10).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {plan.hide.length > 10 && <li>…and {plan.hide.length - 10} more</li>}
              </ul>
            </div>
          )}
          {plan.rewrite.length > 0 && (
            <div>
              <strong>Write clearer descriptions (AI):</strong>
              <ul className="list-disc pl-5">
                {plan.rewrite.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[#575653]">Prices, your health score and your account settings are never changed.</p>
        </div>
      )}
    </div>
  );
};

// A product the Products tab should open in the form as soon as it shows (Shop Coach "Fix it myself")
let pendingEditId: string | null = null;

// Shop Coach: listings that use a famous brand's name. "Self fix it" lets the coach fix them all;
// "Fix it myself" lists them, each with Edit to open its form.
const BrandFixActions: React.FC<{
  products: { id: string; name: string; brand: string }[];
  onDone: () => void;
  onEdit: (productId: string) => void;
}> = ({ products, onDone, onEdit }) => {
  const { showToast } = useStore();
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const selfFix = async () => {
    if (!window.confirm(`Fix ${products.length} product(s)? The brand name will be removed from the title, an honest note added to the description, and the product marked "No brand".`)) return;
    setBusy(true);
    try {
      const r = await api('/api/seller/coach/fix-brands', { method: 'POST', body: JSON.stringify({}) });
      const skipped = (r.skipped || []).length;
      showToast(
        `Fixed ${r.updated} product(s)${r.usedAi ? ' with AI' : ''}.${skipped ? ` ${skipped} could not be changed: open them with "Fix it myself".` : ''} Details are in Messages.`
      );
      onDone();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={selfFix} className="mt-1 px-3 py-1.5 bg-[#0E7A43] text-white font-bold cursor-pointer disabled:opacity-50">
          {busy ? 'Fixing...' : '✨ Self fix it'}
        </button>
        <button type="button" onClick={() => setListOpen((o) => !o)} className="mt-1 px-3 py-1.5 bg-white border border-black/25 font-semibold cursor-pointer">
          {listOpen ? 'Hide list' : `Fix it myself (${products.length})`}
        </button>
      </div>
      {listOpen && (
        <ul className="bg-white border border-black/10 divide-y divide-black/[0.06] max-h-72 overflow-y-auto">
          {products.map((p) => (
            <li key={p.id} className="px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate" title={p.name}>
                {p.name}
              </span>
              <span className="shrink-0 px-1.5 py-0.5 bg-rose-100 text-rose-900 text-[10px] font-bold">{p.brand}</span>
              <button type="button" onClick={() => onEdit(p.id)} className="shrink-0 px-2 py-1 border border-black/30 font-semibold cursor-pointer">
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Writes every short description with AI in the background, with progress
const RewriteAllButton: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { showToast } = useStore();
  const [job, setJob] = useState<{ total: number; done: number; failed: number; running: boolean; error?: string } | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    api('/api/seller/coach/rewrite-all')
      .then((d) => setJob(d.job))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!job?.running) return;
    const t = setInterval(() => {
      api('/api/seller/coach/rewrite-all')
        .then((d) => {
          setJob(d.job);
          if (d.job && !d.job.running) onDone();
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [job?.running, onDone]);
  const start = async () => {
    setStarting(true);
    try {
      const d = await api('/api/seller/coach/rewrite-all', { method: 'POST', body: '{}' });
      if (d.message) showToast(d.message);
      setJob(d.job);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setStarting(false);
    }
  };
  if (job?.running) {
    const pct = Math.round((job.done / Math.max(1, job.total)) * 100);
    return (
      <div className="mt-1 flex items-center gap-2">
        <div className="w-40 h-2 bg-black/10 rounded">
          <div className="h-2 bg-[#0E7A43] rounded" style={{ width: `${pct}%` }} />
        </div>
        <span>
          Writing {job.done} / {job.total}… (you can leave this page)
        </span>
        <button type="button" onClick={() => api('/api/seller/coach/rewrite-all', { method: 'POST', body: JSON.stringify({ stop: true }) }).then((d) => setJob(d.job))} className="underline cursor-pointer">
          Stop
        </button>
      </div>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <button type="button" disabled={starting} onClick={start} className="px-3 py-1.5 bg-[#0E7A43] text-white font-bold disabled:opacity-50 cursor-pointer">
        {starting ? 'Starting...' : '✍️ Write them all with AI'}
      </button>
      {job && !job.running && job.done > 0 && <span className="text-emerald-800">Last run: {job.done} written.</span>}
    </span>
  );
};

// ------------------------------------------------------------------ flash deal on one product

const FlashDealBox: React.FC<{ productId: string; price: number; current: { price: string; endsAt: string } | null }> = ({ productId, price, current }) => {
  const { showToast } = useStore();
  const [deal, setDeal] = useState(current);
  const [dealPrice, setDealPrice] = useState('');
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const save = async (body: any) => {
    setBusy(true);
    try {
      const r = await api(`/api/seller/products/${encodeURIComponent(productId)}/flash`, { method: 'POST', body: JSON.stringify(body) });
      setDeal(body.clear ? null : { price: String(r.flashPrice), endsAt: r.flashEndsAt });
      showToast(body.clear ? 'Deal ended.' : 'Flash deal started: it shows in Anokhi Daily Deals with a countdown.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sm:col-span-2 p-3 border border-rose-200 bg-rose-50/40 space-y-2">
      <span className="text-[11px] font-bold text-[#B91C1C] block">⚡ Flash deal (limited-time price with a countdown in the store)</span>
      {deal ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            Deal price <strong>{formatPKR(Number(deal.price))}</strong> until{' '}
            {new Date(deal.endsAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
          <button type="button" disabled={busy} onClick={() => save({ clear: true })} className="px-2 py-1 border border-black/20 cursor-pointer">
            End deal
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input className={`${inputCls} w-32`} value={dealPrice} onChange={(e) => setDealPrice(e.target.value)} placeholder="Deal price" inputMode="numeric" />
          <span>for</span>
          <select className={`${inputCls} w-32`} value={hours} onChange={(e) => setHours(e.target.value)}>
            {['6', '12', '24', '48', '72', '168'].map((h) => (
              <option key={h} value={h}>
                {Number(h) < 48 ? `${h} hours` : `${Number(h) / 24} days`}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !(Number(dealPrice) > 0 && Number(dealPrice) < price)}
            onClick={() => save({ flashPrice: Number(dealPrice), endsAt: new Date(Date.now() + Number(hours) * 3600_000).toISOString() })}
            className="px-3 py-1.5 bg-[#B91C1C] text-white font-bold disabled:opacity-40 cursor-pointer"
          >
            Start deal
          </button>
          <span className="text-[#575653]">must be lower than {formatPKR(price)}; you pay for the discount</span>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ seller rules (code of conduct)

const ConductGate: React.FC<{ shopName: string; onAccepted: (version: string) => void }> = ({ shopName, onAccepted }) => {
  const { showToast } = useStore();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const accept = async () => {
    setSaving(true);
    try {
      const d = await api('/api/seller/conduct/accept', { method: 'POST', body: JSON.stringify({ version: CONDUCT_VERSION }) });
      onAccepted(d.conductVersion);
      showToast('Thank you. Welcome to Seller Center.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white border border-black/10 p-5 sm:p-7 space-y-4">
        <h1 className="text-2xl font-display">Seller Rules — please read and accept</h1>
        <p className="text-xs text-[#575653]">
          {shopName}: to keep selling, accept the store's Supplier Code of Conduct. Several rules are applied automatically.
        </p>
        <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} />
        <label className="flex items-start gap-2 text-sm font-semibold cursor-pointer pt-2 border-t border-black/10">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
          I have read these rules and my shop will follow them.
        </label>
        <button
          type="button"
          disabled={!agreed || saving}
          onClick={accept}
          className="px-6 py-2.5 bg-[#0E7A43] text-white text-sm font-bold disabled:opacity-40 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Accept and continue'}
        </button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ returns

const REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Damaged or defective',
  WRONG_ITEM: 'Wrong item, colour or size',
  QUALITY: 'Quality does not match the description',
  FAKE: 'Fake or replica product',
};

const ReturnsTab: React.FC = () => {
  const { showToast } = useStore();
  const [list, setList] = useState<any[] | null>(null);
  const [replyFor, setReplyFor] = useState('');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api('/api/seller/returns')
      .then((d) => setList(d.returns || []))
      .catch((err) => {
        showToast(err.message);
        setList([]);
      });
  }, [showToast]);

  const send = async (id: string) => {
    setSaving(true);
    try {
      await api(`/api/seller/returns/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify({ note: reply }) });
      setList((l) => l && l.map((r) => (r.id === id ? { ...r, sellerResponse: reply } : r)));
      setReplyFor('');
      showToast('Your reply was sent to the store.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!list) return <p className="text-xs text-[#575653]">Loading return requests...</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#454441]">
        Customers can ask for a return or replacement within 7 days of delivery. The store decides each request; give your side
        before it does. Upheld complaints count against the product (3 customers = delisted; fake = locked) and the return shipping
        is taken off your payout.
      </p>
      {list.length === 0 ? (
        <p className="p-4 bg-white border border-black/10 text-xs text-[#575653]">No return requests. Keep it up!</p>
      ) : (
        list.map((r) => (
          <div key={r.id} className="p-4 bg-white border border-black/10 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono">{r.orderNumber}</strong>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold ${
                  r.status === 'OPEN' ? 'bg-amber-100 text-amber-900' : r.status === 'APPROVED' ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {r.status === 'OPEN' ? 'Waiting for the store' : r.status === 'APPROVED' ? 'Return approved' : 'Rejected'}
              </span>
              <span className="text-[#575653]">{new Date(r.createdAt).toLocaleDateString('en-PK')}</span>
              {r.fault === 'SELLER' && <span className="text-rose-700 font-bold">Your responsibility · −{formatPKR(r.returnCharge || 0)}</span>}
            </div>
            <p>
              <strong>{REASON_LABEL[r.reason] || r.reason}</strong> · wants a {r.resolution === 'REPLACEMENT' ? 'replacement' : 'refund'} ·{' '}
              {(r.items || []).map((it: any) => it.name).join(', ')}
            </p>
            <p className="whitespace-pre-line text-[#454441]">"{r.details}"</p>
            {r.photos?.length > 0 && (
              <div className="flex gap-2">
                {r.photos.map((p: string) => (
                  <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                    <img src={p} alt="" className="w-16 h-16 object-cover border border-black/10" />
                  </a>
                ))}
              </div>
            )}
            {r.sellerResponse && (
              <p className="pl-3 border-l-2 border-[#0E7A43]">
                <strong>Your reply:</strong> {r.sellerResponse}
              </p>
            )}
            {r.decisionNote && (
              <p className="pl-3 border-l-2 border-black/30">
                <strong>Store decision:</strong> {r.decisionNote}
              </p>
            )}
            {r.status === 'OPEN' &&
              (replyFor === r.id ? (
                <div className="space-y-2">
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={1500} className={inputCls} placeholder="Your side (e.g. the item was checked before dispatch; packing photo...)" />
                  <div className="flex gap-2">
                    <button type="button" disabled={saving} onClick={() => send(r.id)} className="px-3 py-1.5 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer">
                      {saving ? 'Sending...' : 'Send to the store'}
                    </button>
                    <button type="button" onClick={() => setReplyFor('')} className="px-3 py-1.5 border border-black/20 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReplyFor(r.id);
                    setReply(r.sellerResponse || '');
                  }}
                  className="text-[#0E7A43] font-semibold underline cursor-pointer"
                >
                  {r.sellerResponse ? 'Edit your reply' : 'Give your side'}
                </button>
              ))}
          </div>
        ))
      )}
    </div>
  );
};

// ------------------------------------------------------------------ reviews & likes

type ActivityItem = { id: string; type: string; text: string; at: string };
type SellerFeedback = {
  id: string;
  orderNumber: string;
  rating: number;
  comment: string;
  customerName: string;
  productNames: string[];
  status: string;
  createdAt: string;
  sellerReply?: string;
};
type RatingSummary = { ratingAvg: number; ratingCount: number; positivePercent: number; likes: number; dislikes: number };

const starText = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

const ReviewsTab: React.FC<{ onSeen: () => void }> = ({ onSeen }) => {
  const { showToast } = useStore();
  const [data, setData] = useState<{ summary: RatingSummary; feedback: SellerFeedback[]; activity: ActivityItem[] } | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [replyFor, setReplyFor] = useState('');
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('/api/seller/feedback');
      setData(d);
      if (d.activityUnread > 0) {
        api('/api/seller/activity/read', { method: 'POST' }).then(onSeen).catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Could not load your reviews.');
    }
    api('/api/seller/products')
      .then((d) => setProducts(Array.isArray(d.products) ? d.products : []))
      .catch(() => setProducts([]));
  }, [onSeen]);
  useEffect(() => {
    load();
  }, [load]);

  const saveReply = async (id: string) => {
    setSaving(true);
    try {
      await api(`/api/seller/feedback/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ reply: replyText }) });
      setData((d) => d && { ...d, feedback: d.feedback.map((f) => (f.id === id ? { ...f, sellerReply: replyText.trim() } : f)) });
      setReplyFor('');
      showToast('Reply saved. Customers can see it on your shop page.');
    } catch (err: any) {
      showToast(err.message || 'Could not save your reply.');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-2">
        <p>{error}</p>
        <button type="button" onClick={load} className="px-3 py-1.5 border border-rose-400 font-semibold cursor-pointer">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-xs text-[#575653]">Loading your reviews...</p>;

  const s = data.summary;
  const reacted = (products || [])
    .filter((p) => (p.likes || 0) + (p.dislikes || 0) > 0)
    .sort((a, b) => (b.likes || 0) + (b.dislikes || 0) - ((a.likes || 0) + (a.dislikes || 0)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-black/10">
          <p className="text-[10px] uppercase tracking-wider text-[#575653] font-bold">Customer rating</p>
          <p className="text-2xl font-display">{s.ratingCount ? s.ratingAvg.toFixed(1) : '—'}</p>
          <p className="text-xs text-[#F5A524]">{s.ratingCount ? starText(s.ratingAvg) : 'No ratings yet'}</p>
        </div>
        <div className="p-4 bg-white border border-black/10">
          <p className="text-[10px] uppercase tracking-wider text-[#575653] font-bold">Reviews</p>
          <p className="text-2xl font-display">{s.ratingCount}</p>
          <p className="text-xs text-[#575653]">{s.ratingCount ? `${s.positivePercent}% positive` : 'From delivered orders'}</p>
        </div>
        <div className="p-4 bg-white border border-black/10">
          <p className="text-[10px] uppercase tracking-wider text-[#575653] font-bold">Product likes</p>
          <p className="text-2xl font-display text-emerald-700">👍 {s.likes}</p>
        </div>
        <div className="p-4 bg-white border border-black/10">
          <p className="text-[10px] uppercase tracking-wider text-[#575653] font-bold">Product dislikes</p>
          <p className="text-2xl font-display text-rose-700">👎 {s.dislikes}</p>
        </div>
      </div>

      <section className="p-4 bg-white border border-black/10 space-y-2">
        <h2 className="text-sm font-bold">Notifications</h2>
        {data.activity.length === 0 ? (
          <p className="text-xs text-[#575653]">New reviews, likes and dislikes on your products will show here.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06] max-h-72 overflow-y-auto">
            {data.activity.map((a) => (
              <li key={a.id} className="py-2 text-xs flex justify-between gap-3">
                <span>{a.text}</span>
                <span className="text-[#575653] whitespace-nowrap">
                  {new Date(a.at).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-4 bg-white border border-black/10 space-y-2">
        <h2 className="text-sm font-bold">Likes & dislikes per product</h2>
        {products === null ? (
          <p className="text-xs text-[#575653]">Loading...</p>
        ) : reacted.length === 0 ? (
          <p className="text-xs text-[#575653]">No customer has liked or disliked your products yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#575653]">
                <th className="py-1 font-semibold">Product</th>
                <th className="py-1 font-semibold text-right">👍 Likes</th>
                <th className="py-1 font-semibold text-right">👎 Dislikes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {reacted.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-2 truncate max-w-[220px]">{p.name}</td>
                  <td className="py-1.5 text-right text-emerald-700 font-bold">{p.likes || 0}</td>
                  <td className="py-1.5 text-right text-rose-700 font-bold">{p.dislikes || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="p-4 bg-white border border-black/10 space-y-2">
        <h2 className="text-sm font-bold">Customer reviews</h2>
        {data.feedback.length === 0 ? (
          <p className="text-xs text-[#575653]">No reviews yet. Customers can rate you after their order is delivered.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {data.feedback.map((f) => (
              <li key={f.id} className="py-3 space-y-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[#F5A524] text-sm">{starText(f.rating)}</span>
                  <strong>{f.customerName}</strong>
                  <span className="text-[#575653]">Order {f.orderNumber} · {new Date(f.createdAt).toLocaleDateString('en-PK')}</span>
                  {f.status === 'HIDDEN' && (
                    <span className="px-1.5 py-0.5 bg-black/5 text-[10px] font-bold">Hidden by the store</span>
                  )}
                </div>
                {f.comment && <p className="whitespace-pre-line">{f.comment}</p>}
                {f.productNames?.length > 0 && <p className="text-[#575653] truncate">Bought: {f.productNames.join(', ')}</p>}
                {replyFor === f.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={600}
                      rows={2}
                      className={inputCls}
                      placeholder="Your public reply"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => saveReply(f.id)}
                        className="px-3 py-1.5 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? 'Saving...' : 'Save reply'}
                      </button>
                      <button type="button" onClick={() => setReplyFor('')} className="px-3 py-1.5 border border-black/20 cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {f.sellerReply && (
                      <p className="pl-3 border-l-2 border-[#0E7A43] text-[#454441]">
                        <strong>Your reply:</strong> {f.sellerReply}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyFor(f.id);
                        setReplyText(f.sellerReply || '');
                      }}
                      className="text-[#0E7A43] font-semibold underline cursor-pointer"
                    >
                      {f.sellerReply ? 'Edit reply' : 'Reply'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
    sellerType: 'INDIVIDUAL' as SellerType,
    countryCode: 'PK',
    shopName: '',
    ownerName: defaultName,
    businessName: '',
    phone: '',
    city: '',
    idNumber: '',
    taxId: '',
    address: '',
    warehouseCountry: 'PK',
    warehouseCity: '',
  });
  const [payout, setPayout] = useState<PayoutDetails>({ method: 'PK_BANK', accountHolder: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPay = (k: keyof PayoutDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setPayout((p) => ({ ...p, [k]: e.target.value }));
  const isPk = form.countryCode === 'PK';
  const dial = callingCodeOf(form.countryCode);
  // What the tax number is called in the seller's country
  const taxLabel =
    ({ PK: 'NTN', AE: 'TRN (VAT)', SA: 'VAT number', GB: 'VAT number', US: 'EIN', IN: 'GSTIN', CA: 'Business Number' } as Record<string, string>)[form.countryCode] ||
    'Tax ID / VAT number';
  // Choosing a country also suggests its payout method and makes it the warehouse country
  const chooseCountry = (code: string) => {
    setForm((f) => ({ ...f, countryCode: code, warehouseCountry: code }));
    setPayout((p) => ({ ...p, method: code === 'PK' ? 'PK_BANK' : code === 'US' ? 'US_ACH' : 'IBAN' }));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-display">Seller application</h1>
        <p className="text-xs text-[#575653]">
          Sellers from any country can apply to sell on {storeName}. Your ID, tax number and payout details are only visible
          to the store team, for verification and payouts.
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
            await api('/api/seller/apply', { method: 'POST', body: JSON.stringify({ ...form, payout }) });
            showToast('Application sent. Please wait for approval.');
            onSubmitted();
          } catch (err: any) {
            showToast(err.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        {/* Who and where */}
        <div className="sm:col-span-2">
          <span className={labelCls}>I am selling as *</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['INDIVIDUAL', 'Individual', 'A person selling under their own name'],
                ['BUSINESS', 'Business / company', 'A registered business (tax number needed)'],
              ] as const
            ).map(([v, t, h]) => (
              <label key={v} className={`p-2.5 border cursor-pointer flex gap-2 ${form.sellerType === v ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15'}`}>
                <input type="radio" name="sellerType" checked={form.sellerType === v} onChange={() => setForm((f) => ({ ...f, sellerType: v }))} className="mt-0.5" />
                <span>
                  <span className="block text-xs font-bold">{t}</span>
                  <span className="block text-[11px] text-[#575653]">{h}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Country of operation *</label>
          <select className={inputCls} value={form.countryCode} onChange={(e) => chooseCountry(e.target.value)}>
            {ALL_WORLD_COUNTRIES.map((c) => (
              <option key={c.isoCode} value={c.isoCode}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Shop name *</label>
          <input className={inputCls} value={form.shopName} onChange={set('shopName')} placeholder="e.g. Ali Electronics" required />
        </div>
        <div>
          <label className={labelCls}>Your full name *</label>
          <input className={inputCls} value={form.ownerName} onChange={set('ownerName')} required />
        </div>
        {form.sellerType === 'BUSINESS' && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Registered business name *</label>
            <input className={inputCls} value={form.businessName} onChange={set('businessName')} placeholder="As on your trade licence / registration" required />
          </div>
        )}
        <div>
          <label className={labelCls}>Mobile number *</label>
          <div className="flex">
            <span className="shrink-0 px-2.5 py-2 border border-r-0 border-black/20 bg-[#F4F3EF] text-xs font-mono font-semibold">+{dial}</span>
            <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder={isPk ? '03XXXXXXXXX' : 'Local mobile number'} inputMode="tel" required />
          </div>
        </div>
        <div>
          <label className={labelCls}>City *</label>
          <input className={inputCls} value={form.city} onChange={set('city')} placeholder={isPk ? 'e.g. Lahore' : 'e.g. Dubai'} required />
        </div>
        <div>
          <label className={labelCls}>{isPk ? 'CNIC *' : 'National ID / passport number *'}</label>
          <input className={inputCls} value={form.idNumber} onChange={set('idNumber')} placeholder={isPk ? 'XXXXX-XXXXXXX-X' : 'As on your ID document'} required />
        </div>
        <div>
          <label className={labelCls}>
            {taxLabel} {form.sellerType === 'BUSINESS' ? '*' : '(optional)'}
          </label>
          <input className={inputCls} value={form.taxId} onChange={set('taxId')} required={form.sellerType === 'BUSINESS'} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Business address *</label>
          <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} required />
        </div>

        {/* Warehouse: where orders are shipped from */}
        <div className="sm:col-span-2 pt-2 border-t border-black/10">
          <div className="text-xs font-bold">Warehouse (orders ship from here)</div>
        </div>
        <div>
          <label className={labelCls}>Warehouse country *</label>
          <select className={inputCls} value={form.warehouseCountry} onChange={set('warehouseCountry')}>
            {ALL_WORLD_COUNTRIES.map((c) => (
              <option key={c.isoCode} value={c.isoCode}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Warehouse city *</label>
          <input className={inputCls} value={form.warehouseCity} onChange={set('warehouseCity')} placeholder="City" required />
        </div>

        {/* Payout */}
        <div className="sm:col-span-2 pt-2 border-t border-black/10 space-y-2">
          <div className="text-xs font-bold">How you get paid *</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PAYOUT_METHODS.map((m) => (
              <label key={m.id} className={`p-2.5 border cursor-pointer flex gap-2 ${payout.method === m.id ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15'}`}>
                <input type="radio" name="payoutMethod" checked={payout.method === m.id} onChange={() => setPayout((p) => ({ ...p, method: m.id }))} className="mt-0.5" />
                <span>
                  <span className="block text-xs font-bold">{m.label}</span>
                  <span className="block text-[11px] text-[#575653]">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {payout.method !== 'PAYONEER' && (
          <div>
            <label className={labelCls}>Account holder name *</label>
            <input className={inputCls} value={payout.accountHolder} onChange={setPay('accountHolder')} required />
          </div>
        )}
        {payout.method !== 'PAYONEER' && (
          <div>
            <label className={labelCls}>Bank {payout.method === 'PK_BANK' ? '/ wallet *' : '(optional)'}</label>
            <input
              className={inputCls}
              value={payout.bankName || ''}
              onChange={setPay('bankName')}
              placeholder={payout.method === 'PK_BANK' ? 'e.g. MCB, Meezan, NayaPay' : 'e.g. Emirates NBD'}
              required={payout.method === 'PK_BANK'}
            />
          </div>
        )}
        {payout.method === 'PK_BANK' && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Account number / IBAN *</label>
            <input className={inputCls} value={payout.accountNumber || ''} onChange={setPay('accountNumber')} placeholder="PK36SCBL0000001123456702" required />
          </div>
        )}
        {payout.method === 'IBAN' && (
          <>
            <div>
              <label className={labelCls}>IBAN *</label>
              <input className={inputCls} value={payout.iban || ''} onChange={setPay('iban')} placeholder="AE07 0331 2345 6789 0123 456" required />
            </div>
            <div>
              <label className={labelCls}>SWIFT / BIC (optional)</label>
              <input className={inputCls} value={payout.swift || ''} onChange={setPay('swift')} placeholder="EBILAEAD" />
            </div>
          </>
        )}
        {payout.method === 'US_ACH' && (
          <>
            <div>
              <label className={labelCls}>Routing number *</label>
              <input className={inputCls} value={payout.routingNumber || ''} onChange={setPay('routingNumber')} placeholder="9 digits" inputMode="numeric" required />
            </div>
            <div>
              <label className={labelCls}>Account number *</label>
              <input className={inputCls} value={payout.accountNumber || ''} onChange={setPay('accountNumber')} inputMode="numeric" required />
            </div>
          </>
        )}
        {payout.method === 'PAYONEER' && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Payoneer account email *</label>
            <input className={inputCls} type="email" value={payout.payoneerEmail || ''} onChange={setPay('payoneerEmail')} required />
          </div>
        )}
        <p className="sm:col-span-2 text-[11px] text-[#575653]">
          Payouts are sent after delivery and the return window, in PKR or converted by your bank / Payoneer. The store checks
          these details before approving your shop.
        </p>
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

const DashboardTab: React.FC<{ onGo: (t: Tab) => void; seller: SellerShop }> = ({ onGo, seller }) => {
  const { settings } = useStore();
  // New sellers: 0% commission for the first days after approval (store setting)
  const freeDays = Number(settings.newSellerFreeDays ?? 30);
  const since = Date.parse((seller as any).approvedAt || (seller as any).createdAt || '');
  const freeUntil = freeDays > 0 && !isNaN(since) ? since + freeDays * 86400_000 : null;
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
  const [coach, setCoach] = useState<Coach | null>(memo.coach || null);
  const [coachBusy, setCoachBusy] = useState(false);
  const loadCoach = useCallback(async (fresh = false) => {
    setCoachBusy(true);
    try {
      const d = await api(`/api/seller/coach${fresh ? '?fresh=1' : ''}`);
      memo.coach = d.coach;
      setCoach(d.coach);
    } catch {
      // the rest of the dashboard still works
    } finally {
      setCoachBusy(false);
    }
  }, []);
  useEffect(() => {
    loadCoach();
  }, [loadCoach]);
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
      {freeUntil && freeUntil > Date.now() && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs">
          🎉 <strong>0% commission</strong> on every sale until{' '}
          {new Date(freeUntil).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })} — list your products and
          start selling!
        </div>
      )}
      {/* Inventory at a glance: new orders today and products running out */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="p-4 bg-white border border-black/10">
          <div className="text-[11px] text-[#575653]">New orders today</div>
          <div className="text-xl font-bold font-mono mt-1">{coach ? coach.newOrdersToday ?? 0 : '…'}</div>
        </div>
        <button type="button" onClick={() => onGo('PRODUCTS')} className="p-4 bg-white border border-black/10 text-left cursor-pointer">
          <div className="text-[11px] text-[#575653]">Running low (5 or fewer left)</div>
          {!coach ? (
            <div className="text-xs mt-1">…</div>
          ) : !coach.lowStock?.length ? (
            <div className="text-xs mt-1 text-emerald-700 font-semibold">All live products have enough stock.</div>
          ) : (
            <ul className="mt-1 space-y-0.5 text-xs">
              {coach.lowStock.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className={`font-mono font-bold ${p.stock <= 2 ? 'text-rose-700' : 'text-amber-700'}`}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </button>
      </div>
      {/* Shop Coach: health, charts and what to fix (also in the AI Assistant) */}
      <div className="p-4 bg-[#FBFBF9] border border-black/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#0E7A43]" />
            <strong className="text-sm">Shop Coach</strong>
            <span className="text-[11px] text-[#575653]">your shop's performance and what to improve</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onGo('AI')} className="px-3 py-1.5 bg-[#0E7A43] text-white text-xs font-bold cursor-pointer">
              Ask the AI coach
            </button>
            <button
              type="button"
              disabled={coachBusy}
              onClick={() => loadCoach(true)}
              className="px-3 py-1.5 border border-black/20 text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${coachBusy ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        <AutoFixBox onDone={() => loadCoach(true)} />
        {coach ? (
          <ShopCoachReport
            coach={coach}
            onGo={(t) => onGo(t as Tab)}
            compact
            onHide={async (key) => {
              try {
                await api('/api/seller/coach/hide', { method: 'POST', body: JSON.stringify({ key }) });
                loadCoach(true);
              } catch {}
            }}
            renderAction={(action, issue) =>
              action === 'REWRITE_ALL' ? (
                <RewriteAllButton onDone={() => loadCoach(true)} />
              ) : action === 'FIX_BRAND_NAMES' ? (
                <BrandFixActions
                  products={issue.products || []}
                  onDone={() => loadCoach(true)}
                  onEdit={(id) => {
                    pendingEditId = id;
                    onGo('PRODUCTS' as Tab);
                  }}
                />
              ) : null
            }
          />
        ) : (
          <p className="text-xs text-[#575653]">{coachBusy ? 'Preparing your shop report...' : 'The shop report is not available right now.'}</p>
        )}
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
  const [declineReply, setDeclineReply] = useState('');
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

      {/* The customer asked to cancel after the free-cancel time: accept (cancels the order) or decline */}
      {!closed && o.cancelRequest?.status === 'PENDING' && (
        <div className="p-3 bg-rose-50 border border-rose-300 space-y-2">
          <div className="font-bold text-rose-900">
            The customer asked to cancel this order: {o.cancelRequest.reason}
            {o.cancelRequest.note ? ` — "${o.cancelRequest.note}"` : ''}
          </div>
          <div className="text-[#454441]">
            If the parcel is not packed yet, please accept. Decline only when it is already being packed or sent, and say why.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => act(o, { status: 'CANCELLED' })} className={`${btn} bg-rose-700 text-white border-rose-700`}>
              Accept and cancel order
            </button>
            <input
              value={declineReply}
              onChange={(e) => setDeclineReply(e.target.value)}
              placeholder="Why it cannot be cancelled (e.g. already packed)"
              maxLength={200}
              className="flex-1 min-w-[180px] px-2 py-1.5 border border-black/20 bg-white"
            />
            <button
              type="button"
              disabled={busy || declineReply.trim().length < 5}
              onClick={() => act(o, { reply: declineReply.trim() }, '/api/seller/orders/cancel-request/decline')}
              className={`${btn} bg-white border-black/30`}
            >
              Decline
            </button>
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
  brand: '',
  primaryImage: '',
  images: [] as string[],
  videoUrl: '',
  brandProofUrl: '',
  flashPrice: '',
  flashEndsAt: '',
  shortDescription: '',
  description: '',
  weightKg: '0.5',
  dimensions: '',
  info: {} as ProductInfo,
  shipping: emptyShipping as ShippingForm,
  status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
  supplierName: '',
  supplierCostPrice: '',
  supplierProductUrl: '',
  supplierSku: '',
  adminHiddenReason: '',
};

type ProductFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'OUT' | 'ARCHIVED';

const ProductsTab: React.FC<{ uid: string; categoryNames: string[]; shipsFrom: string }> = ({ uid, categoryNames, shipsFrom }) => {
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
      const { product: full, supplier, brandProofUrl } = await api(`/api/seller/products/${encodeURIComponent(p.id)}`);
      const flashLive = Number(full.flashPrice) > 0 && full.flashEndsAt && Date.parse(full.flashEndsAt) > Date.now();
      setEditing({
        brandProofUrl: brandProofUrl || '',
        flashPrice: flashLive ? String(full.flashPrice) : '',
        flashEndsAt: flashLive ? full.flashEndsAt : '',
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
        brand: full.brand || '',
        primaryImage: full.primaryImage || '',
        images: Array.isArray(full.images) && full.images.length ? full.images : full.primaryImage ? [full.primaryImage] : [],
        videoUrl: full.videoUrl || '',
        shortDescription: full.shortDescription || '',
        description: full.description || '',
        weightKg: String(full.weightKg || 0.5),
        dimensions: full.dimensions || '',
        // Older products have no choice saved: their brand is the shop name unless a real one was set
        info: {
          ...(full.info || {}),
          brandType: full.info?.brandType || (full.brand && full.brand !== full.sellerName ? 'BRANDED' : 'NONE'),
        },
        shipping: shippingFormOf(full.shipping),
        status: full.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
      });
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setOpening(null);
    }
  };

  // Opened from the Shop Coach ("Fix it myself" → Edit): show that product's form right away
  useEffect(() => {
    if (!pendingEditId) return;
    const id = pendingEditId;
    pendingEditId = null;
    openEditor({ id } as ListProduct);
  }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.info.brandType) return showToast('Choose "Branded" or "No brand" for this product.');
    setSaving(true);
    try {
      const { product, heldForProof } = await api('/api/seller/products', {
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
          : heldForProof
          ? 'Saved as a draft: electronics and branded items need a purchase invoice or brand approval. Upload it to go live.'
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
          <div className="sm:col-span-2 p-3 border border-black/10 bg-[#FBFBF9] space-y-2">
            <span className={labelCls}>Brand *</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  ['BRANDED', 'Branded', 'Made by a known brand (e.g. Dolphin, Kemei, Samsung). Big brands and electronics need the purchase invoice.'],
                  ['NONE', 'No brand', 'Unbranded / generic item. Shown as "No brand"; the title may not use a brand’s name.'],
                ] as const
              ).map(([value, title, hint]) => (
                <label
                  key={value}
                  className={`p-2.5 border cursor-pointer flex gap-2 ${
                    editing.info.brandType === value ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15 bg-white hover:border-black/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="brandType"
                    checked={editing.info.brandType === value}
                    onChange={() => setEditing((p) => (p ? { ...p, info: { ...p.info, brandType: value } } : p))}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-bold text-[#141413]">{title}</span>
                    <span className="block text-[11px] text-[#575653]">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {editing.info.brandType === 'BRANDED' && (
              <input className={inputCls} value={editing.brand} onChange={set('brand')} maxLength={75} placeholder="Brand name, e.g. Dolphin" />
            )}
            {editing.info.brandType === 'NONE' && famousBrandIn(`${editing.name} ${editing.shortDescription}`) && (
              <p className="text-[11px] font-semibold text-rose-700">
                The title or short description mentions “{famousBrandIn(`${editing.name} ${editing.shortDescription}`)}”. Remove the brand’s name, or
                choose “Branded” and upload the purchase invoice.
              </p>
            )}
          </div>
          <div className="sm:col-span-2 p-3 border border-black/10 bg-[#FBFBF9]">
            <ProductMediaEditor
              images={editing.images}
              videoUrl={editing.videoUrl}
              onChange={(m) => setEditing((p) => (p ? { ...p, ...m, primaryImage: m.images[0] || '' } : p))}
              upload={uploadMedia}
              onError={showToast}
            />
          </div>
          {editing.id && <FlashDealBox productId={editing.id} price={Number(editing.price) || 0} current={editing.flashPrice ? { price: editing.flashPrice, endsAt: editing.flashEndsAt } : null} />}
          <div className="sm:col-span-2 p-3 border border-black/10 bg-[#FBFBF9] space-y-2">
            <span className="text-[11px] font-bold text-[#141413] block">
              Purchase invoice or brand approval (required for electronics and branded items)
            </span>
            <p className="text-[11px] text-[#575653]">
              Only the store sees this file. Electronics and well-known brands without it are saved as drafts.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {editing.brandProofUrl ? (
                <>
                  <a href={editing.brandProofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0E7A43] font-semibold underline">
                    View uploaded file
                  </a>
                  <button
                    type="button"
                    onClick={() => setEditing((p) => (p ? { ...p, brandProofUrl: '' } : p))}
                    className="px-2 py-1 border border-black/20 text-[11px] cursor-pointer"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <label className="px-3 py-1.5 border border-black/20 text-xs font-semibold cursor-pointer hover:border-black flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Upload invoice (PDF or picture)
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      try {
                        const url = await uploadMedia(f);
                        setEditing((p) => (p ? { ...p, brandProofUrl: url } : p));
                        showToast('Invoice uploaded. Save the product to keep it.');
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                  />
                </label>
              )}
            </div>
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
          <ProductInfoEditor
            info={editing.info}
            dimensions={editing.dimensions}
            onChange={(info) => setEditing((p) => (p ? { ...p, info } : p))}
            onDimensions={(dimensions) => setEditing((p) => (p ? { ...p, dimensions } : p))}
            upload={uploadMedia}
            onError={showToast}
          />
          <ProductShippingEditor
            value={editing.shipping}
            onChange={(shipping) => setEditing((p) => (p ? { ...p, shipping } : p))}
            fromCountry={shipsFrom}
          />
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
                {p.status === 'ACTIVE' && !p.adminHidden && (
                  <ShareProductButton
                    productId={p.id}
                    productName={p.name}
                    price={p.price}
                    className="px-2 py-1 border border-[#0E7A43] text-[#0E7A43] font-semibold flex items-center gap-1 cursor-pointer"
                    showToast={showToast}
                  />
                )}
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
    let held = 0;
    setProgress({ done: 0, total });
    try {
      for (let i = 0; i < total; i += BULK_CHUNK) {
        const chunk = ready.slice(i, i + BULK_CHUNK).map(({ problem, ...r }) => r);
        const d = await api('/api/seller/products/bulk', { method: 'POST', body: JSON.stringify({ products: chunk }) });
        sum.created += d.created || 0;
        sum.updated += d.updated || 0;
        held += d.heldForProof || 0;
        sum.errors.push(...(d.errors || []));
        setProgress({ done: Math.min(total, i + BULK_CHUNK), total });
      }
      setResult(sum);
      showToast(
        `${sum.created} new products, ${sum.updated} updated.` +
          (held ? ` ${held} electronics / branded items were saved as drafts: open each one and upload its invoice to go live.` : '')
      );
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

// ------------------------------------------------------------------ messages & notices

const THREAD_CATEGORY_LABELS: Record<string, string> = {
  ORDER: 'Order problem',
  PAYOUT: 'Payout / payment',
  PRODUCT: 'Product / listing',
  ACCOUNT: 'Account',
  OTHER: 'Other',
};
const threadStatusLabel: Record<string, string> = { OPEN: 'Waiting for store', ANSWERED: 'Store replied', CLOSED: 'Closed' };
const noticeTone: Record<string, string> = {
  INFO: 'bg-sky-50 border-sky-300 text-sky-950',
  WARNING: 'bg-amber-50 border-amber-400 text-amber-950',
  URGENT: 'bg-rose-50 border-rose-400 text-rose-950',
};
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const MessagesTab: React.FC<{ inbox: SellerInbox | null; reload: () => Promise<void> }> = ({ inbox, reload }) => {
  const { showToast } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  // Opening this tab counts as reading the store's notices
  useEffect(() => {
    if (!inbox || inbox.unread.notices === 0) return;
    api('/api/seller/notices/read', { method: 'POST' })
      .then(() => reload())
      .catch(() => {});
  }, [inbox?.unread.notices]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!inbox) return <p className="text-xs text-[#575653]">Loading messages...</p>;

  if (composing) {
    return (
      <NewThreadForm
        onCancel={() => setComposing(false)}
        onSent={async (id) => {
          setComposing(false);
          await reload();
          setOpenId(id);
          showToast('Message sent to the store.');
        }}
      />
    );
  }
  if (openId) {
    return <ThreadView id={openId} onBack={() => setOpenId(null)} onChanged={reload} />;
  }

  return (
    <div className="space-y-5 text-xs">
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[#141413]">Notices from the store</h2>
        {inbox.notices.length === 0 ? (
          <p className="p-4 bg-white border border-black/10 text-[#575653]">No notices yet.</p>
        ) : (
          inbox.notices.slice(0, 20).map((n) => (
            <div key={n.id} className={`p-3 border ${noticeTone[n.level] || noticeTone.INFO}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[13px]">
                  {n.level === 'URGENT' ? '⚠️ ' : n.level === 'WARNING' ? '❗ ' : ''}
                  {n.title}
                </strong>
                <span className="opacity-70">
                  {when(n.createdAt)}
                  {String(n.createdAt) > inbox.noticesReadAt && <span className="ml-1 font-bold">· New</span>}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line">{n.body}</p>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#141413]">Your conversations with the store</h2>
          <div className="flex gap-2">
            <button type="button" onClick={reload} className="px-3 py-1.5 border border-black/20 bg-white cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="px-4 py-1.5 bg-[#141413] text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New complaint / message
            </button>
          </div>
        </div>
        {inbox.threads.length === 0 ? (
          <p className="p-4 bg-white border border-black/10 text-[#575653]">
            No conversations yet. Have a problem with an order, a payout or your listings? Send the store a message.
          </p>
        ) : (
          <div className="bg-white border border-black/10 divide-y divide-black/[0.06]">
            {inbox.threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenId(t.id)}
                className={`w-full p-3 text-left flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-black/[0.02] ${
                  t.unreadForSeller ? 'bg-emerald-50/60' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {t.unreadForSeller && <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />}
                    <strong className="text-[13px] truncate">{t.subject}</strong>
                  </span>
                  <span className="block text-[#575653] truncate">
                    {t.lastFrom === 'ADMIN' ? 'Store: ' : 'You: '}
                    {t.lastMessagePreview}
                  </span>
                </span>
                <span className="text-right text-[#575653] shrink-0">
                  <span className="block font-semibold text-[#141413]">{threadStatusLabel[t.status] || t.status}</span>
                  {THREAD_CATEGORY_LABELS[t.category] || t.category} · {when(t.lastMessageAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const NewThreadForm: React.FC<{ onCancel: () => void; onSent: (id: string) => void }> = ({ onCancel, onSent }) => {
  const { showToast } = useStore();
  const [form, setForm] = useState({ category: 'ORDER', orderNumber: '', subject: '', text: '' });
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        try {
          const { thread } = await api('/api/seller/threads', { method: 'POST', body: JSON.stringify(form) });
          onSent(thread.id);
        } catch (err: any) {
          showToast(err.message);
        } finally {
          setSending(false);
        }
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-display">New complaint / message to the store</h2>
      <div>
        <label className={labelCls}>What is it about?</label>
        <select className={inputCls} value={form.category} onChange={set('category')}>
          {Object.entries(THREAD_CATEGORY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Order number (if it is about an order)</label>
        <input className={inputCls} value={form.orderNumber} onChange={set('orderNumber')} placeholder="e.g. ORD-123456" />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Subject *</label>
        <input className={inputCls} value={form.subject} onChange={set('subject')} placeholder="e.g. Payout not received" required />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Your message *</label>
        <textarea className={inputCls} rows={6} value={form.text} onChange={set('text')} placeholder="Explain the problem in detail." required />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={sending} className="px-5 py-2 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer">
          {sending ? 'Sending...' : 'Send to store'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 border border-black/20 cursor-pointer">
          Back
        </button>
      </div>
    </form>
  );
};

const ThreadView: React.FC<{ id: string; onBack: () => void; onChanged: () => Promise<void> }> = ({ id, onBack, onChanged }) => {
  const { showToast } = useStore();
  const [thread, setThread] = useState<SellerThread | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api(`/api/seller/threads/${encodeURIComponent(id)}`)
      .then((d) => {
        setThread(d.thread);
        onChanged();
      })
      .catch((err) => showToast(err.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const d = await api(`/api/seller/threads/${encodeURIComponent(id)}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: reply.trim() }),
      });
      setThread(d.thread);
      setReply('');
      onChanged();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-black/10 p-4 space-y-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-display">{thread?.subject || 'Loading...'}</h2>
          {thread && (
            <p className="text-[#575653]">
              {THREAD_CATEGORY_LABELS[thread.category] || thread.category}
              {thread.orderNumber ? ` · Order ${thread.orderNumber}` : ''} · {threadStatusLabel[thread.status] || thread.status}
            </p>
          )}
        </div>
        <button type="button" onClick={onBack} className="px-4 py-1.5 border border-black/20 cursor-pointer">
          Back
        </button>
      </div>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {(thread?.messages || []).map((m) => (
          <div key={m.id} className={`flex ${m.from === 'SELLER' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 border whitespace-pre-line ${
                m.from === 'SELLER' ? 'bg-[#141413] text-white border-[#141413]' : 'bg-emerald-50 border-emerald-300 text-[#141413]'
              }`}
            >
              <div className={`text-[10px] font-bold mb-0.5 ${m.from === 'SELLER' ? 'text-white/70' : 'text-emerald-800'}`}>
                {m.from === 'SELLER' ? 'You' : 'Store team'} · {when(m.at)}
              </div>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {thread && (
        <div className="space-y-2 pt-2 border-t border-black/10">
          {thread.status === 'CLOSED' && (
            <p className="text-[#575653]">The store closed this conversation. Writing again will reopen it.</p>
          )}
          <textarea
            className={inputCls}
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply..."
          />
          <button
            type="button"
            disabled={sending || !reply.trim()}
            onClick={send}
            className="px-5 py-2 bg-[#141413] text-white font-bold disabled:opacity-50 cursor-pointer"
          >
            {sending ? 'Sending...' : 'Send'}
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
          ['Ready for payout', s.available, 'Return period over, not yet paid out'],
          ['On hold (return period)', s.onHold ?? 0, `Delivered less than ${data.escrowDays ?? 7} days ago`],
          ['Upcoming earnings', s.pending, 'Orders not delivered yet'],
          ...(Number(s.returnCharges) > 0 ? [['Return charges', -Number(s.returnCharges), 'Taken off your next payout']] : []),
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
        commission + shipping) is held for the customer's {data.escrowDays ?? 7}-day return period, then moves to "Ready for
        payout" and the store transfers it to your bank account. Return shipping for returns that were your fault is taken
        off the payout.
      </p>
      {Array.isArray(data.charges) && data.charges.length > 0 && (
        <div className="bg-white border border-black/10">
          <div className="px-4 py-2 border-b border-black/10 text-xs font-bold">Return charges (unpaid)</div>
          <ul className="divide-y divide-black/[0.06] text-xs">
            {data.charges.map((c: any) => (
              <li key={c.id} className="px-4 py-2 flex flex-wrap justify-between gap-2">
                <span>Order {c.orderNumber}</span>
                <span className="text-[#575653]">{c.reason}</span>
                <span className="font-mono font-bold text-rose-700">−{formatPKR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
