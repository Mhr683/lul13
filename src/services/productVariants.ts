import type { ProductVariant } from '../types/store';

// Product variants (colour, size, ...): each has a name, its own stock and optionally its own price.
// Saved on the product as `variants`; the product's stock is then the sum of the variants' stock.
// The server checks the choice and the price when an order is placed (server.ts /api/orders/create).

export const MAX_VARIANTS = 30;

/** Cleans what the Seller Center form sent: names kept unique, empty rows dropped */
export function cleanVariants(raw: unknown, basePrice: number): { variants: ProductVariant[] } | { error: string } {
  if (!Array.isArray(raw)) return { variants: [] };
  const seen = new Set<string>();
  const variants: ProductVariant[] = [];
  for (const r of raw.slice(0, MAX_VARIANTS)) {
    const name = String((r as any)?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `The variant "${name}" is listed twice.` };
    seen.add(key);
    const priceRaw = String((r as any)?.price ?? '').trim();
    const price = priceRaw === '' ? undefined : Math.round(Number(priceRaw) * 100) / 100;
    if (price !== undefined && !(price > 0)) return { error: `Enter a price for "${name}", or leave it empty to use ${basePrice}.` };
    const stock = Math.max(0, Math.floor(Number((r as any)?.stock) || 0));
    const sku = String((r as any)?.sku ?? '').trim().replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 60);
    const id = String((r as any)?.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20) || Math.random().toString(36).slice(2, 10);
    variants.push({ id, name, stock, ...(price !== undefined && price !== basePrice ? { price } : {}), ...(sku ? { sku } : {}) });
  }
  return { variants };
}

/** The variant with this name (case does not matter) */
export const findVariant = (p: { variants?: ProductVariant[] }, name: unknown) => {
  const n = String(name ?? '').trim().toLowerCase();
  return n ? (p.variants || []).find((v) => v.name.toLowerCase() === n) : undefined;
};

export const hasVariants = (p: { variants?: ProductVariant[] }) => Array.isArray(p.variants) && p.variants.length > 0;

/** Price of a variant: its own, otherwise the product's current price */
export const variantPrice = (productPrice: number, v?: ProductVariant) => (v && typeof v.price === 'number' && v.price > 0 ? v.price : productPrice);
