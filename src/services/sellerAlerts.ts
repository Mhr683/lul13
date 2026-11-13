// Seller Center's ring: a short chime (made with WebAudio, no sound file) and, when the seller allowed
// it, a phone / computer notification for new orders and new customer chat messages.
// The seller can switch the sound off; the choice is kept on this device.

const SOUND_KEY = 'anokha.seller.sound';

export const soundOn = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};
export const setSoundOn = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: stays on for this visit */
  }
};

let ctx: AudioContext | null = null;
const audio = () => {
  if (!ctx) {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
};

/** Browsers only allow sound after the user touched the page once: unlock it on the first tap */
export function unlockSoundOnFirstTap() {
  const unlock = () => {
    const c = audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Two-tone bell: "ding-dong" (kind: order), a lighter double "ding" (kind: message) */
export function playChime(kind: 'order' | 'message' = 'message') {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const notes = kind === 'order' ? [[880, 0], [660, 0.22], [880, 0.6], [660, 0.82]] : [[1046, 0], [1318, 0.16]];
  const t0 = c.currentTime + 0.02;
  for (const [freq, at] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.55);
  }
  try {
    navigator.vibrate?.(kind === 'order' ? [200, 100, 200] : 150);
  } catch {
    /* no vibration */
  }
}

// ------------------------------------------------------------------ notifications

let swReg: Promise<ServiceWorkerRegistration | null> | null = null;
const registration = () => {
  if (!swReg) {
    swReg =
      'serviceWorker' in navigator
        ? navigator.serviceWorker.register('/seller-sw.js').catch(() => null)
        : Promise.resolve(null);
  }
  return swReg;
};

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationsAllowed = () => notificationsSupported() && Notification.permission === 'granted';
export const notificationsBlocked = () => notificationsSupported() && Notification.permission === 'denied';

export async function askForNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  await registration();
  const p = await Notification.requestPermission();
  return p === 'granted';
}

/** Notifies when the seller is not looking at Seller Center (tab hidden or the app in the background) */
export async function notify(title: string, body: string, tab: string) {
  if (!notificationsAllowed() || document.visibilityState === 'visible') return;
  const options: NotificationOptions = {
    body,
    icon: '/seller-192x192.png',
    badge: '/seller-192x192.png',
    tag: `seller-${tab}`,
    data: { url: location.href.split('#')[0], tab },
  } as NotificationOptions;
  try {
    const reg = await registration();
    if (reg) return void (await reg.showNotification(title, options));
    new Notification(title, options);
  } catch {
    /* the browser refused: the chime still played */
  }
}

/** A tapped notification asks the open Seller Center to show a tab */
export function onNotificationOpen(fn: (tab: string) => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'seller-alert-open' && e.data.tab) fn(String(e.data.tab));
  };
  navigator.serviceWorker.addEventListener('message', handler);
  registration();
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}
