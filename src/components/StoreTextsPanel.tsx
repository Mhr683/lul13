import React, { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { StoreSettings } from '../types/store';

type TextKey =
  | 'storeName'
  | 'announcementText'
  | 'heroEyebrow'
  | 'heroTitle'
  | 'heroSubtitle'
  | 'heroImageUrl'
  | 'heroHighlights'
  | 'deliveryPromiseText'
  | 'aboutText';

const FIELDS: Array<{ key: TextKey; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'storeName', label: 'Store ka naam', placeholder: 'My Store' },
  {
    key: 'announcementText',
    label: 'Top announcement bar',
    placeholder: 'Free delivery on orders above PKR 5,000 · Cash on Delivery available',
  },
  { key: 'heroEyebrow', label: 'Banner ki chhoti line', placeholder: 'Cash on Delivery · All over Pakistan' },
  { key: 'heroTitle', label: 'Banner ka bara heading', placeholder: 'Welcome to My Store' },
  {
    key: 'heroSubtitle',
    label: 'Banner description',
    placeholder: 'Quality products at fair prices, delivered to your door.',
    multiline: true,
  },
  {
    key: 'heroImageUrl',
    label: 'Banner image link (leave empty to use the first product image)',
    placeholder: 'https://...',
  },
  {
    key: 'heroHighlights',
    label: 'Highlights below the banner (separate with |)',
    placeholder: 'Cash on Delivery|Nationwide Delivery|Easy Returns',
  },
  {
    key: 'deliveryPromiseText',
    label: 'Delivery line on the product page (keep it accurate)',
    placeholder: 'Delivery across Pakistan by courier, usually in 3–6 working days.',
  },
  {
    key: 'aboutText',
    label: '"About Us" ki likhai (har nai line alag paragraph)',
    placeholder: 'My Store is an online store delivering useful everyday products across Pakistan.',
    multiline: true,
  },
];

// Admin editor for the customer-facing home page / about texts (saved in settings/store_config)
export const StoreTextsPanel: React.FC = () => {
  const { settings, updateStoreSettings, showToast } = useStore();
  const [draft, setDraft] = useState<Partial<StoreSettings>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Partial<StoreSettings> = {};
    FIELDS.forEach((f) => {
      (next as any)[f.key] = (settings as any)[f.key] || '';
    });
    setDraft(next);
  }, [settings]);

  const save = async () => {
    if (!String(draft.storeName || '').trim()) {
      showToast('The store name cannot be empty.');
      return;
    }
    setSaving(true);
    const cleaned: Partial<StoreSettings> = {};
    FIELDS.forEach((f) => {
      (cleaned as any)[f.key] = String((draft as any)[f.key] || '').trim();
    });
    await updateStoreSettings(cleaned);
    setSaving(false);
    showToast('Store texts saved.');
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border-2 border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';

  return (
    <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-4 rounded-xs text-xs text-[#141413]">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider">Home page &amp; store texts</h2>
        <p className="font-semibold mt-1">
          Change the texts customers see on the home page, banner and About Us here.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.multiline || f.key === 'heroImageUrl' ? 'sm:col-span-2' : ''}>
            <label className="block font-bold mb-1" htmlFor={`store-text-${f.key}`}>
              {f.label}
            </label>
            {f.multiline ? (
              <textarea
                id={`store-text-${f.key}`}
                rows={3}
                value={(draft as any)[f.key] || ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputClass}
              />
            ) : (
              <input
                id={`store-text-${f.key}`}
                type="text"
                value={(draft as any)[f.key] || ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputClass}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-[#141413] text-white font-bold cursor-pointer disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save texts'}
        </button>
      </div>
    </div>
  );
};
