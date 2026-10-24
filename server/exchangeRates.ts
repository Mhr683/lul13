import type express from 'express';

// Exchange rates for showing prices in the customer's own currency.
//
//   Source: ExchangeRate-API's free open endpoint (no key; ~160 currencies incl. PKR; updated daily;
//   attribution "Rates By Exchange Rate API" is shown next to converted prices). Frankfurter (ECB)
//   was not used: it has no PKR.
//
//   Stored as ONE document, currency_exchange_rates/USD:
//     { base_currency: 'USD', rates: { AED: 3.6725, PKR: 278.4, ... }, updated_at, source }
//   (one document instead of a row per currency: 1 write a day and 1 read per server start, instead
//   of ~160 of each on the free Firestore plan)
//
//   A daily job (inside the server) refreshes it; every server keeps the rates in memory.
//
//   GET /api/exchange-rates                      all rates (the store converts in the browser, no call per price)
//   GET /api/convert-price?amount=10&from=USD&to=AED   one conversion
//
// Prices are stored and charged in PKR; converted amounts are for display only.

export interface RatesDoc {
  base_currency: 'USD';
  rates: Record<string, number>;
  updated_at: string;
  source: string;
}

const SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
const DOC = { col: 'currency_exchange_rates', id: 'USD' };
const DAY = 24 * 60 * 60 * 1000;
// Used until the first download succeeds (rough values, PKR from the store's own setting)
const FALLBACK: Record<string, number> = { USD: 1, PKR: 278.5, AED: 3.6725, SAR: 3.75, GBP: 0.79, EUR: 0.92, CAD: 1.37, AUD: 1.52, QAR: 3.64, KWD: 0.307, OMR: 0.385, BHD: 0.376, INR: 83.5, BDT: 110, CNY: 7.2, TRY: 32.5, MYR: 4.7 };

export function createExchangeRates(adminDb: FirebaseFirestore.Firestore, opts: { fallbackPkr?: () => number } = {}) {
  let current: RatesDoc = {
    base_currency: 'USD',
    rates: { ...FALLBACK, PKR: opts.fallbackPkr?.() || FALLBACK.PKR },
    updated_at: '',
    source: 'fallback',
  };
  let loaded = false;

  const isFresh = (d: RatesDoc) => Boolean(d.updated_at) && Date.now() - Date.parse(d.updated_at) < DAY;

  /** Downloads today's rates and saves them (only when the saved copy is a day old) */
  const refresh = async (force = false) => {
    if (!force && isFresh(current)) return current;
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15_000) });
    const j: any = await res.json();
    if (j?.result !== 'success' || !j?.rates || typeof j.rates.PKR !== 'number') throw new Error(`rates source answered: ${j?.result || res.status}`);
    const rates: Record<string, number> = {};
    for (const [code, v] of Object.entries(j.rates)) if (/^[A-Z]{3}$/.test(code) && Number(v) > 0) rates[code] = Number(v);
    const next: RatesDoc = {
      base_currency: 'USD',
      rates,
      updated_at: new Date((Number(j.time_last_update_unix) || Date.now() / 1000) * 1000).toISOString(),
      source: 'ExchangeRate-API (open.er-api.com)',
    };
    await adminDb.collection(DOC.col).doc(DOC.id).set(next);
    current = next;
    console.log(`[rates] updated: ${Object.keys(rates).length} currencies, 1 USD = ${rates.PKR} PKR`);
    return current;
  };

  /** Saved rates on start (1 read); downloads new ones if they are a day old */
  const start = async () => {
    try {
      const snap = await adminDb.collection(DOC.col).doc(DOC.id).get();
      if (snap.exists) {
        const d = snap.data() as RatesDoc;
        if (d?.rates && typeof d.rates.PKR === 'number') current = d;
      }
      loaded = true;
    } catch (err: any) {
      console.warn('[rates] could not read saved rates:', err?.message);
    }
    await refresh().catch((err) => console.warn('[rates] download failed, using saved / fallback rates:', err?.message));
    // Daily job: checks every 3 hours, downloads when the copy is a day old
    setInterval(() => {
      refresh().catch((err) => console.warn('[rates] daily refresh failed:', err?.message));
    }, 3 * 60 * 60 * 1000).unref?.();
  };

  const rateOf = (code: string) => current.rates[String(code || '').toUpperCase()];

  /** amount in one currency → another (through USD); null when a currency is unknown */
  const convert = (amount: number, from: string, to: string): number | null => {
    const f = rateOf(from);
    const t = rateOf(to);
    if (!f || !t || !Number.isFinite(Number(amount))) return null;
    return (Number(amount) / f) * t;
  };

  /** convertPrice(amountInUSD, targetCurrency) */
  const convertPrice = (amountInUSD: number, targetCurrency: string) => convert(amountInUSD, 'USD', targetCurrency);

  const register = (app: express.Express, limitPerIp: (name: string, max: number) => express.RequestHandler) => {
    app.get('/api/exchange-rates', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({ success: true, ...current, stale: !isFresh(current) });
    });

    app.get('/api/convert-price', limitPerIp('convert-price', 120), (req, res) => {
      const amount = Number(req.query.amount);
      const from = String(req.query.from || 'USD').toUpperCase();
      const to = String(req.query.to || '').toUpperCase();
      if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) return res.status(400).json({ error: 'Enter a valid amount.' });
      if (!/^[A-Z]{3}$/.test(to)) return res.status(400).json({ error: 'Choose a currency, e.g. ?to=AED' });
      const value = convert(amount, from, to);
      if (value === null) return res.status(404).json({ error: `Unknown currency: ${rateOf(from) ? to : from}` });
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json({
        success: true,
        amount,
        from,
        to,
        value: Math.round(value * 100) / 100,
        rate: Math.round((rateOf(to) / rateOf(from)) * 1e6) / 1e6,
        updated_at: current.updated_at,
        source: current.source,
      });
    });
  };

  return {
    start,
    register,
    convert,
    convertPrice,
    rates: () => current,
    /** Live USD→PKR, for the order's exchange-rate snapshot */
    usdToPkr: () => rateOf('PKR') || opts.fallbackPkr?.() || FALLBACK.PKR,
    get loaded() {
      return loaded;
    },
  };
}
