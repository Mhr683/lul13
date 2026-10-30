import React from 'react';
import type { Product } from '../types/store';
import { ALL_WORLD_COUNTRIES } from '../services/addressAndPaymentVerification';
import { useVisitorCountry } from '../services/currency';
import { originOf, routingScore, sellerFeeFor } from '../services/productShipping';
import { formatPKR } from '../services/abstractions';
import { formatMoney } from '../services/currency';

const countryOf = (iso: string) => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === iso);
// Country name only: flag emoji show as two letters on Windows
const label = (iso: string) => countryOf(iso)?.name || iso;

/**
 * Where the product ships from, seen from the shopper's country: "Ships from United States ·
 * local delivery", "Ships to United Kingdom from Pakistan", or "Does not ship to ...".
 * Pakistani shoppers buying Pakistani stock see nothing (that is the normal case).
 */
export const ShipsBadge: React.FC<{ product: Pick<Product, 'shipsFromCountry' | 'shipping'>; detailed?: boolean; className?: string }> = ({
  product,
  detailed = false,
  className = '',
}) => {
  const visitor = useVisitorCountry();
  const origin = originOf(product);
  const score = routingScore(product, visitor);
  const fee = visitor ? sellerFeeFor(product, visitor) : undefined;
  const days = product.shipping?.handlingDays;
  const extra = detailed
    ? [fee !== undefined ? (fee === 0 ? 'free shipping' : `shipping ${formatMoney(fee)}`) : '', days ? `dispatched in ${days} day${days === 1 ? '' : 's'}` : '']
        .filter(Boolean)
        .join(' · ')
    : '';
  if (visitor && score === 0) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-[10px] font-bold text-stone-600 ${className}`}>
        Does not ship to {label(visitor)}
      </span>
    );
  }
  if (visitor && score === 2) {
    if (visitor === 'PK' && origin === 'PK' && !extra) return null;
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800 ${className}`}>
        Ships from {label(origin)} · local delivery{extra ? ` · ${extra}` : ''}
      </span>
    );
  }
  if (!visitor && origin === 'PK' && !extra) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-bold text-sky-800 ${className}`}>
      {visitor ? `✈ Ships to ${label(visitor)} from ${label(origin)}` : `Ships from ${label(origin)}`}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
};
