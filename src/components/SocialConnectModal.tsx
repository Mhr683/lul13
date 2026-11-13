import React, { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardPaste, ExternalLink, UserPlus, X } from 'lucide-react';
import { ui } from './SellerUi';
import { SocialIcon } from './SocialIcon';
import { CONNECT, deviceKind, openAppUrl, playStoreUrl } from '../services/socialConnect';
import { checkSocialLink, platformInfo, type SocialPlatform } from '../services/socialLinks';

// "Connect" one social platform to the shop, in 3 steps:
//   1. Open the app (Android: the app, or the Play Store to install it) — or create a new account
//   2. In the app, copy your profile / page link
//   3. Back here, "Connect now" reads the copied link, checks it and saves it
// A web page cannot see installed apps or signed-in accounts, so the seller copies their own link.

type P = Exclude<SocialPlatform, 'OTHER'>;

export const SocialConnectModal: React.FC<{
  platform: P;
  current: string;
  onConnect: (url: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onClose: () => void;
}> = ({ platform, current, onConnect, onDisconnect, onClose }) => {
  const info = platformInfo(platform)!;
  const c = CONNECT[platform];
  const device = deviceKind();
  const [opened, setOpened] = useState(false);
  const [back, setBack] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  // Coming back from the app: show "Connect now" as the next step
  useEffect(() => {
    if (!opened) return;
    const onBack = () => document.visibilityState === 'visible' && setBack(true);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [opened]);

  const open = (url: string) => {
    setOpened(true);
    // intent:// links must open in this tab (Android hands them to the app / Play Store)
    if (url.startsWith('intent://')) window.location.href = url;
    else window.open(url, '_blank', 'noopener');
  };

  const connect = async (value?: string) => {
    setError('');
    let link = (value ?? text).trim();
    if (!link) {
      try {
        link = (await navigator.clipboard.readText()).trim();
        setText(link);
      } catch {
        setError('Could not read the copied link. Long-press the box below, tap "Paste", then press Connect now.');
        return;
      }
    }
    if (!link) {
      setError(`Nothing copied yet. In ${info.label}: ${c.howToCopy}`);
      return;
    }
    // Pick the link out of a longer shared text ("Check out my profile https://...")
    const found = link.match(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.(?:com|me|be)\/\S+/i)?.[0];
    const { link: ok, error: err } = checkSocialLink({ platform, url: found || link });
    if (!ok) {
      setError(err || `This is not a ${info.label} link.`);
      return;
    }
    setBusy(true);
    try {
      await onConnect(ok.url);
      setDone(ok.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const step = (n: number, active: boolean) => (
    <span
      className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
        active ? 'bg-[#0E7A43] text-white' : 'bg-[#EFEDE8] text-[#6B6963]'
      }`}
    >
      {n}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[110] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${info.label}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="px-5 py-4 flex items-center gap-3 border-b border-[#EFEDE8]">
          <SocialIcon platform={platform} size={34} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold">Connect {info.label}</div>
            <div className="text-[12px] text-[#6B6963] truncate">{current ? `Connected: ${current}` : 'Not connected yet'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-[#F2F1EC] flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-[#0E7A43]" />
            <div className="text-[15px] font-bold">{info.label} connected</div>
            <div className="text-[12px] text-[#6B6963] break-all">{done}</div>
            <p className="text-[12px] text-[#6B6963]">It now shows on your shop page under "Follow us".</p>
            <button type="button" onClick={onClose} className={`${ui.primary} w-full !py-2.5`}>
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 text-[12.5px]">
            {/* 1. open the app, or create an account */}
            <div className="flex gap-3">
              {step(1, !back)}
              <div className="flex-1 space-y-2">
                <div className="font-semibold">Open {info.label} and sign in</div>
                <div className="grid grid-cols-1 gap-2">
                  <button type="button" onClick={() => open(openAppUrl(platform))} className={`${ui.primary} !py-2.5`}>
                    <ExternalLink className="w-4 h-4" />
                    {device === 'desktop' ? `Open ${info.label}` : `Open the ${info.label} app`}
                  </button>
                  <button type="button" onClick={() => open(c.signup)} className={ui.secondary}>
                    <UserPlus className="w-4 h-4" /> No account? Create a new one
                  </button>
                </div>
                {device === 'android' && c.pkg && (
                  <p className="text-[11.5px] text-[#8A8780]">
                    The app opens if it is on your phone. If not, the Play Store opens so you can{' '}
                    <a href={playStoreUrl(c.pkg)} className={ui.link}>
                      download it
                    </a>{' '}
                    (sign in to the Play Store if it asks). After installing, sign in or create your account, then come back here.
                  </p>
                )}
                {device === 'ios' && <p className="text-[11.5px] text-[#8A8780]">The app opens if it is on your iPhone; otherwise the website opens. You can get the app from the App Store.</p>}
              </div>
            </div>

            {/* 2. copy the link */}
            <div className="flex gap-3">
              {step(2, false)}
              <div className="flex-1">
                <div className="font-semibold">Copy your {platform === 'WHATSAPP_CHANNEL' ? 'number or link' : 'profile link'}</div>
                <p className="text-[#55534E]">{c.howToCopy}</p>
              </div>
            </div>

            {/* 3. connect */}
            <div className={`flex gap-3 ${back ? 'p-3 -mx-3 rounded-xl bg-emerald-50 border border-emerald-200' : ''}`}>
              {step(3, back)}
              <div className="flex-1 space-y-2">
                <div className="font-semibold">{back ? 'Welcome back! Connect now' : 'Come back and connect'}</div>
                <button type="button" disabled={busy} onClick={() => connect()} className={`${ui.primary} w-full !py-2.5`}>
                  <ClipboardPaste className="w-4 h-4" /> {busy ? 'Connecting...' : 'Connect now (use the copied link)'}
                </button>
                <div className="flex gap-2">
                  <input
                    className={ui.input}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // The modal sits inside the Profile form: Enter connects instead of saving the form
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (text.trim()) connect(text);
                      }
                    }}
                    placeholder={platform === 'WHATSAPP_CHANNEL' ? '03001234567 or link' : `or paste here: ${info.example}`}
                    inputMode={platform === 'WHATSAPP_CHANNEL' ? 'text' : 'url'}
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  {text.trim() && (
                    <button type="button" disabled={busy} onClick={() => connect(text)} className={ui.dark}>
                      Connect
                    </button>
                  )}
                </div>
                {error && <p className="text-[12px] text-rose-700">{error}</p>}
              </div>
            </div>

            {current && (
              <div className="pt-3 border-t border-[#EFEDE8] flex flex-wrap gap-2 justify-between">
                <a href={current} target="_blank" rel="noopener noreferrer" className={ui.link}>
                  View my {info.label} <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onDisconnect();
                      onClose();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`${ui.danger} !py-1.5`}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
