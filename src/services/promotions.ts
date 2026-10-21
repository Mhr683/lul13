// Promotions shared by the store and the server (the server charges the same prices the store shows):
//   - flash deals: a product's flashPrice between flashStartsAt and flashEndsAt
//   - festival campaigns (Eid, Black Friday, New Year...): landing pages with their own products
//   - welcome offer (first order) and referral settings live in the store settings

export type FlashFields = { price: number; compareAtPrice?: number; flashPrice?: number; flashStartsAt?: string; flashEndsAt?: string };

export const MAX_FLASH_DAYS = 7;

export function isFlashActive(p: FlashFields, now = Date.now()) {
  const fp = Number(p.flashPrice);
  if (!(fp > 0) || !(fp < Number(p.price))) return false;
  const start = p.flashStartsAt ? Date.parse(p.flashStartsAt) : 0;
  const end = p.flashEndsAt ? Date.parse(p.flashEndsAt) : NaN;
  return !isNaN(end) && now >= (isNaN(start) ? 0 : start) && now < end;
}

/** The price a customer pays right now */
export function effectivePrice(p: FlashFields, now = Date.now()) {
  return isFlashActive(p, now) ? Number(p.flashPrice) : Number(p.price) || 0;
}

/** Products as the store shows them: a live flash deal becomes the price, the normal price is shown crossed out */
export function withFlashPrices<T extends FlashFields>(products: T[], now = Date.now()): (T & { flashActive?: boolean })[] {
  return products.map((p) =>
    isFlashActive(p, now)
      ? { ...p, price: Number(p.flashPrice), compareAtPrice: Math.max(Number(p.compareAtPrice) || 0, Number(p.price)), flashActive: true }
      : p
  );
}

export type Campaign = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  badge?: string;
  bannerUrl?: string;
  /** Words matched in product name, category and keywords (e.g. "gift, eid, perfume") */
  keywords?: string;
  categories?: string[];
  productIds?: string[];
  /** Only products on sale (old price shown crossed out) */
  onlyDiscounted?: boolean;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
};

export function isCampaignLive(c: Campaign, now = Date.now()) {
  if (!c?.active) return false;
  const s = c.startsAt ? Date.parse(c.startsAt) : 0;
  const e = c.endsAt ? Date.parse(c.endsAt) : Infinity;
  return now >= (isNaN(s) ? 0 : s) && now < (isNaN(e) ? Infinity : e);
}

export function campaignProducts<T extends { id: string; name: string; category: string; seoKeywords?: string; status: string; compareAtPrice?: number; price: number }>(
  c: Campaign,
  products: T[]
) {
  const words = String(c.keywords || '')
    .toLowerCase()
    .split(/[,\n]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const cats = new Set((c.categories || []).map((x) => x.toLowerCase()));
  const ids = new Set(c.productIds || []);
  return products.filter((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (c.onlyDiscounted && !(Number(p.compareAtPrice) > Number(p.price))) return false;
    if (ids.has(p.id)) return true;
    if (cats.has(String(p.category).toLowerCase())) return true;
    if (words.length) {
      const text = `${p.name} ${p.category} ${p.seoKeywords || ''}`.toLowerCase();
      return words.some((w) => text.includes(w));
    }
    return !ids.size && !cats.size && !!c.onlyDiscounted;
  });
}

export type WelcomeOffer = { enabled: boolean; code: string; percent: number; maxDiscount?: number };
export type ReferralSettings = { enabled: boolean; rewardPkr: number; maxPercentOfOrder: number };

export const DEFAULT_WELCOME: WelcomeOffer = { enabled: true, code: 'WELCOME10', percent: 10, maxDiscount: 1000 };
export const DEFAULT_REFERRAL: ReferralSettings = { enabled: true, rewardPkr: 200, maxPercentOfOrder: 30 };
export const DEFAULT_NEW_SELLER_FREE_DAYS = 30;

export const welcomeOf = (s: any): WelcomeOffer => ({ ...DEFAULT_WELCOME, ...(s?.welcomeOffer || {}) });
export const referralOf = (s: any): ReferralSettings => ({ ...DEFAULT_REFERRAL, ...(s?.referral || {}) });
