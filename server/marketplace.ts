import type express from 'express';
import crypto from 'crypto';
import { ratingSummary } from './feedback';
import { POLICY, escrowReleased, dispatchClockStart, needsBrandProof, isTestOrder, isSellerFaultCancel, MIN_ORDERS_FOR_RATES } from './policyRules';
import { buildCoach } from './coach';
import { cleanProductInfo, type ProductInfo } from '../src/services/productInfo';
import { famousBrandIn } from '../src/services/brandRules';
import { cleanProductShipping, type ProductShipping } from '../src/services/productShipping';
import { KYC_LABELS, KYC_MAX_BYTES, idDocTypeFor, requiredKyc, type KycKind } from '../src/services/sellerOnboarding';
import { checkVendorApplication } from '../src/services/vendorRules';
import { checkPhone } from '../src/services/intlAddress';

// Marketplace: seller applications, the Seller Center API (own shop, products, orders, earnings)
// and the admin side (approve/suspend sellers, commission, payouts).
//
// Data:
//   sellers/{uid}         public-ish shop record (status, shop name, commission override)
//   seller_private/{uid}  CNIC, address and bank details (seller + admins only)
//   products.sellerId     owner of each product (absent = the store itself, "house")
//   orders.sellerId       one order per seller per checkout
//   order_private         commissionAmount, sellerEarning and payoutId per order
//   payouts/{id}          money the store has transferred to a seller
// Every write here goes through the server (Firestore rules allow browsers to read only).

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface MarketplaceDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAuth: Handler;
  requireAdmin: Handler;
  applyOrderStatusWithStock: (
    ref: FirebaseFirestore.DocumentReference,
    updates: Record<string, any> & { status: string }
  ) => Promise<{ restored: boolean; retaken: boolean }>;
  appendTrackingEvent: (existing: any, event: { at: string; status?: string; location?: string; note: string }) => any[];
  isInsufficientStockError: (err: unknown) => boolean;
  /** Live (ACTIVE) products of one seller from the server's in-memory catalog mirror, or null while it loads */
  activeProductsOfSeller: (sellerId: string) => any[] | null;
  /** Every product of one seller (any status) from the mirror, or null while it loads */
  allProductsOfSeller: (sellerId: string) => any[] | null;
  /** Supplier data of a product from the mirror; undefined while it loads */
  supplierOf: (productId: string) => any | null | undefined;
  /** Copies remote images into the store's Firebase Storage (old URL -> stored URL) */
  archiveImageUrls: (urls: unknown[]) => Promise<{ storageUnavailable: boolean; results: Record<string, string> }>;
  /** Sends a notice to one seller's Seller Center inbox */
  postNotice: (sellerId: string, sellerName: string, title: string, body: string, level: 'INFO' | 'WARNING' | 'URGENT') => Promise<void>;
  /** Saves an uploaded picture / video and returns its public URL */
  storeMedia: (buffer: Buffer, ext: string, contentType: string) => Promise<string>;
  /** Saves / reads a private file (sellers' ID and business documents); never publicly served */
  storePrivateFile: (rel: string, buffer: Buffer) => Promise<void>;
  readPrivateFile: (rel: string) => Promise<Buffer | null>;
  HOUSE_SELLER_ID: string;
  DEFAULT_COMMISSION_PERCENT: number;
  /** Tells the seller by email that their shop was approved / rejected / suspended */
  emailSellerStatus: (seller: any, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED', reason: string, vendorId?: string) => Promise<void>;
}

const SELLER_ORDER_STATUSES = ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const CLOSED_STATUSES = ['CANCELLED', 'RETURNED', 'REFUNDED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'];
const SHIPPED_OR_LATER = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const MAX_PRODUCT_IMAGES = 8;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'product';

export function registerMarketplaceRoutes(app: express.Express, d: MarketplaceDeps) {
  const { adminDb } = d;
  const sellersCol = () => adminDb.collection('sellers');

  // ---------------------------------------------------------------- helpers

  const loadSeller = async (uid: string) => {
    const [s, p] = await Promise.all([sellersCol().doc(uid).get(), adminDb.collection('seller_private').doc(uid).get()]);
    return { seller: s.exists ? (s.data() as any) : null, privateData: p.exists ? (p.data() as any) : null };
  };

  // Shop records are read on every Seller Center request; keep them for a minute (dropped on every change)
  const sellerCache = new Map<string, { at: number; seller: any }>();
  const SELLER_CACHE_MS = 60_000;
  const getSellerCached = async (uid: string) => {
    const hit = sellerCache.get(uid);
    if (hit && Date.now() - hit.at < SELLER_CACHE_MS) return hit.seller;
    const snap = await sellersCol().doc(uid).get();
    const seller = snap.exists ? (snap.data() as any) : null;
    sellerCache.set(uid, { at: Date.now(), seller });
    return seller;
  };
  const forgetSeller = (uid: string) => sellerCache.delete(uid);

  // Money and account decisions (payouts, approving / suspending a seller, commission) are for the
  // owner and admins only, not the manager roles that handle orders or products
  const requireFullAdmin: Handler = (req, res, next) =>
    d.requireAdmin(req, res, () => {
      if (!['SUPER_ADMIN', 'ADMIN'].includes(String((req as any).user?.role || ''))) {
        return res.status(403).json({ error: 'Only the store owner or an admin can do this.' });
      }
      next();
    });

  // Signed-in user whose seller shop is approved; the shop is attached as req.seller
  const requireSeller: Handler = (req, res, next) =>
    d.requireAuth(req, res, async () => {
      try {
        const uid = (req as any).user.uid as string;
        const seller = await getSellerCached(uid);
        if (!seller) return res.status(403).json({ error: 'Please apply for a seller account first.', code: 'NOT_A_SELLER' });
        if (seller.status !== 'APPROVED') {
          return res.status(403).json({ error: 'Your seller account is not approved yet.', code: `SELLER_${seller.status}` });
        }
        (req as any).seller = seller;
        next();
      } catch (err) {
        console.error('[requireSeller] failed:', err);
        res.status(503).json({ error: 'Could not load your seller account. Please try again.' });
      }
    });

  // Listing products needs the current Supplier Code of Conduct accepted
  const requireConduct: Handler = (req, res, next) => {
    if ((req as any).seller?.conductVersion === POLICY.CONDUCT_VERSION) return next();
    res.status(403).json({ error: 'Please read and accept the Seller Rules (Code of Conduct) first.', code: 'CONDUCT_REQUIRED' });
  };

  // The store's default commission, re-read at most once a minute
  let defaultCommissionCache: { at: number; pct: number } | null = null;
  const commissionFor = async (seller: any) => {
    if (typeof seller?.commissionPercent === 'number') return seller.commissionPercent;
    if (defaultCommissionCache && Date.now() - defaultCommissionCache.at < 60_000) return defaultCommissionCache.pct;
    let pct = d.DEFAULT_COMMISSION_PERCENT;
    try {
      const cfg = await adminDb.collection('settings').doc('store_config').get();
      const v = cfg.data()?.marketplaceCommissionPercent;
      if (typeof v === 'number') pct = v;
    } catch {}
    defaultCommissionCache = { at: Date.now(), pct };
    return pct;
  };

  // Orders of one seller with their money details (from order_private)
  const loadSellerOrders = async (sellerId: string, limit = 300) => {
    const snap = await adminDb.collection('orders').where('sellerId', '==', sellerId).limit(limit).get();
    const orders = snap.docs.map((doc) => ({ ...(doc.data() as any), id: doc.id }));
    const privRefs = orders.map((o) => adminDb.collection('order_private').doc(o.id));
    const privs = privRefs.length ? await adminDb.getAll(...privRefs) : [];
    const privById = new Map(privs.map((p) => [p.id, (p.data() as any) || {}]));
    return orders
      .map((o) => {
        const p = privById.get(o.id) || {};
        // Supplier details of each item (the seller's own dropshipping data, recorded when the order was placed)
        const supplierItems = (Array.isArray(p.items) ? p.items : []).filter((s: any) => s && s.productId);
        const supplierCost = money(
          (o.items || []).reduce((sum: number, it: any) => {
            const s = supplierItems.find((x: any) => x.productId === it.productId);
            return sum + (Number(s?.supplierCostPrice) || 0) * (Number(it.quantity) || 0);
          }, 0)
        );
        return {
          ...o,
          commissionPercent: p.commissionPercent ?? 0,
          commissionAmount: p.commissionAmount ?? 0,
          sellerEarning: p.sellerEarning ?? 0,
          payoutId: p.payoutId || null,
          supplierItems,
          supplierCost,
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  };

  // A seller's orders are read once and kept for 30 seconds (every order costs two reads); the
  // seller's own updates and payouts drop the copy at once
  const ordersCache = new Map<string, { at: number; orders: any[] }>();
  const sellerOrdersCached = async (sellerId: string) => {
    const hit = ordersCache.get(sellerId);
    if (hit && Date.now() - hit.at < 30_000) return hit.orders;
    // Unpaid card orders are not the seller's yet: left out of lists, earnings and reports
    const orders = (await loadSellerOrders(sellerId, 1000)).filter((o: any) => !awaitingCardPayment(o));
    ordersCache.set(sellerId, { at: Date.now(), orders });
    return orders;
  };
  // An order change also makes the Shop Coach report recalculate (so a fixed problem disappears)
  const forgetOrders = (sellerId: string) => {
    ordersCache.delete(sellerId);
    forgetCoach(sellerId);
  };
  // set once the coach cache exists (further down)
  let forgetCoach: (sellerId: string) => void = () => {};

  // Return charges not yet taken off a payout (seller_charges/{id}, written by server/policy.ts)
  const unpaidChargesOf = async (sellerId: string) => {
    const snap = await adminDb.collection('seller_charges').where('sellerId', '==', sellerId).limit(300).get();
    return snap.docs
      .map((doc) => ({ ...(doc.data() as any), id: doc.id }))
      .filter((c) => !c.payoutId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  };

  // Money of delivered orders is held for the 7-day return window (escrow), then becomes payable;
  // unpaid return charges (returns that were the seller's fault) are taken off the next payout
  const summarizeEarnings = (orders: any[], unpaidCharges = 0) => {
    let pending = 0;
    let onHold = 0;
    let available = 0;
    let paid = 0;
    let commission = 0;
    let supplierCost = 0;
    let earnings = 0;
    for (const o of orders) {
      if (CLOSED_STATUSES.includes(o.status)) continue;
      commission += Number(o.commissionAmount) || 0;
      supplierCost += Number(o.supplierCost) || 0;
      earnings += Number(o.sellerEarning) || 0;
      if (o.status === 'DELIVERED') {
        if (o.payoutId) paid += Number(o.sellerEarning) || 0;
        else if (escrowReleased(o)) available += Number(o.sellerEarning) || 0;
        else onHold += Number(o.sellerEarning) || 0;
      } else {
        pending += Number(o.sellerEarning) || 0;
      }
    }
    return {
      pending: money(pending),
      onHold: money(onHold),
      returnCharges: money(unpaidCharges),
      available: money(Math.max(0, available - unpaidCharges)),
      paid: money(paid),
      commission: money(commission),
      supplierCost: money(supplierCost),
      // earnings after paying suppliers (dropshipping), before returns
      profit: money(earnings - supplierCost),
    };
  };

  // Strip supplier/internal fields before sending an order to the seller
  /** Card order whose payment has not arrived (server/cardPayments.ts confirms or cancels it) */
  const awaitingCardPayment = (o: any) => o?.paymentMethod === 'CARD' && o?.paymentStatus !== 'PAID' && o?.status !== 'CANCELLED';
  const sellerSafeOrder = (o: any) => {
    const { orderAccessToken, ...rest } = o;
    return {
      ...rest,
      items: (o.items || []).map(({ supplierName, supplierSku, supplierProductUrl, supplierCostPrice, ...item }: any) => item),
    };
  };

  // ---------------------------------------------------------------- seller: account

  // The seller accepts the Supplier Code of Conduct (needed again whenever it changes)
  app.post('/api/seller/conduct/accept', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    if (req.body?.version !== POLICY.CONDUCT_VERSION) return res.status(409).json({ error: 'The rules have changed. Please reload and read them again.' });
    try {
      await sellersCol().doc(uid).set({ conductVersion: POLICY.CONDUCT_VERSION, conductAcceptedAt: new Date().toISOString() }, { merge: true });
      forgetSeller(uid);
      res.json({ success: true, conductVersion: POLICY.CONDUCT_VERSION });
    } catch (err) {
      console.error('[seller/conduct] failed:', err);
      res.status(503).json({ error: 'Could not save. Please try again.' });
    }
  });

  app.get('/api/seller/me', d.requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      const { seller, privateData } = await loadSeller(uid);
      let commissionPercent: number | null = null;
      if (seller) commissionPercent = await commissionFor(seller);
      res.json({ success: true, seller, privateData, commissionPercent, conductVersion: POLICY.CONDUCT_VERSION });
    } catch (err) {
      console.error('[seller/me] failed:', err);
      res.status(503).json({ error: 'Could not load your seller account. Please try again.' });
    }
  });

  // What the sign-up wizard asks for. Mobile OTP is switched on with SELLER_PHONE_OTP=required in
  // .env once SMS sign-in is enabled in Firebase (until then the number is only checked by format).
  const phoneOtpRequired = () => String(process.env.SELLER_PHONE_OTP || '').toLowerCase() === 'required';
  app.get('/api/seller/onboarding-config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ phoneOtp: phoneOtpRequired() });
  });

  // ID card / passport / business documents, uploaded during sign-up (before the seller record
  // exists). Saved privately under kyc/<uid>/; only admins can open them.
  const sniffDoc = (b: Buffer): { ext: string; type: string } | null => {
    if (b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
    if (b.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', type: 'application/pdf' };
    return null;
  };
  const KYC_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
  app.post('/api/seller/kyc/upload', d.requireAuth, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const kind = String(req.query.kind || '') as KycKind;
    if (!(kind in KYC_LABELS)) return res.status(400).json({ error: 'Unknown document.' });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) return res.status(400).json({ error: 'Choose a file to upload.' });
    if (body.length > KYC_MAX_BYTES) return res.status(413).json({ error: 'The file is too large (8 MB at most).' });
    const t = sniffDoc(body);
    if (!t) return res.status(400).json({ error: 'Upload a photo (JPG, PNG, WEBP) or a PDF.' });
    try {
      const ref = `kyc/${uid}/${kind}-${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}.${t.ext}`;
      await d.storePrivateFile(ref, body);
      res.json({ success: true, kind, ref });
    } catch (err) {
      console.error('[seller/kyc/upload] failed:', err);
      res.status(503).json({ error: 'Could not save the document. Please try again.' });
    }
  });

  // Admins open a seller's document (sent as the file itself; never cached)
  app.get('/api/admin/sellers/:id/kyc/:kind', d.requireAdmin, async (req, res) => {
    try {
      const snap = await adminDb.collection('seller_private').doc(String(req.params.id)).get();
      const ref = String(snap.data()?.kycDocs?.[String(req.params.kind)] || '');
      if (!ref.startsWith(`kyc/${req.params.id}/`)) return res.status(404).json({ error: 'No such document.' });
      const file = await d.readPrivateFile(ref);
      if (!file) return res.status(404).json({ error: 'The file is missing on this server.' });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', KYC_TYPES[ref.split('.').pop() || ''] || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline');
      res.send(file);
    } catch (err) {
      console.error('[admin/sellers kyc] failed:', err);
      res.status(503).json({ error: 'Could not open the document.' });
    }
  });

  const hashOf = (v: string) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 40);

  // Apply (or re-apply after a rejection). The store's admins approve applications.
  app.post('/api/seller/apply', d.requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first (check your inbox for the link), then apply.', code: 'EMAIL_NOT_VERIFIED' });
    }
    // Sellers from any country: identity, tax number, payout and warehouse checked by the country's
    // rules (src/services/vendorRules.ts)
    const checked = checkVendorApplication(req.body || {});
    if (!checked.ok) return res.status(400).json({ error: `Please check: ${checked.problems.join(', ')}.`, problems: checked.problems });
    const a = checked.app;

    // Mobile number proved with an SMS code (the account's verified phone must be this number)
    const phoneVerified = Boolean(user.phoneNumber) && user.phoneNumber === checked.phoneE164;
    if (phoneOtpRequired() && !phoneVerified) {
      return res.status(400).json({ error: 'Please verify your mobile number with the SMS code first.', code: 'PHONE_NOT_VERIFIED' });
    }

    // ID card (both sides) / passport, and the business registration for companies
    const idDocType = idDocTypeFor(a.countryCode, req.body?.idDocType);
    const sentDocs = (req.body?.kycDocs || {}) as Record<string, unknown>;
    const kycDocs: Record<string, string> = {};
    for (const kind of requiredKyc(a.countryCode, a.sellerType, idDocType)) {
      const ref = String(sentDocs[kind] || '');
      if (!ref.startsWith(`kyc/${user.uid}/${kind}-`) || !(await d.readPrivateFile(ref))) {
        return res.status(400).json({ error: `Please upload: ${KYC_LABELS[kind]}.`, code: 'KYC_MISSING' });
      }
      kycDocs[kind] = ref;
    }
    const { shopName, ownerName, phone, city, address } = a;
    // Older screens read these from seller_private; kept filled for every payout method
    const legacyBank = {
      bankName: a.payout.bankName || (a.payout.method === 'PAYONEER' ? 'Payoneer' : ''),
      accountTitle: a.payout.accountHolder,
      accountNumber: a.payout.iban || a.payout.accountNumber || a.payout.payoneerEmail || '',
    };

    try {
      const ref = sellersCol().doc(user.uid);
      const existing = await ref.get();
      const current = existing.data() as any;
      if (current?.status === 'APPROVED') return res.status(409).json({ error: 'Your seller account is already approved.' });
      if (current?.status === 'SUSPENDED') return res.status(403).json({ error: 'Your seller account is suspended. Please contact the store.' });

      // Shop names must be unique (case-insensitive)
      const shopKey = shopName.toLowerCase();
      const clash = await sellersCol().where('shopKey', '==', shopKey).limit(2).get();
      if (clash.docs.some((doc) => doc.id !== user.uid)) {
        return res.status(409).json({ error: 'A shop with this name already exists. Please choose another name.' });
      }

      // One seller account per ID document and per mobile number (only hashes are compared and kept)
      const idHash = hashOf(`${a.countryCode}:${a.idNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`);
      const phoneHash = hashOf(checked.phoneE164);
      const privCol = adminDb.collection('seller_private');
      const [idClash, phoneClash] = await Promise.all([
        privCol.where('idHash', '==', idHash).limit(2).get(),
        privCol.where('phoneHash', '==', phoneHash).limit(2).get(),
      ]);
      if (idClash.docs.some((doc) => doc.id !== user.uid)) {
        return res.status(409).json({ error: 'This ID number is already registered with another seller account. Please sign in to that account, or contact the store.', code: 'DUPLICATE_ID' });
      }
      if (phoneClash.docs.some((doc) => doc.id !== user.uid)) {
        return res.status(409).json({ error: 'This mobile number is already registered with another seller account.', code: 'DUPLICATE_PHONE' });
      }

      const now = new Date().toISOString();
      await ref.set({
        id: user.uid,
        ownerUid: user.uid,
        ownerEmail: String(user.email || '').toLowerCase(),
        ownerName,
        shopName,
        shopKey,
        phone,
        city,
        sellerType: a.sellerType,
        ...(a.businessName ? { businessName: a.businessName } : {}),
        countryCode: a.countryCode,
        warehouseCountry: a.warehouseCountry,
        warehouseCity: a.warehouseCity,
        // given at approval: vendorId and shipsFromCountry
        ...(current?.vendorId ? { vendorId: current.vendorId } : {}),
        // What the admin sees at a glance before approving
        phoneVerified,
        kycSubmitted: Object.keys(kycDocs),
        status: 'PENDING',
        statusReason: '',
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });
      await adminDb.collection('seller_private').doc(user.uid).set({
        // CNIC in Pakistan, national ID / passport elsewhere (kept as "cnic" too for older screens)
        idNumber: a.idNumber,
        cnic: a.countryCode === 'PK' ? a.idNumber : '',
        ...(a.taxId ? { taxId: a.taxId } : {}),
        address,
        payout: a.payout,
        ...legacyBank,
        idDocType,
        kycDocs,
        idHash,
        phoneHash,
        updatedAt: now,
      });
      forgetSeller(user.uid);
      res.json({ success: true, status: 'PENDING' });
    } catch (err) {
      console.error('[seller/apply] failed:', err);
      res.status(503).json({ error: 'Could not save your application. Please try again.' });
    }
  });

  // Approved sellers update contact and bank details
  app.put('/api/seller/profile', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const b = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    const priv: Record<string, any> = { updatedAt: updates.updatedAt };
    if (b.phone !== undefined) {
      // Checked by the seller's own country (Pakistani numbers stay 03XXXXXXXXX)
      const country = String((req as any).seller?.countryCode || 'PK');
      const ph = checkPhone(country, str(b.phone, 30));
      if (!ph.valid) return res.status(400).json({ error: ph.message || 'Enter a valid mobile number.' });
      updates.phone = country === 'PK' ? `0${ph.e164.slice(3)}` : ph.e164;
    }
    if (b.city !== undefined) updates.city = str(b.city, 60);
    if (b.logoUrl !== undefined) {
      const logo = String(b.logoUrl || '').trim();
      // Sent from the browser already cropped and shrunk to 256px; Firebase Storage is not available
      // on the free plan, so the small image is kept on the shop record itself
      if (logo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) && !/^https:\/\/\S+$/i.test(logo)) {
        return res.status(400).json({ error: 'Unsupported picture format. Please choose a JPG or PNG.' });
      }
      if (logo.length > 200_000) return res.status(400).json({ error: 'This picture is too large. Please choose a smaller one.' });
      updates.logoUrl = logo;
    }
    if (b.address !== undefined) priv.address = str(b.address, 300);
    if (b.bankName !== undefined) priv.bankName = str(b.bankName, 60);
    if (b.accountTitle !== undefined) priv.accountTitle = str(b.accountTitle, 80);
    if (b.accountNumber !== undefined) priv.accountNumber = str(b.accountNumber, 40).replace(/\s+/g, '');
    try {
      await sellersCol().doc(uid).set(updates, { merge: true });
      await adminDb.collection('seller_private').doc(uid).set(priv, { merge: true });
      forgetSeller(uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/profile] failed:', err);
      res.status(503).json({ error: 'Could not save your profile. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- seller: products

  // Only what the product list shows; the full product is fetched when the seller opens it to edit
  const listFields = (p: any) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compareAtPrice || 0,
    stock: p.stock,
    category: p.category,
    status: p.status,
    primaryImage: p.primaryImage || '',
    likes: Number(p.likes) || 0,
    dislikes: Number(p.dislikes) || 0,
    adminHidden: p.adminHidden === true,
    adminHiddenReason: p.adminHiddenReason || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  });

  // Live products come from the server's catalog mirror (no Firestore reads, always current);
  // only drafts and archived ones are read from Firestore.
  app.get('/api/seller/products', requireSeller, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      let products: any[];
      const mirrored = d.allProductsOfSeller(uid);
      const live = mirrored ? null : d.activeProductsOfSeller(uid);
      if (mirrored) {
        products = mirrored;
      } else if (live) {
        let hidden: any[];
        try {
          const snap = await adminDb
            .collection('products')
            .where('sellerId', '==', uid)
            .where('status', 'in', ['DRAFT', 'ARCHIVED'])
            .limit(5000)
            .get();
          hidden = snap.docs.map((doc) => ({ ...(doc.data() as any), id: doc.id }));
        } catch {
          const snap = await adminDb.collection('products').where('sellerId', '==', uid).limit(5000).get();
          hidden = snap.docs.map((doc) => ({ ...(doc.data() as any), id: doc.id })).filter((p) => p.status !== 'ACTIVE');
        }
        products = [...live, ...hidden];
      } else {
        const snap = await adminDb.collection('products').where('sellerId', '==', uid).limit(5000).get();
        products = snap.docs.map((doc) => ({ ...(doc.data() as any), id: doc.id }));
      }
      products.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, products: products.map(listFields) });
    } catch (err) {
      console.error('[seller/products] failed:', err);
      res.status(503).json({ error: 'Could not load your products. Please try again.' });
    }
  });

  app.get('/api/seller/products/:id', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const id = String(req.params.id);
      const fromMirror = (d.allProductsOfSeller(uid) || []).find((p) => p.id === id);
      const mirroredSupplier = d.supplierOf(id);
      const [product, p] = await Promise.all([
        fromMirror ||
          adminDb
            .collection('products')
            .doc(id)
            .get()
            .then((s) => (s.exists ? { ...(s.data() as any), id: s.id } : null)),
        mirroredSupplier !== undefined
          ? mirroredSupplier || {}
          : adminDb
              .collection('product_private')
              .doc(id)
              .get()
              .then((s) => (s.data() as any) || {}),
      ]);
      if (!product || product.sellerId !== uid) return res.status(404).json({ error: 'Product not found.' });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        product,
        supplier: {
          supplierName: p.supplierName || '',
          supplierCostPrice: p.supplierCostPrice ?? p.costPrice ?? 0,
          supplierProductUrl: p.supplierProductUrl || '',
          supplierSku: p.supplierSku || '',
        },
        brandProofUrl: p.brandProofUrl || '',
        needsBrandProof: needsBrandProof(product),
      });
    } catch (err) {
      console.error('[seller/product] failed:', err);
      res.status(503).json({ error: 'Could not load this product. Please try again.' });
    }
  });

  // Checks one product sent by a seller (form or CSV row); returns an error message or the clean fields
  const readSellerProduct = (b: any) => {
    const name = str(b.name, 190);
    const price = money(b.price);
    const category = str(b.category, 75);
    // Up to 8 pictures (the first is the main one) and one optional video
    const mediaOk = (u: string) => /^https:\/\//i.test(u) || /^\/media\/[a-zA-Z0-9_.-]+$/.test(u);
    const images: string[] | undefined = Array.isArray(b.images)
      ? Array.from(new Set(b.images.map((u: unknown) => str(u, 980)).filter(Boolean) as string[])).slice(0, MAX_PRODUCT_IMAGES)
      : undefined;
    const primaryImage = images ? images[0] || '' : str(b.primaryImage, 980);
    const videoUrl = b.videoUrl === undefined ? undefined : str(b.videoUrl, 980);
    if (name.length < 3) return { error: 'Enter a product name (at least 3 characters).' };
    if (!(price > 0)) return { error: 'Enter a price (PKR).' };
    if (category.length < 2) return { error: 'Choose a category.' };
    if (primaryImage && !mediaOk(primaryImage)) return { error: 'The image link must start with https://' };
    if (images && images.some((u) => !mediaOk(u))) return { error: 'Every picture link must start with https://' };
    if (videoUrl && !mediaOk(videoUrl)) return { error: 'The video link must start with https://' };
    // Specifications / how to use / care / manual: only when the form sends them (a CSV row keeps them)
    let info: ProductInfo | undefined;
    if (b.info !== undefined) {
      const cleaned = cleanProductInfo(b.info);
      if ('error' in cleaned) return { error: cleaned.error };
      info = cleaned.info;
      // The form asks "Branded" or "No brand". A branded product names its brand; a no-brand product
      // may not use a well-known brand's name (copies listed as the real brand mislead customers).
      if (info.brandType === 'BRANDED' && str(b.brand, 75).length < 2) {
        return { error: 'Enter the brand name, or choose "No brand".' };
      }
      if (info.brandType === 'NONE') {
        const used = famousBrandIn(`${name} ${str(b.shortDescription, 480)}`);
        if (used) {
          return {
            error: `The title or short description mentions "${used}". A no-brand product cannot use a brand's name: remove it, or choose "Branded" and upload the purchase invoice / brand approval.`,
          };
        }
      }
    }
    // Where it ships and the seller's own fees: only when the form sends them (a CSV row keeps them)
    let shipping: ProductShipping | null | undefined;
    if (b.shipping !== undefined) {
      const checked = cleanProductShipping(b.shipping);
      if (checked.error) return { error: checked.error };
      shipping = checked.value || null;
    }
    return {
      fields: {
        name,
        shipping,
        price,
        compareAtPrice: money(b.compareAtPrice),
        stock: Math.max(0, Math.floor(Number(b.stock) || 0)),
        category,
        status: b.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
        primaryImage,
        images,
        videoUrl,
        info,
        sellerSku: str(b.sku, 60).replace(/[^a-zA-Z0-9_.-]/g, '-'),
      },
    };
  };

  // A product counts as new for followers when it goes live for the first time (new, or a draft published)
  let productsLiveHook: ((sellerId: string, shopName: string, products: any[]) => void) | null = null;
  const wentLive = (product: any, existing: any) => product.status === 'ACTIVE' && (!existing || existing.status === 'DRAFT');
  const announceLive = (uid: string, seller: any, products: any[]) => {
    if (products.length && productsLiveHook) {
      try {
        productsLiveHook(uid, seller.shopName || '', products);
      } catch (err: any) {
        console.warn('[followers] announce failed:', err?.message);
      }
    }
  };

  const skuPrefix = (uid: string) => `S${uid.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  const sellerSkuFor = (uid: string, sellerSku: string) => `${skuPrefix(uid)}-${sellerSku}`.slice(0, 95);

  const buildSellerProduct = (uid: string, seller: any, id: string, b: any, f: any, existing: any) => {
    const now = new Date().toISOString();
    const { name, price, compareAtPrice, stock, category, status, primaryImage } = f;
    // SKUs are unique across the store, so a seller's own code is kept behind their prefix
    const sku =
      existing?.sku ||
      (f.sellerSku
        ? sellerSkuFor(uid, f.sellerSku)
        : `${skuPrefix(uid)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`);
    const shortDescription = str(b.shortDescription, 480) || existing?.shortDescription || name.slice(0, 120);
    const description = str(b.description, 4800) || existing?.description || shortDescription;
    // A product the store has hidden stays hidden until the store restores it
    const adminHidden = existing?.adminHidden === true;
    const product: any = {
      // Fields this form does not edit (gallery images, variants, tags, specs, ...) are kept as they are
      ...(existing || {}),
      id,
      sku,
      name,
      slug: existing?.slug && existing?.name === name ? existing.slug : slugify(name),
      shortDescription,
      description,
      price,
      compareAtPrice: compareAtPrice > price ? compareAtPrice : 0,
      stock,
      reservedStock: existing?.reservedStock ?? 0,
      lowStockThreshold: existing?.lowStockThreshold ?? 5,
      category,
      subcategory: str(b.subcategory, 75) || existing?.subcategory || 'Marketplace',
      // "No brand" products carry the shop name; the form always sends brand (empty = the shop name);
      // a CSV row without one keeps the old brand
      brand:
        f.info?.brandType === 'NONE'
          ? seller.shopName
          : str(b.brand, 75) || (b.fromCsv ? existing?.brand : '') || seller.shopName,
      status: adminHidden ? 'DRAFT' : status,
      featured: existing?.featured ?? false,
      bestSeller: existing?.bestSeller ?? false,
      newArrival: existing?.newArrival ?? true,
      seoTitle: existing?.seoTitle || `${name} | ${seller.shopName}`.slice(0, 150),
      seoDescription: existing?.seoDescription || shortDescription.slice(0, 310),
      seoKeywords: existing?.seoKeywords || `${category.toLowerCase()}, ${seller.shopName.toLowerCase()}`.slice(0, 390),
      // A CSV row without a picture keeps the one the product already has
      primaryImage: primaryImage || (b.fromCsv ? existing?.primaryImage || '' : ''),
      // The form sends the whole gallery; a CSV row only changes the main picture
      images: f.images
        ? f.images
        : (() => {
            const old: string[] = Array.isArray(existing?.images) ? existing.images : [];
            const main = primaryImage || existing?.primaryImage || '';
            return main ? [main, ...old.filter((u) => u !== main)].slice(0, MAX_PRODUCT_IMAGES) : old;
          })(),
      videoUrl: f.videoUrl !== undefined ? f.videoUrl : existing?.videoUrl || '',
      rating: existing?.rating ?? 0,
      reviewCount: existing?.reviewCount ?? 0,
      weightKg: Math.max(0.05, Number(b.weightKg) || existing?.weightKg || 0.5),
      dimensions: str(b.dimensions, 100) || existing?.dimensions || '20cm x 15cm x 10cm',
      ...(f.info !== undefined ? { info: f.info } : existing?.info ? { info: existing.info } : {}),
      sellerId: uid,
      sellerName: seller.shopName,
      ...(seller.vendorId ? { vendorId: seller.vendorId } : {}),
      shipsFromCountry: String(seller.shipsFromCountry || seller.warehouseCountry || seller.countryCode || 'PK').toUpperCase(),
      ...(f.shipping ? { shipping: f.shipping } : {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    // The seller cleared the shipping settings: the store's rates apply again
    if (f.shipping === null) delete product.shipping;
    return product;
  };

  // Dropshipping data of a product (supplier, cost, link); kept in product_private, which only the
  // seller (through this API) and the store's admins can read
  const readSupplier = (b: any) => {
    const has = ['supplierName', 'supplierCostPrice', 'supplierProductUrl', 'supplierSku'].some(
      (k) => b[k] !== undefined && String(b[k]).trim() !== ''
    );
    if (!has) return null;
    const url = str(b.supplierProductUrl, 980);
    return {
      supplierName: str(b.supplierName, 80),
      supplierCostPrice: money(b.supplierCostPrice),
      supplierProductUrl: /^https?:\/\//i.test(url) ? url : '',
      supplierSku: str(b.supplierSku, 80),
    };
  };
  const supplierDoc = (productId: string, s: any) => ({
    productId,
    ...s,
    costPrice: s.supplierCostPrice,
    updatedAt: new Date().toISOString(),
  });

  // Bulk listing from a CSV the seller uploads (parsed in the browser). A row whose SKU matches one of
  // the seller's existing products updates it, so re-uploading a sheet refreshes price and stock.
  app.post('/api/seller/products/bulk', requireSeller, requireConduct, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    const rows = Array.isArray(req.body?.products) ? req.body.products.slice(0, 500) : [];
    if (!rows.length) return res.status(400).json({ error: 'No products found in the file.' });
    try {
      const existing =
        d.allProductsOfSeller(uid) ||
        (await adminDb.collection('products').where('sellerId', '==', uid).limit(5000).get()).docs.map((doc) => ({
          ...(doc.data() as any),
          id: doc.id,
        }));
      const bySku = new Map<string, { id: string; data: any }>();
      for (const data of existing) {
        if (data.sku) bySku.set(String(data.sku).toLowerCase(), { id: data.id, data });
      }
      const errors: { row: number; error: string }[] = [];
      let created = 0;
      let updated = 0;
      let heldForProof = 0;
      const live: any[] = [];
      let batch = adminDb.batch();
      let inBatch = 0;
      for (let i = 0; i < rows.length; i++) {
        const checked = readSellerProduct(rows[i] || {});
        if ('error' in checked) {
          errors.push({ row: Number(rows[i]?.row) || i + 2, error: checked.error as string });
          continue;
        }
        const skuKey = checked.fields.sellerSku ? sellerSkuFor(uid, checked.fields.sellerSku).toLowerCase() : '';
        const match = skuKey ? bySku.get(skuKey) : undefined;
        const id = match?.id || `prod-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}`;
        const product = buildSellerProduct(uid, seller, id, { ...rows[i], fromCsv: true }, checked.fields, match?.data || null);
        // Electronics / branded items without an invoice on file wait as drafts (add it in the product form)
        if (product.status === 'ACTIVE' && needsBrandProof(product) && !d.supplierOf(id)?.brandProofUrl) {
          product.status = 'DRAFT';
          heldForProof++;
        }
        batch.set(adminDb.collection('products').doc(id), product);
        if (wentLive(product, match?.data || null)) live.push(product);
        const supplier = readSupplier(rows[i] || {});
        if (supplier) {
          batch.set(adminDb.collection('product_private').doc(id), supplierDoc(id, supplier), { merge: true });
          inBatch++;
        }
        if (match) updated++;
        else created++;
        if (skuKey) bySku.set(skuKey, { id, data: product });
        if (++inBatch >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          inBatch = 0;
        }
      }
      if (inBatch) await batch.commit();
      forgetCoach(uid);
      announceLive(uid, seller, live);
      res.json({ success: true, created, updated, errors, heldForProof });
    } catch (err) {
      console.error('[seller/products bulk] failed:', err);
      res.status(503).json({ error: 'Could not save the products. Please try again.' });
    }
  });

  app.post('/api/seller/products', requireSeller, requireConduct, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    const b = req.body || {};
    const checked = readSellerProduct(b);
    if ('error' in checked) return res.status(400).json({ error: checked.error });

    try {
      let id = str(b.id, 128);
      let existing: any = null;
      if (id) {
        existing =
          (d.allProductsOfSeller(uid) || []).find((p) => p.id === id) ||
          (await adminDb
            .collection('products')
            .doc(id)
            .get()
            .then((s) => (s.exists ? s.data() : null)));
        if (!existing || existing.sellerId !== uid) return res.status(403).json({ error: 'This product does not belong to your shop.' });
      } else {
        id = `prod-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      }
      const product = buildSellerProduct(uid, seller, id, b, checked.fields, existing);
      const supplier = readSupplier(b);
      // Electronics and branded items go live only with a purchase invoice / brand approval
      const proofUrl = str(b.brandProofUrl, 980);
      if (proofUrl && !/^https:\/\//i.test(proofUrl) && !/^\/media\/[a-zA-Z0-9_.-]+$/.test(proofUrl)) {
        return res.status(400).json({ error: 'The invoice / brand approval file link is not valid.' });
      }
      const heldForProof = product.status === 'ACTIVE' && needsBrandProof(product) && !proofUrl;
      if (heldForProof) product.status = 'DRAFT';
      const batch = adminDb.batch();
      batch.set(adminDb.collection('products').doc(id), product);
      const privateData: Record<string, any> = supplier ? supplierDoc(id, supplier) : {};
      if (b.brandProofUrl !== undefined) privateData.brandProofUrl = proofUrl;
      if (Object.keys(privateData).length) {
        batch.set(adminDb.collection('product_private').doc(id), { productId: id, ...privateData, updatedAt: new Date().toISOString() }, { merge: true });
      }
      await batch.commit();
      forgetCoach(uid);
      if (wentLive(product, existing)) announceLive(uid, seller, [product]);
      res.json({ success: true, product: listFields(product), heldForProof });
    } catch (err) {
      console.error('[seller/products save] failed:', err);
      res.status(503).json({ error: 'Could not save the product. Please try again.' });
    }
  });

  // Sellers archive (hide) products; deleting is left to the store
  app.post('/api/seller/products/:id/archive', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const ref = adminDb.collection('products').doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.sellerId !== uid) return res.status(403).json({ error: 'This product does not belong to your shop.' });
      await ref.update({ status: 'ARCHIVED', updatedAt: new Date().toISOString() });
      forgetCoach(uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/products archive] failed:', err);
      res.status(503).json({ error: 'Could not remove the product. Please try again.' });
    }
  });

  // Copy the pictures of the seller's products into the store's own storage, so they stay even when
  // the supplier removes them (needs Firebase Storage, i.e. the Blaze plan)
  // A picture (up to 8 MB) or video (up to 50 MB) for a product, sent as the raw file body.
  // The file type is checked from its first bytes, not from what the browser says.
  const sniffMedia = (b: Buffer): { ext: string; type: string; video: boolean } | null => {
    if (b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg', video: false };
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png', video: false };
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp', video: false };
    if (b.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', type: 'image/gif', video: false };
    // invoices / brand approval letters
    if (b.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', type: 'application/pdf', video: false };
    if (b.toString('ascii', 4, 8) === 'ftyp') {
      const brand = b.toString('ascii', 8, 12);
      if (brand.startsWith('qt')) return { ext: 'mov', type: 'video/quicktime', video: true };
      if (/^(avif|avis)/.test(brand)) return { ext: 'avif', type: 'image/avif', video: false };
      if (/^(heic|heix|mif1|msf1)/.test(brand)) return null; // iPhone HEIC photos do not show in most browsers
      return { ext: 'mp4', type: 'video/mp4', video: true };
    }
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', type: 'video/webm', video: true };
    return null;
  };
  app.post('/api/seller/media/upload', requireSeller, async (req, res) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'No file received.' });
    const kind = sniffMedia(body);
    if (!kind) return res.status(415).json({ error: 'Use a JPG, PNG or WEBP picture, a PDF, or an MP4 / WEBM / MOV video.' });
    if (!kind.video && body.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Pictures can be at most 8 MB.' });
    if (kind.video && body.length > 50 * 1024 * 1024) return res.status(413).json({ error: 'The video can be at most 50 MB.' });
    try {
      const url = await d.storeMedia(body, kind.ext, kind.type);
      res.json({ success: true, url, video: kind.video });
    } catch (err) {
      console.error('[seller/media/upload] failed:', err);
      res.status(503).json({ error: 'Could not save the file. Please try again.' });
    }
  });

  app.post('/api/seller/media/archive', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const mine =
        d.allProductsOfSeller(uid) ||
        (await adminDb.collection('products').where('sellerId', '==', uid).limit(5000).get()).docs.map((doc) => ({
          ...(doc.data() as any),
          id: doc.id,
        }));
      const isStored = (u: string) => /^https:\/\/(firebasestorage|storage)\.googleapis\.com\//.test(u);
      const pending = mine.filter((p) => p.status !== 'ARCHIVED' && p.primaryImage && !isStored(p.primaryImage));
      const todo = pending.slice(0, 150).map((p) => ({ ref: adminDb.collection('products').doc(p.id), data: p }));
      if (!todo.length) return res.json({ success: true, archived: 0, remaining: 0 });
      const result = await d.archiveImageUrls(todo.map((p) => p.data.primaryImage));
      if (result.storageUnavailable) {
        return res.status(409).json({
          error: 'Image storage is not enabled for the store yet (Firebase Storage needs the Blaze plan). Images keep using their links.',
          code: 'STORAGE_UNAVAILABLE',
        });
      }
      let archived = 0;
      const batch = adminDb.batch();
      for (const p of todo) {
        const stored = result.results[p.data.primaryImage];
        if (stored && stored !== p.data.primaryImage && isStored(stored)) {
          batch.update(p.ref, { primaryImage: stored, updatedAt: new Date().toISOString() });
          archived++;
        }
      }
      if (archived) await batch.commit();
      const remaining = pending.length - archived;
      res.json({ success: true, archived, remaining: Math.max(0, remaining) });
    } catch (err) {
      console.error('[seller/media/archive] failed:', err);
      res.status(503).json({ error: 'Could not save the images. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- admin: product moderation

  // The store can take any seller's product off the store (and put it back); the seller cannot
  // make a product the store has hidden live again
  app.post('/api/admin/products/:id/moderate', d.requireAdmin, async (req, res) => {
    const hidden = req.body?.hidden === true;
    const reason = str(req.body?.reason, 300);
    try {
      const ref = adminDb.collection('products').doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Product not found.' });
      const now = new Date().toISOString();
      await ref.update(
        hidden
          ? { status: 'DRAFT', adminHidden: true, adminHiddenReason: reason || 'Hidden by the store', updatedAt: now }
          : { status: 'ACTIVE', adminHidden: false, adminHiddenReason: '', updatedAt: now }
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[admin/products moderate] failed:', err);
      res.status(503).json({ error: 'Could not update the product. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- seller: orders

  app.get('/api/seller/orders', requireSeller, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      const orders = await sellerOrdersCached(uid);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, orders: orders.map(sellerSafeOrder) });
    } catch (err) {
      console.error('[seller/orders] failed:', err);
      res.status(503).json({ error: 'Could not load your orders. Please try again.' });
    }
  });

  const loadOwnOrder = async (uid: string, orderId: string) => {
    const ref = adminDb.collection('orders').doc(orderId);
    const snap = await ref.get();
    const order = snap.exists ? (snap.data() as any) : null;
    return order && order.sellerId === uid ? { ref, order } : null;
  };

  app.post('/api/seller/orders/status', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const status = String(req.body?.status || '');
    const trackingNumber = str(req.body?.trackingNumber, 110);
    const courierName = str(req.body?.courierName, 60);
    if (!SELLER_ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Sellers cannot set this status.' });
    try {
      const own = await loadOwnOrder(uid, String(req.body?.orderId || ''));
      if (!own) return res.status(404).json({ error: 'Order not found.' });
      const { ref, order } = own;
      if (awaitingCardPayment(order)) {
        return res.status(409).json({ error: 'This order is waiting for the customer’s card payment. It cannot be changed until it is paid.' });
      }
      if (CLOSED_STATUSES.includes(order.status)) {
        return res.status(409).json({ error: 'This order is closed. Please contact the store to change it.' });
      }
      if (status === 'CANCELLED' && SHIPPED_OR_LATER.includes(order.status)) {
        return res.status(409).json({ error: 'A shipped order cannot be cancelled. Please contact the store for a return.' });
      }
      const finalTracking = trackingNumber || order.trackingNumber || '';
      if (SHIPPED_OR_LATER.includes(status) && finalTracking.length < 4) {
        return res.status(400).json({ error: 'Enter the courier tracking number before marking the parcel as shipped.' });
      }
      const updates: Record<string, any> & { status: string } = { status, updatedAt: new Date().toISOString() };
      if (trackingNumber) updates.trackingNumber = trackingNumber;
      if (courierName) updates.courierName = courierName;
      if (status === 'DELIVERED' && order.paymentMethod === 'COD') updates.paymentStatus = 'PAID';
      if (status === 'CANCELLED') {
        // Cancelling an order the customer asked to cancel accepts their request
        const asked = order.cancelRequest?.status === 'PENDING';
        updates.cancellationReason =
          str(req.body?.reason, 300) ||
          (asked ? `Cancelled at the customer's request: ${order.cancelRequest.reason}` : `Cancelled by seller (${(req as any).seller.shopName})`);
        updates.cancelledAt = updates.updatedAt;
        if (asked) updates.cancelRequest = { ...order.cancelRequest, status: 'APPROVED', decidedAt: updates.updatedAt, decidedBy: 'seller' };
        // Money already taken online goes back to the customer
        if (order.paymentMethod === 'CARD' && order.paymentStatus === 'PAID') updates.paymentStatus = 'REFUND_PENDING';
      }
      await d.applyOrderStatusWithStock(ref, updates);
      forgetOrders(uid);
      res.json({ success: true });
    } catch (err) {
      if (d.isInsufficientStockError(err)) return res.status(409).json({ error: (err as Error).message });
      console.error('[seller/orders/status] failed:', err);
      res.status(503).json({ error: 'Could not update the status. Please try again.' });
    }
  });

  // The customer asked to cancel after the free-cancel time: the seller accepts with the usual
  // Cancel button (status CANCELLED), or declines here with a short reason the customer sees
  app.post('/api/seller/orders/cancel-request/decline', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const reply = str(req.body?.reply, 200);
    if (reply.length < 5) return res.status(400).json({ error: 'Tell the customer why the order cannot be cancelled (e.g. "already packed").' });
    try {
      const own = await loadOwnOrder(uid, String(req.body?.orderId || ''));
      if (!own) return res.status(404).json({ error: 'Order not found.' });
      const now = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(own.ref);
        const o = snap.data() as any;
        if (o?.cancelRequest?.status !== 'PENDING') throw new Error('NO_REQUEST');
        tx.update(own.ref, {
          cancelRequest: { ...o.cancelRequest, status: 'REJECTED', reply, decidedAt: now, decidedBy: 'seller' },
          updatedAt: now,
          trackingEvents: d.appendTrackingEvent(o.trackingEvents, { at: now, note: `The seller could not cancel the order: ${reply}` }),
        });
      });
      forgetOrders(uid);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message === 'NO_REQUEST') return res.status(409).json({ error: 'There is no open cancel request on this order.' });
      console.error('[seller/orders/cancel-request] failed:', err);
      res.status(503).json({ error: 'Could not save your answer. Please try again.' });
    }
  });

  app.post('/api/seller/orders/event', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const location = str(req.body?.location, 120);
    const note = str(req.body?.note, 300);
    if (!location && !note) return res.status(400).json({ error: 'Enter a location or a message.' });
    try {
      const own = await loadOwnOrder(uid, String(req.body?.orderId || ''));
      if (!own) return res.status(404).json({ error: 'Order not found.' });
      const now = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(own.ref);
        tx.update(own.ref, {
          trackingEvents: d.appendTrackingEvent(snap.data()?.trackingEvents, {
            at: now,
            ...(location ? { location } : {}),
            note: note || `Parcel reached ${location}.`,
          }),
          updatedAt: now,
        });
      });
      forgetOrders(uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/orders/event] failed:', err);
      res.status(503).json({ error: 'Could not save the update. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- seller: earnings

  app.get('/api/seller/earnings', requireSeller, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      const [orders, payoutsSnap, charges] = await Promise.all([
        sellerOrdersCached(uid),
        adminDb.collection('payouts').where('sellerId', '==', uid).limit(200).get(),
        unpaidChargesOf(uid),
      ]);
      const payouts = payoutsSnap.docs
        .map((doc) => ({ ...(doc.data() as any), id: doc.id }))
        .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        charges,
        escrowDays: POLICY.ESCROW_DAYS,
        summary: summarizeEarnings(orders, charges.reduce((s, c) => s + Number(c.amount || 0), 0)),
        commissionPercent: await commissionFor((req as any).seller),
        payouts,
      });
    } catch (err) {
      console.error('[seller/earnings] failed:', err);
      res.status(503).json({ error: 'Could not load your earnings. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- admin: sellers

  // ---------------------------------------------------------------- admin: seller report & health

  const DAY = 24 * 60 * 60 * 1000;
  const NEW_STATUSES = ['PENDING_CONFIRMATION', 'PENDING'];
  const TO_PACK_STATUSES = ['CONFIRMED', 'PROCESSING'];
  const IN_TRANSIT_STATUSES = ['SHIPPED', 'OUT_FOR_DELIVERY'];
  const OPEN_FOR_SHIPPING = [...NEW_STATUSES, ...TO_PACK_STATUSES, 'PACKED'];
  const units = (o: any) => (o.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

  type HealthReason = { level: 'RED' | 'YELLOW' | 'GREEN'; text: string };

  // Everything the admin needs to judge a seller, worked out from the cached orders and the catalog copy
  const buildSellerReport = (seller: any, orders: any[], products: any[]) => {
    const now = Date.now();
    const placedWithin = (o: any, ms: number) => now - Date.parse(o.createdAt || 0) <= ms;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const count = (statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length;
    const counts = {
      total: orders.length,
      new: count(NEW_STATUSES),
      toPack: count(TO_PACK_STATUSES),
      packed: count(['PACKED']),
      inTransit: count(IN_TRANSIT_STATUSES),
      delivered: count(['DELIVERED']),
      cancelled: count(['CANCELLED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED']),
      returned: count(['RETURNED']),
      refunded: count(['REFUNDED']),
    };

    const period = (filter: (o: any) => boolean) => {
      const list = orders.filter(filter);
      const live = list.filter((o) => !CLOSED_STATUSES.includes(o.status));
      const delivered = list.filter((o) => o.status === 'DELIVERED');
      return {
        orders: list.length,
        units: live.reduce((s, o) => s + units(o), 0),
        sales: money(live.reduce((s, o) => s + (Number(o.total) || 0), 0)),
        sellerEarning: money(delivered.reduce((s, o) => s + (Number(o.sellerEarning) || 0), 0)),
        storeCommission: money(delivered.reduce((s, o) => s + (Number(o.commissionAmount) || 0), 0)),
        returns: list.filter((o) => o.status === 'RETURNED').length,
        cancellations: list.filter((o) => o.status === 'CANCELLED').length,
      };
    };
    const periods = {
      today: period((o) => Date.parse(o.createdAt || 0) >= startOfToday.getTime()),
      week: period((o) => placedWithin(o, 7 * DAY)),
      month: period((o) => placedWithin(o, 30 * DAY)),
      all: period(() => true),
    };

    // Rates over the last 30 days (all time while the shop is young)
    // Test orders never count; only cancellations that were the seller's fault do (out of stock,
    // cancelled by the seller, too slow) - not fake / unreachable customers or changes of mind
    const real = orders.filter((o) => !isTestOrder(o));
    const recent = real.filter((o) => placedWithin(o, 30 * DAY));
    const basis = recent.length >= 5 ? recent : real;
    const enoughOrders = basis.length >= MIN_ORDERS_FOR_RATES;
    const cancelRate = pct(basis.filter(isSellerFaultCancel).length, basis.length);
    const finished = basis.filter((o) => ['DELIVERED', 'RETURNED', 'REFUNDED'].includes(o.status));
    const returnRate = pct(basis.filter((o) => ['RETURNED', 'REFUNDED'].includes(o.status)).length, finished.length);
    // Late = confirmed but not handed to the courier within 48 hours (Supplier Code of Conduct)
    const late = orders.filter(
      (o) => [...TO_PACK_STATUSES, 'PACKED'].includes(o.status) && now - dispatchClockStart(o) > POLICY.DISPATCH_HOURS * 3600_000
    );
    const oldestOpenDays = orders
      .filter((o) => OPEN_FOR_SHIPPING.includes(o.status))
      .reduce((m, o) => Math.max(m, Math.floor((now - Date.parse(o.createdAt || 0)) / DAY)), 0);

    const live = products.filter((p) => p.status === 'ACTIVE');
    const rated = products.filter((p) => Number(p.reviewCount) > 0);
    const productStats = {
      total: products.filter((p) => p.status !== 'ARCHIVED').length,
      live: live.length,
      draft: products.filter((p) => p.status === 'DRAFT' && !p.adminHidden).length,
      outOfStock: live.filter((p) => Number(p.stock) <= 0).length,
      hiddenByStore: products.filter((p) => p.adminHidden).length,
      reviews: rated.reduce((s, p) => s + Number(p.reviewCount || 0), 0),
      avgRating: rated.length
        ? Math.round((rated.reduce((s, p) => s + Number(p.rating || 0) * Number(p.reviewCount || 0), 0) / Math.max(1, rated.reduce((s, p) => s + Number(p.reviewCount || 0), 0))) * 10) / 10
        : 0,
    };

    // Best sellers by units in orders that were not cancelled
    const byProduct = new Map<string, { productId: string; name: string; units: number; sales: number }>();
    for (const o of orders) {
      if (CLOSED_STATUSES.includes(o.status)) continue;
      for (const it of o.items || []) {
        const row = byProduct.get(it.productId) || { productId: it.productId, name: it.name, units: 0, sales: 0 };
        row.units += Number(it.quantity) || 0;
        row.sales = money(row.sales + (Number(it.price) || 0) * (Number(it.quantity) || 0));
        byProduct.set(it.productId, row);
      }
    }
    const topProducts = Array.from(byProduct.values()).sort((a, b) => b.units - a.units).slice(0, 5);

    // Account health: each rule can make the account yellow (watch) or red (warn now)
    const reasons: HealthReason[] = [];
    let score = 100;
    const rule = (bad: boolean, worse: boolean, yellowText: string, redText: string, yellowCost: number, redCost: number) => {
      if (worse) {
        reasons.push({ level: 'RED', text: redText });
        score -= redCost;
      } else if (bad) {
        reasons.push({ level: 'YELLOW', text: yellowText });
        score -= yellowCost;
      }
    };
    if (seller.status === 'SUSPENDED') {
      reasons.push({ level: 'RED', text: 'The account is suspended.' });
      score -= 50;
    }
    rule(enoughOrders && cancelRate > 5, enoughOrders && cancelRate > 10, `Cancellation rate ${cancelRate}% (should stay under 5%).`, `Cancellation rate ${cancelRate}% is too high (over 10%).`, 15, 30);
    rule(enoughOrders && returnRate > 5, enoughOrders && returnRate > 10, `Return rate ${returnRate}% (should stay under 5%).`, `Return rate ${returnRate}% is too high (over 10%).`, 15, 30);
    rule(late.length >= 1, late.length >= 3, `${late.length} order not dispatched within 48 hours.`, `${late.length} orders not dispatched within 48 hours.`, 10, 30);
    // Upheld customer complaints (fake / wrong / poor quality items)
    const fakeStrikes = Number(seller.fakeStrikes) || 0;
    rule(Number(seller.complaintStrikes) > 0, fakeStrikes > 0, `${seller.complaintStrikes} upheld customer complaint(s).`, `${fakeStrikes} confirmed fake / replica complaint(s).`, 10, 40);
    rule(productStats.hiddenByStore > 0, productStats.hiddenByStore >= 5, `${productStats.hiddenByStore} product(s) taken off the store by you.`, `${productStats.hiddenByStore} products taken off the store by you.`, 10, 25);
    rule(live.length > 0 && productStats.outOfStock / live.length > 0.5, false, `${productStats.outOfStock} of ${live.length} live products are out of stock.`, '', 10, 0);
    rule(productStats.avgRating > 0 && productStats.avgRating < 3.5, productStats.avgRating > 0 && productStats.avgRating < 2.5, `Average product rating ${productStats.avgRating}/5.`, `Average product rating ${productStats.avgRating}/5 is very low.`, 10, 25);
    // Customer feedback on the seller (needs a few ratings before it counts)
    const sellerRating = ratingSummary(seller);
    const enoughRatings = sellerRating.ratingCount >= 3;
    rule(
      enoughRatings && sellerRating.ratingAvg < 4,
      enoughRatings && sellerRating.ratingAvg < 3,
      `Customer rating ${sellerRating.ratingAvg}/5 from ${sellerRating.ratingCount} buyers (${sellerRating.positivePercent}% positive).`,
      `Customer rating ${sellerRating.ratingAvg}/5 from ${sellerRating.ratingCount} buyers is low (${sellerRating.positivePercent}% positive).`,
      10,
      30
    );
    const reactions = sellerRating.likes + sellerRating.dislikes;
    rule(reactions >= 10 && sellerRating.dislikes / reactions > 0.3, reactions >= 10 && sellerRating.dislikes / reactions > 0.5, `${sellerRating.dislikes} dislikes vs ${sellerRating.likes} likes on products.`, `More dislikes (${sellerRating.dislikes}) than likes (${sellerRating.likes}) on products.`, 10, 20);
    score = Math.max(0, score);
    const level: 'GREEN' | 'YELLOW' | 'RED' = reasons.some((r) => r.level === 'RED') || score < 60
      ? 'RED'
      : reasons.some((r) => r.level === 'YELLOW') || score < 85
      ? 'YELLOW'
      : 'GREEN';
    if (!reasons.length) {
      reasons.push({
        level: 'GREEN',
        text: orders.length ? 'Orders are shipped on time with few cancellations and returns.' : 'New shop: no orders yet.',
      });
    }
    const advice =
      level === 'RED'
        ? 'Send this seller a warning now. If it does not improve, take their products off the store or suspend the account.'
        : level === 'YELLOW'
        ? 'Keep an eye on this seller and send a friendly reminder.'
        : 'No action needed.';

    return {
      counts,
      periods,
      rates: { cancelRate, returnRate, basisOrders: basis.length, enoughOrders },
      lateToShip: late.length,
      oldestOpenDays,
      products: productStats,
      topProducts,
      health: { level, score, reasons, advice },
      rating: sellerRating,
      earnings: summarizeEarnings(orders),
      recentOrders: orders.slice(0, 15).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        units: units(o),
        customerName: o.customerName,
        city: o.shippingAddressSummary ? String(o.shippingAddressSummary).split(',').slice(-2, -1)[0]?.trim() || '' : '',
        createdAt: o.createdAt,
      })),
    };
  };

  const productsOf = async (sellerId: string) =>
    d.allProductsOfSeller(sellerId) ||
    (await adminDb.collection('products').where('sellerId', '==', sellerId).limit(5000).get()).docs.map((doc) => ({
      ...(doc.data() as any),
      id: doc.id,
    }));

  // Full report of one seller (opened from the admin's seller list)
  app.get('/api/admin/sellers/:id/report', d.requireAdmin, async (req, res) => {
    const id = str(req.params.id, 128);
    try {
      const [sellerSnap, privSnap, orders, products, payoutsSnap, threadsAgg] = await Promise.all([
        sellersCol().doc(id).get(),
        adminDb.collection('seller_private').doc(id).get(),
        sellerOrdersCached(id),
        productsOf(id),
        adminDb.collection('payouts').where('sellerId', '==', id).limit(100).get(),
        adminDb.collection('seller_threads').where('sellerId', '==', id).count().get().catch(() => null),
      ]);
      if (!sellerSnap.exists) return res.status(404).json({ error: 'Seller not found.' });
      const seller = { ...(sellerSnap.data() as any), id };
      const payouts = payoutsSnap.docs
        .map((doc) => ({ ...(doc.data() as any), id: doc.id }))
        .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        seller,
        privateData: privSnap.exists ? privSnap.data() : null,
        commissionPercent: await commissionFor(seller),
        report: buildSellerReport(seller, orders, products),
        payouts,
        conversations: threadsAgg ? threadsAgg.data().count : null,
      });
    } catch (err) {
      console.error('[admin/sellers report] failed:', err);
      res.status(503).json({ error: 'Could not load the seller report. Please try again.' });
    }
  });

  app.get('/api/admin/sellers', d.requireAdmin, async (_req, res) => {
    try {
      const [sellersSnap, privSnap] = await Promise.all([sellersCol().limit(500).get(), adminDb.collection('seller_private').limit(500).get()]);
      const privById = new Map(privSnap.docs.map((p) => [p.id, p.data()]));
      const sellers = await Promise.all(
        sellersSnap.docs.map(async (doc) => {
          const s = doc.data() as any;
          let summary: any = { pending: 0, available: 0, paid: 0, commission: 0 };
          let productCount = 0;
          let overview: any = null;
          if (s.status === 'APPROVED' || s.status === 'SUSPENDED') {
            const [orders, products] = await Promise.all([sellerOrdersCached(doc.id), productsOf(doc.id)]);
            const report = buildSellerReport({ ...s, id: doc.id }, orders, products);
            summary = report.earnings;
            productCount = report.products.total;
            overview = {
              health: { level: report.health.level, score: report.health.score, reason: report.health.reasons[0]?.text || '' },
              counts: report.counts,
              unitsSold: report.periods.all.units,
              sales: report.periods.all.sales,
              lateToShip: report.lateToShip,
            };
          }
          return { ...s, id: doc.id, privateData: privById.get(doc.id) || null, summary, productCount, overview };
        })
      );
      sellers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      let defaultCommission = d.DEFAULT_COMMISSION_PERCENT;
      try {
        const cfg = await adminDb.collection('settings').doc('store_config').get();
        if (typeof cfg.data()?.marketplaceCommissionPercent === 'number') defaultCommission = cfg.data()!.marketplaceCommissionPercent;
      } catch {}
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, sellers, defaultCommission });
    } catch (err) {
      console.error('[admin/sellers] failed:', err);
      res.status(503).json({ error: 'Could not load sellers. Please try again.' });
    }
  });

  // A suspended seller's live products leave the store; they come back when re-approved
  // (products the store itself hid stay hidden)
  const syncProductsWithSellerStatus = async (id: string, status: string) => {
    if (status !== 'SUSPENDED' && status !== 'APPROVED') return 0;
    const now = new Date().toISOString();
    const products = await adminDb.collection('products').where('sellerId', '==', id).limit(2000).get();
    const toChange = products.docs.filter((p) =>
      status === 'SUSPENDED' ? p.data().status === 'ACTIVE' : p.data().suspendedHidden === true && p.data().adminHidden !== true
    );
    for (let i = 0; i < toChange.length; i += 400) {
      const batch = adminDb.batch();
      for (const p of toChange.slice(i, i + 400)) {
        batch.update(
          p.ref,
          status === 'SUSPENDED'
            ? { status: 'DRAFT', suspendedHidden: true, updatedAt: now }
            : { status: 'ACTIVE', suspendedHidden: false, updatedAt: now }
        );
      }
      await batch.commit();
    }
    return toChange.length;
  };

  /**
   * Suspends a seller under the store rules. A low-rating suspension also freezes every payout;
   * the account can be restored once (reinstatement fee), and never after a second one.
   */
  const suspendSeller = async (id: string, reason: string, cause: 'RATING' | 'OTHER' = 'OTHER') => {
    const ref = sellersCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as any).status === 'SUSPENDED') return false;
    const s = snap.data() as any;
    const permanent = cause === 'RATING' && s.reinstatementUsed === true;
    await ref.set(
      {
        status: 'SUSPENDED',
        statusReason: reason.slice(0, 300),
        suspendedAutomatically: true,
        suspensionCause: cause,
        suspendedAt: new Date().toISOString(),
        ...(cause === 'RATING' ? { payoutsFrozen: true } : {}),
        ...(permanent ? { permanentlySuspended: true } : {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    forgetSeller(id);
    await syncProductsWithSellerStatus(id, 'SUSPENDED');
    return true;
  };

  // Restores an account suspended for low rating, once: the reinstatement fee is taken off the
  // seller's frozen balance or recorded as paid, the rating starts again from zero and payouts unfreeze
  app.post('/api/admin/sellers/:id/reinstate', requireFullAdmin, async (req, res) => {
    const id = str(req.params.id, 128);
    const feeMethod = req.body?.feeMethod === 'PAID' ? 'PAID' : 'DEDUCT';
    const reference = str(req.body?.reference, 120);
    if (feeMethod === 'PAID' && reference.length < 3) return res.status(400).json({ error: 'Enter the payment reference / TID of the fee.' });
    try {
      const ref = sellersCol().doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Seller not found.' });
      const s = snap.data() as any;
      if (s.status !== 'SUSPENDED' || s.suspensionCause !== 'RATING') {
        return res.status(409).json({ error: 'Only an account suspended for low rating can be reinstated this way.' });
      }
      if (s.reinstatementUsed || s.permanentlySuspended) {
        return res.status(409).json({ error: 'This seller has already used their one reinstatement. The suspension is permanent.' });
      }
      const now = new Date().toISOString();
      const fee = POLICY.REINSTATEMENT_FEE;
      if (feeMethod === 'DEDUCT') {
        await adminDb.collection('seller_charges').doc(`chg-reinstate-${id}`).set({
          id: `chg-reinstate-${id}`,
          sellerId: id,
          orderNumber: '—',
          amount: fee,
          reason: 'Account reinstatement fee',
          createdAt: now,
          payoutId: null,
        });
      }
      const old = ratingSummary(s);
      await ref.set(
        {
          status: 'APPROVED',
          statusReason: '',
          payoutsFrozen: false,
          reinstatementUsed: true,
          reinstatedAt: now,
          reinstatedBy: String((req as any).user?.email || 'admin'),
          reinstatementFee: { amount: fee, method: feeMethod, reference, at: now },
          // The rating starts again; the old one is kept for the record
          ratingBeforeReinstatement: { ratingAvg: old.ratingAvg, ratingCount: old.ratingCount, positivePercent: old.positivePercent },
          ratingSum: 0,
          ratingCount: 0,
          ratingPositive: 0,
          ratingResetAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      forgetSeller(id);
      shopCache.delete(id);
      const changedProducts = await syncProductsWithSellerStatus(id, 'APPROVED');
      await d.postNotice(
        id,
        s.shopName || '',
        'Account reinstated (one-time)',
        `Your account is active again and your products are back in the store. Your rating starts fresh and your payouts are unfrozen.${
          feeMethod === 'DEDUCT' ? ` The PKR ${fee} reinstatement fee will be taken off your next payout.` : ''
        }\n\nThis was your one reinstatement: if your rating falls below ${POLICY.MIN_RATING.toFixed(1)} again, the suspension will be permanent.`,
        'URGENT'
      ).catch(() => {});
      res.json({ success: true, changedProducts });
    } catch (err) {
      console.error('[admin/sellers reinstate] failed:', err);
      res.status(503).json({ error: 'Could not reinstate the seller. Please try again.' });
    }
  });

  // Every approved seller gets a unique vendor ID ("AV-PK-00001": country of operation + running
  // number) and the country orders ship from. The number comes from one counter document in a
  // transaction, so two approvals never get the same ID.
  const assignVendorIdentity = async (sellerId: string, s: any) => {
    const updates: Record<string, any> = {};
    if (!s.shipsFromCountry) updates.shipsFromCountry = String(s.warehouseCountry || s.countryCode || 'PK').toUpperCase();
    if (!s.vendorId) {
      const counterRef = adminDb.collection('counters').doc('vendor_ids');
      const n = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const next = (Number(snap.data()?.next) || 0) + 1;
        tx.set(counterRef, { next, updatedAt: new Date().toISOString() }, { merge: true });
        return next;
      });
      updates.vendorId = `AV-${String(s.countryCode || 'PK').toUpperCase()}-${String(n).padStart(5, '0')}`;
    }
    if (Object.keys(updates).length) {
      await sellersCol().doc(sellerId).set(updates, { merge: true });
      forgetSeller(sellerId);
    }
    return updates;
  };

  // Sellers approved before vendor IDs existed get theirs once, at server start (a few reads)
  // A marker document records that it has run, so later starts cost 1 read instead of one per seller
  // (sellers approved since then get their vendor ID at approval, products when they are saved)
  const BACKFILL_VERSION = 1;
  (async () => {
    try {
      const markerRef = adminDb.collection('counters').doc('vendor_backfill');
      if (Number((await markerRef.get()).data()?.version) >= BACKFILL_VERSION) return;
      const snap = await sellersCol().where('status', '==', 'APPROVED').limit(500).get();
      let n = 0;
      const sellers: Array<{ id: string; vendorId?: string; shipsFromCountry: string }> = [];
      for (const doc of snap.docs) {
        let s = doc.data() as any;
        if (!s.vendorId || !s.shipsFromCountry) {
          s = { ...s, ...(await assignVendorIdentity(doc.id, s)) };
          n++;
        }
        sellers.push({ id: doc.id, vendorId: s.vendorId, shipsFromCountry: String(s.shipsFromCountry || 'PK').toUpperCase() });
      }
      if (n) console.log(`[vendors] gave ${n} approved seller(s) a vendor ID`);
      // Products listed before then get the seller's vendor ID and ship-from country, once (the
      // catalog copy says which ones lack them, so this costs no reads; one write per such product).
      // It waits 2 minutes so the copy loaded from disk has caught up with the database first.
      await new Promise((r) => setTimeout(r, 120_000));
      for (let attempt = 0; attempt < 20; attempt++) {
        if (sellers.every((s) => d.allProductsOfSeller(s.id) !== null)) break;
        await new Promise((r) => setTimeout(r, 15_000));
      }
      let fixed = 0;
      let batch = adminDb.batch();
      let inBatch = 0;
      for (const s of sellers) {
        for (const p of d.allProductsOfSeller(s.id) || []) {
          if (p.shipsFromCountry === s.shipsFromCountry && (p.vendorId || '') === (s.vendorId || '')) continue;
          // updatedAt moves so the catalog copy (it listens for newer updatedAt) learns the change
          batch.update(adminDb.collection('products').doc(p.id), {
            shipsFromCountry: s.shipsFromCountry,
            ...(s.vendorId ? { vendorId: s.vendorId } : {}),
            updatedAt: new Date().toISOString(),
          });
          fixed++;
          if (++inBatch === 400) {
            await batch.commit();
            batch = adminDb.batch();
            inBatch = 0;
          }
        }
      }
      if (inBatch) await batch.commit();
      if (fixed) console.log(`[vendors] added vendor ID / ships-from country to ${fixed} product(s)`);
      // Only once every seller's products were seen in the catalog copy
      if (sellers.every((s) => d.allProductsOfSeller(s.id) !== null)) {
        await markerRef.set({ version: BACKFILL_VERSION, at: new Date().toISOString() });
      }
    } catch (err: any) {
      console.warn('[vendors] vendor ID backfill failed:', err?.message);
    }
  })();

  // Approve / reject / suspend a seller, or change their commission
  app.post('/api/admin/sellers/:id', requireFullAdmin, async (req, res) => {
    const id = String(req.params.id);
    const b = req.body || {};
    try {
      const ref = sellersCol().doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Seller not found.' });
      const current = snap.data() as any;
      const now = new Date().toISOString();
      const updates: Record<string, any> = { updatedAt: now };
      if (b.status !== undefined) {
        if (!['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(b.status)) return res.status(400).json({ error: 'Invalid status.' });
        // First approval starts the new-seller 0% commission period
        if (b.status === 'APPROVED' && !current.approvedAt) updates.approvedAt = now;
        // A low-rating suspension is lifted only through the one-time reinstatement (fee, fresh rating)
        if (b.status === 'APPROVED' && current.status === 'SUSPENDED' && current.suspensionCause === 'RATING') {
          return res.status(409).json({
            error: current.reinstatementUsed
              ? 'This seller was suspended for low rating after their one reinstatement: the suspension is permanent.'
              : `Suspended for low rating: use "Reinstate (PKR ${POLICY.REINSTATEMENT_FEE} fee, one time)" on the seller's page.`,
          });
        }
        updates.status = b.status;
        updates.statusReason = str(b.statusReason, 300);
      }
      if (b.commissionPercent !== undefined) {
        if (b.commissionPercent === null || b.commissionPercent === '') {
          updates.commissionPercent = null;
        } else {
          const pct = Number(b.commissionPercent);
          if (!(pct >= 0 && pct <= 100)) return res.status(400).json({ error: 'Commission must be between 0 and 100.' });
          updates.commissionPercent = pct;
        }
      }
      await ref.set(updates, { merge: true });
      forgetSeller(id);
      // Approved: unique vendor ID and the ships-from country
      const identity = updates.status === 'APPROVED' ? await assignVendorIdentity(id, { ...current, ...updates }) : {};

      const statusChanged = updates.status && updates.status !== current.status;
      const changedProducts = statusChanged ? await syncProductsWithSellerStatus(id, updates.status) : 0;
      if (statusChanged && updates.status !== 'PENDING') {
        // Not awaited: a slow or failed email never holds up the admin's screen
        d.emailSellerStatus({ ...current, id }, updates.status, updates.statusReason, (identity as any)?.vendorId || current.vendorId).catch(
          (err) => console.error('[admin/sellers] status email failed:', err?.message || err)
        );
      }
      res.json({ success: true, changedProducts, ...identity });
    } catch (err) {
      console.error('[admin/sellers update] failed:', err);
      res.status(503).json({ error: 'Could not update the seller. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- admin: payouts

  app.get('/api/admin/payouts', d.requireAdmin, async (req, res) => {
    try {
      const sellerId = str(req.query.sellerId, 128);
      const q = sellerId ? adminDb.collection('payouts').where('sellerId', '==', sellerId) : adminDb.collection('payouts');
      const snap = await q.limit(300).get();
      const payouts = snap.docs
        .map((doc) => ({ ...(doc.data() as any), id: doc.id }))
        .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, payouts });
    } catch (err) {
      console.error('[admin/payouts] failed:', err);
      res.status(503).json({ error: 'Could not load payouts. Please try again.' });
    }
  });

  // Record a bank transfer to a seller: settles all their delivered, not yet paid orders
  app.post('/api/admin/payouts', requireFullAdmin, async (req, res) => {
    const sellerId = str(req.body?.sellerId, 128);
    const reference = str(req.body?.reference, 120);
    const note = str(req.body?.note, 300);
    if (!sellerId || sellerId === d.HOUSE_SELLER_ID) return res.status(400).json({ error: 'Choose a seller.' });
    if (reference.length < 3) return res.status(400).json({ error: 'Enter the bank transfer reference / TID.' });
    try {
      const sellerData = (await sellersCol().doc(sellerId).get()).data() as any;
      if (sellerData?.payoutsFrozen) {
        return res.status(409).json({ error: 'This seller’s payments are frozen (suspended for low rating). Reinstate the account first.' });
      }
      forgetOrders(sellerId);
      const [orders, charges] = await Promise.all([loadSellerOrders(sellerId, 1000), unpaidChargesOf(sellerId)]);
      // Only orders whose 7-day return window is over (escrow) and without an open return request
      const due = orders.filter((o) => !o.payoutId && Number(o.sellerEarning) > 0 && escrowReleased(o));
      if (due.length === 0) return res.status(409).json({ error: `This seller has no payout due (money is released ${POLICY.ESCROW_DAYS} days after delivery).` });
      const gross = money(due.reduce((s, o) => s + Number(o.sellerEarning || 0), 0));
      const chargeTotal = money(charges.reduce((s, c) => s + Number(c.amount || 0), 0));
      const amount = money(gross - chargeTotal);
      if (amount <= 0) return res.status(409).json({ error: `Return charges (PKR ${chargeTotal}) are more than the money due (PKR ${gross}). Nothing to pay yet.` });
      const payoutRef = adminDb.collection('payouts').doc(`pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`);
      const paidAt = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        // Re-check inside the transaction so an order is never paid twice
        const privRefs = due.map((o) => adminDb.collection('order_private').doc(o.id));
        const chargeRefs = charges.map((c) => adminDb.collection('seller_charges').doc(c.id));
        const [privs, chargeSnaps] = await Promise.all([
          Promise.all(privRefs.map((r) => tx.get(r))),
          Promise.all(chargeRefs.map((r) => tx.get(r))),
        ]);
        if (privs.some((p) => p.data()?.payoutId) || chargeSnaps.some((c) => c.data()?.payoutId)) throw new Error('ALREADY_PAID');
        tx.set(payoutRef, {
          id: payoutRef.id,
          sellerId,
          amount,
          grossAmount: gross,
          returnCharges: chargeTotal,
          chargeIds: charges.map((c) => c.id),
          orderIds: due.map((o) => o.id),
          orderNumbers: due.map((o) => o.orderNumber),
          reference,
          note,
          paidAt,
          paidBy: String((req as any).user?.email || 'admin'),
        });
        for (const r of privRefs) tx.set(r, { payoutId: payoutRef.id, paidOutAt: paidAt }, { merge: true });
        for (const r of chargeRefs) tx.set(r, { payoutId: payoutRef.id, settledAt: paidAt }, { merge: true });
      });
      forgetOrders(sellerId);
      res.json({ success: true, payoutId: payoutRef.id, amount, orders: due.length });
    } catch (err: any) {
      if (err?.message === 'ALREADY_PAID') return res.status(409).json({ error: 'Some of these orders have already been paid out. Please refresh the page.' });
      console.error('[admin/payouts create] failed:', err);
      res.status(503).json({ error: 'Could not record the payout. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- public: shop page

  // What a customer sees on a seller's shop page (no private details); kept 10 minutes
  const shopCache = new Map<string, { at: number; shop: any | null }>();

  // The three scores customers see (on-time shipping, cancellations, quality), from the last 90 days.
  // Worked out at most every 12 hours per shop and kept on the seller record, so visits cost no reads.
  const METRICS_TTL = 12 * 60 * 60 * 1000;
  const computePublicMetrics = async (sellerId: string, s: any) => {
    const snap = await adminDb
      .collection('orders')
      .where('sellerId', '==', sellerId)
      .select('status', 'createdAt', 'trackingEvents', 'cancellationReason', 'customerName', 'notes')
      .limit(1000)
      .get();
    const now = Date.now();
    const all = snap.docs.map((doc) => doc.data() as any).filter((o) => !isTestOrder(o));
    const recent = all.filter((o) => now - Date.parse(o.createdAt || 0) <= 90 * DAY);
    const orders = recent.length >= 5 ? recent : all;
    const shippedAt = (o: any) => {
      const ev = (Array.isArray(o.trackingEvents) ? o.trackingEvents : []).find((e: any) => SHIPPED_OR_LATER.includes(String(e?.status)));
      return ev ? Date.parse(ev.at) : NaN;
    };
    // On time = handed to the courier within 48 hours of confirmation; orders still waiting after
    // that count as late
    const limit = POLICY.DISPATCH_HOURS * 3600_000;
    let onTime = 0;
    let due = 0;
    for (const o of orders) {
      const placed = dispatchClockStart(o);
      const shipped = shippedAt(o);
      if (SHIPPED_OR_LATER.includes(o.status) || ['RETURNED', 'REFUNDED'].includes(o.status) || !isNaN(shipped)) {
        due++;
        if (isNaN(shipped) || shipped - placed <= limit) onTime++;
      } else if ([...TO_PACK_STATUSES, 'PACKED'].includes(o.status) && now - placed > limit) {
        due++;
      }
    }
    const cancelled = orders.filter(isSellerFaultCancel).length;
    const finished = orders.filter((o) => ['DELIVERED', 'RETURNED', 'REFUNDED'].includes(o.status));
    const returned = finished.filter((o) => o.status !== 'DELIVERED').length;
    const r = ratingSummary(s);
    // Quality: delivered without a return, blended with buyers' ratings once there are a few
    const keptRate = finished.length ? 100 - pct(returned, finished.length) : null;
    const quality =
      keptRate === null && r.ratingCount < 3
        ? null
        : r.ratingCount >= 3
        ? Math.round(keptRate === null ? r.positivePercent : (keptRate + r.positivePercent) / 2)
        : Math.round(keptRate as number);
    const metrics = {
      orders: orders.length,
      onTimeDelivery: due ? Math.round((onTime / due) * 100) : null,
      cancellation: orders.length ? Math.round(pct(cancelled, orders.length)) : null,
      qualityScore: quality,
      at: new Date().toISOString(),
      v: 2, // v2: only seller-fault cancellations, no test orders
    };
    sellersCol().doc(sellerId).set({ publicMetrics: metrics }, { merge: true }).catch(() => {});
    return metrics;
  };

  app.get('/api/shops/:id', async (req, res) => {
    const id = str(req.params.id, 128);
    try {
      let hit = shopCache.get(id);
      if (!hit || Date.now() - hit.at > 10 * 60_000) {
        const snap = await sellersCol().doc(id).get();
        const s = snap.exists ? (snap.data() as any) : null;
        let metrics = s?.publicMetrics || null;
        if (s && s.status === 'APPROVED' && (!metrics || metrics.v !== 2 || Date.now() - Date.parse(metrics.at || 0) > METRICS_TTL)) {
          try {
            metrics = await computePublicMetrics(id, s);
          } catch (err) {
            console.warn('[shops] metrics failed:', (err as any)?.message);
          }
        }
        hit = {
          at: Date.now(),
          shop:
            s && s.status === 'APPROVED'
              ? {
                  id,
                  shopName: s.shopName,
                  logoUrl: s.logoUrl || '',
                  city: s.city || '',
                  joinedAt: s.createdAt || '',
                  followers: Math.max(0, Number(s.followers) || 0),
                  shipsFromCountry: String(s.shipsFromCountry || s.warehouseCountry || s.countryCode || 'PK'),
                  ...ratingSummary(s),
                  metrics: metrics
                    ? { orders: metrics.orders, onTimeDelivery: metrics.onTimeDelivery, cancellation: metrics.cancellation, qualityScore: metrics.qualityScore }
                    : null,
                }
              : null,
        };
        shopCache.set(id, hit);
        if (shopCache.size > 2000) shopCache.clear();
      }
      if (!hit.shop) return res.status(404).json({ error: 'Shop not found.' });
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, shop: hit.shop });
    } catch (err) {
      console.error('[shops] failed:', err);
      res.status(503).json({ error: 'Could not load this shop.' });
    }
  });

  // Used by the seller inbox and feedback routes (server/sellerInbox.ts, server/feedback.ts)
  // ---------------------------------------------------------------- one seller's own data (seller AI)
  // Everything below takes the seller's uid from the verified sign-in and only ever touches that
  // seller's products and orders (server/sellerAi.ts uses it; it has no other database access).

  // (productsOf is defined above, with the seller report)
  // The assistant may ask several times in a conversation: a copy up to 5 minutes old is fine
  // here (orders cost two reads each), and the seller's own updates still drop it at once
  const AI_MAX_AGE = 5 * 60_000;
  const ordersForAi = async (uid: string) => {
    const hit = ordersCache.get(uid);
    return hit && Date.now() - hit.at < AI_MAX_AGE ? hit.orders : sellerOrdersCached(uid);
  };
  const chargesCache = new Map<string, { at: number; total: number }>();
  const ordersOf = async (uid: string) => (await ordersForAi(uid)).map(sellerSafeOrder);

  const earningsOf = async (uid: string) => {
    let c = chargesCache.get(uid);
    if (!c || Date.now() - c.at > AI_MAX_AGE) {
      const charges = await unpaidChargesOf(uid);
      c = { at: Date.now(), total: charges.reduce((s, x) => s + Number(x.amount || 0), 0) };
      chargesCache.set(uid, c);
    }
    return summarizeEarnings(await ordersForAi(uid), c.total);
  };

  // Shop Coach for one seller (Dashboard card and the AI Assistant's "shop report"). Kept 5 minutes
  // per seller; orders come from the seller cache and products from the catalog mirror, so the
  // only extra reads are two small queries (open returns, product complaints).
  const coachCache = new Map<string, { at: number; coach: any }>();
  let coachViewedHook: ((uid: string, seller: any) => void) | null = null;
  // The same tip keeps its key when its numbers change ("727 products..." -> "#")
  const coachKey = (title: string) =>
    crypto
      .createHash('sha1')
      .update(String(title).toLowerCase().replace(/\d+/g, '#').replace(/\b(has|have|is|are)\b/g, '').replace(/s\b/g, '').replace(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 12);
  forgetCoach = (sellerId: string) => {
    coachCache.delete(sellerId);
  };
  const coachOf = async (uid: string, seller: any, fresh = false) => {
    const hit = coachCache.get(uid);
    if (hit && Date.now() - hit.at < (fresh ? 30_000 : 5 * 60_000)) return hit.coach;
    const [orders, products, returnsSnap, strikesSnap, charges] = await Promise.all([
      ordersForAi(uid),
      productsOf(uid),
      adminDb.collection('return_requests').where('sellerId', '==', uid).where('status', '==', 'OPEN').limit(50).get().catch(() => null),
      adminDb.collection('product_strikes').where('sellerId', '==', uid).limit(200).get().catch(() => null),
      unpaidChargesOf(uid).catch(() => [] as any[]),
    ]);
    const report = buildSellerReport(seller, orders, products);
    const coach = buildCoach({
      seller,
      report,
      orders,
      products,
      openReturns: returnsSnap?.size || 0,
      unpaidCharges: charges.reduce((s: number, c: any) => s + Number(c.amount || 0), 0),
      strikes: (strikesSnap?.docs || []).map((doc) => ({ productId: doc.id, customers: ((doc.data() as any).customers || []).length })),
      hasBrandProof: (id) => Boolean(d.supplierOf(id)?.brandProofUrl),
      needsBrandProof,
    });
    // Tips (blue) the seller chose to hide stay hidden; urgent / fix-soon problems always show
    const hidden: string[] = Array.isArray(seller.coachHidden) ? seller.coachHidden : [];
    coach.issues = coach.issues
      .map((i: any) => ({ ...i, key: coachKey(i.title) }))
      .filter((i: any) => !(i.level === 'INFO' && hidden.includes(i.key)));
    coachCache.set(uid, { at: Date.now(), coach });
    if (coachCache.size > 5000) coachCache.clear();

    // A new urgent problem also goes to the seller's Messages (each one at most every 3 days)
    const notified: Record<string, string> = { ...(seller.coachNotified || {}) };
    const fresh3d = (k: string) => notified[k] && Date.now() - Date.parse(notified[k]) < 3 * DAY;
    const urgent = coach.issues.filter((i: any) => i.level === 'RED').filter((i: any) => !fresh3d(crypto.createHash('sha1').update(i.title.replace(/\d+/g, '#')).digest('hex').slice(0, 12)));
    if (urgent.length) {
      const now = new Date().toISOString();
      for (const i of urgent) notified[crypto.createHash('sha1').update(i.title.replace(/\d+/g, '#')).digest('hex').slice(0, 12)] = now;
      for (const k of Object.keys(notified)) if (Date.now() - Date.parse(notified[k]) > 30 * DAY) delete notified[k];
      sellersCol().doc(uid).set({ coachNotified: notified }, { merge: true }).catch(() => {});
      seller.coachNotified = notified;
      d.postNotice(
        uid,
        seller.shopName || '',
        `Shop Coach: ${urgent.length} urgent problem${urgent.length > 1 ? 's' : ''}`,
        urgent.map((i: any) => `• ${i.title}\n  Why it matters: ${i.impact}\n  What to do: ${i.fix}`).join('\n\n') +
          '\n\nOpen the Dashboard or ask the AI Assistant "how is my shop doing?" for the full report.',
        'WARNING'
      ).catch(() => {});
    }
    return coach;
  };
  // Hide / show a blue tip on the seller's coach
  app.post('/api/seller/coach/hide', requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    const key = str(req.body?.key, 40);
    if (!key) return res.status(400).json({ error: 'Missing tip.' });
    const cur: string[] = Array.isArray(seller.coachHidden) ? seller.coachHidden : [];
    const next = req.body?.show === true ? cur.filter((k) => k !== key) : Array.from(new Set([...cur, key])).slice(-30);
    try {
      await sellersCol().doc(uid).set({ coachHidden: next }, { merge: true });
      forgetSeller(uid);
      coachCache.delete(uid);
      res.json({ success: true, hidden: next });
    } catch {
      res.status(503).json({ error: 'Could not save.' });
    }
  });

  app.get('/api/seller/coach', requireSeller, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, coach: await coachOf(uid, (req as any).seller, req.query.fresh === '1') });
      // Daily auto-fix (server/sellerAi.ts) runs in the background when the seller opens the coach
      coachViewedHook?.(uid, (req as any).seller);
    } catch (err) {
      console.error('[seller/coach] failed:', err);
      res.status(503).json({ error: 'Could not prepare your shop report. Please try again.' });
    }
  });

  const EDITABLE = ['name', 'price', 'compareAtPrice', 'stock', 'status', 'shortDescription', 'description', 'seoTitle', 'seoDescription', 'seoKeywords'];
  /** Applies field changes to the seller's own products; anything not theirs is skipped */
  const applyProductPatches = async (uid: string, patches: Array<Record<string, any> & { id: string }>) => {
    const skipped: { id: string; name?: string; reason: string }[] = [];
    let updated = 0;
    const refs = patches.slice(0, 300).map((p) => adminDb.collection('products').doc(String(p.id)));
    // Ownership and current values come from the server's catalog copy (no reads); only when it is
    // not loaded yet are the products read from the database
    const mirror = d.allProductsOfSeller(uid);
    const mine = mirror ? new Map(mirror.map((p) => [p.id, p])) : null;
    const snaps = mine
      ? refs.map((ref) => ({ ref, id: ref.id, exists: mine.has(ref.id), data: () => mine.get(ref.id) }))
      : refs.length
      ? await adminDb.getAll(...refs)
      : [];
    const now = new Date().toISOString();
    let batch = adminDb.batch();
    let inBatch = 0;
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i];
      const current = snap.data() as any;
      if (!snap.exists || current?.sellerId !== uid) {
        skipped.push({ id: refs[i].id, reason: 'Not a product of your shop.' });
        continue;
      }
      const patch: Record<string, any> = {};
      for (const k of EDITABLE) if (patches[i][k] !== undefined) patch[k] = patches[i][k];
      if (patch.price !== undefined) {
        patch.price = money(patch.price);
        if (!(patch.price > 0)) {
          skipped.push({ id: snap.id, name: current.name, reason: 'Price must be more than 0.' });
          continue;
        }
        if (Number(current.compareAtPrice) > 0 && Number(current.compareAtPrice) <= patch.price && patch.compareAtPrice === undefined) patch.compareAtPrice = 0;
      }
      if (patch.stock !== undefined) patch.stock = Math.max(0, Math.floor(Number(patch.stock) || 0));
      if (patch.status !== undefined) {
        if (!['ACTIVE', 'DRAFT'].includes(patch.status)) delete patch.status;
        else if (patch.status === 'ACTIVE' && current.adminHidden) {
          skipped.push({ id: snap.id, name: current.name, reason: 'The store has hidden this product.' });
          continue;
        } else if (patch.status === 'ACTIVE' && needsBrandProof(current) && !d.supplierOf(snap.id)?.brandProofUrl) {
          skipped.push({ id: snap.id, name: current.name, reason: 'Needs a purchase invoice / brand approval first.' });
          continue;
        }
      }
      for (const [k, max] of Object.entries({ shortDescription: 480, description: 4800, seoTitle: 150, seoDescription: 310, seoKeywords: 390 })) {
        if (patch[k] !== undefined) patch[k] = str(patch[k], max);
      }
      if (patch.name !== undefined) {
        patch.name = str(patch.name, 190);
        if (patch.name.length < 3) {
          skipped.push({ id: snap.id, name: current.name, reason: 'The product name must be at least 3 characters.' });
          continue;
        }
        if (patch.name !== current.name) patch.slug = slugify(patch.name);
      }
      // "No brand": the brand becomes the shop name (shown as "No brand" on the product page)
      if (patches[i].brandType === 'NONE') {
        patch['info.brandType'] = 'NONE';
        patch.brand = current.sellerName || current.brand;
      }
      // A product that is not a proven branded item may not present itself as a famous brand
      const isBranded = (patches[i].brandType || current.info?.brandType) === 'BRANDED' && Boolean(d.supplierOf(snap.id)?.brandProofUrl);
      const nextName = patch.name ?? current.name;
      const nextShort = patch.shortDescription ?? current.shortDescription;
      if (!isBranded && (patch.name !== undefined || patch.shortDescription !== undefined) && famousBrandIn(`${nextName} ${nextShort || ''}`)) {
        skipped.push({ id: snap.id, name: current.name, reason: `The title or short description would use the brand name "${famousBrandIn(`${nextName} ${nextShort || ''}`)}".` });
        continue;
      }
      if (!Object.keys(patch).length) continue;
      batch.update(snap.ref, { ...patch, updatedAt: now });
      updated++;
      if (++inBatch >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        inBatch = 0;
      }
    }
    if (inBatch) await batch.commit();
    if (updated) forgetCoach(uid);
    return { updated, skipped };
  };

  return {
    requireSeller,
    forgetSeller,
    forgetOrders,
    suspendSeller,
    sellerData: {
      productsOf,
      ordersOf,
      earningsOf,
      applyProductPatches,
      supplierOf: d.supplierOf,
      coachOf,
      setSellerFields: async (uid: string, fields: Record<string, any>) => {
        await sellersCol().doc(uid).set(fields, { merge: true });
        forgetSeller(uid);
      },
      notify: (uid: string, shopName: string, title: string, body: string) => d.postNotice(uid, shopName, title, body, 'INFO'),
      forgetCoach: (uid: string) => coachCache.delete(uid),
    },
    setCoachViewedHook: (fn: (uid: string, seller: any) => void) => {
      coachViewedHook = fn;
    },
    /** Told about products that just went live in a shop (emails the shop's followers) */
    setProductsLiveHook: (fn: (sellerId: string, shopName: string, products: any[]) => void) => {
      productsLiveHook = fn;
    },
    forgetShop: (sellerId: string) => shopCache.delete(sellerId),
  };
}
