import type express from 'express';

// Top Sellers of the month: sellers who bring the most visitors and orders (for example by sharing
// their shop link on WhatsApp, Facebook and TikTok).
//   - score = orders × 10 + visitors (a visitor opened the shop or one of its products; once a day)
//   - after a month ends, its top 3 (at least 1 order) are saved in growth/top_sellers
//   - the next month they are shown on the store's home page ("Top Sellers of October") and pay less
//     commission: #1 −2 percentage points, #2 and #3 −1 point (never below 0%)
//   - Seller Center shows each seller their place in this month's race
// Reads: the saved winners once an hour; the race uses the shared daily analytics documents.

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
type Totals = Map<string, { visitors: number; orders: number; revenue: number }>;

export const TOP_SELLER_DISCOUNT = [2, 1, 1];
/** The first month of the race (announced 2026-11-20): earlier months have no winners */
const FIRST_MONTH = '2026-11';
const ORDER_POINTS = 10;

export interface TopSellerDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireSeller: Handler;
  sellerTotals: (from: string, to: string) => Promise<Totals>;
  shopOf: (sellerId: string) => { name: string; shopId: string; logo: string } | null;
  isQuotaHit: () => boolean;
}

export type Winner = { id: string; name: string; shopId: string; logo: string; rank: number; score: number; orders: number; visitors: number; discount: number };

const PK_OFFSET = 5 * 3600_000;
const pkNow = (t = Date.now()) => new Date(t + PK_OFFSET);
const monthOf = (t = Date.now()) => pkNow(t).toISOString().slice(0, 7);
const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};
const lastDay = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
};
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const scoreOf = (r: { visitors: number; orders: number }) => r.orders * ORDER_POINTS + r.visitors;

export function createTopSellers(d: TopSellerDeps) {
  const ref = () => d.adminDb.collection('growth').doc('top_sellers');
  // Winners of the month before the current one (they get this month's rewards)
  let winners: { month: string; list: Winner[]; at: number } | null = null;
  let deciding: Promise<void> | null = null;

  const rank = (totals: Totals) =>
    Array.from(totals.entries())
      .map(([id, r]) => ({ id, ...r, score: scoreOf(r) }))
      .filter((r) => r.score > 0 && d.shopOf(r.id))
      // A shop needs at least 1 order to win, so shops with orders come first
      .sort((a, b) => Number(b.orders >= 1) - Number(a.orders >= 1) || b.score - a.score || b.revenue - a.revenue);

  const decide = async () => {
    const month = prevMonth(monthOf());
    if (winners && winners.month === month && Date.now() - winners.at < 3600_000) return;
    if (month < FIRST_MONTH) {
      winners = { month, list: [], at: Date.now() };
      return;
    }
    const snap = await ref().get();
    const saved = snap.data();
    if (saved?.month === month && Array.isArray(saved.list)) {
      winners = { month, list: saved.list, at: Date.now() };
      return;
    }
    if (d.isQuotaHit()) return;
    // The month just ended: pick its top 3 and save them once
    const ranked = rank(await d.sellerTotals(`${month}-01`, lastDay(month))).filter((r) => r.orders >= 1).slice(0, 3);
    const list: Winner[] = ranked.map((r, i) => {
      const shop = d.shopOf(r.id)!;
      return { id: r.id, name: shop.name, shopId: shop.shopId, logo: shop.logo, rank: i + 1, score: r.score, orders: r.orders, visitors: r.visitors, discount: TOP_SELLER_DISCOUNT[i] || 0 };
    });
    await ref().set({ month, list, decidedAt: new Date().toISOString() });
    winners = { month, list, at: Date.now() };
    if (list.length) console.log(`[top-sellers] ${monthName(month)}: ${list.map((w) => `#${w.rank} ${w.name}`).join(', ')}`);
  };
  const ensure = () => {
    if (!deciding) deciding = decide().catch((err) => console.warn('[top-sellers] failed:', err?.message || err)).finally(() => (deciding = null));
    return deciding;
  };
  setTimeout(ensure, 10_000).unref?.();
  setInterval(ensure, 3600_000).unref?.();

  /** Percentage points taken off this seller's commission this month (0 for everyone else) */
  const discountFor = (sellerId: string) => {
    if (!winners || winners.month !== prevMonth(monthOf())) return 0;
    return winners.list.find((w) => w.id === sellerId)?.discount || 0;
  };

  // This month's race, refreshed every 10 minutes
  let race: { at: number; month: string; ranked: ReturnType<typeof rank> } | null = null;
  const currentRace = async () => {
    const month = monthOf();
    if (!race || race.month !== month || Date.now() - race.at > 10 * 60_000) {
      const today = pkNow().toISOString().slice(0, 10);
      race = { at: Date.now(), month, ranked: rank(await d.sellerTotals(`${month}-01`, today)) };
    }
    return race;
  };

  const register = (app: express.Express) => {
    // Store home page: last month's Top Sellers
    app.get('/api/top-sellers', async (_req, res) => {
      await ensure();
      res.setHeader('Cache-Control', 'public, max-age=600');
      const live = (winners?.list || []).filter((w) => d.shopOf(w.id));
      res.json({ success: true, month: winners?.month || '', monthName: winners ? monthName(winners.month) : '', list: live.map(({ id, name, shopId, logo, rank }) => ({ id, name, shopId, logo, rank })) });
    });

    // Seller Center: my place in this month's race, and my reward (if I won last month)
    app.get('/api/seller/top-sellers', d.requireSeller, async (req, res) => {
      const uid = String((req as any).user?.uid || '');
      try {
        await ensure();
        const r = await currentRace();
        const idx = r.ranked.findIndex((x) => x.id === uid);
        const me = idx >= 0 ? r.ranked[idx] : null;
        const third = r.ranked[2];
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          success: true,
          month: r.month,
          monthName: monthName(r.month),
          points: { order: ORDER_POINTS, visitor: 1 },
          discounts: TOP_SELLER_DISCOUNT,
          me: { rank: me ? idx + 1 : null, score: me?.score || 0, orders: me?.orders || 0, visitors: me?.visitors || 0 },
          sellersInRace: r.ranked.length,
          // points still needed to reach 3rd place (0 = already in the top 3)
          toTop3: idx >= 0 && idx < 3 ? 0 : Math.max(1, (third?.score || 0) - (me?.score || 0) + 1),
          top: r.ranked.slice(0, 3).map((x, i) => ({ rank: i + 1, name: d.shopOf(x.id)?.name || 'Shop', score: x.score, isMe: x.id === uid })),
          reward: discountFor(uid) ? { month: winners!.month, monthName: monthName(winners!.month), rank: winners!.list.find((w) => w.id === uid)!.rank, discount: discountFor(uid) } : null,
        });
      } catch (err: any) {
        console.error('[seller/top-sellers] failed:', err);
        res.status(503).json({ error: 'Could not load the Top Sellers race. Please try again.' });
      }
    });
  };

  return { register, discountFor, ensure };
}
