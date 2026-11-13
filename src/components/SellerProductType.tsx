import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PRODUCT_TYPES, typeInfo, type ProductType, type ProductTypeDetails } from '../services/productTypes';
import { ProductTypeIcon } from './ProductTypeIcon';
import { HelpDot } from './HelpDot';

// Seller Center → Products → New product: first the seller picks WHAT they are listing (one icon per
// kind, src/services/productTypes.ts), then the form shows that kind's own fields (download link,
// service days, wholesale price steps, rent per day, ...).

const input = 'w-full px-3 py-2 rounded-lg border border-[#DCD9D2] bg-white text-sm focus:border-[#0E7A43] focus:outline-none';
const label = 'block text-[11.5px] font-semibold text-[#3A3936] mb-1';

/** Big icon cards: what are you listing? */
export const ProductTypePicker: React.FC<{ value?: ProductType | ''; onPick: (t: ProductType) => void; onCancel?: () => void }> = ({
  value,
  onPick,
  onCancel,
}) => (
  <div className="bg-white rounded-xl border border-[#E7E5DF] p-4 sm:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold tracking-tight">
          What are you listing? <HelpDot id="seller.product.type" />
        </h2>
        <p className="text-[12.5px] text-[#6B6963]">Choose the kind of product. Each kind has its own simple form, and customers see the same icon.</p>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg border border-[#DCD9D2] text-sm font-semibold cursor-pointer">
          ← Back
        </button>
      )}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {PRODUCT_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-md ${
            value === t.id ? 'border-[#0E7A43]' : 'border-[#EFEDE8] hover:border-[#CFCBC2]'
          }`}
        >
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2.5" style={{ backgroundColor: t.bg, color: t.color }}>
            <ProductTypeIcon type={t.id} className="w-6 h-6" />
          </span>
          <span className="block text-[14px] font-bold text-[#141413]">{t.label}</span>
          <span className="block text-[12px] text-[#6B6963] leading-snug mt-1">{t.hint}</span>
          <span className="block text-[11px] font-semibold mt-2" style={{ color: t.color }}>
            {t.ships ? 'Courier delivery' : 'No courier'} · {t.cod ? 'COD allowed' : 'Paid in advance'}
          </span>
        </button>
      ))}
    </div>
  </div>
);

/** The chosen kind at the top of the form, with a button to change it */
export const ProductTypeChosen: React.FC<{ type: ProductType; onChange: () => void }> = ({ type, onChange }) => {
  const t = typeInfo(type);
  return (
    <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: t.bg, backgroundColor: `${t.bg}80` }}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: t.bg, color: t.color }}>
        <ProductTypeIcon type={type} className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold" style={{ color: t.color }}>
          {t.label}
        </div>
        <div className="text-[11.5px] text-[#575653]">{t.hint}</div>
      </div>
      <button type="button" onClick={onChange} className="px-3 py-1.5 rounded-lg border border-[#DCD9D2] bg-white text-xs font-semibold cursor-pointer shrink-0">
        Change
      </button>
    </div>
  );
};

export interface DeliveryForm {
  link: string;
  note: string;
  keys: string;
}

/** The kind's own fields */
export const ProductTypeFields: React.FC<{
  type: ProductType;
  details: ProductTypeDetails;
  onDetails: (d: ProductTypeDetails) => void;
  delivery: DeliveryForm;
  onDelivery: (d: DeliveryForm) => void;
  price: string;
  upload: (f: File) => Promise<string>;
  onError: (m: string) => void;
}> = ({ type, details: d, onDetails, delivery, onDelivery, price, upload, onError }) => {
  const set = (patch: Partial<ProductTypeDetails>) => onDetails({ ...d, ...patch });
  const numVal = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const tiers = d.tiers || [];
  if (type === 'PHYSICAL') return null;

  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl rounded-xl border border-[#E7E5DF] bg-[#FBFBF9]">
      {(type === 'DIGITAL' || type === 'SOFTWARE') && (
        <>
          <div className="sm:col-span-2 p-3 rounded-lg border border-sky-200 bg-sky-50 space-y-2">
            <div className="text-[12.5px] font-bold text-sky-950">
              What the customer gets after paying (private) * <HelpDot id="seller.product.delivery" />
            </div>
            <p className="text-[11.5px] text-sky-900">
              Only buyers whose payment is confirmed see this, on their order page. Use a Google Drive / Dropbox link (set to "anyone with the
              link") or upload the file.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${input} flex-1 min-w-[200px]`}
                value={delivery.link}
                onChange={(e) => onDelivery({ ...delivery, link: e.target.value })}
                placeholder="https://drive.google.com/..."
              />
              <label className="px-3 py-2 rounded-lg border border-[#DCD9D2] bg-white text-xs font-semibold cursor-pointer shrink-0">
                Upload file
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,application/zip,image/*,video/mp4"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try {
                      onDelivery({ ...delivery, link: await upload(f) });
                    } catch (err: any) {
                      onError(err.message);
                    }
                  }}
                />
              </label>
            </div>
            <textarea
              className={input}
              rows={2}
              value={delivery.note}
              onChange={(e) => onDelivery({ ...delivery, note: e.target.value })}
              placeholder="How to download / install (optional), e.g. password of the ZIP file"
            />
            {type === 'SOFTWARE' && (
              <div>
                <label className={label}>Licence keys (one per line; each buyer gets the next one)</label>
                <textarea
                  className={`${input} font-mono text-xs`}
                  rows={4}
                  value={delivery.keys}
                  onChange={(e) => onDelivery({ ...delivery, keys: e.target.value })}
                  placeholder={'ABCD-1234-EFGH\nIJKL-5678-MNOP'}
                />
                <span className="text-[11px] text-sky-900">{delivery.keys.split('\n').filter((k) => k.trim()).length} keys left</span>
              </div>
            )}
          </div>
          <div>
            <label className={label}>File type (e.g. PDF, ZIP, MP4)</label>
            <input className={input} value={d.fileFormat || ''} onChange={(e) => set({ fileFormat: e.target.value })} />
          </div>
          <div>
            <label className={label}>Size (optional, e.g. 12 MB)</label>
            <input className={input} value={d.fileSize || ''} onChange={(e) => set({ fileSize: e.target.value })} />
          </div>
          {type === 'DIGITAL' && (
            <div>
              <label className={label}>Pages (books, optional)</label>
              <input className={input} inputMode="numeric" value={numVal(d.pages)} onChange={(e) => set({ pages: Number(e.target.value) || undefined })} />
            </div>
          )}
        </>
      )}

      {type === 'SOFTWARE' && (
        <>
          <div>
            <label className={label}>Works on * (e.g. Windows 10/11, Android, Web)</label>
            <input className={input} value={d.platform || ''} onChange={(e) => set({ platform: e.target.value })} />
          </div>
          <div>
            <label className={label}>Version (optional)</label>
            <input className={input} value={d.version || ''} onChange={(e) => set({ version: e.target.value })} />
          </div>
          <div>
            <label className={label}>Licence</label>
            <select className={input} value={d.licenseType || 'LIFETIME'} onChange={(e) => set({ licenseType: e.target.value as any })}>
              <option value="LIFETIME">Lifetime</option>
              <option value="YEARLY">1 year</option>
              <option value="MONTHLY">1 month</option>
            </select>
          </div>
        </>
      )}

      {(type === 'SERVICE' || type === 'CUSTOM') && (
        <>
          <div>
            <label className={label}>{type === 'SERVICE' ? 'Ready in how many days? *' : 'Days to make it (before shipping)'}</label>
            <input className={input} inputMode="numeric" value={numVal(d.deliveryDays)} onChange={(e) => set({ deliveryDays: Number(e.target.value) || undefined })} />
          </div>
          {type === 'SERVICE' && (
            <div>
              <label className={label}>Free changes (revisions)</label>
              <input className={input} inputMode="numeric" value={numVal(d.revisions)} onChange={(e) => set({ revisions: e.target.value === '' ? undefined : Number(e.target.value) || 0 })} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={label}>What should the customer write when ordering?</label>
            <input
              className={input}
              value={d.askNote || ''}
              onChange={(e) => set({ askNote: e.target.value })}
              placeholder={type === 'CUSTOM' ? 'Name / text to print' : 'Your business name, colours and what you need'}
            />
          </div>
        </>
      )}

      {type === 'WHOLESALE' && (
        <>
          <div>
            <label className={label}>Minimum order (pieces) *</label>
            <input className={input} inputMode="numeric" value={numVal(d.minOrderQty)} onChange={(e) => set({ minOrderQty: Number(e.target.value) || undefined })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <label className={label}>Lower price for bigger orders (optional)</label>
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span>From</span>
                <input
                  className={`${input} !w-24`}
                  inputMode="numeric"
                  value={numVal(t.minQty)}
                  onChange={(e) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, minQty: Number(e.target.value) || 0 } : x)) })}
                />
                <span>pieces: PKR</span>
                <input
                  className={`${input} !w-28`}
                  inputMode="decimal"
                  value={numVal(t.price)}
                  onChange={(e) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) || 0 } : x)) })}
                />
                <span>each</span>
                <button type="button" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })} className="p-1.5 text-rose-700 cursor-pointer" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {tiers.length < 6 && (
              <button
                type="button"
                onClick={() => set({ tiers: [...tiers, { minQty: (tiers[tiers.length - 1]?.minQty || d.minOrderQty || 10) * 2, price: 0 }] })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DCD9D2] bg-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add a price step
              </button>
            )}
            <p className="text-[11px] text-[#6B6963]">The price above (PKR {price || '…'}) is for the minimum order; each step must be cheaper.</p>
          </div>
        </>
      )}

      {type === 'RENTAL' && (
        <>
          <div>
            <label className={label}>Shortest rent (days)</label>
            <input className={input} inputMode="numeric" value={numVal(d.minDays)} onChange={(e) => set({ minDays: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <label className={label}>Longest rent (days)</label>
            <input className={input} inputMode="numeric" value={numVal(d.maxDays)} onChange={(e) => set({ maxDays: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <label className={label}>Refundable deposit (PKR, optional)</label>
            <input className={input} inputMode="numeric" value={numVal(d.deposit)} onChange={(e) => set({ deposit: Number(e.target.value) || undefined })} />
          </div>
        </>
      )}

      {type === 'SUBSCRIPTION' && (
        <div>
          <label className={label}>The price is for</label>
          <select className={input} value={d.billingPeriod || 'MONTHLY'} onChange={(e) => set({ billingPeriod: e.target.value as any })}>
            <option value="MONTHLY">1 month</option>
            <option value="YEARLY">1 year</option>
          </select>
        </div>
      )}

      <div className="sm:col-span-2">
        <label className={label}>What the customer gets (one per line, optional)</label>
        <textarea
          className={input}
          rows={3}
          value={d.includes || ''}
          onChange={(e) => set({ includes: e.target.value })}
          placeholder={
            type === 'SERVICE'
              ? '3 logo designs to choose from\nFiles in PNG and PDF\nSent on WhatsApp / email'
              : type === 'SUBSCRIPTION'
              ? 'Access to the WhatsApp group\n4 live classes a month'
              : type === 'DIGITAL'
              ? '120-page PDF book\nPrintable worksheets'
              : 'What is included'
          }
        />
      </div>
    </div>
  );
};

/** Price label for the kind */
export const priceLabelFor = (type: ProductType | '', d: ProductTypeDetails) =>
  type === 'RENTAL'
    ? 'Rent per day (PKR)'
    : type === 'SUBSCRIPTION'
    ? `Price per ${d.billingPeriod === 'YEARLY' ? 'year' : 'month'} (PKR)`
    : type === 'WHOLESALE'
    ? 'Price per piece for the minimum order (PKR)'
    : type === 'SERVICE'
    ? 'Price of the service (PKR)'
    : 'Price (PKR)';
