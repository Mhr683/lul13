// Seller Center alerts: lets the phone show "new order / new message" notifications.
// It caches nothing and does not touch page loads; it only opens Seller Center when a
// notification is tapped (src/services/sellerAlerts.ts shows them).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'seller-alert-open', tab: event.notification.data && event.notification.data.tab });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
