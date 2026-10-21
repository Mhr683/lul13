import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

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
