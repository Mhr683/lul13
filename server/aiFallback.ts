import type { GoogleGenAI } from '@google/genai';

// Gemini models are sometimes overloaded ("503 high demand") or out of quota. Every AI call in the
// server goes through this wrapper:
//   - a busy model: the same request is tried on the next model in the chain (skipped for a few minutes)
//   - a key whose free daily limit is used up: the next key is used (each key from another Google
//     account has its own free limit), and the used-up key rests until the limit resets
// The AI only stops when every model on every key is used up; the store then uses its own answers.

const CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
const SKIP_MS = 3 * 60 * 1000;
/** A used-up key is tried again after this (Google resets the free limit daily; per-minute limits sooner) */
const KEY_REST_MS = 30 * 60 * 1000;

const busyUntil = new Map<string, number>();
const keyRestUntil = new Map<string, number>();
const keyStats = new Map<string, { lastOkAt?: number; lastError?: string; lastErrorAt?: number }>();

/** Overloaded, rate-limited or a temporary server error: worth trying another model */
const isBusy = (err: any) => {
  const status = Number(err?.status || err?.code);
  const msg = String(err?.message || '');
  return [429, 500, 503].includes(status) || /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
};
/** This key's own limit is used up (or the key is wrong): the next key should be used */
const isKeyProblem = (err: any) => {
  const status = Number(err?.status || err?.code);
  const msg = String(err?.message || '');
  return [400, 401, 403, 429].includes(status) && /quota|RESOURCE_EXHAUSTED|rate limit|API key|API_KEY|permission|billing/i.test(msg);
};

const tail = (key: string) => key.slice(-6);

/** Status of each key for the admin screen (keys themselves are never returned) */
export function aiKeyStatus(keys: string[]) {
  const now = Date.now();
  return keys.map((k) => {
    const s = keyStats.get(tail(k)) || {};
    const rest = keyRestUntil.get(tail(k)) || 0;
    return {
      key: `••••${k.slice(-4)}`,
      resting: rest > now,
      restingUntil: rest > now ? new Date(rest).toISOString() : null,
      lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null,
      lastError: s.lastError || '',
    };
  });
}

/**
 * One client for all keys: generateContent goes through the keys in turn (used-up keys last) and,
 * on each key, through the model chain. Everything else is the first key's client as it is.
 */
export function withKeyPool(clients: Array<{ key: string; client: GoogleGenAI }>): GoogleGenAI {
  const primary = clients[0].client;
  const calls = clients.map((c) => ({ key: c.key, call: c.client.models.generateContent.bind(c.client.models) }));
  (primary.models as any).generateContent = async (params: any) => {
    const asked = String(params?.model || CHAIN[0]);
    const models = [asked, ...CHAIN.filter((m) => m !== asked)];
    const now = Date.now();
    const keysReady = calls.filter((c) => (keyRestUntil.get(tail(c.key)) || 0) <= now);
    const keysResting = calls.filter((c) => (keyRestUntil.get(tail(c.key)) || 0) > now);
    let lastErr: any;
    for (const k of [...keysReady, ...keysResting]) {
      const id = tail(k.key);
      // Models that were busy a moment ago go last (still tried if all others fail)
      const ready = models.filter((m) => (busyUntil.get(`${id}:${m}`) || 0) <= Date.now());
      const resting = models.filter((m) => (busyUntil.get(`${id}:${m}`) || 0) > Date.now());
      let keyUsedUp = false;
      for (const model of [...ready, ...resting]) {
        try {
          const result = await k.call({ ...params, model });
          busyUntil.delete(`${id}:${model}`);
          keyRestUntil.delete(id);
          keyStats.set(id, { ...keyStats.get(id), lastOkAt: Date.now() });
          return result;
        } catch (err: any) {
          lastErr = err;
          if (isKeyProblem(err)) {
            keyUsedUp = true;
            keyRestUntil.set(id, Date.now() + KEY_REST_MS);
            keyStats.set(id, { ...keyStats.get(id), lastError: String(err?.message || err).slice(0, 160), lastErrorAt: Date.now() });
            console.warn(`[ai] key ••••${k.key.slice(-4)} used up or refused, trying the next key`);
            break;
          }
          if (!isBusy(err)) throw err;
          busyUntil.set(`${id}:${model}`, Date.now() + SKIP_MS);
          console.warn(`[ai] ${model} busy, trying the next model`);
        }
      }
      if (!keyUsedUp && calls.length > 1) continue;
    }
    throw lastErr;
  };
  return primary;
}

/** Older single-key form (kept for callers that build their own client) */
export function withModelFallback(client: GoogleGenAI): GoogleGenAI {
  return withKeyPool([{ key: 'single', client }]);
}
