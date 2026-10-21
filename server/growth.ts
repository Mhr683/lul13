import type express from 'express';
import crypto from 'crypto';
import { MAX_FLASH_DAYS, referralOf } from '../src/services/promotions';

// Growth features:
//   GET  /api/social-proof            real recent purchases ("Ayesha from Lahore just bought ...")
//   POST /api/carts/save               a checkout the customer started (only with their consent)
//   GET  /api/admin/carts              abandoned checkouts for WhatsApp reminders (admin)
//   GET  /api/referral/me              the signed-in customer's referral code, link and credit
//   POST /api/admin/flash-deal         flash deal on any product (admin)
//   POST /api/seller/products/:id/flash  flash deal on the seller's own product
//
//   referral_codes/{code}  -> { uid }     users/{uid}.referralCode, referralCreditUsed
//   abandoned_carts/{phoneHash}           removed when that phone places an order

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface GrowthDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAuth: Handler;
  requireAdmin: Handler;
  requireSeller: Handler;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  getSettings: () => any;
  productById: (id: string) => any | null;
  isQuotaHit: () => boolean;
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
export const phoneKey = (phone: string) => crypto.createHash('sha256').update(String(phone).replace(/\D/g, '').slice(-10)).digest('hex').slice(0, 32);
const firstName = (n: string) => String(n || '').trim().split(/\s+/)[0]?.slice(0, 14) || 'Someone';

/** Referral credit of a customer: reward × their friends' delivered first orders − credit already used */
export async function referralCreditOf(adminDb: FirebaseFirestore.Firestore, uid: string, settings: any) {
  const r = referralOf(settings);
  const [countSnap, userSnap] = await Promise.all([
    adminDb.collection('orders').where('referredBy', '==', uid).where('status', '==', 'DELIVERED').count().get(),
    adminDb.collection('users').doc(uid).get(),
  ]);
  const friends = countSnap.data().count;
  const earned = friends * r.rewardPkr;
  const used = Number(userSnap.data()?.referralCreditUsed) || 0;
  return { friends, earned, used, available: Math.max(0, earned - used) };
}

export function registerGrowthRoutes(app: express.Express, d: GrowthDeps) {
  const { adminDb } = d;

  // ---------------------------------------------------------------- social proof (real orders only)
  let proofCache: { at: number; list: any[] } | null = null;
  app.get('/api/social-proof', async (_req, res) => {
    try {
      if (d.getSettings()?.socialProofEnabled === false) return res.json({ success: true, purchases: [] });
      // 10 minutes; an empty list (e.g. while the catalog is still loading) is retried after 1 minute
      if (!proofCache || Date.now() - proofCache.at > (proofCache.list.length ? 10 : 1) * 60_000) {
        if (d.isQuotaHit()) return res.json({ success: true, purchases: proofCache?.list || [] });
        const snap = await adminDb.collection('orders').orderBy('createdAt', 'desc').limit(25).get();
        const weekAgo = Date.now() - 7 * 86400_000;
        const list = snap.docs
          .map((doc) => doc.data() as any)
          .filter((o) => Date.parse(o.createdAt) > weekAgo && !['CANCELLED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'].includes(o.status))
          .map((o) => {
            const it = (o.items || [])[0] || {};
            const product = d.productById(it.productId);
            if (!product || product.status !== 'ACTIVE') return null;
            return {
              // first name and city only
              name: firstName(o.customerName),
              city: String(o.district || o.city || '').slice(0, 30),
              productId: it.productId,
              productName: String(product.name).slice(0, 70),
              image: product.primaryImage || '',
              at: o.createdAt,
            };
          })
          .filter(Boolean);
        proofCache = { at: Date.now(), list };
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, purchases: proofCache.list });
    } catch (err) {
      console.error('[social-proof] failed:', err);
      res.json({ success: true, purchases: proofCache?.list || [] });
    }
  });

  // ---------------------------------------------------------------- abandoned checkouts
  app.post('/api/carts/save', d.limitPerIp('carts', 20), async (req, res) => {
    const b = req.body || {};
    const phone = str(b.phone, 20).replace(/[^\d+]/g, '');
    if (b.consent !== true) return res.json({ success: true, saved: false });
    if (!/^(\+?92|0)3\d{9}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone.' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((it: any) => ({
      productId: str(it.productId, 128),
      name: str(it.name, 120),
      quantity: Math.max(1, Math.min(99, Math.floor(Number(it.quantity) || 1))),
      price: Math.max(0, Number(it.price) || 0),
    }));
    if (!items.length) return res.json({ success: true, saved: false });
    try {
      const id = phoneKey(phone);
      await adminDb.collection('abandoned_carts').doc(id).set({
        id,
        phone,
        name: str(b.name, 60),
        items,
        total: Math.round(items.reduce((s: number, it: any) => s + it.price * it.quantity, 0)),
        consent: true,
        status: 'OPEN',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      res.json({ success: true, saved: true });
    } catch (err) {
      console.error('[carts/save] failed:', err);
      res.status(503).json({ error: 'Could not save.' });
    }
  });

  let cartsCache: { at: number; list: any[] } | null = null;
  app.get('/api/admin/carts', d.requireAdmin, async (_req, res) => {
    try {
      if (!cartsCache || Date.now() - cartsCache.at > 60_000) {
        const snap = await adminDb.collection('abandoned_carts').orderBy('updatedAt', 'desc').limit(200).get();
        cartsCache = { at: Date.now(), list: snap.docs.map((doc) => doc.data()) };
      }
      // Waiting at least 30 minutes, still not ordered
      const cutoff = Date.now() - 30 * 60_000;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, carts: cartsCache.list.filter((c: any) => c.status !== 'ORDERED' && Date.parse(c.updatedAt) < cutoff) });
    } catch (err) {
      console.error('[admin/carts] failed:', err);
      res.status(503).json({ error: 'Could not load abandoned carts.' });
    }
  });
  app.post('/api/admin/carts/:id/reminded', d.requireAdmin, async (req, res) => {
    try {
      const ref = adminDb.collection('abandoned_carts').doc(str(req.params.id, 40));
      const remove = req.body?.remove === true;
      if (remove) await ref.delete();
      else await ref.set({ status: 'REMINDED', remindedAt: new Date().toISOString() }, { merge: true });
      cartsCache = null;
      res.json({ success: true });
    } catch (err) {
      console.error('[admin/carts reminded] failed:', err);
      res.status(503).json({ error: 'Could not update.' });
    }
  });

  // ---------------------------------------------------------------- refer & earn
  const codeFor = (uid: string) => `AS${crypto.createHash('sha256').update(uid).digest('hex').slice(0, 6).toUpperCase()}`;
  app.get('/api/referral/me', d.requireAuth, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const settings = d.getSettings();
    const r = referralOf(settings);
    try {
      const userRef = adminDb.collection('users').doc(uid);
      const user = (await userRef.get()).data() as any;
      let code = user?.referralCode as string | undefined;
      if (!code) {
        code = codeFor(uid);
        await Promise.all([
          adminDb.collection('referral_codes').doc(code).set({ uid, createdAt: new Date().toISOString() }),
          userRef.set({ referralCode: code }, { merge: true }),
        ]);
      }
      const credit = await referralCreditOf(adminDb, uid, settings);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, enabled: r.enabled, code, rewardPkr: r.rewardPkr, maxPercentOfOrder: r.maxPercentOfOrder, ...credit });
    } catch (err) {
      console.error('[referral/me] failed:', err);
      res.status(503).json({ error: 'Could not load your referral details.' });
    }
  });

  // ---------------------------------------------------------------- flash deals
  const readFlash = (b: any, price: number) => {
    if (b.clear === true) return { flashPrice: 0, flashStartsAt: '', flashEndsAt: '' };
    const fp = Math.round(Number(b.flashPrice));
    const start = b.startsAt ? Date.parse(b.startsAt) : Date.now();
    const end = Date.parse(b.endsAt);
    if (!(fp > 0) || fp >= price) return { error: 'The deal price must be lower than the normal price.' };
    if (isNaN(start) || isNaN(end) || end <= start || end <= Date.now()) return { error: 'Choose when the deal ends (after it starts).' };
    if (end - start > MAX_FLASH_DAYS * 86400_000) return { error: `A flash deal can run at most ${MAX_FLASH_DAYS} days.` };
    return { flashPrice: fp, flashStartsAt: new Date(start).toISOString(), flashEndsAt: new Date(end).toISOString() };
  };
  const saveFlash = async (productId: string, b: any, ownerUid: string | null, res: express.Response) => {
    const ref = adminDb.collection('products').doc(productId);
    const p = d.productById(productId) || ((await ref.get()).data() as any);
    if (!p || (ownerUid && p.sellerId !== ownerUid)) return res.status(404).json({ error: 'Product not found.' });
    const f = readFlash(b, Number(p.price) || 0);
    if ('error' in f) return res.status(400).json({ error: f.error });
    await ref.update({ ...f, updatedAt: new Date().toISOString() });
    res.json({ success: true, ...f });
  };
  app.post('/api/admin/flash-deal', d.requireAdmin, async (req, res) => {
    try {
      await saveFlash(str(req.body?.productId, 128), req.body || {}, null, res);
    } catch (err) {
      console.error('[admin/flash-deal] failed:', err);
      res.status(503).json({ error: 'Could not save the deal.' });
    }
  });
  app.post('/api/seller/products/:id/flash', d.requireSeller, async (req, res) => {
    try {
      await saveFlash(str(req.params.id, 128), req.body || {}, (req as any).user.uid, res);
    } catch (err) {
      console.error('[seller flash] failed:', err);
      res.status(503).json({ error: 'Could not save the deal.' });
    }
  });
}
