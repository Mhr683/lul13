import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { HelpDot } from './HelpDot';
import { Panel, ui } from './SellerUi';
import { SocialIcon } from './SocialIcon';
import { ShareProductButton } from './ShareProductButton';
import { MAX_SOCIAL_LINKS, SOCIAL_PLATFORMS, checkSocialLink, type SocialLink, type SocialPlatform } from '../services/socialLinks';
import { SocialConnectModal } from './SocialConnectModal';

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
  const [connecting, setConnecting] = useState<Exclude<SocialPlatform, 'OTHER'> | null>(null);

  // Saves at once (used by Connect / Disconnect); "Save links" below saves the extra links
  const persist = async (m: Record<string, string>, x: Extra[]) => {
    const list = [
      ...SOCIAL_PLATFORMS.map((p) => ({ platform: p.id, url: m[p.id] || '' })),
      ...x.map((e) => ({ platform: 'OTHER' as const, url: e.url, label: e.label })),
    ].filter((r) => r.url.trim());
    const bad = list.map((r) => checkSocialLink(r).error).find(Boolean);
    if (bad) throw new Error(bad);
    await onSave(list as SocialLink[]);
  };

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
      subtitle="Tap an app to connect it. Customers see your pages on your shop page and can follow you."
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
        {/* One tile per platform: tap to open the app, sign in / create an account, and connect */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {SOCIAL_PLATFORMS.map((p) => {
            const url = main[p.id] || '';
            const bad = Boolean(errorOf({ platform: p.id, url }));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setConnecting(p.id)}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition-colors ${
                  url && !bad ? 'border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50' : 'border-[#E7E5DF] bg-white hover:border-[#A8A59D]'
                }`}
              >
                <SocialIcon platform={p.id} size={30} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold truncate">{p.label}</span>
                  <span className={`block text-[11px] font-semibold ${url && !bad ? 'text-emerald-700' : bad ? 'text-rose-700' : 'text-[#8A8780]'}`}>
                    {url && !bad ? '✓ Connected' : bad ? 'Fix link' : 'Tap to connect'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {connecting && (
          <SocialConnectModal
            platform={connecting}
            current={main[connecting] || ''}
            onClose={() => setConnecting(null)}
            onConnect={async (url) => {
              const next = { ...main, [connecting]: url };
              await persist(next, extra);
              setMain(next);
            }}
            onDisconnect={async () => {
              const next = { ...main, [connecting]: '' };
              await persist(next, extra);
              setMain(next);
              showToast(`${connecting === 'WHATSAPP_CHANNEL' ? 'WhatsApp' : SOCIAL_PLATFORMS.find((x) => x.id === connecting)?.label} disconnected.`);
            }}
          />
        )}

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
            Apps above save as soon as you connect them. {filled}/{MAX_SOCIAL_LINKS} links.
          </span>
          <button type="button" disabled={saving} onClick={save} className={ui.primary}>
            {saving ? 'Saving...' : 'Save other links'}
          </button>
        </div>
      </div>
    </Panel>
  );
};
