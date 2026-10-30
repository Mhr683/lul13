import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, History, MessageCircleQuestion, ShoppingBag } from 'lucide-react';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import { ProductImage } from './ProductImage';
import { ProductRatingBadge } from './SellerRating';
import type { Product } from '../types/store';
import { formatMoney } from '../services/currency';

// Product page extras (server side: server/productExtras.ts):
//   - "Tell me when it's back" for out-of-stock products
//   - Customer questions & answers (a tab on the product page)
//   - "Frequently bought together" from real checkouts (same-category fallback)
//   - "Recently viewed", kept only in this browser (no server, no database reads)

const canBuy = (p: Product) =>
  p.status === 'ACTIVE' && Number(p.stock) > 0 && !(p as any).adminHidden && !(p as any).suspendedHidden && !(p as any).delisted;

// ---------------------------------------------------------------- recently viewed

const RECENT_KEY = 'store_recently_viewed_v1';
const RECENT_MAX = 12;

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
};

/** The products this browser opened most recently (newest first) */
export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>(readRecent);
  const remember = (id: string) =>
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const clear = () => {
    setIds([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
  };
  return { ids, remember, clear };
}

const MiniCard: React.FC<{ p: Product; onSelect: (p: Product) => void; extra?: React.ReactNode }> = ({ p, onSelect, extra }) => (
  <div className="bg-white border border-black/[0.08] hover:border-[#141413] transition-colors flex flex-col">
    <button type="button" onClick={() => onSelect(p)} className="text-left cursor-pointer">
      <div className="aspect-square bg-[#F7F6F2] overflow-hidden">
        <ProductImage src={p.primaryImage} alt={p.name} category={p.category} className="w-full h-full object-cover" />
      </div>
      <div className="p-2.5 space-y-1">
        <div className="text-xs font-semibold text-[#141413] line-clamp-2 min-h-[2.5em]">{p.name}</div>
        <ProductRatingBadge rating={p.rating} reviewCount={p.reviewCount} size={10} />
        <div className="text-sm font-mono tabular-nums font-bold text-[#141413]">{formatMoney(p.price)}</div>
      </div>
    </button>
    {extra}
  </div>
);

export const RecentlyViewedStrip: React.FC<{
  ids: string[];
  products: Product[];
  onSelect: (p: Product) => void;
  excludeId?: string;
  onClear?: () => void;
}> = ({ ids, products, onSelect, excludeId, onClear }) => {
  const list = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids
      .filter((id) => id !== excludeId)
      .map((id) => byId.get(id))
      .filter((p): p is Product => Boolean(p && p.status === 'ACTIVE'))
      .slice(0, 6);
  }, [ids, products, excludeId]);
  if (!list.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-display font-medium text-[#141413] flex items-center gap-2">
          <History className="w-5 h-5 text-[#8C6D46]" /> Recently viewed
        </h2>
        {onClear && (
          <button type="button" onClick={onClear} className="text-xs text-[#575653] underline hover:text-[#141413] cursor-pointer">
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {list.map((p) => (
          <MiniCard key={p.id} p={p} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- back in stock

const ALERT_KEY = 'store_stock_alerts_v1';
const alertedIds = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(ALERT_KEY) || '[]');
  } catch {
    return [];
  }
};

export const BackInStockForm: React.FC<{ productId: string; defaultEmail?: string }> = ({ productId, defaultEmail = '' }) => {
  const [email, setEmail] = useState(defaultEmail);
  const [done, setDone] = useState(() => alertedIds().includes(productId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDone(alertedIds().includes(productId));
    setError('');
  }, [productId]);
  useEffect(() => {
    if (defaultEmail && !email) setEmail(defaultEmail);
  }, [defaultEmail]);

  if (done) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2">
        <Check className="w-4 h-4 shrink-0" /> We will email you as soon as this product is back in stock.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/stock-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save. Please try again.');
      try {
        localStorage.setItem(ALERT_KEY, JSON.stringify([productId, ...alertedIds().filter((x) => x !== productId)].slice(0, 100)));
      } catch {}
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-3 bg-amber-50 border border-amber-300 space-y-2">
      <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
        <Bell className="w-4 h-4" /> Out of stock: get an email when it is back
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className="flex-1 min-w-0 px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 bg-[#141413] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
        >
          {sending ? '...' : 'Notify me'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
      <p className="text-[11px] text-amber-900">One email only, when stock arrives. We do not share your email.</p>
    </form>
  );
};

// ---------------------------------------------------------------- bought together

const pairsCache = new Map<string, { id: string; count: number }[]>();

export const BoughtTogether: React.FC<{
  product: Product;
  products: Product[];
  onSelect: (p: Product) => void;
  onAdd: (p: Product) => void;
}> = ({ product, products, onSelect, onAdd }) => {
  const [pairs, setPairs] = useState<{ id: string; count: number }[] | null>(() => pairsCache.get(product.id) || null);

  useEffect(() => {
    const cached = pairsCache.get(product.id);
    setPairs(cached || null);
    if (cached) return;
    let live = true;
    fetch(`/api/products/${encodeURIComponent(product.id)}/bought-together`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.products) ? d.products : [];
        pairsCache.set(product.id, list);
        if (live) setPairs(list);
      })
      .catch(() => live && setPairs([]));
    return () => {
      live = false;
    };
  }, [product.id]);

  const { list, fromOrders } = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const bought = (pairs || [])
      .map((x) => byId.get(x.id))
      .filter((p): p is Product => Boolean(p && canBuy(p)));
    if (bought.length >= 2) return { list: bought.slice(0, 4), fromOrders: true };
    // Not enough real orders yet: popular products from the same category
    const seen = new Set([product.id, ...bought.map((p) => p.id)]);
    const similar = products
      .filter((p) => !seen.has(p.id) && canBuy(p) && p.category === product.category)
      .sort(
        (a, b) =>
          Number(Boolean(b.bestSeller)) - Number(Boolean(a.bestSeller)) ||
          (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0) ||
          (Number(b.likes) || 0) - (Number(a.likes) || 0)
      );
    return { list: [...bought, ...similar].slice(0, 4), fromOrders: bought.length > 0 };
  }, [pairs, products, product.id, product.category]);

  if (pairs === null || !list.length) return null;
  const total = list.reduce((s, p) => s + Number(p.price || 0), 0);

  return (
    <section className="pt-10 border-t border-black/[0.07] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-medium text-[#141413]">
            {fromOrders ? 'Frequently bought together' : 'You may also like'}
          </h2>
          <p className="text-xs text-[#575653]">
            {fromOrders ? 'Customers who bought this also bought these.' : `More from ${product.category}.`}
          </p>
        </div>
        {list.length > 1 && (
          <button
            type="button"
            onClick={() => list.forEach((p) => onAdd(p))}
            className="px-4 py-2.5 bg-[#141413] text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:bg-[#2A2A28]"
          >
            <ShoppingBag className="w-4 h-4" /> Add all {list.length} · {formatMoney(total)}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {list.map((p) => (
          <MiniCard
            key={p.id}
            p={p}
            onSelect={onSelect}
            extra={
              <button
                type="button"
                onClick={() => onAdd(p)}
                className="m-2.5 mt-0 py-1.5 border border-[#141413] text-[11px] font-bold uppercase tracking-wider hover:bg-[#141413] hover:text-white cursor-pointer"
              >
                Add to bag
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- questions & answers

type PublicQuestion = { id: string; question: string; customerName: string; answer: string; answeredBy: string; createdAt: string; answeredAt?: string };
const questionsCache = new Map<string, PublicQuestion[]>();

export const ProductQuestions: React.FC<{ productId: string; onCount?: (n: number) => void }> = ({ productId, onCount }) => {
  const [list, setList] = useState<PublicQuestion[] | null>(() => questionsCache.get(productId) || null);
  const [question, setQuestion] = useState('');
  const [name, setName] = useState(() => auth.currentUser?.displayName || '');
  const [email, setEmail] = useState(() => auth.currentUser?.email || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSent(false);
    setError('');
    const cached = questionsCache.get(productId);
    setList(cached || null);
    if (cached) {
      onCount?.(cached.length);
      return;
    }
    let live = true;
    fetch(`/api/products/${encodeURIComponent(productId)}/questions`)
      .then((r) => r.json())
      .then((d) => {
        const qs: PublicQuestion[] = Array.isArray(d?.questions) ? d.questions : [];
        questionsCache.set(productId, qs);
        if (live) {
          setList(qs);
          onCount?.(qs.length);
        }
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [productId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: question.trim(), name: name.trim(), email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not send. Please try again.');
      setQuestion('');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {list === null ? (
        <p className="text-xs text-[#575653]">Loading questions...</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[#575653]">No questions yet. Ask the first one below.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {list.map((q) => (
            <li key={q.id} className="py-3 space-y-1.5 text-sm">
              <p className="text-[#141413]">
                <strong className="text-[#E8590C]">Q:</strong> {q.question}
              </p>
              <p className="text-[11px] text-[#787774]">
                {q.customerName} · {new Date(q.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <p className="pl-3 border-l-2 border-[#0E7A43] text-[#454441] whitespace-pre-line">
                <strong className="text-[#0E7A43]">A ({q.answeredBy === 'SELLER' ? 'Seller' : 'Store'}):</strong> {q.answer}
              </p>
            </li>
          ))}
        </ul>
      )}

      {sent ? (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> Thank you! Your question was sent. The answer will appear here
          {email ? ' and we will email it to you' : ''}.
        </div>
      ) : (
        <form onSubmit={submit} className="p-4 bg-[#FBFBF9] border border-black/[0.08] space-y-2.5">
          <div className="text-sm font-semibold text-[#141413] flex items-center gap-1.5">
            <MessageCircleQuestion className="w-4 h-4 text-[#E8590C]" /> Ask a question about this product
          </div>
          <textarea
            required
            minLength={5}
            maxLength={600}
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Is the size true to fit? Does it come with a warranty?"
            className="w-full px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none"
          />
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none"
            />
            <input
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email for the answer (optional)"
              className="px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[#787774]">Only your first name is shown. Your email stays private.</p>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 bg-[#141413] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              {sending ? 'Sending...' : 'Send question'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
