import React, { useEffect, useState } from 'react';
import { Gift, X, Copy, Timer, ShoppingBag, Share2, Users, Zap } from 'lucide-react';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import { welcomeOf, isCampaignLive, type Campaign } from '../services/promotions';
import { referralLink } from '../services/referral';
import { getSavedOrders } from '../services/myOrders';
import type { Product, StoreSettings } from '../types/store';

// Store growth widgets: welcome offer, flash deals with a countdown, real-purchase notifications,
// festival campaign banners and Refer & Earn.

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

// ---------------------------------------------------------------- welcome offer popup

export const WelcomeOfferPopup: React.FC<{ settings: StoreSettings; onApply: (code: string) => void }> = ({ settings, onApply }) => {
  const w = welcomeOf(settings);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!w.enabled || safeGet('welcome_seen_v1') || getSavedOrders().length > 0) return;
    const t = setTimeout(() => setOpen(true), 6000);
    return () => clearTimeout(t);
  }, [w.enabled]);
  if (!open) return null;
  const close = () => {
    safeSet('welcome_seen_v1', '1');
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white max-w-sm w-full rounded-xl p-6 text-center space-y-3 relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <Gift className="w-10 h-10 mx-auto text-[#0E7A43]" />
        <h2 className="text-2xl font-display font-medium">Welcome! {w.percent}% off</h2>
        <p className="text-sm text-[#575653]">
          Your first order gets {w.percent}% off{w.maxDiscount ? ` (up to ${formatPKR(w.maxDiscount)})` : ''}. Use this code at checkout:
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="px-4 py-2 border-2 border-dashed border-[#0E7A43] font-mono text-lg font-bold tracking-widest">{w.code}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(w.code).catch(() => {})}
            aria-label="Copy code"
            className="p-2 border border-black/20 cursor-pointer"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onApply(w.code);
            close();
          }}
          className="w-full py-3 bg-[#0E7A43] text-white font-bold cursor-pointer"
        >
          Use it on my first order
        </button>
        <p className="text-[10px] text-[#787774]">For new customers only, one order per phone number.</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- countdown

const left = (endsAt: string) => Math.max(0, Date.parse(endsAt) - Date.now());
export const Countdown: React.FC<{ endsAt: string; className?: string }> = ({ endsAt, className = '' }) => {
  const [ms, setMs] = useState(() => left(endsAt));
  useEffect(() => {
    const t = setInterval(() => setMs(left(endsAt)), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <span className={`inline-flex items-center gap-1 font-mono font-bold tabular-nums ${className}`}>
      <Timer className="w-3.5 h-3.5" />
      {ms <= 0 ? 'Ended' : `${d ? `${d}d ` : ''}${hh}:${mm}:${ss}`}
    </span>
  );
};

// ---------------------------------------------------------------- daily / flash deals

export const DailyDeals: React.FC<{
  products: (Product & { flashActive?: boolean })[];
  onSelect: (p: Product) => void;
  onAdd: (p: Product) => void;
  Image: React.FC<{ src?: string; alt: string }>;
}> = ({ products, onSelect, onAdd, Image }) => {
  const deals = products
    .filter((p) => p.flashActive && p.status === 'ACTIVE' && p.stock > 0)
    .sort((a, b) => Date.parse(a.flashEndsAt || '') - Date.parse(b.flashEndsAt || ''))
    .slice(0, 12);
  if (!deals.length) return null;
  const soonest = deals[0].flashEndsAt!;
  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <div className="rounded-xl bg-gradient-to-r from-[#B91C1C] to-[#E8590C] text-white p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-display font-medium flex items-center gap-2">
            <Zap className="w-6 h-6" fill="currentColor" /> Anokhi Daily Deals
          </h2>
          <span className="px-3 py-1 bg-black/25 rounded-full text-sm">
            Ends in <Countdown endsAt={soonest} />
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {deals.map((p) => {
            const off = p.compareAtPrice ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;
            return (
              <div key={p.id} data-pid={p.id} className="shrink-0 w-40 sm:w-48 bg-white text-[#141413] rounded-lg overflow-hidden">
                <button type="button" onClick={() => onSelect(p)} className="block w-full aspect-square bg-[#F7F6F2] relative cursor-pointer">
                  <Image src={p.primaryImage} alt={p.name} />
                  {off > 0 && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-[#B91C1C] text-white text-[10px] font-bold rounded">-{off}%</span>}
                </button>
                <div className="p-2 space-y-1">
                  <p className="text-xs font-semibold line-clamp-2 min-h-[2rem]">{p.name}</p>
                  <div className="text-sm font-bold text-[#B91C1C]">{formatPKR(p.price)}</div>
                  {p.compareAtPrice ? <div className="text-[11px] text-[#787774] line-through">{formatPKR(p.compareAtPrice)}</div> : null}
                  <Countdown endsAt={p.flashEndsAt!} className="text-[10px] text-[#B91C1C]" />
                  <button type="button" onClick={() => onAdd(p)} className="w-full mt-1 py-1.5 bg-[#141413] text-white text-[11px] font-bold cursor-pointer">
                    Add to bag
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- live purchase notifications

type Purchase = { name: string; city: string; productId: string; productName: string; image: string; at: string };
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const SocialProofToast: React.FC<{ enabled: boolean; onOpen: (productId: string) => void }> = ({ enabled, onOpen }) => {
  const [list, setList] = useState<Purchase[]>([]);
  const [i, setI] = useState(-1);
  const [stopped, setStopped] = useState(() => {
    try {
      return sessionStorage.getItem('proof_off') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!enabled || stopped) return;
    fetch('/api/social-proof')
      .then((r) => r.json())
      .then((d) => Array.isArray(d.purchases) && setList(d.purchases))
      .catch(() => {});
  }, [enabled, stopped]);
  useEffect(() => {
    if (!list.length || stopped) return;
    let k = 0;
    const show = () => {
      setI(k % list.length);
      k++;
      setTimeout(() => setI(-1), 6000);
    };
    const first = setTimeout(show, 15000);
    const t = setInterval(show, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [list, stopped]);
  if (i < 0 || !list[i] || stopped) return null;
  const p = list[i];
  return (
    <div className="fixed bottom-4 left-4 z-[70] max-w-[300px] bg-white border border-black/10 shadow-xl rounded-lg p-2.5 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
      <button type="button" onClick={() => onOpen(p.productId)} className="flex items-center gap-2.5 text-left cursor-pointer">
        {p.image ? <img src={p.image} alt="" className="w-12 h-12 object-cover rounded" /> : <ShoppingBag className="w-8 h-8 text-[#0E7A43]" />}
        <span className="text-[11px] leading-snug">
          <strong>
            {p.name}
            {p.city ? ` (${p.city})` : ''}
          </strong>{' '}
          bought <span className="font-semibold">{p.productName}</span>
          <span className="block text-[10px] text-[#787774]">{ago(p.at)} · verified order</span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          try {
            sessionStorage.setItem('proof_off', '1');
          } catch {}
          setStopped(true);
        }}
        className="self-start cursor-pointer"
      >
        <X className="w-3.5 h-3.5 text-[#787774]" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- festival campaigns

export const liveCampaigns = (settings: StoreSettings) => (settings.campaigns || []).filter((c) => isCampaignLive(c));

export const CampaignBanners: React.FC<{ campaigns: Campaign[]; onOpen: (c: Campaign) => void }> = ({ campaigns, onOpen }) => {
  if (!campaigns.length) return null;
  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 grid gap-3 sm:grid-cols-2">
      {campaigns.slice(0, 4).map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c)}
          className="relative overflow-hidden rounded-xl text-left min-h-[120px] p-5 text-white cursor-pointer bg-gradient-to-r from-[#0E7A43] to-[#14532D]"
          style={c.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.65), rgba(0,0,0,.15)), url(${c.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {c.badge && <span className="inline-block px-2 py-0.5 bg-[#C5A059] text-black text-[10px] font-bold rounded mb-1">{c.badge}</span>}
          <div className="text-xl font-display font-medium">{c.title}</div>
          {c.subtitle && <div className="text-xs opacity-90">{c.subtitle}</div>}
          {c.endsAt && (
            <div className="mt-2 text-[11px]">
              Ends in <Countdown endsAt={c.endsAt} />
            </div>
          )}
          <span className="mt-2 inline-block text-xs font-bold underline">Shop now →</span>
        </button>
      ))}
    </section>
  );
};

export const CampaignPage: React.FC<{
  campaign: Campaign;
  products: Product[];
  onSelect: (p: Product) => void;
  onAdd: (p: Product) => void;
  onBack: () => void;
  Image: React.FC<{ src?: string; alt: string }>;
}> = ({ campaign, products, onSelect, onAdd, onBack, Image }) => (
  <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
    <button type="button" onClick={onBack} className="text-xs font-semibold cursor-pointer hover:underline">
      ← Back
    </button>
    <div
      className="rounded-xl p-6 sm:p-10 text-white bg-gradient-to-r from-[#0E7A43] to-[#14532D]"
      style={campaign.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.7), rgba(0,0,0,.2)), url(${campaign.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {campaign.badge && <span className="inline-block px-2 py-0.5 bg-[#C5A059] text-black text-xs font-bold rounded mb-2">{campaign.badge}</span>}
      <h1 className="text-3xl sm:text-4xl font-display font-medium">{campaign.title}</h1>
      {campaign.subtitle && <p className="mt-1 opacity-90">{campaign.subtitle}</p>}
      {campaign.endsAt && (
        <p className="mt-3 text-sm">
          Ends in <Countdown endsAt={campaign.endsAt} />
        </p>
      )}
    </div>
    {products.length === 0 ? (
      <p className="text-sm text-[#575653]">Products for this event are coming soon.</p>
    ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {products.map((p) => (
          <div key={p.id} data-pid={p.id} className="bg-white border border-black/[0.08] rounded-lg overflow-hidden flex flex-col">
            <button type="button" onClick={() => onSelect(p)} className="aspect-square bg-[#F7F6F2] cursor-pointer">
              <Image src={p.primaryImage} alt={p.name} />
            </button>
            <div className="p-2.5 flex-1 flex flex-col gap-1">
              <p className="text-xs font-semibold line-clamp-2 min-h-[2rem]">{p.name}</p>
              <div className="text-sm font-bold">{formatPKR(p.price)}</div>
              {p.compareAtPrice && p.compareAtPrice > p.price ? <div className="text-[11px] text-[#787774] line-through">{formatPKR(p.compareAtPrice)}</div> : null}
              <button type="button" onClick={() => onAdd(p)} disabled={p.stock <= 0} className="mt-auto py-1.5 bg-[#141413] text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer">
                {p.stock > 0 ? 'Add to bag' : 'Out of stock'}
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------- refer & earn

export type ReferralInfo = { enabled: boolean; code: string; rewardPkr: number; maxPercentOfOrder: number; friends: number; earned: number; used: number; available: number };

export async function fetchReferral(): Promise<ReferralInfo | null> {
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  const res = await fetch('/api/referral/me', { headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } });
  if (!res.ok) return null;
  return res.json();
}

export const ReferAndEarnCard: React.FC<{ signedIn: boolean; onSignIn: () => void; showToast: (m: string) => void }> = ({ signedIn, onSignIn, showToast }) => {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  useEffect(() => {
    if (signedIn) fetchReferral().then(setInfo).catch(() => {});
  }, [signedIn]);
  if (info && !info.enabled) return null;
  const link = info ? referralLink(info.code) : '';
  const share = async () => {
    const text = `I shop at Anokha Shopping Hub. Use my link for your first order: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Anokha Shopping Hub', text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        showToast('Your link is copied. Send it to your friends!');
      }
    } catch {}
  };
  return (
    <div className="p-5 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-[#0E7A43]" />
        <strong className="text-sm">Refer & Earn</strong>
      </div>
      <p className="text-xs text-[#454441]">
        Share your link. When a friend places their first order and it is delivered, you get{' '}
        <strong>{formatPKR(info?.rewardPkr ?? 200)}</strong> off your next purchase.
      </p>
      {!signedIn ? (
        <button type="button" onClick={onSignIn} className="px-4 py-2 bg-[#141413] text-white text-xs font-bold cursor-pointer">
          Sign in to get your link
        </button>
      ) : !info ? (
        <p className="text-xs text-[#575653]">Loading...</p>
      ) : (
        <>
          <div className="flex gap-2">
            <input readOnly value={link} className="flex-1 min-w-0 px-3 py-2 border border-black/15 text-xs bg-white" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={share} className="px-3 py-2 bg-[#0E7A43] text-white text-xs font-bold flex items-center gap-1 cursor-pointer">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white border border-black/10 rounded">
              <div className="text-lg font-bold">{info.friends}</div>
              <div className="text-[10px] text-[#575653]">friends ordered</div>
            </div>
            <div className="p-2 bg-white border border-black/10 rounded">
              <div className="text-lg font-bold">{formatPKR(info.earned)}</div>
              <div className="text-[10px] text-[#575653]">earned</div>
            </div>
            <div className="p-2 bg-white border border-emerald-300 rounded">
              <div className="text-lg font-bold text-[#0E7A43]">{formatPKR(info.available)}</div>
              <div className="text-[10px] text-[#575653]">to use at checkout</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
