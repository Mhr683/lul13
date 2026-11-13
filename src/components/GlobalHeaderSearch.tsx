import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Search, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { Product } from '../types/store';
import { ProductImage } from './ProductImage';
import { formatMoney } from '../services/currency';

// Store search box (header). Laptop: a results panel under the box that always stays inside the
// screen. Phone: a full-screen search page with a Back button. Esc, Back, a tap outside or picking a
// result closes it.

interface GlobalHeaderSearchProps {
  products: Product[];
  categories: { id: string; name: string }[];
  onSelectProduct: (product: Product) => void;
  onViewAllResults: (query: string, category?: string) => void;
  /** Phone search row: the box takes the full width and opens a full-screen search page */
  fullWidth?: boolean;
}

const SHOW = 8;
const PANEL_W = 520;
const GAP = 12;

/** Does the product match the words typed (with a few everyday synonyms)? */
function matches(p: Product, q: string, tokens: string[]) {
  const cat = p.category.toLowerCase();
  const sub = (p.subcategory || '').toLowerCase();
  if ((q.includes('kid') || q.includes('child') || q.includes('bach')) && (cat === 'children' || /kid|boy|girl|baby/.test(sub))) return true;
  if ((q.includes('perfume') || q.includes('fragrance') || q.includes('scent') || q.includes('attar')) && cat === 'fragrance') return true;
  if ((q.includes('watch') || q.includes('ghari')) && (cat === 'watches' || cat === 'horology')) return true;
  const text = `${p.name} ${p.category} ${p.subcategory || ''} ${p.brand} ${p.sku} ${p.shortDescription || ''} ${p.description || ''} ${p.seoKeywords || ''}`.toLowerCase();
  return tokens.every((t) => text.includes(t));
}

export const GlobalHeaderSearch: React.FC<GlobalHeaderSearchProps> = ({ products, categories, onSelectProduct, onViewAllResults, fullWidth = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [active, setActive] = useState(-1);
  const [panelPos, setPanelPos] = useState<{ left: number; width: number }>({ left: 0, width: PANEL_W });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const sheet = fullWidth; // phone: full-screen page

  // Phone search page has its own history step (so the phone's Back closes it). Closing it goes
  // back one step first, then does what was asked (open the product, show all results).
  const afterClose = useRef<(() => void) | null>(null);
  const close = (after?: () => void) => {
    setActive(-1);
    inputRef.current?.blur();
    sheetInputRef.current?.blur();
    if (sheet && history.state?.anokhaSearch) {
      afterClose.current = after || null;
      history.back();
      return;
    }
    setIsOpen(false);
    after?.();
  };

  // Close on a tap outside (laptop panel), Esc; "/" or Ctrl+K opens
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!sheet && containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
      if (!sheet && !typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && isOpen) close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sheet]);

  // Laptop: keep the panel inside the window, under the box
  useLayoutEffect(() => {
    if (!isOpen || sheet) return;
    const place = () => {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = document.documentElement.clientWidth;
      const width = Math.min(Math.max(PANEL_W, r.width), vw - GAP * 2);
      let left = 0;
      if (r.left + width > vw - GAP) left = vw - GAP - width - r.left;
      if (r.left + left < GAP) left = GAP - r.left;
      setPanelPos({ left, width });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen, sheet]);

  // Phone: the page behind does not scroll; Back button of the phone closes the search page
  useEffect(() => {
    if (!isOpen || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => sheetInputRef.current?.focus(), 30);
    // The page remembers where it was scrolled (StorefrontView scrolls back there on "back"), and the
    // search step counts as a page of the site (inSite) so the "leave the store?" guard leaves it alone
    history.replaceState({ ...(history.state || {}), y: window.scrollY }, '');
    const { exitMarker, ...here } = history.state || {};
    history.pushState({ ...here, inSite: true, anokhaSearch: true }, '');
    const onPop = () => {
      setIsOpen(false);
      const next = afterClose.current;
      afterClose.current = null;
      next?.();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('popstate', onPop);
    };
  }, [isOpen, sheet]);

  const q = query.trim().toLowerCase();
  const { results, total } = useMemo(() => {
    const live = products.filter((p) => p.status === 'ACTIVE' && (category === 'ALL' || p.category.toLowerCase() === category.toLowerCase()));
    if (!q) {
      const top = [...live].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
      return { results: top.slice(0, SHOW), total: 0 };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const found = live.filter((p) => matches(p, q, tokens));
    return { results: found.slice(0, SHOW), total: found.length };
  }, [products, q, category]);

  useEffect(() => setActive(-1), [q, category]);

  const pick = (p: Product) => close(() => onSelectProduct(p));
  const seeAll = () => {
    const text = query.trim();
    close(() => onViewAllResults(text, category === 'ALL' ? undefined : category));
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && results[active]) return pick(results[active]);
    if (query.trim()) seeAll();
  };
  const onArrows = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    }
  };

  const field = (ref: React.RefObject<HTMLInputElement | null>, big: boolean) => (
    <form onSubmit={onSubmit} className="relative flex items-center w-full" role="search">
      <Search className="w-4 h-4 text-[#787774] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={onArrows}
        placeholder="Search products..."
        aria-label="Search products"
        className={`w-full pl-9 pr-9 ${big ? 'py-2.5 text-[15px]' : 'py-2 text-[13px]'} rounded-full text-[#141413] bg-[#F3F2EE] border border-black/10 placeholder:text-[#8C8A85] focus:outline-none focus:bg-white focus:border-[#141413] focus:ring-2 focus:ring-black/5 transition-colors [&::-webkit-search-cancel-button]:hidden`}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            ref.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#787774] hover:text-[#141413] hover:bg-black/5 cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );

  const body = (
    <>
      {/* Category chips */}
      <div className="flex items-center border-b border-black/[0.06]">
      <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ id: 'ALL', name: 'All' }, ...categories].map((c) => {
          const on = (c.id === 'ALL' ? 'ALL' : c.name).toLowerCase() === category.toLowerCase();
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id === 'ALL' ? 'ALL' : c.name)}
              className={`px-3 py-1 rounded-full text-[12px] whitespace-nowrap cursor-pointer transition-colors ${
                on ? 'bg-[#141413] text-white' : 'bg-[#F3F2EE] text-[#3A3936] hover:bg-[#E9E7E1]'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
        {!sheet && (
          <button
            type="button"
            onClick={() => close()}
            className="mr-2 p-1.5 rounded-full text-[#787774] hover:text-[#141413] hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Close search"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8C8A85]">
        {q ? (total ? `${total} product${total === 1 ? '' : 's'} found` : 'No results') : 'Popular products'}
      </div>

      <div className={`overflow-y-auto overscroll-contain ${sheet ? 'flex-1' : 'max-h-[min(400px,calc(100vh-220px))]'}`}>
        {results.length > 0 ? (
          <ul role="listbox" aria-label="Search results">
            {results.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer ${i === active ? 'bg-[#F5F4F0]' : 'hover:bg-[#F5F4F0]'}`}
                >
                  <span className="w-12 h-12 rounded-lg bg-[#F3F2EE] shrink-0 overflow-hidden border border-black/[0.06]">
                    <ProductImage src={p.primaryImage} alt="" category={p.category} className="w-full h-full object-cover" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-[#141413] leading-snug line-clamp-2">{p.name}</span>
                    <span className="block text-[11px] text-[#8C8A85] truncate mt-0.5">{p.category}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-bold text-[#141413]">{formatMoney(p.price)}</span>
                    {p.stock > 0 && p.stock <= 5 && <span className="block text-[10px] text-[#B42318] font-medium">Only {p.stock} left</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-10 text-center">
            <Search className="w-7 h-7 mx-auto text-[#C9C6BE]" />
            <p className="mt-2 text-[13px] font-semibold text-[#141413]">Nothing found for &ldquo;{query.trim()}&rdquo;</p>
            <p className="mt-1 text-[12px] text-[#8C8A85]">Check the spelling, try a shorter word, or choose "All".</p>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-black/[0.06]">
        <button
          type="button"
          onClick={seeAll}
          className="w-full py-2.5 rounded-full bg-[#141413] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#2A2A28] cursor-pointer"
        >
          {q ? (total ? `See all ${total} results` : 'Browse all products') : category === 'ALL' ? 'Browse all products' : `See all in ${category}`}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {field(inputRef, false)}

      {isOpen && !sheet && (
        <div
          style={{ left: panelPos.left, width: panelPos.width }}
          className="absolute top-full mt-2 bg-white rounded-2xl border border-black/10 shadow-2xl z-50 overflow-hidden flex flex-col"
        >
          {body}
        </div>
      )}

      {isOpen && sheet && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col" role="dialog" aria-label="Search">
          <div className="flex items-center gap-2 px-2 py-2 border-b border-black/[0.08]">
            <button type="button" onClick={() => close()} className="p-2 rounded-full text-[#141413] hover:bg-black/5 cursor-pointer shrink-0" aria-label="Close search">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {field(sheetInputRef, true)}
          </div>
          {body}
        </div>
      )}
    </div>
  );
};
