import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

// Tracking page of a card order: the payment's state from the gateway, and a "Pay now" button
// while the payment page is still open. Coming back from the payment page (?payment=success)
// it checks a few times, since the bank's answer can take a moment.

type CardStatus = {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  attemptFailed: boolean;
  amount: number;
  currency: string;
  payUrl: string | null;
  expiresAt: string;
};

export const CardPaymentStatus: React.FC<{ checkoutId: string; token: string; onPaid?: () => void }> = ({ checkoutId, token, onPaid }) => {
  const [info, setInfo] = useState<CardStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const returned = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('payment') : null;

  useEffect(() => {
    if (!checkoutId || !token) return;
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const res = await fetch(`/api/payments/card/${encodeURIComponent(checkoutId)}?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!live) return;
        if (!res.ok) return setError(data.error || 'Could not check the payment.');
        setInfo(data);
        setError(null);
        if (data.status === 'PAID') return onPaid?.();
        // Back from a successful payment: the confirmation can lag a few seconds
        if (returned === 'success' && data.status === 'PENDING' && ++tries < 8) timer = setTimeout(check, 4000);
      } catch {
        if (live) setError('Network error while checking the payment.');
      }
    };
    check();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutId, token]);

  if (error) return <div className="p-3 border border-amber-200 bg-amber-50 text-xs text-amber-900 rounded">{error}</div>;
  if (!info) {
    return (
      <div className="p-3 border border-black/10 bg-white text-xs text-[#575653] rounded flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking your card payment...
      </div>
    );
  }
  const amount = `${info.currency} ${info.amount.toFixed(2)}`;
  if (info.status === 'PAID') {
    return (
      <div className="p-3 border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 rounded flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> Card payment of <strong>{amount}</strong> received. Your order is confirmed and a confirmation email is on its way.
      </div>
    );
  }
  if (info.status !== 'PENDING') {
    return (
      <div className="p-3 border border-rose-200 bg-rose-50 text-xs text-rose-900 rounded">
        {info.status === 'EXPIRED'
          ? 'The card payment was not completed in time, so this order was cancelled. You can order again any time.'
          : 'This card payment could not be accepted. Please contact us before paying again.'}
      </div>
    );
  }
  return (
    <div className="p-3 border border-blue-200 bg-blue-50 text-xs text-[#141413] rounded space-y-2">
      <div className="font-bold flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-blue-700" />
        {returned === 'success' ? 'Confirming your payment...' : `Waiting for your card payment (${amount})`}
      </div>
      {info.attemptFailed && <p className="text-rose-800">The last card attempt did not go through. You can try again or use another card.</p>}
      {returned === 'cancelled' && <p className="text-[#575653]">You left the payment page before paying.</p>}
      <p className="text-[#575653]">
        The order is held for you until {new Date(info.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; after that it is cancelled.
      </p>
      {info.payUrl && /^https:\/\//i.test(info.payUrl) && (
        <a
          href={info.payUrl}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold rounded"
        >
          <CreditCard className="w-4 h-4" /> Pay {amount} now
        </a>
      )}
    </div>
  );
};
