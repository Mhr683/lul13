import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, Plus, Trash2, Save } from 'lucide-react';
import type { CustomsMode, ShippingZoneConfig } from '../types/store';
import { ALL_WORLD_COUNTRIES } from '../services/addressAndPaymentVerification';
import { formatPKR } from '../services/abstractions';

// Admin → Settings: shipping rates for customers outside Pakistan, one zone per group of
// countries (base fee for the first kg + fee per extra kg, in PKR). A country in no zone gets a
// manual quote, and card payment is not offered there (the total is not final).
// Changes stay in this form until "Save zones": one settings write per save.

const PRESETS: Array<{ name: string; countries: string[]; baseFee: number; perKg: number; days: string }> = [
  { name: 'Gulf (UAE, Saudi, Qatar, Kuwait, Oman, Bahrain)', countries: ['AE', 'SA', 'QA', 'KW', 'OM', 'BH'], baseFee: 4500, perKg: 1500, days: '5–8 business days' },
  { name: 'United Kingdom', countries: ['GB'], baseFee: 6500, perKg: 2500, days: '6–10 business days' },
  { name: 'Europe', countries: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'AT', 'SE', 'DK', 'NO', 'FI', 'PT', 'PL', 'CH', 'GR'], baseFee: 7000, perKg: 2700, days: '7–12 business days' },
  { name: 'USA & Canada', countries: ['US', 'CA'], baseFee: 7500, perKg: 3000, days: '7–12 business days' },
  { name: 'Australia & New Zealand', countries: ['AU', 'NZ'], baseFee: 8000, perKg: 3200, days: '8–14 business days' },
  { name: 'Asia', countries: ['MY', 'SG', 'CN', 'HK', 'JP', 'KR', 'TH', 'ID', 'BD', 'LK', 'NP', 'TR'], baseFee: 5500, perKg: 2000, days: '6–12 business days' },
];

const inputCls = 'w-full px-2.5 py-1.5 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wide text-[#575653] mb-1';
const nameOf = (iso: string) => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === iso)?.name || iso;

const newZone = (p?: (typeof PRESETS)[number]): ShippingZoneConfig => ({
  id: `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name: p?.name || 'New zone',
  countries: p?.countries || [],
  courier: 'DHL Express',
  baseFee: p?.baseFee ?? 6000,
  includedWeightKg: 1,
  perAdditionalKgFee: p?.perKg ?? 2500,
  volumetricDivisor: 5000,
  estimatedDelivery: p?.days || '7–12 business days',
  customsMode: 'DAP',
});

export const AdminShippingZonesEditor: React.FC<{
  zones: ShippingZoneConfig[];
  allowManualQuotes: boolean;
  onSave: (zones: ShippingZoneConfig[], allowManualQuotes: boolean) => Promise<void> | void;
}> = ({ zones, allowManualQuotes, onSave }) => {
  const [draft, setDraft] = useState<ShippingZoneConfig[]>(zones || []);
  const [quotes, setQuotes] = useState(allowManualQuotes);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  // A save elsewhere (another admin) refreshes the form while nothing is being edited
  const savedJson = JSON.stringify(zones || []);
  const dirty = JSON.stringify(draft) !== savedJson || quotes !== allowManualQuotes;
  useEffect(() => {
    if (!dirty) {
      setDraft(zones || []);
      setQuotes(allowManualQuotes);
    }
  }, [savedJson, allowManualQuotes]);

  // A country may be in one zone only (the first match would win at checkout)
  const owner = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of draft) for (const c of z.countries) if (!m.has(c)) m.set(c, z.id);
    return m;
  }, [draft]);
  const problems = useMemo(() => {
    const out: string[] = [];
    draft.forEach((z) => {
      if (!z.name.trim()) out.push('Every zone needs a name.');
      if (!z.countries.length) out.push(`"${z.name || 'Zone'}" has no countries.`);
      if (!(z.baseFee >= 0) || !(z.perAdditionalKgFee >= 0)) out.push(`"${z.name}" has an invalid fee.`);
      if (z.countries.includes('PK')) out.push('Pakistan uses the domestic rates; remove it from the zones.');
    });
    return Array.from(new Set(out));
  }, [draft]);

  const update = (id: string, patch: Partial<ShippingZoneConfig>) => setDraft((d) => d.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const covered = owner.size;

  const save = async () => {
    if (problems.length) return;
    setSaving(true);
    try {
      await onSave(
        draft.map(({ freeShippingThreshold, ...z }) => ({
          ...z,
          name: z.name.trim(),
          courier: z.courier.trim() || 'International courier',
          countries: z.countries.filter((c) => owner.get(c) === z.id),
          // Firestore does not store undefined: the field is left out when there is no threshold
          ...(freeShippingThreshold ? { freeShippingThreshold } : {}),
        })),
        quotes
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.08] pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#86672A] flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> 04. International Shipping Zones ({draft.length} zones · {covered} countries)
        </h2>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || problems.length > 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : dirty ? 'Save zones' : 'Saved'}
        </button>
      </div>

      <p className="text-[11px] text-[#575653] leading-relaxed">
        Fees are in PKR for one seller's parcel: the base fee covers the first kg, then the fee per extra kg. Customers in a country listed
        here see the shipping fee at checkout and can pay by card; countries in no zone{' '}
        {quotes ? 'can still ask for a shipping quote' : 'cannot order'}. Sellers' own shipping fees (Seller Center) replace these rates for their products.
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} />
        Countries without a zone may request a manual shipping quote
      </label>

      {draft.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900">
          No zones yet: every customer outside Pakistan gets a manual quote and cannot pay by card. Add the suggested zones below and adjust the fees.
        </div>
      )}

      <div className="space-y-3">
        {draft.map((z) => {
          const example2kg = z.baseFee + Math.ceil(Math.max(0, 2 - (z.includedWeightKg || 1))) * z.perAdditionalKgFee;
          return (
            <div key={z.id} className="p-3 bg-[#FBFBF9] border border-black/[0.1] space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className={labelCls}>Zone name</label>
                  <input className={inputCls} value={z.name} onChange={(e) => update(z.id, { name: e.target.value })} />
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((d) => d.filter((x) => x.id !== z.id))}
                  className="mt-5 p-1.5 text-rose-700 hover:bg-rose-50 cursor-pointer"
                  title="Remove zone"
                  aria-label={`Remove ${z.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className={labelCls}>Countries</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {z.countries.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update(z.id, { countries: z.countries.filter((x) => x !== c) })}
                      className={`px-2 py-0.5 border text-[11px] cursor-pointer ${
                        owner.get(c) === z.id ? 'bg-white border-black/15' : 'bg-rose-50 border-rose-300 text-rose-800'
                      }`}
                      title={owner.get(c) === z.id ? 'Remove' : 'Already in another zone: remove it here'}
                    >
                      {nameOf(c)} ✕
                    </button>
                  ))}
                </div>
                <select
                  className={inputCls}
                  value={pick[z.id] || ''}
                  onChange={(e) => {
                    const c = e.target.value;
                    if (c && !z.countries.includes(c)) update(z.id, { countries: [...z.countries, c] });
                    setPick((p) => ({ ...p, [z.id]: '' }));
                  }}
                >
                  <option value="">Add a country…</option>
                  {ALL_WORLD_COUNTRIES.filter((c) => c.isoCode !== 'PK' && !owner.has(c.isoCode)).map((c) => (
                    <option key={c.isoCode} value={c.isoCode}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className={labelCls}>Base fee (PKR)</label>
                  <input className={inputCls} inputMode="decimal" value={z.baseFee} onChange={(e) => update(z.id, { baseFee: num(e.target.value) })} />
                </div>
                <div>
                  <label className={labelCls}>Included kg</label>
                  <input className={inputCls} inputMode="decimal" value={z.includedWeightKg} onChange={(e) => update(z.id, { includedWeightKg: Math.max(0.1, num(e.target.value)) })} />
                </div>
                <div>
                  <label className={labelCls}>Per extra kg (PKR)</label>
                  <input className={inputCls} inputMode="decimal" value={z.perAdditionalKgFee} onChange={(e) => update(z.id, { perAdditionalKgFee: num(e.target.value) })} />
                </div>
                <div>
                  <label className={labelCls}>Free above (PKR)</label>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder="none"
                    value={z.freeShippingThreshold ?? ''}
                    onChange={(e) => update(z.id, { freeShippingThreshold: e.target.value.trim() ? num(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Courier</label>
                  <input className={inputCls} value={z.courier} onChange={(e) => update(z.id, { courier: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Delivery time</label>
                  <input className={inputCls} value={z.estimatedDelivery} onChange={(e) => update(z.id, { estimatedDelivery: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Customs duties</label>
                  <select className={inputCls} value={z.customsMode} onChange={(e) => update(z.id, { customsMode: e.target.value as CustomsMode })}>
                    <option value="DAP">DAP: the customer pays import duties on arrival</option>
                    <option value="DDP">DDP: the store pays duties (include them in the fees)</option>
                  </select>
                </div>
              </div>
              <div className="text-[11px] text-[#575653]">
                Example: a 2 kg parcel costs <strong>{formatPKR(example2kg)}</strong>
                {z.freeShippingThreshold ? `, free for orders above ${formatPKR(z.freeShippingThreshold)}` : ''}.
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDraft((d) => [...d, newZone()])}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-black/20 bg-white text-xs font-bold cursor-pointer hover:bg-[#F7F6F2]"
        >
          <Plus className="w-3.5 h-3.5" /> Empty zone
        </button>
        {PRESETS.filter((p) => !draft.some((z) => z.name === p.name)).map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setDraft((d) => [...d, newZone({ ...p, countries: p.countries.filter((c) => !owner.has(c)) })])}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-black/25 bg-white text-xs cursor-pointer hover:bg-[#F7F6F2]"
            title={`Suggested: ${formatPKR(p.baseFee)} + ${formatPKR(p.perKg)}/kg — adjust to your courier's rates`}
          >
            <Plus className="w-3.5 h-3.5" /> {p.name.split(' (')[0]}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[#787774]">Suggested fees are a starting point: check them against your courier's current rates before saving.</p>

      {problems.length > 0 && (
        <ul className="p-2.5 bg-rose-50 border border-rose-200 text-[11px] text-rose-800 list-disc pl-5">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
