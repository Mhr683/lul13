import type express from 'express';
import crypto from 'crypto';

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
  HOUSE_SELLER_ID: string;
  DEFAULT_COMMISSION_PERCENT: number;
}

const SELLER_ORDER_STATUSES = ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const CLOSED_STATUSES = ['CANCELLED', 'RETURNED', 'REFUNDED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'];
const SHIPPED_OR_LATER = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

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
    const orders = await loadSellerOrders(sellerId, 1000);
    ordersCache.set(sellerId, { at: Date.now(), orders });
    return orders;
  };
  const forgetOrders = (sellerId: string) => ordersCache.delete(sellerId);

  const summarizeEarnings = (orders: any[]) => {
    let pending = 0;
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
        else available += Number(o.sellerEarning) || 0;
      } else {
        pending += Number(o.sellerEarning) || 0;
      }
    }
    return {
      pending: money(pending),
      available: money(available),
      paid: money(paid),
      commission: money(commission),
      supplierCost: money(supplierCost),
      // earnings after paying suppliers (dropshipping), before returns
      profit: money(earnings - supplierCost),
    };
  };

  // Strip supplier/internal fields before sending an order to the seller
  const sellerSafeOrder = (o: any) => {
    const { orderAccessToken, ...rest } = o;
    return {
      ...rest,
      items: (o.items || []).map(({ supplierName, supplierSku, supplierProductUrl, supplierCostPrice, ...item }: any) => item),
    };
  };

  // ---------------------------------------------------------------- seller: account

  app.get('/api/seller/me', d.requireAuth, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      const { seller, privateData } = await loadSeller(uid);
      let commissionPercent: number | null = null;
      if (seller) commissionPercent = await commissionFor(seller);
      res.json({ success: true, seller, privateData, commissionPercent });
    } catch (err) {
      console.error('[seller/me] failed:', err);
      res.status(503).json({ error: 'Could not load your seller account. Please try again.' });
    }
  });

  // Apply (or re-apply after a rejection). The store's admins approve applications.
  app.post('/api/seller/apply', d.requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first (check your inbox for the link), then apply.', code: 'EMAIL_NOT_VERIFIED' });
    }
    const b = req.body || {};
    const shopName = str(b.shopName, 60);
    const ownerName = str(b.ownerName, 80);
    const phone = str(b.phone, 20).replace(/[^\d+]/g, '');
    const city = str(b.city, 60);
    const cnic = str(b.cnic, 20).replace(/[^\d-]/g, '');
    const address = str(b.address, 300);
    const bankName = str(b.bankName, 60);
    const accountTitle = str(b.accountTitle, 80);
    const accountNumber = str(b.accountNumber, 40).replace(/\s+/g, '');

    const missing: string[] = [];
    if (shopName.length < 3) missing.push('Shop name');
    if (ownerName.length < 3) missing.push('Your name');
    if (!/^(\+92|0)3\d{9}$/.test(phone)) missing.push('Mobile number (03XXXXXXXXX)');
    if (city.length < 2) missing.push('City');
    if (cnic.replace(/-/g, '').length !== 13) missing.push('CNIC (13 digits)');
    if (address.length < 8) missing.push('Address');
    if (bankName.length < 2 || accountTitle.length < 3 || accountNumber.length < 8) missing.push('Bank details');
    if (missing.length) return res.status(400).json({ error: `Please check: ${missing.join(', ')}.` });

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
        status: 'PENDING',
        statusReason: '',
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });
      await adminDb.collection('seller_private').doc(user.uid).set({ cnic, address, bankName, accountTitle, accountNumber, updatedAt: now });
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
      const phone = str(b.phone, 20).replace(/[^\d+]/g, '');
      if (!/^(\+92|0)3\d{9}$/.test(phone)) return res.status(400).json({ error: 'Mobile number must be in the format 03XXXXXXXXX.' });
      updates.phone = phone;
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
    const primaryImage = str(b.primaryImage, 980);
    if (name.length < 3) return { error: 'Enter a product name (at least 3 characters).' };
    if (!(price > 0)) return { error: 'Enter a price (PKR).' };
    if (category.length < 2) return { error: 'Choose a category.' };
    if (primaryImage && !/^https:\/\//i.test(primaryImage)) return { error: 'The image link must start with https://' };
    return {
      fields: {
        name,
        price,
        compareAtPrice: money(b.compareAtPrice),
        stock: Math.max(0, Math.floor(Number(b.stock) || 0)),
        category,
        status: b.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
        primaryImage,
        sellerSku: str(b.sku, 60).replace(/[^a-zA-Z0-9_.-]/g, '-'),
      },
    };
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
    return {
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
      brand: str(b.brand, 75) || existing?.brand || seller.shopName,
      status: adminHidden ? 'DRAFT' : status,
      featured: existing?.featured ?? false,
      bestSeller: existing?.bestSeller ?? false,
      newArrival: existing?.newArrival ?? true,
      seoTitle: existing?.seoTitle || `${name} | ${seller.shopName}`.slice(0, 150),
      seoDescription: existing?.seoDescription || shortDescription.slice(0, 310),
      seoKeywords: existing?.seoKeywords || `${category.toLowerCase()}, ${seller.shopName.toLowerCase()}`.slice(0, 390),
      // A CSV row without a picture keeps the one the product already has
      primaryImage: primaryImage || (b.fromCsv ? existing?.primaryImage || '' : ''),
      rating: existing?.rating ?? 0,
      reviewCount: existing?.reviewCount ?? 0,
      weightKg: Math.max(0.05, Number(b.weightKg) || existing?.weightKg || 0.5),
      dimensions: existing?.dimensions || '20cm x 15cm x 10cm',
      sellerId: uid,
      sellerName: seller.shopName,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
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
  app.post('/api/seller/products/bulk', requireSeller, async (req, res) => {
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
        batch.set(adminDb.collection('products').doc(id), product);
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
      res.json({ success: true, created, updated, errors });
    } catch (err) {
      console.error('[seller/products bulk] failed:', err);
      res.status(503).json({ error: 'Could not save the products. Please try again.' });
    }
  });

  app.post('/api/seller/products', requireSeller, async (req, res) => {
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
      const batch = adminDb.batch();
      batch.set(adminDb.collection('products').doc(id), product);
      if (supplier) batch.set(adminDb.collection('product_private').doc(id), supplierDoc(id, supplier), { merge: true });
      await batch.commit();
      res.json({ success: true, product: listFields(product) });
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
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/products archive] failed:', err);
      res.status(503).json({ error: 'Could not remove the product. Please try again.' });
    }
  });

  // Copy the pictures of the seller's products into the store's own storage, so they stay even when
  // the supplier removes them (needs Firebase Storage, i.e. the Blaze plan)
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
        updates.cancellationReason = str(req.body?.reason, 300) || `Cancelled by seller (${(req as any).seller.shopName})`;
        updates.cancelledAt = updates.updatedAt;
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
      const [orders, payoutsSnap] = await Promise.all([
        sellerOrdersCached(uid),
        adminDb.collection('payouts').where('sellerId', '==', uid).limit(200).get(),
      ]);
      const payouts = payoutsSnap.docs
        .map((doc) => ({ ...(doc.data() as any), id: doc.id }))
        .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        summary: summarizeEarnings(orders),
        commissionPercent: await commissionFor((req as any).seller),
        payouts,
      });
    } catch (err) {
      console.error('[seller/earnings] failed:', err);
      res.status(503).json({ error: 'Could not load your earnings. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- admin: sellers

  app.get('/api/admin/sellers', d.requireAdmin, async (_req, res) => {
    try {
      const [sellersSnap, privSnap] = await Promise.all([sellersCol().limit(500).get(), adminDb.collection('seller_private').limit(500).get()]);
      const privById = new Map(privSnap.docs.map((p) => [p.id, p.data()]));
      const sellers = await Promise.all(
        sellersSnap.docs.map(async (doc) => {
          const s = doc.data() as any;
          let summary = { pending: 0, available: 0, paid: 0, commission: 0 };
          let productCount = 0;
          if (s.status === 'APPROVED' || s.status === 'SUSPENDED') {
            const [orders, count] = await Promise.all([
              sellerOrdersCached(doc.id),
              adminDb.collection('products').where('sellerId', '==', doc.id).count().get(),
            ]);
            summary = summarizeEarnings(orders);
            productCount = count.data().count;
          }
          return { ...s, id: doc.id, privateData: privById.get(doc.id) || null, summary, productCount };
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

  // Approve / reject / suspend a seller, or change their commission
  app.post('/api/admin/sellers/:id', d.requireAdmin, async (req, res) => {
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

      // A suspended seller's live products leave the store; they come back when re-approved
      const statusChanged = updates.status && updates.status !== current.status;
      let changedProducts = 0;
      if (statusChanged && (updates.status === 'SUSPENDED' || updates.status === 'APPROVED')) {
        const products = await adminDb.collection('products').where('sellerId', '==', id).limit(2000).get();
        const toChange = products.docs.filter((p) =>
          updates.status === 'SUSPENDED' ? p.data().status === 'ACTIVE' : p.data().suspendedHidden === true
        );
        for (let i = 0; i < toChange.length; i += 400) {
          const batch = adminDb.batch();
          for (const p of toChange.slice(i, i + 400)) {
            batch.update(
              p.ref,
              updates.status === 'SUSPENDED'
                ? { status: 'DRAFT', suspendedHidden: true, updatedAt: now }
                : { status: 'ACTIVE', suspendedHidden: false, updatedAt: now }
            );
          }
          await batch.commit();
        }
        changedProducts = toChange.length;
      }
      res.json({ success: true, changedProducts });
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
  app.post('/api/admin/payouts', d.requireAdmin, async (req, res) => {
    const sellerId = str(req.body?.sellerId, 128);
    const reference = str(req.body?.reference, 120);
    const note = str(req.body?.note, 300);
    if (!sellerId || sellerId === d.HOUSE_SELLER_ID) return res.status(400).json({ error: 'Choose a seller.' });
    if (reference.length < 3) return res.status(400).json({ error: 'Enter the bank transfer reference / TID.' });
    try {
      forgetOrders(sellerId);
      const orders = await loadSellerOrders(sellerId, 1000);
      const due = orders.filter((o) => o.status === 'DELIVERED' && !o.payoutId && Number(o.sellerEarning) > 0);
      if (due.length === 0) return res.status(409).json({ error: 'This seller has no payout due.' });
      const amount = money(due.reduce((s, o) => s + Number(o.sellerEarning || 0), 0));
      const payoutRef = adminDb.collection('payouts').doc(`pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`);
      const paidAt = new Date().toISOString();
      await adminDb.runTransaction(async (tx) => {
        // Re-check inside the transaction so an order is never paid twice
        const privRefs = due.map((o) => adminDb.collection('order_private').doc(o.id));
        const privs = await Promise.all(privRefs.map((r) => tx.get(r)));
        if (privs.some((p) => p.data()?.payoutId)) throw new Error('ALREADY_PAID');
        tx.set(payoutRef, {
          id: payoutRef.id,
          sellerId,
          amount,
          orderIds: due.map((o) => o.id),
          orderNumbers: due.map((o) => o.orderNumber),
          reference,
          note,
          paidAt,
          paidBy: String((req as any).user?.email || 'admin'),
        });
        for (const r of privRefs) tx.set(r, { payoutId: payoutRef.id, paidOutAt: paidAt }, { merge: true });
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
  app.get('/api/shops/:id', async (req, res) => {
    const id = str(req.params.id, 128);
    try {
      let hit = shopCache.get(id);
      if (!hit || Date.now() - hit.at > 10 * 60_000) {
        const snap = await sellersCol().doc(id).get();
        const s = snap.exists ? (snap.data() as any) : null;
        hit = {
          at: Date.now(),
          shop:
            s && s.status === 'APPROVED'
              ? { id, shopName: s.shopName, logoUrl: s.logoUrl || '', city: s.city || '', joinedAt: s.createdAt || '' }
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

  // Used by the seller inbox routes (server/sellerInbox.ts)
  return { requireSeller, forgetSeller };
}
