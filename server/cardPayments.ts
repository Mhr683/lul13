import crypto from 'crypto';
import type { Express, Request } from 'express';

// International payments on a gateway's hosted page (card details never touch this site).
// Three gateways; each is off until its keys are in .env, and the checkout offers the ones that
// are set up:
//   Tazapay      TAZAPAY_API_KEY, TAZAPAY_API_SECRET, TAZAPAY_WEBHOOK_SECRET, TAZAPAY_ENV
//   Verifone     VERIFONE_MERCHANT_CODE, VERIFONE_SECRET_KEY (IPN + API), VERIFONE_BUYLINK_SECRET,
//   (2Checkout)  VERIFONE_ENV   — IPN URL in the 2Checkout panel: <APP_URL>/api/payments/verifone/ipn
//   Payoneer     PAYONEER_MERCHANT_CODE, PAYONEER_API_TOKEN, PAYONEER_ENV
//   (*_ENV=production for real money; anything else is the gateway's test mode)
//
// Flow: orders/create makes the orders (stock held, payment PENDING) and calls startCheckout,
// which opens one payment page for the whole checkout in USD and sends the customer there.
// The gateway's notification, the customer's return to the store and a half-hourly sweep all call
// syncCheckout, which asks the gateway's API for the payment's real state (a notification is
// never trusted on its own) and then:
//   - paid in full, right currency  -> orders confirmed and paid, emails sent (once)
//   - a card was declined           -> marked, the customer can try again on the same page
//   - the page expired unpaid       -> orders cancelled, stock back, email sent
//   - the gateway said "paid" but its API does not confirm it (or the amount differs)
//                                    -> REVIEW: nothing is cancelled; the store checks the
//                                       gateway's dashboard and verifies the payment by hand
//
// Database cost: one card_payments document per card checkout (1 write when created, 1 read +
// 1 write per state change); the orders are updated only when the payment state changes.

export const CARD_CURRENCY = 'USD';
/** Minutes the payment page stays open (stock is held meanwhile) */
const SESSION_MINUTES = 60;

export type GatewayId = 'TAZAPAY' | 'VERIFONE' | 'PAYONEER';

export type CardPaymentDoc = {
  checkoutId: string;
  gateway: GatewayId;
  /** Gateway's id for the payment page (Tazapay chk_..., Payoneer longId, Verifone: our checkout id) */
  sessionId: string;
  /** Gateway's order number once known (Verifone REFNO) */
  gatewayRef?: string;
  url: string;
  orderIds: string[];
  totalPkr: number;
  amountMinor: number;
  currency: string;
  usdToPkr: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REVIEW';
  attemptFailed?: boolean;
  /** A notification said the payment succeeded (kept so an expiry never cancels a paid order) */
  claimedPaid?: boolean;
  customerEmail: string;
  /** sha256 of the orders' tracking token (the tracking page proves it knows the token) */
  tokenHash: string;
  sandbox: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type OpenParams = {
  checkoutId: string;
  orderNumbers: string[];
  amountMinor: number;
  items: Array<{ name: string; quantity: number; amount: number }>;
  customer: { name: string; email: string; country: string; callingCode?: string; phone?: string };
  address: { line1: string; line2?: string; city: string; state?: string; country: string; postalCode?: string };
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
};

type CheckResult = {
  state: 'PAID' | 'PENDING' | 'FAILED_ATTEMPT' | 'EXPIRED' | 'MISMATCH';
  paidMinor?: number;
  /** Gateway order number learnt during the check */
  ref?: string;
};

type Gateway = {
  id: GatewayId;
  /** Shown to the customer */
  label: string;
  note: string;
  ready: () => boolean;
  sandbox: () => boolean;
  open: (p: OpenParams) => Promise<{ sessionId: string; url: string }>;
  check: (pay: CardPaymentDoc) => Promise<CheckResult>;
};

const isProd = (v?: string) => String(v || '').trim().toLowerCase() === 'production';
const envOf = (k: string) => String(process.env[k] || '').trim();
const storeUrl = () => String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function http(url: string, init: { method: string; headers: Record<string, string>; body?: string }, name: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === 'error') {
    // The gateway's message only; keys never appear in logs
    const msg = json?.message || json?.errors?.[0]?.message || json?.error_code || json?.resultInfo || 'request failed';
    throw new Error(`${name} ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  return json;
}

// ---------------------------------------------------------------- Tazapay

const tazapayEnv = () => {
  const key = envOf('TAZAPAY_API_KEY');
  const secret = envOf('TAZAPAY_API_SECRET');
  if (!key || !secret) return null;
  const sandbox = !isProd(process.env.TAZAPAY_ENV);
  return {
    auth: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    webhookSecret: envOf('TAZAPAY_WEBHOOK_SECRET'),
    base: sandbox ? 'https://service-sandbox.tazapay.com' : 'https://service.tazapay.com',
    sandbox,
  };
};

/** Tazapay's check: HMAC-SHA256 (base64) of event id + raw body + created_at, within 10 minutes */
export function verifyTazapaySignature(rawBody: string, header: string, secret: string, now = Date.now()) {
  if (!secret || !header) return false;
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const at = Date.parse(event?.created_at || '');
  if (!Number.isFinite(at) || Math.abs(now - at) > 10 * 60_000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${event.id}${rawBody}${event.created_at}`).digest('base64');
  return safeEqual(expected, String(header).trim());
}

const tazapay: Gateway = {
  id: 'TAZAPAY',
  label: 'Debit / Credit Card',
  note: 'Visa · Mastercard',
  ready: () => tazapayEnv() !== null,
  sandbox: () => tazapayEnv()?.sandbox ?? false,
  async open(p) {
    const e = tazapayEnv()!;
    const json = await http(`${e.base}/v3/checkout`, {
      method: 'POST',
      headers: { Authorization: e.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        invoice_currency: CARD_CURRENCY,
        amount: p.amountMinor,
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
        items: p.items,
        payment_methods: ['card'],
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        webhook_url: `${storeUrl()}/api/payments/tazapay/webhook`,
        reference_id: p.checkoutId,
        transaction_description: `Order ${p.orderNumbers.join(', ')}`.slice(0, 200),
        expires_at: p.expiresAt,
      }),
    }, 'Tazapay');
    const s = json?.data;
    if (!s?.id || !s?.url) throw new Error('Tazapay did not return a payment page.');
    return { sessionId: String(s.id), url: String(s.url) };
  },
  async check(pay) {
    const e = tazapayEnv()!;
    const json = await http(`${e.base}/v3/checkout/${encodeURIComponent(pay.sessionId)}`, {
      method: 'GET',
      headers: { Authorization: e.auth, Accept: 'application/json' },
    }, 'Tazapay');
    const s = json?.data || {};
    const paidMinor = Number(s.amount_paid) || 0;
    if (s.payment_status === 'paid') {
      const ok = String(s.invoice_currency || '').toUpperCase() === pay.currency && paidMinor >= pay.amountMinor && String(s.reference_id || pay.checkoutId) === pay.checkoutId;
      return { state: ok ? 'PAID' : 'MISMATCH', paidMinor };
    }
    if (s.status === 'expired') return { state: 'EXPIRED' };
    return { state: 'PENDING' };
  },
};

// ---------------------------------------------------------------- Verifone (2Checkout)

const verifoneEnv = () => {
  const merchant = envOf('VERIFONE_MERCHANT_CODE');
  const secretKey = envOf('VERIFONE_SECRET_KEY');
  const buyLinkSecret = envOf('VERIFONE_BUYLINK_SECRET');
  if (!merchant || !secretKey || !buyLinkSecret) return null;
  return { merchant, secretKey, buyLinkSecret, sandbox: !isProd(process.env.VERIFONE_ENV) };
};

/** 2Checkout's serialization: each value prefixed by its UTF-8 byte length ("USD" -> "3USD", "" -> "0") */
const lenPrefix = (v: string) => (v === '' ? '0' : `${Buffer.byteLength(v, 'utf8')}${v}`);

/** ConvertPlus buy-link signature: signed parameters sorted by name, length-prefixed, HMAC-SHA256 */
export function verifoneBuyLinkSignature(params: Record<string, string>, secret: string) {
  const SIGNED = [
    'return-url', 'return-type', 'expiration', 'order-ext-ref', 'customer-ref', 'customer-ext-ref',
    'currency', 'prod', 'price', 'qty', 'type', 'opt', 'description', 'recurrence', 'duration', 'renewal-price', 'item-ext-ref',
  ];
  const data = Object.keys(params)
    .filter((k) => SIGNED.includes(k))
    .sort()
    .map((k) => lenPrefix(params[k]))
    .join('');
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * IPN check: every received value in order (signature fields left out), length-prefixed, HMAC with
 * the secret key. SHA-256 when 2Checkout sends SIGNATURE_SHA2_256 (or a 64-character HASH), else the
 * older MD5 HASH.
 */
export function verifyVerifoneIpn(rawBody: string, secret: string) {
  const form = new URLSearchParams(rawBody);
  const SIG_FIELDS = ['HASH', 'SIGNATURE_SHA2_256', 'SIGNATURE_SHA3_256'];
  const data = [...form.entries()].filter(([k]) => !SIG_FIELDS.includes(k)).map(([, v]) => lenPrefix(v)).join('');
  const sha2 = form.get('SIGNATURE_SHA2_256') || '';
  const hash = form.get('HASH') || '';
  if (sha2) return safeEqual(crypto.createHmac('sha256', secret).update(data).digest('hex'), sha2.toLowerCase());
  if (/^[a-f0-9]{64}$/i.test(hash)) return safeEqual(crypto.createHmac('sha256', secret).update(data).digest('hex'), hash.toLowerCase());
  if (/^[a-f0-9]{32}$/i.test(hash)) return safeEqual(crypto.createHmac('md5', secret).update(data).digest('hex'), hash.toLowerCase());
  return false;
}

/** The read receipt 2Checkout waits for (otherwise it keeps resending the IPN) */
export function verifoneIpnReceipt(rawBody: string, secret: string, now = new Date()) {
  const form = new URLSearchParams(rawBody);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const first = (k: string) => form.getAll(`${k}[]`)[0] ?? form.getAll(`${k}[0]`)[0] ?? '';
  const data = [first('IPN_PID'), first('IPN_PNAME'), form.get('IPN_DATE') || '', date].map(lenPrefix).join('');
  return `<sig algo="sha256" date="${date}">${crypto.createHmac('sha256', secret).update(data).digest('hex')}</sig>`;
}

const verifone: Gateway = {
  id: 'VERIFONE',
  label: 'Card or PayPal',
  note: 'Verifone (2Checkout)',
  ready: () => verifoneEnv() !== null,
  sandbox: () => verifoneEnv()?.sandbox ?? false,
  async open(p) {
    const e = verifoneEnv()!;
    // The buy link is built and signed here: no API call, nothing to store at the gateway yet
    const params: Record<string, string> = {
      merchant: e.merchant,
      dynamic: '1',
      prod: `Order ${p.orderNumbers.join(', ')}`.slice(0, 100),
      price: (p.amountMinor / 100).toFixed(2),
      qty: '1',
      type: 'PRODUCT',
      currency: CARD_CURRENCY,
      'order-ext-ref': p.checkoutId,
      'return-url': p.successUrl,
      'return-type': 'redirect',
      expiration: String(Math.floor(Date.parse(p.expiresAt) / 1000)),
      email: p.customer.email,
      name: p.customer.name.slice(0, 100),
      country: p.customer.country,
      address: p.address.line1.slice(0, 200),
      city: p.address.city.slice(0, 80),
      ...(p.address.state ? { state: p.address.state.slice(0, 80) } : {}),
      ...(p.address.postalCode ? { zip: p.address.postalCode.slice(0, 20) } : {}),
      'ship-name': p.customer.name.slice(0, 100),
      'ship-address': p.address.line1.slice(0, 200),
      'ship-city': p.address.city.slice(0, 80),
      'ship-country': p.address.country,
      ...(e.sandbox ? { test: '1' } : {}),
    };
    params.signature = verifoneBuyLinkSignature(params, e.buyLinkSecret);
    return { sessionId: p.checkoutId, url: `https://secure.2checkout.com/checkout/buy?${new URLSearchParams(params).toString()}` };
  },
  async check(pay) {
    const e = verifoneEnv()!;
    // Until the IPN or the return link names the 2Checkout order there is nothing to look up
    if (!pay.gatewayRef) return { state: 'PENDING' };
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const hash = crypto.createHmac('sha256', e.secretKey).update(`${lenPrefix(e.merchant)}${lenPrefix(date)}`).digest('hex');
    const o = await http(`https://api.2checkout.com/rest/6.0/orders/${encodeURIComponent(pay.gatewayRef)}/`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Avangate-Authentication': `code="${e.merchant}" date="${date}" hash="${hash}" algo="sha256"`,
      },
    }, 'Verifone');
    // The order must be ours: our checkout id travels as order-ext-ref
    if (String(o?.ExternalReference || '') !== pay.checkoutId) return { state: 'PENDING' };
    const status = String(o?.Status || '').toUpperCase();
    const paidMinor = Math.round((Number(o?.GrossPrice) || 0) * 100);
    const currencyOk = String(o?.Currency || '').toUpperCase() === pay.currency;
    if (status === 'COMPLETE' || status === 'PAYMENT_RECEIVED' || (status === 'PAYMENT_AUTHORIZED' && String(o?.ApproveStatus || '').toUpperCase() === 'OK')) {
      return { state: currencyOk && paidMinor >= pay.amountMinor ? 'PAID' : 'MISMATCH', paidMinor, ref: String(o?.RefNo || pay.gatewayRef) };
    }
    if (['CANCELED', 'CANCELLED', 'REVERSED', 'REFUND'].includes(status)) return { state: 'FAILED_ATTEMPT' };
    return { state: 'PENDING' };
  },
};

// ---------------------------------------------------------------- Payoneer Checkout

// Payoneer's API reference is only available to approved merchants, so this follows the
// published LIST flow (hosted page) and treats anything it cannot confirm as "check by hand":
// it never marks an order paid without the API saying so, and never cancels one a notification
// called paid.
const payoneerEnv = () => {
  const merchant = envOf('PAYONEER_MERCHANT_CODE');
  const token = envOf('PAYONEER_API_TOKEN');
  if (!merchant || !token) return null;
  const sandbox = !isProd(process.env.PAYONEER_ENV);
  return {
    auth: `Basic ${Buffer.from(`${merchant}:${token}`).toString('base64')}`,
    base: sandbox ? 'https://api.sandbox.oscato.com' : 'https://api.live.oscato.com',
    sandbox,
  };
};

/** Payoneer status codes that mean the money was taken / not taken */
const PAYONEER_PAID = ['charged', 'paid_out'];
const PAYONEER_FAILED = ['declined', 'failed', 'rejected', 'aborted', 'canceled', 'cancelled'];

const payoneer: Gateway = {
  id: 'PAYONEER',
  label: 'Payoneer Checkout',
  note: 'Cards · local methods',
  ready: () => payoneerEnv() !== null,
  sandbox: () => payoneerEnv()?.sandbox ?? false,
  async open(p) {
    const e = payoneerEnv()!;
    const [firstName, ...rest] = p.customer.name.trim().split(/\s+/);
    const json = await http(`${e.base}/api/lists`, {
      method: 'POST',
      headers: { Authorization: e.auth, 'Content-Type': 'application/vnd.optile.payment.enterprise-v1-extensible+json', Accept: 'application/vnd.optile.payment.enterprise-v1-extensible+json' },
      body: JSON.stringify({
        transactionId: p.checkoutId,
        country: p.customer.country,
        integration: 'HOSTED',
        customer: {
          number: p.customer.email.slice(0, 100),
          email: p.customer.email,
          name: { firstName: (firstName || 'Customer').slice(0, 50), lastName: (rest.join(' ') || '-').slice(0, 50) },
        },
        payment: { amount: p.amountMinor / 100, currency: CARD_CURRENCY, reference: `Order ${p.orderNumbers.join(', ')}`.slice(0, 120) },
        products: p.items.map((it) => ({ name: it.name, quantity: it.quantity, amount: (it.amount * it.quantity) / 100, currency: CARD_CURRENCY })),
        callback: {
          returnUrl: p.successUrl,
          cancelUrl: p.cancelUrl,
          notificationUrl: `${storeUrl()}/api/payments/payoneer/notify`,
        },
        style: { hostedVersion: 'v4' },
      }),
    }, 'Payoneer');
    const url = json?.links?.redirect;
    const longId = json?.identification?.longId;
    if (!url || !longId) throw new Error('Payoneer did not return a payment page.');
    return { sessionId: String(longId), url: String(url) };
  },
  async check(pay) {
    const e = payoneerEnv()!;
    const json = await http(`${e.base}/api/lists/${encodeURIComponent(pay.sessionId)}`, {
      method: 'GET',
      headers: { Authorization: e.auth, Accept: 'application/vnd.optile.payment.enterprise-v1-extensible+json' },
    }, 'Payoneer');
    const code = String(json?.status?.code || '').toLowerCase();
    const amountMinor = Math.round((Number(json?.payment?.amount) || 0) * 100);
    const currencyOk = String(json?.payment?.currency || '').toUpperCase() === pay.currency;
    if (PAYONEER_PAID.includes(code)) return { state: currencyOk && amountMinor >= pay.amountMinor ? 'PAID' : 'MISMATCH', paidMinor: amountMinor };
    if (code === 'expired') return { state: 'EXPIRED' };
    if (PAYONEER_FAILED.includes(code)) return { state: 'FAILED_ATTEMPT' };
    return { state: 'PENDING' };
  },
};

const GATEWAYS: Gateway[] = [tazapay, verifone, payoneer];
const gatewayOf = (id?: string) => GATEWAYS.find((g) => g.id === id);

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- shared flow

type Deps = {
  adminDb: FirebaseFirestore.Firestore;
  usdToPkr: () => number;
  /** Payment received: mark the orders and send the confirmation emails */
  onPaid: (orderIds: string[], info: { gateway: GatewayId; sessionId: string; amountMinor: number; currency: string }) => Promise<void>;
  /** The page ended unpaid: cancel the orders and put the stock back */
  onExpired: (orderIds: string[], reason: string) => Promise<void>;
  /** A card was declined: the customer can still try again on the same page */
  onAttemptFailed: (orderIds: string[]) => Promise<void>;
  /** The gateway said paid but it could not be confirmed: the store checks by hand */
  onReview: (orderIds: string[], note: string) => Promise<void>;
};

export function setupCardPayments(app: Express, d: Deps) {
  const col = () => d.adminDb.collection('card_payments');
  const enabled = () => GATEWAYS.filter((g) => g.ready());
  const ready = () => enabled().length > 0;

  /**
   * Opens the payment page for a checkout. Line items are converted to USD cents; when the
   * converted lines cannot add up to the exact total (discounts), one line for the whole order
   * is sent instead, so the gateway always charges exactly the order total.
   */
  async function startCheckout(p: {
    gateway?: string;
    checkoutId: string;
    orderIds: string[];
    orderNumbers: string[];
    totalPkr: number;
    items: Array<{ name: string; quantity: number; price: number }>;
    customer: OpenParams['customer'];
    address: OpenParams['address'];
    trackUrl: string;
    accessToken: string;
  }): Promise<{ url: string; gateway: GatewayId }> {
    const g = (p.gateway && gatewayOf(p.gateway)?.ready() ? gatewayOf(p.gateway) : enabled()[0]) || null;
    if (!g) throw new Error('Card payments are not set up.');
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
    const opened = await g.open({
      checkoutId: p.checkoutId,
      orderNumbers: p.orderNumbers,
      amountMinor,
      items,
      customer: p.customer,
      address: p.address,
      successUrl: `${back}&payment=success`,
      cancelUrl: `${back}&payment=cancelled`,
      expiresAt,
    });
    const doc: CardPaymentDoc = {
      checkoutId: p.checkoutId,
      gateway: g.id,
      sessionId: opened.sessionId,
      url: opened.url,
      orderIds: p.orderIds,
      totalPkr: p.totalPkr,
      amountMinor,
      currency: CARD_CURRENCY,
      usdToPkr: rate,
      status: 'PENDING',
      customerEmail: p.customer.email,
      tokenHash: crypto.createHash('sha256').update(p.accessToken).digest('hex'),
      sandbox: g.sandbox(),
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await col().doc(p.checkoutId).set(doc);
    return { url: doc.url, gateway: g.id };
  }

  // Several callers can ask about the same checkout at once (notification + returning customer)
  const inFlight = new Map<string, Promise<CardPaymentDoc | null>>();
  type Hint = { attemptFailed?: boolean; claimedPaid?: boolean; gatewayRef?: string };
  function syncCheckout(checkoutId: string, hint?: Hint) {
    let p = inFlight.get(checkoutId);
    if (!p) {
      p = doSync(checkoutId, hint).finally(() => inFlight.delete(checkoutId));
      inFlight.set(checkoutId, p);
    }
    return p;
  }

  /** Moves the payment out of PENDING exactly once; returns false when someone else already did */
  const settle = (ref: FirebaseFirestore.DocumentReference, updates: Record<string, any>) =>
    d.adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if ((fresh.data() as CardPaymentDoc)?.status !== 'PENDING') return false;
      tx.update(ref, updates);
      return true;
    });

  async function doSync(checkoutId: string, hint?: Hint): Promise<CardPaymentDoc | null> {
    const ref = col().doc(checkoutId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    let pay = snap.data() as CardPaymentDoc;
    const g = gatewayOf(pay.gateway);
    if (!g || !g.ready()) return pay;
    const now = new Date().toISOString();
    // Money that arrives after the page expired (the orders were cancelled): the gateway is asked,
    // and a confirmed payment goes to onPaid, which marks the cancelled orders for a refund
    if (pay.status === 'EXPIRED' && (hint?.claimedPaid || hint?.gatewayRef)) {
      const late = await g.check({ ...pay, gatewayRef: hint.gatewayRef || pay.gatewayRef });
      if (late.state === 'PAID' || late.state === 'MISMATCH') {
        const won = await d.adminDb.runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if ((fresh.data() as CardPaymentDoc)?.status !== 'EXPIRED') return false;
          tx.update(ref, { status: 'REVIEW', paidLate: true, paidMinor: late.paidMinor ?? null, gatewayRef: hint.gatewayRef || pay.gatewayRef || null, updatedAt: now });
          return true;
        });
        if (won) await d.onPaid(pay.orderIds, { gateway: g.id, sessionId: hint.gatewayRef || pay.sessionId, amountMinor: late.paidMinor ?? 0, currency: pay.currency });
        return { ...pay, status: 'REVIEW' };
      }
      return pay;
    }
    if (pay.status !== 'PENDING') return pay;

    // What the notification / return link told us is kept, so later checks can use it
    const learnt: Record<string, any> = {};
    if (hint?.gatewayRef && hint.gatewayRef !== pay.gatewayRef) learnt.gatewayRef = hint.gatewayRef.slice(0, 80);
    if (hint?.claimedPaid && !pay.claimedPaid) learnt.claimedPaid = true;
    if (Object.keys(learnt).length) {
      await ref.update({ ...learnt, updatedAt: now });
      pay = { ...pay, ...learnt };
    }

    const result = await g.check(pay);
    if (result.ref && result.ref !== pay.gatewayRef) pay = { ...pay, gatewayRef: result.ref };

    if (result.state === 'PAID') {
      if (await settle(ref, { status: 'PAID', paidMinor: result.paidMinor ?? pay.amountMinor, gatewayRef: pay.gatewayRef || null, updatedAt: now })) {
        await d.onPaid(pay.orderIds, { gateway: g.id, sessionId: pay.gatewayRef || pay.sessionId, amountMinor: result.paidMinor ?? pay.amountMinor, currency: pay.currency });
      }
      return { ...pay, status: 'PAID' };
    }
    if (result.state === 'MISMATCH') {
      console.warn(`[card] ${g.id} checkout ${checkoutId}: paid ${result.paidMinor} ${pay.currency}, expected ${pay.amountMinor}`);
      if (await settle(ref, { status: 'REVIEW', mismatch: true, updatedAt: now })) {
        await d.onReview(pay.orderIds, `${g.label}: the amount paid (${((result.paidMinor || 0) / 100).toFixed(2)} ${pay.currency}) differs from the order (${(pay.amountMinor / 100).toFixed(2)}). Check the gateway's dashboard.`);
      }
      return { ...pay, status: 'REVIEW' };
    }
    const timeUp = result.state === 'EXPIRED' || Date.parse(pay.expiresAt) + 5 * 60_000 < Date.now();
    if (timeUp) {
      // A notification called it paid but the API never confirmed it: never cancel, ask the store
      if (pay.claimedPaid) {
        if (await settle(ref, { status: 'REVIEW', updatedAt: now })) {
          await d.onReview(pay.orderIds, `${g.label} reported this payment as successful, but it could not be confirmed. Check the gateway's dashboard before shipping.`);
        }
        return { ...pay, status: 'REVIEW' };
      }
      if (await settle(ref, { status: 'EXPIRED', updatedAt: now })) {
        await d.onExpired(pay.orderIds, 'The card payment was not completed in time, so the order was cancelled.');
      }
      return { ...pay, status: 'EXPIRED' };
    }
    if ((result.state === 'FAILED_ATTEMPT' || hint?.attemptFailed) && !pay.attemptFailed) {
      await ref.update({ attemptFailed: true, updatedAt: now });
      await d.onAttemptFailed(pay.orderIds);
      return { ...pay, attemptFailed: true };
    }
    return pay;
  }

  const bySession = async (sessionId: string) => {
    if (!sessionId) return '';
    const q = await col().where('sessionId', '==', sessionId.slice(0, 120)).limit(1).get();
    return q.empty ? '' : q.docs[0].id;
  };

  // The checkout asks once which gateways to offer (no database read)
  app.get('/api/payments/card-config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    const list = enabled();
    res.json({
      enabled: list.length > 0,
      currency: CARD_CURRENCY,
      sandbox: list.some((g) => g.sandbox()),
      usdToPkr: list.length ? d.usdToPkr() : 0,
      gateways: list.map((g) => ({ id: g.id, label: g.label, note: g.note, sandbox: g.sandbox() })),
    });
  });

  // Tazapay -> store. Signature checked on the exact bytes received; then Tazapay's API decides.
  app.post('/api/payments/tazapay/webhook', async (req: Request, res) => {
    const e = tazapayEnv();
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
      if (!checkoutId) checkoutId = await bySession(String((typeof data.checkout === 'string' ? data.checkout : data.checkout?.id) || ''));
      if (checkoutId) {
        await syncCheckout(checkoutId.slice(0, 80), {
          attemptFailed: type === 'payment_attempt.failed',
          claimedPaid: type === 'checkout.paid' || type === 'payment_attempt.succeeded',
        });
      }
    })().catch((err) => console.error(`[card] tazapay ${type} failed:`, err?.message));
  });

  // Verifone (2Checkout) IPN -> store. Signed with the secret key; answered with the signed
  // read receipt 2Checkout expects, then the order is looked up through 2Checkout's API.
  app.post('/api/payments/verifone/ipn', async (req: Request, res) => {
    const e = verifoneEnv();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!e || !verifyVerifoneIpn(raw, e.secretKey)) return res.status(401).send('Invalid signature');
    const form = new URLSearchParams(raw);
    res.type('text/plain').send(verifoneIpnReceipt(raw, e.secretKey));
    const checkoutId = String(form.get('REFNOEXT') || '').slice(0, 80);
    const refNo = String(form.get('REFNO') || '').slice(0, 80);
    const status = String(form.get('ORDERSTATUS') || '').toUpperCase();
    if (!checkoutId || !refNo) return;
    syncCheckout(checkoutId, {
      gatewayRef: refNo,
      claimedPaid: ['COMPLETE', 'PAYMENT_AUTHORIZED', 'PAYMENT_RECEIVED'].includes(status),
      attemptFailed: ['CANCELED', 'REVERSED'].includes(status),
    }).catch((err) => console.error(`[card] verifone IPN ${checkoutId} failed:`, err?.message));
  });

  // Payoneer -> store. Notifications are not signed, so they only make us ask Payoneer's API.
  app.all('/api/payments/payoneer/notify', async (req: Request, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    let body: Record<string, any> = {};
    try {
      body = raw.trim().startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    } catch {}
    const p = { ...(req.query as any), ...body };
    res.status(200).send('OK');
    const status = String(p.statusCode || '').toLowerCase();
    (async () => {
      const checkoutId = (await bySession(String(p.longId || ''))) || String(p.transactionId || '').slice(0, 80);
      if (!checkoutId) return;
      await syncCheckout(checkoutId, { claimedPaid: PAYONEER_PAID.includes(status), attemptFailed: PAYONEER_FAILED.includes(status) });
    })().catch((err) => console.error('[card] payoneer notification failed:', err?.message));
  });

  // The customer came back from the payment page (or the tracking page asks): current state, and
  // the payment page link while it can still be paid. Needs the order's tracking token.
  // `ref`: 2Checkout adds its order number to the return link; it only counts once 2Checkout's
  // API confirms the order carries this checkout id.
  app.get('/api/payments/card/:checkoutId', async (req, res) => {
    const checkoutId = String(req.params.checkoutId).slice(0, 80);
    const token = String(req.query.token || '');
    const ref = String(req.query.ref || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    try {
      const snap = await col().doc(checkoutId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Payment not found.' });
      // The order's tracking token, checked against the hash kept with the payment (no order read)
      const want = Buffer.from(String((snap.data() as CardPaymentDoc).tokenHash || ''), 'hex');
      const got = crypto.createHash('sha256').update(token).digest();
      if (!token || want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        return res.status(403).json({ error: 'Not allowed.' });
      }
      const pay = (await syncCheckout(checkoutId, ref ? { gatewayRef: ref } : undefined).catch(() => null)) || (snap.data() as CardPaymentDoc);
      res.json({
        status: pay.status,
        gateway: pay.gateway,
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

  // Safety net when a notification never arrives: every 30 minutes, pending payments whose page
  // has closed are checked once (a handful of reads; one when there are no card orders)
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

  return { ready, enabledIds: () => enabled().map((g) => g.id), startCheckout, syncCheckout };
}
