// Meta (Facebook / Instagram) Pixel for the customer store. The Pixel ID comes from the server
// (META_PIXEL_ID in .env, sent with /api/catalog/bootstrap); without it nothing is loaded.
// Product ids are the same as in the catalog feed (/feeds/products.xml), so Meta can show people
// the exact products they looked at ("Anokha Shopping Hub Products" catalog in Commerce Manager).
// Seller Center and the admin panel never load it.

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

let ready = false;
const isStore = () => typeof window !== 'undefined' && !/^\/(seller|admin)(\/|$)/i.test(window.location.pathname) && !/^(seller|admin)\./i.test(window.location.hostname);
const fbq = (...args: unknown[]) => {
  if (!ready) return;
  try {
    (window as any).fbq?.(...args);
  } catch {
    /* a blocked or failed Pixel must never break the store */
  }
};

export function startMetaPixel(pixelId: unknown) {
  const id = String(pixelId || '');
  if (ready || !/^\d{6,20}$/.test(id) || !isStore()) return;
  ready = true;
  const w = window as any;
  if (!w.fbq) {
    // Meta's standard loader: queues calls until fbevents.js has loaded
    const f: Fbq = function (...args: unknown[]) {
      if (f.callMethod) f.callMethod(...args);
      else f.queue!.push(args);
    } as Fbq;
    f.queue = [];
    f.loaded = true;
    f.version = '2.0';
    f.push = f;
    w.fbq = f;
    if (!w._fbq) w._fbq = f;
    // Facebook's file (~200 KB) loads only after the page has shown, so it does not compete with the
    // store's own pictures on slow mobile data; events wait in the queue above until then
    const load = () => {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(s);
    };
    const later = () => setTimeout(load, 3000);
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  }
  w.fbq('init', id);
  w.fbq('track', 'PageView');
}

const product = (id: string, extra: Record<string, unknown> = {}) => ({ content_ids: [id], content_type: 'product', currency: 'PKR', ...extra });

export const metaPixel = {
  /** A new screen of the store (the first one is sent by startMetaPixel) */
  pageView: () => fbq('track', 'PageView'),
  viewContent: (productId: string) => fbq('track', 'ViewContent', product(productId)),
  addToCart: (productId: string, qty = 1) => fbq('track', 'AddToCart', product(productId, { num_items: qty })),
  initiateCheckout: () => fbq('track', 'InitiateCheckout'),
  /** A placed order (not an unpaid card order). The eventID is the same as the server's Conversions
   * API Purchase (server/ads.ts: "order-<orderNumber>"), so Meta counts the order once. */
  purchase: (orderNumber: string, value: number, productIds: string[]) =>
    fbq('track', 'Purchase', { content_ids: productIds, content_type: 'product', currency: 'PKR', value: Math.round(value), num_items: productIds.length }, { eventID: `order-${orderNumber}` }),
};
