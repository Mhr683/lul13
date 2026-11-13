// How Seller Center opens each social app to connect a page (src/components/SocialConnectModal.tsx).
//
// A web page cannot see which apps are installed or which accounts are signed in (browsers block it
// for privacy). So on Android one "intent" link opens the app when it is installed and the Play Store
// page otherwise; on iPhone the normal link opens the app when installed; on a computer the website.
// The seller then copies their own profile link and comes back: "Connect now" reads it.

import type { SocialPlatform } from './socialLinks';

type Connect = {
  /** Android package (Play Store id) */
  pkg?: string;
  /** Web home of the platform (also what the app opens) */
  home: string;
  signup: string;
  /** Where the seller finds "copy my link" in the app, in simple words */
  howToCopy: string;
};

export const CONNECT: Record<Exclude<SocialPlatform, 'OTHER'>, Connect> = {
  FACEBOOK: {
    pkg: 'com.facebook.katana',
    home: 'https://www.facebook.com/',
    signup: 'https://www.facebook.com/r.php',
    howToCopy: 'Open your page → tap ⋯ (More) → "Copy link" (or "Share" → "Copy link").',
  },
  INSTAGRAM: {
    pkg: 'com.instagram.android',
    home: 'https://www.instagram.com/',
    signup: 'https://www.instagram.com/accounts/emailsignup/',
    howToCopy: 'Tap your profile picture (bottom right) → "Share profile" → "Copy link".',
  },
  YOUTUBE: {
    pkg: 'com.google.android.youtube',
    home: 'https://www.youtube.com/',
    signup: 'https://www.youtube.com/create_channel',
    howToCopy: 'Tap "You" → your channel → ⋯ → "Share" → "Copy link".',
  },
  TIKTOK: {
    pkg: 'com.zhiliaoapp.musically',
    home: 'https://www.tiktok.com/',
    signup: 'https://www.tiktok.com/signup',
    howToCopy: 'Tap "Profile" → the share arrow (top right) → "Copy link".',
  },
  X: {
    pkg: 'com.twitter.android',
    home: 'https://x.com/',
    signup: 'https://x.com/i/flow/signup',
    howToCopy: 'Open your profile → ⋯ (or share icon) → "Share" → "Copy link".',
  },
  TELEGRAM: {
    pkg: 'org.telegram.messenger',
    home: 'https://t.me/',
    signup: 'https://telegram.org/apps',
    howToCopy: 'Open your channel → tap its name → copy the "t.me/..." link.',
  },
  WHATSAPP_CHANNEL: {
    pkg: 'com.whatsapp',
    home: 'https://www.whatsapp.com/',
    signup: 'https://www.whatsapp.com/download',
    howToCopy: 'Type your WhatsApp number below, or copy a group / channel invite link (Updates → your channel → Share → Copy link).',
  },
};

/** A typed user / page name ("anokhashop" or "@anokhashop") made into its profile link; null when it is not a name */
export function profileUrlFromName(p: Exclude<SocialPlatform, 'OTHER'>, raw: string): string | null {
  const name = raw.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._-]{2,60}$/.test(name) || /^\d+$/.test(name)) return null;
  switch (p) {
    case 'FACEBOOK':
      return `https://www.facebook.com/${name}`;
    case 'INSTAGRAM':
      return `https://www.instagram.com/${name}`;
    case 'YOUTUBE':
      return `https://www.youtube.com/@${name}`;
    case 'TIKTOK':
      return `https://www.tiktok.com/@${name}`;
    case 'X':
      return `https://x.com/${name}`;
    case 'TELEGRAM':
      return `https://t.me/${name}`;
    default:
      return null;
  }
}

export const deviceKind = (): 'android' | 'ios' | 'desktop' => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
};

export const playStoreUrl = (pkg: string) => `https://play.google.com/store/apps/details?id=${pkg}`;

/** The link that opens the app (Android: the app, or the Play Store when it is not installed) */
export function openAppUrl(p: Exclude<SocialPlatform, 'OTHER'>): string {
  const c = CONNECT[p];
  if (deviceKind() === 'android' && c.pkg) {
    const u = new URL(c.home);
    return `intent://${u.host}${u.pathname}#Intent;scheme=https;package=${c.pkg};S.browser_fallback_url=${encodeURIComponent(playStoreUrl(c.pkg))};end`;
  }
  return c.home;
}
