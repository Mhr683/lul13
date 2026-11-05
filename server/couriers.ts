import type express from 'express';
import { COURIER_CATALOG, courierInfo, type CourierId } from '../src/services/courierCatalog';

// Courier accounts connected with an API key: the store owner pastes the key once in Admin →
// Couriers, and from then on the store and every seller can book a parcel with one button. The
// tracking number and the label come back from the courier, and the order moves to "Delivered" or
// "Returned" by itself when the courier reports it.
//
// Multi-vendor: one courier account belongs to the store; each seller's parcels are picked up from
// that seller's own pickup address (registered in the courier's portal and chosen per seller here).
//
//   courier_private/config  { accounts: { POSTEX: { enabled, secrets, options } ... },
//                             allowSellers, sellerPickup: { <sellerId>: { POSTEX: code, TRAX: id } },
//                             lastSyncAt, lastSyncNote }
//   orders/{id}.courierBooking  { courier, trackingNumber, labelUrl?, bookedAt, bookedBy, active,
//                                 lastStatus?, lastCheckedAt? }
//
// Only the server reads the config (the browser gets masked keys), and it is cached in memory, so
// booking and tracking cost almost no Firestore reads.

interface CourierAccount {
  enabled?: boolean;
  secrets?: Record<string, string>;
  options?: Record<string, string>;
}
interface CourierConfig {
  accounts?: Partial<Record<CourierId, CourierAccount>>;
  defaultCourier?: CourierId;
  allowSellers?: boolean;
  sellerPickup?: Record<string, Partial<Record<CourierId, string>>>;
  lastSyncAt?: string;
  lastSyncNote?: string;
}

export interface CourierDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAdmin: express.RequestHandler;
  requireSeller: express.RequestHandler;
  applyOrderStatusWithStock: (ref: FirebaseFirestore.DocumentReference, updates: Record<string, any> & { status: string }) => Promise<unknown>;
  appendTrackingEvent: (existing: any, event: { at: string; status?: string; location?: string; note: string }) => any[];
  forgetOrders: (sellerId: string) => void;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ACTIVE_STATUSES = ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'];
const BOOKABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'];
const SYNC_EVERY_MS = 2 * 3600_000;

class CourierError extends Error {}

// ---------------------------------------------------------------- small helpers

async function call(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs || 25_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err: any) {
    throw new CourierError(err?.name === 'AbortError' ? 'The courier did not answer in time. Please try again.' : `Could not reach the courier (${err?.message || err}).`);
  } finally {
    clearTimeout(t);
  }
}

const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Finds a city in the courier's list by name ("Lahore", "lahore cantt" → Lahore) */
function matchCity<T>(list: T[], name: string, nameOf: (c: T) => string): T | undefined {
  const want = norm(name);
  if (!want) return undefined;
  return (
    list.find((c) => norm(nameOf(c)) === want) ||
    list.find((c) => want.startsWith(norm(nameOf(c))) && norm(nameOf(c)).length >= 4) ||
    list.find((c) => norm(nameOf(c)).startsWith(want) && want.length >= 4)
  );
}

/** Pakistani mobile in the 03XXXXXXXXX form couriers expect */
function localPhone(raw: unknown) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('92') && d.length === 12) return `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('3')) return `0${d}`;
  return d || String(raw || '');
}

/** Delivery status text from a courier → the order status it means (or null: nothing to change) */
export function orderStatusFromCourier(text: string): 'DELIVERED' | 'RETURNED' | 'OUT_FOR_DELIVERY' | 'SHIPPED' | null {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/return(ed)? to (shipper|origin|merchant|vendor)|returned|rto delivered|return delivered/.test(s)) return 'RETURNED';
  if (/undeliver|not delivered|attempt|refused|cancel|review|pending|hold|delay|reattempt/.test(s)) return null;
  if (/deliver/.test(s) && !/out for deliver|for delivery|to be delivered/.test(s)) return 'DELIVERED';
  if (/out for deliver|en.?route|with rider|rider/.test(s)) return 'OUT_FOR_DELIVERY';
  if (/picked|in transit|transit|arrived|dispatch|departed|received at|at hub|booked.*picked/.test(s)) return 'SHIPPED';
  return null;
}

// ---------------------------------------------------------------- courier adapters

interface BookInput {
  orderRef: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  codAmount: number;
  pieces: number;
  weightKg: number;
  description: string;
  notes: string;
  pickupCode?: string;
  shipper: { name: string; phone: string; address: string; city: string; email: string };
}
interface BookResult {
  trackingNumber: string;
  labelUrl?: string;
}
interface TrackResult {
  status: string;
  events: Array<{ at: string; note: string; location?: string }>;
}
interface Adapter {
  test(acc: CourierAccount): Promise<{ message: string; pickupAddresses?: Array<{ code: string; label: string }> }>;
  book(acc: CourierAccount, input: BookInput): Promise<BookResult>;
  track(acc: CourierAccount, trackingNumber: string): Promise<TrackResult>;
  label?(acc: CourierAccount, trackingNumber: string): Promise<{ pdf?: Buffer; url?: string }>;
}

// City lists change rarely: kept for a day per courier
const cityCache = new Map<string, { at: number; list: any[] }>();
async function cachedCities(key: string, load: () => Promise<any[]>) {
  const hit = cityCache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000 && hit.list.length) return hit.list;
  const list = await load();
  if (list.length) cityCache.set(key, { at: Date.now(), list });
  return list;
}

const POSTEX_API = 'https://api.postex.pk/services/integration/api/order';
const postex: Adapter = {
  async test(acc) {
    const token = acc.secrets?.token || '';
    const r = await call(`${POSTEX_API}/v1/get-merchant-address`, { headers: { token } });
    if (!r.ok || String(r.json?.statusCode || '200') !== '200') {
      throw new CourierError(r.json?.statusMessage || `PostEx did not accept the token (HTTP ${r.status}).`);
    }
    const list: any[] = Array.isArray(r.json?.dist) ? r.json.dist : [];
    return {
      message: `Connected to PostEx. ${list.length} pickup address(es) found.`,
      pickupAddresses: list.map((a) => ({
        code: String(a.addressCode ?? a.pickupAddressCode ?? a.code ?? ''),
        label: [a.address, a.cityName].filter(Boolean).join(', ') || String(a.addressCode ?? ''),
      })),
    };
  },
  async book(acc, i) {
    const token = acc.secrets?.token || '';
    const cities = await cachedCities('postex', async () => {
      const r = await call(`${POSTEX_API}/v2/get-operational-city?operationalCityType=Delivery`, { headers: { token } });
      return Array.isArray(r.json?.dist) ? r.json.dist : [];
    }).catch(() => []);
    const city = matchCity(cities, i.city, (c: any) => c.operationalCityName || c.cityName || '');
    const body: Record<string, any> = {
      orderRefNumber: i.orderRef,
      invoicePayment: Math.round(i.codAmount),
      orderDetail: i.description,
      customerName: i.customerName,
      customerPhone: localPhone(i.customerPhone),
      deliveryAddress: i.address,
      cityName: (city as any)?.operationalCityName || (city as any)?.cityName || i.city,
      invoiceDivision: 1,
      items: i.pieces,
      orderType: 'Normal',
      transactionNotes: i.notes,
    };
    const pickup = i.pickupCode || acc.options?.pickupAddressCode;
    if (pickup) body.pickupAddressCode = pickup;
    const r = await call(`${POSTEX_API}/v3/create-order`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const tn = r.json?.dist?.trackingNumber;
    if (!r.ok || !tn) throw new CourierError(r.json?.statusMessage || `PostEx did not book the parcel (HTTP ${r.status}).`);
    return { trackingNumber: String(tn) };
  },
  async track(acc, tn) {
    const r = await call(`${POSTEX_API}/v1/track-order/${encodeURIComponent(tn)}`, { headers: { token: acc.secrets?.token || '' } });
    const d = r.json?.dist;
    if (!r.ok || !d) throw new CourierError(r.json?.statusMessage || `PostEx tracking failed (HTTP ${r.status}).`);
    const hist: any[] = Array.isArray(d.transactionStatusHistory) ? d.transactionStatusHistory : [];
    return {
      status: String(d.transactionStatus || hist[hist.length - 1]?.transactionStatusMessage || ''),
      events: hist.map((h) => ({ at: String(h.modifiedDatetime || h.updatedAt || ''), note: String(h.transactionStatusMessage || '') })),
    };
  },
  async label(acc, tn) {
    const r = await fetch(`${POSTEX_API}/v1/get-invoice?trackingNumbers=${encodeURIComponent(tn)}`, {
      headers: { token: acc.secrets?.token || '' },
    });
    if (!r.ok) throw new CourierError(`PostEx did not return the label (HTTP ${r.status}).`);
    return { pdf: Buffer.from(await r.arrayBuffer()) };
  },
};

const LEOPARDS_API = 'https://merchantapi.leopardscourier.com/api';
const leopardsCreds = (acc: CourierAccount) => ({ api_key: acc.secrets?.apiKey || '', api_password: acc.secrets?.apiPassword || '' });
const leopardsCities = (acc: CourierAccount) =>
  cachedCities('leopards', async () => {
    const r = await call(`${LEOPARDS_API}/getAllCities/format/json/?${new URLSearchParams(leopardsCreds(acc))}`);
    if (!r.json?.status) throw new CourierError(r.json?.error || `Leopards did not accept the key (HTTP ${r.status}).`);
    return Array.isArray(r.json.city_list) ? r.json.city_list : [];
  });
const leopards: Adapter = {
  async test(acc) {
    cityCache.delete('leopards');
    const list = await leopardsCities(acc);
    return { message: `Connected to Leopards. ${list.length} cities available.` };
  },
  async book(acc, i) {
    const cities = await leopardsCities(acc);
    const dest = matchCity(cities, i.city, (c: any) => c.name || '');
    if (!dest) throw new CourierError(`Leopards does not deliver to "${i.city}", or the city name is spelled differently.`);
    const origin = matchCity(cities, i.shipper.city, (c: any) => c.name || '');
    const form = new URLSearchParams({
      ...leopardsCreds(acc),
      booked_packet_weight: String(Math.max(100, Math.round(i.weightKg * 1000))),
      booked_packet_no_piece: String(i.pieces),
      booked_packet_collect_amount: String(Math.round(i.codAmount)),
      booked_packet_order_id: i.orderRef,
      origin_city: origin ? String((origin as any).id) : 'self',
      destination_city: String((dest as any).id),
      shipment_name_eng: i.shipper.name || 'self',
      shipment_email: i.shipper.email || 'self',
      shipment_phone: i.shipper.phone || 'self',
      shipment_address: i.shipper.address || 'self',
      consignment_name_eng: i.customerName,
      consignment_email: '',
      consignment_phone: localPhone(i.customerPhone),
      consignment_address: i.address,
      special_instructions: (i.notes || i.description || 'Handle with care').slice(0, 250),
      shipment_type: '',
    });
    const r = await call(`${LEOPARDS_API}/bookPacket/format/json/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!r.json?.status || !r.json?.track_number) throw new CourierError(r.json?.error || `Leopards did not book the parcel (HTTP ${r.status}).`);
    return { trackingNumber: String(r.json.track_number), labelUrl: r.json.slip_link ? String(r.json.slip_link) : undefined };
  },
  async track(acc, tn) {
    const r = await call(`${LEOPARDS_API}/trackBookedPacket/format/json/?${new URLSearchParams({ ...leopardsCreds(acc), track_numbers: tn })}`);
    const p = Array.isArray(r.json?.packet_list) ? r.json.packet_list[0] : null;
    if (!r.json?.status || !p) throw new CourierError(r.json?.error || `Leopards tracking failed (HTTP ${r.status}).`);
    const hist: any[] = Array.isArray(p['Tracking Detail']) ? p['Tracking Detail'] : Array.isArray(p.tracking_detail) ? p.tracking_detail : [];
    return {
      status: String(p.booked_packet_status || ''),
      events: hist.map((h) => ({
        at: String(h.Activity_datetime || h.activity_datetime || h.Activity_Date || ''),
        note: String(h.Status || h.status || ''),
        location: String(h.Reciever_Name ? '' : h.location || ''),
      })),
    };
  },
};

const TRAX_API = 'https://sonic.pk/api';
const traxHeaders = (acc: CourierAccount) => ({ Authorization: acc.secrets?.apiKey || '', Accept: 'application/json' });
const traxOk = (j: any) => j && (j.status === 0 || j.status === '0' || j.status === true);
const trax: Adapter = {
  async test(acc) {
    const r = await call(`${TRAX_API}/pickup_addresses`, { headers: traxHeaders(acc) });
    if (!r.ok || !traxOk(r.json)) throw new CourierError(r.json?.message || `Trax did not accept the key (HTTP ${r.status}).`);
    const list: any[] = Array.isArray(r.json?.pickup_addresses) ? r.json.pickup_addresses : Array.isArray(r.json?.data) ? r.json.data : [];
    return {
      message: `Connected to Trax. ${list.length} pickup address(es) found.`,
      pickupAddresses: list.map((a) => ({ code: String(a.id ?? ''), label: [a.address, a.city?.name || a.city_name].filter(Boolean).join(', ') || `#${a.id}` })),
    };
  },
  async book(acc, i) {
    const cities = await cachedCities('trax', async () => {
      const r = await call(`${TRAX_API}/cities`, { headers: traxHeaders(acc) });
      return Array.isArray(r.json?.cities) ? r.json.cities : [];
    });
    const dest = matchCity(cities, i.city, (c: any) => c.name || '');
    if (!dest) throw new CourierError(`Trax does not deliver to "${i.city}", or the city name is spelled differently.`);
    const pickup = i.pickupCode || acc.options?.pickupAddressId;
    if (!pickup) throw new CourierError('Choose the Trax pickup address in Admin → Couriers first.');
    const body = {
      service_type_id: Number(acc.options?.serviceTypeId) || 1,
      pickup_address_id: Number(pickup),
      information_display: 1,
      consignee_city_id: Number((dest as any).id),
      consignee_name: i.customerName,
      consignee_address: i.address,
      consignee_phone_number_1: localPhone(i.customerPhone),
      consignee_email_address: 'noreply@anokhashopinghub.shop',
      order_id: i.orderRef,
      item_product_type_id: 1,
      item_description: i.description.slice(0, 250),
      item_quantity: i.pieces,
      item_insurance: 0,
      pickup_date: new Date().toISOString().slice(0, 10),
      special_instructions: i.notes || 'Handle with care',
      estimated_weight: Math.max(0.1, Number(i.weightKg.toFixed(2))),
      shipping_mode_id: 1,
      amount: Math.round(i.codAmount),
      payment_mode_id: 1,
      charges_mode_id: 4,
    };
    const r = await call(`${TRAX_API}/shipment/book`, {
      method: 'POST',
      headers: { ...traxHeaders(acc), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const tn = r.json?.tracking_number;
    if (!traxOk(r.json) || !tn) {
      const errs = r.json?.errors ? Object.values(r.json.errors).flat().join(' ') : '';
      throw new CourierError(errs || r.json?.message || `Trax did not book the parcel (HTTP ${r.status}).`);
    }
    return { trackingNumber: String(tn) };
  },
  async track(acc, tn) {
    const r = await call(`${TRAX_API}/shipment/track?${new URLSearchParams({ tracking_number: tn, type: '0' })}`, { headers: traxHeaders(acc) });
    if (!traxOk(r.json)) throw new CourierError(r.json?.message || `Trax tracking failed (HTTP ${r.status}).`);
    const hist: any[] = r.json?.details?.tracking_history || r.json?.tracking_history || [];
    const last = hist[0] || hist[hist.length - 1];
    return {
      status: String(r.json?.details?.status || r.json?.current_status || last?.status || ''),
      events: hist.map((h: any) => ({ at: String(h.date_time || h.datetime || ''), note: String(h.status || h.message || '') })),
    };
  },
  async label(acc, tn) {
    const r = await fetch(`${TRAX_API}/shipment/air_waybill?${new URLSearchParams({ tracking_number: tn, type: '0' })}`, { headers: traxHeaders(acc) });
    if (!r.ok) throw new CourierError(`Trax did not return the label (HTTP ${r.status}).`);
    return { pdf: Buffer.from(await r.arrayBuffer()) };
  },
};

export const ADAPTERS: Record<CourierId, Adapter> = { POSTEX: postex, LEOPARDS: leopards, TRAX: trax };

// ---------------------------------------------------------------- routes

export function registerCourierRoutes(app: express.Express, d: CourierDeps) {
  const { adminDb } = d;
  const cfgRef = () => adminDb.collection('courier_private').doc('config');
  let cache: { at: number; cfg: CourierConfig } | null = null;

  const loadConfig = async (fresh = false): Promise<CourierConfig> => {
    if (!fresh && cache && Date.now() - cache.at < 10 * 60_000) return cache.cfg;
    const snap = await cfgRef().get();
    const cfg = (snap.exists ? snap.data() : {}) as CourierConfig;
    cache = { at: Date.now(), cfg };
    return cfg;
  };
  const saveConfig = async (patch: Partial<CourierConfig>) => {
    await cfgRef().set(patch, { merge: true });
    cache = null;
  };
  const enabledAccount = (cfg: CourierConfig, id: CourierId) => {
    const acc = cfg.accounts?.[id];
    if (!acc?.enabled) throw new CourierError(`${courierInfo(id)?.label || id} is not connected. Add its API key in Admin → Couriers.`);
    return acc;
  };
  const fail = (res: express.Response, err: unknown, where: string) => {
    if (err instanceof CourierError) return res.status(400).json({ error: err.message });
    console.error(`[couriers] ${where} failed:`, err);
    return res.status(503).json({ error: 'Something went wrong. Please try again.' });
  };
  const mask = (v: string) => (v ? `saved ••••${v.slice(-4)}` : '');

  // What the admin screen shows (keys masked)
  const publicConfig = (cfg: CourierConfig) => ({
    couriers: COURIER_CATALOG.map((c) => {
      const acc = cfg.accounts?.[c.id] || {};
      const values: Record<string, string> = {};
      for (const f of c.fields) values[f.key] = f.secret ? mask(acc.secrets?.[f.key] || '') : acc.options?.[f.key] || '';
      return { id: c.id, enabled: Boolean(acc.enabled), values };
    }),
    defaultCourier: cfg.defaultCourier || null,
    allowSellers: cfg.allowSellers !== false,
    sellerPickup: cfg.sellerPickup || {},
    lastSyncAt: cfg.lastSyncAt || null,
    lastSyncNote: cfg.lastSyncNote || '',
  });

  app.get('/api/couriers/settings', d.requireAdmin, async (_req, res) => {
    try {
      res.json(publicConfig(await loadConfig(true)));
    } catch (err) {
      fail(res, err, 'settings');
    }
  });

  app.post('/api/couriers/settings', d.requireAdmin, async (req, res) => {
    try {
      const cfg = await loadConfig(true);
      const patch: Partial<CourierConfig> = {};
      const id = str(req.body?.id, 20) as CourierId;
      const info = id ? courierInfo(id) : undefined;
      if (id && !info) return res.status(400).json({ error: 'Unknown courier.' });
      if (info) {
        const acc: CourierAccount = { ...(cfg.accounts?.[id] || {}) };
        const secrets = { ...(acc.secrets || {}) };
        const options = { ...(acc.options || {}) };
        const sent = (req.body?.values || {}) as Record<string, unknown>;
        for (const f of info.fields) {
          if (!(f.key in sent)) continue;
          const v = str(sent[f.key], 500);
          // A masked value coming back means "keep the saved key"
          if (f.secret) {
            if (v && !v.startsWith('saved ')) secrets[f.key] = v;
            if (req.body?.clear === true) delete secrets[f.key];
          } else options[f.key] = v;
        }
        acc.secrets = secrets;
        acc.options = options;
        if (typeof req.body?.enabled === 'boolean') acc.enabled = req.body.enabled;
        if (acc.enabled) {
          const missing = info.fields.filter((f) => f.required && !(f.secret ? secrets[f.key] : options[f.key]));
          if (missing.length) return res.status(400).json({ error: `Enter ${missing.map((f) => f.label).join(' and ')} first.` });
        }
        patch.accounts = { ...(cfg.accounts || {}), [id]: acc };
      }
      if (req.body?.defaultCourier !== undefined) {
        const dc = str(req.body.defaultCourier, 20) as CourierId;
        patch.defaultCourier = courierInfo(dc) ? dc : (null as any);
      }
      if (typeof req.body?.allowSellers === 'boolean') patch.allowSellers = req.body.allowSellers;
      if (req.body?.sellerPickup && typeof req.body.sellerPickup === 'object') {
        const sp: CourierConfig['sellerPickup'] = {};
        for (const [sid, m] of Object.entries(req.body.sellerPickup as Record<string, any>).slice(0, 2000)) {
          const row: Partial<Record<CourierId, string>> = {};
          for (const c of COURIER_CATALOG) if (c.pickupField && str(m?.[c.id], 60)) row[c.id] = str(m[c.id], 60);
          if (Object.keys(row).length) sp[str(sid, 128)] = row;
        }
        patch.sellerPickup = sp;
      }
      await saveConfig(patch);
      res.json(publicConfig(await loadConfig(true)));
    } catch (err) {
      fail(res, err, 'save settings');
    }
  });

  app.post('/api/couriers/test', d.requireAdmin, async (req, res) => {
    try {
      const id = str(req.body?.id, 20) as CourierId;
      const adapter = ADAPTERS[id];
      if (!adapter) return res.status(400).json({ error: 'Unknown courier.' });
      const cfg = await loadConfig(true);
      const acc = cfg.accounts?.[id];
      if (!acc?.secrets || !Object.values(acc.secrets).some(Boolean)) return res.status(400).json({ error: 'Save the API key first.' });
      res.json({ ok: true, ...(await adapter.test(acc)) });
    } catch (err) {
      fail(res, err, 'test');
    }
  });

  // ---------------------------------------------------------------- booking

  const bookOrder = async (opts: { orderId: string; courier: CourierId; sellerUid?: string; by: string; body: any }) => {
    const cfg = await loadConfig();
    const acc = enabledAccount(cfg, opts.courier);
    const info = courierInfo(opts.courier)!;
    const ref = adminDb.collection('orders').doc(opts.orderId);
    const snap = await ref.get();
    const o = snap.exists ? (snap.data() as any) : null;
    if (!o || (opts.sellerUid && o.sellerId !== opts.sellerUid)) throw new CourierError('Order not found.');
    if (!BOOKABLE_STATUSES.includes(o.status)) throw new CourierError('Only confirmed orders that are not shipped yet can be booked.');
    if (o.paymentMethod === 'CARD' && o.paymentStatus !== 'PAID') throw new CourierError('This order is waiting for the card payment.');
    if (o.courierBooking?.active && o.courierBooking?.trackingNumber && opts.body?.rebook !== true) {
      throw new CourierError(`Already booked with ${o.courierBooking.courier}: ${o.courierBooking.trackingNumber}.`);
    }
    if ((o.destCountryIso || o.shippingAddress?.countryCode || 'PK') !== 'PK') throw new CourierError('Courier booking is for orders inside Pakistan.');

    // The seller ships from their own address (multi-vendor); house orders from the store's account address
    const sellerId = String(o.sellerId || '');
    let shipper = { name: '', phone: '', address: '', city: '', email: '' };
    if (sellerId && sellerId !== 'house') {
      const [s, p] = await Promise.all([adminDb.collection('sellers').doc(sellerId).get(), adminDb.collection('seller_private').doc(sellerId).get()]);
      const sd = (s.data() || {}) as any;
      const pd = (p.data() || {}) as any;
      shipper = {
        name: String(sd.shopName || sd.businessName || ''),
        phone: localPhone(sd.phone),
        address: String(pd.address || ''),
        city: String(sd.warehouseCity || sd.city || ''),
        email: String(sd.ownerEmail || ''),
      };
    }
    const addr = o.shippingAddress || {};
    const city = String(addr.city || '').trim() || String(o.shippingAddressSummary || '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(-2, -1)[0] || '';
    if (!city) throw new CourierError('The delivery city is missing on this order.');
    const items: any[] = Array.isArray(o.items) ? o.items : [];
    const pieces = Math.max(1, Math.min(99, Number(opts.body?.pieces) || items.reduce((n, it) => n + (Number(it.quantity) || 0), 0) || 1));
    const weightKg = Math.max(0.1, Math.min(100, Number(opts.body?.weightKg) || Number(o.shippingCalculationSnapshot?.billableWeightKg) || 0.5));
    const cod = o.paymentMethod === 'COD' && o.paymentStatus !== 'PAID' ? Number(o.total) || 0 : 0;

    const result = await ADAPTERS[opts.courier].book(acc, {
      orderRef: String(o.orderNumber || opts.orderId),
      customerName: String(o.customerName || '').slice(0, 100),
      customerPhone: String(o.customerPhone || addr.phoneNumber || ''),
      address: [addr.line1, addr.line2, addr.area].filter(Boolean).join(', ') || String(o.shippingAddressSummary || ''),
      city,
      codAmount: cod,
      pieces,
      weightKg,
      description: items.map((it) => `${it.quantity} x ${it.name}${it.variant ? ` (${it.variant})` : ''}`).join(', ').slice(0, 250) || 'Parcel',
      notes: str(opts.body?.notes, 200),
      pickupCode: sellerId ? cfg.sellerPickup?.[sellerId]?.[opts.courier] : undefined,
      shipper,
    });

    const now = new Date().toISOString();
    const booking = {
      courier: info.name,
      courierId: opts.courier,
      trackingNumber: result.trackingNumber,
      ...(result.labelUrl ? { labelUrl: result.labelUrl } : {}),
      bookedAt: now,
      bookedBy: opts.by,
      active: true,
      codAmount: cod,
    };
    await ref.update({
      courierBooking: booking,
      courierName: info.name,
      trackingNumber: result.trackingNumber,
      updatedAt: now,
      trackingEvents: d.appendTrackingEvent(o.trackingEvents, { at: now, note: `Parcel booked with ${info.name} (tracking ${result.trackingNumber}).` }),
    });
    if (sellerId) d.forgetOrders(sellerId);
    return { courierName: info.name, trackingNumber: result.trackingNumber, labelUrl: result.labelUrl || null, hasLabel: Boolean(result.labelUrl || ADAPTERS[opts.courier].label) };
  };

  app.post('/api/couriers/book', d.requireAdmin, async (req, res) => {
    try {
      res.json(await bookOrder({ orderId: str(req.body?.orderId, 128), courier: str(req.body?.courier, 20) as CourierId, by: 'store', body: req.body }));
    } catch (err) {
      fail(res, err, 'book');
    }
  });

  // Sellers book with the store's courier accounts (when the store allows it)
  app.get('/api/seller/couriers', d.requireSeller, async (_req, res) => {
    try {
      const cfg = await loadConfig();
      const list = cfg.allowSellers === false ? [] : COURIER_CATALOG.filter((c) => cfg.accounts?.[c.id]?.enabled).map((c) => ({ id: c.id, label: c.label }));
      res.json({ couriers: list, defaultCourier: list.some((c) => c.id === cfg.defaultCourier) ? cfg.defaultCourier : list[0]?.id || null });
    } catch (err) {
      fail(res, err, 'seller list');
    }
  });

  app.post('/api/seller/couriers/book', d.requireSeller, async (req, res) => {
    try {
      const cfg = await loadConfig();
      if (cfg.allowSellers === false) return res.status(403).json({ error: 'Courier booking is not open for sellers.' });
      const uid = (req as any).user.uid as string;
      res.json(await bookOrder({ orderId: str(req.body?.orderId, 128), courier: str(req.body?.courier, 20) as CourierId, sellerUid: uid, by: 'seller', body: req.body }));
    } catch (err) {
      fail(res, err, 'seller book');
    }
  });

  // The courier's label (airway bill) to print and stick on the parcel
  const sendLabel = async (res: express.Response, orderId: string, sellerUid?: string) => {
    const snap = await adminDb.collection('orders').doc(orderId).get();
    const o = snap.exists ? (snap.data() as any) : null;
    const b = o?.courierBooking;
    if (!o || (sellerUid && o.sellerId !== sellerUid) || !b?.trackingNumber) throw new CourierError('This order has no courier booking.');
    if (b.labelUrl) return res.json({ url: b.labelUrl });
    const adapter = ADAPTERS[b.courierId as CourierId];
    if (!adapter?.label) throw new CourierError(`Print the label from the ${b.courier} portal (tracking ${b.trackingNumber}).`);
    const cfg = await loadConfig();
    const out = await adapter.label(enabledAccount(cfg, b.courierId), b.trackingNumber);
    if (out.url) return res.json({ url: out.url });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="label-${o.orderNumber || orderId}.pdf"`);
    return res.send(out.pdf);
  };
  app.get('/api/couriers/label', d.requireAdmin, async (req, res) => {
    try {
      await sendLabel(res, str(req.query.orderId, 128));
    } catch (err) {
      fail(res, err, 'label');
    }
  });
  app.get('/api/seller/couriers/label', d.requireSeller, async (req, res) => {
    try {
      await sendLabel(res, str(req.query.orderId, 128), (req as any).user.uid);
    } catch (err) {
      fail(res, err, 'seller label');
    }
  });

  // ---------------------------------------------------------------- automatic tracking

  let syncing = false;
  const syncAll = async () => {
    if (syncing) return 'A check is already running.';
    syncing = true;
    let checked = 0;
    let changed = 0;
    let errors = 0;
    try {
      const cfg = await loadConfig();
      if (!COURIER_CATALOG.some((c) => cfg.accounts?.[c.id]?.enabled)) return 'No courier is connected.';
      // Only booked parcels still on the way are read (one small query)
      const snap = await adminDb.collection('orders').where('courierBooking.active', '==', true).limit(300).get();
      for (const doc of snap.docs) {
        const o = doc.data() as any;
        const b = o.courierBooking;
        if (!ACTIVE_STATUSES.includes(o.status)) {
          await doc.ref.update({ 'courierBooking.active': false });
          continue;
        }
        const acc = cfg.accounts?.[b?.courierId as CourierId];
        const adapter = ADAPTERS[b?.courierId as CourierId];
        if (!acc?.enabled || !adapter) continue;
        checked++;
        try {
          const t = await adapter.track(acc, b.trackingNumber);
          const now = new Date().toISOString();
          if (!t.status || t.status === b.lastStatus) {
            await doc.ref.update({ 'courierBooking.lastCheckedAt': now });
            continue;
          }
          const next = orderStatusFromCourier(t.status);
          const order = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'];
          // The order only moves forward (never back from "out for delivery" to "shipped")
          const moves = next && order.indexOf(next) > order.indexOf(o.status) && !(next === 'SHIPPED' && order.includes(o.status));
          const bookingUpdate: Record<string, any> = {
            'courierBooking.lastStatus': t.status,
            'courierBooking.lastCheckedAt': now,
            ...(next === 'DELIVERED' || next === 'RETURNED' ? { 'courierBooking.active': false } : {}),
          };
          if (moves) {
            const updates: Record<string, any> & { status: string } = { status: next!, updatedAt: now, ...bookingUpdate };
            if (next === 'DELIVERED' && o.paymentMethod === 'COD') updates.paymentStatus = 'PAID';
            await d.applyOrderStatusWithStock(doc.ref, updates);
          } else {
            await doc.ref.update({
              ...bookingUpdate,
              trackingEvents: d.appendTrackingEvent(o.trackingEvents, { at: now, note: `${b.courier}: ${t.status}` }),
            });
          }
          if (o.sellerId) d.forgetOrders(o.sellerId);
          changed++;
        } catch (err) {
          errors++;
          if (!(err instanceof CourierError)) console.error('[couriers] track failed:', err);
        }
      }
      return `Checked ${checked} parcel(s): ${changed} updated${errors ? `, ${errors} could not be checked` : ''}.`;
    } finally {
      syncing = false;
    }
  };

  const runSync = async () => {
    try {
      const note = await syncAll();
      if (note !== 'No courier is connected.') await saveConfig({ lastSyncAt: new Date().toISOString(), lastSyncNote: note });
      return note;
    } catch (err) {
      console.error('[couriers] sync failed:', err);
      return 'The check failed. It will try again later.';
    }
  };
  app.post('/api/couriers/sync', d.requireAdmin, async (_req, res) => {
    res.json({ note: await runSync() });
  });
  setTimeout(() => void runSync(), 5 * 60_000);
  setInterval(() => void runSync(), SYNC_EVERY_MS);
}
