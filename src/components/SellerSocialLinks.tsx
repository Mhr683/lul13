import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { HelpDot } from './HelpDot';
import { Panel, ui } from './SellerUi';
import { SocialIcon } from './SocialIcon';
import { ShareProductButton } from './ShareProductButton';
import { MAX_SOCIAL_LINKS, SOCIAL_PLATFORMS, checkSocialLink, type SocialLink } from '../services/socialLinks';

// Seller Center → Profile → "Social media": the shop's pages (Facebook, Instagram, YouTube, TikTok, X,
// Telegram, WhatsApp) plus any other link with its own name. Every field has its own "Connect" button
// that saves that link at once ("✓ Connected" once saved, "Remove" when the field is emptied). The
// links show as icons on the shop page. Also a "Share my shop" button for all apps.

type Extra = { id: string; label: string; url: string };
type Saved = { main: Record<string, string>; extra: Extra[] };
const newId = () => Math.random().toString(36).slice(2, 9);

export const SellerSocialLinks: React.FC<{
  initial: SocialLink[];
  shopName: string;
  shopUrl: string;
  onSave: (links: SocialLink[]) => Promise<void>;
  showToast: (msg: string) => void;
}> = ({ initial, shopName, shopUrl, onSave, showToast }) => {
  const start: Saved = {
    main: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, initial.find((l) => l.platform === p.id)?.url || ''])),
    extra: initial.filter((l) => l.platform === 'OTHER').map((l) => ({ id: newId(), label: l.label || '', url: l.url })),
  };
  // What the seller is typing, and what is saved on the shop
  const [main, setMain] = useState<Record<string, string>>(start.main);
  const [extra, setExtra] = useState<Extra[]>(start.extra);
  const [saved, setSaved] = useState<Saved>(start);
  const [busy, setBusy] = useState('');

  const errorOf = (r: { platform: string; url: string; label?: string }) => (r.url.trim() ? checkSocialLink(r).error : undefined);
  const filled = Object.values(main).filter((v) => v.trim()).length + extra.filter((e) => e.url.trim()).length;

  /** Saves the shop's links as `next`; on success the saved (cleaned) values show in the fields */
  const persist = async (key: string, next: Saved, doneMsg: string) => {
    const main2: Record<string, string> = {};
    for (const p of SOCIAL_PLATFORMS) {
      const v = (next.main[p.id] || '').trim();
      if (!v) continue;
      const c = checkSocialLink({ platform: p.id, url: v });
      if (c.error) return showToast(c.error);
      main2[p.id] = c.link!.url;
    }
    const extra2: Extra[] = [];
    for (const e of next.extra) {
      if (!e.url.trim()) continue;
      const c = checkSocialLink({ platform: 'OTHER', url: e.url, label: e.label });
      if (c.error) return showToast(c.error);
      extra2.push({ id: e.id, label: c.link!.label || '', url: c.link!.url });
    }
    setBusy(key);
    try {
      await onSave([
        ...SOCIAL_PLATFORMS.filter((p) => main2[p.id]).map((p) => ({ platform: p.id, url: main2[p.id] })),
        ...extra2.map((e) => ({ platform: 'OTHER' as const, url: e.url, label: e.label })),
      ]);
      setSaved({ main: main2, extra: extra2 });
      // The row just connected shows its clean link (tracking bits removed, a number made into a WhatsApp link)
      if (key in main2) setMain((m) => ({ ...m, [key]: main2[key] }));
      const done = extra2.find((e) => e.id === key);
      if (done) setExtra((x) => x.map((e) => (e.id === key ? done : e)));
      showToast(doneMsg);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy('');
    }
  };

  /** Connect / ✓ Connected / Remove for one row */
  const rowButton = (key: string, value: string, savedValue: string, onClick: () => void, label: string) => {
    const v = value.trim();
    const s = savedValue.trim();
    if (v && v === s)
      return (
        <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[12px] font-bold whitespace-nowrap shrink-0">
          ✓ Connected
        </span>
      );
    if (!v && s)
      return (
        <button type="button" disabled={!!busy} onClick={onClick} className={`${ui.danger} shrink-0`} aria-label={`Remove ${label}`}>
          {busy === key ? 'Removing...' : 'Remove'}
        </button>
      );
    return (
      <button type="button" disabled={!v || !!busy} onClick={onClick} className={`${ui.primary} shrink-0`} aria-label={`Connect ${label}`}>
        {busy === key ? 'Connecting...' : 'Connect'}
      </button>
    );
  };

  const connectMain = (id: string, label: string) => {
    const v = (main[id] || '').trim();
    persist(id, { ...saved, main: { ...saved.main, [id]: v } }, v ? `${label} connected. It shows on your shop page.` : `${label} removed.`);
  };
  const connectExtra = (e: Extra) => {
    const has = saved.extra.some((s) => s.id === e.id);
    const list = has ? saved.extra.map((s) => (s.id === e.id ? e : s)) : [...saved.extra, e];
    persist(e.id, { ...saved, extra: list }, e.url.trim() ? `${e.label || 'Link'} connected.` : `${e.label || 'Link'} removed.`);
  };
  // Enter in a field connects it (the Profile form around it is not submitted)
  const onEnter = (go: () => void) => (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      go();
    }
  };

  return (
    <Panel
      title="Social media"
      help={<HelpDot id="seller.social" />}
      subtitle="Paste your page link and press Connect. Customers see your pages on your shop page."
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
        <div className="grid gap-3 lg:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const err = errorOf({ platform: p.id, url: main[p.id] || '' });
            return (
              <div key={p.id}>
                <label className={`${ui.fieldLabel} flex items-center gap-2`}>
                  <SocialIcon platform={p.id} size={20} /> {p.label}
                </label>
                <div className="flex gap-2">
                  <input
                    className={`${ui.input} ${err ? '!border-rose-400' : ''}`}
                    value={main[p.id] || ''}
                    onChange={(e) => setMain((m) => ({ ...m, [p.id]: e.target.value }))}
                    onKeyDown={onEnter(() => connectMain(p.id, p.label))}
                    placeholder={p.example}
                    inputMode="url"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  {rowButton(p.id, main[p.id] || '', saved.main[p.id] || '', () => connectMain(p.id, p.label), p.label)}
                </div>
                {err && <p className="mt-1 text-[11.5px] text-rose-700">{err}</p>}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-[#EFEDE8] space-y-2">
          <div className="text-[12.5px] font-semibold text-[#3A3936]">Other links</div>
          <p className="text-[11.5px] text-[#8A8780]">Not in the list? Add it with its own name: Pinterest, Snapchat, Threads, LinkedIn, your website...</p>
          {extra.map((e) => {
            const err = errorOf({ platform: 'OTHER', url: e.url, label: e.label });
            const savedOne = saved.extra.find((s) => s.id === e.id);
            const set = (patch: Partial<Extra>) => setExtra((x) => x.map((y) => (y.id === e.id ? { ...y, ...patch } : y)));
            return (
              <div key={e.id} className="space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <SocialIcon platform="OTHER" size={20} />
                  <input
                    className={`${ui.input} !w-36`}
                    value={e.label}
                    maxLength={30}
                    onChange={(ev) => set({ label: ev.target.value })}
                    onKeyDown={onEnter(() => connectExtra(e))}
                    placeholder="Name, e.g. Pinterest"
                  />
                  <input
                    className={`${ui.input} flex-1 min-w-[160px] ${err ? '!border-rose-400' : ''}`}
                    value={e.url}
                    onChange={(ev) => set({ url: ev.target.value })}
                    onKeyDown={onEnter(() => connectExtra(e))}
                    placeholder="https://..."
                    inputMode="url"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  {rowButton(e.id, e.url, savedOne && savedOne.label === e.label ? savedOne.url : '', () => connectExtra(e), e.label || 'link')}
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      setExtra((x) => x.filter((y) => y.id !== e.id));
                      // Already saved: take it off the shop too
                      if (savedOne) persist(e.id, { ...saved, extra: saved.extra.filter((s) => s.id !== e.id) }, `${e.label || 'Link'} removed.`);
                    }}
                    className={`${ui.secondary} !px-2 shrink-0`}
                    aria-label="Delete this link"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {err && <p className="text-[11.5px] text-rose-700">{err}</p>}
              </div>
            );
          })}
          {filled < MAX_SOCIAL_LINKS && (
            <button type="button" onClick={() => setExtra((x) => [...x, { id: newId(), label: '', url: '' }])} className={ui.link}>
              <Plus className="w-4 h-4" /> Add another link
            </button>
          )}
        </div>

        <p className="pt-1 text-[11.5px] text-[#8A8780]">
          WhatsApp: your number, group or channel link. {filled}/{MAX_SOCIAL_LINKS} links.
        </p>
      </div>
    </Panel>
  );
};
