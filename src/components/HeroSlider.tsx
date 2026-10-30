import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Flame, PlayCircle, Sparkles, Tag, Zap } from 'lucide-react';
import type { Product, StoreSettings } from '../types/store';
import type { Campaign } from '../services/promotions';
import { formatPKR } from '../services/abstractions';
import { formatMoney } from '../services/currency';

// Home page hero: slides that move by themselves (and with a swipe) — live campaigns, flash deals
// with a running countdown, product videos, big discounts, new arrivals and the store's own slide.
// Everything comes from the catalog already loaded in the browser: no extra database reads.
// Below it, a strip of trending products scrolls on its own.

type Slide = {
  key: string;
  kind: 'CAMPAIGN' | 'FLASH' | 'VIDEO' | 'SALE' | 'NEW' | 'STORE';
  badge: string;
  title: string;
  subtitle?: string;
  image?: string;
  video?: string;
  price?: number;
  oldPrice?: number;
  endsAt?: string;
  cta: string;
  accent: string;
  open: () => void;
};

type P = Product & { flashActive?: boolean };

const isDirectVideo = (u?: string) => !!u && (/\.(mp4|webm|mov)(\?|#|$)/i.test(u) || /^\/media\/[\w.-]+\.(mp4|webm|mov)$/i.test(u));
const pctOff = (price: number, old?: number) => (old && old > price ? Math.round(((old - price) / old) * 100) : 0);
const AUTO_MS = 5000;
const VIDEO_MS = 9000;

const Countdown: React.FC<{ endsAt: string }> = ({ endsAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0'));
  return (
    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="opacity-70">:</span>}
          <span className="px-1.5 py-0.5 bg-white text-[#B91C1C] font-bold rounded">{p}</span>
        </React.Fragment>
      ))}
    </span>
  );
};

export const HeroSlider: React.FC<{
  products: P[];
  campaigns: Campaign[];
  settings: StoreSettings;
  onOpenProduct: (p: Product) => void;
  onOpenCampaign: (c: Campaign) => void;
  onShopAll: () => void;
  renderImage: (src: string, alt: string, className: string, eager: boolean) => React.ReactNode;
}> = ({ products, campaigns, settings, onOpenProduct, onOpenCampaign, onShopAll, renderImage }) => {
  // The page passes new handler functions on every render; reading them through a ref keeps the
  // slides (and the autoplay timer) from being rebuilt each time
  const handlers = useRef({ onOpenProduct, onOpenCampaign, onShopAll });
  handlers.current = { onOpenProduct, onOpenCampaign, onShopAll };
  const slides = useMemo<Slide[]>(() => {
    const onOpenProduct = (p: Product) => handlers.current.onOpenProduct(p);
    const onOpenCampaign = (c: Campaign) => handlers.current.onOpenCampaign(c);
    const onShopAll = () => handlers.current.onShopAll();
    const live = products.filter((p) => p.status === 'ACTIVE' && p.stock > 0 && p.primaryImage);
    const used = new Set<string>();
    const take = (list: P[], n: number) => {
      const out: P[] = [];
      for (const p of list) {
        if (out.length >= n) break;
        if (!used.has(p.id)) {
          used.add(p.id);
          out.push(p);
        }
      }
      return out;
    };
    const s: Slide[] = [];
    for (const c of campaigns.slice(0, 3)) {
      s.push({
        key: `c-${c.id}`,
        kind: 'CAMPAIGN',
        badge: c.badge || 'Special offer',
        title: c.title,
        subtitle: c.subtitle,
        image: c.bannerUrl,
        cta: 'Shop the sale',
        accent: 'from-[#7C2D12] to-[#B45309]',
        open: () => onOpenCampaign(c),
      });
    }
    const flash = take(
      live.filter((p) => p.flashActive).sort((a, b) => pctOff(b.price, b.compareAtPrice) - pctOff(a.price, a.compareAtPrice)),
      3
    );
    for (const p of flash) {
      s.push({
        key: `f-${p.id}`,
        kind: 'FLASH',
        badge: `Flash deal${pctOff(p.price, p.compareAtPrice) ? ` · ${pctOff(p.price, p.compareAtPrice)}% off` : ''}`,
        title: p.name,
        image: p.primaryImage,
        price: p.price,
        oldPrice: p.compareAtPrice,
        endsAt: p.flashEndsAt,
        cta: 'Grab the deal',
        accent: 'from-[#7F1D1D] to-[#DC2626]',
        open: () => onOpenProduct(p),
      });
    }
    for (const p of take(live.filter((p) => isDirectVideo(p.videoUrl)), 2)) {
      s.push({
        key: `v-${p.id}`,
        kind: 'VIDEO',
        badge: 'Watch it in action',
        title: p.name,
        subtitle: p.shortDescription,
        image: p.primaryImage,
        video: p.videoUrl,
        price: p.price,
        oldPrice: p.compareAtPrice,
        cta: 'Watch & shop',
        accent: 'from-[#111827] to-[#1F2937]',
        open: () => onOpenProduct(p),
      });
    }
    const sale = take(
      live.filter((p) => pctOff(p.price, p.compareAtPrice) >= 10).sort((a, b) => pctOff(b.price, b.compareAtPrice) - pctOff(a.price, a.compareAtPrice)),
      2
    );
    for (const p of sale) {
      s.push({
        key: `s-${p.id}`,
        kind: 'SALE',
        badge: `Save ${pctOff(p.price, p.compareAtPrice)}%`,
        title: p.name,
        subtitle: p.shortDescription,
        image: p.primaryImage,
        price: p.price,
        oldPrice: p.compareAtPrice,
        cta: 'Shop now',
        accent: 'from-[#064E3B] to-[#0E7A43]',
        open: () => onOpenProduct(p),
      });
    }
    const fresh = take(
      [...live].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || String(b.createdAt).localeCompare(String(a.createdAt))),
      Math.max(2, 6 - s.length)
    );
    for (const p of fresh) {
      s.push({
        key: `n-${p.id}`,
        kind: 'NEW',
        badge: p.featured ? 'Top pick' : 'Just in',
        title: p.name,
        subtitle: p.shortDescription,
        image: p.primaryImage,
        price: p.price,
        oldPrice: p.compareAtPrice,
        cta: 'View product',
        accent: 'from-[#1E3A8A] to-[#2563EB]',
        open: () => onOpenProduct(p),
      });
    }
    s.push({
      key: 'store',
      kind: 'STORE',
      badge: settings.heroEyebrow || 'Cash on Delivery · All over Pakistan',
      title: settings.heroTitle || settings.tagline || `Welcome to ${settings.storeName || 'our store'}`,
      subtitle: settings.heroSubtitle || 'Quality products at fair prices, delivered to your door. Order now and pay when your parcel arrives.',
      image: settings.heroImageUrl || undefined,
      cta: 'Shop all products',
      accent: 'from-[#141413] to-[#3F3F3A]',
      open: onShopAll,
    });
    return s.slice(0, 9);
  }, [products, campaigns, settings]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const active = Math.min(index, count - 1);
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // Moves on by itself; waits while the visitor holds or hovers it, or the tab is hidden (then it
  // tries again a little later instead of stopping for good)
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (paused || count < 2) return;
    const ms = slides[active]?.kind === 'VIDEO' ? VIDEO_MS : AUTO_MS;
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') go(active + 1);
      else setRetry((n) => n + 1);
    }, ms);
    return () => clearTimeout(t);
  }, [active, paused, count, go, slides[active]?.kind, retry]);

  // Swipe with a finger (or drag with the mouse)
  // The distance lives in the ref too: a quick swipe can end before React has re-rendered
  const drag = useRef<{ x: number; y: number; moved: boolean; dx: number } | null>(null);
  const [dx, setDx] = useState(0);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, dx: 0 };
    setPaused(true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const mx = e.clientX - drag.current.x;
    if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(e.clientY - drag.current.y)) {
      drag.current.moved = true;
      drag.current.dx = mx;
      setDx(mx);
    }
  };
  const onUp = () => {
    if (!drag.current) return;
    const moved = drag.current.dx;
    if (moved < -50) go(active + 1);
    else if (moved > 50) go(active - 1);
    setDx(0);
    setTimeout(() => (drag.current = null), 0);
    setPaused(false);
  };
  const clickSlide = (s: Slide) => {
    if (drag.current?.moved) return;
    s.open();
  };

  if (!count) return null;

  return (
    <section
      className="relative overflow-hidden bg-[#141413] select-none"
      aria-roledescription="carousel"
      aria-label="Offers and products"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes hs-zoom { from { transform: scale(1) } to { transform: scale(1.08) } }
        @keyframes hs-up { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes hs-bar { from { width: 0 } to { width: 100% } }
        .hs-zoom { animation: hs-zoom 9s ease-out forwards }
        .hs-up { animation: hs-up .6s ease-out both }
      `}</style>

      <div
        className="flex touch-pan-y"
        style={{ transform: `translateX(calc(${-active * 100}% + ${dx}px))`, transition: dx ? 'none' : 'transform 600ms cubic-bezier(.22,.8,.2,1)' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => drag.current && onUp()}
      >
        {slides.map((s, i) => {
          const isActive = i === active;
          const off = pctOff(s.price || 0, s.oldPrice);
          return (
            <div
              key={s.key}
              className={`relative w-full shrink-0 h-[360px] sm:h-[380px] lg:h-[460px] cursor-pointer bg-gradient-to-br ${s.accent}`}
              onClick={() => clickSlide(s)}
              aria-hidden={!isActive}
              role="group"
              aria-label={`${i + 1} of ${count}: ${s.title}`}
            >
              {/* Soft blurred copy of the picture fills the background */}
              {s.image && (
                <div className="absolute inset-0 opacity-40 blur-2xl scale-110 pointer-events-none">
                  {renderImage(s.image, '', 'w-full h-full object-cover', i === 0)}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black/75 via-black/35 to-black/5 pointer-events-none" />

              <div className="relative h-full max-w-[1360px] mx-auto px-4 sm:px-10 grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
                {/* The product / banner, gently zooming while it is shown */}
                <div className="absolute inset-x-0 top-0 h-[47%] sm:static sm:h-full sm:order-2 flex items-center justify-center overflow-hidden">
                  {s.video && isActive ? (
                    <video
                      src={s.video}
                      poster={s.image}
                      className="max-h-full max-w-full object-contain sm:rounded shadow-2xl"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : s.image ? (
                    <div className={`h-full w-full flex items-center justify-center p-3 sm:p-8 ${isActive ? 'hs-zoom' : ''}`}>
                      {renderImage(s.image, s.title, 'max-h-full max-w-full object-contain drop-shadow-2xl rounded', i === 0)}
                    </div>
                  ) : (
                    <Sparkles className="w-24 h-24 text-white/20" />
                  )}
                  {s.video && !isActive && <PlayCircle className="absolute w-14 h-14 text-white/80" />}
                </div>

                {/* Words: badge, title, price / countdown, button */}
                <div key={isActive ? `on-${s.key}` : s.key} className="relative z-10 self-end sm:self-center pb-9 sm:pb-0 text-white space-y-1.5 sm:space-y-3 sm:order-1">
                  <span className={`${isActive ? 'hs-up' : ''} inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/15 backdrop-blur border border-white/25 text-[11px] sm:text-xs font-bold uppercase tracking-wider rounded-full`}>
                    {s.kind === 'FLASH' ? <Zap className="w-3.5 h-3.5 text-yellow-300" /> : s.kind === 'SALE' ? <Tag className="w-3.5 h-3.5" /> : s.kind === 'VIDEO' ? <PlayCircle className="w-3.5 h-3.5" /> : s.kind === 'CAMPAIGN' ? <Flame className="w-3.5 h-3.5 text-orange-300" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {s.badge}
                  </span>
                  <h2
                    className={`${isActive ? 'hs-up' : ''} text-lg sm:text-3xl lg:text-5xl font-display font-medium leading-tight line-clamp-2 [text-shadow:0_2px_8px_rgba(0,0,0,0.5)]`}
                    style={{ animationDelay: '80ms' }}
                  >
                    {s.title}
                  </h2>
                  {s.subtitle && (
                    <p className={`${isActive ? 'hs-up' : ''} hidden sm:block text-sm lg:text-base text-white/85 max-w-md line-clamp-2`} style={{ animationDelay: '140ms' }}>
                      {s.subtitle}
                    </p>
                  )}
                  {(s.price || s.endsAt) && (
                    <div className={`${isActive ? 'hs-up' : ''} flex flex-wrap items-center gap-x-3 gap-y-1.5`} style={{ animationDelay: '200ms' }}>
                      {s.price ? <span className="text-lg sm:text-2xl font-extrabold font-mono">{formatMoney(s.price)}</span> : null}
                      {off > 0 && (
                        <>
                          <span className="text-xs sm:text-sm line-through text-white/60 font-mono">{formatMoney(Number(s.oldPrice))}</span>
                          <span className="px-1.5 py-0.5 bg-[#DC2626] text-white text-[11px] font-bold rounded">-{off}%</span>
                        </>
                      )}
                      {s.endsAt && (
                        <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold">
                          Ends in <Countdown endsAt={s.endsAt} />
                        </span>
                      )}
                    </div>
                  )}
                  <div className={isActive ? 'hs-up' : ''} style={{ animationDelay: '260ms' }}>
                    <span className="inline-flex items-center gap-2 mt-1 px-4 sm:px-6 py-2 sm:py-3 bg-white text-[#141413] text-xs sm:text-sm font-bold rounded-full shadow-lg group-hover:gap-3 transition-all">
                      {s.cta} <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous slide"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/20 hover:bg-white/40 backdrop-blur text-white cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next slide"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/20 hover:bg-white/40 backdrop-blur text-white cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* Dots; the current one fills up until the next slide */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full overflow-hidden bg-white/35 cursor-pointer transition-all ${i === active ? 'w-8' : 'w-1.5'}`}
              >
                {i === active && (
                  <span
                    key={`${active}-${paused}`}
                    className="block h-full bg-white"
                    style={{ animation: paused ? 'none' : `hs-bar ${s.kind === 'VIDEO' ? VIDEO_MS : AUTO_MS}ms linear forwards`, width: paused ? '100%' : undefined }}
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

/** Products that scroll sideways on their own (tap one to open it; touching it pauses it) */
export const TrendingTicker: React.FC<{
  products: P[];
  onOpen: (p: Product) => void;
  renderImage: (src: string, alt: string, className: string, eager: boolean) => React.ReactNode;
}> = ({ products, onOpen, renderImage }) => {
  const list = useMemo(
    () =>
      products
        .filter((p) => p.status === 'ACTIVE' && p.stock > 0 && p.primaryImage)
        .sort((a, b) => Number(!!b.bestSeller) - Number(!!a.bestSeller) || (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0))
        .slice(0, 14),
    [products]
  );
  if (list.length < 4) return null;
  const row = [...list, ...list];
  return (
    <div className="bg-white border-b border-black/[0.07] py-2.5 overflow-hidden">
      <style>{`
        @keyframes tt-move { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .tt-track { animation: tt-move ${list.length * 4}s linear infinite }
        .tt-wrap:hover .tt-track, .tt-wrap:active .tt-track { animation-play-state: paused }
      `}</style>
      <div className="flex items-center gap-3">
        <span className="shrink-0 pl-3 sm:pl-6 flex items-center gap-1 text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#B91C1C]">
          <Flame className="w-4 h-4" /> Trending
        </span>
        <div className="tt-wrap flex-1 overflow-hidden">
          <div className="tt-track flex w-max gap-2.5">
            {row.map((p, i) => (
              <button
                key={`${p.id}-${i}`}
                type="button"
                onClick={() => onOpen(p)}
                className="flex items-center gap-2 pr-3 bg-[#F7F6F2] border border-black/[0.06] rounded-full cursor-pointer hover:border-black/30"
              >
                <span className="w-9 h-9 rounded-full overflow-hidden bg-white shrink-0">{renderImage(p.primaryImage!, p.name, 'w-full h-full object-cover', false)}</span>
                <span className="text-[11px] font-semibold text-[#141413] max-w-[120px] truncate">{p.name}</span>
                <span className="text-[11px] font-extrabold font-mono text-[#0E7A43]">{formatMoney(p.price)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
