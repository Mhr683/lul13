import crypto from 'crypto';
import type { Express, Request } from 'express';

// International card payments through Tazapay's hosted checkout (cards from most countries,
// settled to the store's Tazapay account). Off until the keys are in .env:
//   TAZAPAY_API_KEY, TAZAPAY_API_SECRET   Tazapay dashboard > Developers > API keys
//   TAZAPAY_WEBHOOK_SECRET                Tazapay dashboard > Settings > Webhooks (reveal)
//   TAZAPAY_ENV=production                leave out for the sandbox (test cards)
//
// Flow: orders/create makes the orders (stock held, payment PENDING) and calls startCheckout,
// which opens one Tazapay session for the whole checkout in USD and sends the customer there.
// Tazapay's webhook, the customer's return to the store, and a half-hourly sweep all call
// syncCheckout, which asks Tazapay for the session's real state (a webhook body is never trusted
// on its own) and then marks the orders paid (emails go out) or, once the session expires
// unpaid, cancels them and puts the stock back.
//
// Database cost: one card_payments document per card checkout (1 write when created, 1 read +
// 1 write per state change); the orders are updated only when the payment state changes.

type Env = { key: string; secret: string; webhookSecret: string; base: string; sandbox: boolean };
const env = (): Env | null => {
  const key = String(process.env.TAZAPAY_API_KEY || '').trim();
  const secret = String(process.env.TAZAPAY_API_SECRET || '').trim();
  if (!key || !secret) return null;
  const sandbox = String(process.env.TAZAPAY_ENV || '').toLowerCase() !== 'production';
  return {
    key,
    secret,
    webhookSecret: String(process.env.TAZAPAY_WEBHOOK_SECRET || '').trim(),
    base: sandbox ? 'https://service-sandbox.tazapay.com' : 'https://service.tazapay.com',
    sandbox,
  };
};

export const CARD_CURRENCY = 'USD';
/** Minutes the payment page stays open (stock is held meanwhile) */
const SESSION_MINUTES = 60;

export type CardPaymentDoc = {
  checkoutId: string;
  gateway: 'TAZAPAY';
  sessionId: string;
  url: string;
  orderIds: string[];
  totalPkr: number;
  amountMinor: number;
  currency: string;
  usdToPkr: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  attemptFailed?: boolean;
  customerEmail: string;
  sandbox: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type Deps = {
  adminDb: FirebaseFirestore.Firestore;
  usdToPkr: () => number;
  /** Payment received: mark the orders and send the confirmation emails */
  onPaid: (orderIds: string[], info: { sessionId: string; amountMinor: number; currency: string }) => Promise<void>;
  /** The session ended unpaid: cancel the orders and put the stock back */
  onExpired: (orderIds: string[], reason: string) => Promise<void>;
  /** A card was declined: the customer can still try again on the same page */
  onAttemptFailed: (orderIds: string[]) => Promise<void>;
};

const storeUrl = () => String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const authHeader = (e: Env) => `Basic ${Buffer.from(`${e.key}:${e.secret}`).toString('base64')}`;

async function tazapay(e: Env, method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(`${e.base}${path}`, {
    method,
    headers: { Authorization: authHeader(e), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === 'error') {
    // Tazapay's message only; keys never appear in logs
    throw new Error(`Tazapay ${res.status}: ${String(json?.message || json?.errors?.[0]?.message || 'request failed').slice(0, 200)}`);
  }
  return json?.data;
}

/** Signature check from Tazapay's docs: HMAC-SHA256 (base64) of event id + raw body + created_at */
export function verifyTazapaySignature(rawBody: string, header: string, secret: string, now = Date.now()) {
  if (!secret || !header) return false;
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const at = Date.parse(event?.created_at || '');
  // Old copies of a real event are refused (10 minutes, as Tazapay suggests)
  if (!Number.isFinite(at) || Math.abs(now - at) > 10 * 60_000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${event.id}${rawBody}${event.created_at}`).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header).trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setupCardPayments(app: Express, d: Deps) {
  const col = () => d.adminDb.collection('card_payments');
  const ready = () => env() !== null;

  /**
   * Opens the payment page for a checkout. Line items are converted to USD cents; when the
   * converted lines cannot add up to the exact total (discounts), one line for the whole order
   * is sent instead, so the gateway always charges exactly the order total.
   */
  async function startCheckout(p: {
    checkoutId: string;
    orderIds: string[];
    orderNumbers: string[];
    totalPkr: number;
    items: Array<{ name: string; quantity: number; price: number }>;
    customer: { name: string; email: string; country: string; callingCode?: string; phone?: string };
    address: { line1: string; line2?: string; city: string; state?: string; country: string; postalCode?: string };
    trackUrl: string;
  }): Promise<{ url: string }> {
    const e = env();
    if (!e) throw new Error('Card payments are not set up.');
    const rate = d.usdToPkr();
    if (!(rate > 0)) throw new Error('No exchange rate available for card payments right now.');
    const toMinor = (pkr: number) => Math.round((pkr / rate) * 100);
    const amountMinor = Math.max(50, Math.ceil((p.totalPkr / rate) * 100));
    let items = p.items.map((it) => ({ name: it.name.slice(0, 120), quantity: it.quantity, amount: Math.max(1, toMinor(it.price)) }));
    const itemsSum = items.reduce((s, it) => s + it.amount * it.quantity, 0);
    if (itemsSum < amountMinor) items.push({ name: 'Shipping, taxes and fees', quantity: 1, amount: amountMinor - itemsSum });
    else if (itemsSum > amountMinor) items = [{ name: `Order ${p.orderNumbers.join(', ')}`.slice(0, 120), quantity: 1, amount: amountMinor }];

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
    const back = `${storeUrl()}${p.trackUrl}${p.trackUrl.includes('?') ? '&' : '?'}checkout=${encodeURIComponent(p.checkoutId)}`;
    const session = await tazapay(e, 'POST', '/v3/checkout', {
      invoice_currency: CARD_CURRENCY,
      amount: amountMinor,
      customer_details: {
        name: p.customer.name.slice(0, 100),
        email: p.customer.email,
        country: p.customer.country,
        ...(p.customer.callingCode && p.customer.phone
          ? { phone: { calling_code: p.customer.callingCode.replace(/\D/g, ''), number: p.customer.phone.replace(/\D/g, '') } }
          : {}),
      },
      shipping_details: {
        name: p.customer.name.slice(0, 100),
        address: {
          line1: p.address.line1.slice(0, 200),
          ...(p.address.line2 ? { line2: p.address.line2.slice(0, 200) } : {}),
          city: p.address.city.slice(0, 80),
          ...(p.address.state ? { state: p.address.state.slice(0, 80) } : {}),
          country: p.address.country,
          ...(p.address.postalCode ? { postal_code: p.address.postalCode.slice(0, 20) } : {}),
        },
      },
      items,
      payment_methods: ['card'],
      success_url: `${back}&payment=success`,
      cancel_url: `${back}&payment=cancelled`,
      webhook_url: `${storeUrl()}/api/payments/tazapay/webhook`,
      reference_id: p.checkoutId,
      transaction_description: `Order ${p.orderNumbers.join(', ')}`.slice(0, 200),
      expires_at: expiresAt,
    });
    if (!session?.id || !session?.url) throw new Error('Tazapay did not return a payment page.');
    const doc: CardPaymentDoc = {
      checkoutId: p.checkoutId,
      gateway: 'TAZAPAY',
      sessionId: String(session.id),
      url: String(session.url),
      orderIds: p.orderIds,
      totalPkr: p.totalPkr,
      amountMinor,
      currency: CARD_CURRENCY,
      usdToPkr: rate,
      status: 'PENDING',
      customerEmail: p.customer.email,
      sandbox: e.sandbox,
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await col().doc(p.checkoutId).set(doc);
    return { url: doc.url };
  }

  // Several callers can ask about the same checkout at once (webhook + returning customer)
  const inFlight = new Map<string, Promise<CardPaymentDoc | null>>();
  function syncCheckout(checkoutId: string, hint?: { attemptFailed?: boolean }) {
    let p = inFlight.get(checkoutId);
    if (!p) {
      p = doSync(checkoutId, hint).finally(() => inFlight.delete(checkoutId));
      inFlight.set(checkoutId, p);
    }
    return p;
  }

  async function doSync(checkoutId: string, hint?: { attemptFailed?: boolean }): Promise<CardPaymentDoc | null> {
    const e = env();
    if (!e) return null;
    const ref = col().doc(checkoutId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const pay = snap.data() as CardPaymentDoc;
    if (pay.status !== 'PENDING') return pay;
    const session = await tazapay(e, 'GET', `/v3/checkout/${encodeURIComponent(pay.sessionId)}`);
    const now = new Date().toISOString();
    const paidMinor = Number(session?.amount_paid) || 0;
    const paid =
      session?.payment_status === 'paid' &&
      String(session?.invoice_currency || '').toUpperCase() === pay.currency &&
      paidMinor >= pay.amountMinor &&
      String(session?.reference_id || checkoutId) === checkoutId;
    if (paid) {
      // Status first, so a second caller never sends the emails twice
      const won = await d.adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if ((fresh.data() as CardPaymentDoc)?.status !== 'PENDING') return false;
        tx.update(ref, { status: 'PAID', paidMinor, updatedAt: now });
        return true;
      });
      if (won) await d.onPaid(pay.orderIds, { sessionId: pay.sessionId, amountMinor: paidMinor, currency: pay.currency });
      return { ...pay, status: 'PAID', updatedAt: now };
    }
    if (session?.payment_status === 'paid') {
      // Paid, but not the amount / currency we asked for: leave it for the store to look at
      console.warn(`[card] checkout ${checkoutId}: paid ${paidMinor} ${session?.invoice_currency}, expected ${pay.amountMinor} ${pay.currency}`);
      await ref.update({ status: 'FAILED', mismatch: true, updatedAt: now });
      return { ...pay, status: 'FAILED' };
    }
    const expired = session?.status === 'expired' || Date.parse(pay.expiresAt) + 5 * 60_000 < Date.now();
    if (expired) {
      const won = await d.adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if ((fresh.data() as CardPaymentDoc)?.status !== 'PENDING') return false;
        tx.update(ref, { status: 'EXPIRED', updatedAt: now });
        return true;
      });
      if (won) await d.onExpired(pay.orderIds, 'The card payment was not completed in time, so the order was cancelled.');
      return { ...pay, status: 'EXPIRED' };
    }
    if (hint?.attemptFailed && !pay.attemptFailed) {
      await ref.update({ attemptFailed: true, updatedAt: now });
      await d.onAttemptFailed(pay.orderIds);
      return { ...pay, attemptFailed: true };
    }
    return pay;
  }

  // The checkout asks once whether to offer card payment (no database read)
  app.get('/api/payments/card-config', (_req, res) => {
    const e = env();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ enabled: !!e, currency: CARD_CURRENCY, sandbox: e?.sandbox ?? false, usdToPkr: e ? d.usdToPkr() : 0 });
  });

  // Tazapay → store. The signature is checked on the exact bytes received, then Tazapay is asked
  // for the session's state; anything else is answered 200 so Tazapay stops retrying.
  app.post('/api/payments/tazapay/webhook', async (req: Request, res) => {
    const e = env();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!e || !e.webhookSecret || !verifyTazapaySignature(raw, String(req.headers['signature'] || ''), e.webhookSecret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    let event: any = {};
    try {
      event = JSON.parse(raw);
    } catch {}
    const type = String(event?.type || '');
    const data = event?.data || {};
    res.json({ received: true });
    if (!/^(checkout\.(paid|expired)|payment_attempt\.(succeeded|failed))$/.test(type)) return;
    (async () => {
      // checkout.* carries our reference_id; a payment attempt names its checkout session (chk_...)
      let checkoutId = type.startsWith('checkout.') ? String(data.reference_id || '') : '';
      if (!checkoutId) {
        const sessionId = String((typeof data.checkout === 'string' ? data.checkout : data.checkout?.id) || '');
        if (sessionId) {
          const q = await col().where('sessionId', '==', sessionId.slice(0, 80)).limit(1).get();
          checkoutId = q.empty ? '' : q.docs[0].id;
        }
      }
      if (checkoutId) await syncCheckout(checkoutId.slice(0, 80), { attemptFailed: type === 'payment_attempt.failed' });
    })().catch((err) => console.error(`[card] webhook ${type} failed:`, err?.message));
  });

  // The customer came back from the payment page (or the tracking page asks): current state,
  // and the payment page link while it can still be paid. Needs the order's tracking token.
  app.get('/api/payments/card/:checkoutId', async (req, res) => {
    const checkoutId = String(req.params.checkoutId).slice(0, 80);
    const token = String(req.query.token || '');
    try {
      const snap = await col().doc(checkoutId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Payment not found.' });
      const first = await d.adminDb.collection('orders').doc((snap.data() as CardPaymentDoc).orderIds[0]).get();
      const t = String(first.data()?.orderAccessToken || '');
      if (!token || t.length !== token.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token))) {
        return res.status(403).json({ error: 'Not allowed.' });
      }
      const pay = (await syncCheckout(checkoutId).catch(() => null)) || (snap.data() as CardPaymentDoc);
      res.json({
        status: pay.status,
        attemptFailed: !!pay.attemptFailed,
        amount: pay.amountMinor / 100,
        currency: pay.currency,
        payUrl: pay.status === 'PENDING' ? pay.url : null,
        expiresAt: pay.expiresAt,
      });
    } catch (err: any) {
      console.error('[card] status failed:', err?.message);
      res.status(503).json({ error: 'Could not check the payment. Please try again.' });
    }
  });

  // Safety net when a webhook never arrives: every 30 minutes, pending payments whose page has
  // closed are checked once (a handful of reads; none when there are no card orders)
  setInterval(async () => {
    if (!ready()) return;
    try {
      // One-field query (no composite index needed); the expiry is checked here
      const cutoff = Date.now() - 5 * 60_000;
      const pending = await col().where('status', '==', 'PENDING').limit(50).get();
      for (const doc of pending.docs) {
        if (Date.parse((doc.data() as CardPaymentDoc).expiresAt) > cutoff) continue;
        await syncCheckout(doc.id).catch((err) => console.warn('[card] sweep:', err?.message));
      }
    } catch (err: any) {
      console.warn('[card] sweep failed:', err?.message);
    }
  }, 30 * 60_000).unref?.();

  return { ready, startCheckout, syncCheckout };
}
