import React, { useEffect, useState } from 'react';
import { Stars } from './SellerRating';
import { ProductQuestions } from './ProductExtras';

// Product page tabs: "Description", "Reviews" and "Questions". Reviews from the order tracking page
// (after delivery) are verified purchases; reviews written on the product page are shown once an
// admin approves them, without the "verified" badge.

type ProductReview = { id: string; rating: number; comment: string; customerName: string; createdAt: string; sellerReply?: string };
type LegacyReview = { id: string; rating: number; title?: string; comment: string; authorName?: string; createdAt: string };

const reviewCache = new Map<string, ProductReview[]>();

export const ProductInfoTabs: React.FC<{
  productId: string;
  description?: string;
  shortDescription?: string;
  details: { label: string; value: React.ReactNode }[];
  legacyReviews?: LegacyReview[];
}> = ({ productId, description, shortDescription, details, legacyReviews = [] }) => {
  const [tab, setTab] = useState<'DESCRIPTION' | 'REVIEWS' | 'QUESTIONS'>('DESCRIPTION');
  const [reviews, setReviews] = useState<ProductReview[] | null>(() => reviewCache.get(productId) || null);
  const [questionCount, setQuestionCount] = useState<number | null>(null);

  useEffect(() => {
    setTab('DESCRIPTION');
    setQuestionCount(null);
    const cached = reviewCache.get(productId);
    setReviews(cached || null);
    if (cached) return;
    let live = true;
    fetch(`/api/products/${encodeURIComponent(productId)}/reviews`)
      .then((r) => r.json())
      .then((d) => {
        const list: ProductReview[] = Array.isArray(d?.reviews) ? d.reviews : [];
        reviewCache.set(productId, list);
        if (live) setReviews(list);
      })
      .catch(() => live && setReviews([]));
    return () => {
      live = false;
    };
  }, [productId]);

  const all = [
    ...(reviews || []).map((r) => ({ ...r, verified: true })),
    ...legacyReviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: [r.title, r.comment].filter(Boolean).join(' — '),
      customerName: r.authorName || 'Customer',
      createdAt: r.createdAt,
      sellerReply: '',
      verified: false,
    })),
  ];
  const avg = all.length ? Math.round((all.reduce((s, r) => s + Number(r.rating || 0), 0) / all.length) * 10) / 10 : 0;
  const tabCls = (on: boolean) =>
    `pb-3 px-1 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
      on ? 'border-[#E8590C] text-[#E8590C]' : 'border-transparent text-[#575653] hover:text-[#141413]'
    }`;

  return (
    <section className="bg-white border border-black/[0.07] rounded-lg p-5 sm:p-7 space-y-5">
      <div className="flex gap-8 border-b border-black/10">
        <button type="button" onClick={() => setTab('DESCRIPTION')} className={tabCls(tab === 'DESCRIPTION')}>
          Description
        </button>
        <button type="button" onClick={() => setTab('REVIEWS')} className={tabCls(tab === 'REVIEWS')}>
          Reviews{reviews !== null ? ` (${all.length})` : ''}
        </button>
        <button type="button" onClick={() => setTab('QUESTIONS')} className={tabCls(tab === 'QUESTIONS')}>
          Questions{questionCount ? ` (${questionCount})` : ''}
        </button>
      </div>

      {tab === 'QUESTIONS' ? (
        <ProductQuestions productId={productId} onCount={setQuestionCount} />
      ) : tab === 'DESCRIPTION' ? (
        <div className="space-y-4 text-sm text-[#454441] leading-relaxed">
          {shortDescription && shortDescription !== description && <p className="font-medium text-[#141413]">{shortDescription}</p>}
          <p className="whitespace-pre-line">{description || shortDescription || 'No description yet.'}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {details.map((d) => (
              <div key={d.label} className="p-3 border border-black/[0.07] bg-[#FBFBF9]">
                <dt className="font-medium text-[#141413]">{d.label}</dt>
                <dd className="font-mono tabular-nums text-[#575653]">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : reviews === null ? (
        <p className="text-xs text-[#575653]">Loading reviews...</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-[#575653]">
          No reviews yet. Buyers can review this product from their order tracking page after it is delivered.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-[#141413]">{avg.toFixed(1)}</span>
            <div>
              <Stars value={avg} size={18} />
              <p className="text-xs text-[#575653]">
                {all.length} {all.length === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-black/[0.06]">
            {all.slice(0, 30).map((r) => (
              <li key={r.id} className="py-3 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Stars value={r.rating} />
                  <strong className="text-[#141413]">{r.customerName}</strong>
                  <span className="text-[#787774]">
                    {new Date(r.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {r.verified && (
                    <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-[10px] font-bold">
                      Verified purchase
                    </span>
                  )}
                </div>
                {r.comment && <p className="text-[#454441] whitespace-pre-line">{r.comment}</p>}
                {r.sellerReply && (
                  <p className="pl-3 border-l-2 border-[#0E7A43] text-xs text-[#454441]">
                    <strong>Seller reply:</strong> {r.sellerReply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
