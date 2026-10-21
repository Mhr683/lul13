import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { stripPaymentSecrets } from '../src/services/paymentSecrets';

// In-memory copy of everything customers browse (products, categories, store settings, active
// coupons, approved reviews) plus the admin-only supplier data. Customers, Seller Center and the
// admin console are served from here, so a visit costs no Firestore reads (the free database allows
// 50,000 reads a day).
//
// Keeping it cheap and running:
// - A compressed snapshot is saved to local disk and to a few Firestore documents (_cache/*). A new
//   server instance (Cloud Run starts them often) loads that in 2-4 reads instead of reading every
//   product again, and serves at once.
// - After that only products / supplier records changed since the snapshot are read (every write
//   sets updatedAt). Once a day the full collections are read again to catch anything missed.
// - If Firestore stops answering (quota, outage) the last copy keeps being served and the listeners
//   retry later; nothing is cleared.

type Doc = Record<string, any>;

interface Snapshot {
  v: 1;
  savedAt: string;
  fullSyncAt: string;
  productsSyncedAt: string;
  privateSyncedAt: string;
  products: Doc[];
  privates: [string, Doc][];
  categories: Doc[];
  settings: Doc | null;
  coupons: Doc[];
  reviews: Doc[];
}

const CACHE_COLLECTION = '_cache';
const CHUNK_CHARS = 700_000; // well below Firestore's 1 MB document limit
const FULL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const SAVE_LOCAL_EVERY_MS = 2 * 60 * 1000;
const SAVE_REMOTE_EVERY_MS = 15 * 60 * 1000;

export function createCatalogStore(
  adminDb: FirebaseFirestore.Firestore,
  opts: { toPublic: (p: Doc) => Doc; dir: string; onListenerError?: (err: any) => void }
) {
  const products = new Map<string, Doc>();
  const privates = new Map<string, Doc>();
  let categories: Doc[] = [];
  let settings: Doc | null = null;
  let coupons: Doc[] = [];
  let reviews: Doc[] = [];
  let fullSyncAt = '';
  let productsSyncedAt = '';
  let privateSyncedAt = '';
  let productsReady = false;
  let privateReady = false;
  let dirty = false;
  let lastRemoteSave = 0;
  let publicJson: string | null = null;
  let publicGzip: Buffer | null = null;
  const unsubs: Record<string, () => void> = {};

  const localFile = path.join(opts.dir, 'catalog-snapshot.json.gz');

  const changed = () => {
    dirty = true;
    publicJson = null;
    publicGzip = null;
  };

  const maxIso = (a: string, b: unknown) => (typeof b === 'string' && b > a ? b : a);

  // ------------------------------------------------------------------ snapshot load / save

  const applySnapshot = (s: Snapshot) => {
    products.clear();
    for (const p of s.products) products.set(p.id, p);
    privates.clear();
    for (const [id, d] of s.privates) privates.set(id, d);
    categories = s.categories || [];
    settings = s.settings ? stripPaymentSecrets(s.settings) : null;
    coupons = s.coupons || [];
    reviews = s.reviews || [];
    fullSyncAt = s.fullSyncAt || '';
    productsSyncedAt = s.productsSyncedAt || '';
    privateSyncedAt = s.privateSyncedAt || '';
    productsReady = true;
    privateReady = true;
    changed();
    dirty = false;
  };

  const buildSnapshot = (): Snapshot => ({
    v: 1,
    savedAt: new Date().toISOString(),
    fullSyncAt,
    productsSyncedAt,
    privateSyncedAt,
    products: Array.from(products.values()),
    privates: Array.from(privates.entries()),
    categories,
    settings,
    coupons,
    reviews,
  });

  const loadLocal = (): Snapshot | null => {
    try {
      if (!fs.existsSync(localFile)) return null;
      const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(localFile)).toString('utf8'));
      return s?.v === 1 ? s : null;
    } catch (err: any) {
      console.warn('[Catalog] Local snapshot unreadable:', err?.message);
      return null;
    }
  };

  const loadRemote = async (): Promise<Snapshot | null> => {
    try {
      const meta = await adminDb.collection(CACHE_COLLECTION).doc('catalog_meta').get();
      const chunks = Number(meta.data()?.chunks) || 0;
      if (!chunks) return null;
      const refs = Array.from({ length: chunks }, (_, i) => adminDb.collection(CACHE_COLLECTION).doc(`catalog_${i}`));
      const docs = await adminDb.getAll(...refs);
      const b64 = docs.map((d) => String(d.data()?.data || '')).join('');
      const s = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
      return s?.v === 1 ? s : null;
    } catch (err: any) {
      console.warn('[Catalog] Saved snapshot could not be loaded:', err?.message);
      return null;
    }
  };

  const saveLocal = (packed: Buffer) => {
    try {
      fs.mkdirSync(opts.dir, { recursive: true });
      fs.writeFileSync(localFile + '.tmp', packed);
      fs.renameSync(localFile + '.tmp', localFile);
    } catch (err: any) {
      console.warn('[Catalog] Local snapshot not saved:', err?.message);
    }
  };

  const saveRemote = async (packed: Buffer) => {
    const b64 = packed.toString('base64');
    const chunks = Math.ceil(b64.length / CHUNK_CHARS);
    const batch = adminDb.batch();
    for (let i = 0; i < chunks; i++) {
      batch.set(adminDb.collection(CACHE_COLLECTION).doc(`catalog_${i}`), { data: b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
    }
    batch.set(adminDb.collection(CACHE_COLLECTION).doc('catalog_meta'), { chunks, savedAt: new Date().toISOString() });
    await batch.commit();
    lastRemoteSave = Date.now();
  };

  const save = async (remote: boolean) => {
    if (!productsReady || !privateReady) return;
    const packed = zlib.gzipSync(JSON.stringify(buildSnapshot()));
    saveLocal(packed);
    if (remote) {
      try {
        await saveRemote(packed);
      } catch (err: any) {
        console.warn('[Catalog] Snapshot not saved to Firestore:', err?.message);
        return;
      }
    }
    dirty = false;
  };

  // ------------------------------------------------------------------ listeners

  const retryLater = (name: string, start: () => void, err: any) => {
    opts.onListenerError?.(err);
    console.warn(`[Catalog] ${name} listener stopped (${err?.code || ''} ${err?.message || err}); serving the last copy, retrying in 5 min`);
    unsubs[name]?.();
    delete unsubs[name];
    setTimeout(start, RETRY_MS);
  };

  // Products and supplier records: everything (full) or only what changed since the snapshot
  const listenCollection = (
    name: 'products' | 'product_private',
    target: Map<string, Doc>,
    full: boolean,
    since: () => string,
    onSynced: (iso: string) => void,
    onReady: () => void
  ) => {
    const start = () => {
      const col = adminDb.collection(name);
      const q = full || !since() ? col : col.where('updatedAt', '>', since());
      let first = true;
      unsubs[name] = q.onSnapshot(
        (snap) => {
          if (first && (full || !since())) {
            // A full read replaces the copy, so products deleted meanwhile disappear too
            target.clear();
          }
          let latest = since();
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') target.delete(ch.doc.id);
            else {
              const data: Doc = { ...(ch.doc.data() as Doc), id: ch.doc.id };
              target.set(ch.doc.id, name === 'products' ? data : (ch.doc.data() as Doc));
              latest = maxIso(latest, data.updatedAt);
            }
          }
          onSynced(latest);
          if (first) {
            first = false;
            onReady();
            console.log(`[Catalog] ${name}: ${full || !since() ? 'full read' : 'changes only'}, ${snap.size} documents read, ${target.size} in memory`);
          }
          if (snap.docChanges().length) changed();
        },
        (err) => retryLater(name, start, err)
      );
    };
    start();
  };

  const listenSmall = () => {
    const startCategories = () => {
      unsubs.categories = adminDb.collection('categories').onSnapshot(
        (snap) => {
          categories = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Doc) }));
          changed();
        },
        (err) => retryLater('categories', startCategories, err)
      );
    };
    const startSettings = () => {
      unsubs.settings = adminDb.collection('settings').doc('store_config').onSnapshot(
        (snap) => {
          // Gateway secrets are never sent to the store (they belong in settings_private/payment)
          settings = snap.exists ? stripPaymentSecrets(snap.data() as Doc) : null;
          changed();
        },
        (err) => retryLater('settings', startSettings, err)
      );
    };
    const startCoupons = () => {
      unsubs.coupons = adminDb
        .collection('coupons')
        .where('active', '==', true)
        .onSnapshot(
          (snap) => {
            coupons = snap.docs.map((d) => d.data() as Doc);
            changed();
          },
          (err) => retryLater('coupons', startCoupons, err)
        );
    };
    const startReviews = () => {
      unsubs.reviews = adminDb
        .collection('reviews')
        .where('status', '==', 'APPROVED')
        .onSnapshot(
          (snap) => {
            reviews = snap.docs.map((d) => d.data() as Doc);
            changed();
          },
          (err) => retryLater('reviews', startReviews, err)
        );
    };
    startCategories();
    startSettings();
    startCoupons();
    startReviews();
  };

  const startSync = (full: boolean) => {
    unsubs.products?.();
    unsubs.product_private?.();
    let pending = 2;
    const done = () => {
      if (--pending === 0 && full) {
        fullSyncAt = new Date().toISOString();
        save(true).catch(() => {});
      }
    };
    listenCollection('products', products, full, () => productsSyncedAt, (iso) => (productsSyncedAt = iso), () => {
      productsReady = true;
      done();
    });
    listenCollection('product_private', privates, full, () => privateSyncedAt, (iso) => (privateSyncedAt = iso), () => {
      privateReady = true;
      done();
    });
  };

  // ------------------------------------------------------------------ start

  const start = async () => {
    const local = loadLocal();
    const snap = local || (await loadRemote());
    if (snap) {
      applySnapshot(snap);
      console.log(`[Catalog] Loaded saved copy from ${local ? 'disk' : 'Firestore'}: ${products.size} products (saved ${snap.savedAt})`);
    }
    const needFull = !snap || !fullSyncAt || Date.now() - Date.parse(fullSyncAt) > FULL_SYNC_EVERY_MS;
    startSync(needFull);
    listenSmall();

    setInterval(() => {
      if (dirty) save(Date.now() - lastRemoteSave > SAVE_REMOTE_EVERY_MS).catch(() => {});
    }, SAVE_LOCAL_EVERY_MS).unref?.();
    setInterval(() => {
      if (Date.now() - Date.parse(fullSyncAt || '1970') > FULL_SYNC_EVERY_MS) startSync(true);
    }, 60 * 60 * 1000).unref?.();

    // Cloud Run stops idle instances with SIGTERM: keep the latest copy for the next one
    process.once('SIGTERM', () => {
      const exit = () => process.exit(0);
      if (dirty) save(true).then(exit, exit);
      else exit();
      setTimeout(exit, 4000).unref?.();
    });
  };

  // ------------------------------------------------------------------ reads (no Firestore)

  return {
    start,
    get ready() {
      return productsReady;
    },
    get privateReady() {
      return privateReady;
    },
    /** Live products, customer-safe fields only */
    publicProducts: () => {
      const list: Doc[] = [];
      for (const p of products.values()) if (p.status === 'ACTIVE') list.push(opts.toPublic(p));
      return list;
    },
    publicCatalogResponse: () => {
      if (!publicJson) {
        const all: Doc[] = [];
        for (const p of products.values()) if (p.status === 'ACTIVE') all.push(opts.toPublic(p));
        publicJson = JSON.stringify({ success: true, total: all.length, products: all });
        publicGzip = zlib.gzipSync(publicJson);
      }
      return { json: publicJson, gzip: publicGzip! };
    },
    allProducts: () => Array.from(products.values()),
    product: (id: string) => products.get(id) || null,
    productsOfSeller: (sellerId: string, activeOnly = false) => {
      const list: Doc[] = [];
      for (const p of products.values()) if (p.sellerId === sellerId && (!activeOnly || p.status === 'ACTIVE')) list.push(p);
      return list;
    },
    supplierOf: (id: string) => privates.get(id) || null,
    categories: () => categories,
    settings: () => settings,
    coupons: () => coupons,
    reviews: () => reviews,
    /** Called after the server deletes a product (deletions are not seen by the changes-only sync) */
    removeProduct: (id: string) => {
      products.delete(id);
      privates.delete(id);
      changed();
    },
  };
}

export type CatalogStore = ReturnType<typeof createCatalogStore>;
