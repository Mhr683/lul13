import React, { useEffect, useState } from 'react';
import { Star, Clock3, RotateCcw, Award } from 'lucide-react';

// Seller rating shown to customers: stars, average, number of ratings and % positive.
// Shop details come from /api/shops/:id (cached on the server); one request per shop per page load.

export type ShopInfo = {
  id: string;
  shopName: string;
  logoUrl: string;
  city: string;
  joinedAt: string;
  ratingAvg: number;
  ratingCount: number;
  positivePercent: number;
  likes: number;
  dislikes: number;
  /** Percentages from the shop's recent orders (null = not enough orders yet) */
  metrics?: { orders: number; onTimeDelivery: number | null; cancellation: number | null; qualityScore: number | null } | null;
};

const shopCache = new Map<string, Promise<ShopInfo | null>>();
export function fetchShop(sellerId: string): Promise<ShopInfo | null> {
  let p = shopCache.get(sellerId);
  if (!p) {
    p = fetch(`/api/shops/${encodeURIComponent(sellerId)}`)
      .then(async (res) => (res.ok ? ((await res.json()).shop as ShopInfo) : null))
      .catch(() => null);
    shopCache.set(sellerId, p);
    // a failed lookup can be tried again later
    p.then((v) => {
      if (!v) shopCache.delete(sellerId);
    });
  }
  return p;
}
export const forgetShopInfo = (sellerId: string) => shopCache.delete(sellerId);

export function useShopInfo(sellerId?: string | null) {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  useEffect(() => {
    if (!sellerId) return setShop(null);
    let live = true;
    fetchShop(sellerId).then((s) => live && setShop(s));
    return () => {
      live = false;
    };
  }, [sellerId]);
  return shop;
}

export const Stars: React.FC<{ value: number; size?: number; className?: string }> = ({ value, size = 14, className = '' }) => (
  <span className={`inline-flex items-center ${className}`} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((i) => {
      const fill = Math.max(0, Math.min(1, value - (i - 1)));
      return (
        <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
          <Star className="absolute inset-0 text-[#D6D3CC]" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
            <Star className="text-[#F5A524]" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
          </span>
        </span>
      );
    })}
  </span>
);

/** The seller's three scores for customers: on-time delivery, cancellation and quality */
export const SellerScoreCards: React.FC<{ shop: ShopInfo | null; className?: string }> = ({ shop, className = '' }) => {
  if (!shop) return null;
  const m = shop.metrics;
  const show = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
  const cards = [
    {
      label: 'On-time Delivery',
      value: m?.onTimeDelivery,
      Icon: Clock3,
      box: 'bg-gradient-to-br from-orange-50 to-white border-orange-100',
      icon: 'text-orange-500',
      title: 'Orders handed to the courier within 3 days',
    },
    {
      label: 'Cancellation',
      value: m?.cancellation,
      Icon: RotateCcw,
      box: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-100',
      icon: 'text-emerald-600',
      title: 'Orders the seller cancelled',
    },
    {
      label: 'Quality Score',
      value: m?.qualityScore,
      Icon: Award,
      box: 'bg-gradient-to-br from-cyan-50 to-white border-cyan-100',
      icon: 'text-cyan-600',
      title: 'Delivered without returns, and buyers’ ratings',
    },
  ];
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="grid grid-cols-3 gap-2">
        {cards.map(({ label, value, Icon, box, icon, title }) => (
          <div key={label} title={title} className={`p-2.5 sm:p-3 border rounded-lg text-center shadow-sm ${box}`}>
            <Icon className={`w-6 h-6 mx-auto ${icon}`} />
            <div className="mt-1 text-base font-bold text-[#141413]">{show(value)}</div>
            <div className="text-[10px] sm:text-[11px] text-[#575653] leading-tight">{label}</div>
          </div>
        ))}
      </div>
      {(!m || !m.orders) && <p className="text-[10px] text-[#787774]">New shop: scores appear after the first orders.</p>}
    </div>
  );
};

/** Product cards / product page: "★★★★☆ 4.6 (23)", or "No ratings yet". Product rating and
 * reviewCount are updated by the server when a buyer rates a delivered order. */
export const ProductRatingBadge: React.FC<{ rating?: number; reviewCount?: number; size?: number; className?: string }> = ({
  rating,
  reviewCount,
  size = 12,
  className = '',
}) => {
  const count = Number(reviewCount) || 0;
  if (!count) {
    return <span className={`text-[11px] font-semibold text-[#787774] ${className}`}>No ratings yet</span>;
  }
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${className}`} title={`${value.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'rating' : 'ratings'}`}>
      <Stars value={value} size={size} />
      <strong className="text-[#141413]">{value.toFixed(1)}</strong>
      <span className="text-[#575653]">({count})</span>
    </span>
  );
};

/** "★★★★☆ 4.6 (23 ratings) · 96% positive", or "New seller" when nobody has rated yet */
export const SellerRatingBadge: React.FC<{ shop: Pick<ShopInfo, 'ratingAvg' | 'ratingCount' | 'positivePercent'> | null; className?: string }> = ({
  shop,
  className = '',
}) => {
  if (!shop) return null;
  if (!shop.ratingCount) {
    return <span className={`text-[11px] font-semibold text-[#575653] ${className}`}>New seller · no ratings yet</span>;
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 text-xs ${className}`}>
      <Stars value={shop.ratingAvg} />
      <strong className="text-[#141413]">{shop.ratingAvg.toFixed(1)}</strong>
      <span className="text-[#575653]">
        ({shop.ratingCount} {shop.ratingCount === 1 ? 'rating' : 'ratings'})
      </span>
      <span
        className={`font-bold ${
          shop.positivePercent >= 90 ? 'text-emerald-700' : shop.positivePercent >= 70 ? 'text-amber-700' : 'text-rose-700'
        }`}
      >
        · {shop.positivePercent}% positive
      </span>
    </span>
  );
};
