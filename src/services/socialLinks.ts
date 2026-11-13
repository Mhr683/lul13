// A shop's social media links (Seller Center → Profile → Social media; shown on the shop page).
// Used by the server (checks what is saved) and the browser (form + icons), so both follow the same rules.
//
// Personal contact links are not accepted (wa.me numbers, WhatsApp groups, phone numbers, e-mail):
// customers order and talk through the store, the same rule as the order chat (server/orderChat.ts).

export type SocialPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK' | 'X' | 'TELEGRAM' | 'WHATSAPP_CHANNEL' | 'OTHER';
export type SocialLink = { platform: SocialPlatform; url: string; label?: string };

export const SOCIAL_PLATFORMS: {
  id: Exclude<SocialPlatform, 'OTHER'>;
  label: string;
  color: string;
  hosts: RegExp;
  example: string;
}[] = [
  { id: 'FACEBOOK', label: 'Facebook', color: '#1877F2', hosts: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i, example: 'facebook.com/yourpage' },
  { id: 'INSTAGRAM', label: 'Instagram', color: '#E1306C', hosts: /(^|\.)(instagram\.com|instagr\.am)$/i, example: 'instagram.com/yourshop' },
  { id: 'YOUTUBE', label: 'YouTube', color: '#FF0000', hosts: /(^|\.)(youtube\.com|youtu\.be)$/i, example: 'youtube.com/@yourshop' },
  { id: 'TIKTOK', label: 'TikTok', color: '#111111', hosts: /(^|\.)tiktok\.com$/i, example: 'tiktok.com/@yourshop' },
  { id: 'X', label: 'X (Twitter)', color: '#000000', hosts: /(^|\.)(x\.com|twitter\.com)$/i, example: 'x.com/yourshop' },
  { id: 'TELEGRAM', label: 'Telegram channel', color: '#229ED9', hosts: /(^|\.)(t\.me|telegram\.me)$/i, example: 't.me/yourchannel' },
  { id: 'WHATSAPP_CHANNEL', label: 'WhatsApp channel', color: '#25D366', hosts: /(^|\.)whatsapp\.com$/i, example: 'whatsapp.com/channel/...' },
];
export const MAX_SOCIAL_LINKS = 12;

export const platformInfo = (p: SocialPlatform) => SOCIAL_PLATFORMS.find((x) => x.id === p);
export const socialLabel = (l: SocialLink) => (l.platform === 'OTHER' ? l.label || 'Link' : platformInfo(l.platform)?.label || l.platform);

/** Recognises the platform from a pasted link (anything else is "OTHER") */
export function guessPlatform(url: string): SocialPlatform {
  try {
    const host = new URL(withHttps(url)).hostname.replace(/^www\.|^m\./i, '');
    return SOCIAL_PLATFORMS.find((p) => p.hosts.test(host))?.id || 'OTHER';
  } catch {
    return 'OTHER';
  }
}

const withHttps = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Checks one link: the clean link, or why it cannot be saved */
export function checkSocialLink(raw: { platform?: string; url?: string; label?: string }): { link?: SocialLink; error?: string } {
  const text = String(raw.url || '').trim();
  if (!text) return {};
  const platform = (SOCIAL_PLATFORMS.some((p) => p.id === raw.platform) || raw.platform === 'OTHER' ? raw.platform : guessPlatform(text)) as SocialPlatform;
  const name = platform === 'OTHER' ? String(raw.label || '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
  const what = platform === 'OTHER' ? name || 'This link' : platformInfo(platform)!.label;
  if (/^(mailto|tel|sms):/i.test(text) || /@[a-z0-9-]+\.[a-z]{2,}/i.test(text)) return { error: `${what}: e-mail addresses and phone numbers are not allowed. Add a page or channel link.` };
  let u: URL;
  try {
    u = new URL(withHttps(text));
  } catch {
    return { error: `${what}: this is not a valid link.` };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: `${what}: this is not a valid link.` };
  u.protocol = 'https:';
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  const url = u.toString().slice(0, 300);
  // Personal chats take the deal off the store: only public pages / channels
  if (/(^|\.)wa\.me$|api\.whatsapp\.com|chat\.whatsapp\.com/i.test(u.hostname) || (/whatsapp\.com$/i.test(host) && !/^\/channel\//i.test(u.pathname))) {
    return { error: 'WhatsApp: only a WhatsApp Channel link is allowed (whatsapp.com/channel/...), not your number or a group. Customers order through the store.' };
  }
  if (/\d[\d\s\-.]{8,}\d/.test(decodeURIComponent(u.pathname + u.search))) return { error: `${what}: phone numbers are not allowed in links.` };
  if (platform === 'OTHER') {
    if (name.length < 2) return { error: 'Write a name for your extra link (e.g. "Pinterest" or "My website").' };
    if (!/\./.test(host)) return { error: `${name}: this is not a valid link.` };
    return { link: { platform, url, label: name } };
  }
  const info = platformInfo(platform)!;
  if (!info.hosts.test(host)) return { error: `${info.label}: paste your ${info.label} page link here, e.g. ${info.example}.` };
  if (u.pathname.replace(/\/+$/, '') === '') return { error: `${info.label}: add your page's link, not only ${host}.` };
  return { link: { platform, url } };
}

/** Checks a whole list; stops at the first problem so the seller sees what to fix */
export function cleanSocialLinks(input: unknown): { links: SocialLink[]; error?: string } {
  const list = Array.isArray(input) ? input : [];
  const links: SocialLink[] = [];
  for (const raw of list.slice(0, MAX_SOCIAL_LINKS * 2)) {
    const { link, error } = checkSocialLink((raw || {}) as any);
    if (error) return { links, error };
    if (link && !links.some((l) => l.url === link.url)) links.push(link);
  }
  if (links.length > MAX_SOCIAL_LINKS) return { links: links.slice(0, MAX_SOCIAL_LINKS), error: `Up to ${MAX_SOCIAL_LINKS} links.` };
  return { links };
}
