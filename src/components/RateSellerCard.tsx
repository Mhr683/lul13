import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { auth } from '../lib/firebase';
import { forgetShopInfo } from './SellerRating';

// Shown on a delivered order: the buyer rates the seller (1-5 stars) and leaves a comment, once.
// The review appears on the seller's shop page, in Seller Center and in the admin's seller report.

export const RateSellerCard: React.FC<{
  orderNumber: string;
  token?: string;
  sellerId?: string;
  sellerName?: string;
}> = ({ orderNumber, token = '', sellerId, sellerName }) => {
  const [rated, setRated] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setChecking(true);
    fetch('/api/feedback/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: [{ orderNumber, token }] }),
    })
      .then((r) => r.json())
      .then((d) => live && setRated(d?.rated?.[orderNumber.toUpperCase()] ?? null))
      .catch(() => {})
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [orderNumber, token]);

  if (checking) return null;
  // Orders sold by the store itself have no marketplace seller; the buyer rates the products
  const isHouse = !sellerId || sellerId === 'house';

  if (rated) {
    return (
      <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2">
        <span className="text-base">{'★'.repeat(rated)}{'☆'.repeat(5 - rated)}</span>
        Thank you! You rated {isHouse ? 'this order' : `${sellerName || 'the seller'} for this order`}.
      </div>
    );
  }

  const labels = ['', 'Very bad', 'Bad', 'OK', 'Good', 'Excellent'];
  const send = async () => {
    if (!rating) return setError('Choose 1 to 5 stars.');
    setSending(true);
    setError('');
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ orderNumber, token, rating, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save your review.');
      if (!isHouse && sellerId) forgetShopInfo(sellerId);
      setRated(rating);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 bg-white border-2 border-[#0E7A43]/40 space-y-3 text-xs text-[#141413]">
      <div>
        <h3 className="text-sm font-bold">
          {isHouse ? 'How was your order?' : `How was your order from ${sellerName || 'this seller'}?`}
        </h3>
        <p className="text-[#575653]">
          {isHouse
            ? 'Your rating is shown on the products you bought and helps other customers choose.'
            : "Your rating helps other customers choose good sellers. It is shown on the products and on the seller's shop page."}
        </p>
      </div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onClick={() => setRating(i)}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            className="p-0.5 cursor-pointer"
          >
            <Star
              className={`w-8 h-8 ${(hover || rating) >= i ? 'text-[#F5A524]' : 'text-[#D6D3CC]'}`}
              fill="currentColor"
              strokeWidth={0}
            />
          </button>
        ))}
        <span className="ml-2 font-bold">{labels[hover || rating]}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={800}
        rows={3}
        placeholder="Tell others about the product, packing and delivery (optional)"
        className="w-full px-3 py-2 border border-black/20 focus:border-black focus:outline-none"
      />
      {error && <p className="text-rose-700 font-semibold">{error}</p>}
      <button
        type="button"
        disabled={sending || !rating}
        onClick={send}
        className="px-5 py-2 bg-[#0E7A43] text-white font-bold disabled:opacity-50 cursor-pointer"
      >
        {sending ? 'Sending...' : 'Submit review'}
      </button>
    </div>
  );
};
