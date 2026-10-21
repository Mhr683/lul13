import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Share2, Store } from 'lucide-react';
import { ProductImage } from './ProductImage';
import { SellerAvatar } from './SellerAvatar';
import { formatPKR } from '../services/abstractions';
import type { Product } from '../types/store';
import { fetchShop, ProductRatingBadge, SellerRatingBadge, SellerScoreCards, Stars, type ShopInfo } from './SellerRating';

// A seller's shop inside the store (#shop/<sellerId>): the shop's name, picture and city, and every
// live product it sells, with search, category filter and sorting. Products come from the catalog
// the store already has in memory; only the shop details are fetched (cached on the server).

type Feedback = { id: string; rating: number; comment: string; customerName: string; productNames: string[]; createdAt: string; sellerReply?: string };
type Sort = 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'NAME';
const PAGE = 24;

export const SellerShopPage: React.FC<{
  sellerId: string;
  products: Product[];
  onSelectProduct: (p: Product) => void;
  onAddToCart: (p: Product) => void;
  onBack: () => void;
  showToast: (msg: string) => void;
}> = ({ sellerId, products, onSelectProduct, onAddToCart, onBack, showToast }) => {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [sort, setSort] = useState<Sort>('NEWEST');
  const [shown, setShown] = useState(PAGE);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [feedbackShown, setFeedbackShown] = useState(5);

  useEffect(() => {
    let cancelled = false;
    setShop(null);
    setMissing(false);
    setFeedback(null);
    fetch(`/api/shops/${encodeURIComponent(sellerId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setMissing(true);
        const data = await res.json().catch(() => ({}));
        if (data?.shop) setShop(data.shop);
      })
      .catch(() => {
        fetchShop(sellerId).then((s) => !cancelled && s && setShop(s));
      });
    fetch(`/api/shops/${encodeURIComponent(sellerId)}/feedback`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setFeedback(Array.isArray(data?.feedback) ? data.feedback : []);
      })
      .catch(() => !cancelled && setFeedback([]));
    window.scrollTo({ top: 0 });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const shopProducts = useMemo(
    () => products.filter((p) => p.sellerId === sellerId && p.status === 'ACTIVE'),
    [products, sellerId]
  );
  const name = shop?.shopName || shopProducts[0]?.sellerName || 'Shop';

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of shopProducts) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [shopProducts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = shopProducts.filter(
      (p) =>
        (category === 'ALL' || p.category === category) &&
        (!q || [p.name, p.category, p.shortDescription].some((v) => String(v || '').toLowerCase().includes(q)))
    );
    const sorted = [...list];
    if (sort === 'PRICE_ASC') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'PRICE_DESC') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'NAME') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return sorted;
  }, [shopProducts, search, category, sort]);

  useEffect(() => setShown(PAGE), [search, category, sort, sellerId]);

  const share = async () => {
    const url = `${window.location.origin}/#shop/${encodeURIComponent(sellerId)}`;
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        showToast('Shop link copied.');
      }
    } catch {
      // the customer closed the share sheet
    }
  };

  const joined = shop?.joinedAt ? new Date(shop.joinedAt).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }) : '';

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-[#141413] flex items-center gap-1 cursor-pointer hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Shop header */}
      <div className="p-5 sm:p-6 bg-white border border-black/[0.08] flex flex-wrap items-center gap-4">
        <SellerAvatar src={shop?.logoUrl} name={name} size={72} className="border border-black/10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0E7A43]">
            <Store className="w-3.5 h-3.5" /> Shop
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-medium text-[#141413] truncate">{name}</h1>
          <p className="text-xs text-[#575653]">
            {shopProducts.length} {shopProducts.length === 1 ? 'product' : 'products'}
            {shop?.city ? ` · ${shop.city}` : ''}
            {joined ? ` · selling since ${joined}` : ''}
          </p>
          <SellerRatingBadge shop={shop} className="mt-1" />
          <SellerScoreCards shop={shop} className="mt-3 max-w-md" />
        </div>
        <button
          type="button"
          onClick={share}
          className="px-4 py-2 border border-black/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-black"
        >
          <Share2 className="w-4 h-4" /> Share shop
        </button>
      </div>

      {missing && shopProducts.length === 0 ? (
        <div className="p-10 bg-white border border-black/[0.08] text-center text-sm text-[#575653]">
          This shop is not available right now.
        </div>
      ) : (
        <>
          {/* Search, categories, sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#575653]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search in ${name}`}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-black/15 text-sm focus:border-black focus:outline-none"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="px-3 py-2.5 bg-white border border-black/15 text-sm"
            >
              <option value="NEWEST">Newest first</option>
              <option value="PRICE_ASC">Price: low to high</option>
              <option value="PRICE_DESC">Price: high to low</option>
              <option value="NAME">Name A–Z</option>
            </select>
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[['ALL', shopProducts.length] as [string, number], ...categories].map(([c, n]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                    category === c ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/15 text-[#141413]'
                  }`}
                >
                  {c === 'ALL' ? 'All' : c} ({n})
                </button>
              ))}
            </div>
          )}

          {/* Products */}
          {visible.length === 0 ? (
            <div className="p-10 bg-white border border-black/[0.08] text-center text-sm text-[#575653]">
              {shopProducts.length === 0 ? 'This shop has no products right now.' : 'No products match your search.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                {visible.slice(0, shown).map((p) => (
                  <article key={p.id} className="group flex flex-col justify-between border border-black/[0.07] bg-white [content-visibility:auto] [contain-intrinsic-size:auto_340px]">
                    <div>
                      <div onClick={() => onSelectProduct(p)} className="aspect-square bg-[#F7F6F2] overflow-hidden cursor-pointer">
                        <ProductImage
                          src={p.primaryImage}
                          alt={p.name}
                          category={p.category}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      </div>
                      <div className="p-3">
                        <div className="text-[11px] font-semibold text-[#575653] truncate">{p.category}</div>
                        <h3
                          onClick={() => onSelectProduct(p)}
                          className="text-sm font-bold text-black line-clamp-2 cursor-pointer group-hover:text-stone-700"
                        >
                          {p.name}
                        </h3>
                        <ProductRatingBadge rating={p.rating} reviewCount={p.reviewCount} className="mt-1" />
                      </div>
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-black/10 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-extrabold text-black">
                        {formatPKR(p.price)}
                        {p.compareAtPrice && p.compareAtPrice > p.price ? (
                          <span className="block text-[11px] font-normal text-[#575653] line-through">{formatPKR(p.compareAtPrice)}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        disabled={p.stock <= 0}
                        onClick={() => onAddToCart(p)}
                        className="px-3 py-1.5 bg-black text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                      >
                        {p.stock > 0 ? 'Add to Bag' : 'Sold out'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="flex flex-col items-center gap-2 pt-2 text-xs text-[#575653]">
                <span>
                  {Math.min(shown, visible.length)} / {visible.length} products
                </span>
                {visible.length > shown && (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="px-6 py-2.5 bg-[#141413] text-white text-xs font-bold cursor-pointer hover:bg-black"
                  >
                    Show more products
                  </button>
                )}
              </div>
            </>
          )}

          {/* What buyers say (from delivered orders) */}
          <section className="p-5 bg-white border border-black/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-display font-medium text-[#141413]">Customer feedback</h2>
              <SellerRatingBadge shop={shop} />
            </div>
            {feedback === null ? (
              <p className="text-xs text-[#575653]">Loading reviews...</p>
            ) : feedback.length === 0 ? (
              <p className="text-xs text-[#575653]">No reviews yet. Buyers can rate this shop after their order is delivered.</p>
            ) : (
              <>
                <ul className="divide-y divide-black/[0.06]">
                  {feedback.slice(0, feedbackShown).map((f) => (
                    <li key={f.id} className="py-3 space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars value={f.rating} />
                        <strong className="text-[#141413]">{f.customerName}</strong>
                        <span className="text-[#575653]">
                          {new Date(f.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-[10px] font-bold">
                          Verified purchase
                        </span>
                      </div>
                      {f.comment && <p className="text-[#141413] whitespace-pre-line">{f.comment}</p>}
                      {f.productNames?.length > 0 && <p className="text-[#575653] truncate">Bought: {f.productNames.join(', ')}</p>}
                      {f.sellerReply && (
                        <p className="pl-3 border-l-2 border-[#0E7A43] text-[#454441]">
                          <strong>Seller reply:</strong> {f.sellerReply}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {feedback.length > feedbackShown && (
                  <button
                    type="button"
                    onClick={() => setFeedbackShown((n) => n + 10)}
                    className="px-4 py-2 border border-black/20 text-xs font-semibold cursor-pointer"
                  >
                    Show more reviews ({feedback.length - feedbackShown})
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
};
