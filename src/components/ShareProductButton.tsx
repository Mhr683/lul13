import React, { useEffect, useRef, useState } from 'react';
import { Copy, Facebook, MessageCircle, Share2 } from 'lucide-react';

// Share one product: WhatsApp, Facebook, copy link, or the phone's own share menu. The link is
// /p/<productId> on the store: chat apps show the product's picture, name and price as a preview
// (server.ts) and the customer lands on the product page.

/** The customer store's address. Seller Center and the admin app run on their own ports locally. */
export const storeOrigin = () => {
  const { protocol, hostname, port } = window.location;
  const storePort = port === '3001' || port === '3002' ? '3000' : port;
  return `${protocol}//${hostname}${storePort ? `:${storePort}` : ''}`;
};

export const productShareUrl = (productId: string) => `${storeOrigin()}/p/${encodeURIComponent(productId)}`;

export const ShareProductButton: React.FC<{
  productId: string;
  productName: string;
  price?: number;
  label?: string;
  className?: string;
  /** 'icon': a round share icon, e.g. on the corner of the product picture */
  variant?: 'button' | 'icon';
  /** Which side the menu opens towards */
  align?: 'left' | 'right';
  showToast?: (msg: string) => void;
}> = ({ productId, productName, price, label = 'Share', className = '', variant = 'button', align = 'right', showToast }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const url = productShareUrl(productId);
  const text = `${productName}${price ? ` - PKR ${Number(price).toLocaleString('en-PK')}` : ''}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast?.('Product link copied.');
    } catch {
      window.prompt('Copy this link:', url);
    }
    setOpen(false);
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: productName, text, url });
    } catch {
      // closed the share sheet
    }
    setOpen(false);
  };
  const item = 'w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2 hover:bg-black/[0.04] cursor-pointer';

  return (
    <div className="relative inline-block" ref={boxRef}>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Share this product"
          title="Share this product"
          className={
            className ||
            'w-10 h-10 rounded-full bg-white/95 border border-black/10 shadow-md flex items-center justify-center text-[#141413] hover:bg-white hover:scale-105 transition-transform cursor-pointer'
          }
        >
          <Share2 className="w-[18px] h-[18px]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={className || 'px-3 py-1.5 border border-black/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-black bg-white'}
        >
          <Share2 className="w-3.5 h-3.5" /> {label}
        </button>
      )}
      {open && (
        <div
          role="menu"
          className={`absolute z-40 ${align === 'left' ? 'left-0' : 'right-0'} mt-1 w-48 bg-white border border-black/15 shadow-lg py-1`}
        >
          <a
            role="menuitem"
            href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={item}
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" /> WhatsApp
          </a>
          <a
            role="menuitem"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={item}
          >
            <Facebook className="w-4 h-4 text-[#1877F2]" /> Facebook
          </a>
          <button role="menuitem" type="button" onClick={copy} className={item}>
            <Copy className="w-4 h-4" /> Copy link
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button role="menuitem" type="button" onClick={nativeShare} className={item}>
              <Share2 className="w-4 h-4" /> More apps...
            </button>
          )}
        </div>
      )}
    </div>
  );
};
