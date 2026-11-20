// Every shop's short ID (e.g. AS-7K2QX9), shown on the shop page and in Seller Center. Customers can
// type it in the store search, and anokhashopinghub.shop/s/AS-7K2QX9 opens the shop.
// Worked out from the seller's account id, so nothing is stored or read from the database; the same
// account always gets the same ID. Used by the browser and the server.

const CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O (they look like 1 / 0)

export function shopCode(sellerId: string): string {
  // FNV-1a hash of the account id
  let h = 0x811c9dc5;
  for (let i = 0; i < sellerId.length; i++) {
    h ^= sellerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // A second, differently seeded hash, so the ID has enough letters to stay unique
  let g = 0x9e3779b9;
  for (let i = sellerId.length - 1; i >= 0; i--) {
    g ^= sellerId.charCodeAt(i);
    g = Math.imul(g, 0x85ebca6b) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 6; i++) {
    const n = i < 3 ? h : g;
    out += CHARS[Math.floor(n / Math.pow(CHARS.length, i % 3)) % CHARS.length];
  }
  return `AS-${out}`;
}

/** "as 7k2qx9", "AS7K2QX9", "7k2qx9" → "AS-7K2QX9" when it looks like a shop ID, else '' */
export function readShopCode(text: string): string {
  const t = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefixed = t.startsWith('AS') && t.length === 8;
  const body = prefixed ? t.slice(2) : t.length === 6 ? t : '';
  // Without "AS" only a 6-character word with a number counts (so "SHIRTS" stays a normal search)
  if (!body || !/^[0-9A-HJ-NP-Z]{6}$/.test(body) || (!prefixed && !/\d/.test(body))) return '';
  return `AS-${body}`;
}
