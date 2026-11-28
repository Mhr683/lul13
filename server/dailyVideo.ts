// The store's daily social video. Every day the server picks one live product, makes a short video of
// it (the same free video as Seller Center's "Make my video": src/services/videoRender.ts, recorded in
// a hidden Edge/Chrome window on this computer), and sends it to the owner to approve. "Yes" posts it
// on the store's Facebook Page and Instagram at the posting time (17:00 Pakistan time); "No" skips the day.
// A product that already has its own video uses that video. Nothing is posted without the owner's yes.
//
// Settings (.env, all optional; without them the part is skipped):
//   META_PAGE_ID, META_PAGE_TOKEN   Facebook Page and a Page token or a system-user token (posting the video)
//   META_IG_USER_ID                 Instagram professional account linked to the Page (posting a Reel)
//   WA_PHONE_ID, WA_TOKEN, OWNER_WHATSAPP   WhatsApp Cloud API number and the owner's number (approval)
//   WA_TEMPLATE, WA_TEMPLATE_LANG   approved template that starts the chat ({{1}} product, {{2}} link)
// State is kept in .cache/daily-video.json (git-ignored).
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { famousBrandIn } from '../src/services/brandRules';

type Plan = any;
type Job = {
  id: string;
  /** Pakistan date (YYYY-MM-DD) the video is for */
  day: string;
  productId: string;
  productName: string;
  status: 'MAKING' | 'READY' | 'APPROVED' | 'REJECTED' | 'POSTED' | 'FAILED';
  videoUrl?: string;
  caption?: string;
  error?: string;
  createdAt: string;
  decidedAt?: string;
  postedAt?: string;
  /** posting attempts (a failed one is tried again later the same day, up to 3 in all) */
  tries?: number;
  posted?: { facebook?: string; instagram?: string; errors?: string[] };
};
type State = { jobs: Job[]; postedProducts: Record<string, string>; brandedProducts?: Record<string, string> };

export type DailyVideoDeps = {
  requireAdmin: express.RequestHandler;
  liveProducts: () => any[];
  priceOf: (p: any) => number;
  settings: () => any;
  planVideo: (p: any, o: { shopName: string; useAi: boolean; voice?: 'FEMALE' | 'MALE' | 'NONE'; lang?: 'UR' | 'EN'; thumbs?: string[] }) => Promise<{ plan: Plan; usedAi: boolean }>;
  /** Puts the video on the product's own listing (replaces an older video) */
  setProductVideo?: (productId: string, videoUrl: string) => Promise<void>;
  /** AI look at product pictures (data: URLs): true when one shows a well-known brand's name or logo */
  showsBrand?: (pictures: string[]) => Promise<boolean>;
  /** The voice-over (base64 audio) of a script, or null */
  speak: (script: string, voice: 'FEMALE' | 'MALE') => Promise<{ audio: string; mime: string } | null>;
  picturesOf: (p: any) => string[];
  storeMedia: (buffer: Buffer, ext: string, contentType: string) => Promise<string>;
  mediaDir: string;
  /** Public address of the store (https://anokhashopinghub.shop) */
  publicOrigin: () => string;
  /** This server on this computer (http://127.0.0.1:3000) */
  localOrigin: string;
  /** E-mail to the owner (used while WhatsApp is not set up) */
  emailOwner: (subject: string, paragraphs: string[], button: string, url: string) => Promise<void>;
};

const POST_HOUR_PK = 17; // 5 pm Pakistan time: posting
const MAKE_HOUR_PK = 15; // 3 pm: the video is made and sent to the owner to approve
const GRAPH = 'https://graph.facebook.com/v23.0';

// Products Facebook / Instagram do not allow to be advertised or that put the Page at risk (adult,
// medicines and health claims, weapons, tobacco, copies of brands). Never chosen for the daily video.
const BLOCKED =
  /\b(sex|sexual|timing|delay\s*(cream|spray|oil|tablet)|condom|lubricant|viagra|cialis|enlarge\w*|libido|erotic|adult|lingerie|bra\b|panty|panties|vibrator|massager\s*for\s*(men|women)|weight\s*loss|slimming|fat\s*burn\w*|diet\s*pill|medicine|tablet\s*for|capsule|herbal|ayurved\w*|hakeem|cure|whitening\s*(cream|injection)|fairness|steroid|cbd|hemp|vape|e-?cig\w*|cigarette|tobacco|hookah|shisha|gun|pistol|airsoft|weapon|knife|dagger|sword|taser|stun|pepper\s*spray|replica|first\s*copy|master\s*copy|aaa\s*quality)\b/i;

// Pakistani brands (the shared list in src/services/brandRules.ts has the international ones)
const LOCAL_BRANDS =
  /\b(junaid\s*jamshed|j\.\s*junaid|khaadi|gul\s*ahmed|sana\s*safinaz|maria\.?\s*b|alkaram|sapphire|nishat|bonanza|limelight|outfitters|bata|servis|ndure|almirah|edenrobe|beechtree|zeen|asim\s*jofa|agha\s*noor|baroque|charcoal|diners)\b/i;

const pkDate = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const pkHour = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).getUTCHours();

export function registerDailyVideo(app: express.Express, d: DailyVideoDeps) {
  const stateFile = path.join(process.cwd(), '.cache', 'daily-video.json');
  // Secret for this computer only: the hidden recording window and the owner's approve page use it
  const secretFile = path.join(process.cwd(), '.cache', 'daily-video.key');
  let secret = '';
  try {
    secret = fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    /* made below */
  }
  if (!/^[a-f0-9]{48}$/.test(secret)) {
    secret = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, secret);
  }
  const sign = (id: string) => crypto.createHmac('sha256', secret).update(`daily-video|${id}`).digest('hex').slice(0, 32);
  const okSig = (id: string, k: unknown) => {
    const want = Buffer.from(sign(id));
    const got = Buffer.from(String(k || ''));
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };

  let state: State = { jobs: [], postedProducts: {} };
  try {
    state = { jobs: [], postedProducts: {}, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
  } catch {
    /* first run */
  }
  const save = () => {
    state.jobs = state.jobs.slice(-60);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
  };
  const job = (id: string) => state.jobs.find((j) => j.id === id);
  const env = (k: string) => String(process.env[k] || '').trim();

  // ------------------------------------------------------------------ choosing the product
  // Owner's rule: a product gets a video only once its 9 pictures are complete, and it is never posted
  // twice. Products already posted, approved or turned down ("No") are never chosen again; one whose
  // video was only made (no answer) or failed may be tried again another day.
  const FULL_PICTURES = 9;
  const usedBefore = () => {
    const used = new Set(Object.keys(state.postedProducts));
    for (const j of state.jobs) if (['APPROVED', 'POSTED', 'REJECTED'].includes(j.status)) used.add(j.productId);
    return used;
  };
  const pictureCount = (p: any) => new Set([p.primaryImage, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean)).size;
  const pickProduct = (skip: Set<string>) => {
    const used = usedBefore();
    const ok = d.liveProducts().filter((p) => {
      if (skip.has(p.id) || used.has(p.id)) return false;
      if (pictureCount(p) < FULL_PICTURES || d.priceOf(p) <= 0) return false;
      if (Number(p.stock) - Number(p.reservedStock || 0) <= 0) return false;
      if (BLOCKED.test(`${p.name} ${p.category} ${p.subcategory || ''} ${p.shortDescription || ''}`)) return false;
      // Another company's brand on the Page is reported as a copy: products named after one, or whose
      // pictures showed a brand's name or logo, are never chosen
      return !(state.brandedProducts?.[p.id] || famousBrandIn(`${p.name} ${p.shortDescription || ''}`) || LOCAL_BRANDS.test(`${p.name} ${p.shortDescription || ''}`));
    });
    if (!ok.length) return null;
    // a product with its own video first, then sale items, then the newest
    const score = (p: any) =>
      (p.videoUrl ? 4 : 0) + (Number(p.compareAtPrice) > d.priceOf(p) ? 2 : 0) + (p.bestSeller ? 1 : 0) + Date.parse(p.createdAt || 0) / 1e14;
    ok.sort((a, b) => score(b) - score(a));
    // some variety: one of the best five
    return ok[Math.floor(Math.random() * Math.min(5, ok.length))];
  };

  const captionFor = (p: any) => {
    const price = d.priceOf(p);
    const was = Number(p.compareAtPrice) > price ? Number(p.compareAtPrice) : 0;
    const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
    const tag = String(p.category || '')
      .replace(/[^A-Za-z0-9]+/g, '')
      .slice(0, 30);
    return [
      `✨ ${String(p.name).slice(0, 120)}`,
      '',
      was ? `🔥 Sirf ${pkr(price)} (pehle ${pkr(was)})` : `💰 Sirf ${pkr(price)}`,
      '🚚 Poore Pakistan mein delivery · Cash on Delivery',
      '',
      `🛒 Order karein: ${d.publicOrigin()}/p/${encodeURIComponent(p.id)}`,
      '',
      `#AnokhaShoppingHub #OnlineShoppingPakistan #CashOnDelivery${tag ? ` #${tag}` : ''}`,
    ].join('\n');
  };

  // ------------------------------------------------------------------ making the video
  const findBrowser = () =>
    [
      env('VIDEO_BROWSER'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    ].find((f) => f && fs.existsSync(f));

  const waiting = new Map<string, { resolve: (url: string) => void; reject: (e: Error) => void }>();
  const recordInBrowser = (id: string) =>
    new Promise<string>((resolve, reject) => {
      const exe = findBrowser();
      if (!exe) return reject(new Error('No Chrome or Edge found on this computer to make the video.'));
      const profile = path.join(process.cwd(), '.cache', 'video-browser');
      const url = `${d.localOrigin}/video-render.html?job=${encodeURIComponent(id)}&k=${sign(id)}`;
      let proc: ChildProcess | null = null;
      const done = (err: Error | null, out?: string) => {
        clearTimeout(timer);
        waiting.delete(id);
        try {
          proc?.kill();
        } catch {
          /* already closed */
        }
        err ? reject(err) : resolve(out!);
      };
      const timer = setTimeout(() => done(new Error('The video took too long to make.')), 4 * 60_000);
      waiting.set(id, { resolve: (u) => done(null, u), reject: (e) => done(e) });
      proc = spawn(
        exe,
        [
          '--headless=new',
          `--user-data-dir=${profile}`,
          '--autoplay-policy=no-user-gesture-required',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--window-size=800,800',
          url,
        ],
        { stdio: 'ignore', windowsHide: true }
      );
      proc.on('error', (e) => done(e));
    });

  /** Picture as a data: URL so the recording window can draw it (pictures on other websites cannot be recorded) */
  const pictureData = async (u: string): Promise<string | null> => {
    try {
      let buf: Buffer;
      let type = 'image/jpeg';
      if (u.startsWith('/media/')) {
        const name = path.basename(u);
        buf = await fs.promises.readFile(path.join(d.mediaDir, name));
        if (/\.png$/i.test(name)) type = 'image/png';
        else if (/\.webp$/i.test(name)) type = 'image/webp';
      } else {
        const abs = u.startsWith('/') ? `${d.localOrigin}${u}` : u;
        if (!/^https?:\/\//.test(abs)) return null;
        const r = await fetch(abs, { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) return null;
        type = r.headers.get('content-type')?.split(';')[0] || type;
        if (!type.startsWith('image/')) return null;
        buf = Buffer.from(await r.arrayBuffer());
      }
      if (buf.length > 8 * 1024 * 1024) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  };
  const jobInput = new Map<string, { plan: Plan; shopName: string; pictures: string[]; voice?: string; voiceMime?: string }>();

  let busy = false;
  let noneToldDay = '';
  /** Makes today's video (or a new one when the owner asks for another product) and sends it for approval */
  const makeVideo = async (skipToday = false, alwaysNew = false): Promise<Job | null> => {
    if (busy) return null;
    busy = true;
    const day = pkDate();
    const skip = new Set<string>(skipToday ? state.jobs.filter((j) => j.day === day).map((j) => j.productId) : []);
    // The AI looks at the chosen product's pictures; one with a brand's logo is passed over (and
    // remembered), up to 5 tries
    let p: any = null;
    for (let tries = 0; tries < 5 && !p; tries++) {
      const c = pickProduct(skip);
      if (!c) break;
      if (d.showsBrand) {
        const pics = (await Promise.all(d.picturesOf(c).slice(0, 4).map(pictureData))).filter(Boolean) as string[];
        if (await d.showsBrand(pics).catch(() => false)) {
          skip.add(c.id);
          state.brandedProducts = { ...(state.brandedProducts || {}), [c.id]: new Date().toISOString() };
          save();
          console.log(`[daily-video] skipped (brand name or logo in the pictures): ${String(c.name).slice(0, 60)}`);
          continue;
        }
      }
      p = c;
    }
    if (!p) {
      busy = false;
      // the owner hears it once a day (the check runs again every few minutes, cheaply)
      if (noneToldDay !== day) {
        noneToldDay = day;
        console.warn('[daily-video] no product can be used today');
        d.emailOwner(
          'Aaj ki video nahi bani',
          [
            'Aaj Facebook video ke liye koi naya product nahi mila.',
            'Video sirf un products ki banti hai jin ki 9 tasveerein poori hon, jo pehle post na hue hon, aur jin par kisi brand ka naam ya logo na ho.',
            'ChatGPT se mazeed products ki 9 tasveerein poori karwayein; agla product milte hi video khud ban jayegi.',
          ],
          'Seller Center kholein',
          `${d.publicOrigin().replace('://', '://seller.')}/`
        ).catch(() => {});
      }
      return null;
    }
    const j: Job = { id: crypto.randomBytes(8).toString('hex'), day, productId: p.id, productName: String(p.name), status: 'MAKING', createdAt: new Date().toISOString() };
    state.jobs.push(j);
    save();
    try {
      if (!alwaysNew && p.videoUrl && /\.mp4(\?|$)/i.test(p.videoUrl)) {
        j.videoUrl = p.videoUrl;
      } else {
        const shopName = String(d.settings()?.storeName || 'Anokha Shopping Hub');
        // A man's voice tells the product's features in Urdu (music only if the voice cannot be made)
        const pictures = (await Promise.all(d.picturesOf(p).map(pictureData))).filter(Boolean) as string[];
        if (!pictures.length) throw new Error('The product pictures could not be opened.');
        // the AI sees every picture, so each scene's words and the voice match what that picture shows
        const { plan } = await d.planVideo(p, { shopName, useAi: true, voice: 'MALE', lang: 'UR', thumbs: pictures });
        plan.scenes = plan.scenes.map((s: any) => ({ ...s, image: Math.min(s.image, pictures.length - 1) }));
        const v = plan.voiceScript ? await d.speak(plan.voiceScript, 'MALE').catch(() => null) : null;
        jobInput.set(j.id, { plan, shopName, pictures, ...(v ? { voice: v.audio, voiceMime: v.mime } : {}) });
        j.videoUrl = await recordInBrowser(j.id);
      }
      j.caption = captionFor(p);
      j.status = 'READY';
      save();
      console.log(`[daily-video] ready: ${j.productName} (${j.videoUrl})`);
      await askOwner(j).catch((e) => console.warn('[daily-video] could not reach the owner:', e?.message));
      return j;
    } catch (err: any) {
      j.status = 'FAILED';
      j.error = String(err?.message || err).slice(0, 300);
      save();
      console.warn('[daily-video] failed:', j.error);
      return j;
    } finally {
      jobInput.delete(j.id);
      busy = false;
    }
  };

  // ------------------------------------------------------------------ asking the owner
  const approveUrl = (j: Job) => `${d.publicOrigin()}/daily-video/${j.id}?k=${sign(j.id)}`;
  const askOwner = async (j: Job) => {
    const link = approveUrl(j);
    const text = `🎬 Aaj ki video tayyar hai: ${j.productName.slice(0, 80)}\n\nDekh kar "Yes" ya "No" dabayein (Yes = aaj ${POST_HOUR_PK - 12} baje Facebook aur Instagram par post):\n${link}`;
    const waPhone = env('WA_PHONE_ID');
    const waToken = env('WA_TOKEN');
    const owner = env('OWNER_WHATSAPP').replace(/\D/g, '');
    // The e-mail always goes too, so the owner is reached even when WhatsApp refuses the message
    const mail = d
      .emailOwner(`🎬 Aaj ki video: ${j.productName.slice(0, 60)}`, [text.split('\n\n')[0], 'Video dekh kar Yes ya No dabayein. Yes par aaj shaam 5 baje Facebook aur Instagram par post hogi.'], 'Video dekhein', link)
      .catch((e) => console.warn('[daily-video] e-mail failed:', e?.message));
    if (waPhone && waToken && owner) {
      const send = (body: any) =>
        fetch(`${GRAPH}/${waPhone}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: owner, ...body }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
        });
      // WhatsApp lets a business start a chat only with an approved template; plain messages work only
      // within 24 hours of the owner's last message. WA_TEMPLATE (body with {{1}} product, {{2}} link)
      // is sent first when set; the video and the text follow and arrive whenever the chat is open.
      const template = env('WA_TEMPLATE');
      if (template)
        await send({
          type: 'template',
          template: {
            name: template,
            language: { code: env('WA_TEMPLATE_LANG') || 'en' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: j.productName.slice(0, 60) }, { type: 'text', text: link }] }],
          },
        }).catch((e) => console.warn('[daily-video] WhatsApp template failed:', e?.message));
      await send({ type: 'video', video: { link: `${d.publicOrigin()}${j.videoUrl}`, caption: j.productName.slice(0, 900) } }).catch(() => {});
      await send({ type: 'text', text: { body: text, preview_url: false } }).catch((e) => console.warn('[daily-video] WhatsApp text failed:', e?.message));
    }
    await mail;
  };

  // ------------------------------------------------------------------ posting
  const graph = async (pathname: string, params: Record<string, string>, method = 'POST') => {
    const body = new URLSearchParams(params);
    const r = await fetch(`${GRAPH}/${pathname}${method === 'GET' ? `?${body}` : ''}`, method === 'GET' ? {} : { method, body });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
    return j;
  };
  const post = async (j: Job) => {
    const pageId = env('META_PAGE_ID');
    let token = env('META_PAGE_TOKEN');
    const igUser = env('META_IG_USER_ID');
    // A system-user token (Business Settings) is turned into the Page's own token, which posting needs
    if (pageId && token) {
      try {
        const pt = (await graph(pageId, { fields: 'access_token', access_token: token }, 'GET')).access_token;
        if (pt) token = pt;
      } catch {
        /* already a Page token */
      }
    }
    const videoUrl = `${d.publicOrigin()}${j.videoUrl}`;
    const out: Job['posted'] = { errors: [] };
    if (!pageId || !token) out.errors!.push('Facebook Page is not connected yet (META_PAGE_ID / META_PAGE_TOKEN).');
    if (pageId && token) {
      try {
        const r = await graph(`${pageId}/videos`, { file_url: videoUrl, description: j.caption || '', access_token: token });
        out.facebook = r.id;
      } catch (e: any) {
        out.errors!.push(`Facebook: ${e.message}`);
      }
    }
    if (igUser && token) {
      try {
        const c = await graph(`${igUser}/media`, { media_type: 'REELS', video_url: videoUrl, caption: j.caption || '', share_to_feed: 'true', access_token: token });
        // Instagram needs a moment to process the video
        let status = '';
        for (let i = 0; i < 30 && status !== 'FINISHED'; i++) {
          await new Promise((r) => setTimeout(r, 10_000));
          status = (await graph(c.id, { fields: 'status_code', access_token: token }, 'GET')).status_code;
          if (status === 'ERROR') throw new Error('Instagram could not process the video.');
        }
        if (status !== 'FINISHED') throw new Error('Instagram took too long to process the video.');
        out.instagram = (await graph(`${igUser}/media_publish`, { creation_id: c.id, access_token: token })).id;
      } catch (e: any) {
        out.errors!.push(`Instagram: ${e.message}`);
      }
    }
    j.posted = out;
    j.tries = (j.tries || 0) + 1;
    j.postedAt = new Date().toISOString();
    j.status = out.facebook || out.instagram ? 'POSTED' : 'APPROVED';
    if (out.facebook || out.instagram) state.postedProducts[j.productId] = j.postedAt;
    save();
    console.log(`[daily-video] posted ${j.productName}: fb=${out.facebook || '-'} ig=${out.instagram || '-'} ${out.errors?.join(' | ') || ''}`);
    // The posted video also goes on the product's own page (customers see it in the gallery)
    if ((out.facebook || out.instagram) && j.videoUrl && d.setProductVideo) {
      await d
        .setProductVideo(j.productId, j.videoUrl)
        .then(() => console.log(`[daily-video] video added to the product page: ${j.productName}`))
        .catch((e) => console.warn('[daily-video] could not add the video to the product:', e?.message));
    }
  };

  // ------------------------------------------------------------------ the daily clock
  let posting = false;
  const tick = async () => {
    const day = pkDate();
    const hour = pkHour();
    const today = state.jobs.filter((j) => j.day === day);
    // (up to 3 tries a day if making the video fails)
    const failed = today.filter((j) => j.status === 'FAILED').length;
    if (hour >= MAKE_HOUR_PK && hour < 22 && today.length === failed && failed < 3) await makeVideo(failed > 0);
    if (hour >= POST_HOUR_PK && !posting) {
      // a failed post (e.g. Meta blocked the key for a while) is tried again every 30 minutes, 3 tries in all
      const ready = today.find(
        (j) => j.status === 'APPROVED' && (!j.postedAt || ((j.tries || 1) < 3 && Date.now() - Date.parse(j.postedAt) >= 30 * 60_000)),
      );
      if (ready) {
        posting = true;
        await post(ready).finally(() => (posting = false));
      }
    }
  };
  setInterval(() => tick().catch((e) => console.warn('[daily-video] tick failed:', e?.message)), 5 * 60_000).unref?.();
  setTimeout(() => tick().catch(() => {}), 2 * 60_000).unref?.();

  // ------------------------------------------------------------------ routes
  // The hidden recording window: what to draw, and where the finished video goes
  app.get('/api/daily-video/render/:id', (req, res) => {
    const id = String(req.params.id);
    const input = jobInput.get(id);
    if (!okSig(id, req.query.k) || !input) return res.status(404).json({ error: 'Not found' });
    res.json(input);
  });
  app.post('/api/daily-video/render/:id', express.raw({ type: () => true, limit: '60mb' }), async (req, res) => {
    const id = String(req.params.id);
    const w = waiting.get(id);
    if (!okSig(id, req.query.k) || !w) return res.status(404).json({ error: 'Not found' });
    const buf = req.body as Buffer;
    if (req.query.error) {
      w.reject(new Error(String(req.query.error).slice(0, 200)));
      return res.json({ success: true });
    }
    if (!Buffer.isBuffer(buf) || buf.length < 20_000) {
      w.reject(new Error('The video did not record properly.'));
      return res.status(400).json({ error: 'Too small' });
    }
    try {
      const mp4 = String(req.headers['content-type'] || '').includes('mp4');
      w.resolve(await d.storeMedia(buf, mp4 ? 'mp4' : 'webm', mp4 ? 'video/mp4' : 'video/webm'));
      res.json({ success: true });
    } catch (e: any) {
      w.reject(e);
      res.status(500).json({ error: 'Could not save' });
    }
  });

  // The owner's page: watch the video, then Yes / No / another product
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = (j: Job, note = '') => {
    const k = sign(j.id);
    const state =
      j.status === 'READY'
        ? `<form method="post" action="/daily-video/${j.id}/decide?k=${k}" class="btns">
             <button name="do" value="yes" class="yes">✅ Yes, post karein</button>
             <button name="do" value="no" class="no">❌ No, aaj nahi</button>
             <button name="do" value="other" class="other">🔄 Koi aur product</button>
           </form>`
        : j.status === 'APPROVED'
          ? j.postedAt
            ? `<p class="no-t">Post nahi ho saki.${(j.tries || 1) < 3 ? ' Store 30 minute baad khud dobara koshish karega.' : ' 3 koshishen ho chuki hain.'}</p>`
            : `<p class="ok">✅ Approve ho gayi. ${pkHour() >= POST_HOUR_PK ? 'Abhi post ho rahi hai.' : `Aaj shaam ${POST_HOUR_PK - 12} baje post hogi.`}</p>`
          : j.status === 'POSTED'
            ? `<p class="ok">✅ Post ho gayi.${j.posted?.facebook ? ' Facebook ✔' : ''}${j.posted?.instagram ? ' Instagram ✔' : ''}</p>`
            : j.status === 'REJECTED'
              ? '<p class="no-t">❌ Aaj ki video post nahi hogi.</p>'
              : `<p class="no-t">${esc(j.status)} ${esc(j.error || '')}</p>`;
    const errs = j.posted?.errors?.length ? `<p class="no-t">${j.posted.errors.map(esc).join('<br>')}</p>` : '';
    // WhatsApp Channel, TikTok and X have no posting API for us: after "Yes" the owner shares the video
    // by hand. On a phone the share sheet gets the video file + caption (the caption is also copied,
    // since TikTok drops it); on a computer the video is downloaded and the site opens.
    const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
    const share =
      (j.status === 'APPROVED' || j.status === 'POSTED') && j.videoUrl
        ? `<div class="share"><p style="font-size:13px;color:#575653;margin:16px 0 6px">Khud share karein (caption khud copy ho jati hai):</p>
<div class="sbtns"><button type="button" class="wa" onclick="shareTo('WhatsApp')">WhatsApp / Channel</button>
<button type="button" class="tt" onclick="shareTo('TikTok')">TikTok</button>
<button type="button" class="xx" onclick="shareTo('X')">X (Twitter)</button></div><p id="sh-msg" class="ok" style="font-size:13px"></p></div>
<script>
var CAP=${js(j.caption || '')},VID=${js(j.videoUrl)};
function shareTo(app){
  var msg=document.getElementById('sh-msg');
  try{navigator.clipboard.writeText(CAP).catch(function(){})}catch(e){}
  msg.textContent='Video tayyar ho rahi hai...';
  fetch(VID).then(function(r){return r.blob()}).then(function(b){
    var mp4=(b.type||'').indexOf('mp4')>=0;
    var file=new File([b],'anokha-video.'+(mp4?'mp4':'webm'),{type:b.type||'video/mp4'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      return navigator.share({files:[file],text:CAP}).then(function(){
        msg.textContent='✅ Caption copy ho chuki hai. '+app+' mein likhai na aaye to likhne ki jagah dabba kar Paste karein.';
      },function(e){msg.textContent=(e&&e.name==='AbortError')?'':'Share nahi ho saka: '+e.message;});
    }
    var a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();
    var urls={WhatsApp:'https://web.whatsapp.com/',TikTok:'https://www.tiktok.com/upload',X:'https://x.com/intent/post?text='+encodeURIComponent(CAP)};
    window.open(urls[app],'_blank');
    msg.textContent='✅ Video download ho gayi aur caption copy ho gayi. '+app+' mein video upload karein aur caption Paste karein.';
  }).catch(function(e){msg.textContent='Video nahi mil saki: '+e.message;});
}
</script>`
        : '';
    return `<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Aaj ki video</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#FBFBF9;color:#141413}main{max-width:520px;margin:0 auto;padding:16px}
video{width:100%;border-radius:12px;background:#000}pre{white-space:pre-wrap;background:#fff;border:1px solid #E7E5DF;border-radius:10px;padding:10px;font:13px/1.45 system-ui}
.btns{display:grid;gap:8px;margin-top:12px}button{font:600 16px system-ui;padding:14px;border-radius:10px;border:0;cursor:pointer}
.yes{background:#0E7A43;color:#fff}.no{background:#fff;border:1px solid #DCD9D2}.other{background:#F1F0EC}.ok{color:#0E7A43;font-weight:700}.no-t{color:#9F1239}
.sbtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.sbtns button{font-size:14px;padding:12px 6px;color:#fff}.wa{background:#1FA855}.tt{background:#141413}.xx{background:#3A3A38}
</style></head><body><main><h1 style="font-size:18px">🎬 Aaj ki video</h1><p>${esc(j.productName)}</p>
${note ? `<p class="ok">${esc(note)}</p>` : ''}
<video src="${esc(j.videoUrl || '')}" controls playsinline autoplay muted loop></video>
<p style="font-size:13px;color:#575653">Post ke saath yeh likha jayega:</p><pre>${esc(j.caption || '')}</pre>${state}${errs}${share}</main></body></html>`;
  };
  app.get('/daily-video/:id', (req, res) => {
    const j = job(String(req.params.id));
    if (!j || !okSig(j.id, req.query.k)) return res.status(404).send('Not found');
    res.setHeader('Cache-Control', 'no-store');
    res.send(page(j));
  });
  app.post('/daily-video/:id/decide', express.urlencoded({ extended: false }), async (req, res) => {
    const j = job(String(req.params.id));
    if (!j || !okSig(j.id, req.query.k)) return res.status(404).send('Not found');
    res.setHeader('Cache-Control', 'no-store');
    if (j.status !== 'READY') return res.send(page(j));
    const what = String(req.body?.do || '');
    j.decidedAt = new Date().toISOString();
    if (what === 'yes') {
      j.status = 'APPROVED';
      save();
      // after the posting time it goes out at once
      if (pkHour() >= POST_HOUR_PK) setTimeout(() => tick().catch(() => {}), 1000);
      return res.send(page(j));
    }
    j.status = 'REJECTED';
    save();
    if (what === 'other') {
      makeVideo(true).catch(() => {});
      return res.send(page(j, 'Doosre product ki video ban rahi hai. 2-3 minute mein naya link aa jayega.'));
    }
    res.send(page(j));
  });

  // Admin: list and make one now
  app.get('/api/admin/daily-video', d.requireAdmin, (_req, res) => {
    res.json({ success: true, jobs: state.jobs.slice(-20).reverse().map((j) => ({ ...j, link: approveUrl(j) })) });
  });
  app.post('/api/admin/daily-video/make', d.requireAdmin, async (_req, res) => {
    const j = await makeVideo(true);
    if (!j) return res.status(409).json({ error: 'A video is already being made, or no product can be used.' });
    res.json({ success: true, job: { ...j, link: approveUrl(j) } });
  });
  // This computer only (the secret file is on this computer): make one now for a test
  app.post('/api/daily-video/make-now', async (req, res) => {
    const k = String(req.query.k || '');
    if (k.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(secret))) return res.status(404).json({ error: 'Not found' });
    // ?new=1: make a new video even when the product has its own
    const j = await makeVideo(true, req.query.new === '1');
    res.json({ success: Boolean(j && j.status === 'READY'), job: j && { ...j, link: approveUrl(j) } });
  });
}
