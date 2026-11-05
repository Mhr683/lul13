import React, { useEffect, useState } from 'react';
import { Truck, CheckCircle2, RefreshCw } from 'lucide-react';
import { COURIER_CATALOG, MANUAL_COURIERS, type CourierId } from '../services/courierCatalog';
import { courierApi } from '../services/courierClient';

// Admin → Orders → Courier accounts. Paste a courier's API key once; from then on the store and all
// sellers book parcels with one button, labels print from the order, and delivered / returned
// parcels update the order by themselves (server/couriers.ts).

interface Settings {
  couriers: Array<{ id: CourierId; enabled: boolean; values: Record<string, string> }>;
  defaultCourier: CourierId | null;
  allowSellers: boolean;
  sellerPickup: Record<string, Partial<Record<CourierId, string>>>;
  lastSyncAt: string | null;
  lastSyncNote: string;
}
type Pickup = { code: string; label: string };

export const AdminCouriersPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [pickups, setPickups] = useState<Record<string, Pickup[]>>({});
  const [sellers, setSellers] = useState<Array<{ id: string; shopName: string }>>([]);
  const [error, setError] = useState('');

  const apply = (data: Settings) => {
    setS(data);
    setDrafts(Object.fromEntries(data.couriers.map((c) => [c.id, { ...c.values }])));
  };

  useEffect(() => {
    if (!open || s) return;
    courierApi<Settings>('/api/couriers/settings').then((data) => {
      apply(data);
      // Pickup address lists of the connected couriers (asked from the courier, no database reads)
      for (const c of COURIER_CATALOG) {
        if (!c.pickupField || !data.couriers.find((x) => x.id === c.id)?.enabled) continue;
        courierApi<{ pickupAddresses?: Pickup[] }>('/api/couriers/test', { method: 'POST', body: JSON.stringify({ id: c.id }) })
          .then((t) => t.pickupAddresses && setPickups((p) => ({ ...p, [c.id]: t.pickupAddresses! })))
          .catch(() => {});
      }
    }, (e) => setError(e.message));
    courierApi<any>('/api/admin/sellers')
      .then((d) => {
        const list: any[] = Array.isArray(d?.sellers) ? d.sellers : Array.isArray(d) ? d : [];
        setSellers(list.filter((x) => x.status === 'APPROVED' || !x.status).map((x) => ({ id: String(x.id || x.ownerUid), shopName: String(x.shopName || x.id) })));
      })
      .catch(() => {});
  }, [open, s]);

  const save = async (id: CourierId, enabled: boolean) => {
    setBusy(id);
    setMsg((m) => ({ ...m, [id]: { ok: true, text: '' } }));
    try {
      const data = await courierApi<Settings>('/api/couriers/settings', {
        method: 'POST',
        body: JSON.stringify({ id, enabled, values: drafts[id] || {} }),
      });
      apply(data);
      if (enabled) {
        // A new key is tested at once, so a wrong key shows up now and not at the first order
        const t = await courierApi<{ message: string; pickupAddresses?: Pickup[] }>('/api/couriers/test', { method: 'POST', body: JSON.stringify({ id }) });
        setMsg((m) => ({ ...m, [id]: { ok: true, text: t.message } }));
        if (t.pickupAddresses) setPickups((p) => ({ ...p, [id]: t.pickupAddresses! }));
      } else setMsg((m) => ({ ...m, [id]: { ok: true, text: 'Saved.' } }));
    } catch (e: any) {
      setMsg((m) => ({ ...m, [id]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const saveGeneral = async (patch: Record<string, unknown>) => {
    setBusy('general');
    try {
      apply(await courierApi<Settings>('/api/couriers/settings', { method: 'POST', body: JSON.stringify(patch) }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    try {
      const r = await courierApi<{ note: string }>('/api/couriers/sync', { method: 'POST' });
      setS((x) => (x ? { ...x, lastSyncAt: new Date().toISOString(), lastSyncNote: r.note } : x));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const connected = s?.couriers.filter((c) => c.enabled) || [];
  const pickupCouriers = COURIER_CATALOG.filter((c) => c.pickupField && connected.some((x) => x.id === c.id));

  return (
    <div className="bg-white border border-black/10">
      <button type="button" onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer">
        <span className="font-semibold text-sm inline-flex items-center gap-2">
          <Truck className="w-4 h-4" /> Courier accounts (PostEx, Leopards, Trax)
        </span>
        <span className="text-xs text-[#575653]">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 text-xs">
          <p className="text-[#575653]">
            Paste the API key of your courier account and press <strong>Save &amp; connect</strong>. After that, every order gets a{' '}
            <strong>Book &amp; ship</strong> button (for you and your sellers): the courier books the parcel, the tracking number and the
            label come back by themselves, and the order changes to <strong>Delivered</strong> or <strong>Returned</strong> when the
            courier reports it (checked every 2 hours).
          </p>
          {error && <p className="text-rose-700">{error}</p>}
          {!s ? (
            <p className="text-[#575653]">Loading...</p>
          ) : (
            <>
              {COURIER_CATALOG.map((c) => {
                const row = s.couriers.find((x) => x.id === c.id)!;
                const d = drafts[c.id] || {};
                const m = msg[c.id];
                return (
                  <div key={c.id} className={`p-3 border ${row.enabled ? 'border-emerald-400 bg-emerald-50/40' : 'border-black/15'} space-y-2`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm">{c.label}</span>
                      {row.enabled && (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </span>
                      )}
                    </div>
                    <p className="text-[#575653]">Where to find the key: {c.howTo}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {c.fields.map((f) => (
                        <label key={f.key} className="space-y-1">
                          <span className="font-semibold">
                            {f.label}
                            {f.required ? ' *' : ''}
                          </span>
                          {f.key === c.pickupField && pickups[c.id]?.length ? (
                            <select
                              value={d[f.key] || ''}
                              onChange={(e) => setDrafts((x) => ({ ...x, [c.id]: { ...d, [f.key]: e.target.value } }))}
                              className="w-full px-2 py-1.5 border border-black/20 bg-white"
                            >
                              <option value="">— choose —</option>
                              {pickups[c.id].map((p) => (
                                <option key={p.code} value={p.code}>
                                  {p.code} · {p.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={f.secret && !String(d[f.key] || '').startsWith('saved ') ? 'password' : 'text'}
                              value={d[f.key] || ''}
                              onFocus={(e) => f.secret && String(d[f.key] || '').startsWith('saved ') && e.target.select()}
                              onChange={(e) => setDrafts((x) => ({ ...x, [c.id]: { ...d, [f.key]: e.target.value } }))}
                              placeholder={f.secret ? 'Paste here' : ''}
                              autoComplete="off"
                              className="w-full px-2 py-1.5 border border-black/20 bg-white font-mono"
                            />
                          )}
                          {f.hint && <span className="block text-[#575653]">{f.hint}</span>}
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === c.id}
                        onClick={() => save(c.id, true)}
                        className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {busy === c.id ? 'Connecting...' : row.enabled ? 'Save & test again' : 'Save & connect'}
                      </button>
                      {row.enabled && (
                        <button
                          type="button"
                          disabled={busy === c.id}
                          onClick={() => save(c.id, false)}
                          className="px-3 py-1.5 border border-black/30 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Turn off
                        </button>
                      )}
                      {m?.text && <span className={m.ok ? 'text-emerald-800' : 'text-rose-700'}>{m.text}</span>}
                    </div>
                  </div>
                );
              })}

              {connected.length > 0 && (
                <div className="p-3 border border-black/15 space-y-3">
                  <div className="font-bold text-sm">For all orders</div>
                  <label className="flex items-center gap-2">
                    Courier chosen first:
                    <select
                      value={s.defaultCourier || ''}
                      disabled={busy === 'general'}
                      onChange={(e) => saveGeneral({ defaultCourier: e.target.value })}
                      className="px-2 py-1.5 border border-black/20 bg-white"
                    >
                      {connected.map((c) => (
                        <option key={c.id} value={c.id}>
                          {COURIER_CATALOG.find((x) => x.id === c.id)?.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.allowSellers}
                      disabled={busy === 'general'}
                      onChange={(e) => saveGeneral({ allowSellers: e.target.checked })}
                    />
                    Sellers can book parcels with these courier accounts (each from their own pickup address)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy === 'sync'}
                      onClick={syncNow}
                      className="px-3 py-1.5 border border-black/30 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> {busy === 'sync' ? 'Checking...' : 'Check deliveries now'}
                    </button>
                    {s.lastSyncAt && (
                      <span className="text-[#575653]">
                        Last check {new Date(s.lastSyncAt).toLocaleString('en-PK')}: {s.lastSyncNote}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {pickupCouriers.length > 0 && sellers.length > 0 && (
                <SellerPickupTable
                  sellers={sellers}
                  couriers={pickupCouriers.map((c) => ({ id: c.id, label: c.label }))}
                  value={s.sellerPickup}
                  pickups={pickups}
                  busy={busy === 'general'}
                  onSave={(sellerPickup) => saveGeneral({ sellerPickup })}
                />
              )}

              <p className="text-[#575653]">
                Other couriers ({MANUAL_COURIERS.join(', ')}) still work by typing the tracking number on the order. Send me the API
                details of any of them when you open that account, and it can be connected the same way.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Each seller's pickup address in the courier's portal (multi-vendor: the rider collects from the seller)
const SellerPickupTable: React.FC<{
  sellers: Array<{ id: string; shopName: string }>;
  couriers: Array<{ id: CourierId; label: string }>;
  value: Record<string, Partial<Record<CourierId, string>>>;
  pickups: Record<string, Pickup[]>;
  busy: boolean;
  onSave: (v: Record<string, Partial<Record<CourierId, string>>>) => void;
}> = ({ sellers, couriers, value, pickups, busy, onSave }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="p-3 border border-black/15 space-y-2">
      <div className="font-bold text-sm">Seller pickup addresses</div>
      <p className="text-[#575653]">
        Add each seller's address as a pickup address in the courier's portal, then choose it here. Empty = the default pickup address
        above.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className="py-1 pr-2">Seller</th>
              {couriers.map((c) => (
                <th key={c.id} className="py-1 pr-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sellers.map((sl) => (
              <tr key={sl.id} className="border-b border-black/[0.06]">
                <td className="py-1 pr-2">{sl.shopName}</td>
                {couriers.map((c) => {
                  const cur = v[sl.id]?.[c.id] || '';
                  const set = (val: string) => setV((x) => ({ ...x, [sl.id]: { ...(x[sl.id] || {}), [c.id]: val } }));
                  return (
                    <td key={c.id} className="py-1 pr-2">
                      {pickups[c.id]?.length ? (
                        <select value={cur} onChange={(e) => set(e.target.value)} className="px-2 py-1 border border-black/20 bg-white max-w-[220px]">
                          <option value="">Default</option>
                          {pickups[c.id].map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.code} · {p.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={cur} onChange={(e) => set(e.target.value)} placeholder="Default" className="w-28 px-2 py-1 border border-black/20 font-mono" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={busy} onClick={() => onSave(v)} className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer disabled:opacity-50">
        Save pickup addresses
      </button>
    </div>
  );
};
