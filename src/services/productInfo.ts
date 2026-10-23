// Extra product details shown on the product page: identification / specifications and
// "How to use", "Care" and "User manual". Stored on the product as one map, products/{id}.info
// (firestore.rules allows the "info" key); cleaned by the server before saving.

export interface ProductInfo {
  /** Chosen by the seller when listing: a real brand, or no brand (generic) */
  brandType?: 'BRANDED' | 'NONE';
  /** Barcode / GTIN / EAN printed on the pack */
  barcode?: string;
  modelNumber?: string;
  material?: string;
  countryOfOrigin?: string;
  /** e.g. "6 months brand warranty" or "No warranty" */
  warranty?: string;
  /** Steps, one per line */
  howToUse?: string;
  /** Usage / unboxing video: YouTube, Vimeo or an uploaded MP4 */
  howToUseVideoUrl?: string;
  /** Care / cleaning guidelines, one per line */
  careInstructions?: string;
  /** User manual (uploaded PDF) */
  manualUrl?: string;
}

const LIMITS: Record<keyof ProductInfo, number> = {
  brandType: 10,
  barcode: 40,
  modelNumber: 60,
  material: 120,
  countryOfOrigin: 60,
  warranty: 120,
  howToUse: 3000,
  howToUseVideoUrl: 980,
  careInstructions: 1500,
  manualUrl: 980,
};

export const PRODUCT_INFO_KEYS = Object.keys(LIMITS) as (keyof ProductInfo)[];

/** Ready-made care lines sellers can add with one tap */
export const CARE_PRESETS = [
  'Hand wash only',
  'Machine wash cold',
  'Do not bleach',
  'Store in a cool, dry place',
  'Avoid direct sunlight',
  'Keep away from water',
  'Wipe clean with a soft dry cloth',
  'Keep out of reach of children',
];

const isLink = (u: string) => /^https:\/\//i.test(u) || /^\/media\/[a-zA-Z0-9_.-]+$/.test(u);

/** Cleans what a form sent. Returns { info } (empty fields dropped) or { error } for a bad link. */
export function cleanProductInfo(raw: unknown): { info: ProductInfo } | { error: string } {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const info: ProductInfo = {};
  for (const key of PRODUCT_INFO_KEYS) {
    const v = String(src[key] ?? '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, LIMITS[key]);
    if (v) (info as Record<string, string>)[key] = v;
  }
  if (info.barcode) info.barcode = info.barcode.replace(/[^0-9A-Za-z-]/g, '');
  if (info.brandType && info.brandType !== 'BRANDED' && info.brandType !== 'NONE') delete info.brandType;
  if (info.howToUseVideoUrl && !isLink(info.howToUseVideoUrl)) return { error: 'The "How to use" video link must start with https://' };
  if (info.manualUrl && !isLink(info.manualUrl)) return { error: 'The user manual link must start with https://' };
  return { info };
}

/** Lines of a multi-line field, without empty lines or leading "1." / "-" markers */
export const infoLines = (text?: string) =>
  String(text || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
