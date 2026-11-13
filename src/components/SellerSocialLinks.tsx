import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { HelpDot } from './HelpDot';
import { Panel, ui } from './SellerUi';
import { SocialIcon } from './SocialIcon';
import { ShareProductButton } from './ShareProductButton';
import { MAX_SOCIAL_LINKS, SOCIAL_PLATFORMS, checkSocialLink, type SocialLink } from '../services/socialLinks';

// Seller Center → Profile → "Social media": the shop's pages (Facebook, Instagram, YouTube, TikTok, X,
// Telegram, WhatsApp channel) plus any other link with its own name. They show as icons on the shop
// page. Also a "Share my shop" button for all apps.

type Extra = { label: string; url: string };

export const SellerSocialLinks: React.FC<{
  initial: SocialLink[];
  shopName: string;
  shopUrl: string;
  onSave: (links: SocialLink[]) => Promise<void>;
  showToast: (msg: string) => void;
}> = ({ initial, shopName, shopUrl, onSave, showToast }) => {
  const [main, setMain] = useState<Record<string, string>>(() =>
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, initial.find((l) => l.platform === p.id)?.url || '']))
  );
  const [extra, setExtra] = useState<Extra[]>(() => initial.filter((l) => l.platform === 'OTHER').map((l) => ({ label: l.label || '', url: l.url })));
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () => [
      ...SOCIAL_PLATFORMS.map((p) => ({ platform: p.id, url: main[p.id] || '' })),
      ...extra.map((e) => ({ platform: 'OTHER' as const, url: e.url, label: e.label })),
    ],
    [main, extra]
  );
  const errorOf = (r: { platform: string; url: string; label?: string }) => (r.url.trim() ? checkSocialLink(r).error : undefined);
  const filled = rows.filter((r) => r.url.trim()).length;
  const firstError = rows.map(errorOf).find(Boolean);

  const save = async () => {
    if (firstError) return showToast(firstError);
    setSaving(true);
    try {
      await onSave(rows.filter((r) => r.url.trim()) as SocialLink[]);
      showToast('Social media links saved. They show on your shop page.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Social media"
      help={<HelpDot id="seller.social" />}
      subtitle="Link your pages: customers see them on your shop page and can follow you."
      actions={
        <ShareProductButton
          productId=""
          productName={shopName}
          shareUrl={shopUrl}
          shareText={`${shopName} on Anokha Shopping Hub: Cash on Delivery all over Pakistan`}
          label="Share my shop"
          className={ui.secondary}
          showToast={showToast}
        />
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const err = errorOf({ platform: p.id, url: main[p.id] || '' });
            return (
              <div key={p.id}>
                <label className={`${ui.fieldLabel} flex items-center gap-2`}>
                  <SocialIcon platform={p.id} size={20} /> {p.label}
                </label>
                <input
                  className={`${ui.input} ${err ? '!border-rose-400' : ''}`}
                  value={main[p.id] || ''}
                  onChange={(e) => setMain((m) => ({ ...m, [p.id]: e.target.value }))}
                  placeholder={p.example}
                  inputMode="url"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                {err && <p className="mt-1 text-[11.5px] text-rose-700">{err}</p>}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-[#EFEDE8] space-y-2">
          <div className="text-[12.5px] font-semibold text-[#3A3936]">Other links</div>
          <p className="text-[11.5px] text-[#8A8780]">Not in the list? Add it with its own name: Pinterest, Snapchat, Threads, LinkedIn, your website...</p>
          {extra.map((e, i) => {
            const err = errorOf({ platform: 'OTHER', url: e.url, label: e.label });
            return (
              <div key={i} className="space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <SocialIcon platform="OTHER" size={20} />
                  <input
                    className={`${ui.input} !w-40`}
                    value={e.label}
                    maxLength={30}
                    onChange={(ev) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, label: ev.target.value } : y)))}
                    placeholder="Name, e.g. Pinterest"
                  />
                  <input
                    className={`${ui.input} flex-1 min-w-[180px] ${err ? '!border-rose-400' : ''}`}
                    value={e.url}
                    onChange={(ev) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, url: ev.target.value } : y)))}
                    placeholder="https://..."
                    inputMode="url"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button type="button" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))} className={`${ui.secondary} !px-2`} aria-label="Remove this link">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {err && <p className="text-[11.5px] text-rose-700">{err}</p>}
              </div>
            );
          })}
          {filled < MAX_SOCIAL_LINKS && (
            <button type="button" onClick={() => setExtra((x) => [...x, { label: '', url: '' }])} className={ui.link}>
              <Plus className="w-4 h-4" /> Add another link
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11.5px] text-[#8A8780]">
            Personal WhatsApp numbers, groups and e-mails are not allowed: customers order through the store. {filled}/{MAX_SOCIAL_LINKS} links.
          </span>
          <button type="button" disabled={saving} onClick={save} className={ui.primary}>
            {saving ? 'Saving...' : 'Save links'}
          </button>
        </div>
      </div>
    </Panel>
  );
};
