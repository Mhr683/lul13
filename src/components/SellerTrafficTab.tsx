import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Eye, Store, ShoppingCart, Package, Wallet, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Callout, Empty, Loading, Panel, SegTabs, Stat, ui } from './SellerUi';
import { HelpDot } from './HelpDot';
import { formatPKR } from '../services/abstractions';

// Seller Center → Traffic: how many people visit this shop, what they look at, and whether visits,
// orders and sales are going up or down (GET /api/seller/traffic, built from the store's daily
// analytics in server/analytics.ts).

type Metric = 'visitors' | 'shopViews' | 'productViews' | 'addToCart' | 'orders' | 'revenue';
type Total = { value: number; previous: number; change: number };
type Report = {
  days: number;
  from: string;
  to: string;
  totals: Record<Metric | 'clicks' | 'unitsSold', Total>;
  conversionRate: { value: number; previous: number };
  series: Array<Record<Metric | 'clicks' | 'unitsSold', number> & { date: string }>;
  sources: { source: string; visitors: number }[];
  topProducts: { id: string; name: string; impressions: number; views: number; addToCart: number; sold: number }[];
  lowClick: { id: string; name: string; impressions: number; views: number; openRate: number }[];
};

const METRICS: { id: Metric; label: string; color: string; money?: boolean }[] = [
  { id: 'visitors', label: 'Visitors', color: '#0E7A43' },
  { id: 'shopViews', label: 'Shop visits', color: '#2563EB' },
  { id: 'productViews', label: 'Product views', color: '#7C3AED' },
  { id: 'addToCart', label: 'Add to cart', color: '#D97706' },
  { id: 'orders', label: 'Orders', color: '#DB2777' },
  { id: 'revenue', label: 'Sales', color: '#0F766E', money: true },
];

const SOURCE_LABEL: Record<string, string> = {
  direct: 'Direct / saved link',
  whatsapp: 'WhatsApp',
  social: 'Facebook / Instagram / TikTok',
  search: 'Google / search',
  meta: 'Facebook / Instagram ads',
  google: 'Google ads',
  tiktok: 'TikTok ads',
  other: 'Other websites',
};

const fmt = (n: number, money?: boolean) => (money ? formatPKR(n) : n.toLocaleString('en-PK'));
const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PK', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });

/** "▲ 24% vs last 30 days" in green, red or grey */
const Trend: React.FC<{ t: Total; days: number }> = ({ t, days }) => {
  if (!t.value && !t.previous) return <span className="text-[#8A8780]">No data yet</span>;
  const up = t.change > 0;
  const flat = t.change === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${flat ? 'text-[#6B6963]' : up ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon className="w-3.5 h-3.5" />
      {flat ? 'Same' : `${up ? '+' : ''}${t.change}%`}
      <span className="font-normal text-[#8A8780]">vs previous {days} days</span>
    </span>
  );
};

/** Line with a dot for every day; tap or hover a dot to see that day */
const DotChart: React.FC<{ series: Report['series']; metric: (typeof METRICS)[number] }> = ({ series, metric }) => {
  const [pick, setPick] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const pad = { l: 44, r: 14, t: 16, b: 30 };
  const vals = series.map((s) => Number(s[metric.id]) || 0);
  const max = Math.max(1, ...vals);
  const niceMax = (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / p) * p;
  })();
  const x = (i: number) => pad.l + (series.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (series.length - 1));
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${x(vals.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const dotR = series.length > 45 ? 2.2 : 3.6;
  const shown = pick ?? vals.length - 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1 px-1">
        <div className="text-[12px] text-[#6B6963]">{series[shown] ? dayLabel(series[shown].date, true) : ''}</div>
        <div className="text-[15px] font-bold" style={{ color: metric.color }}>
          {fmt(vals[shown] || 0, metric.money)} <span className="text-[12px] font-medium text-[#6B6963]">{metric.label.toLowerCase()}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label={`${metric.label} per day`} onMouseLeave={() => setPick(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#EFEDE8" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8A8780">
              {metric.money && t >= 1000 ? `${Math.round(t / 1000)}k` : t}
            </text>
          </g>
        ))}
        <path d={area} fill={metric.color} opacity={0.08} />
        <path d={path} fill="none" stroke={metric.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((s, i) => (
          <g key={s.date}>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#8A8780">
                {dayLabel(s.date)}
              </text>
            )}
            {i === shown && <line x1={x(i)} x2={x(i)} y1={pad.t} y2={y(0)} stroke={metric.color} strokeDasharray="3 3" opacity={0.5} />}
            <circle cx={x(i)} cy={y(vals[i])} r={i === shown ? dotR + 2 : dotR} fill="#fff" stroke={metric.color} strokeWidth={2} />
            {/* wide invisible target so a finger can pick a day */}
            <rect
              x={x(i) - (W - pad.l - pad.r) / Math.max(1, series.length - 1) / 2}
              y={pad.t}
              width={(W - pad.l - pad.r) / Math.max(1, series.length - 1)}
              height={H - pad.t - pad.b}
              fill="transparent"
              onMouseEnter={() => setPick(i)}
              onClick={() => setPick(i)}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

export const SellerTrafficTab: React.FC<{ api: (url: string, init?: RequestInit) => Promise<any>; shopUrl: string }> = ({ api, shopUrl }) => {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [metric, setMetric] = useState<Metric>('visitors');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      setData(await api(`/api/seller/traffic?days=${days}`));
    } catch (err: any) {
      setError(err.message || 'Could not load your traffic.');
    }
  }, [api, days]);
  useEffect(() => {
    load();
  }, [load]);

  const m = METRICS.find((x) => x.id === metric)!;
  const sourceTotal = useMemo(() => (data?.sources || []).reduce((s, x) => s + x.visitors, 0), [data]);

  if (error) {
    return (
      <Callout tone="danger" icon="⚠️" action={<button type="button" onClick={load} className={ui.secondary}>Try again</button>}>
        {error}
      </Callout>
    );
  }

  const n = Number(days);
  const t = data?.totals;
  const nothingYet = data && !t?.visitors.value && !t?.productViews.value && !t?.orders.value;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegTabs
          value={days}
          onChange={setDays}
          items={[
            { id: '7', label: 'Last 7 days' },
            { id: '30', label: 'Last 30 days' },
            { id: '90', label: 'Last 90 days' },
          ]}
        />
        <HelpDot id="seller.traffic" />
      </div>

      {!data ? (
        <Loading text="Loading your traffic..." rows={4} />
      ) : (
        <>
          {nothingYet && (
            <Callout tone="info" icon="📣">
              No visits recorded yet for these days. Share your shop link on WhatsApp, Facebook and TikTok to bring visitors:{' '}
              <strong className="break-all">{shopUrl}</strong>
            </Callout>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat label="Visitors" value={fmt(t!.visitors.value)} hint={<Trend t={t!.visitors} days={n} />} icon={Users} tone="bg-emerald-100 text-emerald-800" onClick={() => setMetric('visitors')} highlight={metric === 'visitors'} />
            <Stat label="Shop page visits" value={fmt(t!.shopViews.value)} hint={<Trend t={t!.shopViews} days={n} />} icon={Store} tone="bg-blue-100 text-blue-800" onClick={() => setMetric('shopViews')} highlight={metric === 'shopViews'} />
            <Stat label="Product views" value={fmt(t!.productViews.value)} hint={<Trend t={t!.productViews} days={n} />} icon={Eye} tone="bg-violet-100 text-violet-800" onClick={() => setMetric('productViews')} highlight={metric === 'productViews'} />
            <Stat label="Added to cart" value={fmt(t!.addToCart.value)} hint={<Trend t={t!.addToCart} days={n} />} icon={ShoppingCart} tone="bg-amber-100 text-amber-800" onClick={() => setMetric('addToCart')} highlight={metric === 'addToCart'} />
            <Stat label="Orders" value={fmt(t!.orders.value)} hint={<Trend t={t!.orders} days={n} />} icon={Package} tone="bg-pink-100 text-pink-800" onClick={() => setMetric('orders')} highlight={metric === 'orders'} />
            <Stat label="Sales" value={fmt(t!.revenue.value, true)} hint={<Trend t={t!.revenue} days={n} />} icon={Wallet} tone="bg-teal-100 text-teal-800" onClick={() => setMetric('revenue')} highlight={metric === 'revenue'} />
          </div>

          <Panel
            title="Day by day"
            subtitle="Each dot is one day. Tap a dot to see that day, or a box above to change the graph."
          >
            <div className="flex flex-wrap gap-1.5 mb-3">
              {METRICS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setMetric(x.id)}
                  className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border cursor-pointer ${
                    metric === x.id ? 'text-white border-transparent' : 'bg-white text-[#55534E] border-[#E7E5DF]'
                  }`}
                  style={metric === x.id ? { background: x.color } : undefined}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <DotChart series={data.series} metric={m} />
            <p className="mt-2 text-[12px] text-[#6B6963]">
              Visitors who ordered: <strong className="text-[#141413]">{data.conversionRate.value}%</strong>
              {data.conversionRate.previous ? <> (previous {n} days: {data.conversionRate.previous}%)</> : null}
            </p>
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Where your visitors came from" subtitle={`Last ${n} days`}>
              {!data.sources.length ? (
                <Empty icon="🔗" title="No visitors yet" text="Share your shop link to see where people come from." />
              ) : (
                <ul className="space-y-2.5">
                  {[...data.sources]
                    .sort((a, b) => b.visitors - a.visitors)
                    .map((s) => {
                      const pct = sourceTotal ? Math.round((s.visitors / sourceTotal) * 100) : 0;
                      return (
                        <li key={s.source}>
                          <div className="flex justify-between text-[12.5px]">
                            <span className="text-[#2A2A28]">{SOURCE_LABEL[s.source] || s.source}</span>
                            <span className="font-semibold">
                              {s.visitors.toLocaleString('en-PK')} <span className="text-[#8A8780] font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-[#F2F1EC] overflow-hidden">
                            <div className="h-full rounded-full bg-[#0E7A43]" style={{ width: `${Math.max(3, pct)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Panel>

            <Panel title="Your most viewed products" subtitle={`Last ${n} days`} flush>
              {!data.topProducts.length ? (
                <Empty icon="👀" title="No product views yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[#8A8780]">
                        <th className="px-4 py-2 font-semibold">Product</th>
                        <th className="px-2 py-2 font-semibold text-right">Views</th>
                        <th className="px-2 py-2 font-semibold text-right">Cart</th>
                        <th className="px-4 py-2 font-semibold text-right">Sold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p) => (
                        <tr key={p.id} className="border-t border-[#EFEDE8]">
                          <td className="px-4 py-2 max-w-[220px] truncate" title={p.name}>{p.name}</td>
                          <td className="px-2 py-2 text-right">{p.views}</td>
                          <td className="px-2 py-2 text-right">{p.addToCart}</td>
                          <td className="px-4 py-2 text-right font-semibold">{p.sold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {data.lowClick.length > 0 && (
            <Panel title="Seen a lot, opened rarely" subtitle="Customers scroll past these. A clearer main picture, a better title or a sharper price usually helps.">
              <ul className="space-y-1.5 text-[12.5px]">
                {data.lowClick.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-[#6B6963]">
                      shown {p.impressions.toLocaleString('en-PK')} times, opened {p.openRate}%
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
};
