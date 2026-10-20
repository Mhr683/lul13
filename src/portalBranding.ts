// The store, Seller Center and admin console install as three separate apps. Each has its own
// manifest (name, icon, start page and scope); the page head is switched to match the address so
// "Install" / "Add to Home Screen" picks up the right app. server.ts does the same for the first
// HTML response, this covers pages served from the offline cache and in-app navigation.
export type Portal = 'STOREFRONT' | 'ADMIN' | 'SELLER';

interface PortalBranding {
  manifest: string;
  appleIcon: string;
  appleTitle: string;
  themeColor: string;
  title: string;
}

export const PORTAL_BRANDING: Record<Portal, PortalBranding> = {
  STOREFRONT: {
    manifest: '/manifest.webmanifest',
    appleIcon: '/apple-touch-icon.png',
    appleTitle: 'Anokha',
    themeColor: '#141413',
    title: '',
  },
  SELLER: {
    manifest: '/manifest-seller.webmanifest',
    appleIcon: '/seller-apple-touch-icon.png',
    appleTitle: 'Seller',
    themeColor: '#9A3412',
    title: 'Seller Center',
  },
  ADMIN: {
    manifest: '/manifest-admin.webmanifest',
    appleIcon: '/admin-apple-touch-icon.png',
    appleTitle: 'Admin',
    themeColor: '#1E3A8A',
    title: 'Store Admin',
  },
};

export const portalFromLocation = (): Portal => {
  if (typeof window === 'undefined') return 'STOREFRONT';
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/seller' || path.startsWith('/seller/')) return 'SELLER';
  if (path === '/admin' || path.startsWith('/admin/')) return 'ADMIN';
  if (window.location.hash === '#admin') return 'ADMIN';
  return 'STOREFRONT';
};

const setHeadLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (el.getAttribute('href') !== href) el.setAttribute('href', href);
};

const setHeadMeta = (name: string, content: string) => {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (el && el.content !== content) el.content = content;
};

export const applyPortalBranding = (portal: Portal = portalFromLocation()) => {
  if (typeof document === 'undefined') return;
  const b = PORTAL_BRANDING[portal];
  setHeadLink('manifest', b.manifest);
  setHeadLink('apple-touch-icon', b.appleIcon);
  setHeadMeta('apple-mobile-web-app-title', b.appleTitle);
  setHeadMeta('theme-color', b.themeColor);
  if (b.title) document.title = b.title;
};

// Name shown in the install button / instructions for the app on this page
export const portalAppName = (storeName: string) => {
  const portal = portalFromLocation();
  if (portal === 'SELLER') return `${storeName} Seller Center`;
  if (portal === 'ADMIN') return `${storeName} Admin`;
  return storeName;
};
