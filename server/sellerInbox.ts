import type express from 'express';
import crypto from 'crypto';

// Seller <-> store messages and store notices.
//
//   seller_threads/{id}   one conversation (complaint / question) between a seller and the store,
//                         with its messages kept in the same document (one read per conversation)
//   seller_notices/{id}   notices / alerts the store sends to all sellers or to one seller
//   sellers/{uid}.noticesReadAt   when the seller last opened their notices
//
// Everything goes through these routes (Firestore rules give browsers no access). Seller messages
// live in their own admin tab ("Seller Messages"), separate from the customer inbox. Lists are kept
// in memory and dropped on every change made here, so Seller Center and admin polling costs almost
// no reads; the admin's unread badge uses a count query (one read).

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface SellerInboxDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireSeller: Handler;
  requireAdmin: Handler;
  forgetSeller: (uid: string) => void;
}

export const THREAD_CATEGORIES = ['ORDER', 'PAYOUT', 'PRODUCT', 'ACCOUNT', 'OTHER'] as const;
const NOTICE_LEVELS = ['INFO', 'WARNING', 'URGENT'];
const MAX_MESSAGES = 200;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const newId = (prefix: string) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

// The list view of a conversation (without the messages)
const summary = (t: any) => {
  const { messages, ...rest } = t;
  return { ...rest, messageCount: Array.isArray(messages) ? messages.length : 0 };
};

export function registerSellerInboxRoutes(app: express.Express, d: SellerInboxDeps) {
  const { adminDb } = d;
  const threads = () => adminDb.collection('seller_threads');
  const notices = () => adminDb.collection('seller_notices');

  // ---------------------------------------------------------------- short-lived caches

  const sellerThreadsCache = new Map<string, { at: number; list: any[] }>();
  let adminThreadsCache: { at: number; list: any[] } | null = null;
  let noticesCache: { at: number; list: any[] } | null = null;
  let unreadCache: { at: number; count: number } | null = null;
  let sellerListCache: { at: number; list: any[] } | null = null;
  // Another server instance may have changed something; these limits bound how stale a list can be
  const THREADS_TTL = 2 * 60_000;
  const NOTICES_TTL = 10 * 60_000;

  const threadsOfSeller = async (uid: string) => {
    const hit = sellerThreadsCache.get(uid);
    if (hit && Date.now() - hit.at < THREADS_TTL) return hit.list;
    const snap = await threads().where('sellerId', '==', uid).limit(100).get();
    const list = snap.docs.map((doc) => summary({ ...(doc.data() as any), id: doc.id }));
    list.sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
    sellerThreadsCache.set(uid, { at: Date.now(), list });
    return list;
  };

  const allThreads = async () => {
    if (adminThreadsCache && Date.now() - adminThreadsCache.at < THREADS_TTL) return adminThreadsCache.list;
    const snap = await threads().orderBy('lastMessageAt', 'desc').limit(200).get();
    const list = snap.docs.map((doc) => summary({ ...(doc.data() as any), id: doc.id }));
    adminThreadsCache = { at: Date.now(), list };
    return list;
  };

  const allNotices = async () => {
    if (noticesCache && Date.now() - noticesCache.at < NOTICES_TTL) return noticesCache.list;
    const snap = await notices().orderBy('createdAt', 'desc').limit(100).get();
    const list = snap.docs.map((doc) => ({ ...(doc.data() as any), id: doc.id }));
    noticesCache = { at: Date.now(), list };
    return list;
  };

  const forgetThreads = (sellerId?: string) => {
    if (sellerId) sellerThreadsCache.delete(sellerId);
    adminThreadsCache = null;
    unreadCache = null;
  };

  const loadThread = async (id: string) => {
    const ref = threads().doc(str(id, 128));
    const snap = await ref.get();
    return snap.exists ? { ref, thread: { ...(snap.data() as any), id: snap.id } } : null;
  };

  const message = (from: 'SELLER' | 'ADMIN', author: string, text: string) => ({
    id: crypto.randomBytes(4).toString('hex'),
    from,
    author,
    text,
    at: new Date().toISOString(),
  });

  // ---------------------------------------------------------------- seller

  app.get('/api/seller/inbox', d.requireSeller, async (req, res) => {
    try {
      const uid = (req as any).user.uid as string;
      const seller = (req as any).seller;
      const [list, all] = await Promise.all([threadsOfSeller(uid), allNotices()]);
      const mine = all.filter((n) => n.audience === 'ALL' || n.audience === uid);
      const readAt = String(seller.noticesReadAt || '');
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        threads: list,
        notices: mine,
        noticesReadAt: readAt,
        unread: {
          threads: list.filter((t) => t.unreadForSeller).length,
          notices: mine.filter((n) => String(n.createdAt) > readAt).length,
        },
      });
    } catch (err) {
      console.error('[seller/inbox] failed:', err);
      res.status(503).json({ error: 'Could not load your messages. Please try again.' });
    }
  });

  app.post('/api/seller/notices/read', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      await adminDb.collection('sellers').doc(uid).set({ noticesReadAt: new Date().toISOString() }, { merge: true });
      d.forgetSeller(uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[seller/notices/read] failed:', err);
      res.status(503).json({ error: 'Could not update your notices.' });
    }
  });

  app.get('/api/seller/threads/:id', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const found = await loadThread(String(req.params.id));
      if (!found || found.thread.sellerId !== uid) return res.status(404).json({ error: 'Conversation not found.' });
      if (found.thread.unreadForSeller) {
        await found.ref.update({ unreadForSeller: false });
        found.thread.unreadForSeller = false;
        forgetThreads(uid);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, thread: found.thread });
    } catch (err) {
      console.error('[seller/threads get] failed:', err);
      res.status(503).json({ error: 'Could not load this conversation.' });
    }
  });

  // A new complaint / question from the seller
  app.post('/api/seller/threads', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    const b = req.body || {};
    const subject = str(b.subject, 140);
    const text = str(b.text, 2000);
    const category = THREAD_CATEGORIES.includes(b.category) ? b.category : 'OTHER';
    if (subject.length < 3) return res.status(400).json({ error: 'Write a short subject (at least 3 characters).' });
    if (text.length < 5) return res.status(400).json({ error: 'Write your message (at least 5 characters).' });
    try {
      const recent = (await threadsOfSeller(uid)).filter((t) => Date.now() - Date.parse(t.createdAt) < 60 * 60 * 1000);
      if (recent.length >= 10) return res.status(429).json({ error: 'Too many new conversations. Please reply in an existing one.' });
      const id = newId('thr');
      const now = new Date().toISOString();
      const thread = {
        id,
        sellerId: uid,
        sellerName: seller.shopName,
        subject,
        category,
        orderNumber: str(b.orderNumber, 40),
        status: 'OPEN',
        startedBy: 'SELLER',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        lastFrom: 'SELLER',
        lastMessagePreview: text.slice(0, 140),
        unreadForSeller: false,
        unreadForAdmin: true,
        messages: [message('SELLER', seller.shopName, text)],
      };
      await threads().doc(id).set(thread);
      forgetThreads(uid);
      res.json({ success: true, thread });
    } catch (err) {
      console.error('[seller/threads create] failed:', err);
      res.status(503).json({ error: 'Could not send your message. Please try again.' });
    }
  });

  app.post('/api/seller/threads/:id/reply', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const seller = (req as any).seller;
    const text = str(req.body?.text, 2000);
    if (text.length < 1) return res.status(400).json({ error: 'Write your message.' });
    try {
      const ref = threads().doc(str(req.params.id, 128));
      const now = new Date().toISOString();
      const updated = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const t = snap.data() as any;
        if (!snap.exists || t.sellerId !== uid) return null;
        const messages = [...(t.messages || []), message('SELLER', seller.shopName, text)].slice(-MAX_MESSAGES);
        const next = {
          messages,
          status: 'OPEN',
          updatedAt: now,
          lastMessageAt: now,
          lastFrom: 'SELLER',
          lastMessagePreview: text.slice(0, 140),
          unreadForAdmin: true,
        };
        tx.update(ref, next);
        return { ...t, ...next, id: snap.id };
      });
      if (!updated) return res.status(404).json({ error: 'Conversation not found.' });
      forgetThreads(uid);
      res.json({ success: true, thread: updated });
    } catch (err) {
      console.error('[seller/threads reply] failed:', err);
      res.status(503).json({ error: 'Could not send your message. Please try again.' });
    }
  });

  // ---------------------------------------------------------------- admin

  // Badge on the admin's "Seller Messages" tab: a count query costs one read
  app.get('/api/admin/seller-threads/unread-count', d.requireAdmin, async (_req, res) => {
    try {
      if (!unreadCache || Date.now() - unreadCache.at > 60_000) {
        const agg = await threads().where('unreadForAdmin', '==', true).count().get();
        unreadCache = { at: Date.now(), count: agg.data().count };
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, unread: unreadCache.count });
    } catch (err) {
      console.error('[admin/seller-threads unread] failed:', err);
      res.status(503).json({ error: 'Could not count seller messages.' });
    }
  });

  // Approved sellers for the "to" pickers (name and id only)
  app.get('/api/admin/seller-list', d.requireAdmin, async (_req, res) => {
    try {
      if (!sellerListCache || Date.now() - sellerListCache.at > 5 * 60_000) {
        const snap = await adminDb.collection('sellers').where('status', '==', 'APPROVED').limit(500).get();
        const list = snap.docs.map((doc) => ({ id: doc.id, shopName: (doc.data() as any).shopName || doc.id }));
        list.sort((a, b) => a.shopName.localeCompare(b.shopName));
        sellerListCache = { at: Date.now(), list };
      }
      res.json({ success: true, sellers: sellerListCache.list });
    } catch (err) {
      console.error('[admin/seller-list] failed:', err);
      res.status(503).json({ error: 'Could not load sellers.' });
    }
  });

  app.get('/api/admin/seller-threads', d.requireAdmin, async (_req, res) => {
    try {
      const list = await allThreads();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, threads: list, unread: list.filter((t) => t.unreadForAdmin).length });
    } catch (err) {
      console.error('[admin/seller-threads] failed:', err);
      res.status(503).json({ error: 'Could not load seller messages. Please try again.' });
    }
  });

  app.get('/api/admin/seller-threads/:id', d.requireAdmin, async (req, res) => {
    try {
      const found = await loadThread(String(req.params.id));
      if (!found) return res.status(404).json({ error: 'Conversation not found.' });
      if (found.thread.unreadForAdmin) {
        await found.ref.update({ unreadForAdmin: false });
        found.thread.unreadForAdmin = false;
        forgetThreads(found.thread.sellerId);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, thread: found.thread });
    } catch (err) {
      console.error('[admin/seller-threads get] failed:', err);
      res.status(503).json({ error: 'Could not load this conversation.' });
    }
  });

  // The store starts a conversation with one seller
  app.post('/api/admin/seller-threads', d.requireAdmin, async (req, res) => {
    const b = req.body || {};
    const sellerId = str(b.sellerId, 128);
    const subject = str(b.subject, 140);
    const text = str(b.text, 2000);
    if (!sellerId) return res.status(400).json({ error: 'Choose a seller.' });
    if (subject.length < 3 || text.length < 2) return res.status(400).json({ error: 'Write a subject and a message.' });
    try {
      const sellerSnap = await adminDb.collection('sellers').doc(sellerId).get();
      if (!sellerSnap.exists) return res.status(404).json({ error: 'Seller not found.' });
      const id = newId('thr');
      const now = new Date().toISOString();
      const thread = {
        id,
        sellerId,
        sellerName: sellerSnap.data()?.shopName || '',
        subject,
        category: THREAD_CATEGORIES.includes(b.category) ? b.category : 'OTHER',
        orderNumber: str(b.orderNumber, 40),
        status: 'ANSWERED',
        startedBy: 'ADMIN',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        lastFrom: 'ADMIN',
        lastMessagePreview: text.slice(0, 140),
        unreadForSeller: true,
        unreadForAdmin: false,
        messages: [message('ADMIN', 'Store team', text)],
      };
      await threads().doc(id).set(thread);
      forgetThreads(sellerId);
      res.json({ success: true, thread });
    } catch (err) {
      console.error('[admin/seller-threads create] failed:', err);
      res.status(503).json({ error: 'Could not send the message. Please try again.' });
    }
  });

  app.post('/api/admin/seller-threads/:id/reply', d.requireAdmin, async (req, res) => {
    const text = str(req.body?.text, 2000);
    const close = req.body?.close === true;
    if (!text && !close) return res.status(400).json({ error: 'Write a reply.' });
    try {
      const ref = threads().doc(str(req.params.id, 128));
      const now = new Date().toISOString();
      const updated = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const t = snap.data() as any;
        const messages = text ? [...(t.messages || []), message('ADMIN', 'Store team', text)].slice(-MAX_MESSAGES) : t.messages || [];
        const next: Record<string, any> = {
          messages,
          status: close ? 'CLOSED' : 'ANSWERED',
          updatedAt: now,
          unreadForAdmin: false,
        };
        if (text) {
          Object.assign(next, { lastMessageAt: now, lastFrom: 'ADMIN', lastMessagePreview: text.slice(0, 140), unreadForSeller: true });
        }
        tx.update(ref, next);
        return { ...t, ...next, id: snap.id };
      });
      if (!updated) return res.status(404).json({ error: 'Conversation not found.' });
      forgetThreads(updated.sellerId);
      res.json({ success: true, thread: updated });
    } catch (err) {
      console.error('[admin/seller-threads reply] failed:', err);
      res.status(503).json({ error: 'Could not send the reply. Please try again.' });
    }
  });

  app.post('/api/admin/seller-threads/:id/status', d.requireAdmin, async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    try {
      const found = await loadThread(String(req.params.id));
      if (!found) return res.status(404).json({ error: 'Conversation not found.' });
      await found.ref.update({ status, updatedAt: new Date().toISOString() });
      forgetThreads(found.thread.sellerId);
      res.json({ success: true });
    } catch (err) {
      console.error('[admin/seller-threads status] failed:', err);
      res.status(503).json({ error: 'Could not update the conversation.' });
    }
  });

  app.get('/api/admin/seller-notices', d.requireAdmin, async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, notices: await allNotices() });
    } catch (err) {
      console.error('[admin/seller-notices] failed:', err);
      res.status(503).json({ error: 'Could not load notices.' });
    }
  });

  app.post('/api/admin/seller-notices', d.requireAdmin, async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 140);
    const body = str(b.body, 3000);
    const level = NOTICE_LEVELS.includes(b.level) ? b.level : 'INFO';
    const audience = str(b.audience, 128) || 'ALL';
    if (title.length < 3 || body.length < 5) return res.status(400).json({ error: 'Write a title and the notice text.' });
    try {
      let audienceName = 'All sellers';
      if (audience !== 'ALL') {
        const s = await adminDb.collection('sellers').doc(audience).get();
        if (!s.exists) return res.status(404).json({ error: 'Seller not found.' });
        audienceName = s.data()?.shopName || audience;
      }
      const id = newId('ntc');
      const notice = {
        id,
        title,
        body,
        level,
        audience,
        audienceName,
        createdAt: new Date().toISOString(),
        createdBy: String((req as any).user?.email || 'admin'),
      };
      await notices().doc(id).set(notice);
      noticesCache = null;
      res.json({ success: true, notice });
    } catch (err) {
      console.error('[admin/seller-notices create] failed:', err);
      res.status(503).json({ error: 'Could not send the notice. Please try again.' });
    }
  });

  /** A notice sent automatically by the store's rules (late dispatch, complaints, ...) to one seller */
  const postNotice = async (sellerId: string, sellerName: string, title: string, body: string, level: 'INFO' | 'WARNING' | 'URGENT') => {
    const id = newId('ntc');
    await notices().doc(id).set({
      id,
      title: title.slice(0, 140),
      body: body.slice(0, 3000),
      level,
      audience: sellerId,
      audienceName: sellerName || sellerId,
      createdAt: new Date().toISOString(),
      createdBy: 'Store rules (automatic)',
    });
    noticesCache = null;
  };

  app.delete('/api/admin/seller-notices/:id', d.requireAdmin, async (req, res) => {
    try {
      await notices().doc(str(req.params.id, 128)).delete();
      noticesCache = null;
      res.json({ success: true });
    } catch (err) {
      console.error('[admin/seller-notices delete] failed:', err);
      res.status(503).json({ error: 'Could not delete the notice.' });
    }
  });

  return { postNotice };
}
