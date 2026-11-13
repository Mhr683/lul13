import { auth } from '../lib/firebase';
import type { ShippingAddress } from './intlAddress';

// The signed-in customer's photo and saved delivery addresses (server/customerProfile.ts).
// Read once per visit and kept here; every change returns the new list.

export interface SavedAddress extends ShippingAddress {
  id: string;
  label: string;
  name: string;
  updatedAt: string;
}
export interface CustomerBook {
  photoUrl: string;
  addresses: SavedAddress[];
  defaultId: string;
}

let cache: { uid: string; book: CustomerBook } | null = null;
let loading: Promise<CustomerBook> | null = null;
const listeners = new Set<(b: CustomerBook) => void>();

async function call(path: string, init: RequestInit = {}) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Please sign in first.');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Could not reach the store. Please try again.'), { field: data?.field });
  return data;
}

const publish = (patch: Partial<CustomerBook>) => {
  const uid = auth.currentUser?.uid || '';
  const book = { ...(cache?.uid === uid ? cache.book : { photoUrl: '', addresses: [], defaultId: '' }), ...patch };
  cache = { uid, book };
  listeners.forEach((fn) => fn(book));
  return book;
};

export function getCustomerBook(force = false): Promise<CustomerBook> {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.resolve({ photoUrl: '', addresses: [], defaultId: '' });
  if (!force && cache?.uid === uid) return Promise.resolve(cache.book);
  if (!loading) {
    loading = call('/api/me/profile')
      .then((d) => publish({ photoUrl: d.photoUrl || '', addresses: d.addresses || [], defaultId: d.defaultId || '' }))
      .finally(() => (loading = null));
  }
  return loading;
}

export function onCustomerBook(fn: (b: CustomerBook) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const forgetCustomerBook = () => {
  cache = null;
};

export async function saveAddress(addr: Record<string, unknown>) {
  const d = await call('/api/me/addresses', { method: 'POST', body: JSON.stringify(addr) });
  return publish({ addresses: d.addresses, defaultId: d.defaultId });
}
export async function deleteAddress(id: string) {
  const d = await call(`/api/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return publish({ addresses: d.addresses, defaultId: d.defaultId });
}
export async function makeDefaultAddress(id: string) {
  const d = await call(`/api/me/addresses/${encodeURIComponent(id)}/default`, { method: 'POST' });
  return publish({ addresses: d.addresses, defaultId: d.defaultId });
}
export async function savePhoto(photo: string) {
  const d = await call('/api/me/photo', { method: 'POST', body: JSON.stringify({ photo }) });
  return publish({ photoUrl: d.photoUrl || '' });
}
export async function saveDetails(name: string, phone: string, countryCode = 'PK') {
  return call('/api/me/profile', { method: 'PUT', body: JSON.stringify({ name, phone, countryCode }) });
}
