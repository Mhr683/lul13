import React, { useState } from 'react';
import { Copy, Download, KeyRound, Lock } from 'lucide-react';

// Order page: downloads and licence keys of digital / software items. The server sends them only after
// the payment is confirmed (server.ts, /api/orders/track); before that a "waiting for payment" note.

interface Delivery {
  productId: string;
  name: string;
  link?: string;
  note?: string;
  keys?: string[];
}

export const OrderDownloads: React.FC<{ order: any }> = ({ order }) => {
  const [copied, setCopied] = useState('');
  if (!order || !('deliveries' in order)) return null;
  const list: Delivery[] | null = order.deliveries;
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        setTimeout(() => setCopied(''), 1500);
      },
      () => {}
    );
  };

  if (!list) {
    return (
      <div className="p-4 rounded border border-sky-200 bg-sky-50 flex items-start gap-3">
        <Lock className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong className="block text-sm">Your downloads open after payment</strong>
          As soon as the store confirms your payment, the download link{' '}
          {(order.items || []).some((i: any) => i.productType === 'SOFTWARE') ? 'and licence key ' : ''}appear here. Keep this page link.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded border border-emerald-300 bg-emerald-50/70 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
        <Download className="w-4 h-4" /> Your downloads
      </div>
      {list.length === 0 && <p className="text-xs text-emerald-900">The seller will send your files shortly.</p>}
      {list.map((d) => (
        <div key={d.productId} className="bg-white rounded-lg border border-emerald-200 p-3 space-y-2">
          <div className="text-[13px] font-semibold text-[#141413]">{d.name}</div>
          {d.link && (
            <a
              href={d.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E7A43] text-white text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          )}
          {d.keys?.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
              <code className="flex-1 min-w-0 px-2 py-1 rounded bg-[#F1EAFE] text-[12px] text-[#3B1D7A] break-all select-all">{k}</code>
              <button type="button" onClick={() => copy(k)} className="p-1.5 rounded border border-black/10 cursor-pointer" aria-label="Copy key">
                {copied === k ? <span className="text-[10px] font-bold text-emerald-700">Copied</span> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
          {d.note && <p className="text-[12px] text-[#3A3936] whitespace-pre-line">{d.note}</p>}
          {!d.link && !d.keys?.length && !d.note && <p className="text-[12px] text-[#575653]">The seller will send this to you shortly.</p>}
        </div>
      ))}
    </div>
  );
};
