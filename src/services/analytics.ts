// Store traffic tracking (customer store only). Sends small batches to /api/track/events:
//   pv   page view            imp  product shown on screen (once per product per page view)
//   clk  click on a product   view product page opened
//   cart added to cart        chk  checkout started
// The visitor is a random id on this device (no name, phone or email). The traffic source is worked
// out once per visit: Facebook / Instagram, WhatsApp (and Refer & Earn links), search engines,
// other sites, or direct. The server adds everything up (server/analytics.ts).

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

const detectSource = () => {
  try {
    const saved = sessionStorage.getItem('src_v1');
    if (saved) return saved;
  } catch {}
  const q = new URLSearchParams(window.location.search);
  const utm = `${q.get('utm_source') || ''} ${q.get('utm_medium') || ''}`.toLowerCase();
  let ref = '';
  try {
    ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
  } catch {}
  if (ref === window.location.hostname) ref = '';
  let s = 'direct';
  if (/whatsapp|wa\b/.test(utm) || /whatsapp|wa\.me/.test(ref) || q.get('ref')) s = 'whatsapp';
  else if (/facebook|instagram|fb|ig|meta/.test(utm) || q.get('fbclid') || /facebook|instagram|fb\.com|l\.messenger/.test(ref)) s = 'social';
  else if (/google|bing|search/.test(utm) || q.get('gclid') || /google\.|bing\.|yahoo\.|duckduckgo|yandex/.test(ref)) s = 'search';
  else if (ref || utm.trim()) s = 'other';
  try {
    sessionStorage.setItem('src_v1', s);
  } catch {}
  return s;
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
  source = detectSource();
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
