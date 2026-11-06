import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

// Small shared pieces for Seller Center pages, so every page looks and behaves the same:
// button styles, pill filters with counts, a "⋯ More" menu, and a status step bar for orders.

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
export const ui = {
  primary: `${base} px-3.5 py-2 bg-[#0E7A43] text-white hover:bg-[#0B6336] shadow-sm`,
  dark: `${base} px-3.5 py-2 bg-[#141413] text-white hover:bg-[#2A2A28] shadow-sm`,
  secondary: `${base} px-3 py-2 bg-white border border-[#DCD9D2] text-[#2A2A28] hover:bg-[#F6F5F1]`,
  whatsapp: `${base} px-3 py-2 bg-[#25D366]/10 border border-[#25D366]/50 text-[#0B6B34] hover:bg-[#25D366]/20`,
  danger: `${base} px-3 py-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50`,
  dangerSolid: `${base} px-3.5 py-2 bg-rose-600 text-white hover:bg-rose-700`,
  field: 'px-3 py-2 rounded-lg border border-[#DCD9D2] bg-white text-[12px] focus:outline-none focus:border-[#0E7A43]',
  card: 'bg-white rounded-2xl border border-[#E7E5DF] shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
  chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border',
  label: 'text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8A8780]',
};

/** Pill filters ("To ship 3 · On the way 5 ...") */
export function SegTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[#EFEDE8]">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
              on ? 'bg-white text-[#141413] shadow-sm' : 'text-[#6B6963] hover:text-[#141413]'
            }`}
          >
            {it.label}
            {typeof it.count === 'number' && (
              <span
                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  on ? 'bg-[#0E7A43] text-white' : 'bg-white/70 text-[#6B6963]'
                }`}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** "⋯ More" menu for the less-used actions of a card */
export const MoreMenu: React.FC<{
  items: Array<{ label: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | false | null | undefined>;
  label?: string;
}> = ({ items, label = 'More' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const list = items.filter(Boolean) as Array<{ label: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }>;
  if (!list.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className={ui.secondary} aria-expanded={open}>
        <MoreHorizontal className="w-4 h-4" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 sm:bottom-auto sm:top-full sm:mt-2 sm:mb-0 min-w-[200px] bg-white rounded-xl border border-[#E7E5DF] shadow-xl p-1.5 z-30">
          {list.map((it, i) => (
            <button
              key={i}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold text-left cursor-pointer disabled:opacity-50 ${
                it.danger ? 'text-rose-700 hover:bg-rose-50' : 'text-[#2A2A28] hover:bg-[#F2F1EC]'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Numbered section heading inside a long form (spans the whole form grid) */
export const FormSection: React.FC<{ n: number; title: string; hint?: string }> = ({ n, title, hint }) => (
  <div className="sm:col-span-2 flex items-start gap-3 pt-3 mt-1 border-t border-[#EFEDE8] first:border-t-0 first:pt-0 first:mt-0">
    <span className="w-7 h-7 rounded-full bg-[#E8F3EC] text-[#0B5E34] text-[12px] font-bold flex items-center justify-center shrink-0">{n}</span>
    <div>
      <div className="text-[14px] font-bold text-[#141413]">{title}</div>
      {hint && <div className="text-[11.5px] text-[#8A8780]">{hint}</div>}
    </div>
  </div>
);

/** Order progress: Confirmed → Packed → Shipped → Delivered */
export const OrderSteps: React.FC<{ status: string }> = ({ status }) => {
  const steps = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];
  const at =
    status === 'DELIVERED'
      ? 4
      : ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(status)
        ? 3
        : status === 'PACKED'
          ? 2
          : ['CONFIRMED', 'PROCESSING'].includes(status)
            ? 1
            : 0;
  if (['CANCELLED', 'RETURNED', 'REFUNDED'].includes(status)) return null;
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < at;
        return (
          <React.Fragment key={s}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  done ? 'bg-[#0E7A43] text-white' : i === at ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300' : 'bg-[#EFEDE8] text-[#8A8780]'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`hidden sm:inline text-[11px] font-semibold ${done ? 'text-[#0B5E34]' : i === at ? 'text-amber-800' : 'text-[#8A8780]'}`}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && <span className={`flex-1 h-0.5 rounded min-w-[12px] ${i < at - 1 ? 'bg-[#0E7A43]' : 'bg-[#E7E5DF]'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};
