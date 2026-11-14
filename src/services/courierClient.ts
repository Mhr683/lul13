import { auth } from '../lib/firebase';

// Browser side of the courier connection (server/couriers.ts)

export async function courierApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  // Loaded as soon as the Orders page opens: wait for the saved sign-in first
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || (res.status >= 500 ? 'The server is not reachable right now. Please try again.' : 'Something went wrong.'));
  return data as T;
}

/**
 * Opens the courier label (airway bill) of an order in a new tab, to print. The tab is opened
 * straight away (on the click) so the browser does not block it as a pop-up.
 */
export async function openCourierLabel(path: string): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data?.error || 'The label could not be opened.');
      if (win) win.location.href = data.url;
      else window.location.href = data.url;
      return;
    }
    if (!res.ok) throw new Error('The label could not be opened.');
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    win?.close();
    throw err;
  }
}
