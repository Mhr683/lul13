import React from 'react';
import { CheckCircle2, Clock, Download, KeyRound, RefreshCcw, ShieldCheck } from 'lucide-react';
import type { Product } from '../types/store';
import { productTypeOf, typeInfo, wholesaleUnitPrice, type LineOptions } from '../services/productTypes';
import { formatMoney } from '../services/currency';
import { ProductTypeIcon } from './ProductTypeIcon';

// Product page: what kind of product this is (src/services/productTypes.ts), what the customer gets,
// and what they must choose or write before buying (rental days, the text to print, the job details).

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

export const ProductTypePanel: React.FC<{
  product: Product;
  /** Price of one piece / one day before the kind's own rules */
  basePrice: number;
  qty: number;
  options: LineOptions;
  onChange: (o: LineOptions) => void;
}> = ({ product, basePrice, qty, options, onChange }) => {
  const type = productTypeOf(product);
  const t = typeInfo(type);
  const d = product.typeDetails || {};
  const includes = (d.includes || '').split('\n').map((s) => s.trim()).filter(Boolean);

  const facts: { icon: React.ReactNode; text: string }[] = [];
  if (type === 'DIGITAL' || type === 'SOFTWARE') {
    facts.push({ icon: <Download className="w-3.5 h-3.5" />, text: 'Download link right after your payment is confirmed (on your order page and by email)' });
    if (d.fileFormat) facts.push({ icon: <CheckCircle2 className="w-3.5 h-3.5" />, text: `Format: ${d.fileFormat}${d.fileSize ? ` · ${d.fileSize}` : ''}${d.pages ? ` · ${d.pages} pages` : ''}` });
  }
  if (type === 'SOFTWARE') {
    if (d.platform) facts.push({ icon: <CheckCircle2 className="w-3.5 h-3.5" />, text: `Works on: ${d.platform}${d.version ? ` · version ${d.version}` : ''}` });
    facts.push({ icon: <KeyRound className="w-3.5 h-3.5" />, text: `Licence: ${d.licenseType === 'YEARLY' ? '1 year' : d.licenseType === 'MONTHLY' ? '1 month' : 'lifetime'}, one key per copy` });
  }
  if (type === 'SERVICE') {
    if (d.deliveryDays) facts.push({ icon: <Clock className="w-3.5 h-3.5" />, text: `Ready in ${d.deliveryDays} day${d.deliveryDays === 1 ? '' : 's'}` });
    if (d.revisions !== undefined) facts.push({ icon: <RefreshCcw className="w-3.5 h-3.5" />, text: `${d.revisions} free change${d.revisions === 1 ? '' : 's'} (revisions)` });
  }
  if (type === 'CUSTOM' && d.deliveryDays) facts.push({ icon: <Clock className="w-3.5 h-3.5" />, text: `Made for you in ${d.deliveryDays} day${d.deliveryDays === 1 ? '' : 's'}, then shipped` });
  if (type === 'SUBSCRIPTION') facts.push({ icon: <RefreshCcw className="w-3.5 h-3.5" />, text: `Price per ${d.billingPeriod === 'YEARLY' ? 'year' : 'month'}; renew when it ends` });
  if (type === 'RENTAL' && d.deposit) facts.push({ icon: <ShieldCheck className="w-3.5 h-3.5" />, text: `Refundable deposit ${formatMoney(d.deposit)} (returned when the item comes back fine)` });
  if (!t.cod) facts.push({ icon: <ShieldCheck className="w-3.5 h-3.5" />, text: 'Paid in advance (bank transfer, NayaPay or card); no Cash on Delivery' });

  if (type === 'PHYSICAL') return null;
  const days = options.days || d.minDays || 1;

  return (
    <div className="rounded-xl border p-3.5 space-y-3" style={{ borderColor: t.bg, backgroundColor: `${t.bg}66` }}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: t.bg, color: t.color }}>
          <ProductTypeIcon type={type} className="w-4.5 h-4.5" />
        </span>
        <div>
          <div className="text-[13px] font-bold" style={{ color: t.color }}>
            {t.label}
          </div>
          <div className="text-[11.5px] text-[#575653]">{t.customerLine}</div>
        </div>
      </div>

      {facts.length > 0 && (
        <ul className="space-y-1.5">
          {facts.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-[#3A3936]">
              <span className="mt-0.5 shrink-0" style={{ color: t.color }}>
                {f.icon}
              </span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {includes.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B6963] mb-1">What you get</div>
          <ul className="space-y-1">
            {includes.slice(0, 12).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[#3A3936]">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#0E7A43]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {type === 'WHOLESALE' && (
        <div className="space-y-1.5">
          <div className="text-[12px] text-[#3A3936]">
            Minimum order: <strong>{d.minOrderQty || 1} pieces</strong>
          </div>
          <table className="w-full text-[12px] bg-white rounded-lg overflow-hidden border border-black/10">
            <thead>
              <tr className="bg-black/[0.03] text-[#6B6963]">
                <th className="text-left font-semibold px-2.5 py-1.5">Quantity</th>
                <th className="text-right font-semibold px-2.5 py-1.5">Price per piece</th>
              </tr>
            </thead>
            <tbody>
              {[{ minQty: d.minOrderQty || 1, price: basePrice }, ...(d.tiers || [])].map((tier, i) => {
                const on = wholesaleUnitPrice(basePrice, qty, d) === tier.price && qty >= tier.minQty;
                return (
                  <tr key={i} className={on ? 'bg-[#E2F5F2] font-bold' : ''}>
                    <td className="px-2.5 py-1.5">{tier.minQty}+ pieces</td>
                    <td className="px-2.5 py-1.5 text-right font-mono">{formatMoney(tier.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[12px] text-[#3A3936]">
            {qty} pieces × {formatMoney(wholesaleUnitPrice(basePrice, qty, d))} ={' '}
            <strong>{formatMoney(wholesaleUnitPrice(basePrice, qty, d) * qty)}</strong>
          </div>
        </div>
      )}

      {type === 'RENTAL' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11.5px] font-semibold text-[#3A3936] space-y-1">
            <span>First day</span>
            <input
              type="date"
              min={today()}
              value={options.startDate || ''}
              onChange={(e) => onChange({ ...options, startDate: e.target.value })}
              className="w-full px-2 py-2 rounded-lg border border-black/15 bg-white text-[13px] font-normal"
            />
          </label>
          <label className="text-[11.5px] font-semibold text-[#3A3936] space-y-1">
            <span>
              Days ({d.minDays || 1}–{d.maxDays || 30})
            </span>
            <input
              type="number"
              min={d.minDays || 1}
              max={d.maxDays || 30}
              value={days}
              onChange={(e) => onChange({ ...options, days: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
              className="w-full px-2 py-2 rounded-lg border border-black/15 bg-white text-[13px] font-normal"
            />
          </label>
          <div className="col-span-2 text-[12px] text-[#3A3936]">
            {formatMoney(basePrice)} × {days} day{days === 1 ? '' : 's'}
            {d.deposit ? ` + deposit ${formatMoney(d.deposit)}` : ''} ={' '}
            <strong>{formatMoney(basePrice * days + (d.deposit || 0))}</strong>
          </div>
        </div>
      )}

      {(type === 'SERVICE' || type === 'CUSTOM') && (
        <label className="block space-y-1">
          <span className="text-[12px] font-bold text-[#3A3936]">
            {d.askNote || (type === 'CUSTOM' ? 'Name / text to print' : 'Tell the seller what you need')} <span className="text-rose-600">*</span>
          </span>
          <textarea
            rows={type === 'SERVICE' ? 3 : 2}
            maxLength={600}
            value={options.note || ''}
            onChange={(e) => onChange({ ...options, note: e.target.value })}
            placeholder={type === 'CUSTOM' ? 'e.g. "Ali & Sara · 14 Feb"' : 'e.g. business name, colours you like, pages you need'}
            className="w-full px-3 py-2 rounded-lg border border-black/15 bg-white text-[13px]"
          />
          <span className="text-[11px] text-[#6B6963]">The seller sees this with your order.</span>
        </label>
      )}
    </div>
  );
};
