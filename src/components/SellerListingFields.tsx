import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { PRODUCT_CATEGORY_GROUPS } from '../data/productCategories';
import { MAX_VARIANTS } from '../services/productVariants';

// Seller Center product form: the category chooser (ready-made list, grouped and searchable, plus
// the store's own categories) and the variants editor (colour / size with their own price and stock).

const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';
const inputCls = 'w-full px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none';

export const CategoryPicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  /** The store's own categories (shown first) */
  storeCategories: string[];
  /** Suggested from the product name */
  suggestions: string[];
}> = ({ value, onChange, storeCategories, suggestions }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const ready = new Set(PRODUCT_CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => c.name.toLowerCase())));
    const own = Array.from(new Set(storeCategories.filter((c) => c && !ready.has(c.toLowerCase()))));
    const all = [
      ...(own.length ? [{ group: 'This store', names: own }] : []),
      ...PRODUCT_CATEGORY_GROUPS.map((g) => ({ group: g.group, names: g.categories.map((c) => c.name) })),
    ];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all
      .map((g) => ({
        group: g.group,
        names: g.group.toLowerCase().includes(term) ? g.names : g.names.filter((n) => n.toLowerCase().includes(term)),
      }))
      .filter((g) => g.names.length);
  }, [storeCategories, q]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setQ('');
  };

  return (
    <div>
      <label className={labelCls}>Category *</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} text-left cursor-pointer ${value ? 'text-[#141413]' : 'text-[#787774]'}`}
      >
        {value || 'Choose a category'}
      </button>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[11px] text-[#575653]">Suggested:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className={`px-2 py-0.5 border text-[11px] font-semibold cursor-pointer ${
                s === value ? 'border-[#0E7A43] bg-[#0E7A43] text-white' : 'border-[#0E7A43]/50 text-[#0E7A43] bg-white hover:bg-[#0E7A43]/[0.06]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-1 border border-black/20 bg-white shadow-lg">
          <div className="flex items-center gap-1 p-2 border-b border-black/10">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search, e.g. shoes, perfume, charger"
              className="flex-1 min-w-0 px-2 py-1.5 border border-black/20 text-sm focus:border-black focus:outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2 space-y-3">
            {groups.map((g) => (
              <div key={g.group}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#8C6D46] mb-1">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.names.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pick(n)}
                      className={`px-2 py-1 border text-xs cursor-pointer ${
                        n === value ? 'border-[#141413] bg-[#141413] text-white' : 'border-black/15 hover:border-black'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {q.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => pick(q.trim().slice(0, 75))}
                className="w-full px-2 py-2 border border-dashed border-black/30 text-xs text-left cursor-pointer hover:border-black"
              >
                Not in the list? Use “<strong>{q.trim()}</strong>” as the category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export interface VariantRow {
  id: string;
  name: string;
  /** Empty = the product's price */
  price: string;
  stock: string;
  sku: string;
}

const newRow = (name = ''): VariantRow => ({ id: Math.random().toString(36).slice(2, 10), name, price: '', stock: '10', sku: '' });

const TITLE_PRESETS = ['Colour', 'Size', 'Colour / Size', 'Model', 'Storage', 'Pack', 'Weight', 'Flavour', 'Scent'];

export const VariantsEditor: React.FC<{
  title: string;
  rows: VariantRow[];
  basePrice: string;
  onChange: (next: { title: string; rows: VariantRow[] }) => void;
}> = ({ title, rows, basePrice, onChange }) => {
  const [quick, setQuick] = useState('');
  const setRow = (i: number, patch: Partial<VariantRow>) => onChange({ title, rows: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const total = rows.reduce((s, r) => s + (Math.max(0, Math.floor(Number(r.stock) || 0))), 0);

  // "Red, Blue, Green" adds three variants at once
  const addQuick = () => {
    const names = quick
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const have = new Set(rows.map((r) => r.name.trim().toLowerCase()));
    const add = names.filter((n) => !have.has(n.toLowerCase())).map((n) => newRow(n.slice(0, 60)));
    onChange({ title: title || 'Colour', rows: [...rows, ...add].slice(0, MAX_VARIANTS) });
    setQuick('');
  };

  return (
    <div className="sm:col-span-2 p-3 border border-black/10 bg-[#FBFBF9] space-y-3">
      <div>
        <div className="text-xs font-bold text-[#141413]">Variants (optional): colour, size, ...</div>
        <p className="text-[11px] text-[#575653]">
          Add them when the customer must choose one (e.g. Red / Blue, Small / Large). Each one has its own stock, and a different price if you
          want. Leave empty for a single product.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addQuick();
              }
            }}
            placeholder="e.g. Red, Blue, Black   or   S, M, L, XL"
            className={`${inputCls} flex-1 min-w-[200px]`}
          />
          <button
            type="button"
            disabled={!quick.trim()}
            onClick={addQuick}
            className="px-3 py-2 bg-[#141413] text-white text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add variants
          </button>
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>What does the customer choose?</label>
            <div className="flex flex-wrap gap-1.5">
              {TITLE_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ title: t, rows })}
                  className={`px-2 py-1 border text-[11px] cursor-pointer ${title === t ? 'border-[#141413] bg-[#141413] text-white' : 'border-black/15 bg-white hover:border-black'}`}
                >
                  {t}
                </button>
              ))}
              <input
                value={TITLE_PRESETS.includes(title) ? '' : title}
                onChange={(e) => onChange({ title: e.target.value.slice(0, 40), rows })}
                placeholder="other..."
                className="w-28 px-2 py-1 border border-black/15 bg-white text-[11px] focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] gap-2 text-[10px] font-bold text-[#575653]">
              <span>Name *</span>
              <span>Price (empty = {basePrice || 'main price'})</span>
              <span>Stock *</span>
              <span>SKU (optional)</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] gap-2 p-2 sm:p-0 border sm:border-0 border-black/10 bg-white sm:bg-transparent">
                <input className={`${inputCls} col-span-2 sm:col-span-1`} value={r.name} onChange={(e) => setRow(i, { name: e.target.value.slice(0, 60) })} placeholder="e.g. Red / Large" />
                <input className={inputCls} value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} inputMode="decimal" placeholder={`Price (${basePrice || 'main'})`} />
                <input className={inputCls} value={r.stock} onChange={(e) => setRow(i, { stock: e.target.value })} inputMode="numeric" placeholder="Stock" />
                <input className={inputCls} value={r.sku} onChange={(e) => setRow(i, { sku: e.target.value })} placeholder="SKU" />
                <button
                  type="button"
                  onClick={() => onChange({ title, rows: rows.filter((_, k) => k !== i) })}
                  aria-label="Remove variant"
                  className="px-2 border border-black/15 bg-white text-rose-700 cursor-pointer flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={rows.length >= MAX_VARIANTS}
              onClick={() => onChange({ title, rows: [...rows, newRow()] })}
              className="px-3 py-1.5 border border-black/30 bg-white text-xs font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add one more
            </button>
            <span className="text-[11px] text-[#575653]">
              Total stock: <strong className="text-[#141413]">{total}</strong> (the product's stock is the sum of the variants)
            </span>
          </div>
        </>
      )}
    </div>
  );
};
