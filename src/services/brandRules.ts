// Well-known brands. Used to:
//   - ask for a purchase invoice / brand approval before a branded listing goes live (server/policyRules.ts)
//   - stop "No brand" listings from using a brand's name in the title (copies sold under the real
//     brand's name mislead customers and break trademark law)
// Shared by the server and Seller Center so both give the same answer.

export const FAMOUS_BRANDS =
  /\b(apple|iphone|ipad|airpods?|macbook|samsung|galaxy buds|xiaomi|redmi|oppo|vivo|infinix|tecno|realme|oneplus|huawei|honor|sony|jbl|bose|beats|anker|baseus|lenovo|dell|asus|acer|logitech|canon|nikon|philips|remington|braun|panasonic|dyson|gillette|nike|adidas|puma|reebok|new balance|gucci|chanel|dior|versace|armani|prada|louis vuitton|rolex|casio|fossil|tissot|omega|creed|tom ford|calvin klein|hugo boss|ray-?ban|michael kors|coach|zara|levi'?s)\b/i;

// "Cable for iPhone & Samsung", "compatible with Apple Watch": saying what an item fits is allowed
const FITS = /\b(for|compatible with|compatible for|fits|works with|supports|suitable for)\b/i;

/**
 * The first well-known brand a text (e.g. a product name) presents the item as, or ''.
 * A brand named after "for" / "compatible with" / "fits" in the same part of the title (parts are
 * split by "|", "-" or ",") only says what the item fits, so it does not count.
 */
export const famousBrandIn = (text: string) => {
  const re = new RegExp(FAMOUS_BRANDS.source, 'gi');
  const s = String(text || '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const before = s.slice(0, m.index);
    const part = before.split(/[|•]| - /).pop() || '';
    if (!FITS.test(part)) return m[0];
  }
  return '';
};

// Words that claim an item is the real thing; misleading on a no-brand product
const AUTHENTIC_CLAIMS = /\b(100%\s*)?(genuine|original|authentic|certified|official)\b\s*/gi;
// Model words that only make sense after the brand ("AirPods Max", "Galaxy Buds 3 Pro", "Pro 2nd Generation")
// (a number counts only on its own: "20W" after "Apple" is the charger's power, not a model)
const BRAND_TAIL = /^(\s+(max|pro|mini|ultra|plus|lite|\d+(st|nd|rd|th)?(?=\s|$|\|)(\s+gen(eration)?)?|gen(eration)?)(?=\s|$|\|))*/i;

/**
 * The text without brand names that present the item as that brand ("for iPhone" stays), and without
 * "genuine / original" claims. Used by the Shop Coach "Self fix" for no-brand listings.
 */
export const removeBrandNames = (text: string) => {
  let s = String(text || '');
  for (let guard = 0; guard < 10; guard++) {
    const brand = famousBrandIn(s);
    if (!brand) break;
    const re = new RegExp(FAMOUS_BRANDS.source, 'gi');
    let m: RegExpExecArray | null;
    let cut = false;
    while ((m = re.exec(s))) {
      const part = s.slice(0, m.index).split(/[|•]| - /).pop() || '';
      if (FITS.test(part)) continue;
      const tail = s.slice(m.index + m[0].length).match(BRAND_TAIL)?.[0] || '';
      s = s.slice(0, m.index) + s.slice(m.index + m[0].length + tail.length);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  const parts = s
    .replace(AUTHENTIC_CLAIMS, '')
    .split('|')
    .map((part) => part.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/^[\s,•-]+|[\s,•-]+$/g, '').trim())
    .filter(Boolean);
  // A one-word first part left behind ("WHITE", "Plum") reads better at the end
  if (parts.length > 1 && !/\s/.test(parts[0])) parts.push(parts.shift()!);
  return parts.join(' | ');
};

/** Honest line added to the description of a no-brand item that was listed under a brand's name */
export const notOriginalNote = (brand: string) => `Note: this is an economical alternative, not an original ${brand} product.`;

/** True when a listing presents itself as a well-known brand without being a proven branded product */
export const hasBrandNameProblem = (p: { name?: string; shortDescription?: string; info?: { brandType?: string } }, hasProof: boolean) =>
  Boolean(famousBrandIn(`${p.name || ''} ${p.shortDescription || ''}`)) && !(p.info?.brandType === 'BRANDED' && hasProof);

/**
 * The Shop Coach "Self fix" for such a listing (without AI): brand names and "genuine / original"
 * claims taken out of the title and short description, an honest note at the top of the description,
 * and the product marked "No brand".
 */
export const brandFixFor = (p: { name?: string; shortDescription?: string; description?: string; category?: string }) => {
  const brand = famousBrandIn(`${p.name || ''} ${p.shortDescription || ''}`) || 'brand';
  let name = removeBrandNames(p.name || '');
  if (name.length < 5) name = `${p.category || 'Product'} | ${name}`.trim();
  const shortDescription = removeBrandNames(p.shortDescription || '');
  const note = notOriginalNote(brand);
  const body = String(p.description || '').trim();
  const description = body.startsWith('Note: this is an economical alternative') ? body : `${note}\n\n${body}`.trim();
  return {
    brand,
    patch: {
      name: name.slice(0, 190),
      shortDescription: shortDescription.slice(0, 480),
      description: description.slice(0, 4800),
      seoTitle: name.slice(0, 150),
      brandType: 'NONE' as const,
    },
  };
};

export type BrandType = 'BRANDED' | 'NONE';

/** Shown instead of a brand name on "No brand" products */
export const NO_BRAND_LABEL = 'No brand';
