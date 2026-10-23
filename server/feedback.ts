import type express from 'express';
import crypto from 'crypto';
import { POLICY } from './policyRules';

// Customer feedback on sellers and likes / dislikes on products.
//
//   seller_feedback/{orderNumber}   one rating (1-5) + comment per delivered order, from the buyer
//   product_reactions/{productId}__{voter}   one like or dislike per product per customer / device
//   products.likes / products.dislikes       running totals (shown in the store from the catalog copy)
//   sellers/{id}.rating*                     running rating totals, so no feedback list is re-read
//   sellers/{id}.activity / activityUnread   the seller's notifications (new feedback, likes, dislikes)
//
// Writes go through these routes only (Firestore rules give browsers no access to these collections).

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface FeedbackDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireSeller: Handler;
  requireAdmin: Handler;
  /** uid of a signed-in caller (Authorization header), or null */
  callerUid: (req: express.Request) => Promise<string | null>;
  forgetSeller: (uid: string) => void;
  forgetShop: (sellerId: string) => void;
  /** Supplier Code of Conduct: a rating below 3.0 suspends the seller */
  suspendSeller: (sellerId: string, reason: string, cause?: 'RATING' | 'OTHER') => Promise<boolean>;
  postNotice: (sellerId: string, sellerName: string, title: string, body: string, level: 'INFO' | 'WARNING' | 'URGENT') => Promise<void>;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  /** Saves an uploaded file (Firebase Storage, or the server's disk) and returns its URL */
  storeMedia: (buffer: Buffer, ext: string, contentType: string) => Promise<string>;
}

// Customer photos / videos on a review: at most 4 files, only from the review upload route below
const MAX_REVIEW_MEDIA = 4;
const isStoredMedia = (u: string) =>
  /^\/media\/[a-f0-9]{24}\.(jpg|png|webp|mp4|webm|mov)$/.test(u) ||
  /^https:\/\/(storage\.googleapis\.com|firebasestorage\.googleapis\.com)\/[^\s"'<>]+$/.test(u);
const reviewMedia = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.map((u) => String(u || '').trim()).filter(isStoredMedia))).slice(0, MAX_REVIEW_MEDIA) : [];

const MAX_ACTIVITY = 60;
// sellerId stored on reviews of orders sold by the store itself (products are rated, no seller is)
const HOUSE_SELLER = 'house';
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// "Ayesha K." from "Ayesha Khan"
const shortName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length === 1 ? parts[0].slice(0, 20) : `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

export const ratingSummary = (s: any) => {
  const count = Number(s?.ratingCount) || 0;
  const sum = Number(s?.ratingSum) || 0;
  const positive = Number(s?.ratingPositive) || 0;
  return {
    ratingAvg: count ? Math.round((sum / count) * 10) / 10 : 0,
    ratingCount: count,
    positivePercent: count ? Math.round((positive / count) * 100) : 0,
    likes: Number(s?.likes) || 0,
    dislikes: Number(s?.dislikes) || 0,
  };
};

export function registerFeedbackRoutes(app: express.Express, d: FeedbackDeps) {
  const { adminDb } = d;
  const feedbackCol = () => adminDb.collection('seller_feedback');

  const activityEntry = (type: string, text: string, extra: Record<string, any> = {}) => ({
    id: crypto.randomBytes(4).toString('hex'),
    type,
    text: text.slice(0, 200),
    at: new Date().toISOString(),
    ...extra,
  });
  const pushActivity = (current: any[] | undefined, entry: any) => [entry, ...(current || [])].slice(0, MAX_ACTIVITY);

  const findOrder = async (orderNumber: string) => {
    const snap = await adminDb.collection('orders').where('orderNumber', '==', orderNumber).limit(1).get();
    return snap.empty ? null : { ref: snap.docs[0].ref, order: { ...(snap.docs[0].data() as any), id: snap.docs[0].id } };
  };

  // The buyer proves the order is theirs with its private token, or by being signed in as its owner
  const canReview = async (req: express.Request, order: any, token: string) => {
    if (token && order.orderAccessToken && token === order.orderAccessToken) return true;
    const uid = await d.callerUid(req);
    return Boolean(uid && order.userId && uid === order.userId);
  };

  // Public feedback of a shop, newest first (kept 5 minutes per shop)
  const shopFeedbackCache = new Map<string, { at: number; list: any[] }>();
  const publicFeedback = async (sellerId: string) => {
    const hit = shopFeedbackCache.get(sellerId);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.list;
    const [snap, sellerSnap] = await Promise.all([
      feedbackCol().where('sellerId', '==', sellerId).limit(200).get(),
      adminDb.collection('sellers').doc(sellerId).get(),
    ]);
    // After a one-time reinstatement the shop's rating starts fresh: older reviews are not shown
    const resetAt = String((sellerSnap.data() as any)?.ratingResetAt || '');
    const list = snap.docs
      .map((doc) => doc.data() as any)
      .filter((f) => f.status !== 'HIDDEN' && (!resetAt || String(f.createdAt) > resetAt))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50)
      .map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        customerName: f.customerName,
        productNames: f.productNames || [],
        createdAt: f.createdAt,
        sellerReply: f.sellerReply || '',
        media: reviewMedia(f.media),
      }));
    shopFeedbackCache.set(sellerId, { at: Date.now(), list });
    if (shopFeedbackCache.size > 2000) shopFeedbackCache.clear();
    return list;
  };
  const forgetFeedback = (sellerId: string) => {
    shopFeedbackCache.delete(sellerId);
    d.forgetShop(sellerId);
    d.forgetSeller(sellerId);
  };

  // ---------------------------------------------------------------- customers

  // Which of the customer's delivered orders were already rated (only for orders they can prove)
  app.post('/api/feedback/check', d.limitPerIp('feedback-check', 30), async (req, res) => {
    const list = Array.isArray(req.body?.orders) ? req.body.orders.slice(0, 20) : [];
    try {
      const refs = list.map((o: any) => feedbackCol().doc(str(o?.orderNumber, 40).toUpperCase() || 'x'));
      const docs = refs.length ? await adminDb.getAll(...refs) : [];
      const rated: Record<string, number> = {};
      docs.forEach((doc, i) => {
        const f = doc.data() as any;
        if (doc.exists && f && String(list[i]?.token || '') && f.tokenHash === hash(String(list[i].token))) rated[doc.id] = f.rating;
      });
      res.json({ success: true, rated });
    } catch (err) {
      console.error('[feedback/check] failed:', err);
      res.status(503).json({ error: 'Could not check your reviews.' });
    }
  });

  const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

  // A photo or short video for a review. Only the buyer of a delivered order can upload (the order
  // number and its private token come in headers, like return photos); the type is checked from the
  // file's first bytes, not from what the browser says.
  app.post('/api/feedback/upload', d.limitPerIp('feedback-upload', 12), async (req, res) => {
    const orderNumber = str(req.headers['x-order-number'], 40).toUpperCase();
    const token = str(req.headers['x-order-token'], 200);
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length < 12) return res.status(400).json({ error: 'No file received.' });
    const jpg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    const png = body[0] === 0x89 && body.toString('ascii', 1, 4) === 'PNG';
    const webp = body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
    const ftyp = body.toString('ascii', 4, 8) === 'ftyp';
    const brand = ftyp ? body.toString('ascii', 8, 12) : '';
    const mov = ftyp && brand.startsWith('qt');
    const mp4 = ftyp && !mov && !/^(avif|avis|heic|heix|mif1|msf1)/.test(brand);
    const webm = body[0] === 0x1a && body[1] === 0x45 && body[2] === 0xdf && body[3] === 0xa3;
    const isVideo = mp4 || mov || webm;
    if (!jpg && !png && !webp && !isVideo) return res.status(415).json({ error: 'Use a JPG, PNG or WEBP photo, or an MP4 video.' });
    if (!isVideo && body.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Photos can be at most 8 MB.' });
    if (isVideo && body.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'Videos can be at most 20 MB (about 30 seconds).' });
    try {
      const found = await findOrder(orderNumber);
      if (!found || !(await canReview(req, found.order, token))) return res.status(403).json({ error: 'Only the buyer of this order can add photos.' });
      if (found.order.status !== 'DELIVERED') return res.status(409).json({ error: 'You can add photos once the order has been delivered.' });
      const [ext, type] = jpg
        ? ['jpg', 'image/jpeg']
        : png
        ? ['png', 'image/png']
        : webp
        ? ['webp', 'image/webp']
        : mov
        ? ['mov', 'video/quicktime']
        : webm
        ? ['webm', 'video/webm']
        : ['mp4', 'video/mp4'];
      const url = await d.storeMedia(body, ext, type);
      res.json({ success: true, url, video: isVideo });
    } catch (err) {
      console.error('[feedback/upload] failed:', err);
      res.status(503).json({ error: 'Could not save the file. Please try again.' });
    }
  });

  // Rate the seller of a delivered order (once per order)
  app.post('/api/feedback', d.limitPerIp('feedback', 10), async (req, res) => {
    const b = req.body || {};
    const orderNumber = str(b.orderNumber, 40).toUpperCase();
    const token = str(b.token, 200);
    const rating = Math.round(Number(b.rating));
    const comment = str(b.comment, 800);
    if (!orderNumber) return res.status(400).json({ error: 'Order number is required.' });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });
    try {
      const found = await findOrder(orderNumber);
      if (!found) return res.status(404).json({ error: 'Order not found.' });
      const { order } = found;
      if (!(await canReview(req, order, token))) return res.status(403).json({ error: 'Only the buyer of this order can rate it.' });
      if (order.status !== 'DELIVERED') return res.status(409).json({ error: 'You can rate the seller once the order has been delivered.' });
      // Orders sold by the store itself have no marketplace seller: the review rates the products only
      const isHouse = !order.sellerId || order.sellerId === HOUSE_SELLER;
      const sellerId = isHouse ? HOUSE_SELLER : String(order.sellerId);

      const fbRef = feedbackCol().doc(orderNumber);
      const sellerRef = adminDb.collection('sellers').doc(sellerId);
      const now = new Date().toISOString();
      const feedback = {
        id: orderNumber,
        orderId: order.id,
        orderNumber,
        sellerId,
        sellerName: order.sellerName || '',
        rating,
        comment,
        customerName: shortName(order.customerName),
        productNames: (order.items || []).map((it: any) => String(it.name || '').slice(0, 120)).slice(0, 5),
        productIds: Array.from(new Set((order.items || []).map((it: any) => String(it.productId || '')).filter(Boolean))).slice(0, 10) as string[],
        status: 'PUBLISHED',
        createdAt: now,
        tokenHash: token ? hash(token) : '',
        userId: order.userId || '',
        // Photos / videos the buyer uploaded through /api/feedback/upload
        media: reviewMedia(b.media),
      };
      const productRefs = feedback.productIds.map((id) => adminDb.collection('products').doc(id));
      let newCount = 0;
      let newAvg = 0;
      let reinstatedBefore = false;
      const created = await adminDb.runTransaction(async (tx) => {
        const [existing, sellerSnap, ...productSnaps] = await Promise.all([
          tx.get(fbRef),
          isHouse ? Promise.resolve(null) : tx.get(sellerRef),
          ...productRefs.map((r) => tx.get(r)),
        ]);
        if (existing.exists) return false;
        const s = (sellerSnap?.data() as any) || {};
        reinstatedBefore = s.reinstatementUsed === true;
        newCount = (Number(s.ratingCount) || 0) + 1;
        newAvg = ((Number(s.ratingSum) || 0) + rating) / newCount;
        tx.set(fbRef, feedback);
        // Each product bought gets the stars too (shown on product cards and the product page)
        productSnaps.forEach((snap, i) => {
          if (!snap.exists) return;
          const p = snap.data() as any;
          const count = Number(p.reviewCount) || 0;
          const avg = Number(p.rating) || 0;
          tx.update(productRefs[i], {
            reviewCount: count + 1,
            rating: Math.round(((avg * count + rating) / (count + 1)) * 10) / 10,
            updatedAt: now,
          });
        });
        if (isHouse) return true;
        tx.set(
          sellerRef,
          {
            ratingSum: (Number(s.ratingSum) || 0) + rating,
            ratingCount: (Number(s.ratingCount) || 0) + 1,
            ratingPositive: (Number(s.ratingPositive) || 0) + (rating >= 4 ? 1 : 0),
            activity: pushActivity(
              s.activity,
              activityEntry('FEEDBACK', `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} from ${feedback.customerName} on order ${orderNumber}${comment ? `: "${comment.slice(0, 80)}"` : ''}`, { orderNumber, rating })
            ),
            activityUnread: (Number(s.activityUnread) || 0) + 1,
          },
          { merge: true }
        );
        return true;
      });
      if (!created) return res.status(409).json({ error: 'You have already rated this order. Thank you!' });
      if (!isHouse) forgetFeedback(sellerId);
      feedback.productIds.forEach((id) => productReviewCache.delete(id));
      // Seller Rules: a customer rating below 3.0 (from enough buyers) suspends the account
      if (!isHouse && newCount >= POLICY.MIN_RATINGS && newAvg < POLICY.MIN_RATING) {
        const avg = Math.round(newAvg * 10) / 10;
        const reason = reinstatedBefore
          ? `Suspended permanently: customer rating ${avg} from ${newCount} buyers fell below ${POLICY.MIN_RATING.toFixed(1)} again after the one-time reinstatement (Seller Rules).`
          : `Suspended automatically: customer rating ${avg} from ${newCount} buyers is below ${POLICY.MIN_RATING.toFixed(1)} (Seller Rules).`;
        const next = reinstatedBefore
          ? 'Your products are off the store and all payments are frozen. A second reinstatement is not possible.'
          : `Your products are off the store and all payments are frozen. You can restore your account once by paying a PKR ${POLICY.REINSTATEMENT_FEE.toLocaleString('en-PK')} reinstatement fee: contact the store. Your rating then starts fresh.`;
        d.suspendSeller(sellerId, reason, 'RATING')
          .then(async (done) => {
            if (done) await d.postNotice(sellerId, feedback.sellerName, reinstatedBefore ? 'Account permanently suspended' : 'Account suspended', `${reason}\n\n${next}`, 'URGENT');
          })
          .catch((err) => console.warn('[feedback] auto-suspend failed:', err?.message));
      }
      res.json({ success: true, rating });
    } catch (err) {
      console.error('[feedback] failed:', err);
      res.status(503).json({ error: 'Could not save your review. Please try again.' });
    }
  });

  app.get('/api/shops/:id/feedback', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json({ success: true, feedback: await publicFeedback(str(req.params.id, 128)) });
    } catch (err) {
      console.error('[shops feedback] failed:', err);
      res.status(503).json({ error: 'Could not load reviews.' });
    }
  });

  // Verified-buyer reviews of one product (from delivered orders), kept 5 minutes per product
  const productReviewCache = new Map<string, { at: number; list: any[] }>();
  app.get('/api/products/:id/reviews', async (req, res) => {
    const productId = str(req.params.id, 128);
    try {
      let hit = productReviewCache.get(productId);
      if (!hit || Date.now() - hit.at > 5 * 60_000) {
        const snap = await feedbackCol().where('productIds', 'array-contains', productId).limit(100).get();
        const list = snap.docs
          .map((doc) => doc.data() as any)
          .filter((f) => f.status !== 'HIDDEN')
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 50)
          .map((f) => ({
            id: f.id,
            rating: f.rating,
            comment: f.comment,
            customerName: f.customerName,
            createdAt: f.createdAt,
            sellerReply: f.sellerReply || '',
        media: reviewMedia(f.media),
          }));
        hit = { at: Date.now(), list };
        productReviewCache.set(productId, hit);
        if (productReviewCache.size > 5000) productReviewCache.clear();
      }
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json({ success: true, reviews: hit.list });
    } catch (err) {
      console.error('[product reviews] failed:', err);
      res.status(503).json({ error: 'Could not load reviews.' });
    }
  });

  // Like / dislike a product. One vote per customer (signed-in account, else this device).
  app.post('/api/products/:id/react', d.limitPerIp('react', 40), async (req, res) => {
    const productId = str(req.params.id, 128);
    const value = String(req.body?.value || '');
    if (!['LIKE', 'DISLIKE', 'NONE'].includes(value)) return res.status(400).json({ error: 'Invalid reaction.' });
    const uid = await d.callerUid(req);
    const device = str(req.body?.voterId, 64);
    if (!uid && !/^[a-f0-9]{16,64}$/.test(device)) return res.status(400).json({ error: 'Invalid voter.' });
    const voter = uid ? `u_${uid}` : `d_${device}`;
    try {
      const productRef = adminDb.collection('products').doc(productId);
      const reactionRef = adminDb.collection('product_reactions').doc(`${productId}__${voter}`.slice(0, 1400));
      const result = await adminDb.runTransaction(async (tx) => {
        const [pSnap, rSnap] = await Promise.all([tx.get(productRef), tx.get(reactionRef)]);
        if (!pSnap.exists) return null;
        const p = pSnap.data() as any;
        const before = rSnap.exists ? String((rSnap.data() as any).value) : 'NONE';
        if (before === value) return { likes: Number(p.likes) || 0, dislikes: Number(p.dislikes) || 0, mine: value };
        let likes = Number(p.likes) || 0;
        let dislikes = Number(p.dislikes) || 0;
        if (before === 'LIKE') likes--;
        if (before === 'DISLIKE') dislikes--;
        if (value === 'LIKE') likes++;
        if (value === 'DISLIKE') dislikes++;
        likes = Math.max(0, likes);
        dislikes = Math.max(0, dislikes);
        // (a transaction reads everything before it writes)
        const sellerRef = p.sellerId ? adminDb.collection('sellers').doc(String(p.sellerId)) : null;
        const sSnap = sellerRef ? await tx.get(sellerRef) : null;
        const now = new Date().toISOString();
        // updatedAt lets the catalog copy pick up the new totals
        tx.update(productRef, { likes, dislikes, updatedAt: now });
        if (value === 'NONE') tx.delete(reactionRef);
        else tx.set(reactionRef, { productId, voter, value, at: now });
        if (sellerRef && sSnap) {
          const s = (sSnap.data() as any) || {};
          const totals = {
            likes: Math.max(0, (Number(s.likes) || 0) + (value === 'LIKE' ? 1 : 0) - (before === 'LIKE' ? 1 : 0)),
            dislikes: Math.max(0, (Number(s.dislikes) || 0) + (value === 'DISLIKE' ? 1 : 0) - (before === 'DISLIKE' ? 1 : 0)),
          };
          // Taking a vote back only corrects the totals; a new like / dislike also notifies the seller
          tx.set(
            sellerRef,
            value === 'NONE'
              ? totals
              : {
                  ...totals,
                  activity: pushActivity(
                    s.activity,
                    activityEntry(value, `A customer ${value === 'LIKE' ? 'liked 👍' : 'disliked 👎'} "${String(p.name || '').slice(0, 90)}"`, { productId })
                  ),
                  activityUnread: (Number(s.activityUnread) || 0) + 1,
                },
            { merge: true }
          );
        }
        return { likes, dislikes, mine: value, sellerId: p.sellerId };
      });
      if (!result) return res.status(404).json({ error: 'Product not found.' });
      if ((result as any).sellerId) d.forgetSeller(String((result as any).sellerId));
      res.json({ success: true, likes: result.likes, dislikes: result.dislikes, mine: result.mine });
    } catch (err) {
      console.error('[products react] failed:', err);
      res.status(503).json({ error: 'Could not save your reaction. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- seller

  app.get('/api/seller/feedback', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    try {
      const snap = await feedbackCol().where('sellerId', '==', uid).limit(300).get();
      const list = snap.docs
        .map((doc) => {
          const { tokenHash, userId, ...f } = doc.data() as any;
          return f;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        summary: ratingSummary(seller),
        feedback: list,
        activity: seller.activity || [],
        activityUnread: Number(seller.activityUnread) || 0,
      });
    } catch (err) {
      console.error('[seller/feedback] failed:', err);
      res.status(503).json({ error: 'Could not load your reviews. Please try again.' });
    }
  });

  // Notifications only (cheap; the seller record is already cached for the request)
  app.get('/api/seller/activity', d.requireSeller, (req, res) => {
    const seller = (req as any).seller;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, activity: seller.activity || [], activityUnread: Number(seller.activityUnread) || 0, summary: ratingSummary(seller) });
  });

  app.post('/api/seller/activity/read', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      await adminDb.collection('sellers').doc(uid).set({ activityUnread: 0 }, { merge: true });
      d.forgetSeller(uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/activity/read] failed:', err);
      res.status(503).json({ error: 'Could not update your notifications.' });
    }
  });

  // The seller answers a review in public (shown under it in the store)
  app.post('/api/seller/feedback/:id/reply', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const reply = str(req.body?.reply, 600);
    try {
      const ref = feedbackCol().doc(str(req.params.id, 40));
      const snap = await ref.get();
      if (!snap.exists || (snap.data() as any).sellerId !== uid) return res.status(404).json({ error: 'Review not found.' });
      await ref.update({ sellerReply: reply, sellerRepliedAt: new Date().toISOString() });
      forgetFeedback(uid);
      ((snap.data() as any).productIds || []).forEach((id: string) => productReviewCache.delete(id));
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/feedback reply] failed:', err);
      res.status(503).json({ error: 'Could not save your reply.' });
    }
  });

  // ---------------------------------------------------------------- admin

  app.get('/api/admin/sellers/:id/feedback', d.requireAdmin, async (req, res) => {
    try {
      const snap = await feedbackCol().where('sellerId', '==', str(req.params.id, 128)).limit(300).get();
      const list = snap.docs
        .map((doc) => {
          const { tokenHash, ...f } = doc.data() as any;
          return f;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, feedback: list });
    } catch (err) {
      console.error('[admin feedback] failed:', err);
      res.status(503).json({ error: 'Could not load reviews.' });
    }
  });

  // Hide an abusive / fake review (or show it again); the seller's rating follows
  app.post('/api/admin/feedback/:id', d.requireAdmin, async (req, res) => {
    const hidden = req.body?.hidden === true;
    try {
      const ref = feedbackCol().doc(str(req.params.id, 40));
      const sellerId = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const f = snap.data() as any;
        const wasHidden = f.status === 'HIDDEN';
        if (wasHidden === hidden) return f.sellerId;
        const isHouse = !f.sellerId || f.sellerId === HOUSE_SELLER;
        const sellerRef = adminDb.collection('sellers').doc(isHouse ? HOUSE_SELLER : f.sellerId);
        const s = isHouse ? {} : ((await tx.get(sellerRef)).data() as any) || {};
        const sign = hidden ? -1 : 1;
        tx.update(ref, { status: hidden ? 'HIDDEN' : 'PUBLISHED', moderatedAt: new Date().toISOString() });
        // Store-sold orders have no seller rating to adjust
        if (isHouse) return HOUSE_SELLER;
        // A review from before a rating reset (reinstatement) is no longer part of the rating
        if (s.ratingResetAt && String(f.createdAt) <= String(s.ratingResetAt)) return f.sellerId;
        tx.set(
          sellerRef,
          {
            ratingSum: Math.max(0, (Number(s.ratingSum) || 0) + sign * Number(f.rating || 0)),
            ratingCount: Math.max(0, (Number(s.ratingCount) || 0) + sign),
            ratingPositive: Math.max(0, (Number(s.ratingPositive) || 0) + (Number(f.rating) >= 4 ? sign : 0)),
          },
          { merge: true }
        );
        return f.sellerId;
      });
      if (!sellerId) return res.status(404).json({ error: 'Review not found.' });
      if (sellerId !== HOUSE_SELLER) forgetFeedback(sellerId);
      productReviewCache.clear();
      res.json({ success: true });
    } catch (err) {
      console.error('[admin feedback moderate] failed:', err);
      res.status(503).json({ error: 'Could not update the review.' });
    }
  });
}
