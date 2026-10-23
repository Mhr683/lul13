import React, { useEffect, useState } from 'react';
import { ChevronDown, FileDown, ListChecks, Sparkles, PlayCircle } from 'lucide-react';
import { Stars } from './SellerRating';
import { ProductQuestions } from './ProductExtras';
import { VideoEmbed, isPlayableVideo } from './ProductGallery';
import { ReviewMediaStrip } from './ReviewMedia';
import { infoLines, type ProductInfo } from '../services/productInfo';

// One collapsible section of the "How to use & care" tab
const Section: React.FC<{ title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({
  title,
  icon,
  open,
  onToggle,
  children,
}) => (
  <div className="border border-black/[0.08]">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left text-sm font-semibold text-[#141413] bg-[#FBFBF9] hover:bg-black/[0.03] cursor-pointer"
    >
      <span className="flex items-center gap-2">
        {icon}
        {title}
      </span>
      <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="px-4 py-4 text-sm text-[#454441] leading-relaxed space-y-3">{children}</div>}
  </div>
);

const UsageAndCare: React.FC<{ info: ProductInfo; productName: string }> = ({ info, productName }) => {
  const steps = infoLines(info.howToUse);
  const care = infoLines(info.careInstructions);
  const hasVideo = isPlayableVideo(info.howToUseVideoUrl);
  const [open, setOpen] = useState<Record<string, boolean>>({ use: true, care: true, manual: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  return (
    <div className="space-y-3">
      {(steps.length > 0 || hasVideo) && (
        <Section title="How to use" icon={<PlayCircle className="w-4 h-4 text-[#E8590C]" />} open={open.use} onToggle={() => toggle('use')}>
          {steps.length > 0 && (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#141413] text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          )}
          {hasVideo && (
            <div className="aspect-video w-full max-w-2xl bg-black">
              <VideoEmbed url={info.howToUseVideoUrl!} title={`How to use ${productName}`} />
            </div>
          )}
        </Section>
      )}
      {care.length > 0 && (
        <Section title="Cleaning & care" icon={<Sparkles className="w-4 h-4 text-[#0E7A43]" />} open={open.care} onToggle={() => toggle('care')}>
          <ul className="grid sm:grid-cols-2 gap-2">
            {care.map((c, i) => (
              <li key={i} className="flex gap-2">
                <ListChecks className="w-4 h-4 shrink-0 mt-0.5 text-[#0E7A43]" />
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.manualUrl && (
        <Section title="User manual" icon={<FileDown className="w-4 h-4 text-[#2563EB]" />} open={open.manual} onToggle={() => toggle('manual')}>
          <a
            href={info.manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#141413] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#2A2A28]"
          >
            <FileDown className="w-4 h-4" /> Download user manual (PDF)
          </a>
        </Section>
      )}
    </div>
  );
};

/** True when the product has anything for the "How to use & care" tab */
const hasUsage = (info?: ProductInfo) =>
  Boolean(info && (infoLines(info.howToUse).length || isPlayableVideo(info.howToUseVideoUrl) || infoLines(info.careInstructions).length || info.manualUrl));

// Product page tabs: "Description", "Reviews" and "Questions". Reviews from the order tracking page
// (after delivery) are verified purchases; reviews written on the product page are shown once an
// admin approves them, without the "verified" badge.

type ProductReview = { id: string; rating: number; comment: string; customerName: string; createdAt: string; sellerReply?: string; media?: string[] };
type LegacyReview = { id: string; rating: number; title?: string; comment: string; authorName?: string; createdAt: string };

const reviewCache = new Map<string, ProductReview[]>();

export const ProductInfoTabs: React.FC<{
  productId: string;
  description?: string;
  shortDescription?: string;
  details: { label: string; value: React.ReactNode }[];
  legacyReviews?: LegacyReview[];
  info?: ProductInfo;
  productName?: string;
  /** The product's verified review count (kept by the server): 0 = nothing to load */
  reviewCount?: number;
}> = ({ productId, description, shortDescription, details, legacyReviews = [], info, productName = '', reviewCount }) => {
  const [tab, setTab] = useState<'DESCRIPTION' | 'USAGE' | 'REVIEWS' | 'QUESTIONS'>('DESCRIPTION');
  const showUsage = hasUsage(info);
  const [reviews, setReviews] = useState<ProductReview[] | null>(() => reviewCache.get(productId) || null);
  const [questionCount, setQuestionCount] = useState<number | null>(null);

  useEffect(() => {
    setTab('DESCRIPTION');
    setQuestionCount(null);
    const cached = reviewCache.get(productId);
    setReviews(cached || null);
    if (cached) return;
    // No verified reviews yet: nothing to ask the server (saves a database read per product view)
    if (reviewCount !== undefined && Number(reviewCount) <= 0) {
      setReviews([]);
      return;
    }
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
      media: [] as string[],
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
        {showUsage && (
          <button type="button" onClick={() => setTab('USAGE')} className={tabCls(tab === 'USAGE')}>
            How to use &amp; care
          </button>
        )}
        <button type="button" onClick={() => setTab('REVIEWS')} className={tabCls(tab === 'REVIEWS')}>
          Reviews{reviews !== null ? ` (${all.length})` : ''}
        </button>
        <button type="button" onClick={() => setTab('QUESTIONS')} className={tabCls(tab === 'QUESTIONS')}>
          Questions{questionCount ? ` (${questionCount})` : ''}
        </button>
      </div>

      {tab === 'QUESTIONS' ? (
        <ProductQuestions productId={productId} onCount={setQuestionCount} />
      ) : tab === 'USAGE' && info ? (
        <UsageAndCare info={info} productName={productName} />
      ) : tab === 'DESCRIPTION' ? (
        <div className="space-y-4 text-sm text-[#454441] leading-relaxed">
          {shortDescription && shortDescription !== description && <p className="font-medium text-[#141413]">{shortDescription}</p>}
          <p className="whitespace-pre-line">{description || shortDescription || 'No description yet.'}</p>
          <div>
            <h3 className="text-sm font-semibold text-[#141413] mb-2">Specifications</h3>
            <table className="w-full max-w-2xl text-xs border border-black/[0.08]">
              <tbody>
                {details.map((d, i) => (
                  <tr key={d.label} className={i % 2 ? 'bg-white' : 'bg-[#FBFBF9]'}>
                    <th scope="row" className="w-2/5 px-3 py-2 text-left font-medium text-[#141413] border-b border-black/[0.06]">
                      {d.label}
                    </th>
                    <td className="px-3 py-2 font-mono tabular-nums text-[#454441] border-b border-black/[0.06] break-words">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <ReviewMediaStrip media={r.media} />
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
