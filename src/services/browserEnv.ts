// Which browser the page is open in, for installing the app: in-app browsers (WhatsApp, Facebook,
// Instagram, TikTok, the Google app...) and some phone browsers cannot install it, so the install
// guide sends people to Chrome (Android) or Safari (iPhone) instead.

export interface BrowserEnv {
  ios: boolean;
  android: boolean;
  /** Opened inside another app (WhatsApp / Facebook / Instagram / TikTok / Google app / a WebView) */
  inApp: string;
  /** A phone browser other than Chrome / Edge that does not install apps well (Samsung, Mi, Opera, UC, Firefox) */
  otherBrowser: string;
  /** iPhone / iPad in a browser other than Safari (only Safari can add apps there) */
  iosNotSafari: boolean;
}

export function browserEnv(): BrowserEnv {
  if (typeof navigator === 'undefined') return { ios: false, android: false, inApp: '', otherBrowser: '', iosNotSafari: false };
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /WhatsApp/i.test(ua)
    ? 'WhatsApp'
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)
    ? 'Facebook'
    : /Instagram/i.test(ua)
    ? 'Instagram'
    : /musical_ly|TikTok|BytedanceWebview/i.test(ua)
    ? 'TikTok'
    : /Snapchat/i.test(ua)
    ? 'Snapchat'
    : /\bGSA\//i.test(ua)
    ? 'Google app'
    : /Line\//i.test(ua)
    ? 'Line'
    : android && /; wv\)/i.test(ua)
    ? 'an app'
    : '';
  const otherBrowser = inApp
    ? ''
    : /SamsungBrowser/i.test(ua)
    ? 'Samsung Internet'
    : /MiuiBrowser|XiaoMi\//i.test(ua)
    ? 'Mi Browser'
    : /UCBrowser/i.test(ua)
    ? 'UC Browser'
    : /OPR\/|Opera|OPiOS/i.test(ua)
    ? 'Opera'
    : /Firefox|FxiOS/i.test(ua)
    ? 'Firefox'
    : /HeyTapBrowser|VivoBrowser|Quark|Phoenix/i.test(ua)
    ? 'this phone browser'
    : '';
  const iosNotSafari = ios && (!!inApp || /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua));
  return { ios, android, inApp, otherBrowser: android || ios ? otherBrowser : '', iosNotSafari };
}

/** Android link that opens this same page in Chrome (falls back to the normal address) */
export function openInChromeUrl(): string {
  const { host, pathname, search, href } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
