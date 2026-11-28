// Shared by the daily video (server/dailyVideo.ts) and the AI Social Manager (server/socialManager.ts):
// Facebook / Instagram Graph calls, the Page token, opening a product picture, and the products that
// must never go on the store's Page.
import fs from 'fs';
import path from 'path';

export const GRAPH = 'https://graph.facebook.com/v23.0';
const env = (k: string) => String(process.env[k] || '').trim();

/** One Graph API call (form-encoded); throws Meta's own error message */
export async function graph(pathname: string, params: Record<string, string>, method = 'POST') {
  const body = new URLSearchParams(params);
  const r = await fetch(`${GRAPH}/${pathname}${method === 'GET' ? `?${body}` : ''}`, method === 'GET' ? {} : { method, body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

/**
 * The store's Page id, a token that can post on it, and the linked Instagram account (.env:
 * META_PAGE_ID, META_PAGE_TOKEN, META_IG_USER_ID). A system-user token (Business Settings) is turned
 * into the Page's own token, which posting needs.
 */
// The Instagram account linked to the Page, found through the Page itself (so the owner only links it
// in Facebook's own settings, no id to copy). Looked up again at most every 10 minutes when missing.
let igFound: { at: number; id: string } = { at: 0, id: '' };
export async function pageAccess(o: { recheck?: boolean } = {}): Promise<{ pageId: string; token: string; igUser: string }> {
  const pageId = env('META_PAGE_ID');
  let token = env('META_PAGE_TOKEN');
  let igUser = env('META_IG_USER_ID');
  if (pageId && token) {
    try {
      const pt = (await graph(pageId, { fields: 'access_token', access_token: token }, 'GET')).access_token;
      if (pt) token = pt;
    } catch {
      /* already a Page token */
    }
    if (!igUser) {
      if (o.recheck || (!igFound.id && Date.now() - igFound.at > 10 * 60_000)) {
        try {
          const r = await graph(pageId, { fields: 'instagram_business_account', access_token: token }, 'GET');
          igFound = { at: Date.now(), id: String(r.instagram_business_account?.id || '') };
        } catch {
          igFound = { at: Date.now(), id: '' };
        }
      }
      igUser = igFound.id;
    }
  }
  return { pageId, token, igUser };
}

/** A product picture's bytes: the store's own /media files from disk, anything else fetched */
export async function loadPicture(u: string, mediaDir: string, localOrigin: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    let buf: Buffer;
    let type = 'image/jpeg';
    if (u.startsWith('/media/')) {
      const name = path.basename(u);
      buf = await fs.promises.readFile(path.join(mediaDir, name));
      if (/\.png$/i.test(name)) type = 'image/png';
      else if (/\.webp$/i.test(name)) type = 'image/webp';
    } else {
      const abs = u.startsWith('/') ? `${localOrigin}${u}` : u;
      if (!/^https?:\/\//.test(abs)) return null;
      const r = await fetch(abs, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return null;
      type = r.headers.get('content-type')?.split(';')[0] || type;
      if (!type.startsWith('image/')) return null;
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (buf.length > 8 * 1024 * 1024) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

// Products Facebook / Instagram do not allow to be advertised or that put the Page at risk (adult,
// medicines and health claims, weapons, tobacco, copies of brands). Never posted on the store's Page.
export const BLOCKED =
  /\b(sex|sexual|timing|delay\s*(cream|spray|oil|tablet)|condom|lubricant|viagra|cialis|enlarge\w*|libido|erotic|adult|lingerie|bra\b|panty|panties|vibrator|massager\s*for\s*(men|women)|weight\s*loss|slimming|fat\s*burn\w*|diet\s*pill|medicine|tablet\s*for|capsule|herbal|ayurved\w*|hakeem|cure|whitening\s*(cream|injection)|fairness|steroid|cbd|hemp|vape|e-?cig\w*|cigarette|tobacco|hookah|shisha|gun|pistol|airsoft|weapon|knife|dagger|sword|taser|stun|pepper\s*spray|replica|first\s*copy|master\s*copy|aaa\s*quality)\b/i;

// Pakistani brands (the shared list in src/services/brandRules.ts has the international ones)
export const LOCAL_BRANDS =
  /\b(junaid\s*jamshed|j\.\s*junaid|khaadi|gul\s*ahmed|sana\s*safinaz|maria\.?\s*b|alkaram|sapphire|nishat|bonanza|limelight|outfitters|bata|servis|ndure|almirah|edenrobe|beechtree|zeen|asim\s*jofa|agha\s*noor|baroque|charcoal|diners)\b/i;

export const pkDate = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
export const pkHour = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).getUTCHours();
