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
  /** Text-only button ("Reply", "Edit") */
  link: 'inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E7A43] hover:text-[#0B5E34] hover:underline cursor-pointer disabled:opacity-50',
  input:
    'w-full px-3 py-2 rounded-lg bg-white border border-[#DCD9D2] text-[13px] text-[#141413] placeholder:text-[#A8A59D] focus:outline-none focus:border-[#0E7A43] focus:ring-2 focus:ring-[#0E7A43]/15 disabled:bg-[#F6F5F1] disabled:text-[#8A8780]',
  fieldLabel: 'block text-[12px] font-semibold text-[#3A3936] mb-1.5',
  muted: 'text-[#6B6963]',
};

/** Colours for small status chips (use with ui.chip) */
export const chipTone = {
  green: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  amber: 'bg-amber-50 border-amber-300 text-amber-900',
  red: 'bg-rose-50 border-rose-300 text-rose-800',
  blue: 'bg-sky-50 border-sky-300 text-sky-900',
  violet: 'bg-violet-50 border-violet-300 text-violet-900',
  grey: 'bg-[#F2F1EC] border-[#DCD9D2] text-[#55534E]',
};

/** A white card with a header (title, short line, "?" guide, buttons on the right) and a body */
export const Panel: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  help?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** No padding around the body (lists that draw their own rows) */
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ title, subtitle, help, icon, actions, flush, className = '', children }) => (
  <section className={`${ui.card} ${className}`}>
    {(title || actions) && (
      <header className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEDE8]">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="w-8 h-8 rounded-lg bg-[#E8F3EC] text-[#0B5E34] flex items-center justify-center shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-[#141413] flex items-center gap-1.5">
              {title} {help}
            </h2>
            {subtitle && <p className="text-[12px] text-[#6B6963] leading-snug">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    {children !== undefined && children !== null && children !== false && (
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    )}
  </section>
);

/** One number on a page ("Ready for payout PKR 4,500") */
export const Stat: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** icon colours, e.g. "bg-amber-100 text-amber-800" */
  tone?: string;
  valueClass?: string;
  highlight?: boolean;
  onClick?: () => void;
}> = ({ label, value, hint, icon: Icon, tone = 'bg-[#F2F1EC] text-[#55534E]', valueClass = '', highlight, onClick }) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] font-semibold text-[#6B6963] leading-snug">{label}</div>
        {Icon && (
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
      </div>
      <div className={`text-[22px] font-bold tracking-tight mt-1 tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-[#8A8780] mt-0.5 leading-snug">{hint}</div>}
    </>
  );
  const cls = `p-4 text-left rounded-2xl border ${highlight ? 'bg-amber-50 border-amber-300' : 'bg-white border-[#E7E5DF]'}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer transition-shadow hover:shadow-md`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** Nothing to show yet: an icon, one line and (optionally) the next step */
export const Empty: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  text,
  action,
}) => (
  <div className="py-8 px-4 text-center">
    {icon && <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F2F1EC] text-[#8A8780] flex items-center justify-center text-xl">{icon}</div>}
    <p className="mt-2.5 text-[13px] font-semibold text-[#2A2A28]">{title}</p>
    {text && <p className="mt-0.5 text-[12px] text-[#8A8780] max-w-sm mx-auto">{text}</p>}
    {action && <div className="mt-3 flex justify-center">{action}</div>}
  </div>
);

const calloutTone = {
  info: 'bg-sky-50 border-sky-200 text-sky-950',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-950',
  warning: 'bg-amber-50 border-amber-300 text-amber-950',
  danger: 'bg-rose-50 border-rose-300 text-rose-950',
  neutral: 'bg-[#F7F6F2] border-[#E7E5DF] text-[#3A3936]',
};
/** A short coloured note with an optional button on the right */
export const Callout: React.FC<{
  tone?: keyof typeof calloutTone;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = 'info', icon, action, className = '', children }) => (
  <div className={`px-3.5 py-3 rounded-xl border text-[12.5px] leading-relaxed flex flex-wrap items-center gap-x-3 gap-y-2 ${calloutTone[tone]} ${className}`}>
    {icon && <span className="text-base leading-none shrink-0">{icon}</span>}
    <div className="flex-1 min-w-[200px]">{children}</div>
    {action && <div className="flex flex-wrap gap-2">{action}</div>}
  </div>
);

/** "How it works" text that stays folded until the seller wants it */
export const HowItWorks: React.FC<{ title?: string; children: React.ReactNode }> = ({ title = 'How it works', children }) => (
  <details className="group rounded-xl border border-[#E7E5DF] bg-[#FBFBF9] text-[12.5px] text-[#3A3936]">
    <summary className="px-3.5 py-2.5 cursor-pointer select-none font-semibold flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
      <span className="w-5 h-5 rounded-full bg-[#E8F3EC] text-[#0B5E34] text-[11px] font-bold flex items-center justify-center">i</span>
      {title}
      <span className="ml-auto text-[#8A8780] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="px-3.5 pb-3 pt-0.5 space-y-1.5 leading-relaxed">{children}</div>
  </details>
);

/** Grey placeholder while a page loads */
export const Loading: React.FC<{ text?: string; rows?: number }> = ({ text = 'Loading...', rows = 3 }) => (
  <div className="space-y-3" aria-busy="true">
    <span className="sr-only">{text}</span>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-20 rounded-2xl bg-white border border-[#E7E5DF] animate-pulse" />
    ))}
  </div>
);

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
