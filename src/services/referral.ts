// Refer & Earn on this device: a friend's link (?ref=CODE) is remembered for 30 days and sent with
// the first order; the server decides whether it counts (only a new customer's first order).

const KEY = 'ref_code_v1';
const DAYS = 30;

export function captureReferralFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code && /^[A-Z0-9]{4,20}$/i.test(code)) {
      localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
    }
  } catch {}
}

export function getReferralCode(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v?.code && Date.now() - Number(v.at) < DAYS * 86400_000) return String(v.code);
  } catch {}
  return '';
}

export const referralLink = (code: string) => `${window.location.origin}/?ref=${encodeURIComponent(code)}`;

if (typeof window !== 'undefined') captureReferralFromUrl();
