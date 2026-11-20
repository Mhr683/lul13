import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useShopInfo, SellerRatingBadge } from './SellerRating';

// Store home page: last month's Top Sellers (server/topSellers.ts). Hidden until there are winners.

type TopSeller = { id: string; name: string; shopId: string; rank: number };
const MEDAL = ['🥇', '🥈', '🥉'];

const Card: React.FC<{ s: TopSeller; onOpen: (id: string) => void }> = ({ s, onOpen }) => {
  const shop = useShopInfo(s.id);
  const initials = s.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      className="flex items-center gap-3 p-3 rounded-xl bg-white border border-amber-200 hover:border-amber-400 hover:shadow-md transition text-left cursor-pointer min-w-0"
    >
      <span className="text-2xl shrink-0" aria-label={`Number ${s.rank}`}>
        {MEDAL[s.rank - 1] || '🏅'}
      </span>
      {shop?.logoUrl ? (
        <img src={shop.logoUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-black/10 shrink-0" loading="lazy" />
      ) : (
        <span className="w-11 h-11 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center justify-center shrink-0">{initials}</span>
      )}
      <span className="min-w-0">
        <span className="block font-bold text-[14px] text-[#141413] truncate">{s.name}</span>
        <SellerRatingBadge shop={shop} className="mt-0.5" />
        <span className="block text-[11px] text-[#787774] mt-0.5">Visit shop →</span>
      </span>
    </button>
  );
};

export const TopSellersStrip: React.FC<{ onOpenShop: (sellerId: string) => void }> = ({ onOpenShop }) => {
  const [data, setData] = useState<{ monthName: string; list: TopSeller[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/top-sellers')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.list?.length && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!data) return null;
  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8">
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#141413]">
          <Trophy className="w-5 h-5 text-amber-600" /> Top Sellers of {data.monthName}
        </h2>
        <p className="text-[12px] text-[#575653] mt-0.5">The shops customers loved most last month.</p>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          {data.list.map((s) => (
            <Card key={s.id} s={s} onOpen={onOpenShop} />
          ))}
        </div>
      </div>
    </section>
  );
};
