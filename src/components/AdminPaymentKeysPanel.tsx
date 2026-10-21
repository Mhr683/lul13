import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { PAYMENT_SECRET_FIELDS, type PaymentSecretField } from '../services/paymentSecrets';

// Admin → Settings: JazzCash / Easypaisa merchant IDs and secret keys. They are sent only to the
// server (/api/admin/payment-secrets), which keeps them in settings_private/payment; browsers can
// never read them back, so this panel shows only whether each one is set.

const LABELS: Record<PaymentSecretField, string> = {
  jazzcashMerchantId: 'JazzCash Merchant ID',
  jazzcashPassword: 'JazzCash Password',
  jazzcashIntegritySalt: 'JazzCash Integrity Salt',
  easypaisaStoreId: 'Easypaisa Store ID',
  easypaisaHashKey: 'Easypaisa Hash Key',
};

type Status = { fields: Record<PaymentSecretField, boolean>; updatedAt: string | null };

async function api(init: RequestInit = {}): Promise<Status> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch('/api/admin/payment-secrets', {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as Status;
}

export const AdminPaymentKeysPanel: React.FC = () => {
  const { showToast } = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<Record<PaymentSecretField, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api().then(setStatus).catch((e) => setError(e.message));
  }, []);

  const save = async (body: Partial<Record<PaymentSecretField, string>>) => {
    if (!Object.keys(body).length) return;
    setSaving(true);
    try {
      setStatus(await api({ method: 'POST', body: JSON.stringify(body) }));
      setDraft({});
      showToast('Payment keys saved on the server.');
    } catch (e: any) {
      showToast(`Payment keys were not saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const changed = Object.fromEntries(Object.entries(draft).filter(([, v]) => v && v.trim())) as Partial<
    Record<PaymentSecretField, string>
  >;

  return (
    <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs text-xs text-[#141413]">
      <div className="flex items-center gap-2 font-bold">
        <KeyRound className="w-4 h-4" /> JazzCash / Easypaisa merchant keys
      </div>
      <p className="font-semibold">
        Keys are stored privately on the server and are never shown again or sent to visitors. Leave a box empty to
        keep the saved value.
      </p>
      {error ? (
        <p className="text-red-700 font-semibold">{error}</p>
      ) : !status ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {PAYMENT_SECRET_FIELDS.map((key) => (
              <label key={key} className="block space-y-1">
                <span className="flex items-center justify-between font-bold">
                  {LABELS[key]}
                  <span className={status.fields[key] ? 'text-emerald-800' : 'text-black/50'}>
                    {status.fields[key] ? 'Saved' : 'Not set'}
                    {status.fields[key] && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => save({ [key]: '' })}
                        className="ml-2 underline text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={draft[key] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={status.fields[key] ? '•••••••• (enter a new value to replace)' : ''}
                  className="w-full px-3 py-2 border-2 border-black/20 bg-white font-mono focus:border-black focus:outline-none"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving || !Object.keys(changed).length}
            onClick={() => save(changed)}
            className="px-4 py-2 bg-black text-white font-bold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save keys'}
          </button>
        </>
      )}
    </div>
  );
};
