// Where a product ships to and what the seller charges for it. Shared by the Seller Center form,
// the storefront (badges, "ships to you" ordering) and the server (orders/create), so all three agree.
//
// Fees are in PKR like every price in the store. A product without shipping settings ships
// wherever the store ships, at the store's own rates.

export type ShipsTo = 'LOCAL' | 'WORLDWIDE' | 'LIST';

export interface ProductShipping {
  /** LOCAL = only inside the warehouse country, WORLDWIDE = anywhere, LIST = the warehouse country plus `countries` */
  shipsTo: ShipsTo;
  /** ISO codes the product ships to besides its own country (LIST only) */
  countries?: string[];
  /** Seller's fee for a parcel inside the warehouse country (PKR); empty = the store's rates */
  localFee?: number;
  /** Seller's fee for a parcel to another country (PKR); empty = the store's rates */
  intlFee?: number;
  /** Days the seller needs to hand the parcel to the courier */
  handlingDays?: number;
}

type Shippable = { shipsFromCountry?: string; shipping?: ProductShipping; sellerId?: string };

export const MAX_SHIP_COUNTRIES = 60;

/** Country the product leaves from (the store's own products ship from Pakistan) */
export const originOf = (p: Shippable) => String(p.shipsFromCountry || 'PK').toUpperCase();

const fee = (v: unknown) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/** Checks the shipping settings a seller sends; `value` undefined = no settings (store rates) */
export function cleanProductShipping(raw: any): { value?: ProductShipping; error?: string } {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'object') return { error: 'Shipping settings are not valid.' };
  const shipsTo: ShipsTo = raw.shipsTo === 'LOCAL' || raw.shipsTo === 'LIST' ? raw.shipsTo : 'WORLDWIDE';
  const countries =
    shipsTo === 'LIST'
      ? Array.from(
          new Set(
            (Array.isArray(raw.countries) ? raw.countries : [])
              .map((c: unknown) => String(c || '').trim().toUpperCase())
              .filter((c: string) => /^[A-Z]{2}$/.test(c))
          )
        ).slice(0, MAX_SHIP_COUNTRIES) as string[]
      : undefined;
  if (shipsTo === 'LIST' && !countries?.length) return { error: 'Choose at least one country this product ships to.' };
  const localFee = fee(raw.localFee);
  const intlFee = shipsTo === 'LOCAL' ? undefined : fee(raw.intlFee);
  if (Number.isNaN(localFee) || Number.isNaN(intlFee)) return { error: 'Shipping fees must be numbers (0 = free shipping).' };
  if ((localFee ?? 0) > 500000 || (intlFee ?? 0) > 500000) return { error: 'The shipping fee is too high.' };
  const days = Math.floor(Number(raw.handlingDays));
  const value: ProductShipping = { shipsTo };
  if (countries) value.countries = countries;
  if (localFee !== undefined) value.localFee = localFee;
  if (intlFee !== undefined) value.intlFee = intlFee;
  if (days >= 1 && days <= 30) value.handlingDays = days;
  // "Anywhere, at the store's rates" is the same as no settings
  if (shipsTo === 'WORLDWIDE' && Object.keys(value).length === 1) return {};
  return { value };
}

/** Can this product be delivered to the country? */
export function shipsToCountry(p: Shippable, destIso: string): boolean {
  const dest = String(destIso || 'PK').toUpperCase();
  const s = p.shipping;
  if (!s || s.shipsTo === 'WORLDWIDE') return true;
  if (dest === originOf(p)) return true;
  return s.shipsTo === 'LIST' && Array.isArray(s.countries) && s.countries.includes(dest);
}

/** The seller's own fee for this destination, or undefined when the store's rates apply */
export function sellerFeeFor(p: Shippable, destIso: string): number | undefined {
  const s = p.shipping;
  if (!s) return undefined;
  const local = String(destIso || 'PK').toUpperCase() === originOf(p);
  const v = local ? s.localFee : s.intlFee;
  return typeof v === 'number' && v >= 0 ? v : undefined;
}

/**
 * Smart routing for the storefront: 2 = ships from a warehouse in the visitor's country,
 * 1 = ships to the visitor's country from abroad, 0 = does not ship there.
 */
export function routingScore(p: Shippable, visitorIso: string): number {
  const v = String(visitorIso || '').toUpperCase();
  if (!v) return 1;
  if (originOf(p) === v) return 2;
  return shipsToCountry(p, v) ? 1 : 0;
}
