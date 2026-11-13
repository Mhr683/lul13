import type express from 'express';
import { checkShippingAddress, checkPhone, type ShippingAddress } from '../src/services/intlAddress';

// A customer's own details in the store (My Account):
//   - name and phone: users/{uid} (the same fields sign-up and checkout already use)
//   - profile photo and the address book: customer_profiles/{uid}
//       { photoUrl, addresses: SavedAddress[], defaultId, updatedAt }
// Only this server writes customer_profiles (the browser has no access to it), so the users/{uid}
// rules stay as they are. users/{uid}.defaultAddress (the last order's address) is still kept by the
// order code; an empty address book starts from it.

export interface SavedAddress extends ShippingAddress {
  id: string;
  /** Home, Office, ... */
  label: string;
  /** Who receives the parcel */
  name: string;
  updatedAt: string;
}

interface Deps {
  adminDb: FirebaseFirestore.Firestore;
  requireAuth: express.RequestHandler;
}

const MAX_ADDRESSES = 10;
const MAX_PHOTO_BYTES = 150 * 1024;
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sameAddress = (a: ShippingAddress, b: ShippingAddress) =>
  a.line1.toLowerCase() === b.line1.toLowerCase() && a.city.toLowerCase() === b.city.toLowerCase() && a.phoneNumber === b.phoneNumber;

type ProfileDoc = { photoUrl?: string; addresses: SavedAddress[]; defaultId?: string };

async function readProfile(db: FirebaseFirestore.Firestore, uid: string): Promise<ProfileDoc> {
  const snap = await db.collection('customer_profiles').doc(uid).get();
  if (snap.exists) {
    const d = snap.data() as any;
    return { photoUrl: d.photoUrl || '', addresses: Array.isArray(d.addresses) ? d.addresses : [], defaultId: d.defaultId || '' };
  }
  // First visit: the address of the last order (if any) becomes the first saved address
  const user = (await db.collection('users').doc(uid).get()).data() as any;
  const last = user?.defaultAddress;
  if (last?.line1 && last?.city) {
    const { updatedAt, ...addr } = last;
    const first: SavedAddress = { ...addr, id: newId(), label: 'Home', name: str(user?.name, 110), updatedAt: updatedAt || new Date().toISOString() };
    return { addresses: [first], defaultId: first.id };
  }
  return { addresses: [] };
}

/** Called after an order: a new delivery address is added to the customer's book (best effort) */
export async function rememberOrderAddress(db: FirebaseFirestore.Firestore, uid: string, address: ShippingAddress, name: string) {
  const ref = db.collection('customer_profiles').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur: ProfileDoc = snap.exists ? (snap.data() as any) : await readProfile(db, uid);
    const list = Array.isArray(cur.addresses) ? cur.addresses : [];
    if (list.some((a) => sameAddress(a, address)) || list.length >= MAX_ADDRESSES) {
      if (!snap.exists) tx.set(ref, { ...cur, updatedAt: new Date().toISOString() });
      return;
    }
    const saved: SavedAddress = { ...address, id: newId(), label: list.length ? 'Other' : 'Home', name: str(name, 110), updatedAt: new Date().toISOString() };
    tx.set(ref, { photoUrl: cur.photoUrl || '', addresses: [...list, saved], defaultId: cur.defaultId || saved.id, updatedAt: saved.updatedAt });
  });
}

export function registerCustomerProfileRoutes(app: express.Express, d: Deps) {
  const { adminDb } = d;
  const ref = (uid: string) => adminDb.collection('customer_profiles').doc(uid);
  const uidOf = (req: express.Request) => (req as any).user.uid as string;
  const fail = (res: express.Response, err: unknown, where: string) => {
    if ((err as any)?.status) return res.status((err as any).status).json({ error: (err as Error).message });
    console.error(`[customer ${where}] failed:`, err);
    res.status(503).json({ error: 'Could not save. Please try again.' });
  };
  const userError = (status: number, message: string) => Object.assign(new Error(message), { status });

  // Changes the book in one transaction and answers with the new book
  const changeBook = async (uid: string, fn: (p: ProfileDoc) => ProfileDoc) => {
    let out!: ProfileDoc;
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref(uid));
      const cur = snap.exists ? ({ addresses: [], ...(snap.data() as any) } as ProfileDoc) : await readProfile(adminDb, uid);
      out = fn({ ...cur, addresses: [...(cur.addresses || [])] });
      if (out.defaultId && !out.addresses.some((a) => a.id === out.defaultId)) out.defaultId = out.addresses[0]?.id || '';
      if (!out.defaultId && out.addresses.length) out.defaultId = out.addresses[0].id;
      tx.set(ref(uid), { photoUrl: out.photoUrl || '', addresses: out.addresses, defaultId: out.defaultId || '', updatedAt: new Date().toISOString() });
    });
    return out;
  };

  app.get('/api/me/profile', d.requireAuth, async (req, res) => {
    try {
      const p = await readProfile(adminDb, uidOf(req));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, photoUrl: p.photoUrl || '', addresses: p.addresses, defaultId: p.defaultId || '' });
    } catch (err) {
      fail(res, err, 'profile');
    }
  });

  // Name and phone (users/{uid}, the same fields the account already has)
  app.put('/api/me/profile', d.requireAuth, async (req, res) => {
    const name = str(req.body?.name, 110);
    const rawPhone = str(req.body?.phone, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    let phone = '';
    if (rawPhone) {
      const c = checkPhone(str(req.body?.countryCode, 2).toUpperCase() || 'PK', rawPhone);
      if (!c.valid) return res.status(400).json({ error: c.message });
      phone = c.e164.startsWith('+92') ? `0${c.e164.slice(3)}` : c.e164;
    }
    try {
      await adminDb.collection('users').doc(uidOf(req)).set({ name, phone, updatedAt: new Date().toISOString() }, { merge: true });
      res.json({ success: true, name, phone });
    } catch (err) {
      fail(res, err, 'details');
    }
  });

  // Profile photo: a small square JPEG made in the browser (data URL, kept on the profile record)
  app.post('/api/me/photo', d.requireAuth, async (req, res) => {
    const photo = String(req.body?.photo || '');
    if (photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) return res.status(400).json({ error: 'Please choose a JPG or PNG picture.' });
    if (photo.length > (MAX_PHOTO_BYTES * 4) / 3 + 40) return res.status(400).json({ error: 'The picture is too large. Please choose a smaller one.' });
    try {
      await changeBook(uidOf(req), (p) => ({ ...p, photoUrl: photo }));
      res.json({ success: true, photoUrl: photo });
    } catch (err) {
      fail(res, err, 'photo');
    }
  });

  // Add a new address, or change one (with its id)
  app.post('/api/me/addresses', d.requireAuth, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 110);
    if (name.length < 2) return res.status(400).json({ error: "Enter the receiver's full name.", field: 'name' });
    const check = checkShippingAddress(b, { countryName: str(b.countryName, 60), currency: str(b.currency, 3) });
    if (!check.ok) return res.status(400).json({ error: check.message, field: check.field });
    const label = str(b.label, 30) || 'Home';
    const id = str(b.id, 40);
    try {
      const out = await changeBook(uidOf(req), (p) => {
        const saved: SavedAddress = { ...check.address, id: id || newId(), label, name, updatedAt: new Date().toISOString() };
        if (id) {
          const i = p.addresses.findIndex((a) => a.id === id);
          if (i < 0) throw userError(404, 'This address was not found. Please reload the page.');
          p.addresses[i] = saved;
        } else {
          if (p.addresses.length >= MAX_ADDRESSES) throw userError(400, `You can save up to ${MAX_ADDRESSES} addresses. Delete an old one first.`);
          if (p.addresses.some((a) => sameAddress(a, saved))) throw userError(409, 'This address is already saved.');
          p.addresses.push(saved);
        }
        if (b.makeDefault) p.defaultId = saved.id;
        return p;
      });
      res.json({ success: true, addresses: out.addresses, defaultId: out.defaultId || '' });
    } catch (err) {
      fail(res, err, 'address');
    }
  });

  app.delete('/api/me/addresses/:id', d.requireAuth, async (req, res) => {
    const id = str(req.params.id, 40);
    try {
      const out = await changeBook(uidOf(req), (p) => ({ ...p, addresses: p.addresses.filter((a) => a.id !== id) }));
      res.json({ success: true, addresses: out.addresses, defaultId: out.defaultId || '' });
    } catch (err) {
      fail(res, err, 'address delete');
    }
  });

  app.post('/api/me/addresses/:id/default', d.requireAuth, async (req, res) => {
    const id = str(req.params.id, 40);
    try {
      const out = await changeBook(uidOf(req), (p) => {
        if (!p.addresses.some((a) => a.id === id)) throw userError(404, 'This address was not found. Please reload the page.');
        return { ...p, defaultId: id };
      });
      res.json({ success: true, addresses: out.addresses, defaultId: out.defaultId || '' });
    } catch (err) {
      fail(res, err, 'address default');
    }
  });
}
