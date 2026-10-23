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

export type BrandType = 'BRANDED' | 'NONE';

/** Shown instead of a brand name on "No brand" products */
export const NO_BRAND_LABEL = 'No brand';
