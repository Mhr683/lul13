import { useEffect, useState } from 'react';
import { ALL_WORLD_COUNTRIES } from './addressAndPaymentVerification';

// The shopper's display currency. Prices are stored and charged in PKR; other currencies are an
// approximate display only ("≈ AED 32").
//   - Rates come once from /api/exchange-rates (server keeps them, refreshed daily) and are kept in
//     the browser for 6 hours: converting a price needs no call.
//   - The currency: the shopper's own choice (kept on the device), else guessed once from their
//     country (IP lookup), else PKR.

const RATES_KEY = 'store_fx_rates_v1';
const CURRENCY_KEY = 'store_currency_v1';
const GUESS_KEY = 'store_currency_guess_v1';
const COUNTRY_KEY = 'store_country_v1';
const RATES_TTL = 6 * 60 * 60 * 1000;

type Rates = { rates: Record<string, number>; updated_at: string; source: string; at: number };

let rates: Rates | null = null;
let currency = 'PKR';
/** Shopper's country (ISO code), '' until known; the storefront shows what ships there first */
let country = '';
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const read = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/** Currencies shoppers can choose: PKR and the currencies of the world's countries */
export const DISPLAY_CURRENCIES: string[] = Array.from(
  new Set(['PKR', 'USD', 'AED', 'SAR', 'GBP', 'EUR', 'CAD', 'AUD', 'QAR', 'KWD', 'OMR', 'BHD', ...ALL_WORLD_COUNTRIES.map((c) => c.currency)])
).filter((c) => /^[A-Z]{3}$/.test(c));

export const currencyOfCountry = (iso: string) => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === String(iso || '').toUpperCase())?.currency || 'PKR';

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // A link can set it, e.g. an ad for the UAE: https://store/?currency=AED
  const fromLink = new URLSearchParams(window.location.search).get('currency');
  if (fromLink && /^[A-Za-z]{3}$/.test(fromLink)) write(CURRENCY_KEY, fromLink.toUpperCase());
  const chosen = read<string>(CURRENCY_KEY) || read<string>(GUESS_KEY);
  if (chosen) currency = chosen;
  const cached = read<Rates>(RATES_KEY);
  if (cached?.rates && Date.now() - cached.at < RATES_TTL) rates = cached;
  else {
    fetch('/api/exchange-rates')
      .then((r) => r.json())
      .then((d) => {
        if (d?.rates?.PKR) {
          rates = { rates: d.rates, updated_at: d.updated_at, source: d.source, at: Date.now() };
          write(RATES_KEY, rates);
          emit();
        }
      })
      .catch(() => {});
  }
  // The shopper's country: a link (?country=AE), their delivery country at checkout, or the IP guess
  const countryFromLink = new URLSearchParams(window.location.search).get('country');
  if (countryFromLink && /^[A-Za-z]{2}$/.test(countryFromLink)) write(COUNTRY_KEY, countryFromLink.toUpperCase());
  country = read<string>(COUNTRY_KEY) || '';
  // First visit: guess the currency and the country from the network (one lookup per browser)
  if (!chosen || !country) {
    fetch('/api/maps/ip-location')
      .then((r) => r.json())
      .then((d) => {
        if (d?.source !== 'NETWORK_IP' || !/^[A-Z]{2}$/i.test(d?.countryIso || '')) return;
        if (!read<string>(COUNTRY_KEY)) {
          country = String(d.countryIso).toUpperCase();
          write(COUNTRY_KEY, country);
        }
        if (!read<string>(CURRENCY_KEY) && !read<string>(GUESS_KEY)) {
          const guess = currencyOfCountry(d.countryIso);
          write(GUESS_KEY, guess);
          currency = guess;
        }
        emit();
      })
      .catch(() => {});
  }
  if (cached && !rates) rates = cached; // stale copy is better than nothing while refreshing
  emit();
}

/** The shopper chose a currency (kept on this device) */
export function setDisplayCurrency(code: string) {
  currency = String(code || 'PKR').toUpperCase();
  write(CURRENCY_KEY, currency);
  emit();
}

/** The shopper picked a delivery country (kept on this device); unless they chose a currency
 * themselves, prices switch to that country's currency too */
export function setVisitorCountry(iso: string) {
  const next = String(iso || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(next) || next === country) return;
  country = next;
  write(COUNTRY_KEY, country);
  if (!read<string>(CURRENCY_KEY)) {
    currency = currencyOfCountry(next);
    write(GUESS_KEY, currency);
  }
  emit();
}

/**
 * A PKR amount in the shopper's currency ("AED 32.50", "£8.40"); PKR when that is their currency
 * or no rate is known yet. Display only: orders are charged in PKR (cards in USD).
 */
export function formatMoney(pkr: number): string {
  if (currency !== 'PKR') {
    const v = convertFromPkr(pkr, currency);
    if (v !== null) return formatCurrency(v, currency);
  }
  return `PKR ${Math.round(Number(pkr) || 0).toLocaleString('en-US')}`;
}

/** The shopper's country ('' until known); re-renders when it changes */
export function useVisitorCountry() {
  const [, setTick] = useState(0);
  useEffect(() => {
    start();
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return country;
}

/** PKR amount in another currency (null when no rate is known) */
export function convertFromPkr(pkr: number, to: string): number | null {
  if (!rates) return null;
  const p = rates.rates.PKR;
  const t = rates.rates[to];
  if (!p || !t) return null;
  return (Number(pkr) / p) * t;
}

/** convertPrice(amountInUSD, targetCurrency) for the browser */
export function convertPrice(amountInUSD: number, targetCurrency: string): number | null {
  const t = rates?.rates[String(targetCurrency).toUpperCase()];
  return t ? Number(amountInUSD) * t : null;
}

export function formatCurrency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** The shopper's currency, the rates and helpers; components re-render when either changes */
export function useCurrency() {
  const [, setTick] = useState(0);
  useEffect(() => {
    start();
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    currency,
    rates,
    setCurrency: setDisplayCurrency,
    /** "≈ AED 32" for a PKR amount, or '' when showing PKR / no rate yet */
    approx: (pkr: number) => {
      if (currency === 'PKR') return '';
      const v = convertFromPkr(pkr, currency);
      return v === null ? '' : `≈ ${formatCurrency(v, currency)}`;
    },
  };
}
