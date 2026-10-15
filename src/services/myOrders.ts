// Orders placed from this device (order number + private access token), so a customer can see all
// of their orders and their updates without an account or remembering order numbers.

export interface SavedOrderRef {
  orderNumber: string;
  token: string;
  createdAt: string;
}

const ORDERS_KEY = 'my_orders_v1';
const SEEN_KEY = 'my_order_updates_seen_v1';
const MAX_SAVED = 20;

export function getSavedOrders(): SavedOrderRef[] {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    return Array.isArray(list)
      ? list.filter((o) => o && typeof o.orderNumber === 'string' && typeof o.token === 'string')
      : [];
  } catch {
    return [];
  }
}

export function rememberOrder(orderNumber: string, token: string) {
  if (!orderNumber || !token) return;
  try {
    const rest = getSavedOrders().filter((o) => o.orderNumber !== orderNumber);
    const next = [{ orderNumber, token, createdAt: new Date().toISOString() }, ...rest].slice(0, MAX_SAVED);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('my-orders-changed'));
  } catch {}
}

export function tokenForOrder(orderNumber: string): string | undefined {
  return getSavedOrders().find((o) => o.orderNumber === orderNumber)?.token;
}

/** Time of the newest update the customer has already looked at */
export function getUpdatesSeenAt(): string {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
}

export function markUpdatesSeen(at: string) {
  try {
    localStorage.setItem(SEEN_KEY, at);
  } catch {}
}
