import React, { useState } from 'react';
import { FileText, Upload, Video } from 'lucide-react';
import { CARE_PRESETS, type ProductInfo } from '../services/productInfo';

// Seller Center product form: specifications, "How to use", care instructions and user manual.
// Everything is optional; filled parts appear on the product page (Specifications / Usage & care).

const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';
const inputCls = 'w-full px-3 py-2 border border-black/20 bg-white text-sm focus:border-black focus:outline-none';

export const ProductInfoEditor: React.FC<{
  info: ProductInfo;
  dimensions: string;
  onChange: (info: ProductInfo) => void;
  onDimensions: (v: string) => void;
  upload: (file: Blob) => Promise<string>;
  onError: (msg: string) => void;
}> = ({ info, dimensions, onChange, onDimensions, upload, onError }) => {
  const [busy, setBusy] = useState<'video' | 'manual' | null>(null);
  const set = (k: keyof ProductInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...info, [k]: e.target.value });

  const uploadTo = async (k: 'howToUseVideoUrl' | 'manualUrl', file: File | undefined) => {
    if (!file) return;
    if (k === 'manualUrl' && file.type !== 'application/pdf') return onError('The user manual must be a PDF file.');
    if (k === 'manualUrl' && file.size > 8 * 1024 * 1024) return onError('The PDF can be at most 8 MB.');
    if (k === 'howToUseVideoUrl' && file.size > 50 * 1024 * 1024) return onError('The video can be at most 50 MB. Use a YouTube link for longer videos.');
    setBusy(k === 'manualUrl' ? 'manual' : 'video');
    try {
      const url = await upload(file);
      onChange({ ...info, [k]: url });
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const addCare = (line: string) => {
    const lines = String(info.careInstructions || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.includes(line)) return;
    onChange({ ...info, careInstructions: [...lines, line].join('\n') });
  };

  return (
    <div className="sm:col-span-2 p-3 border border-black/10 bg-[#FBFBF9] space-y-4">
      <div>
        <div className="text-xs font-bold text-[#141413]">Specifications, how to use &amp; care (optional)</div>
        <p className="text-[11px] text-[#575653]">
          Nothing here is required: leave empty what does not fit your product. Filled parts are shown on the product page.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Barcode / EAN</label>
          <input className={inputCls} value={info.barcode || ''} onChange={set('barcode')} placeholder="e.g. 8961014000123" />
        </div>
        <div>
          <label className={labelCls}>Model number</label>
          <input className={inputCls} value={info.modelNumber || ''} onChange={set('modelNumber')} placeholder="e.g. A9 Pro" />
        </div>
        <div>
          <label className={labelCls}>Material</label>
          <input className={inputCls} value={info.material || ''} onChange={set('material')} placeholder="e.g. 100% cotton, ABS plastic" />
        </div>
        <div>
          <label className={labelCls}>Dimensions</label>
          <input className={inputCls} value={dimensions} onChange={(e) => onDimensions(e.target.value)} placeholder="e.g. 20 x 15 x 10 cm" />
        </div>
        <div>
          <label className={labelCls}>Country of origin</label>
          <input className={inputCls} value={info.countryOfOrigin || ''} onChange={set('countryOfOrigin')} placeholder="e.g. Pakistan, China" />
        </div>
        <div>
          <label className={labelCls}>Warranty</label>
          <input className={inputCls} value={info.warranty || ''} onChange={set('warranty')} placeholder="e.g. 6 months brand warranty" />
        </div>
      </div>

      <div>
        <label className={labelCls}>How to use (one step per line)</label>
        <textarea
          className={inputCls}
          rows={4}
          value={info.howToUse || ''}
          onChange={set('howToUse')}
          placeholder={'Charge the case fully before first use\nOpen the case to pair with your phone\nTap twice to play / pause'}
        />
      </div>

      <div>
        <label className={labelCls}>How-to / unboxing video (optional: YouTube, Vimeo or MP4)</label>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1 min-w-[200px]`} value={info.howToUseVideoUrl || ''} onChange={set('howToUseVideoUrl')} placeholder="https://youtu.be/... or https://vimeo.com/..." />
          <label className="px-3 py-2 border border-black/20 text-xs font-semibold cursor-pointer hover:border-black flex items-center gap-1.5 bg-white">
            <Video className="w-3.5 h-3.5" /> {busy === 'video' ? 'Uploading...' : 'Upload MP4'}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" disabled={busy !== null} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              uploadTo('howToUseVideoUrl', f);
            }} />
          </label>
        </div>
      </div>

      <div>
        <label className={labelCls}>Cleaning &amp; care (one per line)</label>
        <textarea className={inputCls} rows={3} value={info.careInstructions || ''} onChange={set('careInstructions')} placeholder="e.g. Hand wash only" />
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {CARE_PRESETS.map((c) => (
            <button key={c} type="button" onClick={() => addCare(c)} className="px-2 py-0.5 border border-black/15 bg-white text-[11px] hover:border-black cursor-pointer">
              + {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>User manual (optional, PDF)</label>
        <div className="flex flex-wrap items-center gap-2">
          {info.manualUrl ? (
            <>
              <a href={info.manualUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0E7A43] font-semibold underline flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> View manual
              </a>
              <button type="button" onClick={() => onChange({ ...info, manualUrl: '' })} className="px-2 py-1 border border-black/20 text-[11px] cursor-pointer">
                Remove
              </button>
            </>
          ) : (
            <label className="px-3 py-1.5 border border-black/20 text-xs font-semibold cursor-pointer hover:border-black flex items-center gap-1.5 bg-white">
              <Upload className="w-3.5 h-3.5" /> {busy === 'manual' ? 'Uploading...' : 'Upload PDF'}
              <input type="file" accept="application/pdf" className="hidden" disabled={busy !== null} onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                uploadTo('manualUrl', f);
              }} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
};
