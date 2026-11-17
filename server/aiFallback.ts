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
const MAX_ATTEMPTS = 12;

const busyUntil = new Map<string, number>();
const keyRestUntil = new Map<string, number>();
// One model's limit on one key used up (e.g. the voice model): only that model rests on that key,
// the key's other models keep working
const modelRestUntil = new Map<string, number>();
const restId = (keyId: string, model: string) => `${keyId}|${model}`;
/** That model's own limit on this key (429 / quota), not a wrong or blocked key */
const isLimitHit = (err: any) => {
  const status = Number(err?.status || err?.code);
  return status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota|rate limit/i.test(String(err?.message || ''));
};
const keyStats = new Map<string, { lastOkAt?: number; lastError?: string; lastErrorAt?: number }>();

/** Overloaded, rate-limited or a temporary server error: worth trying another model */
const isBusy = (err: any) => {
  const status = Number(err?.status || err?.code);
  const msg = String(err?.message || '');
  return (
    [429, 500, 503, 504].includes(status) ||
    /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|high demand|overloaded|timed? ?out|abort/i.test(msg) ||
    /AbortError|TimeoutError/.test(String(err?.name || ''))
  );
};
// A model that hangs is given up after this, so the next one still answers in time (the page waits ~100 s).
// A call can ask for longer with config.httpOptions.timeout.
const CALL_TIMEOUT_MS = 40_000;
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
    const resting = (c: { key: string }) =>
      (keyRestUntil.get(tail(c.key)) || 0) > now || (modelRestUntil.get(restId(tail(c.key), asked)) || 0) > now;
    const keysReady = calls.filter((c) => !resting(c));
    const keysResting = calls.filter((c) => resting(c));
    let lastErr: any;
    // At most this many tries per question, so a busy Google answers quickly instead of trying every
    // model on every key (the store's own answers are used then)
    let attempts = 0;
    for (const k of [...keysReady, ...keysResting]) {
      if (attempts >= MAX_ATTEMPTS) break;
      const id = tail(k.key);
      // Models that were busy a moment ago go last (a busy model is busy for every key)
      // Models whose own limit on this key is used up go last too
      const free = (m: string) => (busyUntil.get(m) || 0) <= Date.now() && (modelRestUntil.get(restId(id, m)) || 0) <= Date.now();
      const ready = models.filter(free);
      const resting = models.filter((m) => !free(m));
      let keyUsedUp = false;
      // A few fresh models per key (with one key: all of them, so the lighter models that are often
      // free still get their turn); when every model is busy, one try per key is enough
      for (const model of ready.length ? ready.slice(0, calls.length > 1 ? 3 : CHAIN.length) : resting.slice(0, 1)) {
        if (attempts++ >= MAX_ATTEMPTS) break;
        try {
          const result = await k.call({
            ...params,
            model,
            config: { ...(params?.config || {}), httpOptions: { timeout: CALL_TIMEOUT_MS, ...(params?.config?.httpOptions || {}) } },
          });
          busyUntil.delete(model);
          keyRestUntil.delete(id);
          modelRestUntil.delete(restId(id, model));
          keyStats.set(id, { ...keyStats.get(id), lastOkAt: Date.now() });
          return result;
        } catch (err: any) {
          lastErr = err;
          if (isKeyProblem(err)) {
            keyUsedUp = true;
            // A used-up limit rests only this model on this key; a wrong / blocked key rests entirely
            if (isLimitHit(err)) modelRestUntil.set(restId(id, model), Date.now() + KEY_REST_MS);
            else keyRestUntil.set(id, Date.now() + KEY_REST_MS);
            if (modelRestUntil.size > 2000) modelRestUntil.clear();
            keyStats.set(id, { ...keyStats.get(id), lastError: String(err?.message || err).slice(0, 160), lastErrorAt: Date.now() });
            console.warn(`[ai] key ••••${k.key.slice(-4)} used up or refused, trying the next key`);
            break;
          }
          if (!isBusy(err)) throw err;
          busyUntil.set(model, Date.now() + SKIP_MS);
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
