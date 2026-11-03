import type { GoogleGenAI } from '@google/genai';

// Gemini models are sometimes overloaded ("503 high demand") or out of quota. Every AI call in the
// server goes through this wrapper: when the model it asked for is busy, the same request is tried
// on the next model in the chain, and a busy model is skipped for a few minutes.

const CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
const SKIP_MS = 3 * 60 * 1000;
const busyUntil = new Map<string, number>();

/** Overloaded, rate-limited or a temporary server error: worth trying another model */
const isBusy = (err: any) => {
  const status = Number(err?.status || err?.code);
  const msg = String(err?.message || '');
  return [429, 500, 503].includes(status) || /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
};

/** The client with generateContent made resilient; everything else is the client as it is */
export function withModelFallback(client: GoogleGenAI): GoogleGenAI {
  const original = client.models.generateContent.bind(client.models);
  (client.models as any).generateContent = async (params: any) => {
    const asked = String(params?.model || CHAIN[0]);
    const order = [asked, ...CHAIN.filter((m) => m !== asked)];
    const now = Date.now();
    // Models that were busy a moment ago go last (still tried if all others fail)
    const ready = order.filter((m) => (busyUntil.get(m) || 0) <= now);
    const resting = order.filter((m) => (busyUntil.get(m) || 0) > now);
    let lastErr: any;
    for (const model of [...ready, ...resting]) {
      try {
        const result = await original({ ...params, model });
        busyUntil.delete(model);
        return result;
      } catch (err) {
        lastErr = err;
        if (!isBusy(err)) throw err;
        busyUntil.set(model, Date.now() + SKIP_MS);
        console.warn(`[ai] ${model} busy, trying the next model`);
      }
    }
    throw lastErr;
  };
  return client;
}
