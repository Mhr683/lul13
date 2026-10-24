import React, { useState } from 'react';
import { ALL_WORLD_COUNTRIES } from '../services/addressAndPaymentVerification';
import { MAX_SHIP_COUNTRIES, type ShipsTo } from '../services/productShipping';

// Seller Center product form: where this product ships and the seller's own shipping fees.
// Empty fees = the store's standard rates. The server checks the same rules (productShipping.ts).

export type ShippingForm = {
  shipsTo: ShipsTo;
  countries: string[];
  localFee: string;
  intlFee: string;
  handlingDays: string;
};

export const emptyShipping: ShippingForm = { shipsTo: 'WORLDWIDE', countries: [], localFee: '', intlFee: '', handlingDays: '' };

export const shippingFormOf = (s: any): ShippingForm => ({
  shipsTo: s?.shipsTo === 'LOCAL' || s?.shipsTo === 'LIST' ? s.shipsTo : 'WORLDWIDE',
  countries: Array.isArray(s?.countries) ? s.countries : [],
  localFee: s?.localFee !== undefined ? String(s.localFee) : '',
  intlFee: s?.intlFee !== undefined ? String(s.intlFee) : '',
  handlingDays: s?.handlingDays ? String(s.handlingDays) : '',
});

const nameOf = (iso: string) => {
  const c = ALL_WORLD_COUNTRIES.find((x) => x.isoCode === iso);
  return c ? `${c.flag} ${c.name}` : iso;
};

const inputCls = 'w-full px-3 py-2 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';

export const ProductShippingEditor: React.FC<{
  value: ShippingForm;
  onChange: (v: ShippingForm) => void;
  /** The seller's warehouse country (ISO) */
  fromCountry?: string;
}> = ({ value, onChange, fromCountry = 'PK' }) => {
  const [pick, setPick] = useState('');
  const set = (patch: Partial<ShippingForm>) => onChange({ ...value, ...patch });
  const addCountry = (iso: string) => {
    if (!iso || iso === fromCountry || value.countries.includes(iso) || value.countries.length >= MAX_SHIP_COUNTRIES) return;
    set({ countries: [...value.countries, iso] });
    setPick('');
  };
  return (
    <div className="sm:col-span-2 pt-2 border-t border-black/10 space-y-3">
      <div>
        <div className="text-xs font-bold text-[#141413]">Shipping</div>
        <p className="text-[11px] text-[#575653]">
          This product ships from your warehouse in <strong>{nameOf(fromCountry)}</strong>. Customers in that country see it first;
          customers elsewhere see it only where you ship. Leave a fee empty to use the store's standard rates; 0 = free shipping.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['LOCAL', `Only inside ${nameOf(fromCountry)}`],
            ['WORLDWIDE', 'Worldwide'],
            ['LIST', 'Selected countries'],
          ] as Array<[ShipsTo, string]>
        ).map(([k, label]) => (
          <label
            key={k}
            className={`px-3 py-1.5 border text-xs font-bold cursor-pointer ${value.shipsTo === k ? 'bg-black text-white border-black' : 'bg-white border-black/15'}`}
          >
            <input type="radio" className="sr-only" checked={value.shipsTo === k} onChange={() => set({ shipsTo: k })} />
            {label}
          </label>
        ))}
      </div>
      {value.shipsTo === 'LIST' && (
        <div>
          <label className={labelCls}>Countries you ship to (besides {nameOf(fromCountry)})</label>
          <div className="flex gap-2">
            <select className={inputCls} value={pick} onChange={(e) => addCountry(e.target.value)}>
              <option value="">Add a country...</option>
              {ALL_WORLD_COUNTRIES.filter((c) => c.isoCode !== fromCountry && !value.countries.includes(c.isoCode)).map((c) => (
                <option key={c.isoCode} value={c.isoCode}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {value.countries.map((iso) => (
              <button
                key={iso}
                type="button"
                onClick={() => set({ countries: value.countries.filter((c) => c !== iso) })}
                className="px-2 py-1 bg-[#F7F6F2] border border-black/10 text-[11px] font-semibold hover:bg-rose-50 cursor-pointer"
                title="Remove"
              >
                {nameOf(iso)} ✕
              </button>
            ))}
            {!value.countries.length && <span className="text-[11px] text-rose-700">Add at least one country.</span>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Fee inside {nameOf(fromCountry)} (PKR)</label>
          <input className={inputCls} value={value.localFee} onChange={(e) => set({ localFee: e.target.value })} inputMode="decimal" placeholder="Store rate" />
        </div>
        {value.shipsTo !== 'LOCAL' && (
          <div>
            <label className={labelCls}>International fee (PKR)</label>
            <input className={inputCls} value={value.intlFee} onChange={(e) => set({ intlFee: e.target.value })} inputMode="decimal" placeholder="Store rate" />
          </div>
        )}
        <div>
          <label className={labelCls}>Dispatch time (days)</label>
          <input className={inputCls} value={value.handlingDays} onChange={(e) => set({ handlingDays: e.target.value })} inputMode="numeric" placeholder="e.g. 2" />
        </div>
      </div>
      {fromCountry !== 'PK' && (value.localFee.trim() === '' || (value.shipsTo !== 'LOCAL' && value.intlFee.trim() === '')) && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1.5">
          The store's standard rates are for parcels from Pakistan. Enter your own fees, otherwise customers have to ask for a shipping quote first.
        </p>
      )}
      <p className="text-[10px] text-[#787774]">
        One parcel per order from your shop: if a customer buys several of your products, the highest of their fees is charged once.
      </p>
    </div>
  );
};
