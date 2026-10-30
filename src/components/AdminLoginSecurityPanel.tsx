import React, { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { getAuthHeaders } from '../lib/firebase';

interface SecurityInfo {
  captcha: boolean;
  emailsReachEveryone: boolean;
  adminStepUp: boolean;
  sellerStepUp: boolean;
  telegramBotReady: boolean;
  telegramBot: string;
  telegramLinked: boolean;
}

// Settings: which login checks are on, and connecting the owner's Telegram for admin login codes
export const AdminLoginSecurityPanel: React.FC = () => {
  const { userProfile, showToast } = useStore();
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const call = async (path: string, body?: object) => {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: await getAuthHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };

  const load = () =>
    call('/api/admin/security')
      .then(setInfo)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (userProfile?.role === 'SUPER_ADMIN') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.role]);

  // After the Telegram link is opened: look for the "Start" message every 4 seconds (2 minutes)
  useEffect(() => {
    if (!linkUrl) return;
    let tries = 0;
    setChecking(true);
    const t = setInterval(async () => {
      tries += 1;
      try {
        const r = await call('/api/admin/security/telegram/check', {});
        if (r.linked) {
          clearInterval(t);
          setChecking(false);
          setLinkUrl(null);
          showToast('Telegram connected.');
          load();
        } else if (r.expired || tries >= 30) {
          clearInterval(t);
          setChecking(false);
        }
      } catch (e: any) {
        clearInterval(t);
        setChecking(false);
        setError(e.message);
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkUrl]);

  if (userProfile?.role !== 'SUPER_ADMIN') return null;

  const row = (label: string, on: boolean, note: string) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-black/5">
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-[#575653]">{note}</div>
      </div>
      <span className={`shrink-0 px-2 py-0.5 font-bold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
        {on ? 'ON' : 'OFF'}
      </span>
    </div>
  );

  return (
    <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-4 rounded-xs text-xs text-[#141413]">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider">Login security</h2>
        <p className="font-semibold mt-1">
          Extra checks after signing in. You stay signed in on a device until you press Logout.
        </p>
      </div>

      {error && <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800">{error}</div>}
      {!info && !error && <div>Loading...</div>}

      {info && (
        <>
          <div>
            {row('Super admin: email "Yes, it\'s me" link', info.adminStepUp, 'Sent to your Gmail on every new login.')}
            {row(
              'Super admin: Telegram code',
              info.telegramLinked,
              info.telegramLinked ? '6 characters, valid 5 minutes.' : 'Connect your Telegram below to switch it on.'
            )}
            {row('Captcha (super admin + sellers)', info.captcha, info.captcha ? 'Cloudflare Turnstile.' : 'Needs the Turnstile keys on the server.')}
            {row(
              'Sellers: email code',
              info.sellerStepUp && info.emailsReachEveryone,
              info.emailsReachEveryone ? '6 characters, valid 5 minutes.' : 'Starts once emails are sent from your own domain.'
            )}
          </div>

          <div className="p-3 bg-white border border-black/15 space-y-2">
            <div className="font-bold">Telegram for admin login codes</div>
            {!info.telegramBotReady && <div className="text-[#575653]">The Telegram bot is not set up on the server yet.</div>}
            {info.telegramBotReady && info.telegramLinked && (
              <div className="flex flex-wrap items-center gap-2">
                <span>Connected to @{info.telegramBot}.</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Disconnect Telegram? Admin logins will then use the email link only.')) return;
                    call('/api/admin/security/telegram/unlink', {})
                      .then(() => {
                        showToast('Telegram disconnected.');
                        load();
                      })
                      .catch((e) => setError(e.message));
                  }}
                  className="px-2.5 py-1 border border-rose-400 text-rose-700 font-semibold cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            )}
            {info.telegramBotReady && !info.telegramLinked && (
              <div className="space-y-2">
                <ol className="list-decimal pl-4 space-y-1 text-[#454441]">
                  <li>Install Telegram on your phone and sign in.</li>
                  <li>Press the button below, then press START in Telegram.</li>
                  <li>Come back here; it connects by itself.</li>
                </ol>
                {!linkUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      call('/api/admin/security/telegram/link', {})
                        .then((r) => setLinkUrl(r.url))
                        .catch((e) => setError(e.message))
                    }
                    className="px-3 py-2 bg-[#229ED9] text-white font-bold cursor-pointer"
                  >
                    Connect Telegram
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-2 bg-[#229ED9] text-white font-bold">
                      Open Telegram and press START
                    </a>
                    <div className="text-[#575653]">{checking ? 'Waiting for START in Telegram...' : 'Not connected yet. Press "Connect Telegram" again.'}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
