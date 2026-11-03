import React, { useRef, useState } from 'react';
import { Upload, RotateCcw } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getAuthHeaders } from '../lib/firebase';
import { BrandLogo } from './BrandLogo';

// Admin → Store settings: upload the store's own logo (shown in the store, Seller Center and admin
// headers and the footer), or go back to the built-in "AS" logo.

// The picture is made at most 600 px tall (PNG keeps a transparent background) before upload
async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This file is not a picture.'));
      el.src = url;
    });
    const scale = Math.min(1, 600 / img.naturalHeight, 1600 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const StoreLogoUploader: React.FC = () => {
  const { settings, updateStoreSettings, showToast } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return showToast('Please choose a PNG, JPG or WebP picture.');
    setBusy(true);
    try {
      const dataUrl = await shrinkLogo(file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: 'store-logo' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not upload the logo.');
      await updateStoreSettings({ logoUrl: data.url });
      showToast('Logo saved. It now shows in the store, Seller Center and admin.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[#141413] font-bold text-xs">Store logo</label>
      <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-2 border-black/15">
        <BrandLogo name={settings.storeName} />
        <span className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="px-3 py-2 bg-[#141413] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" /> {busy ? 'Uploading...' : settings.logoUrl ? 'Change logo' : 'Upload your logo'}
        </button>
        {settings.logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => updateStoreSettings({ logoUrl: '', logoHasName: false })}
            className="px-3 py-2 border border-black/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Use the original logo
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {settings.logoUrl && (
        <label className="flex items-center gap-2 text-xs font-semibold text-[#141413] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.logoHasName === true}
            onChange={(e) => updateStoreSettings({ logoHasName: e.target.checked })}
          />
          My logo already shows the store name (do not write the name next to it)
        </label>
      )}
      <p className="text-[11px] text-[#575653]">
        PNG with a transparent background looks best. The app icon on phones stays the same; ask for it to be changed separately.
      </p>
    </div>
  );
};
