import React, { useState } from 'react';
import { Truck, Printer } from 'lucide-react';
import { courierApi, openCourierLabel } from '../services/courierClient';
import { HelpDot } from './HelpDot';

export interface BookedParcel {
  courierName: string;
  trackingNumber: string;
}

// "Book with courier" on an order: the courier gives the tracking number (and the label) at once,
// so nothing has to be typed. Used in Seller Center and in the admin orders list.
export const CourierBookBox: React.FC<{
  orderId: string;
  couriers: Array<{ id: string; label: string }>;
  defaultCourier?: string | null;
  /** '/api/couriers' (admin) or '/api/seller/couriers' */
  apiBase: string;
  defaultWeightKg?: number;
  booking?: { courier?: string; trackingNumber?: string } | null;
  onBooked: (p: BookedParcel) => void | Promise<void>;
}> = ({ orderId, couriers, defaultCourier, apiBase, defaultWeightKg, booking, onBooked }) => {
  const [courier, setCourier] = useState(defaultCourier || couriers[0]?.id || '');
  const [weight, setWeight] = useState(String(defaultWeightKg && defaultWeightKg > 0 ? defaultWeightKg : 0.5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const printLabel = async () => {
    setError('');
    try {
      await openCourierLabel(`${apiBase}/label?orderId=${encodeURIComponent(orderId)}`);
    } catch (e: any) {
      setError(e?.message || 'The label could not be opened.');
    }
  };

  if (booking?.trackingNumber) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 bg-emerald-50 border border-emerald-400 text-emerald-900 font-semibold">
          Booked: {booking.courier} · <span className="font-mono">{booking.trackingNumber}</span>
        </span>
        <button type="button" onClick={printLabel} className="px-3 py-1.5 border border-black/30 font-semibold inline-flex items-center gap-1 cursor-pointer">
          <Printer className="w-3.5 h-3.5" /> Print label
        </button>
        {error && <span className="text-rose-700 w-full">{error}</span>}
      </div>
    );
  }
  if (!couriers.length) return null;

  const book = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await courierApi<{ courierName: string; trackingNumber: string }>(`${apiBase}/book`, {
        method: 'POST',
        body: JSON.stringify({ orderId, courier, weightKg: Number(weight) || 0.5 }),
      });
      await onBooked({ courierName: r.courierName, trackingNumber: r.trackingNumber });
    } catch (e: any) {
      setError(e?.message || 'The parcel was not booked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-2.5 bg-sky-50 border border-sky-300 space-y-2 text-xs">
      <div className="font-semibold text-sky-950 flex items-center gap-1">
        <Truck className="w-3.5 h-3.5" /> Book with courier (tracking number comes automatically) <HelpDot id="seller.order.courier" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={courier} onChange={(e) => setCourier(e.target.value)} className="px-2 py-1.5 border border-black/20 bg-white">
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1">
          Weight
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-16 px-2 py-1.5 border border-black/20 bg-white"
          />
          kg
        </label>
        <button
          type="button"
          disabled={busy || !courier}
          onClick={book}
          className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer disabled:opacity-50"
        >
          {busy ? 'Booking...' : 'Book & ship'}
        </button>
      </div>
      {error && <p className="text-rose-700">{error}</p>}
    </div>
  );
};
