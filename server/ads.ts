import type express from 'express';
import crypto from 'crypto';

// Ad platforms (Meta, Google Ads, TikTok) for the admin's Traffic & Conversion tab:
//   - every 6 hours (and on "Refresh") the last 30 days of campaign stats are pulled from each
//     platform whose keys are set in .env, and kept as ONE document (ads_cache/latest) + memory
//   - orders and revenue per platform / campaign come from our own analytics (the store records
//     which ad brought each order), so ROAS = our revenue from that ad ÷ ad spend
//   - Meta Conversions API (server side, no browser pixel): Purchase, AddToCart and
//     InitiateCheckout are sent to Meta when META_PIXEL_ID is set (email / phone SHA-256 hashed)
// Keys live only in .env on the server; they are never sent to the browser or logged.
//
// .env:
//   META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, [META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE, META_API_VERSION]
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_CUSTOMER_ID, [GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_API_VERSION]
//   TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID, [TIKTOK_CURRENCY]

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
export type Platform = 'meta' | 'google' | 'tiktok';
type Row = {
  platform: Platform;
  campaignId: string;
  campaignName: string;
  channel?: string;
  date: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number;
  conversionValue?: number;
  videoViews?: number;
  installs?: number;
  budget?: number;
};

export interface AdsDeps {
  adminDb: FirebaseFirestore.Firestore;
  requireAdmin: Handler;
  isQuotaHit: () => boolean;
  usdToPkr: () => number;
  report: (from: string, to: string) => Promise<any>;
}

const env = (k: string) => String(process.env[k] || '').trim();
const metaVersion = () => env('META_API_VERSION') || 'v21.0';
const configured = {
  meta: () => Boolean(env('META_ACCESS_TOKEN') && env('META_AD_ACCOUNT_ID')),
  google: () =>
    ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'].every((k) => env(k)),
  tiktok: () => Boolean(env('TIKTOK_ACCESS_TOKEN') && env('TIKTOK_ADVERTISER_ID')),
  capi: () => Boolean(env('META_PIXEL_ID') && (env('META_CAPI_TOKEN') || env('META_ACCESS_TOKEN'))),
};
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n = (v: unknown) => Number(v) || 0;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

// fetch with retries for rate limits (429) and server errors, honouring Retry-After
async function fetchJson(url: string, init: RequestInit, label: string, tries = 4): Promise<any> {
  let last = '';
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (err: any) {
      last = err?.message || 'network error';
      await sleep(1000 * 3 ** i);
      continue;
    }
    const text = await res.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {}
    if (res.ok) return body;
    last = `${res.status} ${body?.error?.message || body?.message || text.slice(0, 160)}`;
    if (res.status === 429 || res.status >= 500 || body?.error?.code === 17 || body?.error?.code === 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 3 ** i;
      await sleep(Math.min(wait, 60_000));
      continue;
    }
    break;
  }
  throw new Error(`${label}: ${last}`);
}

// ---------------------------------------------------------------- platform readers

async function fetchMeta(): Promise<Row[]> {
  const act = env('META_AD_ACCOUNT_ID').replace(/^act_/, '');
  const fields = 'campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,account_currency,action_values';
  let url: string | null = `https://graph.facebook.com/${metaVersion()}/act_${act}/insights?level=campaign&time_increment=1&date_preset=last_30d&limit=500&fields=${fields}`;
  const rows: Row[] = [];
  for (let page = 0; url && page < 20; page++) {
    const body = await fetchJson(url, { headers: { Authorization: `Bearer ${env('META_ACCESS_TOKEN')}` } }, 'Meta');
    for (const r of body.data || []) {
      const purchase = (r.action_values || []).find((a: any) => /(^|\.)purchase$|omni_purchase/.test(String(a.action_type)));
      rows.push({
        platform: 'meta',
        campaignId: String(r.campaign_id),
        campaignName: String(r.campaign_name || r.campaign_id),
        date: String(r.date_start),
        currency: String(r.account_currency || 'USD'),
        spend: n(r.spend),
        impressions: n(r.impressions),
        clicks: n(r.inline_link_clicks),
        reach: n(r.reach),
        conversionValue: n(purchase?.value),
      });
    }
    url = body.paging?.next || null;
  }
  return rows;
}

async function fetchGoogle(): Promise<Row[]> {
  const tok = await fetchJson(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env('GOOGLE_ADS_CLIENT_ID'),
        client_secret: env('GOOGLE_ADS_CLIENT_SECRET'),
        refresh_token: env('GOOGLE_ADS_REFRESH_TOKEN'),
      }),
    },
    'Google sign-in'
  );
  const cid = env('GOOGLE_ADS_CUSTOMER_ID').replace(/-/g, '');
  const query = `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign_budget.amount_micros, customer.currency_code,
    segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions_value
    FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
  const body = await fetchJson(
    `https://googleads.googleapis.com/${env('GOOGLE_ADS_API_VERSION') || 'v21'}/customers/${cid}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'developer-token': env('GOOGLE_ADS_DEVELOPER_TOKEN'),
        'Content-Type': 'application/json',
        ...(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ? { 'login-customer-id': env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/-/g, '') } : {}),
      },
      body: JSON.stringify({ query }),
    },
    'Google Ads'
  );
  const rows: Row[] = [];
  for (const batch of Array.isArray(body) ? body : [body]) {
    for (const r of batch.results || []) {
      const channel = String(r.campaign?.advertisingChannelType || '');
      rows.push({
        platform: 'google',
        campaignId: String(r.campaign?.id),
        campaignName: String(r.campaign?.name || r.campaign?.id),
        channel: channel === 'VIDEO' ? 'YouTube' : channel === 'DISPLAY' ? 'Display' : channel === 'SEARCH' ? 'Search' : channel.toLowerCase(),
        date: String(r.segments?.date),
        currency: String(r.customer?.currencyCode || 'USD'),
        spend: n(r.metrics?.costMicros) / 1e6,
        impressions: n(r.metrics?.impressions),
        clicks: n(r.metrics?.clicks),
        conversionValue: n(r.metrics?.conversionsValue),
        budget: n(r.campaignBudget?.amountMicros) / 1e6,
      });
    }
  }
  return rows;
}

async function fetchTikTok(): Promise<Row[]> {
  const end = ymd(Date.now());
  const start = ymd(Date.now() - 29 * 86400_000);
  const run = async (metrics: string[]) => {
    const rows: Row[] = [];
    for (let page = 1; page <= 20; page++) {
      const q = new URLSearchParams({
        advertiser_id: env('TIKTOK_ADVERTISER_ID'),
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
        metrics: JSON.stringify(metrics),
        start_date: start,
        end_date: end,
        page: String(page),
        page_size: '1000',
      });
      const body = await fetchJson(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${q}`, { headers: { 'Access-Token': env('TIKTOK_ACCESS_TOKEN') } }, 'TikTok');
      if (body.code !== 0) throw Object.assign(new Error(`TikTok: ${body.code} ${body.message || ''}`), { tiktokCode: body.code });
      for (const r of body.data?.list || []) {
        const m = r.metrics || {};
        rows.push({
          platform: 'tiktok',
          campaignId: String(r.dimensions?.campaign_id),
          campaignName: String(m.campaign_name || r.dimensions?.campaign_id),
          date: String(r.dimensions?.stat_time_day || '').slice(0, 10),
          currency: env('TIKTOK_CURRENCY') || 'USD',
          spend: n(m.spend),
          impressions: n(m.impressions),
          clicks: n(m.clicks),
          videoViews: n(m.video_play_actions),
          installs: n(m.app_install),
        });
      }
      const info = body.data?.page_info;
      if (!info || page >= n(info.total_page)) break;
    }
    return rows;
  };
  const base = ['campaign_name', 'spend', 'impressions', 'clicks', 'video_play_actions'];
  try {
    return await run([...base, 'app_install']);
  } catch (err: any) {
    // accounts without app campaigns may reject the install metric
    if (err?.tiktokCode) return run(base);
    throw err;
  }
}

// ---------------------------------------------------------------- module

export function createAds(d: AdsDeps) {
  const ref = () => d.adminDb.collection('ads_cache').doc('latest');
  let cache: { syncedAt: string; rows: Row[]; errors: Record<string, string> } | null = null;
  let loaded = false;
  let syncing: Promise<void> | null = null;
  let lastManual = 0;

  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const snap = await ref().get();
      if (snap.exists) cache = snap.data() as any;
    } catch (err: any) {
      loaded = false;
      console.warn('[ads] load failed:', err?.message);
    }
  };

  const sync = () => {
    if (syncing) return syncing;
    syncing = (async () => {
      await load();
      const errors: Record<string, string> = {};
      const keep = (p: Platform) => (cache?.rows || []).filter((r) => r.platform === p);
      const results = await Promise.all(
        ([
          ['meta', fetchMeta],
          ['google', fetchGoogle],
          ['tiktok', fetchTikTok],
        ] as const).map(async ([p, fn]) => {
          if (!configured[p]()) return [] as Row[];
          try {
            return await fn();
          } catch (err: any) {
            errors[p] = String(err?.message || err).slice(0, 300);
            console.warn(`[ads] ${p} sync failed:`, errors[p]);
            return keep(p); // keep the last good numbers
          }
        })
      );
      let rows = results.flat();
      // stay well under Firestore's 1 MB document limit
      while (JSON.stringify(rows).length > 800_000 && rows.length) {
        const oldest = rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date);
        rows = rows.filter((r) => r.date !== oldest);
      }
      cache = { syncedAt: new Date().toISOString(), rows, errors };
      if (!d.isQuotaHit()) await ref().set(cache).catch((err) => console.warn('[ads] save failed:', err?.message));
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  };

  const anyConfigured = () => configured.meta() || configured.google() || configured.tiktok();
  // every 6 hours; the first run shortly after start if the saved copy is older than that
  setTimeout(async () => {
    if (!anyConfigured()) return;
    await load();
    if (!cache || Date.now() - Date.parse(cache.syncedAt) > 6 * 3600_000) sync().catch(() => {});
  }, 2 * 60_000).unref?.();
  setInterval(() => anyConfigured() && sync().catch(() => {}), 6 * 3600_000).unref?.();

  // ---------------------------------------------------------------- Meta Conversions API
  const capi = (events: any[]) => {
    if (!configured.capi() || !events.length) return;
    const token = env('META_CAPI_TOKEN') || env('META_ACCESS_TOKEN');
    fetchJson(
      `https://graph.facebook.com/${metaVersion()}/${env('META_PIXEL_ID')}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: events, ...(env('META_TEST_EVENT_CODE') ? { test_event_code: env('META_TEST_EVENT_CODE') } : {}) }),
      },
      'Meta CAPI',
      3
    ).catch((err) => console.warn('[ads] CAPI:', err?.message));
  };
  const clientData = (req: express.Request, fbclid?: string) => ({
    client_ip_address: req.ip,
    client_user_agent: String(req.headers['user-agent'] || '').slice(0, 400),
    ...(fbclid ? { fbc: `fb.1.${Date.now()}.${fbclid}` } : {}),
  });
  const pageUrl = (req: express.Request) => String(req.headers.origin || req.headers.referer || '').slice(0, 300) || undefined;

  const onPurchase = (orders: any[], attribution: any, req: express.Request) => {
    if (!configured.capi() || !orders.length) return;
    const o = orders[0];
    const phone = String(o.customerPhone || '').replace(/\D/g, '').replace(/^0/, '92');
    const email = String(o.customerEmail || '').trim().toLowerCase();
    const items = orders.flatMap((x) => x.items || []);
    capi([
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `order-${o.orderNumber}`,
        action_source: 'website',
        event_source_url: pageUrl(req),
        user_data: {
          ...clientData(req, attribution?.fbclid),
          ...(email && !/guest@example\.com/.test(email) ? { em: [sha(email)] } : {}),
          ...(phone ? { ph: [sha(phone)] } : {}),
          ...(o.userId ? { external_id: [sha(String(o.userId))] } : {}),
        },
        custom_data: {
          currency: 'PKR',
          value: Math.round(orders.reduce((s, x) => s + n(x.total), 0)),
          content_type: 'product',
          content_ids: items.map((it: any) => String(it.productId)).slice(0, 50),
          num_items: items.reduce((s: number, it: any) => s + n(it.quantity), 0),
        },
      },
    ]);
  };
  /** Funnel steps from the store's tracking batches (anonymous: device id hashed, IP, browser) */
  const onFunnelEvents = (visitor: string, events: { t: string; p?: string; n?: number }[], req: express.Request) => {
    if (!configured.capi()) return;
    const now = Math.floor(Date.now() / 1000);
    const out = events
      .filter((e) => e.t === 'cart' || e.t === 'chk')
      .slice(0, 20)
      .map((e, i) => ({
        event_name: e.t === 'cart' ? 'AddToCart' : 'InitiateCheckout',
        event_time: now,
        event_id: `${e.t}-${visitor.slice(0, 12)}-${now}-${i}`,
        action_source: 'website',
        event_source_url: pageUrl(req),
        user_data: { ...clientData(req), external_id: [sha(visitor)] },
        custom_data: { currency: 'PKR', ...(e.p ? { content_ids: [e.p], content_type: 'product' } : {}) },
      }));
    capi(out);
  };

  // ---------------------------------------------------------------- report
  const toPkr = (amount: number, currency: string) => (String(currency).toUpperCase() === 'USD' ? amount * d.usdToPkr() : amount);
  const buildReport = async (from: string, to: string) => {
    await load();
    const rows = (cache?.rows || []).filter((r) => r.date >= from && r.date <= to);
    const traffic = await d.report(from, to);
    const attributed: { source: string; campaign: string; orders: number; revenue: number }[] = traffic.campaigns || [];
    const bySource = new Map<string, any>((traffic.sources || []).map((s: any) => [s.source, s]));

    const camp = new Map<string, any>();
    for (const r of rows) {
      const k = `${r.platform}|${r.campaignId}`;
      const c = camp.get(k) || {
        platform: r.platform,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        channel: r.channel || '',
        currency: r.currency,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        platformConversionValue: 0,
        videoViews: 0,
        installs: 0,
        budget: 0,
        lastDate: '',
      };
      c.spend += toPkr(r.spend, r.currency);
      c.impressions += r.impressions;
      c.clicks += r.clicks;
      c.reach += r.reach || 0;
      c.platformConversionValue += toPkr(r.conversionValue || 0, r.currency);
      c.videoViews += r.videoViews || 0;
      c.installs += r.installs || 0;
      if (r.date >= c.lastDate) {
        c.lastDate = r.date;
        c.budget = toPkr(r.budget || 0, r.currency);
        c.campaignName = r.campaignName;
      }
      camp.set(k, c);
    }
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^\w]+/g, '');
    const campaigns = Array.from(camp.values()).map((c) => {
      const match = attributed.filter((a) => a.source === c.platform && [norm(c.campaignId), norm(c.campaignName)].includes(norm(a.campaign)));
      const orders = match.reduce((s, a) => s + a.orders, 0);
      const revenue = match.reduce((s, a) => s + a.revenue, 0);
      return {
        ...c,
        spend: Math.round(c.spend),
        ctr: c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        cpc: c.clicks ? Math.round(c.spend / c.clicks) : 0,
        orders,
        revenue,
        roas: c.spend ? Math.round((revenue / c.spend) * 100) / 100 : null,
        platformRoas: c.spend && c.platformConversionValue ? Math.round((c.platformConversionValue / c.spend) * 100) / 100 : null,
      };
    });
    // orders tagged with a campaign the platform did not return (or no keys yet)
    for (const a of attributed) {
      if (!['meta', 'google', 'tiktok'].includes(a.source)) continue;
      if (campaigns.some((c) => c.platform === a.source && [norm(c.campaignId), norm(c.campaignName)].includes(norm(a.campaign)))) continue;
      campaigns.push({ platform: a.source, campaignId: '', campaignName: a.campaign, channel: '', spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, orders: a.orders, revenue: a.revenue, roas: null } as any);
    }
    campaigns.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

    const platforms = (['meta', 'google', 'tiktok'] as Platform[]).map((p) => {
      const list = campaigns.filter((c) => c.platform === p);
      const spend = list.reduce((s, c) => s + (c.spend || 0), 0);
      const src = bySource.get(p) || {};
      return {
        platform: p,
        configured: configured[p](),
        error: cache?.errors?.[p] || '',
        spend,
        impressions: list.reduce((s, c) => s + (c.impressions || 0), 0),
        clicks: list.reduce((s, c) => s + (c.clicks || 0), 0),
        visitors: src.visitors || 0,
        orders: src.orders || 0,
        revenue: src.revenue || 0,
        roas: spend ? Math.round(((src.revenue || 0) / spend) * 100) / 100 : null,
      };
    });
    const organic = (traffic.sources || [])
      .filter((s: any) => !['meta', 'google', 'tiktok'].includes(s.source))
      .reduce((acc: any, s: any) => ({ visitors: acc.visitors + s.visitors, orders: acc.orders + (s.orders || 0), revenue: acc.revenue + (s.revenue || 0) }), { visitors: 0, orders: 0, revenue: 0 });
    return { from, to, syncedAt: cache?.syncedAt || null, capi: configured.capi(), usdToPkr: d.usdToPkr(), platforms, organic, campaigns };
  };

  const register = (app: express.Express) => {
    app.get('/api/admin/ads', d.requireAdmin, async (req, res) => {
      const valid = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
      const to = valid(req.query.to) || ymd(Date.now());
      const from = valid(req.query.from) || ymd(Date.now() - 6 * 86400_000);
      try {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, ...(await buildReport(from, to)) });
      } catch (err) {
        console.error('[admin/ads] failed:', err);
        res.status(503).json({ error: 'Could not build the ads report.' });
      }
    });
    app.post('/api/admin/ads/refresh', d.requireAdmin, async (_req, res) => {
      if (!anyConfigured()) return res.status(409).json({ error: 'No ad platform is connected yet. Add the API keys to the server .env file first.' });
      if (Date.now() - lastManual < 2 * 60_000) return res.status(429).json({ error: 'Just refreshed. Please wait 2 minutes.' });
      lastManual = Date.now();
      try {
        await sync();
        res.json({ success: true, syncedAt: cache?.syncedAt, errors: cache?.errors || {} });
      } catch (err: any) {
        res.status(503).json({ error: err?.message || 'Refresh failed.' });
      }
    });
  };

  return { register, onPurchase, onFunnelEvents };
}
