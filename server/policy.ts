import type express from 'express';
import crypto from 'crypto';
import { POLICY, RETURN_REASONS, RETURN_REASON_LABEL, type ReturnReason, deliveredAtOf, returnDaysLeft, dispatchClockStart } from './policyRules';

// Customer Protection Policy and Supplier Code of Conduct, enforced:
//
//   return_requests/{orderNumber}   a customer's return / replacement request (one per order, within
//                                   7 days of delivery), decided by the store (approve / reject)
//   product_strikes/{productId}     customers with an upheld complaint about a product
//   seller_charges/{id}             return shipping charged to the seller (taken off the next payout)
//   orders.returnRequestStatus      OPEN / APPROVED / REJECTED (holds the seller's payout while OPEN)
//   orders.lateNoticeAt             when the seller was warned about a late dispatch
//
// Rules applied when the store upholds a complaint that was the seller's fault:
//   - fake / replica item: the product is locked at once (the account is not suspended for it)
//   - 3 different customers complain about one product: the product is delisted for good
//   - the return shipping is charged to the seller
// And on a timer: orders not dispatched within 48 hours of confirmation warn the seller.

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface PolicyDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireSeller: Handler;
  requireAdmin: Handler;
  callerUid: (req: express.Request) => Promise<string | null>;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  storeMedia: (buffer: Buffer, ext: string, contentType: string) => Promise<string>;
  applyOrderStatusWithStock: (ref: FirebaseFirestore.DocumentReference, updates: Record<string, any> & { status: string }) => Promise<unknown>;
  appendTrackingEvent: (existing: any, event: { at: string; status?: string; location?: string; note: string }) => any[];
  postNotice: (sellerId: string, sellerName: string, title: string, body: string, level: 'INFO' | 'WARNING' | 'URGENT') => Promise<void>;
  suspendSeller: (sellerId: string, reason: string) => Promise<boolean>;
  forgetSeller: (sellerId: string) => void;
  forgetOrders: (sellerId: string) => void;
  isQuotaHit: () => boolean;
  HOUSE_SELLER_ID: string;
  /** Analytics: an approved return and its reason */
  recordReturn?: (reason: string) => void;
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
const shortName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length === 1 ? parts[0].slice(0, 20) : `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

export function registerPolicyRoutes(app: express.Express, d: PolicyDeps) {
  const { adminDb } = d;
  const requests = () => adminDb.collection('return_requests');

  const findOrder = async (orderNumber: string) => {
    const snap = await adminDb.collection('orders').where('orderNumber', '==', orderNumber).limit(1).get();
    return snap.empty ? null : { ref: snap.docs[0].ref, order: { ...(snap.docs[0].data() as any), id: snap.docs[0].id } };
  };
  const isBuyer = async (req: express.Request, order: any, token: string) => {
    if (token && order.orderAccessToken && token === order.orderAccessToken) return true;
    const uid = await d.callerUid(req);
    return Boolean(uid && order.userId && uid === order.userId);
  };

  let returnChargeCache: { at: number; amount: number } | null = null;
  const returnCharge = async () => {
    if (returnChargeCache && Date.now() - returnChargeCache.at < 10 * 60_000) return returnChargeCache.amount;
    let amount = POLICY.DEFAULT_RETURN_CHARGE;
    try {
      const v = (await adminDb.collection('settings').doc('store_config').get()).data()?.returnShippingCharge;
      if (typeof v === 'number' && v >= 0) amount = v;
    } catch {}
    returnChargeCache = { at: Date.now(), amount };
    return amount;
  };

  // ---------------------------------------------------------------- customers

  // Return status of a delivered order (for the tracking page)
  app.post('/api/returns/status', d.limitPerIp('returns-status', 60), async (req, res) => {
    const orderNumber = str(req.body?.orderNumber, 40).toUpperCase();
    const token = str(req.body?.token, 200);
    if (!orderNumber) return res.status(400).json({ error: 'Order number is required.' });
    try {
      const doc = await requests().doc(orderNumber).get();
      const r = doc.exists ? (doc.data() as any) : null;
      if (r && !(token && r.tokenHash === hash(token))) {
        const uid = await d.callerUid(req);
        if (!uid || uid !== r.userId) return res.json({ success: true, request: null, exists: true });
      }
      res.json({
        success: true,
        request: r
          ? { status: r.status, reason: r.reason, resolution: r.resolution, createdAt: r.createdAt, decisionNote: r.decisionNote || '', decidedAt: r.decidedAt || '' }
          : null,
      });
    } catch (err) {
      console.error('[returns/status] failed:', err);
      res.status(503).json({ error: 'Could not check the return status.' });
    }
  });

  // Photos for a return request (the buyer proves the order with its number and private token)
  app.post('/api/returns/upload', d.limitPerIp('returns-upload', 20), async (req, res) => {
    const orderNumber = str(req.headers['x-order-number'], 40).toUpperCase();
    const token = str(req.headers['x-order-token'], 200);
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length < 12) return res.status(400).json({ error: 'No picture received.' });
    if (body.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Pictures can be at most 8 MB.' });
    const jpg = body[0] === 0xff && body[1] === 0xd8;
    const png = body[0] === 0x89 && body.toString('ascii', 1, 4) === 'PNG';
    const webp = body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
    if (!jpg && !png && !webp) return res.status(415).json({ error: 'Use a JPG, PNG or WEBP picture.' });
    try {
      const found = await findOrder(orderNumber);
      if (!found || !(await isBuyer(req, found.order, token))) return res.status(403).json({ error: 'Only the buyer of this order can add pictures.' });
      const url = await d.storeMedia(body, jpg ? 'jpg' : png ? 'png' : 'webp', jpg ? 'image/jpeg' : png ? 'image/png' : 'image/webp');
      res.json({ success: true, url });
    } catch (err) {
      console.error('[returns/upload] failed:', err);
      res.status(503).json({ error: 'Could not save the picture. Please try again.' });
    }
  });

  // Ask for a return or replacement (once per order, within 7 days of delivery)
  app.post('/api/returns', d.limitPerIp('returns', 10), async (req, res) => {
    const b = req.body || {};
    const orderNumber = str(b.orderNumber, 40).toUpperCase();
    const token = str(b.token, 200);
    const reason = String(b.reason || '') as ReturnReason;
    const resolution = b.resolution === 'REPLACEMENT' ? 'REPLACEMENT' : 'REFUND';
    const details = str(b.details, 1500);
    const photos = (Array.isArray(b.photos) ? b.photos : [])
      .map((u: unknown) => str(u, 600))
      .filter((u: string) => /^https:\/\//.test(u) || /^\/media\/[a-zA-Z0-9_.-]+$/.test(u))
      .slice(0, 4);
    if (!RETURN_REASONS.includes(reason)) return res.status(400).json({ error: 'Choose the reason for the return.' });
    if (details.length < 10) return res.status(400).json({ error: 'Please describe the problem (at least 10 characters).' });
    try {
      const found = await findOrder(orderNumber);
      if (!found) return res.status(404).json({ error: 'Order not found.' });
      const { ref, order } = found;
      if (!(await isBuyer(req, order, token))) return res.status(403).json({ error: 'Only the buyer of this order can ask for a return.' });
      if (order.status !== 'DELIVERED') return res.status(409).json({ error: 'A return can be requested after the order is delivered.' });
      if (returnDaysLeft(order) <= 0) {
        return res.status(409).json({ error: `The ${POLICY.RETURN_WINDOW_DAYS}-day return window for this order is over. Please contact support.` });
      }
      const now = new Date().toISOString();
      const request = {
        id: orderNumber,
        orderId: order.id,
        orderNumber,
        sellerId: String(order.sellerId || d.HOUSE_SELLER_ID),
        sellerName: order.sellerName || '',
        customerName: shortName(order.customerName),
        customerKey: order.userId ? `u_${order.userId}` : `p_${hash(String(order.customerPhone || order.customerEmail || orderNumber))}`,
        userId: order.userId || '',
        tokenHash: token ? hash(token) : '',
        reason,
        resolution,
        details,
        photos,
        items: (order.items || []).slice(0, 10).map((it: any) => ({
          productId: String(it.productId || ''),
          name: String(it.name || '').slice(0, 120),
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
        })),
        total: Number(order.total) || 0,
        deliveredAt: new Date(deliveredAtOf(order) || Date.now()).toISOString(),
        status: 'OPEN',
        createdAt: now,
      };
      const created = await adminDb.runTransaction(async (tx) => {
        const existing = await tx.get(requests().doc(orderNumber));
        if (existing.exists) return false;
        tx.set(requests().doc(orderNumber), request);
        tx.update(ref, {
          returnRequestStatus: 'OPEN',
          updatedAt: now,
          trackingEvents: d.appendTrackingEvent(order.trackingEvents, {
            at: now,
            note: `${resolution === 'REPLACEMENT' ? 'Replacement' : 'Return'} requested: ${RETURN_REASON_LABEL[reason]}. We will review it within 24-48 hours.`,
          }),
        });
        return true;
      });
      if (!created) return res.status(409).json({ error: 'A return request for this order already exists.' });
      adminReturnsCache = null;
      d.forgetOrders(request.sellerId);
      if (request.sellerId !== d.HOUSE_SELLER_ID) {
        d.postNotice(
          request.sellerId,
          request.sellerName,
          `Return request on order ${orderNumber}`,
          `The customer asked for a ${resolution === 'REPLACEMENT' ? 'replacement' : 'refund'}: ${RETURN_REASON_LABEL[reason]}.\n\n"${details}"\n\nThe store will review it. Your payout for this order is on hold until it is decided. You can add your side in Seller Center → Orders → Returns.`,
          reason === 'FAKE' ? 'URGENT' : 'WARNING'
        ).catch(() => {});
      }
      res.json({ success: true, status: 'OPEN' });
    } catch (err) {
      console.error('[returns] failed:', err);
      res.status(503).json({ error: 'Could not send your request. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- sellers

  app.get('/api/seller/returns', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const snap = await requests().where('sellerId', '==', uid).limit(200).get();
      const list = snap.docs
        .map((doc) => {
          const { tokenHash, customerKey, userId, ...r } = doc.data() as any;
          return r;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, returns: list });
    } catch (err) {
      console.error('[seller/returns] failed:', err);
      res.status(503).json({ error: 'Could not load return requests.' });
    }
  });

  // The seller's side of the story (the store sees it before deciding)
  app.post('/api/seller/returns/:id/respond', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const note = str(req.body?.note, 1500);
    if (note.length < 5) return res.status(400).json({ error: 'Write your reply.' });
    try {
      const ref = requests().doc(str(req.params.id, 40));
      const snap = await ref.get();
      const r = snap.data() as any;
      if (!snap.exists || r.sellerId !== uid) return res.status(404).json({ error: 'Return request not found.' });
      if (r.status !== 'OPEN') return res.status(409).json({ error: 'This request has already been decided.' });
      await ref.update({ sellerResponse: note, sellerRespondedAt: new Date().toISOString() });
      adminReturnsCache = null;
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/returns respond] failed:', err);
      res.status(503).json({ error: 'Could not save your reply.' });
    }
  });

  // ---------------------------------------------------------------- admin

  let adminReturnsCache: { at: number; list: any[] } | null = null;
  app.get('/api/admin/returns', d.requireAdmin, async (_req, res) => {
    try {
      if (!adminReturnsCache || Date.now() - adminReturnsCache.at > 60_000) {
        const snap = await requests().orderBy('createdAt', 'desc').limit(300).get();
        adminReturnsCache = {
          at: Date.now(),
          list: snap.docs.map((doc) => {
            const { tokenHash, ...r } = doc.data() as any;
            return r;
          }),
        };
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, returns: adminReturnsCache.list, returnCharge: await returnCharge() });
    } catch (err) {
      console.error('[admin/returns] failed:', err);
      res.status(503).json({ error: 'Could not load return requests.' });
    }
  });

  // Uphold a complaint against a product: lock (fake) or delist (3 customers)
  const strikeProduct = async (productId: string, r: any, sellerName: string) => {
    const strikeRef = adminDb.collection('product_strikes').doc(productId);
    const productRef = adminDb.collection('products').doc(productId);
    const outcome = await adminDb.runTransaction(async (tx) => {
      const [strikeSnap, productSnap] = await Promise.all([tx.get(strikeRef), tx.get(productRef)]);
      if (!productSnap.exists) return null;
      const s = (strikeSnap.data() as any) || { customers: [], complaints: [] };
      const customers: string[] = Array.isArray(s.customers) ? s.customers : [];
      if (!customers.includes(r.customerKey)) customers.push(r.customerKey);
      const complaints = [...(Array.isArray(s.complaints) ? s.complaints : []), { orderNumber: r.orderNumber, reason: r.reason, at: new Date().toISOString() }].slice(-50);
      tx.set(strikeRef, { productId, sellerId: r.sellerId, customers, complaints, updatedAt: new Date().toISOString() }, { merge: true });
      const p = productSnap.data() as any;
      const now = new Date().toISOString();
      if (customers.length >= POLICY.COMPLAINTS_TO_DELIST && !p.delisted) {
        tx.update(productRef, {
          status: 'DRAFT',
          adminHidden: true,
          delisted: true,
          adminHiddenReason: `Delisted: ${customers.length} customers reported problems with this product`,
          updatedAt: now,
        });
        return { action: 'DELISTED', name: p.name, customers: customers.length };
      }
      if (r.reason === 'FAKE' && !p.adminHidden) {
        tx.update(productRef, {
          status: 'DRAFT',
          adminHidden: true,
          policyLock: 'FAKE',
          adminHiddenReason: 'Locked: a customer complaint about a fake / replica item was upheld',
          updatedAt: now,
        });
        return { action: 'LOCKED', name: p.name, customers: customers.length };
      }
      return { action: 'STRIKE', name: p.name, customers: customers.length };
    });
    if (outcome && r.sellerId !== d.HOUSE_SELLER_ID) {
      if (outcome.action === 'DELISTED') {
        await d.postNotice(r.sellerId, sellerName, 'Product delisted', `"${outcome.name}" has been permanently removed from the store: ${outcome.customers} different customers reported quality / wrong-item problems (Seller Rules: 3 complaints).`, 'URGENT');
      } else if (outcome.action === 'LOCKED') {
        await d.postNotice(r.sellerId, sellerName, 'Product locked: fake / replica complaint', `"${outcome.name}" has been locked after a customer complaint about a fake or replica item was upheld (order ${r.orderNumber}). It stays off the store; contact the store if you believe this is a mistake.`, 'URGENT');
      } else {
        await d.postNotice(r.sellerId, sellerName, 'Customer complaint upheld', `A complaint about "${outcome.name}" (order ${r.orderNumber}: ${RETURN_REASON_LABEL[r.reason as ReturnReason]}) was upheld. ${outcome.customers} of ${POLICY.COMPLAINTS_TO_DELIST} complaints: at ${POLICY.COMPLAINTS_TO_DELIST} the product is delisted.`, 'WARNING');
      }
    }
    return outcome;
  };

  app.post('/api/admin/returns/:id/decide', d.requireAdmin, async (req, res) => {
    const id = str(req.params.id, 40);
    const decision = req.body?.decision === 'APPROVE' ? 'APPROVE' : req.body?.decision === 'REJECT' ? 'REJECT' : '';
    const sellerFault = req.body?.fault === 'SELLER';
    const note = str(req.body?.note, 1000);
    if (!decision) return res.status(400).json({ error: 'Choose approve or reject.' });
    if (decision === 'REJECT' && note.length < 5) return res.status(400).json({ error: 'Tell the customer why the request is rejected.' });
    try {
      const reqRef = requests().doc(id);
      const snap = await reqRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Return request not found.' });
      const r = snap.data() as any;
      if (r.status !== 'OPEN') return res.status(409).json({ error: 'This request has already been decided.' });
      const orderRef = adminDb.collection('orders').doc(r.orderId);
      const orderSnap = await orderRef.get();
      const order = (orderSnap.data() as any) || {};
      const now = new Date().toISOString();
      const by = String((req as any).user?.email || 'admin');
      const isSeller = r.sellerId && r.sellerId !== d.HOUSE_SELLER_ID;

      if (decision === 'REJECT') {
        await reqRef.update({ status: 'REJECTED', decisionNote: note, decidedAt: now, decidedBy: by });
        await orderRef.update({
          returnRequestStatus: 'REJECTED',
          updatedAt: now,
          trackingEvents: d.appendTrackingEvent(order.trackingEvents, { at: now, note: `Return request declined: ${note}` }),
        });
      } else {
        // The parcel comes back: stock returns to the shop and the order is no longer paid to the seller
        if (orderSnap.exists && order.status === 'DELIVERED') {
          await d.applyOrderStatusWithStock(orderRef, { status: 'RETURNED', updatedAt: now });
        }
        const fresh = ((await orderRef.get()).data() as any) || order;
        await orderRef.update({
          returnRequestStatus: 'APPROVED',
          trackingEvents: d.appendTrackingEvent(fresh.trackingEvents, {
            at: now,
            note:
              r.resolution === 'REPLACEMENT'
                ? `Replacement approved. ${note || 'We will arrange the pickup and send you a new item.'}`
                : `Return approved. ${note || 'We will arrange the pickup; your refund follows within 2 working days after the item is checked.'}`,
          }),
        });
        let charge = 0;
        if (sellerFault && isSeller) {
          charge = await returnCharge();
          if (charge > 0) {
            const chargeId = `chg-${id}`;
            await adminDb.collection('seller_charges').doc(chargeId).set({
              id: chargeId,
              sellerId: r.sellerId,
              orderNumber: r.orderNumber,
              amount: charge,
              reason: `Return shipping: ${RETURN_REASON_LABEL[r.reason as ReturnReason]}`,
              createdAt: now,
              payoutId: null,
            });
          }
        }
        await reqRef.update({ status: 'APPROVED', fault: sellerFault ? 'SELLER' : 'OTHER', decisionNote: note, decidedAt: now, decidedBy: by, returnCharge: charge });
        d.recordReturn?.(RETURN_REASON_LABEL[r.reason as ReturnReason] || 'Other');

        if (sellerFault && isSeller) {
          // Product strikes (lock / delist) and the seller's record
          for (const productId of Array.from(new Set((r.items || []).map((it: any) => it.productId).filter(Boolean))) as string[]) {
            try {
              await strikeProduct(productId, r, r.sellerName);
            } catch (err) {
              console.warn('[returns] product strike failed:', productId, (err as any)?.message);
            }
          }
          // The seller's record (shown in account health); fake items lock the product, not the account
          const sellerRef = adminDb.collection('sellers').doc(r.sellerId);
          await adminDb.runTransaction(async (tx) => {
            const s = ((await tx.get(sellerRef)).data() as any) || {};
            tx.set(
              sellerRef,
              {
                complaintStrikes: (Number(s.complaintStrikes) || 0) + 1,
                fakeStrikes: (Number(s.fakeStrikes) || 0) + (r.reason === 'FAKE' ? 1 : 0),
              },
              { merge: true }
            );
          });
          d.forgetSeller(r.sellerId);
          if (charge > 0) {
            await d.postNotice(r.sellerId, r.sellerName, `Return charge: order ${r.orderNumber}`, `The return on order ${r.orderNumber} was your responsibility (${RETURN_REASON_LABEL[r.reason as ReturnReason]}). PKR ${charge} return shipping will be taken off your next payout.`, 'WARNING');
          }
        }
      }
      adminReturnsCache = null;
      if (r.sellerId) d.forgetOrders(r.sellerId);
      res.json({ success: true });
    } catch (err) {
      console.error('[admin/returns decide] failed:', err);
      res.status(503).json({ error: 'Could not save the decision. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- 48-hour dispatch watch

  const checkLateDispatch = async () => {
    if (d.isQuotaHit()) return;
    try {
      const snap = await adminDb.collection('orders').where('status', 'in', ['CONFIRMED', 'PROCESSING', 'PACKED']).limit(500).get();
      const now = Date.now();
      const late = snap.docs
        .map((doc) => ({ ref: doc.ref, o: doc.data() as any }))
        .filter(({ o }) => o.sellerId && o.sellerId !== d.HOUSE_SELLER_ID && !o.lateNoticeAt)
        .filter(({ o }) => now - dispatchClockStart(o) > POLICY.DISPATCH_HOURS * 3600_000);
      const bySeller = new Map<string, { name: string; orders: typeof late }>();
      for (const item of late) {
        const g = bySeller.get(item.o.sellerId) || { name: item.o.sellerName || '', orders: [] as typeof late };
        g.orders.push(item);
        bySeller.set(item.o.sellerId, g);
      }
      for (const [sellerId, g] of bySeller) {
        const numbers = g.orders.map(({ o }) => o.orderNumber).join(', ');
        await d.postNotice(
          sellerId,
          g.name,
          `Late dispatch: ${g.orders.length} order${g.orders.length > 1 ? 's' : ''}`,
          `These orders were not handed to the courier within ${POLICY.DISPATCH_HOURS} hours of confirmation: ${numbers}.\n\nPlease ship them today and add the tracking number. Late dispatches lower your On-time Delivery score and account health.`,
          'WARNING'
        );
        const stamp = new Date().toISOString();
        const batch = adminDb.batch();
        for (const { ref } of g.orders) batch.update(ref, { lateNoticeAt: stamp });
        await batch.commit();
        d.forgetOrders(sellerId);
      }
      if (late.length) console.log(`[policy] late dispatch warnings: ${late.length} orders, ${bySeller.size} sellers`);
    } catch (err) {
      console.warn('[policy] late dispatch check failed:', (err as any)?.message);
    }
  };
  setTimeout(checkLateDispatch, 3 * 60_000).unref?.();
  setInterval(checkLateDispatch, 3 * 60 * 60_000).unref?.();
}
