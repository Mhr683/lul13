// The store's Customer Protection Policy and Supplier Code of Conduct, as numbers the server
// enforces. The wording customers and sellers read is in src/data/policies.ts; keep both in step.

export const POLICY = {
  /** Sellers must hand an order to the courier within this many hours of it being confirmed */
  DISPATCH_HOURS: 48,
  /** Customers can ask for a return / replacement this many days after delivery */
  RETURN_WINDOW_DAYS: 7,
  /** A seller's money for an order is released this many days after delivery (after the return window) */
  ESCROW_DAYS: 7,
  /** Different customers with an upheld quality / wrong-item complaint before a product is delisted */
  COMPLAINTS_TO_DELIST: 3,
  /** Customer rating below this (with at least MIN_RATINGS ratings) suspends the seller and freezes payouts */
  MIN_RATING: 3.0,
  MIN_RATINGS: 5,
  /** Fee (PKR) to restore an account suspended for low rating; allowed only once per seller */
  REINSTATEMENT_FEE: 5000,
  /** Return shipping charged to the seller when the return was their fault (PKR), unless set in store settings */
  DEFAULT_RETURN_CHARGE: 250,
  /** Bump when the Supplier Code of Conduct changes: every seller must accept the new version */
  CONDUCT_VERSION: '2026-10-21b',
};

export const RETURN_REASONS = ['DAMAGED', 'WRONG_ITEM', 'QUALITY', 'FAKE'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: 'Damaged or defective',
  WRONG_ITEM: 'Wrong item, colour or size',
  QUALITY: 'Quality does not match the description',
  FAKE: 'Fake or replica product',
};

const DAY = 24 * 60 * 60 * 1000;

/** When the order was delivered (from its tracking history), or null */
export const deliveredAtOf = (o: any): number | null => {
  if (o?.status !== 'DELIVERED' && o?.status !== 'RETURNED' && o?.status !== 'REFUNDED') return null;
  const ev = [...(Array.isArray(o?.trackingEvents) ? o.trackingEvents : [])].reverse().find((e: any) => e?.status === 'DELIVERED');
  const t = Date.parse(ev?.at || o?.deliveredAt || o?.updatedAt || '');
  return isNaN(t) ? null : t;
};

/** When the seller's 48-hour dispatch clock started: store confirmation, else the order time */
export const dispatchClockStart = (o: any): number => {
  const ev = (Array.isArray(o?.trackingEvents) ? o.trackingEvents : []).find((e: any) => e?.status === 'CONFIRMED');
  const t = Date.parse(ev?.at || o?.createdAt || '');
  return isNaN(t) ? Date.now() : t;
};

/** A delivered order whose return window is over and has no open return request */
export const escrowReleased = (o: any, now = Date.now()) => {
  if (o?.status !== 'DELIVERED') return false;
  if (o?.returnRequestStatus === 'OPEN') return false;
  const at = deliveredAtOf(o);
  return at !== null && now - at >= POLICY.ESCROW_DAYS * DAY;
};

/** Days left for the customer to ask for a return (0 when the window is over) */
export const returnDaysLeft = (o: any, now = Date.now()) => {
  const at = deliveredAtOf(o);
  if (at === null || o?.status !== 'DELIVERED') return 0;
  return Math.max(0, Math.ceil((at + POLICY.RETURN_WINDOW_DAYS * DAY - now) / DAY));
};

// Listings that need a purchase invoice or brand approval (electronics and well-known brands)
const ELECTRONICS = /electronic|gadget|airpod|earbud|headset|headphone|speaker|charger|power ?bank|smart ?watch|mobile|phone|camera|laptop|tablet|bluetooth|console/i;
const BRANDS =
  /\b(apple|iphone|samsung|xiaomi|redmi|oppo|vivo|infinix|huawei|sony|jbl|bose|anker|nike|adidas|puma|gucci|chanel|dior|versace|armani|prada|louis vuitton|rolex|casio|fossil|tissot|omega|creed|tom ford|calvin klein|hugo boss|ray-?ban|michael kors|coach)\b/i;
export const needsBrandProof = (p: { name?: string; category?: string; brand?: string }) =>
  ELECTRONICS.test(`${p.category || ''} ${p.name || ''}`) || BRANDS.test(`${p.name || ''} ${p.brand || ''}`);
