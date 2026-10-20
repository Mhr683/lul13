import React, { useRef, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Product, Category, Coupon, StoreSettings } from '../types/store';

interface StoreBackup {
  format: 'store-backup';
  version: 1;
  exportedAt: string;
  storeName?: string;
  products: Product[];
  categories: Category[];
  coupons: Coupon[];
  settings: Partial<StoreSettings>;
}

// Moves the catalog (with private supplier data), categories, coupons and settings between
// Firebase projects, e.g. when the store is opened under another AI Studio account.
// Orders and customer accounts are not included.
export const BackupRestorePanel: React.FC = () => {
  const {
    products,
    categories,
    coupons,
    settings,
    importProductsBatch,
    saveCategory,
    saveCoupon,
    updateStoreSettings,
    showToast,
    userProfile,
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const canRestore = userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN';

  const downloadBackup = () => {
    const { id: _id, updatedAt: _updated, ...settingsData } = settings as any;
    const backup: StoreBackup = {
      format: 'store-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      storeName: settings.storeName,
      products,
      categories,
      coupons,
      settings: settingsData,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Backup downloaded: ${products.length} products, ${categories.length} categories, ${coupons.length} coupons.`);
  };

  const restoreBackup = async (file: File) => {
    let backup: StoreBackup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setStatus('This file is not a valid backup (could not read the JSON).');
      return;
    }
    if (backup?.format !== 'store-backup' || !Array.isArray(backup.products)) {
      setStatus('This file does not look like a backup of this store.');
      return;
    }
    const ok = window.confirm(
      `Restore from "${backup.storeName || 'store'}" (${backup.exportedAt?.slice(0, 10) || ''})?\n\n` +
        `${backup.products.length} products, ${backup.categories?.length || 0} categories, ` +
        `${backup.coupons?.length || 0} coupons and the store settings will be saved into THIS store. ` +
        `Products with the same ID are overwritten. Orders are not included.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      setStatus('Restoring settings...');
      if (backup.settings && typeof backup.settings === 'object' && Object.keys(backup.settings).length > 0) {
        await updateStoreSettings(backup.settings);
      }

      setStatus(`Restoring categories (${backup.categories?.length || 0})...`);
      for (const cat of backup.categories || []) {
        if (cat?.name) await saveCategory(cat);
      }

      const validProducts = backup.products.filter((p) => p && p.id && p.name && p.sku);
      const CHUNK = 100;
      let savedProducts = 0;
      for (let i = 0; i < validProducts.length; i += CHUNK) {
        setStatus(`Restoring products: ${Math.min(i + CHUNK, validProducts.length)} / ${validProducts.length}`);
        const result = await importProductsBatch(validProducts.slice(i, i + CHUNK));
        savedProducts += result?.count ?? 0;
      }

      setStatus(`Restoring coupons (${backup.coupons?.length || 0})...`);
      for (const c of backup.coupons || []) {
        if (c?.code && c?.type) await saveCoupon(c);
      }

      setStatus(
        `Restore complete: ${savedProducts} / ${validProducts.length} products, ${backup.categories?.length || 0} categories, ${
          backup.coupons?.length || 0
        } coupons aur settings.`
      );
      showToast('Backup restored.');
    } catch (err: any) {
      setStatus(`Restore stopped part-way: ${err?.message || err}. Run it again; items already restored will be overwritten.`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs text-xs text-[#141413]">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider">Backup &amp; Restore</h2>
        <p className="font-semibold mt-1">
          To move the store to another Gmail / AI Studio account, first download a backup here, then restore it from the
          same place in the new store. Products (with supplier data), categories, coupons and settings are included.
          Orders and customer accounts are not.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadBackup}
          disabled={busy}
          className="px-4 py-2 bg-[#141413] text-white font-bold cursor-pointer disabled:opacity-60"
        >
          ⬇ Download backup ({products.length} products)
        </button>
        {canRestore && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-4 py-2 border-2 border-black/30 font-bold cursor-pointer disabled:opacity-60"
            >
              ⬆ Restore from backup file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) restoreBackup(file);
              }}
            />
          </>
        )}
      </div>
      {status && <div className="p-2.5 bg-white border border-black/15 font-mono">{status}</div>}
    </div>
  );
};
