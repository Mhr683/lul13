import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, ImagePlus, X, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { Order } from '../types/store';
import { RETURN_WINDOW_DAYS } from '../data/policies';

// Customer Protection Policy on the order tracking page: within 7 days of delivery the buyer can ask
// for a return or replacement (with pictures). The store reviews it; the result shows here.

const REASONS = [
  { id: 'DAMAGED', label: 'Damaged or defective' },
  { id: 'WRONG_ITEM', label: 'Wrong item, colour or size' },
  { id: 'QUALITY', label: 'Quality does not match the description' },
  { id: 'FAKE', label: 'Fake or replica product' },
] as const;

type RequestInfo = { status: 'OPEN' | 'APPROVED' | 'REJECTED'; reason: string; resolution: string; createdAt: string; decisionNote: string };

const DAY = 24 * 60 * 60 * 1000;
const deliveredAt = (o: Order) => {
  const ev = [...((o as any).trackingEvents || [])].reverse().find((e: any) => e?.status === 'DELIVERED');
  const t = Date.parse(ev?.at || o.updatedAt || '');
  return isNaN(t) ? null : t;
};

async function authHeader(): Promise<Record<string, string>> {
  const t = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const ReturnRequestCard: React.FC<{ order: Order; token: string; onPolicy: () => void }> = ({ order, token, onPolicy }) => {
  const [request, setRequest] = useState<RequestInfo | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<'REFUND' | 'REPLACEMENT'>('REFUND');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/returns/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ orderNumber: order.orderNumber, token }),
        });
        const d = await res.json();
        if (live) setRequest(res.ok ? d.request || null : null);
      } catch {
        if (live) setRequest(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [order.orderNumber, token]);

  if (request === undefined) return null;

  if (request) {
    const tone =
      request.status === 'APPROVED'
        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
        : request.status === 'REJECTED'
        ? 'bg-rose-50 border-rose-300 text-rose-950'
        : 'bg-amber-50 border-amber-300 text-amber-950';
    return (
      <div className={`p-4 border text-xs space-y-1 ${tone}`}>
        <div className="flex items-center gap-2 font-bold text-sm">
          <RotateCcw className="w-4 h-4" />
          {request.resolution === 'REPLACEMENT' ? 'Replacement' : 'Return'} request:{' '}
          {request.status === 'OPEN' ? 'under review' : request.status === 'APPROVED' ? 'approved' : 'declined'}
        </div>
        {request.status === 'OPEN' && <p>We received your request and will review it within 24–48 hours. We will contact you about the pickup.</p>}
        {request.decisionNote && <p>{request.decisionNote}</p>}
      </div>
    );
  }

  const at = deliveredAt(order);
  const daysLeft = order.status === 'DELIVERED' && at ? Math.max(0, Math.ceil((at + RETURN_WINDOW_DAYS * DAY - Date.now()) / DAY)) : 0;
  if (!daysLeft) return null;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    for (const file of Array.from(files).slice(0, 4 - photos.length)) {
      setBusy('Uploading picture...');
      try {
        const res = await fetch('/api/returns/upload', {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-order-number': order.orderNumber, 'x-order-token': token, ...(await authHeader()) },
          body: file,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || 'Could not upload the picture.');
        setPhotos((p) => [...p, d.url].slice(0, 4));
      } catch (err: any) {
        setError(err.message);
      }
    }
    setBusy('');
  };

  const submit = async () => {
    if (!reason) return setError('Choose the reason.');
    if (details.trim().length < 10) return setError('Please describe the problem (at least 10 characters).');
    setBusy('Sending...');
    setError('');
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ orderNumber: order.orderNumber, token, reason, resolution, details, photos }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Could not send your request.');
      setRequest({ status: 'OPEN', reason, resolution, createdAt: new Date().toISOString(), decisionNote: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!open) {
    return (
      <div className="p-4 bg-white border border-black/15 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-5 h-5 text-[#0E7A43] shrink-0" />
          <div>
            <strong className="text-sm text-[#141413]">Problem with your order?</strong>
            <p className="text-[#575653]">
              Damaged, wrong or fake item? You can ask for a return or replacement for {daysLeft} more {daysLeft === 1 ? 'day' : 'days'}.{' '}
              <button type="button" onClick={onPolicy} className="underline cursor-pointer">
                Customer Protection Policy
              </button>
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 bg-[#141413] text-white font-bold cursor-pointer">
          Return or replace
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 bg-white border-2 border-[#141413] space-y-4 text-xs text-[#141413]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Return or replacement — order {order.orderNumber}</h3>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="font-bold">What is wrong?</p>
        {REASONS.map((r) => (
          <label key={r.id} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="return-reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
            {r.label}
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="font-bold">What would you like?</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="return-resolution" checked={resolution === 'REFUND'} onChange={() => setResolution('REFUND')} />
            Refund
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="return-resolution" checked={resolution === 'REPLACEMENT'} onChange={() => setResolution('REPLACEMENT')} />
            Replacement
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-bold">Describe the problem</p>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="e.g. The screen is cracked / I ordered black but received blue"
          className="w-full px-3 py-2 border border-black/20 focus:border-black focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <p className="font-bold">Pictures of the problem (up to 4)</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((src) => (
            <div key={src} className="relative w-16 h-16 border border-black/15">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((x) => x !== src))}
                aria-label="Remove picture"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
              className="w-16 h-16 border-2 border-dashed border-black/25 flex flex-col items-center justify-center text-[10px] text-[#575653] cursor-pointer disabled:opacity-50"
            >
              <ImagePlus className="w-5 h-5" /> Add
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <p className="text-[#575653]">Please keep the product with its packing and tags. Return shipping is free when the mistake was the seller’s.</p>
      {error && <p className="text-rose-700 font-semibold">{error}</p>}
      <button type="button" disabled={!!busy} onClick={submit} className="px-5 py-2 bg-[#0E7A43] text-white font-bold disabled:opacity-50 cursor-pointer">
        {busy || 'Send request'}
      </button>
    </div>
  );
};
