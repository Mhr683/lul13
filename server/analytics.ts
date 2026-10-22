import type express from 'express';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

// Traffic, sales and conversion analytics, designed for very few database reads/writes:
//   - the store sends small batches of events (impressions, clicks, views, add to cart, checkout);
//     orders, cancellations and returns are recorded by the server itself
//   - everything is added up in memory and written every 5 minutes as ONE document per day:
//       analytics_daily/{YYYY-MM-DD}   (Pakistan time)
//   - unique visitors use a HyperLogLog sketch (2 KB per day, ~2% error) instead of storing ids
//   - the admin report reads at most one document per day in the range; past days are kept in
//     memory for 6 hours (they no longer change)

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface AnalyticsDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAdmin: Handler;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  isQuotaHit: () => boolean;
  productName: (id: string) => string | null;
  sellerName: (id: string) => string | null;
  /** Called with each accepted batch (e.g. Meta Conversions API for add-to-cart / checkout) */
  onEvents?: (visitor: string, events: { t: string; p?: string; n?: number }[], req: express.Request) => void;
}

export const SOURCES = ['direct', 'meta', 'google', 'tiktok', 'social', 'whatsapp', 'search', 'other'] as const;
type Source = (typeof SOURCES)[number];
const EVENT_TYPES = { imp: 'impressions', clk: 'clicks', view: 'productViews', pv: 'pageViews', cart: 'addToCart', chk: 'checkoutStarted' } as const;
type Counters = Record<string, number>;
type Day = {
  c: Counters; // totals
  src: Record<string, number>; // new visitors per source
  hrs: Record<string, number>; // page views per hour (Pakistan time)
  p: Record<string, Record<string, number>>; // per product: i, c, v, a, o
  s: Record<string, number>; // orders per seller
  cr: Record<string, number>; // cancellations by reason
  rr: Record<string, number>; // returns by reason
  os: Record<string, number>; // orders per traffic source
  or: Record<string, number>; // revenue per traffic source
  oc: Record<string, Record<string, number>>; // per "source|campaign": o (orders), r (revenue)
  visitors: string[]; // new visitor hashes for the HyperLogLog
};

const PK_OFFSET = 5 * 3600_000;
export const dayKey = (t = Date.now()) => new Date(t + PK_OFFSET).toISOString().slice(0, 10);
const hourOf = (t = Date.now()) => new Date(t + PK_OFFSET).getUTCHours();
const emptyDay = (): Day => ({ c: {}, src: {}, hrs: {}, p: {}, s: {}, cr: {}, rr: {}, os: {}, or: {}, oc: {}, visitors: [] });
const add = (o: Record<string, number>, k: string, n = 1) => (o[k] = (o[k] || 0) + n);

// ---------------------------------------------------------------- HyperLogLog (unique visitors)
const HLL_P = 11;
const HLL_M = 1 << HLL_P;
const hllEmpty = () => new Uint8Array(HLL_M);
const hllAdd = (regs: Uint8Array, id: string) => {
  const h = crypto.createHash('sha1').update(id).digest();
  const idx = (h[0] << 3) | (h[1] >> 5);
  // rank: position of the first 1 bit after the index bits
  let rank = 1;
  for (let bit = HLL_P; bit < 64 && rank < 54; bit++, rank++) {
    if ((h[bit >> 3] >> (7 - (bit & 7))) & 1) break;
  }
  if (rank > regs[idx]) regs[idx] = rank;
};
const hllMerge = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < HLL_M; i++) if (b[i] > a[i]) a[i] = b[i];
  return a;
};
export const hllCount = (regs: Uint8Array) => {
  let sum = 0;
  let zeros = 0;
  for (let i = 0; i < HLL_M; i++) {
    sum += 2 ** -regs[i];
    if (!regs[i]) zeros++;
  }
  const alpha = 0.7213 / (1 + 1.079 / HLL_M);
  const est = (alpha * HLL_M * HLL_M) / sum;
  return Math.round(est <= 2.5 * HLL_M && zeros ? HLL_M * Math.log(HLL_M / zeros) : est);
};
const hllFrom = (b64?: string) => {
  const r = hllEmpty();
  if (b64) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === HLL_M) r.set(buf);
  }
  return r;
};
const hllTo = (r: Uint8Array) => Buffer.from(r).toString('base64');

// ---------------------------------------------------------------- reasons
export const cancelReasonKey = (text: string) => {
  const t = String(text || '').toLowerCase();
  if (/fake|not respond|unreachable|no answer|not picking|wrong number/.test(t)) return 'Fake / customer not responding';
  if (/stock|unavailable|not available/.test(t)) return 'Out of stock';
  if (/address|location|city/.test(t)) return 'Address / delivery problem';
  if (/price|expensive|cheaper/.test(t)) return 'Price';
  if (/late|delay|slow/.test(t)) return 'Too slow';
  if (/quote/.test(t)) return 'Shipping quote declined';
  if (/customer|changed|mind|request|by buyer/.test(t)) return 'Customer cancelled';
  return 'Other';
};

export function createAnalytics(d: AnalyticsDeps) {
  const { adminDb } = d;
  const col = () => adminDb.collection('analytics_daily');
  const pending = new Map<string, Day>();
  const seenToday = new Map<string, Set<string>>(); // day -> visitor hashes already counted
  const dayOf = (k: string) => {
    let x = pending.get(k);
    if (!x) pending.set(k, (x = emptyDay()));
    return x;
  };

  // ---------------------------------------------------------------- recording
  const recordEvents = (visitor: string, source: Source, events: { t: string; p?: string; n?: number }[]) => {
    const now = Date.now();
    const k = dayKey(now);
    const day = dayOf(k);
    const vh = crypto.createHash('sha1').update(visitor).digest('hex').slice(0, 16);
    let seen = seenToday.get(k);
    if (!seen) {
      seenToday.set(k, (seen = new Set()));
      for (const old of seenToday.keys()) if (old < dayKey(now - 2 * 86400_000)) seenToday.delete(old);
    }
    if (!seen.has(vh) && seen.size < 200_000) {
      seen.add(vh);
      day.visitors.push(vh);
      add(day.src, source);
      add(day.c, 'visitors');
    }
    for (const e of events.slice(0, 200)) {
      const field = (EVENT_TYPES as any)[e.t] as string | undefined;
      if (!field) continue;
      const n = Math.max(1, Math.min(20, Math.floor(Number(e.n) || 1)));
      add(day.c, field, n);
      if (e.t === 'pv') add(day.hrs, String(hourOf(now)));
      const pid = typeof e.p === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(e.p) ? e.p : '';
      if (pid && e.t !== 'pv' && e.t !== 'chk') {
        const key = e.t === 'imp' ? 'i' : e.t === 'clk' ? 'c' : e.t === 'view' ? 'v' : 'a';
        const prod = (day.p[pid] ||= {});
        add(prod, key, n);
      }
    }
  };

  /** An order was placed (one per seller parcel) */
  const recordOrder = (
    o: { sellerId?: string; total?: number; items?: { productId: string; quantity: number }[] },
    attribution?: { source?: string; campaign?: string }
  ) => {
    const day = dayOf(dayKey());
    const revenue = Math.round(Number(o.total) || 0);
    add(day.c, 'orders');
    add(day.c, 'revenue', revenue);
    // Which channel / ad campaign brought the order (for ROAS)
    const source = (SOURCES as readonly string[]).includes(String(attribution?.source)) ? String(attribution!.source) : 'direct';
    add(day.os, source);
    add(day.or, source, revenue);
    const campaign = String(attribution?.campaign || '').replace(/[^\w\- ]+/g, '_').trim().slice(0, 60);
    if (campaign) {
      const k = `|`;
      add((day.oc[k] ||= {}), 'o');
      add(day.oc[k], 'r', revenue);
    }
    if (o.sellerId) add(day.s, String(o.sellerId));
    for (const it of o.items || []) {
      if (!it.productId) continue;
      add(day.c, 'units', Number(it.quantity) || 1);
      add((day.p[it.productId] ||= {}), 'o', Number(it.quantity) || 1);
    }
  };
  const recordCancel = (reason: string) => {
    const day = dayOf(dayKey());
    add(day.c, 'cancellations');
    add(day.cr, cancelReasonKey(reason));
  };
  const recordReturn = (reason: string) => {
    const day = dayOf(dayKey());
    add(day.c, 'returns');
    add(day.rr, String(reason || 'OTHER'));
  };

  // ---------------------------------------------------------------- saving (every 5 minutes)
  const pastCache = new Map<string, { at: number; data: any }>();
  let flushing = false;
  const flush = async () => {
    if (flushing || !pending.size || d.isQuotaHit()) return;
    flushing = true;
    const batch = Array.from(pending.entries());
    pending.clear();
    try {
      for (const [k, day] of batch) {
        const inc = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([key, n]) => [key, FieldValue.increment(n)]));
        const products = Object.fromEntries(Object.entries(day.p).map(([pid, v]) => [pid, inc(v)]));
        const ref = col().doc(k);
        await adminDb.runTransaction(async (tx) => {
          let hll: string | undefined;
          if (day.visitors.length) {
            const snap = await tx.get(ref);
            const regs = hllFrom(snap.data()?.hll);
            for (const v of day.visitors) hllAdd(regs, v);
            hll = hllTo(regs);
          }
          tx.set(
            ref,
            {
              day: k,
              c: inc(day.c),
              src: inc(day.src),
              hrs: inc(day.hrs),
              p: products,
              s: inc(day.s),
              cr: inc(day.cr),
              rr: inc(day.rr),
              os: inc(day.os),
              or: inc(day.or),
              oc: Object.fromEntries(Object.entries(day.oc).map(([k, v]) => [k, inc(v)])),
              ...(hll ? { hll } : {}),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        });
        pastCache.delete(k);
      }
    } catch (err: any) {
      console.warn('[analytics] save failed, will retry:', err?.message);
      // put the numbers back so nothing is lost
      for (const [k, day] of batch) {
        const cur = dayOf(k);
        for (const f of ['c', 'src', 'hrs', 's', 'cr', 'rr', 'os', 'or'] as const) for (const [key, n] of Object.entries(day[f])) add(cur[f], key, n);
        for (const [k, v] of Object.entries(day.oc)) for (const [key, n] of Object.entries(v)) add((cur.oc[k] ||= {}), key, n);
        for (const [pid, v] of Object.entries(day.p)) for (const [key, n] of Object.entries(v)) add((cur.p[pid] ||= {}), key, n);
        cur.visitors.push(...day.visitors);
      }
    } finally {
      flushing = false;
    }
  };
  setInterval(flush, 5 * 60_000).unref?.();
  // Saved once more when the server stops (server/catalogStore.ts runs these on SIGTERM)
  ((globalThis as any).__shutdownTasks ||= []).push(flush);

  // ---------------------------------------------------------------- reading
  const readDays = async (keys: string[]) => {
    const today = dayKey();
    const out = new Map<string, any>();
    const need: string[] = [];
    for (const k of keys) {
      const hit = pastCache.get(k);
      // past days: 6 hours; today: 2 minutes
      if (hit && Date.now() - hit.at < (k < today ? 6 * 3600_000 : 2 * 60_000)) out.set(k, hit.data);
      else need.push(k);
    }
    if (need.length) {
      const snaps = await adminDb.getAll(...need.map((k) => col().doc(k)));
      snaps.forEach((s, i) => {
        const data = s.exists ? s.data() : null;
        out.set(need[i], data);
        pastCache.set(need[i], { at: Date.now(), data });
      });
    }
    return out;
  };

  let sellersCount: { at: number; n: number } | null = null;
  const approvedSellers = async () => {
    if (sellersCount && Date.now() - sellersCount.at < 30 * 60_000) return sellersCount.n;
    const snap = await adminDb.collection('sellers').where('status', '==', 'APPROVED').count().get();
    sellersCount = { at: Date.now(), n: snap.data().count };
    return sellersCount.n;
  };

  const report = async (from: string, to: string) => {
    const keys: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && keys.length < 92; t += 86400_000) {
      keys.push(new Date(t).toISOString().slice(0, 10));
    }
    const docs = await readDays(keys);
    const totals: Counters = {};
    const sources: Record<string, number> = {};
    const hours: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const products = new Map<string, Record<string, number>>();
    const sellersByWeek = new Map<string, Map<string, number>>();
    const cancels: Record<string, number> = {};
    const returns: Record<string, number> = {};
    const ordersBySource: Record<string, number> = {};
    const revenueBySource: Record<string, number> = {};
    const byCampaign: Record<string, Record<string, number>> = {};
    const rangeHll = hllEmpty();
    const series: any[] = [];

    for (const k of keys) {
      const doc = docs.get(k) || {};
      const mem = pending.get(k);
      const merged = (f: string) => {
        const o: Record<string, number> = { ...(doc[f] || {}) };
        if (mem) for (const [key, n] of Object.entries((mem as any)[f] || {})) add(o, key, n as number);
        return o;
      };
      const c = merged('c');
      const dayHll = hllFrom(doc.hll);
      if (mem) for (const v of mem.visitors) hllAdd(dayHll, v);
      hllMerge(rangeHll, dayHll);
      for (const [key, n] of Object.entries(c)) add(totals, key, n);
      for (const [key, n] of Object.entries(merged('src'))) add(sources, key, n);
      for (const [key, n] of Object.entries(merged('cr'))) add(cancels, key, n);
      for (const [key, n] of Object.entries(merged('rr'))) add(returns, key, n);
      for (const [key, n] of Object.entries(merged('os'))) add(ordersBySource, key, n);
      for (const [key, n] of Object.entries(merged('or'))) add(revenueBySource, key, n);
      const oc: Record<string, Record<string, number>> = {};
      for (const [k, v] of Object.entries(doc.oc || {})) oc[k] = { ...(v as any) };
      if (mem) for (const [k, v] of Object.entries(mem.oc)) for (const [key, n] of Object.entries(v)) add((oc[k] ||= {}), key, n);
      for (const [k, v] of Object.entries(oc)) for (const [key, n] of Object.entries(v)) add((byCampaign[k] ||= {}), key, Number(n) || 0);
      const weekday = new Date(`${k}T00:00:00Z`).getUTCDay();
      for (const [h, n] of Object.entries(merged('hrs'))) hours[weekday][Number(h)] += n;
      const pp: Record<string, Record<string, number>> = { ...(doc.p || {}) };
      if (mem) for (const [pid, v] of Object.entries(mem.p)) {
        const t = (pp[pid] = { ...(pp[pid] || {}) });
        for (const [key, n] of Object.entries(v)) add(t, key, n);
      }
      for (const [pid, v] of Object.entries(pp)) {
        const t = products.get(pid) || {};
        for (const [key, n] of Object.entries(v)) add(t, key, Number(n) || 0);
        products.set(pid, t);
      }
      // ISO-ish week starting Monday
      const dt = new Date(`${k}T00:00:00Z`);
      const monday = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400_000).toISOString().slice(0, 10);
      const wk = sellersByWeek.get(monday) || new Map<string, number>();
      for (const [sid, n] of Object.entries(merged('s'))) wk.set(sid, (wk.get(sid) || 0) + (n as number));
      sellersByWeek.set(monday, wk);
      series.push({
        date: k,
        visitors: hllCount(dayHll),
        pageViews: c.pageViews || 0,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        productViews: c.productViews || 0,
        addToCart: c.addToCart || 0,
        checkoutStarted: c.checkoutStarted || 0,
        orders: c.orders || 0,
        revenue: c.revenue || 0,
      });
    }

    const rows = Array.from(products.entries()).map(([id, v]) => ({
      id,
      name: d.productName(id) || id,
      impressions: v.i || 0,
      clicks: v.c || 0,
      views: v.v || 0,
      addToCart: v.a || 0,
      sold: v.o || 0,
    }));
    const steps = [
      { key: 'impressions', label: 'Impressions', value: totals.impressions || 0 },
      { key: 'productViews', label: 'Product views', value: totals.productViews || 0 },
      { key: 'addToCart', label: 'Add to cart', value: totals.addToCart || 0 },
      { key: 'checkoutStarted', label: 'Checkout started', value: totals.checkoutStarted || 0 },
      { key: 'orders', label: 'Orders placed', value: totals.orders || 0 },
    ].map((s, i, all) => ({
      ...s,
      ofPrevious: i && all[i - 1].value ? Math.round((s.value / all[i - 1].value) * 1000) / 10 : null,
      dropOff: i && all[i - 1].value ? Math.round((1 - s.value / all[i - 1].value) * 1000) / 10 : null,
    }));
    const registered = await approvedSellers().catch(() => null);
    const weeks = Array.from(sellersByWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, m]) => ({
        week,
        activeSellers: Array.from(m.keys()).filter((id) => id !== 'house').length,
        orders: Array.from(m.values()).reduce((s, n) => s + n, 0),
      }));
    const topSellers = new Map<string, number>();
    for (const m of sellersByWeek.values()) for (const [sid, n] of m) topSellers.set(sid, (topSellers.get(sid) || 0) + n);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      from: keys[0],
      to: keys[keys.length - 1],
      totals: {
        impressions: totals.impressions || 0,
        clicks: totals.clicks || 0,
        productViews: totals.productViews || 0,
        pageViews: totals.pageViews || 0,
        ctr: pct(totals.clicks || 0, totals.impressions || 0),
        uniqueVisitors: hllCount(rangeHll),
        addToCart: totals.addToCart || 0,
        checkoutStarted: totals.checkoutStarted || 0,
        orders: totals.orders || 0,
        revenue: totals.revenue || 0,
        conversionRate: pct(totals.orders || 0, hllCount(rangeHll)),
        cancellations: totals.cancellations || 0,
        returns: totals.returns || 0,
        cancellationRate: pct(totals.cancellations || 0, totals.orders || 0),
        returnRate: pct(totals.returns || 0, totals.orders || 0),
      },
      series,
      sources: SOURCES.map((s) => ({ source: s, visitors: sources[s] || 0, orders: ordersBySource[s] || 0, revenue: revenueBySource[s] || 0 })),
      campaigns: Object.entries(byCampaign).map(([k, v]) => {
        const [source, ...rest] = k.split('|');
        return { source, campaign: rest.join('|'), orders: v.o || 0, revenue: v.r || 0 };
      }),
      funnel: steps,
      mostViewed: [...rows].sort((a, b) => b.views - a.views || b.clicks - a.clicks).slice(0, 10),
      mostSold: [...rows].sort((a, b) => b.sold - a.sold).filter((r) => r.sold > 0).slice(0, 10),
      sellers: {
        registered,
        weeks,
        top: Array.from(topSellers.entries())
          .filter(([id]) => id !== 'house')
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id, orders]) => ({ id, name: d.sellerName(id) || id, orders })),
      },
      cancelReasons: Object.entries(cancels).map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
      returnReasons: Object.entries(returns).map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
      heatmap: hours,
      generatedAt: new Date().toISOString(),
    };
  };

  // ---------------------------------------------------------------- routes
  const register = (app: express.Express) => {
    // Small batches from the store (sendBeacon). No personal data: a random device id, hashed.
    app.post('/api/track/events', d.limitPerIp('track-events', 60), (req, res) => {
      const ua = String(req.headers['user-agent'] || '');
      if (/bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(ua)) return res.status(204).end();
      let b: any = req.body;
      if (typeof b === 'string') {
        try {
          b = JSON.parse(b);
        } catch {
          return res.status(400).end();
        }
      }
      const visitor = String(b?.v || '');
      if (!/^[a-f0-9]{16,64}$/.test(visitor) || !Array.isArray(b?.e)) return res.status(400).end();
      const source = (SOURCES as readonly string[]).includes(b?.s) ? (b.s as Source) : 'other';
      recordEvents(visitor, source, b.e);
      d.onEvents?.(visitor, b.e, req);
      res.status(204).end();
    });

    const reportCache = new Map<string, { at: number; data: any }>();
    app.get('/api/admin/analytics', d.requireAdmin, async (req, res) => {
      const valid = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
      const to = valid(req.query.to) || dayKey();
      const from = valid(req.query.from) || dayKey(Date.now() - 6 * 86400_000);
      if (from > to) return res.status(400).json({ error: 'The start date is after the end date.' });
      try {
        const key = `${from}|${to}`;
        let hit = reportCache.get(key);
        if (!hit || Date.now() - hit.at > 60_000) {
          hit = { at: Date.now(), data: await report(from, to) };
          reportCache.set(key, hit);
          if (reportCache.size > 50) reportCache.clear();
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, ...hit.data });
      } catch (err) {
        console.error('[admin/analytics] failed:', err);
        res.status(503).json({ error: 'Could not build the analytics report. Please try again.' });
      }
    });
  };

  return { register, recordOrder, recordCancel, recordReturn, flush, report };
}
