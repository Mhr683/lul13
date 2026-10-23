import type express from 'express';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { sendBackInStockEmail, sendQuestionAnsweredEmail } from '../src/services/serverEmailService';

// Product page extras:
//
//   Back-in-stock alerts
//     POST /api/products/:id/stock-alert        { email }  "tell me when it is back"
//     stock_alerts/{productId}  -> { emails: [...] }       emailed once and removed when stock returns
//     (the catalog's live product listener reports the restock, so watching costs no reads)
//
//   Questions & answers
//     GET  /api/products/:id/questions          answered questions (cached 5 minutes per product)
//     POST /api/products/:id/questions          { question, name, email? }
//     GET  /api/seller/questions                questions on the seller's products
//     POST /api/seller/questions/:id/answer     { answer }
//     GET  /api/admin/questions                 waiting questions (or ?all=1), store products included
//     POST /api/admin/questions/:id             { answer } or { hidden: true|false }
//     product_questions/{id}  (server only; firestore.rules give browsers no access)
//
//   Bought together
//     GET  /api/products/:id/bought-together    products most often in the same checkout
//     copurchase/{productId} -> { counts: { otherProductId: n } }, counted when an order is placed
//
// Firestore free plan (50,000 reads a day): every list is cached in memory and dropped on change.

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
type Doc = Record<string, any>;

export interface ProductExtrasDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAdmin: Handler;
  requireSeller: Handler;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  /** uid of a signed-in caller (Authorization header), or null */
  callerUid: (req: express.Request) => Promise<string | null>;
  productById: (id: string) => Doc | null;
  getSettings: () => Doc | null;
  setRestockHook: (fn: (product: Doc) => void) => void;
  HOUSE_SELLER_ID: string;
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const MAX_ALERT_EMAILS = 500;
const QUESTION_CACHE_MS = 5 * 60_000;
const LIST_CACHE_MS = 60_000;
const PAIR_CACHE_MS = 6 * 60 * 60_000;

// "Ayesha K." from "Ayesha Khan"
const shortName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length === 1 ? parts[0].slice(0, 20) : `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

export function registerProductExtrasRoutes(app: express.Express, d: ProductExtrasDeps) {
  const { adminDb } = d;
  const storeUrl = () => String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const productUrl = (id: string) => `${storeUrl()}/#product/${encodeURIComponent(id)}`;
  const emailSettings = () => {
    const s = d.getSettings() || {};
    return { storeName: String(s.storeName || 'Store'), supportEmail: s.supportEmail || s.contactEmail || undefined };
  };
  const sellerOf = (p: Doc | null) => String(p?.sellerId || d.HOUSE_SELLER_ID);

  // ================================================================ back in stock

  app.post('/api/products/:id/stock-alert', d.limitPerIp('stock-alert', 10), async (req, res) => {
    const productId = str(req.params.id, 128);
    const email = str(req.body?.email, 254).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    const p = d.productById(productId);
    if (!p || p.status !== 'ACTIVE') return res.status(404).json({ error: 'Product not found.' });
    if (Number(p.stock) > 0) return res.status(409).json({ error: 'Good news: this product is already in stock.' });
    try {
      // arrayUnion keeps each email once; no read needed
      await adminDb
        .collection('stock_alerts')
        .doc(productId)
        .set({ productId, emails: FieldValue.arrayUnion(email), updatedAt: new Date().toISOString() }, { merge: true });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[stock-alert] save failed:', err?.message);
      res.status(503).json({ error: 'Could not save your request. Please try again.' });
    }
  });

  // One instance claims the list (read + delete in a transaction), so nobody is emailed twice
  const sendingRestock = new Set<string>();
  d.setRestockHook((product) => {
    const id = String(product.id || '');
    if (!id || sendingRestock.has(id)) return;
    sendingRestock.add(id);
    (async () => {
      const ref = adminDb.collection('stock_alerts').doc(id);
      const emails: string[] = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return [];
        tx.delete(ref);
        return (Array.isArray(snap.data()?.emails) ? snap.data()!.emails : []).slice(0, MAX_ALERT_EMAILS);
      });
      if (!emails.length) return;
      const s = emailSettings();
      let sent = 0;
      for (const to of emails) {
        const r = await sendBackInStockEmail(adminDb, {
          to,
          productName: String(product.name || 'Your product'),
          productUrl: productUrl(id),
          price: Number(product.price) || undefined,
          ...s,
        });
        if (r.success) sent++;
        // Resend's free plan allows about 2 emails a second
        await new Promise((r2) => setTimeout(r2, 600));
      }
      console.log(`[stock-alert] ${product.name}: back in stock, emailed ${sent}/${emails.length}`);
    })()
      .catch((err) => console.warn('[stock-alert] sending failed:', err?.message))
      .finally(() => sendingRestock.delete(id));
  });

  // ================================================================ questions & answers

  const questionsCol = () => adminDb.collection('product_questions');
  const publicQuestion = (q: Doc) => ({
    id: q.id,
    question: q.question,
    customerName: q.customerName,
    answer: q.answer,
    answeredBy: q.answeredBy,
    createdAt: q.createdAt,
    answeredAt: q.answeredAt,
  });

  const productQuestionsCache = new Map<string, { at: number; list: Doc[] }>();
  const sellerQuestionsCache = new Map<string, { at: number; list: Doc[] }>();
  const adminQuestionsCache = new Map<string, { at: number; list: Doc[] }>();
  const forgetQuestions = (q: { productId?: string; sellerId?: string }) => {
    if (q.productId) productQuestionsCache.delete(q.productId);
    if (q.sellerId) {
      sellerQuestionsCache.delete(q.sellerId);
      waitingCountCache.delete(q.sellerId);
    }
    adminQuestionsCache.clear();
  };

  app.get('/api/products/:id/questions', async (req, res) => {
    const productId = str(req.params.id, 128);
    try {
      let hit = productQuestionsCache.get(productId);
      if (!hit || Date.now() - hit.at > QUESTION_CACHE_MS) {
        // Only answered questions are read (waiting / hidden ones would cost reads for nothing);
        // two equality filters need no extra index
        const snap = await questionsCol().where('productId', '==', productId).where('status', '==', 'ANSWERED').limit(50).get();
        const list = snap.docs
          .map((doc) => doc.data())
          .sort((a, b) => String(b.answeredAt || b.createdAt).localeCompare(String(a.answeredAt || a.createdAt)))
          .slice(0, 50)
          .map(publicQuestion);
        hit = { at: Date.now(), list };
        productQuestionsCache.set(productId, hit);
        if (productQuestionsCache.size > 5000) productQuestionsCache.clear();
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({ success: true, questions: hit.list });
    } catch (err) {
      console.error('[questions] load failed:', err);
      res.status(503).json({ error: 'Could not load questions.' });
    }
  });

  app.post('/api/products/:id/questions', d.limitPerIp('questions', 5), async (req, res) => {
    const productId = str(req.params.id, 128);
    const question = str(req.body?.question, 600);
    const name = str(req.body?.name, 80);
    const email = str(req.body?.email, 254).toLowerCase();
    if (question.length < 5) return res.status(400).json({ error: 'Please write your question (at least 5 characters).' });
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    if (email && !isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address, or leave it empty.' });
    const p = d.productById(productId);
    if (!p || p.status !== 'ACTIVE') return res.status(404).json({ error: 'Product not found.' });
    const id = `q-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const q = {
      id,
      productId,
      productName: str(p.name, 200),
      sellerId: sellerOf(p),
      question,
      customerName: shortName(name),
      // Private: used only to email the answer, never shown on the store
      email: email || '',
      userId: (await d.callerUid(req).catch(() => null)) || '',
      status: 'PENDING',
      answer: '',
      createdAt: new Date().toISOString(),
    };
    try {
      await questionsCol().doc(id).set(q);
      forgetQuestions(q);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[questions] save failed:', err?.message);
      res.status(503).json({ error: 'Could not send your question. Please try again.' });
    }
  });

  // Seller / admin views include the asker's email only as "will be emailed" (never the address)
  const staffQuestion = (q: Doc) => ({
    id: q.id,
    productId: q.productId,
    productName: q.productName,
    question: q.question,
    customerName: q.customerName,
    willEmail: Boolean(q.email),
    answer: q.answer || '',
    answeredBy: q.answeredBy || '',
    status: q.status,
    createdAt: q.createdAt,
    answeredAt: q.answeredAt || '',
    sellerId: q.sellerId,
  });

  const saveAnswer = async (ref: FirebaseFirestore.DocumentReference, q: Doc, answer: string, by: 'SELLER' | 'STORE') => {
    const now = new Date().toISOString();
    await ref.update({ answer, answeredBy: by, answeredAt: now, status: 'ANSWERED' });
    forgetQuestions(q);
    if (q.email && !q.answer) {
      sendQuestionAnsweredEmail(adminDb, {
        to: q.email,
        customerName: q.customerName,
        productName: q.productName,
        productUrl: productUrl(q.productId),
        question: q.question,
        answer,
        ...emailSettings(),
      }).catch(() => {});
    }
  };

  // Badge count of waiting questions: a count query costs 1 read per 1,000 matches (cached 2 minutes)
  const waitingCountCache = new Map<string, { at: number; n: number }>();
  app.get('/api/seller/questions/waiting', d.requireSeller, async (req, res) => {
    const sellerId = String((req as any).user?.uid || '');
    try {
      let hit = waitingCountCache.get(sellerId);
      if (!hit || Date.now() - hit.at > 2 * 60_000) {
        const agg = await questionsCol().where('sellerId', '==', sellerId).where('status', '==', 'PENDING').count().get();
        hit = { at: Date.now(), n: agg.data().count };
        waitingCountCache.set(sellerId, hit);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, waiting: hit.n });
    } catch (err) {
      console.error('[seller questions count] failed:', err);
      res.status(503).json({ error: 'Could not count questions.' });
    }
  });

  app.get('/api/seller/questions', d.requireSeller, async (req, res) => {
    const sellerId = String((req as any).user?.uid || '');
    try {
      let hit = sellerQuestionsCache.get(sellerId);
      if (!hit || Date.now() - hit.at > LIST_CACHE_MS) {
        const snap = await questionsCol().where('sellerId', '==', sellerId).limit(300).get();
        const list = snap.docs
          .map((doc) => doc.data())
          .filter((q) => q.status !== 'HIDDEN')
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .map(staffQuestion);
        hit = { at: Date.now(), list };
        sellerQuestionsCache.set(sellerId, hit);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, questions: hit.list, waiting: hit.list.filter((q) => q.status === 'PENDING').length });
    } catch (err) {
      console.error('[seller questions] failed:', err);
      res.status(503).json({ error: 'Could not load questions.' });
    }
  });

  app.post('/api/seller/questions/:id/answer', d.requireSeller, async (req, res) => {
    const sellerId = String((req as any).user?.uid || '');
    const answer = str(req.body?.answer, 1000);
    if (answer.length < 2) return res.status(400).json({ error: 'Please write an answer.' });
    try {
      const ref = questionsCol().doc(str(req.params.id, 80));
      const snap = await ref.get();
      const q = snap.data();
      if (!snap.exists || !q || q.sellerId !== sellerId) return res.status(404).json({ error: 'Question not found.' });
      if (q.status === 'HIDDEN') return res.status(409).json({ error: 'This question was removed by the store.' });
      await saveAnswer(ref, q, answer, 'SELLER');
      res.json({ success: true });
    } catch (err) {
      console.error('[seller answer] failed:', err);
      res.status(503).json({ error: 'Could not save your answer. Please try again.' });
    }
  });

  app.get('/api/admin/questions', d.requireAdmin, async (req, res) => {
    const all = req.query.all === '1';
    const key = all ? 'all' : 'pending';
    try {
      let hit = adminQuestionsCache.get(key);
      if (!hit || Date.now() - hit.at > LIST_CACHE_MS) {
        const q = all ? questionsCol().limit(300) : questionsCol().where('status', '==', 'PENDING').limit(300);
        const snap = await q.get();
        const list = snap.docs
          .map((doc) => doc.data())
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .map(staffQuestion);
        hit = { at: Date.now(), list };
        adminQuestionsCache.set(key, hit);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, questions: hit.list });
    } catch (err) {
      console.error('[admin questions] failed:', err);
      res.status(503).json({ error: 'Could not load questions.' });
    }
  });

  app.post('/api/admin/questions/:id', d.requireAdmin, async (req, res) => {
    try {
      const ref = questionsCol().doc(str(req.params.id, 80));
      const snap = await ref.get();
      const q = snap.data();
      if (!snap.exists || !q) return res.status(404).json({ error: 'Question not found.' });
      if (typeof req.body?.hidden === 'boolean') {
        const status = req.body.hidden ? 'HIDDEN' : q.answer ? 'ANSWERED' : 'PENDING';
        await ref.update({ status, moderatedAt: new Date().toISOString() });
        forgetQuestions(q);
        return res.json({ success: true, status });
      }
      const answer = str(req.body?.answer, 1000);
      if (answer.length < 2) return res.status(400).json({ error: 'Please write an answer.' });
      await saveAnswer(ref, q, answer, 'STORE');
      res.json({ success: true });
    } catch (err) {
      console.error('[admin question] failed:', err);
      res.status(503).json({ error: 'Could not update the question. Please try again.' });
    }
  });

  // ================================================================ bought together

  // All pair counts are kept in memory: read once (one read per product that has pairs), then
  // refreshed every 6 hours; this server's own new orders are added as they come. A product page
  // therefore costs no read, and products nobody bought together cost nothing at all.
  let pairs = new Map<string, Record<string, number>>();
  let pairsLoadedAt = 0;
  let pairsLoading: Promise<void> | null = null;
  const loadPairs = () => {
    if (pairsLoading) return pairsLoading;
    pairsLoading = adminDb
      .collection('copurchase')
      .limit(20000)
      .get()
      .then((snap) => {
        const next = new Map<string, Record<string, number>>();
        for (const doc of snap.docs) next.set(doc.id, (doc.data().counts as Record<string, number>) || {});
        pairs = next;
        pairsLoadedAt = Date.now();
        console.log(`[bought-together] ${snap.size} products with pairs loaded`);
      })
      .finally(() => {
        pairsLoading = null;
      });
    return pairsLoading;
  };

  app.get('/api/products/:id/bought-together', async (req, res) => {
    const productId = str(req.params.id, 128);
    try {
      if (!pairsLoadedAt || Date.now() - pairsLoadedAt > PAIR_CACHE_MS) await loadPairs();
      const counts = pairs.get(productId) || {};
      // Only products a customer can buy right now, most often bought together first
      const ids = Object.entries(counts)
        .filter(([id, n]) => n > 0 && id !== productId)
        .filter(([id]) => {
          const p = d.productById(id);
          return p && p.status === 'ACTIVE' && Number(p.stock) > 0 && !p.adminHidden && !p.suspendedHidden && !p.delisted;
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, n]) => ({ id, count: n }));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, products: ids });
    } catch (err) {
      console.error('[bought-together] failed:', err);
      res.status(503).json({ error: 'Could not load suggestions.' });
    }
  });

  return {
    /** Counts every pair of products in one checkout (2 to 10 different products); writes only */
    recordPurchase(productIds: string[]) {
      const ids = Array.from(new Set(productIds.map((id) => String(id || '')).filter(Boolean))).slice(0, 10);
      if (ids.length < 2) return;
      const batch = adminDb.batch();
      for (const id of ids) {
        const counts: Record<string, any> = {};
        const mine = pairs.get(id) || {};
        for (const other of ids) {
          if (other === id) continue;
          counts[other] = FieldValue.increment(1);
          mine[other] = (mine[other] || 0) + 1; // the in-memory copy follows at once (no read)
        }
        pairs.set(id, mine);
        batch.set(adminDb.collection('copurchase').doc(id), { counts, updatedAt: new Date().toISOString() }, { merge: true });
      }
      batch.commit().catch((err) => console.warn('[bought-together] count failed:', err?.message));
    },
  };
}
