// Loaded into the app's own service worker (sw.js, vite.config.ts workbox.importScripts): opens
// Seller Center when a "new order / new message" notification is tapped
// (src/services/sellerAlerts.ts shows them). Never register this file on its own: a second service
// worker on the same site replaces sw.js and the app reloads itself over and over.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'seller-alert-open', tab: data.tab });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
