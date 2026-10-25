import React, { useEffect, useState } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { CANCEL_REASONS, cancelOptionFor, cancelWarning, type CancelRequest } from '../services/cancelPolicy';

// Customer's "Cancel order" on My Orders and the tracking page. The time left to cancel alone
// counts down; after it the customer sends a request the seller answers. Before confirming, the
// customer picks a reason and sees what repeated cancelling leads to (src/services/cancelPolicy.ts).

type OrderLike = {
  orderNumber: string;
  status: string;
  createdAt: string;
  paymentMethod?: string;
  paymentStatus?: string;
  cancelRequest?: CancelRequest | null;
};

const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export const OrderCancelBox: React.FC<{
  order: OrderLike;
  /** Guest tracking token (signed-in owners do not need it) */
  token?: string;
  onDone?: (message: string) => void;
}> = ({ order, token, onDone }) => {
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const option = cancelOptionFor(order, now);
  const endsAt = option.mode === 'INSTANT' && option.endsAt ? Date.parse(option.endsAt) : null;
  // The countdown moves once a minute while there is time left
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (result) return <div className="p-3 border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">{result}</div>;
  if (option.mode === 'NONE') {
    if (['CANCELLED', 'REFUNDED', 'RETURNED', 'DELIVERED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'].includes(order.status)) return null;
    return <div className="p-3 border border-black/10 bg-[#F7F6F2] text-[11px] text-[#575653]">{option.why}</div>;
  }
  const isRequest = option.mode === 'REQUEST';
  const free = option.mode === 'INSTANT' && !option.strike;

  const submit = async () => {
    if (!reason) return setError('Please choose a reason.');
    setBusy(true);
    setError(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ orderNumber: order.orderNumber, orderAccessToken: token || undefined, reason, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Could not cancel the order. Please try again.');
      const paused = data.codPausedUntil
        ? ` Cash on Delivery is now paused for your number until ${new Date(data.codPausedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`
        : '';
      const msg =
        data.mode === 'REQUEST'
          ? `Cancel request sent for ${order.orderNumber}. The seller will reply soon; you will see the answer here.${paused}`
          : `Order ${order.orderNumber} cancelled.${order.paymentStatus === 'PAID' ? ' Your payment will be refunded.' : ''}${paused}`;
      setResult(msg);
      onDone?.(msg);
    } catch {
      setError('Network error. Please check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 border border-rose-200 bg-rose-50/40 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[#454441]">
          {isRequest
            ? 'The free-cancel time is over. You can still ask the seller to cancel before the parcel is packed.'
            : free
            ? 'You have not paid yet; you can cancel this order.'
            : `You can cancel this order yourself for another ${left((endsAt || now) - now)}.`}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-300 bg-white text-rose-700 font-semibold hover:bg-rose-50 cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" /> {isRequest ? 'Request cancellation' : 'Cancel order'}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[11px] font-bold text-[#141413] mb-1">Why do you want to cancel?</span>
            <select className="w-full px-2.5 py-1.5 bg-white border border-black/20" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <input
            className="w-full px-2.5 py-1.5 bg-white border border-black/20"
            placeholder="More details (optional)"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {!free && (
            <div className="flex gap-2 p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-[11px] leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cancelWarning(null)}</span>
            </div>
          )}
          {error && <div className="text-rose-700 font-semibold">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-3 py-1.5 bg-rose-700 text-white font-semibold hover:bg-rose-800 disabled:opacity-60 cursor-pointer"
            >
              {busy ? 'Please wait…' : isRequest ? 'Send cancel request' : 'Yes, cancel my order'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 border border-black/20 bg-white cursor-pointer">
              Keep my order
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
