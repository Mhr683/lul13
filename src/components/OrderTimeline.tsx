import React from 'react';
import { CheckCircle2, Circle, MapPin, Truck, XCircle, Banknote, ExternalLink } from 'lucide-react';
import type { Order, OrderTrackingEvent } from '../types/store';
import { generateCourierTrackingUrl } from '../services/shippingService';

// Customer-facing order progress: the step bar, the delivery/payment reminder and the tracking history.

const STEPS: { label: string; statuses: string[] }[] = [
  { label: 'Order received', statuses: ['PENDING_CONFIRMATION', 'PENDING', 'QUOTE_REQUESTED', 'QUOTE_READY', 'QUOTE_ACCEPTED'] },
  { label: 'Confirmed', statuses: ['CONFIRMED', 'PROCESSING'] },
  { label: 'Packed', statuses: ['PACKED'] },
  { label: 'Shipped', statuses: ['SHIPPED'] },
  { label: 'Out for delivery', statuses: ['OUT_FOR_DELIVERY'] },
  { label: 'Delivered', statuses: ['DELIVERED'] },
];

const STOPPED: Record<string, string> = {
  CANCELLED: 'This order has been cancelled.',
  RETURNED: 'This order has been returned.',
  REFUNDED: 'The payment for this order has been refunded.',
  QUOTE_REJECTED: 'The shipping quote was declined.',
  QUOTE_EXPIRED: 'The shipping quote has expired.',
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const formatAmount = (order: Order) =>
  `${order.currency || 'PKR'} ${Math.round(Number(order.total) || 0).toLocaleString('en-PK')}`;

export const OrderTimeline: React.FC<{ order: Order; compact?: boolean }> = ({ order, compact = false }) => {
  const stoppedMessage = STOPPED[order.status];
  const currentStep = STEPS.findIndex((s) => s.statuses.includes(order.status));
  const isCod = order.paymentMethod === 'COD';
  const paid = order.paymentStatus === 'PAID';
  const events: OrderTrackingEvent[] = Array.isArray(order.trackingEvents) ? [...order.trackingEvents].reverse() : [];
  const latestLocation = events.find((e) => e.location)?.location;
  const courierUrl = order.trackingNumber ? generateCourierTrackingUrl(order.courierName || '', order.trackingNumber) : '';

  return (
    <div className="space-y-4">
      {stoppedMessage ? (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{stoppedMessage}</span>
        </div>
      ) : (
        <ol className="grid grid-cols-6 gap-1" aria-label="Order progress">
          {STEPS.map((step, i) => {
            const done = currentStep >= 0 && i <= currentStep;
            const current = i === currentStep;
            return (
              <li key={step.label} className="flex flex-col items-center text-center gap-1 min-w-0">
                <div className="flex items-center w-full">
                  <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done ? 'bg-emerald-600' : 'bg-black/15'}`} />
                  {done ? (
                    <CheckCircle2 className={`w-5 h-5 shrink-0 ${current ? 'text-emerald-700' : 'text-emerald-600'}`} />
                  ) : (
                    <Circle className="w-5 h-5 shrink-0 text-black/25" />
                  )}
                  <div
                    className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'invisible' : i < currentStep ? 'bg-emerald-600' : 'bg-black/15'}`}
                  />
                </div>
                <span
                  className={`text-[10px] sm:text-[11px] leading-tight ${
                    current ? 'font-bold text-emerald-800' : done ? 'font-semibold text-[#141413]' : 'text-[#575653]'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* What the customer should expect next */}
      {!stoppedMessage && order.status === 'OUT_FOR_DELIVERY' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-400 text-amber-950 text-xs">
          <Truck className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="block">Aaj ya kal tak deliver ho jayega. / Arriving today or tomorrow.</strong>
            {isCod && !paid ? (
              <span className="flex items-center gap-1 mt-1">
                <Banknote className="w-3.5 h-3.5" /> Please keep <strong>{formatAmount(order)}</strong> cash ready for the rider.
              </span>
            ) : (
              <span className="block mt-1">Payment received. Nothing to pay on delivery.</span>
            )}
          </div>
        </div>
      )}
      {!stoppedMessage && order.status === 'SHIPPED' && (
        <div className="p-3 bg-sky-50 border border-sky-300 text-sky-950 text-xs">
          On the way{latestLocation ? <> · last seen at <strong>{latestLocation}</strong></> : ''}. Usually 2–4 working days.
          {isCod && !paid && <> Keep <strong>{formatAmount(order)}</strong> ready for cash on delivery.</>}
        </div>
      )}

      {courierUrl && (
        <a
          href={courierUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {order.courierName || 'Courier'} par track karein ({order.trackingNumber})
        </a>
      )}

      {!compact && events.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-[#141413] mb-2">Tracking history</h4>
          <ul className="space-y-2.5 border-l-2 border-black/10 pl-4">
            {events.map((ev, idx) => (
              <li key={`${ev.at}-${idx}`} className="relative text-xs">
                <span
                  className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-emerald-600' : 'bg-black/25'}`}
                />
                <div className="text-[#141413]">
                  {ev.location && (
                    <span className="inline-flex items-center gap-1 font-semibold mr-1">
                      <MapPin className="w-3 h-3" />
                      {ev.location} ·
                    </span>
                  )}
                  {ev.note}
                </div>
                <div className="text-[10px] text-[#575653]">{formatWhen(ev.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
