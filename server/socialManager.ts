// AI Social Manager (Admin → AI Social Manager). Besides the daily video (server/dailyVideo.ts), the AI
// prepares picture posts for the store's Facebook Page and Instagram: one product post every day on
// its own (when switched on), or a post from the owner's idea ("Eid sale on bags") with the products
// the owner picks. Nothing goes out without the owner's approval: "Approve" posts it at the posting
// hour, "Post now" at once. The accounts are joined through Meta's own tokens (.env META_PAGE_ID,
// META_PAGE_TOKEN, META_IG_USER_ID), never with a password. Sites without a posting API for us (TikTok,
// WhatsApp Channel, X) get the caption and pictures to share by hand.
// State is kept in .cache/social-manager.json (git-ignored).
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { famousBrandIn } from '../src/services/brandRules';
import { BLOCKED, LOCAL_BRANDS, graph, loadPicture, pageAccess, pkDate, pkHour } from './socialShared';

type Post = {
  id: string;
  /** DAILY: the AI's own daily product post; IDEA: from the owner's idea */
  kind: 'DAILY' | 'IDEA';
  day: string;
  idea?: string;
  productIds: string[];
  productNames: string[];
  caption: string;
  /** square JPEG copies (public addresses), up to 4 */
  images: string[];
  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'FAILED';
  createdAt: string;
  decidedAt?: string;
  /** when an approved post goes out (ISO) */
  postAt?: string;
  postedAt?: string;
  tries?: number;
  posted?: { facebook?: string; instagram?: string; errors?: string[] };
  usedAi?: boolean;
};
type Settings = { autoDaily: boolean; postHourPk: number };
type State = { posts: Post[]; settings: Settings; postedProducts: Record<string, string> };

export type SocialManagerDeps = {
  requireAdmin: express.RequestHandler;
  liveProducts: () => any[];
  priceOf: (p: any) => number;
  settings: () => any;
  getAI: () => any;
  picturesOf: (p: any) => string[];
  storeMedia: (buffer: Buffer, ext: string, contentType: string) => Promise<string>;
  mediaDir: string;
  publicOrigin: () => string;
  localOrigin: string;
  emailOwner: (subject: string, paragraphs: string[], button: string, url: string) => Promise<void>;
};

const DRAFT_HOUR_PK = 11; // the daily post is prepared at 11 am and waits for the owner
const AI_MODEL = 'gemini-3.1-flash-lite';
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function registerSocialManager(app: express.Express, d: SocialManagerDeps) {
  const stateFile = path.join(process.cwd(), '.cache', 'social-manager.json');
  let state: State = { posts: [], settings: { autoDaily: true, postHourPk: 20 }, postedProducts: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state = { ...state, ...saved, settings: { ...state.settings, ...(saved.settings || {}) } };
  } catch {
    /* first run */
  }
  const save = () => {
    state.posts = state.posts.slice(-80);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
  };
  const abs = (u: string) => (u.startsWith('/') ? `${d.publicOrigin()}${u}` : u);
  const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
  const adminUrl = () => `${d.publicOrigin().replace('://', '://admin.')}/`;

  // ------------------------------------------------------------------ which products may go on the Page
  const allowed = (p: any) =>
    p &&
    d.priceOf(p) > 0 &&
    Number(p.stock) - Number(p.reservedStock || 0) > 0 &&
    d.picturesOf(p).length > 0 &&
    !BLOCKED.test(`${p.name} ${p.category} ${p.subcategory || ''} ${p.shortDescription || ''}`) &&
    !famousBrandIn(`${p.name} ${p.shortDescription || ''}`) &&
    !LOCAL_BRANDS.test(`${p.name} ${p.shortDescription || ''}`);
  /** Products in the daily video lately (read from its own file), so the two do not repeat each other */
  const videoProducts = () => {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.cache', 'daily-video.json'), 'utf8'));
      const ids = new Set<string>(Object.keys(v.postedProducts || {}));
      for (const j of v.jobs || []) if (j.day >= pkDate(new Date(Date.now() - 3 * 86400_000))) ids.add(j.productId);
      return ids;
    } catch {
      return new Set<string>();
    }
  };
  const pickDaily = () => {
    const used = new Set([...Object.keys(state.postedProducts), ...state.posts.filter((p) => p.status !== 'FAILED').flatMap((p) => p.productIds), ...videoProducts()]);
    const ok = d.liveProducts().filter((p) => !used.has(p.id) && allowed(p) && d.picturesOf(p).length >= 2);
    if (!ok.length) return null;
    // sale items, best sellers and new products first; some variety among the best ten
    const score = (p: any) => (Number(p.compareAtPrice) > d.priceOf(p) ? 3 : 0) + (p.bestSeller ? 2 : 0) + Math.min(9, d.picturesOf(p).length) / 9 + Date.parse(p.createdAt || 0) / 1e14;
    ok.sort((a, b) => score(b) - score(a));
    return ok[Math.floor(Math.random() * Math.min(10, ok.length))];
  };

  // ------------------------------------------------------------------ pictures: square JPEGs
  // Instagram takes only JPEG, and a carousel keeps every picture at the first one's shape: each
  // picture becomes a 1080 x 1080 JPEG on white, stored with the store's media.
  const squareCopy = async (u: string): Promise<string | null> => {
    const pic = await loadPicture(u, d.mediaDir, d.localOrigin);
    if (!pic) return null;
    try {
      const sharp = (await import('sharp')).default;
      const jpg = await sharp(pic.buf).rotate().resize(1080, 1080, { fit: 'contain', background: '#FFFFFF' }).flatten({ background: '#FFFFFF' }).jpeg({ quality: 86 }).toBuffer();
      return abs(await d.storeMedia(jpg, 'jpg', 'image/jpeg'));
    } catch {
      return null;
    }
  };
  const imagesFor = async (products: any[]) => {
    // one product: up to 4 of its pictures; several: the main picture of each
    const sources = products.length === 1 ? d.picturesOf(products[0]).slice(0, 4) : products.slice(0, 4).map((p) => d.picturesOf(p)[0]);
    return (await Promise.all(sources.filter(Boolean).map(squareCopy))).filter(Boolean) as string[];
  };

  // ------------------------------------------------------------------ the caption
  const linkOf = (p: any) => `${d.publicOrigin()}/p/${encodeURIComponent(p.id)}`;
  const tail = (products: any[]) => {
    const lines: string[] = [];
    if (products.length === 1) {
      const p = products[0];
      const price = d.priceOf(p);
      const was = Number(p.compareAtPrice) > price ? Number(p.compareAtPrice) : 0;
      lines.push(was ? `🔥 Sirf ${pkr(price)} (pehle ${pkr(was)})` : `💰 Sirf ${pkr(price)}`);
      lines.push('🚚 Poore Pakistan mein delivery · Cash on Delivery', '', `🛒 Order karein: ${linkOf(p)}`);
    } else {
      for (const p of products.slice(0, 6)) lines.push(`• ${String(p.name).split(/\s[|–—-]\s/)[0].slice(0, 60)}: ${pkr(d.priceOf(p))} 👉 ${linkOf(p)}`);
      lines.push('', '🚚 Poore Pakistan mein delivery · Cash on Delivery');
    }
    return lines;
  };
  const tagsOf = (products: any[], extra: string[] = []) => {
    const cat = products
      .map((p) => String(p.category || '').replace(/[^A-Za-z0-9]+/g, ''))
      .filter(Boolean)
      .slice(0, 2);
    const all = ['AnokhaShoppingHub', 'OnlineShoppingPakistan', 'CashOnDelivery', ...cat, ...extra];
    return Array.from(new Set(all.map((t) => t.replace(/[^A-Za-z0-9]+/g, '')).filter((t) => t.length > 2)))
      .slice(0, 8)
      .map((t) => `#${t}`)
      .join(' ');
  };
  /** The AI writes the opening and the feature lines in Roman Urdu; price, link and tags are added from the listing */
  const writeCaption = async (products: any[], idea = ''): Promise<{ caption: string; usedAi: boolean }> => {
    const plain = () => {
      const p = products[0];
      const head = idea ? `✨ ${idea.slice(0, 120)}` : `✨ ${String(p.name).slice(0, 120)}`;
      return [head, '', ...tail(products), '', tagsOf(products)].join('\n');
    };
    try {
      const about = products
        .slice(0, 6)
        .map((p, i) => `${i + 1}. "${String(p.name).slice(0, 160)}" (category ${p.category}): ${String(p.shortDescription || p.description || '').slice(0, 500)}`)
        .join('\n');
      const r = await d.getAI().models.generateContent({
        model: AI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You write Facebook and Instagram posts for a Pakistani online shop, "${String(d.settings()?.storeName || 'Anokha Shopping Hub')}".
${idea ? `The owner's idea for this post: "${idea.slice(0, 400)}"` : 'Post about this product.'}
Product(s):
${about}
Write "body": the start of the post in Roman Urdu (Urdu in English letters, the way Pakistanis text, e.g. "Ab ghar ka kaam hua asaan!"), 3 to 6 short lines: an eye-catching first line, then the product's real features as lines starting with an emoji. Do NOT write the price, discount, delivery, link or hashtags (the shop adds them). Be honest: only features from the details above; never health or medical claims (no "dard khatam", "ilaaj", "wazan kam"), never "original" / "genuine" or a famous brand's name unless the product name already is that brand, no invented offers or warranties.
Also give "tags": 3 to 5 hashtag words (English letters, no # sign) that suit the product.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { body: { type: 'STRING' }, tags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['body'] },
          temperature: 0.9,
        },
      });
      const j = JSON.parse(r.text || '{}');
      const body = String(j.body || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join('\n')
        .slice(0, 900);
      // an Urdu-script body is not what the owner asked for (Roman Urdu): the plain caption is used
      if (body.length < 10 || /[؀-ۿ]/.test(body)) return { caption: plain(), usedAi: false };
      const tags = (Array.isArray(j.tags) ? j.tags : []).map((t: unknown) => str(t, 30));
      return { caption: [body, '', ...tail(products), '', tagsOf(products, tags)].join('\n'), usedAi: true };
    } catch (err: any) {
      console.warn('[social] AI caption not available, using the plain one:', err?.message);
      return { caption: plain(), usedAi: false };
    }
  };

  // ------------------------------------------------------------------ making a post
  const makePost = async (kind: Post['kind'], products: any[], idea = ''): Promise<Post> => {
    const images = await imagesFor(products);
    if (!images.length) throw new Error('The product pictures could not be opened.');
    const { caption, usedAi } = await writeCaption(products, idea);
    const p: Post = {
      id: crypto.randomBytes(8).toString('hex'),
      kind,
      day: pkDate(),
      ...(idea ? { idea: idea.slice(0, 400) } : {}),
      productIds: products.map((x) => x.id),
      productNames: products.map((x) => String(x.name).slice(0, 120)),
      caption,
      images,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      usedAi,
    };
    state.posts.push(p);
    save();
    return p;
  };

  /** The next time the posting hour comes (Pakistan time), as ISO */
  const nextPostTime = () => {
    const now = new Date();
    const pkNow = new Date(now.getTime() + 5 * 3600_000);
    const at = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate(), state.settings.postHourPk) - 5 * 3600_000);
    if (at.getTime() <= now.getTime()) return now.toISOString(); // the hour has passed today: at once
    return at.toISOString();
  };

  // ------------------------------------------------------------------ posting
  const publish = async (post: Post) => {
    const { pageId, token, igUser } = await pageAccess();
    const out: NonNullable<Post['posted']> = { ...(post.posted || {}), errors: [] };
    if (!pageId || !token) out.errors!.push('Facebook Page is not connected yet.');
    // Facebook: the pictures are uploaded unpublished, then one post carries them all
    if (pageId && token && !out.facebook) {
      try {
        const ids: string[] = [];
        for (const url of post.images) ids.push((await graph(`${pageId}/photos`, { url, published: 'false', access_token: token })).id);
        const params: Record<string, string> = { message: post.caption, access_token: token };
        ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
        out.facebook = (await graph(`${pageId}/feed`, params)).id;
      } catch (e: any) {
        out.errors!.push(`Facebook: ${e.message}`);
      }
    }
    // Instagram: one picture, or a carousel of them
    if (igUser && token && !out.instagram) {
      try {
        let creation: string;
        if (post.images.length === 1) {
          creation = (await graph(`${igUser}/media`, { image_url: post.images[0], caption: post.caption, access_token: token })).id;
        } else {
          const children: string[] = [];
          for (const url of post.images) children.push((await graph(`${igUser}/media`, { image_url: url, is_carousel_item: 'true', access_token: token })).id);
          creation = (await graph(`${igUser}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption, access_token: token })).id;
        }
        let status = '';
        for (let i = 0; i < 12 && status !== 'FINISHED'; i++) {
          status = (await graph(creation, { fields: 'status_code', access_token: token }, 'GET')).status_code;
          if (status === 'ERROR') throw new Error('Instagram could not process the pictures.');
          if (status !== 'FINISHED') await new Promise((r) => setTimeout(r, 5000));
        }
        out.instagram = (await graph(`${igUser}/media_publish`, { creation_id: creation, access_token: token })).id;
      } catch (e: any) {
        out.errors!.push(`Instagram: ${e.message}`);
      }
    }
    post.posted = out;
    post.tries = (post.tries || 0) + 1;
    post.postedAt = new Date().toISOString();
    if (out.facebook || out.instagram) {
      post.status = 'POSTED';
      for (const id of post.productIds) state.postedProducts[id] = post.postedAt;
    } else if (post.tries >= 3) post.status = 'FAILED';
    save();
    console.log(`[social] ${post.status} ${post.productNames[0]?.slice(0, 50)}: fb=${out.facebook || '-'} ig=${out.instagram || '-'} ${out.errors?.join(' | ') || ''}`);
  };

  // ------------------------------------------------------------------ the clock
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const day = pkDate();
      // the AI's daily post, prepared once a day
      if (state.settings.autoDaily && pkHour() >= DRAFT_HOUR_PK && pkHour() < 22 && !state.posts.some((p) => p.kind === 'DAILY' && p.day === day)) {
        const product = pickDaily();
        if (product) {
          const p = await makePost('DAILY', [product]).catch((e) => {
            console.warn('[social] daily post failed:', e?.message);
            return null;
          });
          if (p)
            await d
              .emailOwner(
                `📣 Aaj ki post tayyar: ${p.productNames[0].slice(0, 50)}`,
                ['AI ne aaj Facebook aur Instagram ke liye ek post tayyar ki hai.', 'Admin → AI Social Manager mein dekh kar "Approve" dabayein (likhai badal bhi sakte hain).'],
                'Post dekhein',
                adminUrl()
              )
              .catch(() => {});
        }
      }
      // approved posts whose time has come (a failed try is repeated after 30 minutes, 3 tries in all)
      const due = state.posts.find(
        (p) => p.status === 'APPROVED' && Date.parse(p.postAt || '') <= Date.now() && (!p.postedAt || Date.now() - Date.parse(p.postedAt) >= 30 * 60_000)
      );
      if (due) await publish(due);
    } finally {
      busy = false;
    }
  };
  setInterval(() => tick().catch((e) => console.warn('[social] tick failed:', e?.message)), 5 * 60_000).unref?.();
  setTimeout(() => tick().catch(() => {}), 3 * 60_000).unref?.();

  // ------------------------------------------------------------------ connections
  let statusCache: { at: number; value: any } | null = null;
  const connections = async () => {
    if (statusCache && Date.now() - statusCache.at < 10 * 60_000) return statusCache.value;
    const { pageId, token, igUser } = await pageAccess();
    const fb: any = { connected: false };
    const ig: any = { connected: false };
    if (pageId && token) {
      try {
        fb.name = (await graph(pageId, { fields: 'name', access_token: token }, 'GET')).name;
        fb.connected = true;
      } catch (e: any) {
        fb.error = e.message;
      }
    }
    if (igUser && token) {
      try {
        ig.username = (await graph(igUser, { fields: 'username', access_token: token }, 'GET')).username;
        ig.connected = true;
      } catch (e: any) {
        ig.error = e.message;
      }
    }
    const env = (k: string) => Boolean(String(process.env[k] || '').trim());
    const value = { facebook: fb, instagram: ig, whatsapp: { connected: env('WA_PHONE_ID') && env('WA_TOKEN') && env('OWNER_WHATSAPP') } };
    statusCache = { at: Date.now(), value };
    return value;
  };

  // ------------------------------------------------------------------ the weekly report
  const statsOf = async (post: { facebook?: string; instagram?: string; video?: boolean }, token: string) => {
    const s = { likes: 0, comments: 0, shares: 0 };
    if (post.facebook) {
      try {
        const f = post.video
          ? await graph(post.facebook, { fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0)', access_token: token }, 'GET')
          : await graph(post.facebook, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares', access_token: token }, 'GET');
        s.likes += Number(f.reactions?.summary?.total_count || f.likes?.summary?.total_count || 0);
        s.comments += Number(f.comments?.summary?.total_count || 0);
        s.shares += Number(f.shares?.count || 0);
      } catch {
        /* removed or not readable */
      }
    }
    if (post.instagram) {
      try {
        const i = await graph(post.instagram, { fields: 'like_count,comments_count', access_token: token }, 'GET');
        s.likes += Number(i.like_count || 0);
        s.comments += Number(i.comments_count || 0);
      } catch {
        /* removed or not readable */
      }
    }
    return s;
  };

  // ------------------------------------------------------------------ routes (admin)
  const view = (p: Post) => p;
  app.get('/api/admin/social', d.requireAdmin, async (_req, res) => {
    res.json({ success: true, settings: state.settings, posts: state.posts.slice(-30).reverse().map(view), connections: await connections().catch(() => null) });
  });
  app.post('/api/admin/social/settings', d.requireAdmin, (req, res) => {
    const hour = Math.floor(Number(req.body?.postHourPk));
    if (typeof req.body?.autoDaily === 'boolean') state.settings.autoDaily = req.body.autoDaily;
    if (hour >= 8 && hour <= 23) state.settings.postHourPk = hour;
    save();
    res.json({ success: true, settings: state.settings });
  });
  app.get('/api/admin/social/products', d.requireAdmin, (req, res) => {
    const q = str(req.query.q, 80).toLowerCase();
    const words = q.split(' ').filter(Boolean);
    const list = d
      .liveProducts()
      .filter((p) => allowed(p) && words.every((w) => `${p.name} ${p.category} ${p.sku || ''}`.toLowerCase().includes(w)))
      .slice(0, 20)
      .map((p) => ({ id: p.id, name: String(p.name).slice(0, 120), price: d.priceOf(p), image: d.picturesOf(p)[0] || '' }));
    res.json({ success: true, products: list });
  });
  // A new post: from the owner's idea and chosen products, or the AI picks today's product
  app.post('/api/admin/social/draft', d.requireAdmin, async (req, res) => {
    const idea = str(req.body?.idea, 400);
    const ids: string[] = Array.isArray(req.body?.productIds) ? req.body.productIds.map((x: unknown) => str(x, 128)).slice(0, 6) : [];
    const live = new Map(d.liveProducts().map((p) => [p.id, p]));
    let products = ids.map((id) => live.get(id)).filter(allowed);
    if (ids.length && !products.length) return res.status(400).json({ error: 'These products cannot be posted on Facebook (out of stock, no picture, or not allowed by Facebook).' });
    if (!products.length) {
      const p = pickDaily();
      if (!p) return res.status(409).json({ error: 'No new product is left to post. Pick products yourself.' });
      products = [p];
    }
    try {
      res.json({ success: true, post: view(await makePost(idea || ids.length ? 'IDEA' : 'DAILY', products, idea)) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Could not make the post.' });
    }
  });
  app.post('/api/admin/social/:id', d.requireAdmin, async (req, res) => {
    const post = state.posts.find((p) => p.id === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const action = String(req.body?.action || '');
    if (action === 'caption') {
      if (post.status !== 'DRAFT' && post.status !== 'APPROVED') return res.status(409).json({ error: 'This post has already gone out.' });
      const caption = String(req.body?.caption ?? '').replace(/\r/g, '').trim().slice(0, 2200);
      if (caption.length < 5) return res.status(400).json({ error: 'Write the post text.' });
      post.caption = caption;
    } else if (action === 'rewrite') {
      if (post.status !== 'DRAFT') return res.status(409).json({ error: 'Only a post that is not approved yet can be written again.' });
      const live = new Map(d.liveProducts().map((p) => [p.id, p]));
      const products = post.productIds.map((id) => live.get(id)).filter(Boolean);
      if (!products.length) return res.status(409).json({ error: 'The product is no longer in the store.' });
      const r = await writeCaption(products, post.idea || '');
      post.caption = r.caption;
      post.usedAi = r.usedAi;
    } else if (action === 'approve' || action === 'post-now') {
      if (post.status !== 'DRAFT' && post.status !== 'APPROVED' && post.status !== 'FAILED') return res.status(409).json({ error: 'This post has already gone out.' });
      post.status = 'APPROVED';
      post.decidedAt = new Date().toISOString();
      post.postAt = action === 'post-now' ? new Date().toISOString() : nextPostTime();
      if (post.tries && post.tries >= 3) post.tries = 0; // the owner asks again after 3 failed tries
      delete post.postedAt;
      save();
      if (Date.parse(post.postAt) <= Date.now()) setTimeout(() => tick().catch(() => {}), 500);
    } else if (action === 'reject') {
      if (post.status === 'POSTED') return res.status(409).json({ error: 'This post has already gone out.' });
      post.status = 'REJECTED';
      post.decidedAt = new Date().toISOString();
    } else return res.status(400).json({ error: 'Unknown action.' });
    save();
    res.json({ success: true, post: view(post) });
  });
  // Last 7 days: likes, comments and shares of the picture posts and the daily videos
  app.get('/api/admin/social/report', d.requireAdmin, async (_req, res) => {
    const since = Date.now() - 7 * 86400_000;
    const { token } = await pageAccess();
    const rows: { kind: string; name: string; postedAt: string; facebook: boolean; instagram: boolean; likes: number; comments: number; shares: number }[] = [];
    const items: { kind: string; name: string; postedAt: string; facebook?: string; instagram?: string; video?: boolean }[] = state.posts
      .filter((p) => p.status === 'POSTED' && Date.parse(p.postedAt || '') >= since)
      .map((p) => ({ kind: 'Post', name: p.idea || p.productNames[0] || '', postedAt: p.postedAt!, facebook: p.posted?.facebook, instagram: p.posted?.instagram }));
    try {
      const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.cache', 'daily-video.json'), 'utf8'));
      for (const j of v.jobs || [])
        if (j.status === 'POSTED' && Date.parse(j.postedAt || '') >= since)
          items.push({ kind: 'Video', name: j.productName, postedAt: j.postedAt, facebook: j.posted?.facebook, instagram: j.posted?.instagram, video: true });
    } catch {
      /* no daily videos yet */
    }
    for (const it of items) {
      const s = token ? await statsOf(it, token) : { likes: 0, comments: 0, shares: 0 };
      rows.push({ kind: it.kind, name: String(it.name).slice(0, 120), postedAt: it.postedAt, facebook: Boolean(it.facebook), instagram: Boolean(it.instagram), ...s });
    }
    rows.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    const total = rows.reduce((t, r) => ({ likes: t.likes + r.likes, comments: t.comments + r.comments, shares: t.shares + r.shares }), { likes: 0, comments: 0, shares: 0 });
    res.json({ success: true, rows, total, posts: rows.length });
  });
}
