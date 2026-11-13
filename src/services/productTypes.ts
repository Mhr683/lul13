// Kinds of products the marketplace sells. The seller picks the kind first (each has its own icon and
// its own listing form), the store shows the kind on every product, lets customers browse by kind and
// asks for the right things when buying (rental days, the text to print, the job details, ...).
// Shared by the store, Seller Center and the server (server.ts order prices, server/marketplace.ts
// listing checks), so the price a customer sees is the price the server charges.

export type ProductType = 'PHYSICAL' | 'DIGITAL' | 'SOFTWARE' | 'SERVICE' | 'WHOLESALE' | 'RENTAL' | 'CUSTOM' | 'SUBSCRIPTION';

export interface WholesaleTier {
  /** From this many pieces ... */
  minQty: number;
  /** ... each piece costs this (PKR) */
  price: number;
}

/** What the seller fills in for the chosen kind (public: shown on the product page) */
export interface ProductTypeDetails {
  // DIGITAL / SOFTWARE
  fileFormat?: string;
  fileSize?: string;
  pages?: number;
  platform?: string;
  version?: string;
  licenseType?: 'LIFETIME' | 'YEARLY' | 'MONTHLY';
  // SERVICE / CUSTOM
  deliveryDays?: number;
  revisions?: number;
  /** What the customer must tell the seller when ordering (e.g. "Name to print", "Your business name") */
  askNote?: string;
  // WHOLESALE
  minOrderQty?: number;
  tiers?: WholesaleTier[];
  // RENTAL (the product price is per day)
  minDays?: number;
  maxDays?: number;
  deposit?: number;
  // SUBSCRIPTION
  billingPeriod?: 'MONTHLY' | 'YEARLY';
  // Every kind: what the customer gets (one item per line)
  includes?: string;
}

/** Private delivery of digital goods, kept in product_private (customers get it only after paying) */
export interface ProductDelivery {
  /** Download link (Google Drive, Dropbox, an uploaded file, ...) */
  link?: string;
  /** How to download / install / redeem */
  note?: string;
  /** Software: one key per sale, handed out in order */
  keys?: string[];
}

/** Choices the customer makes when buying (kept on the cart line and the order item) */
export interface LineOptions {
  /** RENTAL: number of days */
  days?: number;
  /** RENTAL: first day (YYYY-MM-DD) */
  startDate?: string;
  /** SERVICE / CUSTOM: the customer's details (the text to print, the job details, ...) */
  note?: string;
}

export interface ProductTypeInfo {
  id: ProductType;
  label: string;
  /** Short Roman Urdu line for sellers */
  hint: string;
  /** Short English line for customers */
  customerLine: string;
  /** Badge colours on cards (text / background) */
  color: string;
  bg: string;
  /** Goes by courier (address, weight, shipping fee) */
  ships: boolean;
  /** Cash on Delivery possible (otherwise the customer pays first) */
  cod: boolean;
  /** The seller counts pieces in stock (otherwise "how many can you sell" defaults to plenty) */
  countsStock: boolean;
  /** lucide-react icon name (mapped in src/components/ProductTypeIcon.tsx) */
  icon: 'Package' | 'Download' | 'Code2' | 'Briefcase' | 'Boxes' | 'CalendarClock' | 'Palette' | 'Repeat';
}

export const PRODUCT_TYPES: ProductTypeInfo[] = [
  {
    id: 'PHYSICAL',
    label: 'Physical product',
    hint: 'Asli cheez jo courier se ghar jaye: kapre, joote, electronics, ghar ka saaman.',
    customerLine: 'Delivered to your door',
    color: '#0B5E34',
    bg: '#E8F3EC',
    ships: true,
    cod: true,
    countsStock: true,
    icon: 'Package',
  },
  {
    id: 'DIGITAL',
    label: 'Digital product',
    hint: 'E-book, PDF, course, template, crochet pattern: payment ke baad customer ko download link milta hai.',
    customerLine: 'Instant download after payment',
    color: '#1D4ED8',
    bg: '#E8EEFD',
    ships: false,
    cod: false,
    countsStock: false,
    icon: 'Download',
  },
  {
    id: 'SOFTWARE',
    label: 'Software & apps',
    hint: 'Software, app, plugin, theme: download link aur har customer ke liye alag license key.',
    customerLine: 'Download + license key after payment',
    color: '#6D28D9',
    bg: '#F1EAFE',
    ships: false,
    cod: false,
    countsStock: false,
    icon: 'Code2',
  },
  {
    id: 'SERVICE',
    label: 'Service',
    hint: 'Web design, logo, video editing, tuition, repairing: aap apna kaam / hunar bechte hain.',
    customerLine: 'Done for you by the seller',
    color: '#B45309',
    bg: '#FDF1E3',
    ships: false,
    cod: false,
    countsStock: false,
    icon: 'Briefcase',
  },
  {
    id: 'WHOLESALE',
    label: 'Wholesale',
    hint: 'Dukaandaron ko bulk mein: kam az kam miqdar, aur zyada lene par sasti qeemat.',
    customerLine: 'Bulk prices for shops',
    color: '#0F766E',
    bg: '#E2F5F2',
    ships: true,
    cod: true,
    countsStock: true,
    icon: 'Boxes',
  },
  {
    id: 'RENTAL',
    label: 'Rent',
    hint: 'Kiraye par dein: kapre, camera, saaman. Qeemat ek din ki, saath zamanat (deposit).',
    customerLine: 'Rent by the day',
    color: '#BE185D',
    bg: '#FCE7F1',
    ships: true,
    cod: true,
    countsStock: true,
    icon: 'CalendarClock',
  },
  {
    id: 'CUSTOM',
    label: 'Print on demand / custom',
    hint: 'Customer ka naam ya design chhaap kar: shirt, mug, frame, cake topper.',
    customerLine: 'Made with your name or design',
    color: '#C2410C',
    bg: '#FDECE3',
    ships: true,
    cod: true,
    countsStock: true,
    icon: 'Palette',
  },
  {
    id: 'SUBSCRIPTION',
    label: 'Subscription / membership',
    hint: 'Har mahine ya saal ki fees: paid group, classes, membership, mahana box.',
    customerLine: 'Pay monthly or yearly',
    color: '#4338CA',
    bg: '#EAEAFD',
    ships: false,
    cod: false,
    countsStock: false,
    icon: 'Repeat',
  },
];

export const typeInfo = (t?: string): ProductTypeInfo => PRODUCT_TYPES.find((x) => x.id === t) || PRODUCT_TYPES[0];
export const productTypeOf = (p: { productType?: string } | null | undefined): ProductType => typeInfo(p?.productType).id;

/** How many a non-stock kind (download, service, ...) can sell: the seller does not count pieces */
export const OPEN_STOCK = 9999;

const num = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const txt = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Cleans what the seller sent for the kind; returns an error message for missing required parts */
export function cleanTypeDetails(type: ProductType, raw: any, price: number): { details: ProductTypeDetails } | { error: string } {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d: ProductTypeDetails = {};
  const includes = String(r.includes ?? '').trim().slice(0, 1200);
  if (includes) d.includes = includes;
  if (type === 'DIGITAL' || type === 'SOFTWARE') {
    if (txt(r.fileFormat, 40)) d.fileFormat = txt(r.fileFormat, 40);
    if (txt(r.fileSize, 30)) d.fileSize = txt(r.fileSize, 30);
    const pages = num(r.pages, 0, 100000);
    if (pages) d.pages = pages;
  }
  if (type === 'SOFTWARE') {
    d.platform = txt(r.platform, 60);
    if (!d.platform) return { error: 'Software: write which device it runs on (e.g. Windows, Android, Web).' };
    if (txt(r.version, 30)) d.version = txt(r.version, 30);
    d.licenseType = r.licenseType === 'YEARLY' || r.licenseType === 'MONTHLY' ? r.licenseType : 'LIFETIME';
  }
  if (type === 'SERVICE' || type === 'CUSTOM') {
    const days = num(r.deliveryDays, 1, 365);
    if (type === 'SERVICE' && !days) return { error: 'Service: in how many days will the work be ready?' };
    if (days) d.deliveryDays = days;
    const rev = num(r.revisions, 0, 50);
    if (rev !== undefined && type === 'SERVICE') d.revisions = rev;
    d.askNote = txt(r.askNote, 120) || (type === 'CUSTOM' ? 'Name / text to print' : 'Tell the seller what you need');
  }
  if (type === 'WHOLESALE') {
    d.minOrderQty = num(r.minOrderQty, 1, 100000) || 1;
    const tiers: WholesaleTier[] = (Array.isArray(r.tiers) ? r.tiers : [])
      .map((t: any) => ({ minQty: num(t?.minQty, 2, 1000000) || 0, price: Math.round(Number(t?.price) * 100) / 100 }))
      .filter((t: WholesaleTier) => t.minQty > 0 && t.price > 0 && t.price < price)
      .sort((a: WholesaleTier, b: WholesaleTier) => a.minQty - b.minQty)
      .slice(0, 6);
    // Each step must be cheaper than the one before
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].price >= tiers[i - 1].price) return { error: 'Wholesale: a bigger quantity must have a lower price per piece.' };
    }
    if (tiers.length) d.tiers = tiers;
  }
  if (type === 'RENTAL') {
    d.minDays = num(r.minDays, 1, 365) || 1;
    d.maxDays = Math.max(d.minDays, num(r.maxDays, 1, 365) || 30);
    const dep = Math.round(Number(r.deposit) || 0);
    if (dep > 0) d.deposit = Math.min(10_000_000, dep);
  }
  if (type === 'SUBSCRIPTION') {
    d.billingPeriod = r.billingPeriod === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  }
  return { details: d };
}

/** Cleans the private delivery data (download link, note, licence keys) */
export function cleanDelivery(raw: any): ProductDelivery {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out: ProductDelivery = {};
  const given = String(r.link ?? '').trim().slice(0, 980);
  const link = /^http:\/\//i.test(given) ? `https://${given.slice(7)}` : given;
  if (/^https:\/\//i.test(link) || /^\/media\/[a-zA-Z0-9_.-]+$/.test(link)) out.link = link;
  const note = String(r.note ?? '').trim().slice(0, 1500);
  if (note) out.note = note;
  const keys = (Array.isArray(r.keys) ? r.keys : String(r.keys ?? '').split(/\r?\n/))
    .map((k: unknown) => String(k ?? '').trim().slice(0, 200))
    .filter(Boolean);
  if (keys.length) out.keys = Array.from(new Set(keys)).slice(0, 2000) as string[];
  return out;
}

/** Cleans the customer's choices for a cart line of this kind */
export function cleanLineOptions(type: ProductType, raw: any, details?: ProductTypeDetails): LineOptions {
  const r = raw && typeof raw === 'object' ? raw : {};
  const o: LineOptions = {};
  if (type === 'RENTAL') {
    const min = details?.minDays || 1;
    const max = details?.maxDays || 365;
    o.days = Math.min(max, Math.max(min, Math.floor(Number(r.days)) || min));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(r.startDate || ''))) o.startDate = String(r.startDate);
  }
  if (type === 'SERVICE' || type === 'CUSTOM') {
    const note = String(r.note ?? '').trim().slice(0, 600);
    if (note) o.note = note;
  }
  return o;
}

/** Key that keeps cart lines with different choices apart */
export const optionsKey = (o?: LineOptions) => (o ? [o.days || '', o.startDate || '', (o.note || '').toLowerCase()].join('|') : '');

/** Wholesale price per piece for this quantity */
export function wholesaleUnitPrice(base: number, qty: number, details?: ProductTypeDetails): number {
  let price = base;
  for (const t of details?.tiers || []) if (qty >= t.minQty) price = t.price;
  return price;
}

/**
 * Price of ONE unit on a cart line, for this kind and the customer's choices.
 * Returns an error when the line cannot be bought as it is (below the minimum order, missing details).
 */
export function linePrice(
  p: { productType?: string; typeDetails?: ProductTypeDetails; name?: string },
  base: number,
  qty: number,
  options?: LineOptions
): { price: number } | { error: string } {
  const type = productTypeOf(p);
  const d = p.typeDetails || {};
  if (type === 'WHOLESALE') {
    const moq = d.minOrderQty || 1;
    if (qty < moq) return { error: `"${p.name || 'This product'}" is sold wholesale: at least ${moq} pieces.` };
    return { price: wholesaleUnitPrice(base, qty, d) };
  }
  if (type === 'RENTAL') {
    const days = options?.days || d.minDays || 1;
    return { price: Math.round((base * days + (d.deposit || 0)) * 100) / 100 };
  }
  if ((type === 'SERVICE' || type === 'CUSTOM') && !(options?.note && options.note.trim().length >= 2)) {
    return { error: `"${p.name || 'This product'}": please write ${(d.askNote || 'your details').toLowerCase()} before ordering.` };
  }
  return { price: base };
}

/** Short words about the customer's choices, for the cart, order and emails */
export function optionsSummary(type: ProductType, o?: LineOptions, details?: ProductTypeDetails): string {
  if (!o) return '';
  const parts: string[] = [];
  if (type === 'RENTAL' && o.days) {
    parts.push(`${o.days} day${o.days === 1 ? '' : 's'}${o.startDate ? ` from ${o.startDate}` : ''}`);
    if (details?.deposit) parts.push(`incl. refundable deposit PKR ${details.deposit.toLocaleString('en-PK')}`);
  }
  if (o.note) parts.push(`${details?.askNote || 'Note'}: ${o.note}`);
  return parts.join(' · ');
}
