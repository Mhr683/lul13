// Every shop's ID is its vendor ID (e.g. AV-PK-00004), given when the seller is approved
// (server/marketplace.ts). Customers can type it in the store search, and
// anokhashopinghub.shop/s/AV-PK-00004 opens the shop. Used by the browser and the server.

/** "av pk 4", "AVPK00004", "av-pk-00004" → "AV-PK-00004" when it looks like a shop ID, else '' */
export function readShopId(text: string): string {
  const m = /^AV[^A-Z0-9]*([A-Z]{2})[^A-Z0-9]*(\d{1,5})$/.exec(text.toUpperCase().trim());
  return m ? `AV-${m[1]}-${m[2].padStart(5, '0')}` : '';
}

export type ShopHit = { id: string; name: string; code: string; count: number };

/** Every shop with live products, from the catalog (no extra download) */
export function listShops(products: Array<{ status?: string; sellerId?: string; sellerName?: string; vendorId?: string }>): ShopHit[] {
  const map = new Map<string, ShopHit>();
  for (const p of products) {
    if (p.status !== 'ACTIVE' || !p.sellerId) continue;
    const s = map.get(p.sellerId);
    if (s) {
      s.count++;
      if (!s.code && p.vendorId) s.code = String(p.vendorId);
    } else map.set(p.sellerId, { id: p.sellerId, name: String(p.sellerName || 'Shop'), code: String(p.vendorId || ''), count: 1 });
  }
  return [...map.values()];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');

/**
 * Shops matching what the customer typed: the shop ID, or the shop's name ("bkh life style" finds
 * "BKH Lifestyle Enterprises": spaces and spelling of the gaps do not matter). `strong` = every word
 * typed is in the shop's name, or the ID matches, so Enter opens the shop itself.
 */
export function findShops(shops: ShopHit[], query: string, max = 4): Array<ShopHit & { strong: boolean }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const id = readShopId(q);
  const typed = squash(q);
  const words = q.split(/\s+/).map(squash).filter(Boolean);
  return shops
    .map((s) => {
      const name = squash(s.name);
      const byId = !!id && s.code.toUpperCase() === id;
      const allWords = typed.length >= 2 && words.every((w) => name.includes(w));
      const joined = typed.length >= 3 && name.includes(typed);
      return { ...s, strong: byId || allWords || joined, hit: byId || allWords || joined, byId, starts: name.startsWith(typed) };
    })
    .filter((s) => s.hit)
    .sort((a, b) => Number(b.byId) - Number(a.byId) || Number(b.starts) - Number(a.starts) || b.count - a.count)
    .slice(0, max)
    .map(({ id: sid, name, code, count, strong }) => ({ id: sid, name, code, count, strong }));
}
