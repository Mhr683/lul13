import { POLICY, dispatchClockStart } from './policyRules';

// Shop Coach: turns a seller's numbers into a clear list of what is wrong, what it will cost them
// and how to fix it, plus chart data. Pure function: the caller passes data it already has (orders
// from the seller cache, products from the catalog mirror), so the coach itself costs no reads.

export type CoachIssue = {
  level: 'RED' | 'YELLOW' | 'INFO';
  title: string;
  detail: string;
  impact: string;
  fix: string;
  tab?: string;
};

const DAY = 24 * 60 * 60 * 1000;
const CLOSED = ['CANCELLED', 'RETURNED', 'REFUNDED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'];
const SHIPPED = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'REFUNDED'];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`;

export function buildCoach(input: {
  seller: any;
  report: any;
  orders: any[];
  products: any[];
  openReturns: number;
  unpaidCharges: number;
  strikes: { productId: string; customers: number }[];
  hasBrandProof: (productId: string) => boolean;
  needsBrandProof: (p: any) => boolean;
}) {
  const { seller, report, orders, products, openReturns, unpaidCharges, strikes } = input;
  const now = Date.now();
  const issues: CoachIssue[] = [];
  const strengths: string[] = [];
  const live = products.filter((p) => p.status === 'ACTIVE');
  const recent = orders.filter((o) => now - Date.parse(o.createdAt || 0) <= 30 * DAY);
  const liveOrders = recent.filter((o) => !CLOSED.includes(o.status));
  const sales30 = liveOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgOrder = liveOrders.length ? sales30 / liveOrders.length : 0;

  // ---- dispatch speed (48 hours)
  const limit = POLICY.DISPATCH_HOURS * 3600_000;
  const shippedAt = (o: any) => {
    const ev = (o.trackingEvents || []).find((e: any) => ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(String(e?.status)));
    return ev ? Date.parse(ev.at) : NaN;
  };
  let due = 0;
  let onTime = 0;
  for (const o of recent) {
    const start = dispatchClockStart(o);
    const sh = shippedAt(o);
    if (SHIPPED.includes(o.status) || !isNaN(sh)) {
      due++;
      if (isNaN(sh) || sh - start <= limit) onTime++;
    } else if (['CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status) && now - start > limit) due++;
  }
  const onTimeRate = due ? Math.round((onTime / due) * 100) : null;
  const late = Number(report.lateToShip) || 0;
  if (late > 0) {
    issues.push({
      level: late >= 3 ? 'RED' : 'YELLOW',
      title: `${late} order${late > 1 ? 's' : ''} not dispatched within 48 hours`,
      detail: `These orders were confirmed more than ${POLICY.DISPATCH_HOURS} hours ago and are still not with the courier.`,
      impact: `Customers waiting longer cancel more often (about ${pkr(avgOrder * late)} of sales at risk). Your On-time Delivery score, shown to every customer, drops, and so does your account health.`,
      fix: 'Pack and hand them to the courier today, then add the tracking number in Orders.',
      tab: 'ORDERS',
    });
  } else if (onTimeRate !== null && onTimeRate >= 90) strengths.push(`On-time dispatch ${onTimeRate}%: customers see a strong delivery score.`);

  // ---- cancellations and returns
  const cancelRate = Number(report.rates?.cancelRate) || 0;
  const returnRate = Number(report.rates?.returnRate) || 0;
  if (cancelRate > 5) {
    issues.push({
      level: cancelRate > 10 ? 'RED' : 'YELLOW',
      title: `Cancellation rate ${cancelRate}%`,
      detail: 'Cancellations should stay under 5%.',
      impact: 'Every cancelled order is a lost sale, and the Cancellation score customers see goes up, so fewer of them buy from your shop.',
      fix: 'Keep stock numbers correct, confirm orders quickly by phone / WhatsApp, and remove products you cannot supply.',
      tab: 'PRODUCTS',
    });
  } else if (recent.length >= 5) strengths.push(`Low cancellations (${cancelRate}%).`);
  if (returnRate > 5) {
    issues.push({
      level: returnRate > 10 ? 'RED' : 'YELLOW',
      title: `Return rate ${returnRate}%`,
      detail: 'Returns should stay under 5%.',
      impact: `Returns that are your fault cost ${pkr(POLICY.DEFAULT_RETURN_CHARGE)} each off your payout, count as product complaints (3 customers = product removed for good) and lower your Quality Score.`,
      fix: 'Check each item before packing, use real pictures and exact sizes / colours in the listing, and pack fragile items well.',
      tab: 'RETURNS',
    });
  }
  if (openReturns > 0) {
    issues.push({
      level: 'YELLOW',
      title: `${openReturns} open return request${openReturns > 1 ? 's' : ''}`,
      detail: 'The store is reviewing them.',
      impact: 'The payout for these orders is on hold until they are decided.',
      fix: 'Open Returns and give your side (packing photos, what was sent) so the store can decide fairly.',
      tab: 'RETURNS',
    });
  }
  if (unpaidCharges > 0) {
    issues.push({
      level: 'INFO',
      title: `${pkr(unpaidCharges)} will be taken off your next payout`,
      detail: 'Return charges / fees not yet settled.',
      impact: 'Your next payout is smaller by this amount.',
      fix: 'Avoid wrong, damaged or poor-quality items to stop new charges.',
      tab: 'EARNINGS',
    });
  }

  // ---- complaints close to the 3-complaint rule
  for (const s of strikes.filter((x) => x.customers === POLICY.COMPLAINTS_TO_DELIST - 1).slice(0, 3)) {
    const p = products.find((x) => x.id === s.productId);
    if (!p || p.delisted) continue;
    issues.push({
      level: 'RED',
      title: `"${String(p.name).slice(0, 60)}" has ${s.customers} upheld complaints`,
      detail: `One more customer complaint and this product is removed permanently (rule: ${POLICY.COMPLAINTS_TO_DELIST} customers).`,
      impact: 'You would lose this listing, its reviews and its sales for good.',
      fix: 'Check your stock of this item for quality, update its pictures and description to match exactly, or pause it (Draft) until fixed.',
      tab: 'PRODUCTS',
    });
  }
  const locked = products.filter((p) => p.adminHidden).length;
  if (locked) {
    issues.push({
      level: 'YELLOW',
      title: `${locked} product${locked > 1 ? 's' : ''} hidden by the store`,
      detail: 'Locked after a complaint, delisted, or hidden by the admin.',
      impact: 'Customers cannot see or buy them.',
      fix: 'Open Messages and ask the store what to change.',
      tab: 'MESSAGES',
    });
  }

  // ---- customer rating
  const r = report.rating || {};
  if (r.ratingCount >= 3 && r.ratingAvg < 4) {
    const danger = r.ratingAvg < 3.5;
    issues.push({
      level: danger ? 'RED' : 'YELLOW',
      title: `Customer rating ${r.ratingAvg} from ${r.ratingCount} buyers`,
      detail: `${r.positivePercent}% positive. Good shops stay above 4.5.`,
      impact: `Customers see this rating on every product. Below ${POLICY.MIN_RATING.toFixed(1)} (from ${POLICY.MIN_RATINGS}+ buyers) your account is suspended and all payments are frozen; restoring it costs ${pkr(POLICY.REINSTATEMENT_FEE)} and is allowed only once.`,
      fix: 'Read your reviews, reply politely, fix the common complaint (late, quality, packing), and ship fast.',
      tab: 'REVIEWS',
    });
  } else if (r.ratingCount >= 3) strengths.push(`Customer rating ${r.ratingAvg} (${r.positivePercent}% positive).`);
  if (r.likes + r.dislikes >= 10 && r.dislikes / (r.likes + r.dislikes) > 0.3) {
    issues.push({
      level: 'YELLOW',
      title: `${r.dislikes} dislikes vs ${r.likes} likes on your products`,
      detail: 'Customers are telling you some products do not appeal to them.',
      impact: 'Disliked products sell less and lower your account health.',
      fix: 'Check the most disliked products in Reviews: improve pictures and price, or replace them.',
      tab: 'REVIEWS',
    });
  }

  // ---- catalog quality
  const outOfStock = live.filter((p) => Number(p.stock) <= 0);
  if (outOfStock.length) {
    const top = (report.topProducts || []).find((t: any) => outOfStock.some((p) => p.id === t.productId));
    issues.push({
      level: outOfStock.length / Math.max(1, live.length) > 0.3 || top ? 'RED' : 'YELLOW',
      title: `${outOfStock.length} live product${outOfStock.length > 1 ? 's are' : ' is'} out of stock`,
      detail: top ? `Including your best seller "${String(top.name).slice(0, 60)}".` : 'Customers can see them but cannot buy.',
      impact: 'Every visitor to these products is a lost sale, and they may buy from another shop instead.',
      fix: 'Restock them, or ask the AI Assistant to set the stock / hide them.',
      tab: 'PRODUCTS',
    });
  }
  const fewPictures = live.filter((p) => (Array.isArray(p.images) ? p.images.length : p.primaryImage ? 1 : 0) < 3);
  if (fewPictures.length) {
    issues.push({
      level: 'INFO',
      title: `${fewPictures.length} product${fewPictures.length > 1 ? 's have' : ' has'} fewer than 3 pictures`,
      detail: 'You can add up to 8 pictures and 1 video per product.',
      impact: 'Products with several real pictures and a video get more clicks and fewer returns.',
      fix: 'Open each product and add more pictures (front, back, size, packing) and a short video.',
      tab: 'PRODUCTS',
    });
  }
  const thin = live.filter((p) => String(p.description || '').length < 120);
  if (thin.length) {
    issues.push({
      level: 'INFO',
      title: `${thin.length} product${thin.length > 1 ? 's have' : ' has'} a very short description`,
      detail: 'Customers want size, material, what is in the box.',
      impact: 'Short descriptions rank lower in search and cause "not as described" returns.',
      fix: 'Ask the AI Assistant: "rewrite descriptions for <product>".',
      tab: 'AI',
    });
  }
  const proofDrafts = products.filter((p) => p.status === 'DRAFT' && !p.adminHidden && input.needsBrandProof(p) && !input.hasBrandProof(p.id));
  if (proofDrafts.length) {
    issues.push({
      level: 'YELLOW',
      title: `${proofDrafts.length} draft${proofDrafts.length > 1 ? 's' : ''} waiting for an invoice / brand approval`,
      detail: 'Electronics and branded items go live only with proof.',
      impact: 'These products cannot sell until the proof is uploaded.',
      fix: 'Open each one in Products and upload the purchase invoice or brand approval.',
      tab: 'PRODUCTS',
    });
  }
  const sold = new Set<string>();
  for (const o of liveOrders) for (const it of o.items || []) sold.add(it.productId);
  const idle = live.filter((p) => !sold.has(p.id) && now - Date.parse(p.createdAt || 0) > 30 * DAY);
  if (live.length >= 5 && idle.length / live.length > 0.5) {
    issues.push({
      level: 'INFO',
      title: `${idle.length} of ${live.length} live products had no sale in 30 days`,
      detail: 'Slow products take space and attention.',
      impact: 'Your shop looks less active and your best items are harder to find.',
      fix: 'Improve price and pictures of the slow ones, run a sale, or replace them with items like your best sellers.',
      tab: 'PRODUCTS',
    });
  }
  if (!live.length) {
    issues.push({
      level: 'RED',
      title: 'No live products',
      detail: 'Customers cannot buy anything from your shop.',
      impact: 'No sales at all.',
      fix: 'Add products (or a CSV) in Products.',
      tab: 'PRODUCTS',
    });
  }
  if (!recent.length && live.length) {
    issues.push({
      level: 'INFO',
      title: 'No orders in the last 30 days',
      detail: 'Your products are live but not selling yet.',
      impact: 'No earnings this month.',
      fix: 'Check prices against similar products, add more pictures, and share your shop link on WhatsApp / Facebook.',
      tab: 'PRODUCTS',
    });
  }

  // ---- charts
  const byDay = new Map<string, { orders: number; sales: number }>();
  for (let i = 29; i >= 0; i--) byDay.set(new Date(now - i * DAY).toISOString().slice(0, 10), { orders: 0, sales: 0 });
  for (const o of recent) {
    const key = String(o.createdAt).slice(0, 10);
    const b = byDay.get(key);
    if (!b) continue;
    b.orders++;
    if (!CLOSED.includes(o.status)) b.sales += Number(o.total) || 0;
  }
  const statusGroups: Record<string, number> = { 'To ship': 0, 'On the way': 0, Delivered: 0, Cancelled: 0, Returned: 0 };
  for (const o of recent) {
    if (['PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status)) statusGroups['To ship']++;
    else if (['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)) statusGroups['On the way']++;
    else if (o.status === 'DELIVERED') statusGroups.Delivered++;
    else if (o.status === 'CANCELLED') statusGroups.Cancelled++;
    else if (['RETURNED', 'REFUNDED'].includes(o.status)) statusGroups.Returned++;
  }

  const order = { RED: 0, YELLOW: 1, INFO: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  const reds = issues.filter((i) => i.level === 'RED').length;
  const health = report.health || {};
  return {
    shopName: seller.shopName,
    health: { level: health.level, score: health.score },
    headline: reds
      ? `${reds} urgent problem${reds > 1 ? 's' : ''} need your attention today.`
      : issues.some((i) => i.level === 'YELLOW')
      ? 'Your shop is doing OK, but a few things need fixing.'
      : 'Your shop is in good shape. Keep it up!',
    scores: {
      onTimeDelivery: onTimeRate,
      cancellation: cancelRate,
      returns: returnRate,
      rating: r.ratingCount ? r.ratingAvg : null,
      positivePercent: r.ratingCount ? r.positivePercent : null,
    },
    last30: { orders: recent.length, sales: Math.round(sales30), avgOrder: Math.round(avgOrder) },
    // Live products running out (5 or fewer left), fewest first
    lowStock: live
      .filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5)
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .slice(0, 8)
      .map((p) => ({ id: p.id, name: String(p.name).slice(0, 60), stock: Number(p.stock) })),
    newOrdersToday: orders.filter((o) => String(o.createdAt).slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    periods: report.periods,
    issues,
    strengths,
    charts: {
      salesByDay: Array.from(byDay.entries()).map(([date, v]) => ({ date: date.slice(5), orders: v.orders, sales: Math.round(v.sales) })),
      statusBreakdown: Object.entries(statusGroups).map(([label, value]) => ({ label, value })),
      topProducts: (report.topProducts || []).map((t: any) => ({ name: String(t.name).slice(0, 40), units: t.units, sales: t.sales })),
    },
    generatedAt: new Date().toISOString(),
  };
}
