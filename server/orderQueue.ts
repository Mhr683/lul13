import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Orders are never lost when the database cannot take them (the free Firestore daily limit is used
// up, Google is down, the internet drops for a moment). The order is kept in a file on this computer,
// the customer gets their order number at once, and every few minutes the queue is sent again
// through the normal checkout (same checks, stock, emails) with the same order number and tracking
// key. Orders that can no longer be placed (sold out meanwhile) are kept aside for the store owner.
//
//   .private/order-queue.json   { pending: QueuedOrder[], problems: QueuedOrder[] }  (git-ignored)

export interface QueuedOrder {
  id: string;
  at: string;
  body: any;
  userId: string | null;
  token: string;
  /** Order number per seller, given to the customer now and used when the order is placed */
  numbers: Record<string, string>;
  tries: number;
  lastError?: string;
}

interface QueueDeps {
  dir: string;
  /** true while the database is known to refuse requests (quota) */
  isBlocked: () => boolean;
  /** Sends one queued order through the normal checkout */
  replay: (q: QueuedOrder) => Promise<{ status: number; body: any }>;
  onPlaced?: (q: QueuedOrder, body: any) => void;
  onProblem?: (q: QueuedOrder, error: string) => void;
}

const RETRY_EVERY_MS = 5 * 60_000;

export function createOrderQueue(d: QueueDeps) {
  const file = path.join(d.dir, 'order-queue.json');
  let data: { pending: QueuedOrder[]; problems: QueuedOrder[] } = { pending: [], problems: [] };
  try {
    data = { pending: [], problems: [], ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    /* no queue yet */
  }
  const save = () => {
    try {
      fs.mkdirSync(d.dir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
      fs.renameSync(file + '.tmp', file);
    } catch (err) {
      console.error('[order-queue] could not save the queue file:', err);
    }
  };

  const add = (entry: Omit<QueuedOrder, 'id' | 'at' | 'tries'>): QueuedOrder => {
    const q: QueuedOrder = { ...entry, id: `q-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, at: new Date().toISOString(), tries: 0 };
    data.pending.push(q);
    save();
    console.warn(`[order-queue] database not available: order ${Object.values(q.numbers).join(', ')} kept on this computer (${data.pending.length} waiting)`);
    setTimeout(() => void flush(), 60_000);
    return q;
  };

  let flushing = false;
  const flush = async () => {
    if (flushing || !data.pending.length || d.isBlocked()) return;
    flushing = true;
    try {
      for (const q of [...data.pending]) {
        if (d.isBlocked()) break;
        q.tries++;
        let r: { status: number; body: any };
        try {
          r = await d.replay(q);
        } catch (err: any) {
          r = { status: 0, body: { error: err?.message || String(err) } };
        }
        if (r.status === 201) {
          data.pending = data.pending.filter((x) => x.id !== q.id);
          console.log(`[order-queue] placed ${Object.values(q.numbers).join(', ')} from the queue`);
          d.onPlaced?.(q, r.body);
        } else if (r.status === 400 || r.status === 401 || q.tries >= 300) {
          // Cannot be placed any more (e.g. sold out meanwhile): kept for the store owner to call the customer
          data.pending = data.pending.filter((x) => x.id !== q.id);
          q.lastError = String(r.body?.error || `HTTP ${r.status}`).slice(0, 300);
          data.problems.push(q);
          console.error(`[order-queue] could not place ${Object.values(q.numbers).join(', ')}: ${q.lastError}`);
          d.onProblem?.(q, q.lastError);
        } else {
          q.lastError = String(r.body?.error || `HTTP ${r.status}`).slice(0, 300);
          save();
          break; // database still not available: try again later
        }
        save();
        // Space the orders out (the checkout is rate limited per address)
        await new Promise((ok) => setTimeout(ok, 7000));
      }
    } finally {
      flushing = false;
    }
  };

  setTimeout(() => void flush(), 30_000);
  setInterval(() => void flush(), RETRY_EVERY_MS);

  return {
    add,
    flush,
    status: () => ({ pending: data.pending.length, problems: data.problems.length }),
    /** A waiting order by one of its order numbers */
    find: (orderNumber: string) => data.pending.find((q) => Object.values(q.numbers).includes(orderNumber)),
    list: () => ({ pending: data.pending, problems: data.problems }),
    /** The store owner dealt with a problem order (called the customer) */
    dismissProblem: (id: string) => {
      const before = data.problems.length;
      data.problems = data.problems.filter((x) => x.id !== id);
      if (data.problems.length !== before) save();
      return before !== data.problems.length;
    },
  };
}
