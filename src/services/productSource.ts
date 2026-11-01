// Where a listed product really comes from: the store's own direct seller, or another app it is
// sourced from (Oshi, YourMart, HHC, Markaz, ...). Saved as supplierName in product_private and
// copied to order_private with each order, so the seller sees it on the order; customers never do.

export const DIRECT_SOURCE = 'Direct seller';
export const SOURCE_APPS = ['Oshi', 'YourMart', 'HHC', 'Markaz'];

const ALIASES: [RegExp, string][] = [
  [/\boshi\b/i, 'Oshi'],
  [/your\s*mart/i, 'YourMart'],
  [/\bh\.?\s*h\.?\s*c\b/i, 'HHC'],
  [/markaz/i, 'Markaz'],
  [/^(own|own stock|direct|direct seller|self|me|seller|-)$/i, DIRECT_SOURCE],
];

/** "oshi.pk", "Your Mart", "h.h.c" -> Oshi / YourMart / HHC; empty or "Own Stock" -> Direct seller */
export function normalizeSource(raw: unknown): string {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return DIRECT_SOURCE;
  for (const [re, name] of ALIASES) if (re.test(v)) return name;
  return v.slice(0, 80);
}

export const isDirectSource = (raw: unknown) => normalizeSource(raw) === DIRECT_SOURCE;
