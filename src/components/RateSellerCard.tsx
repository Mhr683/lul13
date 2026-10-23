import React, { useEffect, useState } from 'react';
import { Camera, Star } from 'lucide-react';
import { auth } from '../lib/firebase';
import { forgetShopInfo } from './SellerRating';
import { isVideoUrl } from './ReviewMedia';

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
  // Photos / short videos of the product (up to 4), uploaded one by one before the review is sent
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const addMedia = async (files: FileList | null) => {
    const list = Array.from(files || []).slice(0, 4 - media.length);
    if (!list.length) return;
    setUploading(true);
    setError('');
    try {
      const authToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
      for (const f of list) {
        const isVideo = f.type.startsWith('video/');
        if (!isVideo && f.size > 8 * 1024 * 1024) throw new Error(`${f.name}: photos can be at most 8 MB.`);
        if (isVideo && f.size > 20 * 1024 * 1024) throw new Error(`${f.name}: videos can be at most 20 MB (about 30 seconds).`);
        const res = await fetch('/api/feedback/upload', {
          method: 'POST',
          headers: {
            'X-Order-Number': orderNumber,
            'X-Order-Token': token,
            'Content-Type': f.type || 'application/octet-stream',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: f,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Could not upload the file.');
        setMedia((m) => [...m, data.url].slice(0, 4));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

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
        body: JSON.stringify({ orderNumber, token, rating, comment, media }),
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
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {media.map((u) => (
            <div key={u} className="relative w-16 h-16 border border-black/15 bg-[#F7F6F2] overflow-hidden">
              {isVideoUrl(u) ? (
                <video src={`${u}#t=0.5`} muted preload="metadata" className="w-full h-full object-cover" />
              ) : (
                <img src={u} alt="" className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => setMedia((m) => m.filter((x) => x !== u))}
                aria-label="Remove"
                className="absolute top-0 right-0 w-5 h-5 bg-black/70 text-white text-[11px] leading-5 cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
          {media.length < 4 && (
            <label className="w-16 h-16 border border-dashed border-black/30 flex flex-col items-center justify-center text-[10px] text-[#575653] cursor-pointer hover:border-black">
              <Camera className="w-4 h-4" />
              {uploading ? '...' : 'Add'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  addMedia(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <p className="text-[11px] text-[#575653]">Add up to 4 photos or a short video of the product (optional). They are shown with your review.</p>
      </div>
      {error && <p className="text-rose-700 font-semibold">{error}</p>}
      <button
        type="button"
        disabled={sending || uploading || !rating}
        onClick={send}
        className="px-5 py-2 bg-[#0E7A43] text-white font-bold disabled:opacity-50 cursor-pointer"
      >
        {sending ? 'Sending...' : 'Submit review'}
      </button>
    </div>
  );
};
