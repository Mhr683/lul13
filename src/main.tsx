/// <reference types="vite-plugin-pwa/client" />
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// The installed app keeps a copy of the store's code. Check for a new version on start, every hour
// and whenever the app comes back to the foreground, and reload as soon as it is installed, so
// customers and admins never keep running an old version.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => {});
    };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

createRoot(document.getElementById('root')!).render(<App />);
