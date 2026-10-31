// The store's Customer Protection Policy and Supplier Code of Conduct, as numbers the server
// enforces. The wording customers and sellers read is in src/data/policies.ts; keep both in step.
import { FAMOUS_BRANDS } from '../src/services/brandRules';

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

/** Test orders (placed by the store to try things out) never count in a seller's scores */
export const isTestOrder = (o: any) =>
  /^test\b/i.test(String(o?.customerName || '').trim()) || /\btest order\b|system test/i.test(String(o?.cancellationReason || '') + ' ' + String(o?.notes || ''));

/**
 * Cancellations that count against the seller: out of stock / could not supply, cancelled by the
 * seller, or too slow. Customer changes of mind, fake / unreachable customers and test orders
 * do not.
 */
export const isSellerFaultCancel = (o: any) => {
  if (o?.status !== 'CANCELLED' || isTestOrder(o)) return false;
  const r = String(o?.cancellationReason || '').toLowerCase();
  if (/fake|not respond|unreachable|no answer|wrong number|customer|changed (his|her|their)? ?mind|by buyer|duplicate/.test(r)) return false;
  return /stock|un ?a[vw]ailable|not available|cannot supply|can't supply|by seller|seller cancel|late|delay|slow|supplier/.test(r);
};
/** Below this many orders, rates are too noisy to judge a shop by */
export const MIN_ORDERS_FOR_RATES = 5;

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

// Listings that need a purchase invoice or brand approval (branded electronics and well-known brands).
// A "No brand" product needs none: its title may not use a brand's name (checked when it is saved).
const ELECTRONICS = /electronic|gadget|airpod|earbud|headset|headphone|speaker|charger|power ?bank|smart ?watch|mobile|phone|camera|laptop|tablet|bluetooth|console/i;
export const needsBrandProof = (p: { name?: string; category?: string; brand?: string; info?: { brandType?: string } }) =>
  p.info?.brandType !== 'NONE' &&
  (ELECTRONICS.test(`${p.category || ''} ${p.name || ''}`) || FAMOUS_BRANDS.test(`${p.name || ''} ${p.brand || ''}`));
