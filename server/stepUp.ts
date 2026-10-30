import type express from 'express';
import crypto from 'crypto';

// Extra login checks ("step-up") after the normal Firebase sign-in.
//
//   Super admin:  captcha (when Turnstile keys are set) -> "Yes, it's me" link emailed to the
//                 account -> 6-character code on Telegram (once Telegram is connected in Settings)
//   Seller:       captcha (when Turnstile keys are set) -> 6-character code by email (once emails
//                 can reach any address, i.e. EMAIL_FROM is not the resend.dev test sender)
//
// Passing every check adds this sign-in's auth_time to the account's `stepUp` custom claim. The
// claim stays in the ID token until that sign-in is logged out, so the person stays signed in on
// that device; a sign-in on another device has a different auth_time and must pass the checks
// again. Firestore rules and the server both require the claim (super admin power / seller APIs).
//
// Pending checks live in this server's memory (no Firestore reads or writes); only the Telegram
// chat id is saved, in admin_config/security.
//
// Emergency switches in .env: ADMIN_STEP_UP=off, SELLER_STEP_UP=off, ADMIN_STEP_UP_TELEGRAM=off.

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
type Portal = 'ADMIN' | 'SELLER';
type Step = 'EMAIL_LINK' | 'TELEGRAM_CODE' | 'EMAIL_CODE';

export interface StepUpDeps {
  adminDb: FirebaseFirestore.Firestore;
  adminAuth: {
    verifyIdToken: (token: string) => Promise<any>;
    getUser: (uid: string) => Promise<{ customClaims?: Record<string, any> }>;
    setCustomUserClaims: (uid: string, claims: Record<string, any> | null) => Promise<void>;
  };
  requireAuth: Handler;
  requireSuperAdmin: Handler;
  /** The caller's role (SUPER_ADMIN, ADMIN, ..., CUSTOMER) */
  roleOf: (decoded: any) => Promise<string>;
  /** Address the emailed "Yes, it's me" link opens (the admin site) */
  adminOrigin: (req: express.Request) => string;
  storeName: () => Promise<string>;
  sendLoginEmail: (params: { to: string; portal: Portal; link?: string; code?: string; storeName: string }) => Promise<{ success: boolean; error?: string }>;
}

const CODE_TTL_MS = 5 * 60 * 1000;
const LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const MAX_CODE_TRIES = 5;
const MAX_CODE_SENDS = 5;
const MAX_CLAIMED_SIGNINS = 5;

const env = (name: string) => (process.env[name] || '').trim();
const isOff = (name: string) => /^(off|false|0|no)$/i.test(env(name));

// Turnstile (Cloudflare captcha): on when both keys are in .env
const captchaSiteKey = () => (env('TURNSTILE_SITE_KEY') && env('TURNSTILE_SECRET_KEY') ? env('TURNSTILE_SITE_KEY') : '');
// The resend.dev test sender only delivers to the Resend account's own address
const emailsReachEveryone = () => {
  const from = env('EMAIL_FROM');
  return Boolean(env('RESEND_API_KEY')) && Boolean(from) && !/@resend\.dev\b/i.test(from);
};

export const adminStepUpRequired = () => !isOff('ADMIN_STEP_UP');
export const sellerStepUpRequired = () => !isOff('SELLER_STEP_UP') && Boolean(captchaSiteKey() || emailsReachEveryone());

/** True when this ID token's sign-in has passed the checks */
export const hasStepUp = (decoded: any) =>
  Array.isArray(decoded?.stepUp) && typeof decoded?.auth_time === 'number' && decoded.stepUp.includes(decoded.auth_time);

// 6 characters with at least one capital letter, one small letter and one digit (look-alikes such
// as O/0 and l/1 left out so the code is easy to read off a phone)
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
export function makeLoginCode(): string {
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const all = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(all), pick(all), pick(all)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}***@${domain}`;
};

interface Pending {
  uid: string;
  email: string;
  portal: Portal;
  authTime: number;
  steps: Step[];
  emailOk: boolean;
  linkToken?: string;
  linkExpiresAt?: number;
  code?: string;
  codeExpiresAt?: number;
  codeTries: number;
  codeSends: number;
  codeChannel?: 'TELEGRAM' | 'EMAIL';
  createdAt: number;
}

export function registerStepUpRoutes(app: express.Express, deps: StepUpDeps) {
  const { adminDb, adminAuth } = deps;
  const pending = new Map<string, Pending>();
  const startsByUid = new Map<string, number[]>();
  const keyOf = (uid: string, authTime: number) => `${uid}:${authTime}`;

  const sweep = () => {
    const now = Date.now();
    for (const [k, p] of pending) if (now - p.createdAt > SESSION_TTL_MS) pending.delete(k);
  };

  // ---------- Telegram ----------
  const securityRef = adminDb.collection('admin_config').doc('security');
  let telegramChatCache: { id: string; at: number } | null = null;
  const telegramToken = () => env('TELEGRAM_BOT_TOKEN');
  const telegramChatId = async (): Promise<string> => {
    if (!telegramToken() || isOff('ADMIN_STEP_UP_TELEGRAM')) return '';
    if (telegramChatCache && Date.now() - telegramChatCache.at < 10 * 60 * 1000) return telegramChatCache.id;
    const snap = await securityRef.get().catch(() => null);
    const id = String(snap?.data()?.telegramChatId || '');
    telegramChatCache = { id, at: Date.now() };
    return id;
  };
  const telegram = async (method: string, body: Record<string, any> = {}) => {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data?.ok) throw new Error(data?.description || `Telegram ${method} failed`);
    return data.result;
  };

  // ---------- Captcha ----------
  const captchaPassed = async (token: string, ip: string) => {
    if (!captchaSiteKey()) return true;
    if (!token) return false;
    try {
      const form = new URLSearchParams({ secret: env('TURNSTILE_SECRET_KEY'), response: token, remoteip: ip });
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
      const data: any = await res.json();
      return Boolean(data?.success);
    } catch {
      return false;
    }
  };

  // ---------- Claim ----------
  const grant = async (uid: string, authTime: number) => {
    const user = await adminAuth.getUser(uid);
    const claims = { ...(user.customClaims || {}) };
    const list = (Array.isArray(claims.stepUp) ? claims.stepUp : []).filter((t: any) => typeof t === 'number' && t !== authTime);
    claims.stepUp = [...list.slice(-(MAX_CLAIMED_SIGNINS - 1)), authTime];
    await adminAuth.setCustomUserClaims(uid, claims);
  };
  const forget = async (uid: string, authTime: number) => {
    const user = await adminAuth.getUser(uid);
    const claims = { ...(user.customClaims || {}) };
    if (!Array.isArray(claims.stepUp) || !claims.stepUp.includes(authTime)) return;
    claims.stepUp = claims.stepUp.filter((t: any) => t !== authTime);
    await adminAuth.setCustomUserClaims(uid, claims);
  };

  const sendCode = async (p: Pending, storeName: string) => {
    p.code = makeLoginCode();
    p.codeExpiresAt = Date.now() + CODE_TTL_MS;
    p.codeTries = 0;
    p.codeSends += 1;
    if (p.steps.includes('TELEGRAM_CODE')) {
      p.codeChannel = 'TELEGRAM';
      await telegram('sendMessage', {
        chat_id: await telegramChatId(),
        text: `${storeName} Admin login code: ${p.code}\n\nValid for 5 minutes. If this is not you, do not share it and change your Gmail password.`,
      });
    } else {
      p.codeChannel = 'EMAIL';
      const r = await deps.sendLoginEmail({ to: p.email, portal: p.portal, code: p.code, storeName });
      if (!r.success) throw new Error(r.error || 'Email could not be sent.');
    }
  };

  const statusOf = (p: Pending | undefined) =>
    p
      ? {
          portal: p.portal,
          steps: p.steps,
          email: maskEmail(p.email),
          emailOk: p.emailOk,
          codeChannel: p.code ? p.codeChannel : null,
          codeExpiresAt: p.code ? p.codeExpiresAt : null,
        }
      : null;

  const decodedOf = (req: express.Request) => (req as any).stepUpToken as any;

  // requireAuth plus the raw token (auth_time / sign-in method are needed here)
  const withToken: Handler = async (req, res, next) => {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in first.' });
    try {
      (req as any).stepUpToken = await adminAuth.verifyIdToken(header.slice(7).trim());
      next();
    } catch {
      res.status(401).json({ error: 'Please sign in again.' });
    }
  };

  // ---------- Routes ----------

  // What the login screen needs to show (public)
  app.get('/api/auth/step-up/config', (_req, res) => {
    res.json({ captchaSiteKey: captchaSiteKey() || null, sellerRequired: sellerStepUpRequired(), adminRequired: adminStepUpRequired() });
  });

  app.post('/api/auth/step-up/start', withToken, async (req, res) => {
    sweep();
    const decoded = decodedOf(req);
    const portal: Portal = req.body?.portal === 'SELLER' ? 'SELLER' : 'ADMIN';
    const authTime = Number(decoded.auth_time);
    const email = String(decoded.email || '').toLowerCase();
    if (!email) return res.status(403).json({ error: 'This account has no email address.' });
    // (a seller's emailed code itself proves the address, so new sellers can verify later)
    if (portal === 'ADMIN' && !decoded.email_verified) {
      return res.status(403).json({ error: 'Verify your email address first (open the link we emailed you).' });
    }

    // At most 5 starts per account in 15 minutes
    const now = Date.now();
    const recent = (startsByUid.get(decoded.uid) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes and try again.' });
    startsByUid.set(decoded.uid, [...recent, now]);

    const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
    if (!(await captchaPassed(String(req.body?.captchaToken || ''), ip))) {
      return res.status(400).json({ error: 'Captcha check failed. Please try again.', code: 'CAPTCHA_FAILED' });
    }

    let steps: Step[] = [];
    if (portal === 'ADMIN') {
      const role = await deps.roleOf(decoded);
      if (role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'This account is not the super admin.' });
      // A Gmail owner must sign in with Google, so Google's own checks (2-Step Verification,
      // "Yes, it's me" on the phone) protect the login
      if (/@gmail\.com$/.test(email) && decoded.firebase?.sign_in_provider !== 'google.com') {
        return res.status(403).json({ error: 'Sign in with the "Sign in with Google" button.', code: 'GOOGLE_REQUIRED' });
      }
      if (adminStepUpRequired()) {
        steps = ['EMAIL_LINK'];
        if (await telegramChatId()) steps.push('TELEGRAM_CODE');
      }
    } else if (sellerStepUpRequired() && emailsReachEveryone()) {
      steps = ['EMAIL_CODE'];
    }

    try {
      if (!steps.length) {
        await grant(decoded.uid, authTime);
        return res.json({ done: true });
      }
      const p: Pending = { uid: decoded.uid, email, portal, authTime, steps, emailOk: false, codeTries: 0, codeSends: 0, createdAt: now };
      const storeName = await deps.storeName();
      if (steps.includes('EMAIL_LINK')) {
        p.linkToken = crypto.randomBytes(24).toString('hex');
        p.linkExpiresAt = now + LINK_TTL_MS;
        const link = `${deps.adminOrigin(req)}/api/auth/step-up/email?k=${p.linkToken}`;
        const r = await deps.sendLoginEmail({ to: email, portal, link, storeName });
        if (!r.success) throw new Error(r.error || 'Email could not be sent.');
      } else {
        await sendCode(p, storeName);
      }
      pending.set(keyOf(decoded.uid, authTime), p);
      res.json({ done: false, status: statusOf(p) });
    } catch (err: any) {
      console.error('[step-up/start] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not send the login check. Please try again in a minute.' });
    }
  });

  app.get('/api/auth/step-up/status', withToken, async (req, res) => {
    const decoded = decodedOf(req);
    const authTime = Number(decoded.auth_time);
    const p = pending.get(keyOf(decoded.uid, authTime));
    let done = hasStepUp(decoded);
    // The emailed link finished the checks: the claim is on the account but not yet in this token
    if (!done && !p) {
      const user = await adminAuth.getUser(decoded.uid).catch(() => null);
      const list = user?.customClaims?.stepUp;
      done = Array.isArray(list) && list.includes(authTime);
    }
    res.json({ done, status: statusOf(p) });
  });

  // The emailed link opens a page with a button (a plain GET does nothing, so email scanners that
  // open links cannot approve a login by themselves)
  const findByLink = (k: string) => {
    if (!/^[a-f0-9]{48}$/.test(k)) return undefined;
    for (const p of pending.values()) if (p.linkToken && sameText(p.linkToken, k)) return p;
    return undefined;
  };
  const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#FBFBF9;color:#141413;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}main{max-width:420px;background:#fff;border:1px solid #0002;padding:28px}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;line-height:1.5}button{padding:12px 20px;background:#141413;color:#fff;border:0;font-weight:700;font-size:14px;cursor:pointer}</style></head><body><main>${body}</main></body></html>`;

  app.get('/api/auth/step-up/email', (req, res) => {
    const k = String(req.query.k || '');
    const p = findByLink(k);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!p || p.emailOk || Date.now() > (p.linkExpiresAt || 0)) {
      return res.status(410).send(page('Link expired', '<h1>This link has expired</h1><p>Start the login again on your device.</p>'));
    }
    res.send(
      page(
        'Confirm login',
        `<h1>Is this you signing in?</h1><p>Someone is signing in to the admin panel with this email. Press the button only if it is you.</p>
<form method="post" action="/api/auth/step-up/email"><input type="hidden" name="k" value="${k}"><button type="submit">Yes, it's me</button></form>
<p style="color:#B91C1C;font-size:12px">If this is not you, close this page and change your Gmail password.</p>`
      )
    );
  });

  app.post('/api/auth/step-up/email', async (req, res) => {
    const k = String(req.body?.k || '');
    const p = findByLink(k);
    res.setHeader('Cache-Control', 'no-store');
    if (!p || p.emailOk || Date.now() > (p.linkExpiresAt || 0)) {
      return res.status(410).send(page('Link expired', '<h1>This link has expired</h1><p>Start the login again on your device.</p>'));
    }
    p.emailOk = true;
    p.linkToken = undefined;
    try {
      if (p.steps.includes('TELEGRAM_CODE')) {
        await sendCode(p, await deps.storeName());
        return res.send(page('Check Telegram', '<h1>Email verified</h1><p>A 6-character code has been sent to your Telegram. Type it on the login screen within 5 minutes.</p>'));
      }
      await grant(p.uid, p.authTime);
      pending.delete(keyOf(p.uid, p.authTime));
      res.send(page('Login verified', '<h1>Login verified</h1><p>Go back to the admin panel; it opens by itself in a few seconds.</p>'));
    } catch (err: any) {
      console.error('[step-up/email] failed:', err?.message || err);
      p.emailOk = false;
      res.status(503).send(page('Try again', '<h1>Something went wrong</h1><p>Start the login again on your device.</p>'));
    }
  });

  app.post('/api/auth/step-up/code', withToken, async (req, res) => {
    const decoded = decodedOf(req);
    const key = keyOf(decoded.uid, Number(decoded.auth_time));
    const p = pending.get(key);
    const code = String(req.body?.code || '').trim();
    if (!p || !p.code) return res.status(400).json({ error: 'No code is waiting. Start the login again.' });
    if (p.steps.includes('EMAIL_LINK') && !p.emailOk) return res.status(400).json({ error: 'First press "Yes, it\'s me" in the email.' });
    if (Date.now() > (p.codeExpiresAt || 0)) return res.status(400).json({ error: 'The code has expired. Press "Send a new code".', code: 'CODE_EXPIRED' });
    if (!sameText(p.code, code)) {
      p.codeTries += 1;
      if (p.codeTries >= MAX_CODE_TRIES) {
        p.code = undefined;
        return res.status(400).json({ error: 'Too many wrong codes. Press "Send a new code".', code: 'CODE_EXPIRED' });
      }
      return res.status(400).json({ error: `Wrong code (capital and small letters matter). ${MAX_CODE_TRIES - p.codeTries} tries left.` });
    }
    try {
      await grant(p.uid, p.authTime);
      pending.delete(key);
      res.json({ done: true });
    } catch (err: any) {
      console.error('[step-up/code] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not finish the login. Please try again.' });
    }
  });

  app.post('/api/auth/step-up/resend', withToken, async (req, res) => {
    const decoded = decodedOf(req);
    const p = pending.get(keyOf(decoded.uid, Number(decoded.auth_time)));
    if (!p || (p.steps.includes('EMAIL_LINK') && !p.emailOk)) return res.status(400).json({ error: 'Start the login again.' });
    if (p.codeSends >= MAX_CODE_SENDS) return res.status(429).json({ error: 'Too many codes sent. Log out and start again later.' });
    try {
      await sendCode(p, await deps.storeName());
      res.json({ status: statusOf(p) });
    } catch (err: any) {
      console.error('[step-up/resend] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not send a new code. Please try again.' });
    }
  });

  // Logout: this device's sign-in no longer counts as checked
  app.post('/api/auth/step-up/logout', withToken, async (req, res) => {
    const decoded = decodedOf(req);
    pending.delete(keyOf(decoded.uid, Number(decoded.auth_time)));
    try {
      await forget(decoded.uid, Number(decoded.auth_time));
    } catch (err: any) {
      console.error('[step-up/logout] failed:', err?.message || err);
    }
    res.json({ success: true });
  });

  // ---------- Settings: login security (super admin) ----------
  let linkWaiting: { code: string; expiresAt: number } | null = null;
  let telegramOffset = 0;

  app.get('/api/admin/security', deps.requireSuperAdmin, async (_req, res) => {
    let botName = '';
    if (telegramToken()) botName = await telegram('getMe').then((me: any) => me.username || '').catch(() => '');
    res.json({
      captcha: Boolean(captchaSiteKey()),
      emailsReachEveryone: emailsReachEveryone(),
      adminStepUp: adminStepUpRequired(),
      sellerStepUp: sellerStepUpRequired(),
      telegramBotReady: Boolean(botName),
      telegramBot: botName,
      telegramLinked: Boolean(await telegramChatId()),
    });
  });

  app.post('/api/admin/security/telegram/link', deps.requireSuperAdmin, async (_req, res) => {
    if (!telegramToken()) return res.status(400).json({ error: 'The Telegram bot is not set up on the server yet.' });
    try {
      const me = await telegram('getMe');
      linkWaiting = { code: crypto.randomBytes(8).toString('hex'), expiresAt: Date.now() + 10 * 60 * 1000 };
      res.json({ url: `https://t.me/${me.username}?start=${linkWaiting.code}` });
    } catch (err: any) {
      console.error('[security/telegram/link] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not reach Telegram. Check the bot token.' });
    }
  });

  app.post('/api/admin/security/telegram/check', deps.requireSuperAdmin, async (_req, res) => {
    if (!linkWaiting || Date.now() > linkWaiting.expiresAt) return res.json({ linked: false, expired: true });
    try {
      const updates: any[] = await telegram('getUpdates', { offset: telegramOffset, timeout: 0, allowed_updates: ['message'] });
      let chatId = '';
      for (const u of updates) {
        telegramOffset = Math.max(telegramOffset, Number(u.update_id) + 1);
        const text = String(u.message?.text || '').trim();
        if (u.message?.chat?.type === 'private' && text === `/start ${linkWaiting.code}`) chatId = String(u.message.chat.id);
      }
      if (!chatId) return res.json({ linked: false });
      await securityRef.set({ telegramChatId: chatId, telegramLinkedAt: new Date().toISOString() }, { merge: true });
      telegramChatCache = { id: chatId, at: Date.now() };
      linkWaiting = null;
      await telegram('sendMessage', { chat_id: chatId, text: 'Connected. Admin login codes will come here.' }).catch(() => {});
      res.json({ linked: true });
    } catch (err: any) {
      console.error('[security/telegram/check] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not reach Telegram.' });
    }
  });

  app.post('/api/admin/security/telegram/unlink', deps.requireSuperAdmin, async (_req, res) => {
    try {
      await securityRef.set({ telegramChatId: '', telegramLinkedAt: '' }, { merge: true });
      telegramChatCache = { id: '', at: Date.now() };
      res.json({ success: true });
    } catch (err: any) {
      console.error('[security/telegram/unlink] failed:', err?.message || err);
      res.status(503).json({ error: 'Could not disconnect Telegram.' });
    }
  });

  // Seller APIs need a checked sign-in once seller checks are on (the onboarding info stays open)
  const sellerGuard: Handler = async (req, res, next) => {
    if (!sellerStepUpRequired() || req.path === '/onboarding-config') return next();
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) return next();
    try {
      const decoded = await adminAuth.verifyIdToken(header.slice(7).trim());
      if (hasStepUp(decoded)) return next();
      return res.status(403).json({ error: 'Please finish the login check first.', code: 'STEP_UP_REQUIRED' });
    } catch {
      return next();
    }
  };
  app.use('/api/seller', sellerGuard);
}
