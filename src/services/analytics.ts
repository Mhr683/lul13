// Store traffic tracking (customer store only). Sends small batches to /api/track/events:
//   pv   page view            imp  product shown on screen (once per product per page view)
//   clk  click on a product   view product page opened
//   cart added to cart        chk  checkout started
// The visitor is a random id on this device (no name, phone or email). The traffic source is worked
// out once per visit: Meta / Google / TikTok ads, organic Facebook / Instagram, WhatsApp (and
// Refer & Earn links), search engines, other sites, or direct. The server adds everything up (server/analytics.ts).

type Ev = { t: string; p?: string; n?: number };

const isStore = () => typeof window !== 'undefined' && !/^\/(seller|admin)(\/|$)/i.test(window.location.pathname);

const visitorId = () => {
  try {
    let v = localStorage.getItem('vid_v1');
    if (!v || !/^[a-f0-9]{16,64}$/.test(v)) {
      const b = new Uint8Array(12);
      crypto.getRandomValues(b);
      v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('vid_v1', v);
    }
    return v;
  } catch {
    return '';
  }
};

// Paid ads are told apart from organic traffic by their click ids (fbclid / gclid / ttclid) or by
// utm_medium=cpc|paid|ads; utm_campaign (campaign name or id) links orders to an ad campaign.
const PAID = /cpc|ppc|paid|ads?\b|cpm/;
const detectAttribution = (): { source: string; campaign: string } => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('attr_v1') || 'null');
    if (saved?.source) return saved;
  } catch {}
  const q = new URLSearchParams(window.location.search);
  const src = (q.get('utm_source') || '').toLowerCase();
  const medium = (q.get('utm_medium') || '').toLowerCase();
  const campaign = (q.get('utm_campaign') || q.get('campaign_id') || '').slice(0, 80);
  let ref = '';
  try {
    ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
  } catch {}
  if (ref === window.location.hostname) ref = '';
  let s = 'direct';
  if (q.get('ttclid') || (/tiktok/.test(src) && (PAID.test(medium) || campaign))) s = 'tiktok';
  else if (q.get('gclid') || q.get('gbraid') || q.get('wbraid') || (/google|youtube/.test(src) && PAID.test(medium))) s = 'google';
  else if (/facebook|instagram|fb|ig|meta/.test(src) && (PAID.test(medium) || campaign)) s = 'meta';
  else if (/whatsapp|^wa$/.test(src) || /whatsapp|wa\.me/.test(ref) || q.get('ref')) s = 'whatsapp';
  else if (/facebook|instagram|fb|ig|meta|tiktok/.test(src) || q.get('fbclid') || /facebook|instagram|fb\.com|l\.messenger|tiktok/.test(ref)) s = 'social';
  else if (/google|bing|search|youtube/.test(src) || /google\.|bing\.|yahoo\.|duckduckgo|yandex|youtube/.test(ref)) s = 'search';
  else if (ref || src) s = 'other';
  // Meta's click id makes a Facebook / Instagram ad click (CAPI uses it to match the purchase)
  if (q.get('fbclid') && (PAID.test(medium) || campaign)) s = 'meta';
  const attr = { source: s, campaign: s === 'direct' ? '' : campaign, ...(q.get('fbclid') ? { fbclid: q.get('fbclid')!.slice(0, 200) } : {}) };
  try {
    sessionStorage.setItem('attr_v1', JSON.stringify(attr));
  } catch {}
  return attr;
};

/** Where this visit came from (sent with the order so ads get credit for their sales) */
export const getAttribution = () => {
  try {
    return detectAttribution();
  } catch {
    return { source: 'direct', campaign: '' };
  }
};

let queue: Ev[] = [];
let source = '';
let started = false;
const shown = new Set<string>();

const send = (useBeacon = false) => {
  if (!queue.length) return;
  const v = visitorId();
  if (!v) {
    queue = [];
    return;
  }
  const body = JSON.stringify({ v, s: source, e: queue.splice(0, 200) });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/events', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {}
  fetch('/api/track/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
};

const push = (e: Ev) => {
  if (!isStore()) return;
  start();
  queue.push(e);
  if (queue.length >= 150) send();
};

// Product cards carry data-pid: they count as an impression when half visible, and a click on them
// counts as a click
function start() {
  if (started || typeof window === 'undefined' || !isStore()) return;
  started = true;
  source = getAttribution().source;
  setInterval(() => send(), 10_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && send(true));
  window.addEventListener('pagehide', () => send(true));
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-pid]') as HTMLElement | null;
      if (el?.dataset.pid) push({ t: 'clk', p: el.dataset.pid });
    },
    true
  );
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const pid = (en.target as HTMLElement).dataset.pid;
        io.unobserve(en.target);
        if (pid && !shown.has(pid)) {
          shown.add(pid);
          push({ t: 'imp', p: pid });
        }
      }
    },
    { threshold: 0.5 }
  );
  const observeAll = (root: ParentNode) => root.querySelectorAll?.('[data-pid]').forEach((el) => io.observe(el));
  observeAll(document);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => n instanceof HTMLElement && (n.dataset?.pid ? io.observe(n) : observeAll(n)));
  }).observe(document.body, { childList: true, subtree: true });
}

export const track = {
  /** A new screen of the store (home, catalog, product, checkout...); impressions count again per screen */
  pageView: () => {
    shown.clear();
    push({ t: 'pv' });
  },
  productView: (productId: string) => push({ t: 'view', p: productId }),
  addToCart: (productId: string, qty = 1) => push({ t: 'cart', p: productId, n: qty }),
  checkoutStarted: () => push({ t: 'chk' }),
};
