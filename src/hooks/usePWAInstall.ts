import { useEffect, useState } from 'react';
import { browserEnv } from '../services/browserEnv';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PlatformType = 'ios' | 'android' | 'desktop' | 'unknown';

// The browser offers the install prompt once, often before the (lazy-loaded) Seller Center or
// admin screen has mounted, so it is caught at startup and handed to whichever screen asks.
let earlyPrompt: BeforeInstallPromptEvent | null = null;
// Install taps that came before the browser was ready wait here for its prompt
const waiters = new Set<(e: BeforeInstallPromptEvent) => void>();
export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    earlyPrompt = e as BeforeInstallPromptEvent;
    waiters.forEach((w) => w(earlyPrompt!));
    waiters.clear();
  });
  window.addEventListener('appinstalled', () => {
    earlyPrompt = null;
  });
}

// The browser's own install box, if it offers one within `ms` (it can arrive a few seconds after load)
function waitForPrompt(ms: number): Promise<BeforeInstallPromptEvent | null> {
  if (earlyPrompt) return Promise.resolve(earlyPrompt);
  return new Promise((resolve) => {
    const w = (e: BeforeInstallPromptEvent) => {
      clearTimeout(timer);
      resolve(e);
    };
    const timer = setTimeout(() => {
      waiters.delete(w);
      resolve(null);
    }, ms);
    waiters.add(w);
  });
}

// 'unavailable' = the browser gave no install box (already installed, other browser, or iPhone)
export type InstallResult = 'accepted' | 'dismissed' | 'unavailable';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => earlyPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [platform, setPlatform] = useState<PlatformType>('unknown');

  useEffect(() => {
    // 1. Detect standalone mode (already running as installed PWA)
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    setIsInstalled(isStandalone);

    // 2. Detect OS / Device Platform
    if (typeof window !== 'undefined' && window.navigator) {
      const ua = window.navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroidDevice = /android/.test(ua);
      const isDesktopDevice = !isIOSDevice && !isAndroidDevice;

      setIsIOS(isIOSDevice);
      setIsAndroid(isAndroidDevice);
      setIsDesktop(isDesktopDevice);

      if (isIOSDevice) setPlatform('ios');
      else if (isAndroidDevice) setPlatform('android');
      else setPlatform('desktop');
    }

    // 3. Listen for Chromium beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem('atelier_pwa_installed', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<InstallResult> => {
    // iPhones and in-app browsers (WhatsApp, Facebook...) never offer it: show the guide at once
    const p = deferredPrompt || earlyPrompt || (isIOS || browserEnv().inApp ? null : await waitForPrompt(2500));
    if (!p) return 'unavailable';
    // A prompt can be shown only once; the browser sends a fresh one later if needed
    earlyPrompt = null;
    setDeferredPrompt(null);
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        try {
          localStorage.setItem('atelier_pwa_installed', 'true');
        } catch {}
        return 'accepted';
      }
      return 'dismissed';
    } catch (err) {
      console.warn('[PWA Install Error]:', err);
      return 'unavailable';
    }
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isDesktop,
    platform,
    install,
    deferredPrompt,
  };
}
