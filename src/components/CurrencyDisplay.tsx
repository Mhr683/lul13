import React from 'react';
import { DISPLAY_CURRENCIES, useCurrency } from '../services/currency';

// Shopper's currency: a small selector for the header and the approximate local price under PKR
// prices. Payment is always in PKR (shown in the selector's note).

export const CurrencySelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { currency, setCurrency, rates } = useCurrency();
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`} title="Show prices in your currency (payment is in PKR)">
      <span className="sr-only">Currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="px-2 py-1.5 border border-black/15 bg-white text-xs font-semibold cursor-pointer"
        aria-label="Show prices in"
      >
        {DISPLAY_CURRENCIES.filter((c) => c === 'PKR' || !rates || rates.rates[c]).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
};

/**
 * Under a price shown in the shopper's currency: the PKR amount actually charged ("PKR 2,430").
 * Nothing when the shopper already sees PKR.
 */
export const LocalPrice: React.FC<{ pkr: number; className?: string }> = ({ pkr, className = '' }) => {
  const { currency, rates } = useCurrency();
  if (currency === 'PKR' || !rates?.rates?.[currency]) return null;
  return (
    <span className={`block text-[11px] font-medium text-[#575653] ${className}`} title="Prices are converted for you; orders are charged in PKR.">
      PKR {Math.round(Number(pkr) || 0).toLocaleString('en-US')}
    </span>
  );
};

/** Note shown once on the cart / checkout when another currency is selected */
export const CurrencyNote: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { currency, rates } = useCurrency();
  if (currency === 'PKR') return null;
  const day = rates?.updated_at ? new Date(rates.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return (
    <p className={`text-[10px] text-[#787774] ${className}`}>
      Prices in {currency} are approximate{day ? ` (rates of ${day})` : ''}. You pay in PKR; your bank or card converts it.{' '}
      <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">
        Rates By Exchange Rate API
      </a>
    </p>
  );
};
