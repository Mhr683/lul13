import type express from 'express';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { sendFollowedShopEmail } from '../src/services/serverEmailService';

// "Follow store": customers follow a marketplace shop and get one email when it adds new products.
//
//   POST /api/shops/:id/follow        { email }   follow (signed-in customers' email is used if given)
//   POST /api/shops/:id/unfollow      { email }
//   GET  /api/follow/unsubscribe?id=&t=           one-click unfollow link in every email
//
//   store_follows/{sellerId}__{emailHash} -> { sellerId, email, userId, token, createdAt }
//   sellers/{id}.followers                        running count (shown on the shop page)
//
// New products are collected for 15 minutes per shop and sent as one email, so a seller uploading
// a CSV of 50 products sends one email, not 50. Server only: firestore.rules give browsers no access.

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface FollowDeps {
  adminDb: FirebaseFirestore.Firestore;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  callerUid: (req: express.Request) => Promise<string | null>;
  getSettings: () => any;
  /** Forget the cached public shop info (the follower count changed) */
  forgetShop: (sellerId: string) => void;
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const DIGEST_DELAY_MS = 15 * 60_000;
const MAX_FOLLOWERS_EMAILED = 1000;

export function registerFollowRoutes(app: express.Express, d: FollowDeps) {
  const { adminDb } = d;
  const col = () => adminDb.collection('store_follows');
  const followId = (sellerId: string, email: string) =>
    `${sellerId}__${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
  const storeUrl = () => String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

  const readEmail = (req: express.Request) => str(req.body?.email, 254).toLowerCase();

  app.post('/api/shops/:id/follow', d.limitPerIp('follow', 15), async (req, res) => {
    const sellerId = str(req.params.id, 128);
    const email = readEmail(req);
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    try {
      const sellerRef = adminDb.collection('sellers').doc(sellerId);
      const ref = col().doc(followId(sellerId, email));
      const userId = (await d.callerUid(req).catch(() => null)) || '';
      const result = await adminDb.runTransaction(async (tx) => {
        const [seller, existing] = await Promise.all([tx.get(sellerRef), tx.get(ref)]);
        if (!seller.exists || seller.data()?.status !== 'APPROVED') return 'NO_SHOP';
        if (existing.exists) return 'ALREADY';
        tx.set(ref, { sellerId, email, userId, token: crypto.randomBytes(18).toString('hex'), createdAt: new Date().toISOString() });
        tx.update(sellerRef, { followers: FieldValue.increment(1) });
        return 'FOLLOWED';
      });
      if (result === 'NO_SHOP') return res.status(404).json({ error: 'Shop not found.' });
      d.forgetShop(sellerId);
      res.json({ success: true, following: true, already: result === 'ALREADY' });
    } catch (err: any) {
      console.error('[follow] failed:', err?.message);
      res.status(503).json({ error: 'Could not follow the shop. Please try again.' });
    }
  });

  const unfollow = async (sellerId: string, ref: FirebaseFirestore.DocumentReference, token?: string) =>
    adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      if (token !== undefined && snap.data()?.token !== token) return false;
      tx.delete(ref);
      tx.update(adminDb.collection('sellers').doc(sellerId), { followers: FieldValue.increment(-1) });
      return true;
    });

  app.post('/api/shops/:id/unfollow', d.limitPerIp('follow', 15), async (req, res) => {
    const sellerId = str(req.params.id, 128);
    const email = readEmail(req);
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    try {
      await unfollow(sellerId, col().doc(followId(sellerId, email)));
      d.forgetShop(sellerId);
      res.json({ success: true, following: false });
    } catch (err: any) {
      console.error('[unfollow] failed:', err?.message);
      res.status(503).json({ error: 'Could not unfollow. Please try again.' });
    }
  });

  // The link in every email: works without signing in (the follow's private token proves it)
  app.get('/api/follow/unsubscribe', d.limitPerIp('unfollow-link', 20), async (req, res) => {
    const id = str(req.query.id, 200);
    const token = str(req.query.t, 64);
    const sellerId = id.split('__')[0] || '';
    let ok = false;
    try {
      if (id && token && sellerId) ok = await unfollow(sellerId, col().doc(id), token);
      if (ok) d.forgetShop(sellerId);
    } catch (err: any) {
      console.warn('[unfollow link] failed:', err?.message);
    }
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unfollow</title></head>` +
          `<body style="font-family:system-ui,sans-serif;background:#F9F9F7;display:grid;place-items:center;min-height:100vh;margin:0">` +
          `<div style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">${ok ? 'You have unfollowed this shop' : 'Nothing to unfollow'}</h1>` +
          `<p style="color:#575653;font-size:14px">${ok ? 'You will not get emails about its new products any more.' : 'This link was already used or is not valid.'}</p>` +
          `<p><a href="${storeUrl()}/" style="color:#0E7A43;font-weight:600">Back to the store</a></p></div></body></html>`
      );
  });

  // ---------------------------------------------------------------- new product emails

  const pending = new Map<string, { shopName: string; products: Map<string, any>; timer: NodeJS.Timeout }>();

  const sendDigest = async (sellerId: string) => {
    const entry = pending.get(sellerId);
    pending.delete(sellerId);
    if (!entry || !entry.products.size) return;
    const followers = await col().where('sellerId', '==', sellerId).limit(MAX_FOLLOWERS_EMAILED).get();
    if (followers.empty) return;
    const s = d.getSettings() || {};
    const shopUrl = `${storeUrl()}/#shop/${encodeURIComponent(sellerId)}`;
    const products = Array.from(entry.products.values()).map((p) => ({
      name: String(p.name || 'New product'),
      price: Number(p.price) || 0,
      url: `${storeUrl()}/#product/${encodeURIComponent(p.id)}`,
      image: p.primaryImage || '',
    }));
    let sent = 0;
    for (const doc of followers.docs) {
      const f = doc.data();
      const r = await sendFollowedShopEmail(adminDb, {
        to: f.email,
        shopName: entry.shopName || 'A shop you follow',
        shopUrl,
        unsubscribeUrl: `${storeUrl()}/api/follow/unsubscribe?id=${encodeURIComponent(doc.id)}&t=${encodeURIComponent(f.token || '')}`,
        products,
        storeName: s.storeName || 'Store',
        supportEmail: s.supportEmail || s.contactEmail || undefined,
      });
      if (r.success) sent++;
      // Resend's free plan allows about 2 emails a second
      await new Promise((r2) => setTimeout(r2, 600));
    }
    console.log(`[followers] ${entry.shopName}: ${products.length} new product(s), emailed ${sent}/${followers.size} followers`);
  };

  return {
    /** Queue products that just went live; one email per shop every 15 minutes at most */
    productsLive(sellerId: string, shopName: string, products: any[]) {
      if (!sellerId || !products.length) return;
      let entry = pending.get(sellerId);
      if (!entry) {
        entry = {
          shopName,
          products: new Map(),
          timer: setTimeout(() => sendDigest(sellerId).catch((err) => console.warn('[followers] digest failed:', err?.message)), DIGEST_DELAY_MS),
        };
        pending.set(sellerId, entry);
      }
      entry.shopName = shopName || entry.shopName;
      for (const p of products) if (p?.id) entry.products.set(p.id, p);
    },
  };
}
