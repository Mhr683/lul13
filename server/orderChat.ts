import type express from 'express';
import crypto from 'crypto';

// Chat between a customer and the seller of one order.
//
//   order_chats/{orderId}   the conversation, with its messages in the same document (one read)
//
// It opens when the order is placed and closes (read-only) when the order is finished: delivered,
// cancelled, returned or refunded. Phone numbers, e-mails, links and "WhatsApp me" style messages are
// refused, so buyer and seller cannot take the deal off the store. Blocked tries are counted on the
// chat so the store can see who keeps trying.
//
// While the seller is away, an AI assistant answers the customer on the seller's behalf
// (server/orderChatAi.ts): order status, delays, tracking, how cancelling works, never bank details
// and never a cancellation. It stays quiet for 30 minutes after the seller writes, and the seller can
// switch it off (sellers/{uid}.orderChatAiOff).

import { orderChatReply, type GenerateReply } from './orderChatAi';

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;

export interface OrderChatDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireSeller: Handler;
  requireAdmin: Handler;
  callerUid: (req: express.Request) => Promise<string | null>;
  limitPerIp: (name: string, max: number, windowMs?: number) => Handler;
  HOUSE_SELLER_ID: string;
  /** The AI used for replies on the seller's behalf (their own key first); absent = fixed replies only */
  generateReply?: GenerateReply;
  hasOwnAiKey?: (sellerId: string) => boolean;
}

const HUMAN_QUIET_MS = 30 * 60_000;

const CLOSED = ['DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED', 'QUOTE_REJECTED', 'QUOTE_EXPIRED'];
const MAX_MESSAGES = 300;
const MAX_TEXT = 500;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// ------------------------------------------------------------------ contact-detail filter

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', sifar: '0', sifr: '0', one: '1', aik: '1', ek: '1', two: '2', do: '2', three: '3', teen: '3', tin: '3',
  four: '4', char: '4', chaar: '4', five: '5', panch: '5', paanch: '5', six: '6', chay: '6', chhe: '6', che: '6',
  seven: '7', saat: '7', sat: '7', eight: '8', aath: '8', ath: '8', nine: '9', nau: '9', no: '9',
};
const CONTACT_WORDS =
  /(whats\s*app|watts?\s*app|whatsap|wtsap|wa\.me|telegram|signal\s*app|\bimo\b|gmail|yahoo|hotmail|outlook|e-?mail|insta(gram)?\s*(id|pe|par|account)|facebook|\bfb\s*(id|pe|par)|snap\s*chat|tik\s*tok\s*(id|pe|par)|mera\s*(number|no\.?|nmbr|nambar)|apna\s*(number|no\.?|nmbr|nambar)|(number|nmbr|nambar)\s*(do|dein|de|bhejo|bhejein|send)|call\s*(me|karo|karein|kr)|contact\s*(number|me|karo|kr))/i;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|pk|net|org|me|io|co|shop|store|link)\b)/i;
const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|dot)\s*[a-z]{2,}/i;

/** Why a message cannot be sent (contact details), or null when it is fine */
export function contactReason(raw: string): string | null {
  // Urdu / Arabic digits count as digits
  const text = raw
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (EMAIL.test(text)) return 'email';
  if (LINK.test(text)) return 'link';
  if (CONTACT_WORDS.test(text)) return 'contact';
  // Numbers written with spaces, dashes or dots between the digits ("0300 123-45 67")
  const joined = text.replace(/(\d)[\s\-.()/_*+]+(?=\d)/g, '$1');
  if (/\d{7,}/.test(text) || /\d{10,}/.test(joined) || /(?:92|0)?3\d{9}/.test(joined)) return 'phone';
  return numberWordsPhone(text) ? 'phone' : null;
}

/** A phone number written as words ("zero three zero zero ...", "sifar teen ...") */
function numberWordsPhone(text: string): boolean {
  let run = '';
  let words = 0;
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue;
    const digit = NUMBER_WORDS[w];
    const d = digit ?? (/^\d+$/.test(w) ? w : null);
    if (d === null) {
      run = '';
      words = 0;
      continue;
    }
    run += d;
    if (digit) words++;
    // at least 3 written as words (plain digits are checked separately), 7+ digits in a row
    if (run.length >= 7 && words >= 3) return true;
  }
  return false;
}

// Listings (name, descriptions, variants, how to use, care...) may mention Facebook, Instagram or a
// website by name, so only real contact details count there: phone numbers, e-mails, WhatsApp /
// Telegram / IMO, and "call me / my number" style phrases. Codes such as a barcode or model number
// are not passed to this check.
const LISTING_CONTACT_WORDS =
  /(whats\s*app|watts?\s*app|whatsap|wtsap|wa\.me|t\.me\/|telegram|\bimo\b|mera\s*(number|no\.?|nmbr|nambar)|hamara\s*(number|no\.?|nmbr|nambar)|(number|nmbr|nambar)\s*(do|dein|de|bhejo|bhejein|send|par|pe)|call\s*(me|karo|karein|kr|kare)|contact\s*(number|me|us|karo|kr|karein)|inbox\s*(me|karo|kr)|dm\s*(me|karo|kr))/i;

/** Contact details in a product listing, or null when it is fine */
export function listingContactReason(raw: string): string | null {
  const text = raw
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (EMAIL.test(text)) return 'email';
  if (LISTING_CONTACT_WORDS.test(text)) return 'contact';
  // Only shapes of real phone numbers, so sizes ("38 39 40 41") and prices are not caught:
  // mobile 03xx xxxxxxx / +92 3xx..., with spaces or dashes anywhere; landline 0xx(x)-xxxxxxx(x);
  // or 10-13 digits written together
  const mobile = /(?:\+\s*9\s*2|(?<![\d])9\s*2|(?<![\d])0)[\s\-.()]*3(?:[\s\-.()]*\d){9}(?![\d])/;
  const landline = /(?<![\d])0\d{2,3}[\s\-.)]+\d{6,8}(?![\d])/;
  if (mobile.test(text) || landline.test(text) || /(?<![\d])\d{10,13}(?![\d])/.test(text)) return 'phone';
  return numberWordsPhone(text) ? 'phone' : null;
}

export const LISTING_CONTACT_TEXT =
  'Phone numbers, e-mails, WhatsApp / Telegram and "call me" are not allowed in a product listing (name, description, variants...). Customers order and ask questions through the store. (Listing mein number / WhatsApp likhna mana hai.)';

export const CONTACT_BLOCKED_TEXT =
  'Phone numbers, e-mails, links and "WhatsApp / call me" are not allowed in the order chat. Keep the deal on Anokha: your order and payment stay protected. (Number / WhatsApp dena mana hai.)';

// ------------------------------------------------------------------ routes

export function registerOrderChatRoutes(app: express.Express, d: OrderChatDeps) {
  const { adminDb } = d;
  const chats = () => adminDb.collection('order_chats');

  // Orders looked up by number for customers (short cache keeps polling cheap)
  const orderCache = new Map<string, { at: number; id: string; order: any }>();
  const findOrder = async (orderNumber: string) => {
    const key = orderNumber.toUpperCase();
    const hit = orderCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit;
    const snap = await adminDb.collection('orders').where('orderNumber', '==', key).limit(1).get();
    if (snap.empty) return null;
    const v = { at: Date.now(), id: snap.docs[0].id, order: snap.docs[0].data() as any };
    orderCache.set(key, v);
    if (orderCache.size > 2000) orderCache.delete(orderCache.keys().next().value as string);
    return v;
  };
  const isBuyer = async (req: express.Request, order: any, token: string) => {
    if (token && order.orderAccessToken && token === order.orderAccessToken) return true;
    const uid = await d.callerUid(req);
    return Boolean(uid && order.userId && uid === order.userId);
  };
  const hasSeller = (order: any) => Boolean(order?.sellerId) && order.sellerId !== d.HOUSE_SELLER_ID;
  const isOpen = (order: any) => hasSeller(order) && !CLOSED.includes(order.status);

  // The seller's chats with unread customer messages (for the badges on their orders)
  const unreadCache = new Map<string, { at: number; ids: Record<string, number> }>();
  const unreadOf = async (sellerId: string) => {
    const hit = unreadCache.get(sellerId);
    if (hit && Date.now() - hit.at < 60_000) return hit.ids;
    // two equality filters: Firestore merges the single-field indexes, no composite index needed
    const snap = await chats().where('sellerId', '==', sellerId).where('sellerHasUnread', '==', true).limit(100).get();
    const ids: Record<string, number> = {};
    for (const doc of snap.docs) ids[doc.id] = Number(doc.data().unreadForSeller) || 0;
    unreadCache.set(sellerId, { at: Date.now(), ids });
    return ids;
  };

  const view = (chat: any, order: any, me: 'CUSTOMER' | 'SELLER') => ({
    open: isOpen(order),
    status: order.status,
    sellerName: order.sellerName || 'Seller',
    customerName: String(order.customerName || 'Customer').split(/\s+/)[0],
    messages: (chat?.messages || []).map((m: any) => ({ id: m.id, from: m.from, text: m.text, at: m.at, mine: m.from === me, ...(m.ai ? { ai: true } : {}) })),
  });

  // The seller's "AI replies for me" switch (on unless switched off), kept in memory for 10 minutes
  const aiSwitch = new Map<string, { at: number; on: boolean }>();
  const aiOn = async (sellerId: string) => {
    const hit = aiSwitch.get(sellerId);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.on;
    let on = true;
    try {
      on = !(await adminDb.collection('sellers').doc(sellerId).get()).data()?.orderChatAiOff;
    } catch {
      /* keep it on */
    }
    aiSwitch.set(sellerId, { at: Date.now(), on });
    if (aiSwitch.size > 5000) aiSwitch.clear();
    return on;
  };

  /** Answers the customer's last message on the seller's behalf when the seller is away */
  const autoReply = async (orderId: string, order: any, chat: any, text: string) => {
    if (!isOpen(order) || !(await aiOn(order.sellerId))) return chat;
    const lastHuman = Date.parse(chat.lastSellerHumanAt || '');
    if (!isNaN(lastHuman) && Date.now() - lastHuman < HUMAN_QUIET_MS) return chat;
    const lastAi = [...(chat.messages || [])].reverse().find((m: any) => m.ai);
    if (lastAi && Date.now() - Date.parse(lastAi.at) < 15_000) return chat; // a burst of messages gets one answer
    const reply = await orderChatReply({
      text,
      order,
      shop: order.sellerName || 'The seller',
      history: (chat.messages || []).slice(0, -1),
      generate: d.generateReply,
      ownKey: Boolean(d.hasOwnAiKey?.(order.sellerId)),
    });
    if (!reply) return chat;
    const ref = chats().doc(orderId);
    return adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur: any = snap.data() || chat;
      if ((cur.messages || []).length >= MAX_MESSAGES) return cur;
      const next = {
        ...cur,
        messages: [...(cur.messages || []), { id: crypto.randomBytes(4).toString('hex'), from: 'SELLER', text: reply, at: new Date().toISOString(), ai: true }],
        lastAt: new Date().toISOString(),
      };
      tx.set(ref, next);
      return next;
    });
  };

  /** Adds a message (or refuses it) inside a transaction; returns the updated chat */
  const send = async (orderId: string, order: any, from: 'CUSTOMER' | 'SELLER', text: string) => {
    const ref = chats().doc(orderId);
    const blocked = contactReason(text);
    const now = new Date().toISOString();
    return adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const chat: any = snap.exists
        ? snap.data()
        : {
            orderId,
            orderNumber: order.orderNumber,
            sellerId: order.sellerId,
            sellerName: order.sellerName || '',
            customerName: order.customerName || '',
            createdAt: now,
            messages: [],
            unreadForSeller: 0,
            unreadForCustomer: 0,
            blocked: { CUSTOMER: 0, SELLER: 0 },
          };
      if (blocked) {
        const b = { CUSTOMER: 0, SELLER: 0, ...(chat.blocked || {}) };
        b[from] = (Number(b[from]) || 0) + 1;
        tx.set(ref, { ...chat, blocked: b, lastBlockedAt: now, lastBlocked: { from, text: text.slice(0, 200), reason: blocked } }, { merge: true });
        return { chat, blocked };
      }
      if ((chat.messages || []).length >= MAX_MESSAGES) throw new Error('FULL');
      const message = { id: crypto.randomBytes(4).toString('hex'), from, text, at: now };
      const next = {
        ...chat,
        messages: [...(chat.messages || []), message],
        lastAt: now,
        lastFrom: from,
        unreadForSeller: from === 'CUSTOMER' ? (Number(chat.unreadForSeller) || 0) + 1 : 0,
        sellerHasUnread: from === 'CUSTOMER',
        unreadForCustomer: from === 'SELLER' ? (Number(chat.unreadForCustomer) || 0) + 1 : 0,
        // The AI stays quiet for a while after the seller writes
        ...(from === 'SELLER' ? { lastSellerHumanAt: now } : {}),
      };
      tx.set(ref, next);
      return { chat: next, blocked: null };
    });
  };

  const sendError = (res: express.Response, err: any, where: string) => {
    if (err?.message === 'FULL') return res.status(409).json({ error: 'This chat is full. Please contact the store from the help button.' });
    console.error(`[order-chat ${where}] failed:`, err);
    res.status(503).json({ error: 'Could not send the message. Please try again.' });
  };

  // ---------------------------------------------------------------- customer

  app.post('/api/order-chat', d.limitPerIp('order-chat-read', 120, 60_000), async (req, res) => {
    const orderNumber = str(req.body?.orderNumber, 40);
    const token = str(req.body?.token, 200);
    if (!orderNumber) return res.status(400).json({ error: 'Missing order number.' });
    try {
      const found = await findOrder(orderNumber);
      if (!found || !(await isBuyer(req, found.order, token))) return res.status(404).json({ error: 'Order not found.' });
      if (!hasSeller(found.order)) return res.json({ success: true, available: false });
      const snap = await chats().doc(found.id).get();
      const chat = snap.exists ? (snap.data() as any) : null;
      if (chat && Number(chat.unreadForCustomer) > 0 && req.body?.markRead) {
        chats().doc(found.id).update({ unreadForCustomer: 0 }).catch(() => {});
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, available: true, unread: Number(chat?.unreadForCustomer) || 0, ...view(chat, found.order, 'CUSTOMER') });
    } catch (err) {
      console.error('[order-chat read] failed:', err);
      res.status(503).json({ error: 'Could not load the chat.' });
    }
  });

  app.post('/api/order-chat/send', d.limitPerIp('order-chat-send', 20, 60_000), async (req, res) => {
    const orderNumber = str(req.body?.orderNumber, 40);
    const token = str(req.body?.token, 200);
    const text = str(req.body?.text, MAX_TEXT);
    if (!orderNumber || !text) return res.status(400).json({ error: 'Write a message.' });
    try {
      const found = await findOrder(orderNumber);
      if (!found || !(await isBuyer(req, found.order, token))) return res.status(404).json({ error: 'Order not found.' });
      // the status may have just changed: read it fresh before writing
      const fresh = (await adminDb.collection('orders').doc(found.id).get()).data() as any;
      orderCache.set(orderNumber.toUpperCase(), { at: Date.now(), id: found.id, order: fresh });
      if (!isOpen(fresh)) return res.status(409).json({ error: 'This order is finished, so its chat is closed.' });
      const out = await send(found.id, fresh, 'CUSTOMER', text);
      if (out.blocked) return res.status(400).json({ error: CONTACT_BLOCKED_TEXT, code: 'CONTACT_BLOCKED' });
      unreadCache.delete(fresh.sellerId);
      alertsCache.delete(fresh.sellerId);
      let chat = out.chat;
      try {
        chat = await autoReply(found.id, fresh, out.chat, text);
      } catch (err: any) {
        console.warn('[order-chat] auto-reply failed:', err?.message);
      }
      res.json({ success: true, ...view(chat, fresh, 'CUSTOMER') });
    } catch (err) {
      sendError(res, err, 'customer send');
    }
  });

  // ---------------------------------------------------------------- seller

  const sellerOrder = async (uid: string, orderId: string) => {
    const snap = await adminDb.collection('orders').doc(orderId).get();
    const order = snap.exists ? (snap.data() as any) : null;
    return order && order.sellerId === uid ? order : null;
  };

  app.get('/api/seller/order-chats/unread', d.requireSeller, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, unread: await unreadOf((req as any).user.uid) });
    } catch (err) {
      console.error('[seller/order-chats unread] failed:', err);
      res.json({ success: true, unread: {} });
    }
  });

  // What makes Seller Center ring: new customer chat messages and new orders waiting for the seller.
  // Polled about once a minute; two count queries (1 read each) + the unread-chat list, cached 30 s.
  const alertsCache = new Map<string, { at: number; data: { chats: number; chatOrders: number; newOrders: number } }>();
  app.get('/api/seller/alerts', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    try {
      const hit = alertsCache.get(uid);
      let data = hit && Date.now() - hit.at < 30_000 ? hit.data : null;
      if (!data) {
        const orders = adminDb.collection('orders').where('sellerId', '==', uid);
        const [unread, a, b] = await Promise.all([
          unreadOf(uid),
          orders.where('status', '==', 'PENDING_CONFIRMATION').count().get(),
          orders.where('status', '==', 'PENDING').count().get(),
        ]);
        const counts = Object.values(unread);
        data = {
          chats: counts.reduce((s, n) => s + n, 0),
          chatOrders: counts.length,
          newOrders: a.data().count + b.data().count,
        };
        alertsCache.set(uid, { at: Date.now(), data });
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, ...data });
    } catch (err) {
      console.error('[seller/alerts] failed:', err);
      res.status(503).json({ error: 'Could not check for new messages.' });
    }
  });

  app.get('/api/seller/order-chat/:orderId', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const orderId = str(req.params.orderId, 128);
    try {
      const order = await sellerOrder(uid, orderId);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      const snap = await chats().doc(orderId).get();
      const chat = snap.exists ? (snap.data() as any) : null;
      if (chat && Number(chat.unreadForSeller) > 0) {
        await chats().doc(orderId).update({ unreadForSeller: 0, sellerHasUnread: false }).catch(() => {});
        unreadCache.delete(uid);
        alertsCache.delete(uid);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, aiOn: await aiOn(uid), ...view(chat, order, 'SELLER') });
    } catch (err) {
      console.error('[seller/order-chat] failed:', err);
      res.status(503).json({ error: 'Could not load the chat.' });
    }
  });

  // The seller's switch: "AI replies to customers when I am away"
  app.get('/api/seller/order-chat-ai', d.requireSeller, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, aiOn: await aiOn((req as any).user.uid) });
  });
  app.post('/api/seller/order-chat-ai', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const on = req.body?.on !== false;
    try {
      await adminDb.collection('sellers').doc(uid).set({ orderChatAiOff: !on }, { merge: true });
      aiSwitch.set(uid, { at: Date.now(), on });
      res.json({ success: true, aiOn: on });
    } catch (err) {
      console.error('[seller/order-chat-ai] failed:', err);
      res.status(503).json({ error: 'Could not save. Please try again.' });
    }
  });

  app.post('/api/seller/order-chat/:orderId', d.requireSeller, async (req, res) => {
    const uid = (req as any).user.uid as string;
    const orderId = str(req.params.orderId, 128);
    const text = str(req.body?.text, MAX_TEXT);
    if (!text) return res.status(400).json({ error: 'Write a message.' });
    try {
      const order = await sellerOrder(uid, orderId);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      if (!isOpen(order)) return res.status(409).json({ error: 'This order is finished, so its chat is closed.' });
      const out = await send(orderId, order, 'SELLER', text);
      if (out.blocked) return res.status(400).json({ error: CONTACT_BLOCKED_TEXT, code: 'CONTACT_BLOCKED' });
      res.json({ success: true, ...view(out.chat, order, 'SELLER') });
    } catch (err) {
      sendError(res, err, 'seller send');
    }
  });

  // ---------------------------------------------------------------- admin (disputes)

  app.get('/api/admin/order-chat/:orderId', d.requireAdmin, async (req, res) => {
    try {
      const snap = await chats().doc(str(req.params.orderId, 128)).get();
      const chat = snap.exists ? (snap.data() as any) : null;
      res.json({ success: true, chat: chat ? { messages: chat.messages || [], blocked: chat.blocked || {}, lastBlocked: chat.lastBlocked || null } : null });
    } catch (err) {
      console.error('[admin/order-chat] failed:', err);
      res.status(503).json({ error: 'Could not load the chat.' });
    }
  });
}
