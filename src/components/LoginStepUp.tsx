import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { getAuthHeaders } from '../lib/firebase';

// Extra login checks after signing in (server/stepUp.ts):
//   super admin: captcha -> "Yes, it's me" email link -> 6-character Telegram code
//   seller:      captcha -> 6-character email code
// Steps that are not set up on the server yet are skipped by the server.

type Portal = 'ADMIN' | 'SELLER';
interface Status {
  portal: Portal;
  steps: string[];
  email: string;
  emailOk: boolean;
  codeChannel: 'TELEGRAM' | 'EMAIL' | null;
  codeExpiresAt: number | null;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string;
      remove: (id: string) => void;
    };
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileLoading: Promise<void> | null = null;
const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        turnstileLoading = null;
        reject(new Error('Captcha could not load.'));
      };
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
};

const api = async (path: string, body?: object) => {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: await getAuthHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { code: data.code });
  return data;
};

const secondsLeft = (until: number | null) => (until ? Math.max(0, Math.round((until - Date.now()) / 1000)) : 0);

export const LoginStepUp: React.FC<{ portal: Portal }> = ({ portal }) => {
  const { firebaseUser, refreshStepUp, signOut } = useStore();
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const captchaBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const finish = async () => {
    await refreshStepUp();
  };

  // Which steps the server has switched on
  useEffect(() => {
    fetch('/api/auth/step-up/config')
      .then((r) => r.json())
      .then((c) => setSiteKey(c.captchaSiteKey || null))
      .catch(() => setSiteKey(null));
  }, []);

  // Captcha widget
  useEffect(() => {
    if (!siteKey || status || !captchaBox.current) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !captchaBox.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(captchaBox.current, {
          sitekey: siteKey,
          callback: (t: string) => setCaptchaToken(t),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, status, captchaRound]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/auth/step-up/start', { portal, captchaToken });
      if (data.done) return await finish();
      setStatus(data.status);
    } catch (e: any) {
      setError(e.message);
      // A captcha answer works once: show a fresh one
      setCaptchaToken('');
      setCaptchaRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  // No captcha on the server: start at once
  useEffect(() => {
    if (siteKey === null && !status && !busy && !error) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  // While waiting for the email link: ask the server every 3 seconds (no database reads)
  useEffect(() => {
    if (!status || (status.emailOk && status.codeChannel) || !status.steps.includes('EMAIL_LINK')) return;
    const t = setInterval(async () => {
      try {
        const data = await api('/api/auth/step-up/status');
        if (data.done) return finish();
        if (data.status) setStatus(data.status);
        else {
          // The server restarted or the check timed out
          setStatus(null);
          setError('The login check expired. Please start again.');
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.emailOk, status?.codeChannel]);

  // Countdown for the code
  useEffect(() => {
    if (!status?.codeExpiresAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status?.codeExpiresAt]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) return setError('The code has 6 characters.');
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/auth/step-up/code', { code: code.trim() });
      if (data.done) await finish();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/auth/step-up/resend', {});
      setStatus(data.status);
      setCode('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const waitingForLink = status?.steps.includes('EMAIL_LINK') && !status.emailOk;
  const waitingForCode = status && !waitingForLink && status.codeChannel;
  const left = secondsLeft(status?.codeExpiresAt ?? null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] p-4">
      <div className="w-full max-w-md bg-white border border-black/10 p-6 sm:p-8 space-y-5 text-sm text-[#141413]">
        <div>
          <h2 className="text-xl font-display">Login check</h2>
          <p className="text-xs text-[#575653] mt-1">
            {portal === 'ADMIN' ? 'Super admin' : 'Seller Center'} · {firebaseUser?.email}
          </p>
        </div>

        {error && <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs">{error}</div>}

        {!status && (
          <div className="space-y-3">
            <p className="text-xs text-[#575653]">Step 1: show that you are a person, not a robot.</p>
            {siteKey === undefined && <div className="text-xs">Loading...</div>}
            {siteKey && <div ref={captchaBox} />}
            {siteKey && (
              <button
                type="button"
                disabled={!captchaToken || busy}
                onClick={start}
                className="w-full px-4 py-2.5 bg-[#141413] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Please wait...' : 'Continue'}
              </button>
            )}
            {siteKey === null && busy && <div className="text-xs">Please wait...</div>}
            {siteKey === null && !busy && error && (
              <button type="button" onClick={start} className="w-full px-4 py-2.5 bg-[#141413] text-white text-xs font-bold cursor-pointer">
                Try again
              </button>
            )}
          </div>
        )}

        {waitingForLink && (
          <div className="space-y-2">
            <p className="font-semibold">Check your email</p>
            <p className="text-xs text-[#575653]">
              We sent a link to <strong>{status!.email}</strong>. Open the email (on your phone or here) and press
              <strong> "Yes, it's me"</strong> within 10 minutes. This page continues by itself.
            </p>
            <div className="text-xs text-[#575653] animate-pulse">Waiting for the email link...</div>
          </div>
        )}

        {waitingForCode && (
          <form onSubmit={submitCode} className="space-y-3">
            <p className="font-semibold">
              {status!.codeChannel === 'TELEGRAM' ? 'Enter the code sent to your Telegram' : `Enter the code sent to ${status!.email}`}
            </p>
            <p className="text-xs text-[#575653]">6 characters. Capital and small letters matter.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              placeholder="aB3xK9"
              className="w-full px-3 py-3 border-2 border-black/20 font-mono text-2xl tracking-[0.4em] text-center"
            />
            <div className="text-xs text-[#575653]">
              {left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'The code has expired.'}
            </div>
            <button
              type="submit"
              disabled={busy || left === 0}
              className="w-full px-4 py-2.5 bg-[#141413] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Checking...' : 'Verify'}
            </button>
            <button type="button" onClick={resend} disabled={busy} className="text-xs underline cursor-pointer">
              Send a new code
            </button>
          </form>
        )}

        <button type="button" onClick={signOut} className="text-xs underline text-[#575653] cursor-pointer">
          Logout / use another account
        </button>
      </div>
    </div>
  );
};
