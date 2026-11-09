import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Facebook, MessageCircle, Share2 } from 'lucide-react';

// Share one product: WhatsApp, Facebook, copy link, or the phone's own share menu. The link is
// /p/<productId> on the store: chat apps show the product's picture, name and price as a preview
// (server.ts) and the customer lands on the product page.

/**
 * The customer store's address. Seller Center and the admin app have their own address: their own
 * port on this computer (3001 / 3002) and their own subdomain online (seller. / admin.<domain>).
 */
export const storeOrigin = () => {
  const { protocol, hostname, port } = window.location;
  const storePort = port === '3001' || port === '3002' ? '3000' : port;
  const storeHost = hostname.replace(/^(seller|admin)\./i, '');
  return `${protocol}//${storeHost}${storePort ? `:${storePort}` : ''}`;
};

export const productShareUrl = (productId: string) => `${storeOrigin()}/p/${encodeURIComponent(productId)}`;

/**
 * Share icon for the top-left corner of a product card's picture (the wishlist heart sits top-right).
 * Put it inside a `relative` box next to the picture (not inside an overflow-hidden one), so the menu
 * can open below the picture. Clicks on it do not open the product.
 */
export const CardShareButton: React.FC<{ productId: string; productName: string; price?: number; showToast?: (msg: string) => void }> = (props) => (
  <div className="absolute top-1 left-1 sm:top-3 sm:left-3 z-20" onClick={(e) => e.stopPropagation()}>
    <ShareProductButton
      {...props}
      variant="icon"
      align="left"
      iconClassName="w-3.5 h-3.5 sm:w-4 sm:h-4"
      className="p-1 sm:p-2 bg-white/90 text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer shadow-sm"
    />
  </div>
);

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
  iconClassName?: string;
  showToast?: (msg: string) => void;
}> = ({
  productId,
  productName,
  price,
  label = 'Share',
  className = '',
  variant = 'button',
  align = 'right',
  iconClassName = 'w-[18px] h-[18px]',
  showToast,
}) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is drawn on the page itself (not inside the card), at the button's place: cards can cut off
  // what sticks out of them (overflow, content-visibility), which hid the menu in Seller Center
  const [menuPos, setMenuPos] = useState<React.CSSProperties>({});
  const toggle = () => {
    if (!open && boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      const width = 192;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, align === 'left' ? r.left : r.right - width));
      // Opens upwards when there is no room below (e.g. above a phone's bottom bar)
      const below = window.innerHeight - r.bottom > 260;
      setMenuPos(below ? { left, top: r.bottom + 4, width } : { left, bottom: window.innerHeight - r.top + 4, width });
    }
    setOpen((o) => !o);
  };
  const url = productShareUrl(productId);
  const text = `${productName}${price ? ` - PKR ${Number(price).toLocaleString('en-PK')}` : ''}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    // The menu stays where it opened, so it closes when the page moves
    const closeNow = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
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
            toggle();
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
          <Share2 className={iconClassName} />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={className || 'px-3 py-1.5 border border-black/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-black bg-white'}
        >
          <Share2 className="w-3.5 h-3.5" /> {label}
        </button>
      )}
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={menuPos}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[120] bg-white border border-black/15 rounded-lg shadow-xl py-1"
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
        </div>,
        document.body
      )}
    </div>
  );
};
