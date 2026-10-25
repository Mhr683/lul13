// When a customer may cancel an order, shared by the store page (button, countdown, warning) and
// the server (/api/orders/cancel, orders/create), so both always agree.
//
//   - within WINDOW_HOURS of placing it, before the parcel is packed: cancelled at once
//   - later, but not packed yet: a cancel request the seller (or the store) accepts or declines
//   - packed / shipped / closed: no cancelling (refuse the parcel, or return it after delivery)
//   - an online payment that was never completed can always be dropped (no strike)
//
// Repeated cancelling: every customer cancellation (or request) is a strike on the delivery
// number. STRIKE_LIMIT strikes within STRIKE_DAYS pause Cash on Delivery for COD_PAUSE_DAYS.

export const CANCEL_POLICY = {
  WINDOW_HOURS: 6,
  STRIKE_LIMIT: 3,
  STRIKE_DAYS: 30,
  COD_PAUSE_DAYS: 30,
} as const;

export const CANCEL_REASONS = [
  'Ordered by mistake',
  'Changed my mind',
  'Found a better price elsewhere',
  'Delivery takes too long',
  'Wrong address or phone number',
  'Want to change size, colour or quantity',
  'Other',
] as const;

export type CancelRequest = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  note?: string;
  at: string;
  decidedAt?: string;
  decidedBy?: string;
  /** Why the seller declined */
  reply?: string;
};

type OrderLike = {
  status: string;
  createdAt: string;
  paymentMethod?: string;
  paymentStatus?: string;
  cancelRequest?: CancelRequest | null;
};

export type CancelOption =
  | { mode: 'INSTANT'; endsAt: string | null; strike: boolean }
  | { mode: 'REQUEST' }
  | { mode: 'NONE'; why: string };

const CLOSED = ['CANCELLED', 'RETURNED', 'REFUNDED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED', 'DELIVERED'];
const PACKED_OR_LATER = ['PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'];

/** What the customer can do with this order right now */
export function cancelOptionFor(o: OrderLike, now = Date.now(), windowHours: number = CANCEL_POLICY.WINDOW_HOURS): CancelOption {
  if (CLOSED.includes(o.status)) return { mode: 'NONE', why: o.status === 'DELIVERED' ? 'Delivered orders can be returned within 7 days instead.' : 'This order is closed.' };
  if (PACKED_OR_LATER.includes(o.status)) {
    return { mode: 'NONE', why: 'The parcel is already packed or on its way, so it cannot be cancelled. You can refuse it at the door or return it after delivery.' };
  }
  // An online payment that never went through: dropping it costs nobody anything
  if (o.paymentMethod === 'CARD' && o.paymentStatus !== 'PAID') return { mode: 'INSTANT', endsAt: null, strike: false };
  if (o.cancelRequest?.status === 'PENDING') return { mode: 'NONE', why: 'Your cancel request was sent. The seller will reply soon.' };
  if (o.cancelRequest?.status === 'REJECTED') {
    return { mode: 'NONE', why: `The seller could not cancel this order${o.cancelRequest.reply ? `: ${o.cancelRequest.reply}` : '.'} You can refuse it at the door or return it after delivery.` };
  }
  const endsAt = Date.parse(o.createdAt) + windowHours * 3600_000;
  if (Number.isFinite(endsAt) && now < endsAt) return { mode: 'INSTANT', endsAt: new Date(endsAt).toISOString(), strike: true };
  return { mode: 'REQUEST' };
}

/** Customer cancellations within the strike period */
export const recentStrikes = (cancels: string[] = [], now = Date.now()) =>
  cancels.filter((t) => now - Date.parse(t) < CANCEL_POLICY.STRIKE_DAYS * 86_400_000).length;

/** Until when Cash on Delivery is paused for this number (null = not paused) */
export function codPausedUntil(cancels: string[] = [], now = Date.now()): string | null {
  const recent = cancels.filter((t) => now - Date.parse(t) < CANCEL_POLICY.STRIKE_DAYS * 86_400_000).sort();
  if (recent.length < CANCEL_POLICY.STRIKE_LIMIT) return null;
  const until = Date.parse(recent[recent.length - 1]) + CANCEL_POLICY.COD_PAUSE_DAYS * 86_400_000;
  return until > now ? new Date(until).toISOString() : null;
}

/** Warning shown before cancelling */
export const cancelWarning = (strikesSoFar: number | null) =>
  `Please cancel only when you really have to: the seller has already started on your order. ` +
  `If you cancel ${CANCEL_POLICY.STRIKE_LIMIT} orders within ${CANCEL_POLICY.STRIKE_DAYS} days, Cash on Delivery is turned off for your number for ${CANCEL_POLICY.COD_PAUSE_DAYS} days and you will have to pay in advance` +
  (strikesSoFar !== null && strikesSoFar > 0 ? ` (you have cancelled ${strikesSoFar} recently).` : '.');
