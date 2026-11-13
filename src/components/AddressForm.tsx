import React, { useMemo } from 'react';
import { ALL_WORLD_COUNTRIES, getCitiesForState, getStatesForCountry, getTehsilsForDistrict } from '../services/addressAndPaymentVerification';
import { checkShippingAddress } from '../services/intlAddress';
import type { SavedAddress } from '../services/customerProfile';

// A delivery address form with the same parts as the checkout (Pakistan: province → city → tehsil
// from the lists; other countries: region + typed city). Used for sign-up and My Account → Addresses.

export interface AddressDraft {
  id?: string;
  label: string;
  name: string;
  phone: string;
  countryCode: string;
  state: string;
  city: string;
  area: string;
  customArea: boolean;
  line1: string;
  line2: string;
  postalCode: string;
  makeDefault?: boolean;
}

export const LABELS = ['Home', 'Office', 'Other'];

export const emptyDraft = (name = '', phone = ''): AddressDraft => ({
  label: 'Home',
  name,
  phone,
  countryCode: 'PK',
  state: 'Punjab',
  city: 'Lahore',
  area: '',
  customArea: false,
  line1: '',
  line2: '',
  postalCode: '',
});

/** Pakistani numbers are shown as 03XXXXXXXXX, others as +E.164 */
const localPhone = (e164: string) => (e164.startsWith('+92') ? `0${e164.slice(3)}` : e164);

export const draftFromSaved = (a: SavedAddress): AddressDraft => ({
  id: a.id,
  label: a.label || 'Home',
  name: a.name || '',
  phone: localPhone(a.phoneNumber || ''),
  countryCode: a.countryCode || 'PK',
  state: a.state || '',
  city: a.city || '',
  area: a.area || '',
  customArea: a.countryCode === 'PK' && !!a.area && !getTehsilsForDistrict(a.city).includes(a.area),
  line1: a.line1 || '',
  line2: a.line2 || '',
  postalCode: a.postalCode || '',
});

export const draftToPayload = (d: AddressDraft) => {
  const country = ALL_WORLD_COUNTRIES.find((c) => c.isoCode === d.countryCode);
  return {
    ...(d.id ? { id: d.id } : {}),
    label: d.label,
    name: d.name.trim(),
    countryCode: d.countryCode,
    countryName: country?.name || d.countryCode,
    currency: country?.currency,
    state: d.state,
    city: d.city.trim(),
    area: d.countryCode === 'PK' ? d.area.trim() : '',
    line1: d.line1.trim(),
    line2: d.line2.trim(),
    postalCode: d.postalCode.trim(),
    phoneNumber: d.phone.trim(),
    makeDefault: !!d.makeDefault,
  };
};

/** The first problem with the address (same rules as the checkout and the server), or '' */
export const draftProblem = (d: AddressDraft): { field: string; message: string } | null => {
  if (d.name.trim().length < 2) return { field: 'name', message: "Enter the receiver's full name." };
  if (d.countryCode === 'PK' && !d.area.trim()) return { field: 'area', message: 'Choose the tehsil / area.' };
  const c = checkShippingAddress(draftToPayload(d));
  return c.ok ? null : { field: c.field, message: c.message };
};

const field = 'w-full px-3 py-2.5 bg-white border border-black/20 rounded-lg text-sm text-[#141413] focus:border-black focus:outline-none';
const lab = 'block text-xs text-[#575653] mb-1';

export const AddressForm: React.FC<{
  value: AddressDraft;
  onChange: (d: AddressDraft) => void;
  /** Sign-up: no label chips (the first address is "Home") */
  hideLabel?: boolean;
  /** Field to outline in red */
  badField?: string;
}> = ({ value: d, onChange, hideLabel, badField }) => {
  const set = (patch: Partial<AddressDraft>) => onChange({ ...d, ...patch });
  const pk = d.countryCode === 'PK';
  const states = useMemo(() => getStatesForCountry(d.countryCode), [d.countryCode]);
  const stateIso = states.find((s) => s.name === d.state)?.isoCode || '';
  const cities = useMemo(() => (pk ? getCitiesForState('PK', stateIso).map((c) => c.name) : []), [pk, stateIso]);
  const tehsils = useMemo(() => (pk && d.city ? getTehsilsForDistrict(d.city) : []), [pk, d.city]);
  const bad = (f: string) => (badField === f ? ' !border-rose-500 ring-1 ring-rose-300' : '');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {!hideLabel && (
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          {LABELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => set({ label: l })}
              className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer ${
                d.label === l ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white text-[#3A3936] border-black/15'
              }`}
            >
              {l === 'Home' ? '🏠 ' : l === 'Office' ? '🏢 ' : '📍 '}
              {l}
            </button>
          ))}
        </div>
      )}
      <div>
        <label className={lab}>Full name (receiver)</label>
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" maxLength={110} className={field + bad('name')} />
      </div>
      <div>
        <label className={lab}>Mobile number</label>
        <input
          value={d.phone}
          onChange={(e) => set({ phone: e.target.value })}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={pk ? '03XXXXXXXXX' : '+971 50 123 4567'}
          className={field + bad('phone')}
        />
      </div>
      <div>
        <label className={lab}>Country</label>
        <select
          value={d.countryCode}
          onChange={(e) => {
            const iso = e.target.value;
            const first = getStatesForCountry(iso)[0]?.name || '';
            set({ countryCode: iso, state: iso === 'PK' ? 'Punjab' : first, city: iso === 'PK' ? 'Lahore' : '', area: '', customArea: false, postalCode: '' });
          }}
          className={field}
        >
          {ALL_WORLD_COUNTRIES.map((c) => (
            <option key={c.isoCode} value={c.isoCode}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={lab}>{pk ? 'Province' : 'State / region'}</label>
        <select
          value={d.state}
          onChange={(e) => {
            const name = e.target.value;
            const iso = states.find((s) => s.name === name)?.isoCode || '';
            set({ state: name, city: pk ? getCitiesForState('PK', iso)[0]?.name || '' : d.city, area: '', customArea: false });
          }}
          className={field}
        >
          {states.map((s) => (
            <option key={s.isoCode} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={lab}>{pk ? 'City / district' : 'City'}</label>
        {pk ? (
          <select value={d.city} onChange={(e) => set({ city: e.target.value, area: '', customArea: false })} className={field + bad('city')}>
            {!cities.includes(d.city) && d.city && <option value={d.city}>{d.city}</option>}
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input value={d.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" className={field + bad('city')} />
        )}
      </div>
      {pk && (
        <div>
          <label className={lab}>Tehsil / area</label>
          {d.customArea ? (
            <div className="flex gap-2">
              <input value={d.area} onChange={(e) => set({ area: e.target.value })} placeholder="Write your area" className={field + bad('area')} />
              <button type="button" onClick={() => set({ customArea: false, area: '' })} className="px-2 text-xs underline text-[#575653] cursor-pointer shrink-0">
                List
              </button>
            </div>
          ) : (
            <select
              value={d.area}
              onChange={(e) => (e.target.value === '__other' ? set({ customArea: true, area: '' }) : set({ area: e.target.value }))}
              className={field + bad('area')}
            >
              <option value="">Choose...</option>
              {tehsils.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__other">Other (write it)</option>
            </select>
          )}
        </div>
      )}
      <div className="sm:col-span-2">
        <label className={lab}>House / flat number, street</label>
        <input
          value={d.line1}
          onChange={(e) => set({ line1: e.target.value })}
          autoComplete="address-line1"
          placeholder="e.g. House 12, Street 4, Block B"
          maxLength={200}
          className={field + bad('line1')}
        />
      </div>
      <div>
        <label className={lab}>Nearby landmark (optional)</label>
        <input value={d.line2} onChange={(e) => set({ line2: e.target.value })} autoComplete="address-line2" maxLength={120} className={field} />
      </div>
      <div>
        <label className={lab}>Postal code {pk ? '(optional)' : ''}</label>
        <input value={d.postalCode} onChange={(e) => set({ postalCode: e.target.value })} autoComplete="postal-code" maxLength={12} className={field + bad('postalCode')} />
      </div>
    </div>
  );
};
