import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  askForNotifications,
  notificationsAllowed,
  notificationsBlocked,
  notificationsSupported,
  notify,
  onNotificationOpen,
  playChime,
  setSoundOn,
  soundOn,
  unlockSoundOnFirstTap,
} from '../services/sellerAlerts';
import { useTabHistory } from '../hooks/useTabHistory';
import { CourierBookBox } from './CourierBookBox';
import { courierApi } from '../services/courierClient';
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
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { SellerAiAssistant } from './SellerAiAssistant';
import { QuestionsInbox, sellerWaitingQuestions } from './QuestionsInbox';
import { OrderChat } from './OrderChat';
import { SellerSocialLinks } from './SellerSocialLinks';
import { ProductInfoEditor } from './ProductInfoEditor';
import { SellerOnboardingWizard } from './SellerOnboardingWizard';
import { ProductShippingEditor, emptyShipping, shippingFormOf, type ShippingForm } from './ProductShippingEditor';
import type { ProductInfo } from '../services/productInfo';
import { famousBrandIn } from '../services/brandRules';
import { CategoryPicker, VariantsEditor, type VariantRow } from './SellerListingFields';
import { groupOfCategory, suggestCategories } from '../data/productCategories';
import { DIRECT_SOURCE, SOURCE_APPS, isDirectSource, normalizeSource } from '../services/productSource';
import { fixLink } from './ProductMediaEditor';
import { ShareProductButton, storeOrigin } from './ShareProductButton';
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
import { LoginStepUp } from './LoginStepUp';
import { PWAInstallButton } from './PWAInstallButton';
import { SellerAvatar } from './SellerAvatar';
import { BrandLogo } from './BrandLogo';
import { ProductMediaEditor } from './ProductMediaEditor';
import { formatPKR } from '../services/abstractions';
import type { Product, Order, SellerShop, SellerPrivate, SellerPayout } from '../types/store';
import { HelpDot } from './HelpDot';
import { Callout, Empty, FormSection, HowItWorks, Loading, MoreMenu, OrderSteps, Panel, SegTabs, Stat, chipTone, ui } from './SellerUi';
import { ProductTypeChosen, ProductTypeFields, ProductTypePicker, priceLabelFor, type DeliveryForm } from './SellerProductType';
import { ProductTypeBadge } from './ProductTypeIcon';
import { typeInfo, type ProductType, type ProductTypeDetails } from '../services/productTypes';
import { SellerShell } from './SellerShell';
import { SellerLanding } from './SellerLanding';
import { AdminAiKeysPanel } from './AdminAiKeysPanel';
import { VideoFixActions, VideoMakerModal } from './AiVideoMaker';
import { AiKeyNudge, askForAiKey } from './AiKeyNudge';

// Seller Center (/seller): marketplace sellers apply, then manage their own products, orders,
// shipping/tracking and earnings. Everything goes through the /api/seller/* server routes.
//
// It opens instantly: the shop and product list from the last visit are shown at once (Firebase can
// take many seconds to restore a sign-in) and refreshed in the background.

const SELLER_TABS = ['DASHBOARD', 'AI', 'PRODUCTS', 'ORDERS', 'RETURNS', 'EARNINGS', 'REVIEWS', 'QUESTIONS', 'MESSAGES', 'PROFILE', 'RULES'] as const;
type Tab = (typeof SELLER_TABS)[number];

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
type NoticeSource = 'CUSTOMER' | 'ADMIN' | 'STORE' | 'COACH';
type StoreNotice = {
  id: string;
  title: string;
  body: string;
  level: 'INFO' | 'WARNING' | 'URGENT';
  createdAt: string;
  audience: string;
  source?: NoticeSource;
};
type SellerInbox = {
  threads: SellerThread[];
  notices: StoreNotice[];
  noticesReadAt: string;
  /** notices = from customers and the store team; coach = the AI coach's tips (kept off the bell) */
  unread: { threads: number; notices: number; coach?: number };
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
type ListProduct = Pick<Product, 'id' | 'sku' | 'name' | 'price' | 'stock' | 'category' | 'status' | 'primaryImage' | 'productType'> & {
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
  // Today's free AI uses are finished: ask the seller to add their own free AI key
  if (data?.code === 'AI_KEY_NEEDED' || data?.aiKeyNeeded) askForAiKey(data?.code === 'AI_KEY_NEEDED' ? data.error : data?.message);
  if (!res.ok) {
    // No answer from the store itself (e.g. the connection dropped): say so instead of a vague error
    const message =
      data?.error ||
      (res.status >= 500 || res.status === 0
        ? 'Could not reach the store right now (connection problem). Wait a minute and try again.'
        : res.status === 413
        ? 'The file is too large.'
        : 'Something went wrong. Please try again.');
    throw Object.assign(new Error(message), { code: data?.code });
  }
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

const inputCls = ui.input;
const labelCls = ui.fieldLabel;

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
    stepUpOk,
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
  // The phone's back button goes to the previous tab
  useTabHistory(tab, setTab, (t) => SELLER_TABS.includes(t as Tab));

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

  // Seller login check (captcha / email code) when the server has it switched on
  const [sellerCheckRequired, setSellerCheckRequired] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    fetch('/api/auth/step-up/config')
      .then((r) => r.json())
      .then((c) => setSellerCheckRequired(Boolean(c.sellerRequired)))
      .catch(() => setSellerCheckRequired(false));
  }, []);
  const needsLoginCheck = Boolean(firebaseUser && sellerCheckRequired && !stepUpOk);

  useEffect(() => {
    if (authReady && sellerCheckRequired !== undefined && !needsLoginCheck) loadMe();
  }, [authReady, loadMe, sellerCheckRequired, needsLoginCheck]);

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

  // The ring: new orders and new customer chat messages play a chime (and a phone notification when
  // allowed). Checked every 45 s, also while the app is in the background (browsers slow that to ~1/min).
  const [alerts, setAlerts] = useState<{ chats: number; newOrders: number } | null>(null);
  const [sound, setSound] = useState(soundOn);
  const lastAlerts = useRef<{ chats: number; newOrders: number } | null>(null);
  const checkAlerts = useCallback(async () => {
    try {
      const d = await api<{ chats: number; chatOrders: number; newOrders: number }>('/api/seller/alerts');
      const prev = lastAlerts.current;
      lastAlerts.current = { chats: d.chats, newOrders: d.newOrders };
      setAlerts({ chats: d.chats, newOrders: d.newOrders });
      if (!prev) return; // first check: nothing "new" yet
      const moreOrders = d.newOrders > prev.newOrders;
      const moreChats = d.chats > prev.chats;
      if (!moreOrders && !moreChats) return;
      if (soundOn()) playChime(moreOrders ? 'order' : 'message');
      if (moreOrders) {
        const n = d.newOrders - prev.newOrders;
        showToast(`🔔 ${n} new order${n > 1 ? 's' : ''}!`);
        notify('🛍️ New order', `You have ${d.newOrders} order${d.newOrders > 1 ? 's' : ''} to confirm.`, 'ORDERS');
      }
      if (moreChats) {
        showToast('💬 A customer sent you a message.');
        notify('💬 New customer message', 'Open Orders to reply in the order chat.', 'ORDERS');
      }
    } catch {
      // the next check will try again
    }
  }, [showToast]);
  useEffect(() => {
    if (!authReady || !approved) return;
    unlockSoundOnFirstTap();
    checkAlerts();
    const t = setInterval(checkAlerts, 45_000);
    const back = () => document.visibilityState === 'visible' && checkAlerts();
    document.addEventListener('visibilitychange', back);
    const off = onNotificationOpen((t) => setTab(t as Tab));
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', back);
      off();
    };
  }, [authReady, approved, checkAlerts]);
  const ordersBadge = (alerts?.newOrders || 0) + (alerts?.chats || 0);

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
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E7E5DF]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BrandLogo name={storeName} size="sm" />
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#0E7A43] text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
              Seller Center
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`${storeOrigin()}/`} className="text-xs font-semibold text-[#3A3936] hover:bg-[#F2F1EC] px-3 py-1.5 rounded-lg hidden sm:inline">
              View store
            </a>
            <PWAInstallButton />
            {uid && (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-lg border border-[#E7E5DF] text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-[#F2F1EC]"
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

  if (needsLoginCheck) return <LoginStepUp portal="SELLER" />;

  if (!authReady || (uid && loadingMe && !seller)) {
    return shell(<div className="p-10 text-center text-sm text-[#575653]">Opening Seller Center...</div>);
  }

  if (!uid) {
    // Seller app home page: offers, benefits, how it works, FAQ, with the sign-up / login box
    return shell(
      <SellerLanding
        authPanel={
          <AuthPanel
            title="Seller login / new account"
            subtitle="Step 1 of 5: create your account (or sign in). Then 4 short steps for your shop, ID, payout and review."
            allowSignup
            strongPassword
          />
        }
      />
    );
  }

  if (!seller || seller.status === 'REJECTED') {
    return shell(
      <SellerOnboardingWizard
        uid={uid}
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
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className={`${ui.card} p-8 text-center space-y-4`}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center text-2xl">⏳</div>
          <h1 className="text-[22px] font-bold tracking-tight">Your application is under review</h1>
          <p className="text-[13px] text-[#55534E]">
            We have received the application for <strong>{seller.shopName}</strong>. The {storeName} team will review and approve it. Once approved you
            can start adding products here.
          </p>
          <button type="button" onClick={loadMe} className={ui.secondary}>
            <RefreshCw className="w-3.5 h-3.5" /> Check again
          </button>
        </div>
      </div>
    );
  }

  if (seller.status === 'SUSPENDED') {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-[22px] font-bold tracking-tight">
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
    { id: 'ORDERS', label: 'Orders', icon: ShoppingCart, badge: ordersBadge },
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

  // Each page's title, one-line explanation and "?" guide (shown in the page header)
  const PAGES: Record<string, { title: string; description: string; help?: string }> = {
    DASHBOARD: { title: 'Dashboard', description: '', help: 'seller.tab.DASHBOARD' },
    ORDERS: { title: 'Orders', description: 'Confirm, pack, ship and deliver your orders.', help: 'seller.tab.ORDERS' },
    RETURNS: { title: 'Returns', description: 'Return requests from customers and your side of the story.', help: 'seller.tab.RETURNS' },
    PRODUCTS: { title: 'Products', description: 'Add, edit and bulk-upload the products of your shop.', help: 'seller.tab.PRODUCTS' },
    REVIEWS: { title: 'Reviews', description: 'Your rating, customer reviews, likes and dislikes.', help: 'seller.tab.REVIEWS' },
    QUESTIONS: { title: 'Questions', description: 'Customers ask about your products; your answers show to everyone.', help: 'seller.tab.QUESTIONS' },
    MESSAGES: { title: 'Messages', description: 'Customers, the store team and the AI coach, each in its own box.', help: 'seller.tab.MESSAGES' },
    EARNINGS: { title: 'Earnings & payouts', description: 'What you earned on each order and what was paid to you.', help: 'seller.tab.EARNINGS' },
    AI: { title: 'AI Assistant', description: 'Ask about your shop, get descriptions written and fixes suggested.', help: 'seller.tab.AI' },
    PROFILE: { title: 'Profile & payout', description: '', help: 'seller.tab.PROFILE' },
    RULES: { title: 'Seller rules', description: 'The rules every shop on the marketplace follows.', help: 'seller.tab.RULES' },
  };
  const byId = Object.fromEntries(tabs.map((t) => [t.id, t]));
  const groups = [
    { label: 'Overview', tabs: [byId.DASHBOARD] },
    { label: 'Sales', tabs: [byId.ORDERS, byId.RETURNS] },
    { label: 'Catalog', tabs: [byId.PRODUCTS] },
    { label: 'Customers', tabs: [byId.REVIEWS, byId.QUESTIONS, byId.MESSAGES] },
    { label: 'Finance', tabs: [byId.EARNINGS] },
    { label: 'Growth', tabs: [byId.AI] },
    { label: 'Account', tabs: [byId.PROFILE, { id: 'RULES', label: 'Seller rules', icon: ShieldCheck }] },
  ];
  const followers = Number((seller as any).followers) || 0;

  return (
    <SellerShell
      storeName={storeName}
      shopName={seller.shopName}
      shopLogo={seller.logoUrl || firebaseUser?.photoURL}
      shopUrl={`${storeOrigin()}/#shop/${encodeURIComponent(seller.id || uid)}`}
      storeUrl={`${storeOrigin()}/`}
      subtitle={
        <>
          Commission {commissionPercent ?? 0}% · {seller.city}
          {followers > 0 ? ` · ${followers.toLocaleString('en-PK')} ${followers === 1 ? 'follower' : 'followers'}` : ''}
        </>
      }
      groups={groups}
      mobileTabs={['DASHBOARD', 'ORDERS', 'PRODUCTS', 'MESSAGES']}
      active={tab}
      onTab={(id) => setTab(id as Tab)}
      page={PAGES[tab] || PAGES.DASHBOARD}
      unread={unreadTotal}
      topExtra={
        <button
          type="button"
          aria-label={sound ? 'Turn the order bell sound off' : 'Turn the order bell sound on'}
          title={sound ? 'Bell sound on (tap to turn off)' : 'Bell sound off (tap to turn on)'}
          onClick={() => {
            const next = !sound;
            setSoundOn(next);
            setSound(next);
            if (next) playChime('message');
            showToast(next ? '🔔 Bell sound on' : '🔕 Bell sound off');
          }}
          className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#F2F1EC] cursor-pointer text-[17px]"
        >
          {sound ? '🔊' : '🔇'}
        </button>
      }
      onSignOut={handleSignOut}
      banner={
        tab !== 'MESSAGES' && unreadTotal > 0 ? (
          <button
            type="button"
            onClick={() => setTab('MESSAGES')}
            className={`w-full p-3 rounded-xl text-left text-xs border cursor-pointer ${
              urgentNotice ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-sky-50 border-sky-200 text-sky-950'
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
        ) : null
      }
    >
      {/* Asks shops without their own free AI key to add one (welcome step + when the free uses run out) */}
      <AiKeyNudge
        onAddKey={() => {
          setTab('AI');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {(tab === 'DASHBOARD' || tab === 'ORDERS') && <AlertsSetupCard />}
      {tab === 'DASHBOARD' && <DashboardTab onGo={setTab} seller={seller} />}
      {tab === 'ORDERS' && <OrdersTab refreshKey={`${alerts?.newOrders || 0}-${alerts?.chats || 0}`} />}
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
        <div className="space-y-4">
          {/* The seller's own free Gemini keys (shown first): their AI work uses these first */}
          <div className="bg-white">
            <AdminAiKeysPanel apiBase="/api/seller/ai-keys" forSeller />
          </div>
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
        </div>
      )}
      {tab === 'RULES' && (
        <Panel
          title="Supplier Code of Conduct"
          subtitle={`You accepted these rules on ${
            (seller as any).conductAcceptedAt ? new Date((seller as any).conductAcceptedAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' }) : 'joining'
          }`}
          icon={<ShieldCheck className="w-4 h-4" />}
        >
          <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} />
        </Panel>
      )}
      {tab === 'REVIEWS' && <ReviewsTab onSeen={clearActivity} />}
      {tab === 'QUESTIONS' && <QuestionsInbox mode="seller" onWaitingChange={setQuestionsWaiting} />}
      {tab === 'MESSAGES' && <MessagesTab inbox={inbox} reload={loadInbox} onTab={(t) => setTab(t as Tab)} />}
      {tab === 'PROFILE' &&
        (sellerPrivate ? (
          <ProfileTab seller={seller} privateData={sellerPrivate} onSaved={loadMe} commissionPercent={commissionPercent ?? 0} followers={followers} />
        ) : (
          <Loading text="Loading your profile..." />
        ))}
      {tab === 'PROFILE' && (
        // The rules this shop has agreed to follow
        <details className={`group ${ui.card}`}>
          <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span>
              <strong className="block text-[14px]">Seller Rules (Supplier Code of Conduct)</strong>
              <span className="text-[12px] text-[#6B6963]">
                Accepted on{' '}
                {(seller as any).conductAcceptedAt ? new Date((seller as any).conductAcceptedAt).toLocaleDateString('en-PK') : 'joining'} · tap to
                read
              </span>
            </span>
            <span className="text-xs font-semibold text-[#0E7A43] group-open:hidden">Show</span>
            <span className="text-xs font-semibold text-[#0E7A43] hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-5 pb-5 border-t border-[#EFEDE8] pt-4">
            <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} compact />
          </div>
        </details>
      )}
    </SellerShell>
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
    <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-emerald-950">
            {count ? `${count} thing${count > 1 ? 's' : ''} the coach can fix for you` : '✓ Nothing to fix right now'}
          </div>
          <div className="text-[11.5px] text-emerald-900/70">
            {plan.lastRunAt
              ? `Last run ${new Date(plan.lastRunAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
              : 'Hides out-of-stock products and improves weak descriptions'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[12px] font-semibold cursor-pointer">
            <input type="checkbox" checked={plan.enabled} onChange={(e) => toggle(e.target.checked)} className="accent-[#0E7A43]" />
            Every day
          </label>
          <button type="button" disabled={busy} onClick={run} className={ui.primary}>
            {busy ? 'Fixing...' : '⚡ Auto-fix now'}
          </button>
        </div>
      </div>
      {count > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className={ui.link}>
          {open ? 'Hide details' : 'What will it change?'}
        </button>
      )}
      {result && (
        <p className="px-3 py-2 rounded-lg bg-white border border-emerald-200 text-emerald-900">
          {result} Anything still listed below needs you: press its “Fix it” button.
        </p>
      )}
      {open && (
        <div className="px-3 py-2.5 rounded-lg bg-white border border-[#E7E5DF] space-y-2">
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
      <div className="flex flex-wrap gap-2 mt-1">
        <button type="button" disabled={busy} onClick={selfFix} className={ui.primary}>
          {busy ? 'Fixing...' : '✨ Self fix it'}
        </button>
        <button type="button" onClick={() => setListOpen((o) => !o)} className={ui.secondary}>
          {listOpen ? 'Hide list' : `Fix it myself (${products.length})`}
        </button>
      </div>
      {listOpen && (
        <ul className="bg-white rounded-xl border border-[#E7E5DF] divide-y divide-[#EFEDE8] max-h-72 overflow-y-auto">
          {products.map((p) => (
            <li key={p.id} className="px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate" title={p.name}>
                {p.name}
              </span>
              <span className={`${ui.chip} ${chipTone.red} shrink-0`}>{p.brand}</span>
              <button type="button" onClick={() => onEdit(p.id)} className={`${ui.secondary} !py-1 shrink-0`}>
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
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className="w-40 h-2 bg-[#EFEDE8] rounded-full overflow-hidden">
          <div className="h-2 bg-[#0E7A43] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums">
          Writing {job.done} / {job.total}… (you can leave this page)
        </span>
        <button type="button" onClick={() => api('/api/seller/coach/rewrite-all', { method: 'POST', body: JSON.stringify({ stop: true }) }).then((d) => setJob(d.job))} className={ui.link}>
          Stop
        </button>
      </div>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <button type="button" disabled={starting} onClick={start} className={ui.primary}>
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
    <div className="sm:col-span-2 p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2.5 text-[12.5px]">
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-rose-800">⚡ Flash deal</span>
        <span className="text-[11.5px] text-[#6B6963]">limited-time price with a countdown in the store</span>
        <HelpDot id="seller.deals" />
      </div>
      {deal ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${ui.chip} ${chipTone.red}`}>Live</span>
          <span>
            Deal price <strong>{formatPKR(Number(deal.price))}</strong> until{' '}
            {new Date(deal.endsAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
          <button type="button" disabled={busy} onClick={() => save({ clear: true })} className={ui.secondary}>
            End deal
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputCls} !w-32`} value={dealPrice} onChange={(e) => setDealPrice(e.target.value)} placeholder="Deal price" inputMode="numeric" />
            <span className="text-[#6B6963]">for</span>
            <select className={`${inputCls} !w-32`} value={hours} onChange={(e) => setHours(e.target.value)}>
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
              className={ui.dangerSolid}
            >
              Start deal
            </button>
          </div>
          <p className="text-[11.5px] text-[#8A8780]">Must be lower than {formatPKR(price)}. You pay for the discount.</p>
        </>
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
      <div className={`${ui.card} p-5 sm:p-7 space-y-4`}>
        <div>
          <div className={ui.label}>Seller rules</div>
          <h1 className="text-[22px] font-bold tracking-tight">Please read and accept</h1>
          <p className="text-[12.5px] text-[#6B6963] mt-1">
            {shopName}: to keep selling, accept the store's Supplier Code of Conduct. Several rules are applied automatically.
          </p>
        </div>
        <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} />
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F7F6F2] border border-[#E7E5DF] text-[13px] font-semibold cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0E7A43]" />
          I have read these rules and my shop will follow them.
        </label>
        <button type="button" disabled={!agreed || saving} onClick={accept} className={`${ui.primary} !px-6 !py-2.5 !text-[13px]`}>
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

  if (!list) return <Loading text="Loading return requests..." />;
  const open = list.filter((r) => r.status === 'OPEN').length;
  return (
    <div className="space-y-4">
      <HowItWorks title="How returns work">
        <p>Customers can ask for a return or replacement within 7 days of delivery. The store decides each request, so give your side before it does.</p>
        <p>Upheld complaints count against the product (3 customers = delisted, fake = locked) and the return shipping is taken off your payout.</p>
      </HowItWorks>
      {list.length === 0 ? (
        <Panel>
          <Empty icon="↩️" title="No return requests" text="Keep it up! Requests from customers will show here." />
        </Panel>
      ) : (
        <>
          {open > 0 && (
            <Callout tone="warning" icon="⏳">
              <strong>{open}</strong> request{open > 1 ? 's are' : ' is'} waiting for the store. Give your side before it decides.
            </Callout>
          )}
          {list.map((r) => {
            const tone = r.status === 'OPEN' ? chipTone.amber : r.status === 'APPROVED' ? chipTone.red : chipTone.green;
            return (
              <article key={r.id} className={`${ui.card} text-[12.5px] overflow-hidden`}>
                <header className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[#EFEDE8] bg-[#FBFBF9]">
                  <span className="font-mono font-bold text-[13px]">{r.orderNumber}</span>
                  <span className={`${ui.chip} ${tone}`}>
                    {r.status === 'OPEN' ? 'Waiting for the store' : r.status === 'APPROVED' ? 'Return approved' : 'Rejected'}
                  </span>
                  <span className={`${ui.chip} ${chipTone.grey}`}>{r.resolution === 'REPLACEMENT' ? 'Wants a replacement' : 'Wants a refund'}</span>
                  {r.fault === 'SELLER' && <span className={`${ui.chip} ${chipTone.red}`}>Your responsibility · −{formatPKR(r.returnCharge || 0)}</span>}
                  <span className="ml-auto text-[11px] text-[#8A8780]">{new Date(r.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
                </header>
                <div className="p-4 space-y-3">
                  <div>
                    <div className={ui.label}>Reason</div>
                    <div className="font-semibold">{REASON_LABEL[r.reason] || r.reason}</div>
                    <div className="text-[#6B6963] truncate">{(r.items || []).map((it: any) => it.name).join(', ')}</div>
                  </div>
                  <blockquote className="px-3 py-2 rounded-lg bg-[#F7F6F2] text-[#3A3936] whitespace-pre-line">“{r.details}”</blockquote>
                  {r.photos?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {r.photos.map((p: string) => (
                        <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                          <img src={p} alt="Customer photo" className="w-16 h-16 rounded-lg object-cover border border-[#E7E5DF]" />
                        </a>
                      ))}
                    </div>
                  )}
                  {r.sellerResponse && replyFor !== r.id && (
                    <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-[11px] font-bold text-emerald-800">Your reply</div>
                      {r.sellerResponse}
                    </div>
                  )}
                  {r.decisionNote && (
                    <div className="px-3 py-2 rounded-lg bg-[#F2F1EC] border border-[#E7E5DF]">
                      <div className="text-[11px] font-bold text-[#55534E]">Store decision</div>
                      {r.decisionNote}
                    </div>
                  )}
                  {r.status === 'OPEN' &&
                    (replyFor === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={3}
                          maxLength={1500}
                          className={inputCls}
                          placeholder="Your side (e.g. the item was checked before dispatch; packing photo...)"
                        />
                        <div className="flex gap-2">
                          <button type="button" disabled={saving || !reply.trim()} onClick={() => send(r.id)} className={ui.primary}>
                            {saving ? 'Sending...' : 'Send to the store'}
                          </button>
                          <button type="button" onClick={() => setReplyFor('')} className={ui.secondary}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyFor(r.id);
                            setReply(r.sellerResponse || '');
                          }}
                          className={r.sellerResponse ? ui.secondary : ui.primary}
                        >
                          {r.sellerResponse ? 'Edit your reply' : 'Give your side'}
                        </button>{' '}
                        <HelpDot id="seller.returns.reply" />
                      </div>
                    ))}
                </div>
              </article>
            );
          })}
        </>
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
      <Callout tone="danger" icon="⚠️" action={<button type="button" onClick={load} className={ui.secondary}>Try again</button>}>
        {error}
      </Callout>
    );
  }
  if (!data) return <Loading text="Loading your reviews..." />;

  const s = data.summary;
  const reacted = (products || [])
    .filter((p) => (p.likes || 0) + (p.dislikes || 0) > 0)
    .sort((a, b) => (b.likes || 0) + (b.dislikes || 0) - ((a.likes || 0) + (a.dislikes || 0)));
  const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Customer rating"
          value={s.ratingCount ? s.ratingAvg.toFixed(1) : '—'}
          hint={<span className="text-[#F5A524] text-[13px]">{s.ratingCount ? starText(s.ratingAvg) : 'No ratings yet'}</span>}
          icon={Star}
          tone="bg-amber-100 text-amber-800"
        />
        <Stat
          label="Reviews"
          value={s.ratingCount}
          hint={s.ratingCount ? `${s.positivePercent}% positive` : 'From delivered orders'}
          icon={MessageSquare}
          tone="bg-sky-100 text-sky-800"
        />
        <Stat label="Product likes" value={`👍 ${s.likes}`} valueClass="text-emerald-700" hint="Customers who liked a product" />
        <Stat label="Product dislikes" value={`👎 ${s.dislikes}`} valueClass="text-rose-700" hint="Read why in the reviews below" />
      </div>

      <Panel title="Customer reviews" help={<HelpDot id="seller.reviews.reply" />} subtitle="Your reply shows on your shop page for everyone." flush>
        {data.feedback.length === 0 ? (
          <Empty icon="⭐" title="No reviews yet" text="Customers can rate you after their order is delivered." />
        ) : (
          <ul className="divide-y divide-[#EFEDE8]">
            {data.feedback.map((f) => (
              <li key={f.id} className="px-4 sm:px-5 py-4 space-y-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[#F5A524] text-[15px] leading-none">{starText(f.rating)}</span>
                  <strong>{f.customerName}</strong>
                  {f.status === 'HIDDEN' && <span className={`${ui.chip} ${chipTone.grey}`}>Hidden by the store</span>}
                  <span className="ml-auto text-[11px] text-[#8A8780]">
                    Order {f.orderNumber} · {new Date(f.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {f.comment && <p className="whitespace-pre-line text-[#2A2A28]">{f.comment}</p>}
                {f.productNames?.length > 0 && <p className="text-[11.5px] text-[#8A8780] truncate">Bought: {f.productNames.join(', ')}</p>}
                {replyFor === f.id ? (
                  <div className="space-y-2">
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={600} rows={2} className={inputCls} placeholder="Your public reply" />
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => saveReply(f.id)} className={ui.primary}>
                        {saving ? 'Saving...' : 'Save reply'}
                      </button>
                      <button type="button" onClick={() => setReplyFor('')} className={ui.secondary}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {f.sellerReply && (
                      <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="text-[11px] font-bold text-emerald-800">Your reply</div>
                        {f.sellerReply}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyFor(f.id);
                        setReplyText(f.sellerReply || '');
                      }}
                      className={ui.link}
                    >
                      {f.sellerReply ? 'Edit reply' : '↩ Reply'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Likes & dislikes per product" flush>
          {products === null ? (
            <div className="p-4">
              <Loading rows={2} />
            </div>
          ) : reacted.length === 0 ? (
            <Empty icon="👍" title="No likes or dislikes yet" />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[#8A8780]">
                  <th className="px-4 sm:px-5 py-2 font-bold">Product</th>
                  <th className="px-2 py-2 font-bold text-right">Likes</th>
                  <th className="px-4 sm:px-5 py-2 font-bold text-right">Dislikes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEDE8]">
                {reacted.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 sm:px-5 py-2 truncate max-w-[220px]">{p.name}</td>
                    <td className="px-2 py-2 text-right text-emerald-700 font-bold tabular-nums">{p.likes || 0}</td>
                    <td className="px-4 sm:px-5 py-2 text-right text-rose-700 font-bold tabular-nums">{p.dislikes || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent activity" subtitle="New reviews, likes and dislikes" flush>
          {data.activity.length === 0 ? (
            <Empty icon="🔔" title="Nothing new" text="New reviews, likes and dislikes on your products will show here." />
          ) : (
            <ul className="divide-y divide-[#EFEDE8] max-h-80 overflow-y-auto">
              {data.activity.map((a) => (
                <li key={a.id} className="px-4 sm:px-5 py-2.5 text-[12.5px] flex justify-between gap-3">
                  <span>{a.text}</span>
                  <span className="text-[11px] text-[#8A8780] whitespace-nowrap">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
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
    { label: 'Orders to ship', value: orders ? String(toShip) : '…', tab: 'ORDERS' as Tab, strong: toShip > 0, icon: Package, tone: 'bg-amber-100 text-amber-800', hint: toShip > 0 ? 'Ship within 48 hours' : 'All caught up' },
    { label: 'On the way', value: orders ? String(onTheWay) : '…', tab: 'ORDERS' as Tab, icon: Truck, tone: 'bg-sky-100 text-sky-800', hint: 'With the courier' },
    { label: 'Ready for payout', value: summary ? formatPKR(summary.available) : '…', tab: 'EARNINGS' as Tab, icon: Wallet, tone: 'bg-emerald-100 text-emerald-800', hint: 'From delivered orders' },
    { label: 'Paid out so far', value: summary ? formatPKR(summary.paid) : '…', tab: 'EARNINGS' as Tab, icon: Store, tone: 'bg-violet-100 text-violet-800', hint: 'Sent to your account' },
  ];
  const lowStock = coach?.lowStock || [];
  return (
    <div className="space-y-4">
      {freeUntil && freeUntil > Date.now() && (
        <Callout tone="success" icon="🎉">
          <strong>0% commission</strong> on every sale until{' '}
          {new Date(freeUntil).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}. List your products and start selling!
        </Callout>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Stat key={c.label} label={c.label} value={c.value} hint={c.hint} icon={c.icon} tone={c.tone} highlight={c.strong} onClick={() => onGo(c.tab)} />
        ))}
      </div>

      {/* Today: new orders and products running out */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="New orders today" value={coach ? coach.newOrdersToday ?? 0 : '…'} icon={ShoppingCart} tone="bg-emerald-100 text-emerald-800" onClick={() => onGo('ORDERS')} />
        <button type="button" onClick={() => onGo('PRODUCTS')} className={`${ui.card} sm:col-span-2 p-4 text-left cursor-pointer transition-shadow hover:shadow-md`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-[#6B6963]">Running low (5 or fewer left)</div>
            {lowStock.length > 0 && <span className={`${ui.chip} ${chipTone.amber}`}>{lowStock.length} products</span>}
          </div>
          {!coach ? (
            <div className="mt-2 h-4 w-40 rounded bg-[#F2F1EC] animate-pulse" />
          ) : !lowStock.length ? (
            <div className="mt-2 text-[13px] text-emerald-700 font-semibold">✓ All live products have enough stock.</div>
          ) : (
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
              {lowStock.slice(0, 6).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className={`font-bold tabular-nums ${p.stock <= 2 ? 'text-rose-700' : 'text-amber-700'}`}>{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </button>
      </div>

      {/* Shop Coach: health, charts and what to fix (also in the AI Assistant) */}
      <Panel
        icon={<Bot className="w-4 h-4" />}
        title="Shop Coach"
        help={<HelpDot id="seller.tab.DASHBOARD" />}
        subtitle="How your shop is doing and what to improve"
        actions={
          <>
            <button type="button" disabled={coachBusy} onClick={() => loadCoach(true)} className={ui.secondary}>
              <RefreshCw className={`w-3.5 h-3.5 ${coachBusy ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => onGo('AI')} className={ui.primary}>
              <Bot className="w-3.5 h-3.5" /> Ask the AI coach
            </button>
          </>
        }
      >
       <div className="space-y-3">
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
              ) : action === 'ADD_AI_KEY' ? (
                <button type="button" onClick={() => onGo('AI' as Tab)} className={`mt-1 ${ui.primary}`}>
                  🔑 Add my free AI key
                </button>
              ) : action === 'MAKE_VIDEOS' ? (
                <VideoFixActions
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
        ) : coachBusy ? (
          <Loading text="Preparing your shop report..." rows={2} />
        ) : (
          <Empty icon="📊" title="The shop report is not available right now" text="Press Refresh in a minute." />
        )}
       </div>
      </Panel>

      <HowItWorks title="When an order comes in: the 4 steps">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Check the order (ask the customer in the order chat if anything is unclear), then press <strong>Confirm</strong>.</li>
          <li>Pack the item, then press <strong>Packed</strong>.</li>
          <li>Hand the parcel to the courier, enter the courier and tracking number, then press <strong>Ship</strong>.</li>
          <li>When the courier delivers it, press <strong>Delivered</strong>. Your earning then becomes ready for payout.</li>
        </ol>
        <div>
          <HelpDot id="seller.order.flow" />
        </div>
      </HowItWorks>
    </div>
  );
};

// ------------------------------------------------------------------ orders

// Asks the seller once to allow phone notifications, so the bell reaches them with the app in the
// background. Hidden once allowed, blocked (they must change it in the browser) or closed.
const ALERTS_CARD_KEY = 'anokha.seller.alertsCard';
const AlertsSetupCard: React.FC = () => {
  const { showToast } = useStore();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(ALERTS_CARD_KEY) === 'closed';
    } catch {
      return false;
    }
  });
  const [, redraw] = useState(0);
  if (hidden || !notificationsSupported() || notificationsAllowed()) return null;
  const close = () => {
    try {
      localStorage.setItem(ALERTS_CARD_KEY, 'closed');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-wrap items-center gap-2">
      <span className="text-lg">🔔</span>
      <div className="flex-1 min-w-[200px]">
        <strong>Never miss an order.</strong>{' '}
        {notificationsBlocked()
          ? 'Notifications are blocked for this site. Allow them in your browser settings (the lock icon next to the address) to get the bell on your phone.'
          : 'Allow notifications: a new order or customer message will ring and show on your phone, even when Seller Center is in the background.'}{' '}
        <HelpDot id="seller.alerts" />
      </div>
      {!notificationsBlocked() && (
        <button
          type="button"
          onClick={async () => {
            const ok = await askForNotifications();
            showToast(ok ? '🔔 Alerts are on. Keep Seller Center open in the background.' : 'Notifications were not allowed.');
            playChime('order');
            redraw((n) => n + 1);
          }}
          className={ui.primary}
        >
          Turn on alerts
        </button>
      )}
      <button type="button" onClick={close} className="px-2 py-1 font-semibold cursor-pointer">
        Later
      </button>
    </div>
  );
};

// "AI replies to customers when I am away": always on top of Orders, also when there is no order yet
const ChatAiSwitch: React.FC = () => {
  const { showToast } = useStore();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api('/api/seller/order-chat-ai')
      .then((d) => setOn(d.aiOn !== false))
      .catch(() => setOn(null));
  }, []);
  if (on === null) return null;
  return (
    <label className="flex items-start gap-3 p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-[12.5px] text-violet-950 cursor-pointer">
      <input
        type="checkbox"
        checked={on}
        onChange={async (e) => {
          const next = e.target.checked;
          setOn(next);
          try {
            await api('/api/seller/order-chat-ai', { method: 'POST', body: JSON.stringify({ on: next }) });
            showToast(next ? '🤖 AI will answer your customers when you are away.' : 'AI replies are off. Only you answer the order chats.');
          } catch (err: any) {
            setOn(!next);
            showToast(err.message);
          }
        }}
        className="mt-0.5 w-4 h-4 accent-violet-700 shrink-0"
      />
      <span className="flex-1">
        <strong className="block text-[13px]">🤖 AI replies to my customers when I am away {on ? '(On)' : '(Off)'}</strong>
        In the order chat it answers "is my order accepted?", "why so late?", "where is my order?" and how cancelling works. It never shares bank
        details or numbers and never cancels an order. It stays quiet for 30 minutes after you write.
      </span>
      <HelpDot id="seller.order.chat" />
    </label>
  );
};

const OrdersTab: React.FC<{ refreshKey?: string }> = ({ refreshKey }) => {
  const { showToast } = useStore();
  const [orders, setOrders] = useState<SellerOrder[] | null>(memo.orders || null);
  const [filter, setFilter] = useState<'OPEN' | 'SHIPPED' | 'DONE' | 'ALL'>('OPEN');
  const [busy, setBusy] = useState<string | null>(null);

  // New customer messages per order (order chat)
  const [chatUnread, setChatUnread] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([api('/api/seller/orders'), api('/api/seller/order-chats/unread').catch(() => ({ unread: {} }))]);
      memo.orders = d.orders;
      setOrders(d.orders);
      setChatUnread(u.unread || {});
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
  // The bell found a new order or message: refresh the list at once
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstKey.current) return;
    firstKey.current = refreshKey;
    load();
  }, [refreshKey, load]);

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

  const countOf = (f: 'OPEN' | 'SHIPPED' | 'DONE' | 'ALL') => {
    const list = orders || [];
    if (f === 'OPEN') return list.filter((o) => OPEN_STATUSES.includes(o.status)).length;
    if (f === 'SHIPPED') return list.filter((o) => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
    if (f === 'DONE') return list.filter((o) => !OPEN_STATUSES.includes(o.status) && !['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
    return list.length;
  };

  return (
    <div className="space-y-4">
      <ChatAiSwitch />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegTabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'OPEN', label: 'To ship', count: countOf('OPEN') },
            { id: 'SHIPPED', label: 'On the way', count: countOf('SHIPPED') },
            { id: 'DONE', label: 'Completed', count: countOf('DONE') },
            { id: 'ALL', label: 'All', count: countOf('ALL') },
          ]}
        />
        <button type="button" onClick={load} className={ui.secondary}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {orders === null ? (
        <p className="text-xs text-[#575653]">Loading orders...</p>
      ) : visible.length === 0 ? (
        <div className={`${ui.card} p-10 text-center`}>
          <ShoppingCart className="w-8 h-8 mx-auto text-[#C9C6BE]" />
          <p className="mt-2 text-sm font-semibold">No orders in this list</p>
          <p className="text-xs text-[#8A8780]">New orders appear here as soon as a customer buys from your shop.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((o) => (
            <SellerOrderCard
              key={o.id}
              order={o}
              busy={busy === o.id}
              act={act}
              chatUnread={chatUnread[o.id] || 0}
              onChatRead={() => setChatUnread((u) => ({ ...u, [o.id]: 0 }))}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// The store's connected courier accounts (asked once per visit; [] when none or not open for sellers)
let sellerCouriersPromise: Promise<{ couriers: Array<{ id: string; label: string }>; defaultCourier: string | null }> | null = null;
function useSellerCouriers() {
  const [v, setV] = useState<{ couriers: Array<{ id: string; label: string }>; defaultCourier: string | null }>({ couriers: [], defaultCourier: null });
  useEffect(() => {
    if (!sellerCouriersPromise) {
      sellerCouriersPromise = courierApi('/api/seller/couriers').catch(() => {
        sellerCouriersPromise = null;
        return { couriers: [], defaultCourier: null };
      });
    }
    let live = true;
    sellerCouriersPromise.then((r) => live && setV(r));
    return () => {
      live = false;
    };
  }, []);
  return v;
}
const SellerOrderCard: React.FC<{
  order: SellerOrder;
  busy: boolean;
  act: (o: SellerOrder, body: Record<string, any>, path?: string) => Promise<void>;
  chatUnread: number;
  onChatRead: () => void;
}> = ({ order: o, busy, act, chatUnread, onChatRead }) => {
  const { settings, showToast } = useStore();
  const [courier, setCourier] = useState(o.courierName || 'TCS');
  const [tracking, setTracking] = useState(o.trackingNumber || '');
  const [declineReply, setDeclineReply] = useState('');
  const apiCouriers = useSellerCouriers();
  const closed = ['CANCELLED', 'RETURNED', 'REFUNDED', 'DELIVERED'].includes(o.status);
  const shipped = ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status);
  const btn = 'px-2.5 py-1.5 text-[11px] font-semibold border cursor-pointer disabled:opacity-50';
  const storeName = settings.storeName || 'our store';
  const supplierFor = (productId: string) => (o.supplierItems || []).find((s) => s.productId === productId);
  // Items sourced from another app (Oshi, YourMart, ...): the seller orders them there
  const hasSupplier = (o.items || []).some((it) => {
    const s = supplierFor(it.productId);
    return s && !isDirectSource(s.supplierName);
  });
  const profit = (Number(o.sellerEarning) || 0) - (Number(o.supplierCost) || 0);

  // Text to paste into the supplier's portal / WhatsApp when forwarding a dropshipping order
  const supplierText =
    `Order ${o.orderNumber}\n` +
    (o.items || [])
      .map((i) => {
        const s = supplierFor(i.productId);
        return `• ${i.name} x${i.quantity}${s?.supplierSku ? ` (SKU ${s.supplierSku})` : ''}${s?.supplierProductUrl ? `\n  ${s.supplierProductUrl}` : ''}`;
      })
      .join('\n') +
    `\n\nDeliver to: ${o.customerName}, ${o.customerPhone || '(phone shows after you press "Sent to supplier")'}\n${o.shippingAddressSummary || ''}\n` +
    (o.paymentMethod === 'COD' ? `Collect cash on delivery: ${formatPKR(o.total)}\n` : 'Prepaid, do not collect cash\n');

  const copySupplierText = async () => {
    try {
      await navigator.clipboard.writeText(supplierText);
      showToast('Order details copied. Paste them into the supplier portal.');
    } catch {
      window.prompt('Copy these order details for the supplier:', supplierText);
    }
  };

  const isNew = ['PENDING_CONFIRMATION', 'PENDING'].includes(o.status);
  const canPack = ['CONFIRMED', 'PROCESSING'].includes(o.status);
  const showCourierBox = !closed && (o.courierBooking?.trackingNumber || (!shipped && o.status !== 'PENDING_CONFIRMATION' && apiCouriers.couriers.length > 0));
  const trackingWhatsApp = whatsAppLink(
    o.customerPhone,
    `Hello ${o.customerName}!\n\nYour order #${o.orderNumber} has been handed to ${o.courierName || 'the courier'}.\n` +
      `Tracking number: ${o.trackingNumber}\n` +
      (o.paymentMethod === 'COD' ? `Please pay ${formatPKR(o.total)} on delivery.\n` : '') +
      `Thank you! ${storeName}`
  );

  return (
    <div className={`${ui.card} text-xs`}>
      {/* ---------------- header: number, status, payment, date, amount */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEDE8] bg-[#FBFBF9] rounded-t-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-[13px]">{o.orderNumber}</span>
          <span className={`${ui.chip} ${statusTone(o.status)}`}>{statusLabel[o.status] || o.status}</span>
          <span className={`${ui.chip} bg-white border-[#DCD9D2] text-[#3A3936]`}>{o.paymentMethod === 'COD' ? 'Cash on Delivery' : o.paymentMethod}</span>
          {o.cancelRequest?.status === 'PENDING' && !closed && <span className={`${ui.chip} bg-rose-50 border-rose-300 text-rose-800`}>Cancel requested</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#8A8780]">
            {new Date(o.createdAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
          <span className="text-[14px] font-bold">{formatPKR(o.total)}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <OrderSteps status={o.status} />

        {/* ---------------- customer · items · money */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className={ui.label}>Customer</div>
            <div className="font-semibold text-[13px]">{o.customerName}</div>
            {o.customerPhone ? (
              <a href={`tel:${o.customerPhone}`} className="font-mono text-[#0E7A43] font-semibold">
                {o.customerPhone}
              </a>
            ) : (
              <div className="text-[#8A8780] flex items-center gap-1">
                📵 Phone shows after you press <strong>Packed</strong> <HelpDot id="seller.order.chat" />
              </div>
            )}
            <div className="text-[#6B6963] leading-relaxed">{o.shippingAddressSummary}</div>
          </div>
          <div className="space-y-2">
            <div className={ui.label}>Items</div>
            {(o.items || []).map((it, i) => {
              // Where this product comes from (private: the customer's order never shows it)
              const source = normalizeSource(supplierFor(it.productId)?.supplierName);
              return (
                <div key={i} className="flex items-start gap-2">
                  {it.image ? (
                    <img src={it.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#E7E5DF] shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-[#F2F1EC] flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-[#8A8780]" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">
                      {it.quantity} × {it.name}
                      {it.variant ? <span className="text-[#6B6963]"> ({it.variant})</span> : null}
                    </div>
                    {/* Kind of product and what the customer chose / wrote (text to print, rental days, job details) */}
                    {it.productType && <ProductTypeBadge type={it.productType} className="mt-0.5" />}
                    {it.optionsText && (
                      <div className="mt-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-950 break-words">{it.optionsText}</div>
                    )}
                    <span
                      className={`${ui.chip} mt-0.5 ${
                        source === DIRECT_SOURCE ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-violet-50 border-violet-300 text-violet-900'
                      }`}
                    >
                      {source === DIRECT_SOURCE ? 'Direct seller' : `From ${source}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-1 md:pl-4 md:border-l md:border-[#EFEDE8]">
            <div className={ui.label}>Money</div>
            <div className="flex justify-between gap-2">
              <span className="text-[#6B6963]">Customer pays</span>
              <strong>{formatPKR(o.total)}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#6B6963]">Commission ({o.commissionPercent}%)</span>
              <span>− {formatPKR(o.commissionAmount)}</span>
            </div>
            {Number(o.supplierCost) > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-[#6B6963]">Supplier cost</span>
                <span>− {formatPKR(Number(o.supplierCost))}</span>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-1 mt-1 border-t border-dashed border-[#DCD9D2] text-emerald-800 font-bold">
              <span>{Number(o.supplierCost) > 0 ? 'Your profit' : 'Your earning'}</span>
              <span className={Number(o.supplierCost) > 0 && profit < 0 ? 'text-rose-700' : ''}>
                {formatPKR(Number(o.supplierCost) > 0 ? profit : Number(o.sellerEarning))}
              </span>
            </div>
            {o.payoutId && <div className="text-emerald-800 font-semibold">✓ {o.payoutId === 'OWN_SHOP' ? 'Settled' : 'Paid out'}</div>}
          </div>
        </div>

        {/* Chat with the customer while the order runs (no phone numbers / links: server/orderChat.ts) */}
        <OrderChat mode="seller" orderId={o.id} customerName={o.customerName} unread={chatUnread} onRead={onChatRead} />

        {hasSupplier && !closed && !shipped && (
          <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 space-y-2">
            <div className="font-bold text-violet-950">Order these items on the source app</div>
            {(o.items || []).map((it, i) => {
              const sp = supplierFor(it.productId);
              if (!sp || isDirectSource(sp.supplierName)) return null;
              return (
                <div key={i} className="text-[#141413]">
                  {it.quantity} × {it.name}
                  {it.variant ? ` (${it.variant})` : ''} — <strong>{normalizeSource(sp.supplierName)}</strong>
                  {sp.supplierSku ? ` · SKU ${sp.supplierSku}` : ''}
                  {Number(sp.supplierCostPrice) > 0 ? ` · cost ${formatPKR(Number(sp.supplierCostPrice))}` : ''}
                  {sp.supplierProductUrl && (
                    <a href={sp.supplierProductUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold underline text-violet-900">
                      Open on {normalizeSource(sp.supplierName)}
                    </a>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copySupplierText} className={ui.secondary}>
                Copy order for supplier <HelpDot id="seller.order.supplier" />
              </button>
              {o.status === 'CONFIRMED' && (
                <button type="button" disabled={busy} onClick={() => act(o, { status: 'PROCESSING' })} className={`${ui.primary} !bg-violet-700 hover:!bg-violet-800`}>
                  ✓ Sent to supplier
                </button>
              )}
            </div>
          </div>
        )}

        {/* The customer asked to cancel after the free-cancel time: accept (cancels the order) or decline */}
        {!closed && o.cancelRequest?.status === 'PENDING' && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
            <div className="font-bold text-rose-900">
              The customer asked to cancel this order: {o.cancelRequest.reason}
              {o.cancelRequest.note ? ` — "${o.cancelRequest.note}"` : ''}
            </div>
            <div className="text-[#6B6963]">If the parcel is not packed yet, please accept. Decline only when it is already being packed or sent, and say why.</div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => act(o, { status: 'CANCELLED' })} className={ui.dangerSolid}>
                Accept and cancel order <HelpDot id="seller.order.cancelRequest" />
              </button>
              <input
                value={declineReply}
                onChange={(e) => setDeclineReply(e.target.value)}
                placeholder="Why it cannot be cancelled (e.g. already packed)"
                maxLength={200}
                className={`${ui.field} flex-1 min-w-[180px]`}
              />
              <button
                type="button"
                disabled={busy || declineReply.trim().length < 5}
                onClick={() => act(o, { reply: declineReply.trim() }, '/api/seller/orders/cancel-request/decline')}
                className={ui.secondary}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {showCourierBox && (
          <CourierBookBox
            orderId={o.id}
            couriers={apiCouriers.couriers}
            defaultCourier={apiCouriers.defaultCourier}
            apiBase="/api/seller/couriers"
            defaultWeightKg={o.shippingCalculationSnapshot?.billableWeightKg}
            booking={o.courierBooking}
            onBooked={(p) => act(o, { status: 'SHIPPED', courierName: p.courierName, trackingNumber: p.trackingNumber })}
          />
        )}

        {/* ---------------- next step: one main button, the rest in "More" */}
        {!closed && (
          <div className="pt-3 border-t border-[#EFEDE8] space-y-3">
            {!shipped && !isNew && (
              <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E7E5DF] space-y-2">
                <div className="font-semibold text-[#3A3936] flex items-center gap-1">
                  <Truck className="w-4 h-4" /> Ship with a tracking number <HelpDot id="seller.order.ship" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={courier} onChange={(e) => setCourier(e.target.value)} className={ui.field}>
                    {COURIERS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    placeholder="Courier tracking #"
                    className={`${ui.field} font-mono w-44`}
                  />
                  <button
                    type="button"
                    disabled={busy || tracking.trim().length < 4}
                    onClick={() => act(o, { status: 'SHIPPED', courierName: courier, trackingNumber: tracking.trim() })}
                    className={ui.dark}
                  >
                    <Truck className="w-3.5 h-3.5" /> Ship
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isNew && (
                <>
                  <button type="button" disabled={busy} onClick={() => act(o, { status: 'CONFIRMED' })} className={ui.primary}>
                    ✓ Confirm order
                  </button>
                </>
              )}
              {canPack && (
                <button type="button" disabled={busy} onClick={() => act(o, { status: 'PACKED' })} className={ui.primary}>
                  📦 Mark as packed
                </button>
              )}
              {shipped && (
                <button type="button" disabled={busy} onClick={() => act(o, { status: 'DELIVERED' })} className={ui.primary}>
                  ✓ Delivered
                </button>
              )}
              {o.status === 'SHIPPED' && (
                <button type="button" disabled={busy} onClick={() => act(o, { status: 'OUT_FOR_DELIVERY' })} className={ui.secondary}>
                  🛵 Out for delivery
                </button>
              )}
              {shipped && o.trackingNumber && (
                <a href={trackingWhatsApp} target="_blank" rel="noopener noreferrer" className={ui.whatsapp}>
                  Send tracking on WhatsApp
                </a>
              )}
              <div className="ml-auto">
                <MoreMenu
                  items={[
                    shipped && {
                      label: (
                        <>
                          <MapPin className="w-4 h-4" /> Add parcel location
                        </>
                      ),
                      disabled: busy,
                      onClick: () => {
                        const location = window.prompt('Where is the parcel now? (e.g. "Lahore hub")');
                        if (location && location.trim()) act(o, { location: location.trim() }, '/api/seller/orders/event');
                      },
                    },
                    !shipped && {
                      label: 'Cancel order',
                      danger: true,
                      disabled: busy,
                      onClick: () => {
                        const reason = window.prompt(`Reason for cancelling order ${o.orderNumber}? (the stock will be restored)`);
                        if (reason !== null) act(o, { status: 'CANCELLED', reason: reason.trim() });
                      },
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
        {o.trackingNumber && (
          <div className="text-[11.5px] text-[#6B6963] flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> {o.courierName}: <span className="font-mono font-semibold text-[#2A2A28]">{o.trackingNumber}</span>
          </div>
        )}
      </div>
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
  variants: [] as VariantRow[],
  variantTitle: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DRAFT',
  supplierName: '',
  supplierCostPrice: '',
  supplierProductUrl: '',
  supplierSku: '',
  adminHiddenReason: '',
  // Kind of product (chosen first; '' = not chosen yet) and its own fields (src/services/productTypes.ts)
  productType: '' as ProductType | '',
  typeDetails: {} as ProductTypeDetails,
  // Downloads: link / instructions / licence keys the buyer gets after paying (private)
  delivery: { link: '', note: '', keys: '' } as DeliveryForm,
};

type ProductFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'OUT' | 'ARCHIVED';

const ProductsTab: React.FC<{ uid: string; categoryNames: string[]; shipsFrom: string }> = ({ uid, categoryNames, shipsFrom }) => {
  const { showToast } = useStore();
  const [products, setProducts] = useState<ListProduct[] | null>(() => readCache<ListProduct[]>(PRODUCTS_CACHE_KEY, uid));
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<typeof emptyProduct | null>(null);
  // The AI video maker window for the product being edited
  const [videoFor, setVideoFor] = useState(false);
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
      const { product: full, supplier, brandProofUrl, delivery } = await api(`/api/seller/products/${encodeURIComponent(p.id)}`);
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
        variants: (Array.isArray(full.variants) ? full.variants : []).map((v: any) => ({
          id: String(v.id || Math.random().toString(36).slice(2, 10)),
          name: String(v.name || ''),
          price: typeof v.price === 'number' ? String(v.price) : '',
          stock: String(v.stock ?? 0),
          sku: String(v.sku || ''),
        })),
        variantTitle: full.variantTitle || '',
        status: full.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
        productType: (full.productType as ProductType) || 'PHYSICAL',
        typeDetails: full.typeDetails || {},
        delivery: {
          link: delivery?.link || '',
          note: delivery?.note || '',
          keys: Array.isArray(delivery?.keys) ? delivery.keys.join('\n') : '',
        },
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
    const ptype = (editing.productType || 'PHYSICAL') as ProductType;
    const kind = typeInfo(ptype);
    const isDownload = ptype === 'DIGITAL' || ptype === 'SOFTWARE';
    if (isDownload && editing.status === 'ACTIVE' && !editing.delivery.link.trim() && !editing.delivery.keys.trim() && !editing.delivery.note.trim()) {
      return showToast('Add the download link (or the licence keys) the customer gets after paying.');
    }
    // Downloads, services and subscriptions have no colours / sizes
    const variants = kind.countsStock ? editing.variants.filter((v) => v.name.trim()) : [];
    if (editing.variants.some((v) => !v.name.trim() && (v.price || v.sku))) return showToast('Give every variant a name, or remove the empty row.');
    setSaving(true);
    try {
      // Shipping is cleared, as every product is delivered in the customer's own country with the
      // store's rates. The source (direct seller / Oshi / YourMart / ...) is private: only the seller
      // and the store team see it, on the product and on its orders.
      const { shipping, delivery, ...fields } = editing;
      const direct = isDirectSource(editing.supplierName) || !kind.ships;
      const { product, heldForProof } = await api('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          ...fields,
          shipping: null,
          supplierName: normalizeSource(editing.supplierName),
          supplierProductUrl: direct ? '' : fixLink(editing.supplierProductUrl),
          supplierCostPrice: direct ? 0 : Number(editing.supplierCostPrice) || 0,
          supplierSku: direct ? '' : editing.supplierSku,
          subcategory: groupOfCategory(editing.category) || undefined,
          price: Number(editing.price),
          compareAtPrice: Number(editing.compareAtPrice) || 0,
          stock: Number(editing.stock),
          weightKg: Number(editing.weightKg),
          variants,
          variantTitle: variants.length ? editing.variantTitle || 'Option' : '',
          productType: ptype,
          typeDetails: editing.typeDetails,
          ...(isDownload ? { delivery: { link: delivery.link.trim(), note: delivery.note, keys: delivery.keys } } : {}),
        }),
      });
      showToast(
        product.adminHidden
          ? 'Saved. The store has hidden this product, so it stays hidden until the store restores it.'
          : heldForProof
          ? 'Saved as a draft: branded items need a purchase invoice or brand approval. Upload it to go live.'
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
      showToast(
        r.fallback
          ? 'The AI is busy, so a simple description was written. Check and improve it before saving.'
          : 'Description written. Check it before saving.'
      );
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  // New product: first choose what kind of product it is (each kind has its own form)
  if (editing && !editing.productType) {
    return (
      <ProductTypePicker
        onCancel={() => setEditing(null)}
        onPick={(t) =>
          setEditing((p) =>
            p
              ? {
                  ...p,
                  productType: t,
                  typeDetails: t === 'WHOLESALE' ? { minOrderQty: 10 } : t === 'RENTAL' ? { minDays: 1, maxDays: 30 } : t === 'SERVICE' ? { deliveryDays: 3, revisions: 2 } : {},
                  // Downloads, services and subscriptions are not a brand's goods
                  info: typeInfo(t).ships ? p.info : { ...p.info, brandType: p.info.brandType || 'NONE' },
                }
              : p
          )
        }
      />
    );
  }

  if (editing) {
    const nameSuggestions = suggestCategories(editing.name);
    const ptype = (editing.productType || 'PHYSICAL') as ProductType;
    const kind = typeInfo(ptype);
    const withVariants = kind.countsStock && editing.variants.length > 0;
    return (
      <div className={`${ui.card} p-4 sm:p-6 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EFEDE8]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(null)} className={ui.secondary}>
              ← Back
            </button>
            <h2 className="text-lg font-bold tracking-tight">{editing.id ? 'Edit product' : 'New product'}</h2>
          </div>
          <span className={`${ui.chip} ${editing.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
            {editing.status === 'ACTIVE' ? '● Will be live' : 'Draft'}
          </span>
        </div>
        {editing.adminHiddenReason && (
          <div className="px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-[12.5px]">
            The store has hidden this product: <strong>{editing.adminHiddenReason}</strong>. You can still edit it; please contact the
            store to make it live again.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProductTypeChosen type={ptype} onChange={() => setEditing((p) => (p ? { ...p, productType: '' } : p))} />
          <FormSection n={1} title="Basic information" hint={kind.countsStock ? 'Name, price, stock, category and brand' : 'Name, price, category'} />
          <div className="sm:col-span-2">
            <label className={labelCls}>Name * <HelpDot id="seller.product.name" /></label>
            <input
              className={inputCls}
              value={editing.name}
              onChange={(e) => {
                const name = e.target.value;
                // The category follows the name until the seller picks one themselves
                setEditing((p) => {
                  if (!p) return p;
                  const auto = !p.category || p.category === suggestCategories(p.name, 1)[0];
                  const next = suggestCategories(name, 1)[0];
                  return { ...p, name, category: auto && next ? next : p.category };
                });
              }}
              placeholder="e.g. Wireless Bluetooth Earbuds with Charging Case"
            />
          </div>
          <div>
            <label className={labelCls}>{priceLabelFor(ptype, editing.typeDetails)} * <HelpDot id="seller.product.price" /></label>
            <input className={inputCls} value={editing.price} onChange={set('price')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Old price (shown crossed out, optional) <HelpDot id="seller.product.price" /></label>
            <input className={inputCls} value={editing.compareAtPrice} onChange={set('compareAtPrice')} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Stock * <HelpDot id="seller.product.stock" /></label>
            {!kind.countsStock ? (
              <div className={`${inputCls} bg-[#F4F3EF] text-[#575653]`}>No stock count needed (sells any number)</div>
            ) : withVariants ? (
              <div className={`${inputCls} bg-[#F4F3EF] text-[#575653]`}>
                {editing.variants.reduce((s, v) => s + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)} (sum of the variants below)
              </div>
            ) : (
              <input className={inputCls} value={editing.stock} onChange={set('stock')} inputMode="numeric" />
            )}
          </div>
          <CategoryPicker
            value={editing.category}
            onChange={(category) => setEditing((p) => (p ? { ...p, category } : p))}
            storeCategories={categoryNames}
            suggestions={nameSuggestions}
          />
          <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E7E5DF] bg-[#FBFBF9] space-y-2">
            <span className={labelCls}>Brand * <HelpDot id="seller.product.brand" /></span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  ['BRANDED', 'Branded', 'Made by a known brand (e.g. Dolphin, Kemei, Samsung). Big brands and electronics need the purchase invoice.'],
                  ['NONE', 'No brand', 'Unbranded / generic item. Shown as "No brand"; the title may not use a brand’s name.'],
                ] as const
              ).map(([value, title, hint]) => (
                <label
                  key={value}
                  className={`p-3 rounded-xl border cursor-pointer flex gap-2.5 transition-colors ${
                    editing.info.brandType === value ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06] ring-1 ring-[#0E7A43]/30' : 'border-[#DCD9D2] bg-white hover:border-[#A8A59D]'
                  }`}
                >
                  <input
                    type="radio"
                    name="brandType"
                    checked={editing.info.brandType === value}
                    onChange={() => setEditing((p) => (p ? { ...p, info: { ...p.info, brandType: value } } : p))}
                    className="mt-0.5 accent-[#0E7A43]"
                  />
                  <span>
                    <span className="block text-[13px] font-bold text-[#141413]">{title}</span>
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
          {ptype !== 'PHYSICAL' && (
            <>
              <FormSection n={1} title={`${kind.label} details`} hint="What only this kind of product needs" />
              <ProductTypeFields
                type={ptype}
                details={editing.typeDetails}
                onDetails={(typeDetails) => setEditing((p) => (p ? { ...p, typeDetails } : p))}
                delivery={editing.delivery}
                onDelivery={(delivery) => setEditing((p) => (p ? { ...p, delivery } : p))}
                price={editing.price}
                upload={uploadMedia}
                onError={showToast}
              />
            </>
          )}
          <FormSection n={2} title="Photos & video" hint={kind.ships ? 'The first photo is the main one customers see' : 'A cover picture: book cover, app screen, sample of your work'} />
          <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E7E5DF] bg-[#FBFBF9]">
            <ProductMediaEditor
              images={editing.images}
              videoUrl={editing.videoUrl}
              onChange={(m) => setEditing((p) => (p ? { ...p, ...m, primaryImage: m.images[0] || '' } : p))}
              upload={uploadMedia}
              onError={showToast}
            />
            {/* Shop Coach's video maker: an ad made from the saved pictures (needs the product saved once) */}
            {!editing.videoUrl && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                {editing.id && editing.images.length ? (
                  <button type="button" onClick={() => setVideoFor(true)} className={ui.primary}>
                    ✨ No video? Make one with AI
                  </button>
                ) : (
                  <span className="text-[#6B6963]">No video? Add pictures and save once, then the AI can make a video from them.</span>
                )}
                <HelpDot id="seller.product.video" />
              </div>
            )}
            {videoFor && editing.id && (
              <VideoMakerModal
                product={{ id: editing.id, name: editing.name, brand: '' }}
                onClose={(added, url) => {
                  if (added && url) setEditing((p) => (p ? { ...p, videoUrl: url } : p));
                  setVideoFor(false);
                }}
              />
            )}
          </div>
          <FormSection n={3} title={kind.countsStock ? 'Variants & deals' : 'Deals'} hint={kind.countsStock ? 'Colours / sizes with their own stock, and a short-time deal price' : 'A short-time deal price'} />
          {editing.id && <FlashDealBox productId={editing.id} price={Number(editing.price) || 0} current={editing.flashPrice ? { price: editing.flashPrice, endsAt: editing.flashEndsAt } : null} />}
          {kind.countsStock && (
            <VariantsEditor
              title={editing.variantTitle}
              rows={editing.variants}
              basePrice={editing.price}
              onChange={({ title, rows }) => setEditing((p) => (p ? { ...p, variantTitle: title, variants: rows } : p))}
            />
          )}
          {!kind.countsStock && !editing.id && <p className="sm:col-span-2 text-[11.5px] text-[#6B6963]">A deal price can be set after the first save.</p>}
          {/* Only branded products need the proof; "No brand" hides it */}
          {editing.info.brandType === 'BRANDED' && (
          <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E7E5DF] bg-[#FBFBF9] space-y-2">
            <span className="text-[12.5px] font-bold text-[#141413] block">
              Purchase invoice or brand approval (needed for branded electronics and well-known brands)
            </span>
            <p className="text-[11px] text-[#575653]">
              Only the store sees this file. Branded electronics and well-known brands without it are saved as drafts.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {editing.brandProofUrl ? (
                <>
                  <a href={editing.brandProofUrl} target="_blank" rel="noopener noreferrer" className={ui.link}>
                    View uploaded file
                  </a>
                  <button
                    type="button"
                    onClick={() => setEditing((p) => (p ? { ...p, brandProofUrl: '' } : p))}
                    className={`${ui.secondary} !py-1`}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <label className={ui.secondary}>
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
          )}
          <FormSection n={4} title="Description" hint="What it is, and its key features as bullet points" />
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-violet-50/70 border border-violet-200">
            <span className="text-[11.5px] text-violet-950">Let AI write the description and key features from the name and category. <HelpDot id="seller.product.ai" /></span>
            <button
              type="button"
              disabled={aiBusy}
              onClick={writeWithAi}
              className={`${ui.primary} !bg-gradient-to-r !from-violet-600 !to-sky-600`}
            >
              {aiBusy ? 'Writing...' : '✨ Write description with AI'}
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Description <HelpDot id="seller.product.description" /></label>
            <textarea
              className={inputCls}
              rows={2}
              maxLength={480}
              value={editing.shortDescription}
              onChange={set('shortDescription')}
              placeholder="2-3 lines about the product: what it is and why it is good"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Key features (bullet points, one per line) <HelpDot id="seller.product.keyfeatures" /></label>
            <textarea
              className={inputCls}
              rows={5}
              value={editing.description}
              onChange={set('description')}
              placeholder={'Bluetooth 5.3, connects in 1 second\n30 hours battery with the case\nWater resistant (IPX5)\nIncluded: earbuds, case, USB-C cable'}
            />
            <span className="block mt-1 text-[11px] text-[#575653]">Each line is shown as a bullet point on the product page.</span>
          </div>
          <FormSection n={5} title={kind.ships ? 'Shipping & visibility' : 'Visibility'} hint={kind.ships ? 'Parcel weight for the delivery charge, and Live or Draft' : 'Live or Draft (no courier, no delivery charge)'} />
          {kind.ships && (
            <div>
              <label className={labelCls}>Weight (kg) <HelpDot id="seller.product.weight" /></label>
              <input className={inputCls} value={editing.weightKg} onChange={set('weightKg')} inputMode="decimal" />
            </div>
          )}
          <div>
            <label className={labelCls}>Status <HelpDot id="seller.product.status" /></label>
            <select className={inputCls} value={editing.status} onChange={set('status')}>
              <option value="ACTIVE">Live (visible in the store)</option>
              <option value="DRAFT">Draft (hidden)</option>
            </select>
          </div>
          <FormSection n={6} title="More details (optional)" hint="Specifications, how to use, care, manual" />
          <ProductInfoEditor
            info={editing.info}
            dimensions={editing.dimensions}
            onChange={(info) => setEditing((p) => (p ? { ...p, info } : p))}
            onDimensions={(dimensions) => setEditing((p) => (p ? { ...p, dimensions } : p))}
            upload={uploadMedia}
            onError={showToast}
          />
          {kind.ships && <FormSection n={7} title="Where you get it (private)" hint="Only you and the store team see this" />}
          {/* Private: customers never see where the product comes from (only for things that ship) */}
          {kind.ships && (
          <div className="sm:col-span-2 p-3 border border-violet-300 bg-violet-50/60 space-y-2">
            <div>
              <div className="text-xs font-bold text-[#141413]">Product source (only you and the store team see this) <HelpDot id="seller.product.source" /></div>
              <p className="text-[11px] text-[#575653]">
                Where you get this product. It is shown on every order of this product, so you know where to order it. Customers never see it.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[DIRECT_SOURCE, ...SOURCE_APPS].map((s) => {
                const on = normalizeSource(editing.supplierName) === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditing((p) => (p ? { ...p, supplierName: s } : p))}
                    className={`px-2.5 py-1.5 border text-xs font-semibold cursor-pointer ${
                      on ? 'border-violet-700 bg-violet-700 text-white' : 'border-black/15 bg-white hover:border-black'
                    }`}
                  >
                    {s === DIRECT_SOURCE ? 'Direct seller (own stock)' : s}
                  </button>
                );
              })}
              <input
                value={[DIRECT_SOURCE, ...SOURCE_APPS].includes(normalizeSource(editing.supplierName)) ? '' : editing.supplierName}
                onChange={set('supplierName')}
                placeholder="other app..."
                className="w-32 px-2 py-1.5 border border-black/15 bg-white text-xs focus:border-black focus:outline-none"
              />
            </div>
            {!isDirectSource(editing.supplierName) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Product link on {normalizeSource(editing.supplierName)} (optional)</label>
                  <input className={inputCls} value={editing.supplierProductUrl} onChange={set('supplierProductUrl')} placeholder="https://..." />
                </div>
                <div>
                  <label className={labelCls}>Their price per piece (optional)</label>
                  <input className={inputCls} value={editing.supplierCostPrice} onChange={set('supplierCostPrice')} inputMode="decimal" />
                </div>
              </div>
            )}
          </div>
          )}
        </div>
        <div className="sticky bottom-[68px] lg:bottom-0 z-20 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-t border-[#E7E5DF] flex items-center justify-between gap-2 rounded-b-[14px]">
          <span className="text-[11.5px] text-[#8A8780] hidden sm:block">Fields with * are required.</span>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={() => setEditing(null)} className={ui.secondary}>
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={save} className={`${ui.primary} !px-6`}>
              {saving ? 'Saving...' : editing.id ? 'Save changes' : 'Save product'}
            </button>
          </div>
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
    <div className="space-y-4">
      {/* ---------------- toolbar: count + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-[#6B6963]">
          {products ? (
            <>
              <strong className="text-[#141413]">{counts.ALL}</strong> products
            </>
          ) : (
            'Loading products...'
          )}
          {refreshing && products ? ' · updating…' : ''}
        </span>
        <div className="flex flex-wrap gap-2">
          {products && products.length > 0 && (
            <button
              type="button"
              disabled={archiving}
              onClick={archiveImages}
              title="Copy product pictures into the store's storage so they stay even if the supplier deletes them"
              className={ui.secondary}
            >
              {archiving ? 'Saving images...' : 'Save images to store'}
            </button>
          )}
          <button type="button" onClick={() => setBulkOpen(true)} className={ui.secondary}>
            <Upload className="w-4 h-4" /> CSV / Bulk listing <HelpDot id="seller.bulk" />
          </button>
          <button type="button" onClick={() => setEditing({ ...emptyProduct })} className={ui.primary}>
            <Plus className="w-4 h-4" /> New product <HelpDot id="seller.product.new" />
          </button>
        </div>
      </div>

      {/* ---------------- search + filters */}
      {products && products.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8780]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU or category" className={`${ui.field} w-full pl-9`} />
          </div>
          <SegTabs value={filter} onChange={setFilter} items={filterTabs.map(([id, label]) => ({ id, label, count: counts[id] }))} />
        </div>
      )}

      {products && products.length === 0 && (
        <div className={`${ui.card} p-10 text-center space-y-2`}>
          <Package className="w-9 h-9 mx-auto text-[#C9C6BE]" />
          <p className="text-sm font-semibold">No products yet</p>
          <p className="text-xs text-[#8A8780]">Add your first product, or upload many at once from a CSV file.</p>
          <div className="flex justify-center gap-2 pt-1">
            <button type="button" onClick={() => setBulkOpen(true)} className={ui.secondary}>
              <Upload className="w-4 h-4" /> CSV / Bulk listing
            </button>
            <button type="button" onClick={() => setEditing({ ...emptyProduct })} className={ui.primary}>
              <Plus className="w-4 h-4" /> New product
            </button>
          </div>
        </div>
      )}
      {products && products.length > 0 && filtered.length === 0 && (
        <div className={`${ui.card} p-8 text-center text-xs text-[#8A8780]`}>No products match this search or filter.</div>
      )}

      {/* ---------------- product cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.slice(0, shown).map((p) => {
          const low = p.status === 'ACTIVE' && Number(p.stock) <= 5;
          return (
            <div
              key={p.id}
              className={`${ui.card} p-3 flex gap-3 text-xs [content-visibility:auto] [contain-intrinsic-size:auto_124px] hover:shadow-md transition-shadow`}
            >
              <div className="w-[88px] h-[88px] rounded-xl bg-[#F4F3EF] shrink-0 overflow-hidden border border-[#EFEDE8]">
                {p.primaryImage ? (
                  <img src={p.primaryImage} alt="" width={88} height={88} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-6 h-6 text-[#C9C6BE]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col">
                <div className="font-semibold text-[13px] leading-snug line-clamp-2">{p.name}</div>
                <ProductTypeBadge type={p.productType} className="mt-1" />
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[14px] font-bold">{formatPKR(p.price)}</span>
                  {Number((p as any).compareAtPrice) > Number(p.price) && (
                    <span className="text-[11px] text-[#8A8780] line-through">{formatPKR(Number((p as any).compareAtPrice))}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span
                    className={`${ui.chip} ${
                      p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                  >
                    {p.status === 'ACTIVE' ? '● Live' : p.status === 'DRAFT' ? 'Draft' : 'Removed'}
                  </span>
                  <span
                    className={`${ui.chip} ${
                      Number(p.stock) <= 0
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : low
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-white text-[#3A3936] border-[#DCD9D2]'
                    }`}
                  >
                    {Number(p.stock) <= 0 ? 'Out of stock' : `Stock ${p.stock}`}
                  </span>
                  {p.adminHidden && (
                    <span className={`${ui.chip} bg-rose-50 text-rose-800 border-rose-300`} title={p.adminHiddenReason}>
                      Hidden by store
                    </span>
                  )}
                </div>
                <div className="mt-auto pt-2 flex items-center gap-1.5">
                  <button type="button" disabled={opening === p.id} onClick={() => openEditor(p)} className={`${ui.secondary} !px-3 !py-1.5`}>
                    {opening === p.id ? 'Opening...' : 'Edit'}
                  </button>
                  {p.status === 'ACTIVE' && !p.adminHidden && (
                    <ShareProductButton
                      productId={p.id}
                      productName={p.name}
                      price={p.price}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#0E7A43]/40 bg-[#E8F3EC] text-[#0B5E34] text-[12px] font-semibold cursor-pointer hover:bg-[#DCEFE3]"
                      showToast={showToast}
                    />
                  )}
                  {p.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => archive(p)}
                      aria-label={`Remove ${p.name}`}
                      title="Remove from the store"
                      className={`${ui.danger} !px-2 !py-1.5 ml-auto`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE * 2)} className={`${ui.secondary} w-full`}>
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
  const [result, setResult] = useState<{ created: number; updated: number; unchanged: number; errors: { row: number; error: string }[] } | null>(null);
  // Fingerprint of the chosen file: the server refuses a file that is already on the store
  const [fileHash, setFileHash] = useState('');
  const [sameFile, setSameFile] = useState('');

  // Rows without their own source (Oshi, YourMart, ...) take the one chosen here; it must be chosen
  // when the file has such rows, so no product is listed as own stock by mistake
  const [defaultSource, setDefaultSource] = useState('');
  const rowsWithoutSource = rows.filter((r) => !r.supplierName.trim()).length;
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
    setSameFile('');
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n').trim()));
      setFileHash(Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''));
    } catch {
      setFileHash('');
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
    if (rowsWithoutSource > 0 && !defaultSource) return showToast('Choose where these products come from (Direct seller, Oshi, YourMart, ...) first.');
    const total = ready.length;
    const sum = { created: 0, updated: 0, unchanged: 0, errors: [] as { row: number; error: string }[] };
    let held = 0;
    setProgress({ done: 0, total });
    try {
      for (let i = 0; i < total; i += BULK_CHUNK) {
        const chunk = ready.slice(i, i + BULK_CHUNK).map(({ problem, ...r }) => r);
        const d = await api('/api/seller/products/bulk', {
          method: 'POST',
          body: JSON.stringify({
            products: chunk,
            fileHash,
            fileName,
            defaultSource,
            totalRows: total,
            chunk: i / BULK_CHUNK,
            lastChunk: i + BULK_CHUNK >= total,
          }),
        });
        sum.created += d.created || 0;
        sum.updated += d.updated || 0;
        sum.unchanged += d.unchanged || 0;
        held += d.heldForProof || 0;
        sum.errors.push(...(d.errors || []));
        setProgress({ done: Math.min(total, i + BULK_CHUNK), total });
      }
      setResult(sum);
      showToast(
        `${sum.created} new · ${sum.updated} prices updated · ${sum.unchanged} already listed, no change.` +
          (held ? ` ${held} branded items were saved as drafts: open each one and upload its invoice to go live.` : '')
      );
    } catch (err: any) {
      // The same file was uploaded before: nothing was saved
      if (err.code === 'SAME_FILE') {
        setSameFile(err.message);
        return;
      }
      setResult(sum);
      showToast(err.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className={`${ui.card} p-4 sm:p-6 space-y-4 text-[12.5px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EFEDE8]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className={ui.secondary}>
            ← Back
          </button>
          <h2 className="text-lg font-bold tracking-tight">Bulk listing from CSV</h2>
          <HelpDot id="seller.bulk" />
        </div>
        <button type="button" onClick={downloadTemplate} className={ui.secondary}>
          <Download className="w-3.5 h-3.5" /> Sample file
        </button>
      </div>

      <HowItWorks title="How to make the file">
        <p>
          Make a product list in Excel or Google Sheets and save it as <strong>CSV</strong>. Export files from Daraz, Shopify or WooCommerce also work.
        </p>
        <p>
          Required columns: <strong>name, price, category</strong>. Optional: sku, old_price, stock, image_url, short_description, description,
          weight_kg. Product source: <strong>source</strong> (Oshi, YourMart, HHC, Markaz, or empty for your own stock), source_link, source_price.
          Only you and the store team see the source.
        </p>
        <p>
          <strong>No double listings:</strong> the same file cannot be uploaded twice. A product already in your shop (same sku, name or source link) is
          not listed again: only its price is updated when it changed.
        </p>
      </HowItWorks>

      <label className="block p-8 rounded-2xl border-2 border-dashed border-[#C9C6BE] bg-[#FBFBF9] text-center cursor-pointer transition-colors hover:border-[#0E7A43] hover:bg-emerald-50/40">
        <span className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-white border border-[#E7E5DF] flex items-center justify-center">
          <Upload className="w-5 h-5 text-[#0E7A43]" />
        </span>
        <span className="block font-bold text-[13px] text-[#141413]">{fileName ? fileName : 'Choose a CSV file'}</span>
        <span className="block text-[11.5px] text-[#8A8780]">{fileName ? 'Tap to choose another file' : 'From Excel, Google Sheets, Daraz or Shopify'}</span>
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
            <label className="flex items-center gap-2 font-semibold text-[#141413] sm:pt-6">
              <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} className="w-4 h-4 accent-[#0E7A43]" />
              Save all as Draft (I will review them and make them live later)
            </label>
            {rowsWithoutSource > 0 && (
              <div className={`sm:col-span-2 p-3.5 rounded-xl border-2 ${defaultSource ? 'border-violet-300 bg-violet-50/60' : 'border-amber-400 bg-amber-50'}`}>
                <label className={labelCls}>
                  Where do these products come from? ({rowsWithoutSource} of {rows.length} products have no source in the file) *
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[DIRECT_SOURCE, ...SOURCE_APPS].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDefaultSource(s)}
                      className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer ${
                        defaultSource === s ? 'border-violet-700 bg-violet-700 text-white' : 'border-[#DCD9D2] bg-white hover:border-violet-400'
                      }`}
                    >
                      {s === DIRECT_SOURCE ? 'Direct seller (own stock)' : s}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#575653]">
                  Used for the new products listed from this file. Lines with their own source keep it, and products already in your shop keep
                  theirs. Only you and the store team see the source.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`${ui.chip} ${chipTone.green} !text-[12px] !px-3 !py-1`}>✓ {ready.length} products ready</span>
            {skipped > 0 && <span className={`${ui.chip} ${chipTone.red} !text-[12px] !px-3 !py-1`}>{skipped} will be skipped (reason in the table)</span>}
          </div>

          <div className="max-h-80 overflow-auto rounded-xl border border-[#E7E5DF]">
            <table className="w-full text-left">
              <thead className="bg-[#F7F6F2] sticky top-0 text-[11px] uppercase tracking-wider text-[#8A8780]">
                <tr>
                  <th className="p-2 font-bold">Line</th>
                  <th className="p-2 font-bold">Image</th>
                  <th className="p-2 font-bold">Name</th>
                  <th className="p-2 font-bold">Price</th>
                  <th className="p-2 font-bold">Stock</th>
                  <th className="p-2 font-bold">Category</th>
                  <th className="p-2 font-bold">Check</th>
                </tr>
              </thead>
              <tbody>
                {prepared.slice(0, 300).map((r) => (
                  <tr key={r.row} className={`border-t border-[#EFEDE8] ${r.problem ? 'bg-rose-50' : ''}`}>
                    <td className="p-2 font-mono">{r.row}</td>
                    <td className="p-2">
                      {r.primaryImage ? <img src={r.primaryImage} alt="" className="w-9 h-9 rounded-md object-cover" loading="lazy" decoding="async" /> : '—'}
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
            className={`${ui.primary} w-full !py-2.5 !text-[13px]`}
          >
            {progress ? `Uploading... ${progress.done} / ${progress.total}` : `Upload ${ready.length} products`}
          </button>
        </>
      )}

      {sameFile && (
        <Callout tone="warning" icon="⚠️">
          <strong>{sameFile}</strong>
        </Callout>
      )}

      {result && (
        <Callout
          tone="success"
          icon="✓"
          action={
            <button type="button" onClick={onDone} className={ui.primary}>
              View products
            </button>
          }
        >
          <p>
            <strong>{result.created}</strong> new products listed · <strong>{result.updated}</strong> price updated · <strong>{result.unchanged}</strong> already
            in your shop (not listed again)
          </p>
          {result.errors.length > 0 && (
            <p className="text-rose-800 mt-1">
              {result.errors.length} lines were not saved: {result.errors.slice(0, 5).map((e) => `line ${e.row} (${e.error})`).join(', ')}
            </p>
          )}
        </Callout>
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
// Coloured bar on the left of a notice: blue info, amber warning, red urgent
const noticeTone: Record<string, string> = {
  INFO: 'border-l-sky-400!',
  WARNING: 'border-l-amber-400!',
  URGENT: 'border-l-rose-500! bg-rose-50/40',
};
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Who sent a notice: customers, the store team (admin + the store's automatic rules) or the AI coach
const NOTICE_FROM: Record<NoticeSource, string> = {
  CUSTOMER: '🛍️ From a customer',
  ADMIN: '🏪 From the store team',
  STORE: '📋 Store rules (automatic)',
  COACH: '🤖 AI Shop Coach (advice)',
};
type InboxBox = 'CUSTOMER' | 'STORE' | 'COACH';
const boxOf = (n: StoreNotice): InboxBox => (n.source === 'CUSTOMER' ? 'CUSTOMER' : n.source === 'COACH' ? 'COACH' : 'STORE');

const MessagesTab: React.FC<{ inbox: SellerInbox | null; reload: () => Promise<void>; onTab: (tab: string) => void }> = ({
  inbox,
  reload,
  onTab,
}) => {
  const { showToast } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [box, setBox] = useState<InboxBox | null>(null);
  // "New" marks stay for this visit even after the notices are marked read
  const [seenBefore, setSeenBefore] = useState<string | null>(null);

  useEffect(() => {
    if (inbox && seenBefore === null) setSeenBefore(inbox.noticesReadAt || '');
  }, [inbox, seenBefore]);

  // Opening this tab counts as reading the notices
  useEffect(() => {
    if (!inbox || inbox.unread.notices + (inbox.unread.coach || 0) === 0) return;
    api('/api/seller/notices/read', { method: 'POST' })
      .then(() => reload())
      .catch(() => {});
  }, [inbox?.unread.notices, inbox?.unread.coach]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!inbox) return <Loading text="Loading messages..." />;

  const readAt = seenBefore ?? inbox.noticesReadAt;
  const isNew = (n: StoreNotice) => String(n.createdAt) > readAt;
  const inBox = (b: InboxBox) => inbox.notices.filter((n) => boxOf(n) === b);
  const newIn = (b: InboxBox) => inBox(b).filter(isNew).length + (b === 'STORE' ? inbox.unread.threads : 0);
  // Open the box that has something new: customers first, then the store, then the coach
  const shown: InboxBox = box || (['CUSTOMER', 'STORE', 'COACH'] as InboxBox[]).find((b) => newIn(b) > 0) || 'CUSTOMER';
  const boxes: { id: InboxBox; label: string; hint: string }[] = [
    { id: 'CUSTOMER', label: '🛍️ Customers', hint: 'Returns and complaints from your buyers. Act on these first.' },
    { id: 'STORE', label: '🏪 Store / Admin', hint: 'Notices from the store team, store rules, and your conversations with the store.' },
    { id: 'COACH', label: '🤖 AI Coach', hint: 'Tips from the AI Shop Coach. They are advice, not orders: use them to sell more.' },
  ];

  const noticeList = (list: StoreNotice[], icon: string, empty: string) =>
    list.length === 0 ? (
      <Panel>
        <Empty icon={icon} title={empty} />
      </Panel>
    ) : (
      list.slice(0, 20).map((n) => (
        <article key={n.id} className={`${ui.card} border-l-4 ${noticeTone[n.level] || noticeTone.INFO} p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={ui.label}>{NOTICE_FROM[n.source || 'STORE']}</span>
            {n.level === 'URGENT' && <span className={`${ui.chip} ${chipTone.red}`}>Urgent</span>}
            {isNew(n) && <span className={`${ui.chip} ${chipTone.green}`}>New</span>}
            <span className="ml-auto text-[11px] text-[#8A8780]">{when(n.createdAt)}</span>
          </div>
          <h3 className="mt-1 text-[13.5px] font-bold text-[#141413]">{n.title}</h3>
          <p className="mt-1 text-[12.5px] text-[#3A3936] whitespace-pre-line leading-relaxed">{n.body}</p>
        </article>
      ))
    );
  const linkCard = (icon: string, title: string, text: string, go: () => void) => (
    <button type="button" onClick={go} className={`${ui.card} w-full p-4 text-left flex items-center gap-3 cursor-pointer transition-shadow hover:shadow-md`}>
      <span className="w-10 h-10 rounded-xl bg-[#F2F1EC] flex items-center justify-center text-lg shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <strong className="block text-[13px]">{title}</strong>
        <span className="block text-[12px] text-[#6B6963]">{text}</span>
      </span>
      <span className="text-[#8A8780] text-lg">›</span>
    </button>
  );

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
    <div className="space-y-4 text-[12.5px]">
      <div className="space-y-1.5">
        <SegTabs
          value={shown}
          onChange={setBox}
          items={boxes.map((b) => ({ id: b.id, label: b.label, count: newIn(b.id) || undefined }))}
        />
        <p className="text-[12px] text-[#6B6963]">{boxes.find((b) => b.id === shown)!.hint}</p>
      </div>

      {shown === 'CUSTOMER' && (
        <section className="space-y-3">
          {noticeList(inBox('CUSTOMER'), '🛍️', 'No returns or complaints from customers 👍')}
          {linkCard('❓', 'Customer questions about your products', 'They are in the Questions tab. Tap to open and reply.', () => onTab('QUESTIONS'))}
        </section>
      )}

      {shown === 'COACH' && (
        <section className="space-y-3">
          {noticeList(inBox('COACH'), '🤖', 'No tips from the AI coach yet')}
          {linkCard('📊', 'See the full Shop Coach report', 'On the Dashboard, with a fix button next to each problem.', () => onTab('DASHBOARD'))}
        </section>
      )}

      {shown === 'STORE' && (
        <>
          <Panel
            title="Conversations with the store"
            subtitle="Complaints and questions you sent to the store team"
            flush
            actions={
              <>
                <button type="button" onClick={reload} className={ui.secondary} aria-label="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setComposing(true)} className={ui.primary}>
                  <Plus className="w-4 h-4" /> New message
                </button>
                <HelpDot id="seller.messages.new" />
              </>
            }
          >
            {inbox.threads.length === 0 ? (
              <Empty icon="💬" title="No conversations yet" text="Have a problem with an order, a payout or your listings? Send the store a message." />
            ) : (
              <ul className="divide-y divide-[#EFEDE8]">
                {inbox.threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className={`w-full px-4 sm:px-5 py-3 text-left flex items-center gap-3 cursor-pointer hover:bg-[#FBFBF9] ${t.unreadForSeller ? 'bg-emerald-50/50' : ''}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${t.unreadForSeller ? 'bg-emerald-600' : 'bg-transparent'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <strong className="text-[13px] truncate">{t.subject}</strong>
                          <span
                            className={`${ui.chip} shrink-0 ${
                              t.status === 'ANSWERED' ? chipTone.green : t.status === 'CLOSED' ? chipTone.grey : chipTone.amber
                            }`}
                          >
                            {threadStatusLabel[t.status] || t.status}
                          </span>
                        </span>
                        <span className="block text-[12px] text-[#6B6963] truncate">
                          {t.lastFrom === 'ADMIN' ? 'Store: ' : 'You: '}
                          {t.lastMessagePreview}
                        </span>
                      </span>
                      <span className="text-right text-[11px] text-[#8A8780] shrink-0 hidden sm:block">
                        {THREAD_CATEGORY_LABELS[t.category] || t.category}
                        <br />
                        {when(t.lastMessageAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <section className="space-y-3">
            <h2 className={ui.label}>Notices from the store</h2>
            {noticeList(inBox('STORE'), '📋', 'No notices from the store yet')}
          </section>
        </>
      )}
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
     <Panel
       title="New message to the store"
       help={<HelpDot id="seller.messages.new" />}
       subtitle="The store team usually replies within a day"
       actions={
         <button type="button" onClick={onCancel} className={ui.secondary}>
           ← Back
         </button>
       }
     >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <button type="submit" disabled={sending} className={ui.primary}>
          {sending ? 'Sending...' : 'Send to store'}
        </button>
        <button type="button" onClick={onCancel} className={ui.secondary}>
          Cancel
        </button>
      </div>
      </div>
     </Panel>
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
    <Panel
      title={thread?.subject || 'Loading...'}
      subtitle={
        thread
          ? `${THREAD_CATEGORY_LABELS[thread.category] || thread.category}${thread.orderNumber ? ` · Order ${thread.orderNumber}` : ''} · ${threadStatusLabel[thread.status] || thread.status}`
          : undefined
      }
      actions={
        <button type="button" onClick={onBack} className={ui.secondary}>
          ← Back
        </button>
      }
      flush
    >
      <div className="p-4 space-y-2.5 max-h-[55vh] overflow-y-auto bg-[#F7F6F2] text-[12.5px]">
        {!thread && <Loading rows={2} />}
        {(thread?.messages || []).map((m) => (
          <div key={m.id} className={`flex ${m.from === 'SELLER' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl whitespace-pre-line ${
                m.from === 'SELLER' ? 'bg-[#0E7A43] text-white rounded-br-sm' : 'bg-white border border-[#E7E5DF] rounded-bl-sm'
              }`}
            >
              <div className={`text-[10.5px] font-bold mb-0.5 ${m.from === 'SELLER' ? 'text-white/75' : 'text-emerald-800'}`}>
                {m.from === 'SELLER' ? 'You' : 'Store team'} · {when(m.at)}
              </div>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {thread && (
        <div className="p-4 space-y-2 border-t border-[#EFEDE8]">
          {thread.status === 'CLOSED' && <Callout tone="neutral">The store closed this conversation. Writing again will reopen it.</Callout>}
          <textarea className={inputCls} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply..." />
          <div className="flex justify-end">
            <button type="button" disabled={sending || !reply.trim()} onClick={send} className={ui.primary}>
              {sending ? 'Sending...' : 'Send reply'}
            </button>
          </div>
        </div>
      )}
    </Panel>
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
  if (!data) return <Loading text="Loading your earnings..." />;
  const s = data.summary;
  const escrow = data.escrowDays ?? 7;
  // The money flow, left to right: not delivered → return period → ready → paid
  const flow = [
    { label: 'Upcoming', value: s.pending, hint: 'Orders not delivered yet', icon: Truck, tone: 'bg-sky-100 text-sky-800' },
    { label: 'On hold', value: s.onHold ?? 0, hint: `${escrow}-day return period`, icon: RotateCcw, tone: 'bg-amber-100 text-amber-800' },
    { label: 'Ready for payout', value: s.available, hint: 'The store sends this to your bank', icon: Wallet, tone: 'bg-emerald-100 text-emerald-800', strong: true },
    { label: 'Paid out', value: s.paid, hint: 'Already in your account', icon: Store, tone: 'bg-violet-100 text-violet-800' },
  ];
  const extra: [string, number, string, string?][] = [
    [`Store commission (${data.commissionPercent}%)`, -Number(s.commission), 'On every sale'],
    ...(Number(s.returnCharges) > 0 ? ([['Return charges', -Number(s.returnCharges), 'Taken off your next payout', 'text-rose-700']] as [string, number, string, string][]) : []),
    ...(Number(s.supplierCost) > 0
      ? ([
          ['Supplier cost', -Number(s.supplierCost), 'Dropshipping cost of your orders'],
          ['Estimated profit', Number(s.profit), 'Earnings minus supplier cost (returns not included)', 'text-emerald-700'],
        ] as [string, number, string, string?][])
      : []),
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {flow.map((f) => (
          <Stat
            key={f.label}
            label={f.label}
            value={formatPKR(Number(f.value))}
            hint={f.hint}
            icon={f.icon}
            tone={f.tone}
            valueClass={f.strong ? 'text-emerald-700' : ''}
          />
        ))}
      </div>

      <Panel title="Breakdown" flush>
        <ul className="divide-y divide-[#EFEDE8] text-[12.5px]">
          {extra.map(([label, value, hint, cls]) => (
            <li key={label} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{label}</div>
                <div className="text-[11.5px] text-[#8A8780]">{hint}</div>
              </div>
              <span className={`font-bold tabular-nums ${cls || ''}`}>
                {value < 0 ? '− ' : ''}
                {formatPKR(Math.abs(value))}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <HowItWorks title="How payouts work">
        <p>The store collects the customer's Cash on Delivery payment.</p>
        <p>
          Once an order is delivered, your earning (amount − commission + shipping) is held for the customer's {escrow}-day return period, then moves to
          “Ready for payout” and the store transfers it to your bank account.
        </p>
        <p>Return shipping for returns that were your fault is taken off the payout.</p>
      </HowItWorks>

      {Array.isArray(data.charges) && data.charges.length > 0 && (
        <Panel title="Return charges (unpaid)" subtitle="Taken off your next payout" flush>
          <ul className="divide-y divide-[#EFEDE8] text-[12.5px]">
            {data.charges.map((c: any) => (
              <li key={c.id} className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{c.orderNumber}</span>
                <span className="flex-1 text-[#6B6963] truncate">{c.reason}</span>
                <span className="font-bold tabular-nums text-rose-700">− {formatPKR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Payout history" help={<HelpDot id="seller.earnings.payouts" />} flush>
        {data.payouts.length === 0 ? (
          <Empty icon="💸" title="No payouts yet" text="Your first payout comes after your first delivered order clears the return period." />
        ) : (
          <ul className="divide-y divide-[#EFEDE8] text-[12.5px]">
            {data.payouts.map((p) => (
              <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{new Date(p.paidAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="text-[11.5px] text-[#8A8780]">
                    {p.orderIds.length} order{p.orderIds.length === 1 ? '' : 's'} · Ref {p.reference}
                  </div>
                </div>
                <span className="text-[14px] font-bold tabular-nums text-emerald-700">{formatPKR(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
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

// Crops a chosen photo to a 3:1 banner (1500 x 500) and shrinks it to a JPEG for the shop's cover
async function shrinkToCoverJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This picture could not be opened. Please choose a JPG or PNG.'));
      el.src = url;
    });
    const W = 1500;
    const H = 500;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = W / scale;
    const sh = H / scale;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), 'image/jpeg', 0.82)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Change the shop name (own save button: it is checked more strictly and renames every product)
const ShopNameEditor: React.FC<{ seller: SellerShop; onSaved: () => void }> = ({ seller, onSaved }) => {
  const { showToast } = useStore();
  const [name, setName] = useState(seller.shopName || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(seller.shopName || ''), [seller.shopName]);
  const last = Date.parse((seller as any).shopNameChangedAt || '');
  const nextAllowed = !isNaN(last) ? last + 30 * 86400_000 : 0;
  const locked = nextAllowed > Date.now();
  const changed = name.replace(/\s+/g, ' ').trim() !== (seller.shopName || '');
  const submit = async () => {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!window.confirm(`Change your shop name to "${clean}"?\n\nAll your products will show the new name. You can change it again after 30 days.`)) return;
    setBusy(true);
    try {
      const r = await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify({ shopName: clean }) });
      showToast(`Shop name changed to "${r.shopName || clean}"${r.productsRenamed ? ` on ${r.productsRenamed} products` : ''}.`);
      onSaved();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className={labelCls}>
        Shop name <HelpDot id="seller.shopName" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} flex-1 min-w-[200px]`}
          value={name}
          maxLength={50}
          disabled={locked || busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ali Electronics"
        />
        <button type="button" disabled={locked || busy || !changed || name.trim().length < 3} onClick={submit} className={ui.primary}>
          {busy ? 'Changing...' : 'Change name'}
        </button>
      </div>
      <p className="text-[11px] text-[#8A8780]">
        {locked
          ? `You changed the name recently. You can change it again on ${new Date(nextAllowed).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
          : '3–50 characters, your own name (no brand names like Samsung), not used by another shop. Can be changed once in 30 days; all your products show the new name.'}
      </p>
    </div>
  );
};

const ProfileTab: React.FC<{ seller: SellerShop; privateData: SellerPrivate; onSaved: () => void; commissionPercent: number; followers: number }> = ({
  seller,
  privateData,
  onSaved,
  commissionPercent,
  followers,
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

  const [cover, setCover] = useState<string>((seller as any).coverUrl || '');
  const [coverBusy, setCoverBusy] = useState(false);
  const saveCover = async (coverUrl: string) => {
    setCoverBusy(true);
    try {
      await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify({ coverUrl }) });
      setCover(coverUrl);
      showToast(coverUrl ? 'Cover photo saved. It shows on top of your shop page.' : 'Cover photo removed.');
      onSaved();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setCoverBusy(false);
    }
  };

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
      className="space-y-4"
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
      <Panel title="Shop" subtitle="How customers see your shop" flush>
       {/* Cover picture: the wide banner on top of the shop page */}
       <div className="relative aspect-[3/1] max-h-56 w-full bg-gradient-to-r from-[#E8F3EC] via-[#F2F1EC] to-[#FBEFD9] overflow-hidden">
         {cover ? (
           <img src={cover} alt="Shop cover" className="w-full h-full object-cover" />
         ) : (
           <div className="w-full h-full flex flex-col items-center justify-center text-[#6B6963] text-[12px] gap-1">
             <Camera className="w-6 h-6" />
             Add a cover photo: your shop, products or a sale banner
           </div>
         )}
         <div className="absolute top-2 right-2 flex gap-1.5">
           <label className={`${ui.secondary} !bg-white/95 shadow-sm ${coverBusy ? 'opacity-50 pointer-events-none' : ''}`}>
             <Camera className="w-3.5 h-3.5" /> {coverBusy ? 'Saving...' : cover ? 'Change cover' : 'Add cover'}
             <input
               type="file"
               accept="image/*"
               className="hidden"
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 e.target.value = '';
                 if (!f) return;
                 setCoverBusy(true);
                 try {
                   const url = await uploadMedia(await shrinkToCoverJpeg(f));
                   await saveCover(url);
                 } catch (err: any) {
                   showToast(err.message);
                 } finally {
                   setCoverBusy(false);
                 }
               }}
             />
           </label>
           {cover && (
             <button type="button" disabled={coverBusy} onClick={() => saveCover('')} className={`${ui.secondary} !bg-white/95 shadow-sm`}>
               Remove
             </button>
           )}
         </div>
       </div>
       <div className="p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* The profile picture sits half over the cover, like on social media */}
        <SellerAvatar src={photo} name={seller.shopName} size={88} className="border-4 border-white shadow-md relative -mt-12 sm:-mt-14 shrink-0" />
        <div className="space-y-2 text-[12.5px] text-[#6B6963]">
          <div>
            <div className="text-[15px] font-bold text-[#141413]">{seller.shopName}</div>
            {seller.ownerEmail}
          </div>
          {/* Commission, city and followers (shown here instead of on every page) */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`${ui.chip} ${chipTone.green}`}>Commission {commissionPercent}%</span>
            {seller.city && <span className={`${ui.chip} ${chipTone.grey}`}>📍 {seller.city}</span>}
            <span className={`${ui.chip} ${chipTone.blue}`}>
              {followers.toLocaleString('en-PK')} {followers === 1 ? 'follower' : 'followers'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`${ui.dark} ${photoBusy ? 'opacity-50 pointer-events-none' : ''}`}>
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
              <button type="button" disabled={photoBusy} onClick={() => savePhoto('')} className={ui.secondary}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <ShopNameEditor seller={seller} onSaved={onSaved} />
       </div>
      </Panel>

      <SellerSocialLinks
        initial={Array.isArray((seller as any).socialLinks) ? (seller as any).socialLinks : []}
        shopName={seller.shopName}
        shopUrl={`${storeOrigin()}/#shop/${encodeURIComponent(seller.id || firebaseUser?.uid || '')}`}
        showToast={showToast}
        onSave={async (socialLinks) => {
          await api('/api/seller/profile', { method: 'PUT', body: JSON.stringify({ socialLinks }) });
          onSaved();
        }}
      />

      <Panel title="Contact & pickup" subtitle="The courier picks up parcels from this address">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Mobile</label>
            <input className={inputCls} value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="03xx xxxxxxx" />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city} onChange={set('city')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Pickup address</label>
            <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} />
          </div>
        </div>
      </Panel>

      <Panel title="Payout account" help={<HelpDot id="seller.tab.PROFILE" />} subtitle="Your earnings are sent here">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Bank / wallet</label>
            <input className={inputCls} value={form.bankName} onChange={set('bankName')} placeholder="e.g. Meezan Bank, JazzCash" />
          </div>
          <div>
            <label className={labelCls}>Account title</label>
            <input className={inputCls} value={form.accountTitle} onChange={set('accountTitle')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Account number / IBAN</label>
            <input className={inputCls} value={form.accountNumber} onChange={set('accountNumber')} />
          </div>
        </div>
      </Panel>

      <div className="sticky bottom-20 lg:bottom-4 z-10 flex justify-end">
        <button type="submit" disabled={saving} className={`${ui.primary} !px-6 !py-2.5 shadow-lg`}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  );
};
