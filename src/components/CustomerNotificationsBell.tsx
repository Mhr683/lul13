import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, MapPin, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { OrderTrackingEvent } from '../types/store';
import { getSavedOrders, getUpdatesSeenAt, markUpdatesSeen } from '../services/myOrders';

// Customer notification bell: every status change, location update and store message on the
// customer's orders (orders saved on this device and, when signed in, the account's orders).

interface OrderUpdates {
  orderNumber: string;
  status: string;
  trackingEvents: OrderTrackingEvent[];
}

interface Notice {
  orderNumber: string;
  at: string;
  text: string;
  location?: string;
}

const REFRESH_MS = 2 * 60 * 1000;

// Deleted updates are only hidden on this device (the order's tracking history stays as it is)
const HIDDEN_KEY = 'order_updates_hidden_v1';
const CLEARED_KEY = 'order_updates_cleared_at_v1';
const noticeKey = (n: Notice) => `${n.orderNumber}|${n.at}`;
const readHidden = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const readClearedAt = () => {
  try {
    return localStorage.getItem(CLEARED_KEY) || '';
  } catch {
    return '';
  }
};

// Phone / computer notification for a new order update (once the customer allowed it). Shown by the
// app's own service worker (sw.js); never register a second one.
const NOTIFIED_KEY = 'order_updates_notified_at_v1';
const alertsAllowed = () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
async function showUpdateNotification(n: Notice) {
  const options = {
    body: `${n.location ? `${n.location} · ` : ''}${n.text}`,
    icon: '/pwa-192x192.png',
    tag: `order-${n.orderNumber}`,
    data: { url: location.href.split('#')[0] },
  } as NotificationOptions;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(`Order ${n.orderNumber}`, options);
    else new Notification(`Order ${n.orderNumber}`, options);
  } catch {
    /* the browser refused: the bell still shows it */
  }
}

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const CustomerNotificationsBell: React.FC<{ onOpenOrder: (orderNumber: string) => void }> = ({ onOpenOrder }) => {
  const { firebaseUser, orders } = useStore();
  const [deviceOrders, setDeviceOrders] = useState<OrderUpdates[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => getUpdatesSeenAt());
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [clearedAt, setClearedAt] = useState(readClearedAt);
  const panelRef = useRef<HTMLDivElement>(null);

  const deleteNotice = (n: Notice) => {
    const next = [noticeKey(n), ...hidden].slice(0, 500);
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {}
  };
  const clearAll = () => {
    if (!notices.length) return;
    const newest = notices[0].at;
    setClearedAt(newest);
    setHidden([]);
    try {
      localStorage.setItem(CLEARED_KEY, newest);
      localStorage.removeItem(HIDDEN_KEY);
    } catch {}
  };

  const refresh = useCallback(async () => {
    const saved = getSavedOrders();
    if (saved.length === 0) {
      setDeviceOrders([]);
      return;
    }
    try {
      const res = await fetch('/api/orders/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: saved.map((o) => ({ orderNumber: o.orderNumber, token: o.token })) }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.orders)) setDeviceOrders(data.orders);
    } catch {
      // keep the last known updates while offline
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      // With phone alerts on, keep looking while the app is in the background too
      if (document.visibilityState === 'visible' || alertsAllowed()) refresh();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('my-orders-changed', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('my-orders-changed', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Close when clicking outside the panel
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const notices = useMemo(() => {
    // Signed-in customer's own orders (live) take precedence over the device copy of the same order
    const byNumber = new Map<string, OrderUpdates>();
    for (const o of deviceOrders) byNumber.set(o.orderNumber, o);
    if (firebaseUser) {
      for (const o of orders) {
        if (o.userId === firebaseUser.uid) {
          byNumber.set(o.orderNumber, { orderNumber: o.orderNumber, status: o.status, trackingEvents: o.trackingEvents || [] });
        }
      }
    }
    const list: Notice[] = [];
    for (const o of byNumber.values()) {
      for (const ev of o.trackingEvents || []) {
        list.push({ orderNumber: o.orderNumber, at: ev.at, text: ev.note, location: ev.location });
      }
    }
    const hiddenSet = new Set(hidden);
    return list
      .filter((n) => (!clearedAt || n.at > clearedAt) && !hiddenSet.has(noticeKey(n)))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40);
  }, [deviceOrders, orders, firebaseUser, hidden, clearedAt]);

  const unread = notices.filter((n) => !seenAt || n.at > seenAt).length;

  // A new update (e.g. the seller pressed "Ready for pickup") pops up on the phone as well
  const [alerts, setAlerts] = useState(alertsAllowed);
  useEffect(() => {
    const newest = notices[0];
    if (!newest) return;
    let last = '';
    try {
      last = localStorage.getItem(NOTIFIED_KEY) || '';
    } catch {}
    if (newest.at <= last) return;
    try {
      localStorage.setItem(NOTIFIED_KEY, newest.at);
    } catch {}
    // First look on this device: remember the newest one without ringing for old updates
    if (last && alertsAllowed() && (!seenAt || newest.at > seenAt)) showUpdateNotification(newest);
  }, [notices, seenAt]);
  const turnOnAlerts = async () => {
    if (!('Notification' in window)) return;
    setAlerts((await Notification.requestPermission()) === 'granted');
  };

  const togglePanel = () => {
    const next = !open;
    setOpen(next);
    if (next && notices.length > 0) {
      markUpdatesSeen(notices[0].at);
      // Keep the unread highlight while the panel is open; the badge clears on close
      setTimeout(() => setSeenAt(notices[0].at), 4000);
    }
  };

  if (notices.length === 0 && getSavedOrders().length === 0 && !firebaseUser) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={togglePanel}
        className="relative p-2 text-[#141413] hover:bg-black/[0.05] rounded-full cursor-pointer"
        aria-label={unread > 0 ? `${unread} new order updates` : 'Order updates'}
        title="Order updates"
      >
        <Bell className="w-5 h-5 stroke-[1.5]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C2410C] text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto bg-white border border-black/15 shadow-xl">
          <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-black/10">
            <strong className="text-sm text-[#141413]">Order updates</strong>
            <div className="flex items-center gap-1">
              {notices.length > 0 && (
                <button
                  type="button"
                  onClick={() => window.confirm('Delete all order updates from this list?') && clearAll()}
                  className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear all
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="p-1 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {!alerts && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'denied' && (
            <button
              type="button"
              onClick={turnOnAlerts}
              className="w-full px-4 py-2.5 text-left text-xs font-semibold text-emerald-900 bg-emerald-50 border-b border-emerald-200 cursor-pointer hover:bg-emerald-100"
            >
              🔔 Get order updates as phone notifications
            </button>
          )}
          {notices.length === 0 ? (
            <p className="p-4 text-xs text-[#575653]">No updates yet. Every update about your orders will appear here.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {notices.map((n, idx) => {
                const isNew = !seenAt || n.at > seenAt;
                return (
                  <li key={`${n.orderNumber}-${n.at}-${idx}`} className={`relative group ${isNew ? 'bg-amber-50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenOrder(n.orderNumber);
                      }}
                      className="w-full text-left pl-4 pr-10 py-3 text-xs cursor-pointer hover:bg-black/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#141413]">{n.orderNumber}</span>
                        <span className="text-[10px] text-[#575653] shrink-0">{formatWhen(n.at)}</span>
                      </div>
                      <div className="mt-0.5 text-[#141413]">
                        {n.location && (
                          <span className="inline-flex items-center gap-0.5 font-semibold mr-1">
                            <MapPin className="w-3 h-3" />
                            {n.location} ·
                          </span>
                        )}
                        {n.text}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNotice(n)}
                      aria-label="Delete this update"
                      title="Delete"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-[#787774] hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
