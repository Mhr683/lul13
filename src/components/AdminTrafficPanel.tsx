import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, FileSpreadsheet, Printer, Users, Eye, MousePointerClick, Percent, ShoppingCart, TrendingDown } from 'lucide-react';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';
import { AdminAdsSection } from './AdminAdsSection';

// Admin → Traffic & Conversion: visitors, impressions, clicks, CTR, traffic sources, the conversion
// funnel with drop-offs, most viewed vs most sold products, seller activity, cancellation / return
// reasons and a visits heatmap. Revenue, profit and AOV stay on the Executive Analytics tab.
// Data: /api/admin/analytics (one stored document per day; charts are plain SVG, no chart library).

type Report = {
  from: string;
  to: string;
  totals: Record<string, number>;
  series: { date: string; visitors: number; pageViews: number; impressions: number; clicks: number; productViews: number; addToCart: number; checkoutStarted: number; orders: number; revenue: number }[];
  sources: { source: string; visitors: number }[];
  funnel: { key: string; label: string; value: number; ofPrevious: number | null; dropOff: number | null }[];
  mostViewed: { id: string; name: string; impressions: number; clicks: number; views: number; addToCart: number; sold: number }[];
  mostSold: { id: string; name: string; impressions: number; clicks: number; views: number; addToCart: number; sold: number }[];
  sellers: { registered: number | null; weeks: { week: string; activeSellers: number; orders: number }[]; top: { id: string; name: string; orders: number }[] };
  cancelReasons: { reason: string; count: number }[];
  returnReasons: { reason: string; count: number }[];
  heatmap: number[][];
};

async function api<T = any>(path: string): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

const PK = 5 * 3600_000;
const day = (offsetDays = 0) => new Date(Date.now() + PK - offsetDays * 86400_000).toISOString().slice(0, 10);
const SOURCE_LABEL: Record<string, string> = {
  direct: 'Direct',
  meta: 'Meta ads (FB / IG)',
  google: 'Google ads',
  tiktok: 'TikTok ads',
  social: 'Facebook / Instagram (organic)',
  whatsapp: 'WhatsApp & referrals',
  search: 'Search (Google...)',
  other: 'Other websites',
};
const SOURCE_COLOR: Record<string, string> = { direct: '#141413', meta: '#1D4ED8', google: '#EA580C', tiktok: '#DB2777', social: '#60A5FA', whatsapp: '#16A34A', search: '#F59E0B', other: '#A8A29E' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = (n: number) => Math.round(n || 0).toLocaleString('en-PK');
const card = 'p-4 bg-white border border-black/10 rounded-lg';

// ---------------------------------------------------------------- charts (SVG)

const DailyChart: React.FC<{ data: Report['series'] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = 170;
  const maxV = Math.max(1, ...data.map((d) => d.visitors));
  const maxO = Math.max(1, ...data.map((d) => d.orders));
  const bw = w / Math.max(1, data.length);
  const pts = data.map((d, i) => `${i * bw + bw / 2},${h - (d.orders / maxO) * (h - 10)}`).join(' ');
  const s = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[#575653] mb-1">
        <span>
          <span className="inline-block w-2.5 h-2.5 bg-[#0E7A43] mr-1" />Unique visitors (bars) · <span className="inline-block w-2.5 h-0.5 bg-[#E8590C] mx-1 align-middle" />
          Orders (line)
        </span>
        <span className="font-semibold text-[#141413]">
          {s ? `${s.date}: ${num(s.visitors)} visitors · ${num(s.pageViews)} page views · ${s.orders} orders · ${formatPKR(s.revenue)}` : 'Tap a day for details'}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full h-48" preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={h - h * f} y2={h - h * f} stroke="#EEECE6" />
        ))}
        {data.map((d, i) => {
          const bh = (d.visitors / maxV) * (h - 10);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={h} fill="transparent" />
              <rect x={i * bw + bw * 0.15} y={h - bh} width={bw * 0.7} height={bh} rx="2" fill={hover === i ? '#0B5E34' : '#0E7A43'} opacity={0.85} />
              {(data.length <= 10 || i % Math.ceil(data.length / 8) === 0) && (
                <text x={i * bw + bw / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="#787774">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke="#E8590C" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

const Donut: React.FC<{ rows: { label: string; value: number; color: string }[] }> = ({ rows }) => {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Traffic sources">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EEECE6" strokeWidth="18" />
        {total > 0 &&
          rows.map((row) => {
            const len = (row.value / total) * c;
            const el = (
              <circle
                key={row.label}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={row.color}
                strokeWidth="18"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="60" y="64" textAnchor="middle" fontSize="15" fontWeight="700" fill="#141413">
          {num(total)}
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: row.color }} />
            <span className="w-40">{row.label}</span>
            <strong className="font-mono">{num(row.value)}</strong>
            <span className="text-[#787774]">{total ? `${Math.round((row.value / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Bars: React.FC<{ rows: { label: string; value: number; hint?: string }[]; color: string; empty: string }> = ({ rows, color, empty }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-xs text-[#787774]">{empty}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="font-mono font-semibold shrink-0">
              {num(r.value)}
              {r.hint ? ` · ${r.hint}` : ''}
            </span>
          </div>
          <div className="h-2 bg-[#EEECE6] rounded">
            <div className="h-2 rounded" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- exports

const sections = (r: Report): { name: string; header: string[]; rows: (string | number)[][] }[] => [
  {
    name: 'Summary',
    header: ['Metric', 'Value'],
    rows: [
      ['From', r.from],
      ['To', r.to],
      ['Unique visitors', r.totals.uniqueVisitors],
      ['Page views', r.totals.pageViews],
      ['Impressions', r.totals.impressions],
      ['Clicks', r.totals.clicks],
      ['CTR %', r.totals.ctr],
      ['Product views', r.totals.productViews],
      ['Add to cart', r.totals.addToCart],
      ['Checkout started', r.totals.checkoutStarted],
      ['Orders', r.totals.orders],
      ['Conversion rate % (orders / visitors)', r.totals.conversionRate],
      ['Cancellations', r.totals.cancellations],
      ['Cancellation rate %', r.totals.cancellationRate],
      ['Returns', r.totals.returns],
      ['Return rate %', r.totals.returnRate],
    ],
  },
  {
    name: 'Daily',
    header: ['Date', 'Unique visitors', 'Page views', 'Impressions', 'Clicks', 'Product views', 'Add to cart', 'Checkout started', 'Orders', 'Revenue PKR'],
    rows: r.series.map((d) => [d.date, d.visitors, d.pageViews, d.impressions, d.clicks, d.productViews, d.addToCart, d.checkoutStarted, d.orders, d.revenue]),
  },
  { name: 'Sources', header: ['Source', 'New visitors'], rows: r.sources.map((s) => [SOURCE_LABEL[s.source] || s.source, s.visitors]) },
  { name: 'Funnel', header: ['Step', 'Count', '% of previous', 'Drop-off %'], rows: r.funnel.map((f) => [f.label, f.value, f.ofPrevious ?? '', f.dropOff ?? '']) },
  {
    name: 'Products',
    header: ['Product', 'Impressions', 'Clicks', 'Views', 'Add to cart', 'Sold (units)'],
    rows: [...new Map([...r.mostViewed, ...r.mostSold].map((p) => [p.id, p])).values()].map((p) => [p.name, p.impressions, p.clicks, p.views, p.addToCart, p.sold]),
  },
  { name: 'Sellers', header: ['Week starting', 'Active sellers', 'Orders'], rows: r.sellers.weeks.map((w) => [w.week, w.activeSellers, w.orders]) },
  { name: 'Cancellations', header: ['Reason', 'Count'], rows: r.cancelReasons.map((c) => [c.reason, c.count]) },
  { name: 'Returns', header: ['Reason', 'Count'], rows: r.returnReasons.map((c) => [c.reason, c.count]) },
];

const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportCsv = (r: Report) => {
  const text = sections(r)
    .map((s) => [`# ${s.name}`, s.header.map(csvCell).join(','), ...s.rows.map((row) => row.map(csvCell).join(','))].join('\n'))
    .join('\n\n');
  download(`analytics_${r.from}_to_${r.to}.csv`, '﻿' + text, 'text/csv;charset=utf-8');
};
// Excel workbook (SpreadsheetML 2003: one sheet per section; opens in Excel and Google Sheets)
const xml = (s: string | number) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const exportExcel = (r: Report) => {
  const sheets = sections(r)
    .map(
      (s) =>
        `<Worksheet ss:Name="${xml(s.name)}"><Table>` +
        `<Row>${s.header.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xml(h)}</Data></Cell>`).join('')}</Row>` +
        s.rows
          .map((row) => `<Row>${row.map((v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${xml(v)}</Data></Cell>`).join('')}</Row>`)
          .join('') +
        `</Table></Worksheet>`
    )
    .join('');
  const doc =
    `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>${sheets}</Workbook>`;
  download(`analytics_${r.from}_to_${r.to}.xls`, doc, 'application/vnd.ms-excel');
};

// ---------------------------------------------------------------- panel

type Range = 'TODAY' | '7D' | '30D' | 'CUSTOM';

export const AdminTrafficPanel: React.FC = () => {
  const [range, setRange] = useState<Range>('7D');
  const [from, setFrom] = useState(day(6));
  const [to, setTo] = useState(day(0));
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dates = useMemo(() => {
    if (range === 'TODAY') return { from: day(0), to: day(0) };
    if (range === '7D') return { from: day(6), to: day(0) };
    if (range === '30D') return { from: day(29), to: day(0) };
    return { from, to };
  }, [range, from, to]);

  const load = useCallback(async () => {
    const days = (Date.parse(dates.to) - Date.parse(dates.from)) / 86400_000 + 1;
    if (!(days >= 1)) return setError('The start date must be before the end date.');
    if (days > 92) return setError('Choose at most 92 days.');
    setBusy(true);
    setError('');
    try {
      setReport(await api<Report>(`/api/admin/analytics?from=${dates.from}&to=${dates.to}`));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [dates]);
  useEffect(() => {
    load();
  }, [load]);

  const t = report?.totals || {};
  const kpis = [
    { label: 'Unique visitors', value: num(t.uniqueVisitors), Icon: Users },
    { label: 'Page views', value: num(t.pageViews), Icon: Eye },
    { label: 'Impressions', value: num(t.impressions), Icon: Eye },
    { label: 'Clicks', value: num(t.clicks), Icon: MousePointerClick },
    { label: 'CTR (clicks ÷ impressions)', value: `${t.ctr ?? 0}%`, Icon: Percent },
    { label: 'Product views', value: num(t.productViews), Icon: Eye },
    { label: 'Orders', value: num(t.orders), Icon: ShoppingCart },
    { label: 'Conversion (orders ÷ visitors)', value: `${t.conversionRate ?? 0}%`, Icon: TrendingDown },
  ];
  const biggestDrop = report?.funnel.filter((f) => f.dropOff !== null).sort((a, b) => (b.dropOff || 0) - (a.dropOff || 0))[0];
  const heatMax = Math.max(1, ...(report?.heatmap.flat() || [1]));
  const latestWeek = report?.sellers.weeks[report.sellers.weeks.length - 1];

  return (
    <div className="space-y-4 text-xs text-[#141413] traffic-print">
      <style>{`@media print { body * { visibility: hidden !important; } .traffic-print, .traffic-print * { visibility: visible !important; } .traffic-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Traffic & Conversion</h2>
          <p className="text-[#575653]">
            {report ? `${report.from} → ${report.to}` : '…'} · Pakistan time · revenue and profit are on the Executive Analytics tab
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 no-print">
          {(['TODAY', '7D', '30D', 'CUSTOM'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 border font-semibold cursor-pointer ${range === r ? 'bg-[#141413] text-white border-[#141413]' : 'border-black/15 bg-white'}`}
            >
              {r === 'TODAY' ? 'Today' : r === '7D' ? 'Last 7 days' : r === '30D' ? 'Last 30 days' : 'Custom'}
            </button>
          ))}
          {range === 'CUSTOM' && (
            <>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border border-black/20" />
              <span>→</span>
              <input type="date" value={to} min={from} max={day(0)} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border border-black/20" />
            </>
          )}
          <button type="button" onClick={load} disabled={busy} className="px-2.5 py-1.5 border border-black/15 bg-white cursor-pointer" aria-label="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {report && (
        <div className="flex flex-wrap gap-2 no-print">
          <button type="button" onClick={() => exportCsv(report)} className="px-3 py-1.5 border border-black/20 bg-white font-semibold flex items-center gap-1 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={() => exportExcel(report)} className="px-3 py-1.5 border border-black/20 bg-white font-semibold flex items-center gap-1 cursor-pointer">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button type="button" onClick={() => window.print()} className="px-3 py-1.5 border border-black/20 bg-white font-semibold flex items-center gap-1 cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> PDF (Save as PDF)
          </button>
        </div>
      )}

      {error && <p className="p-3 bg-rose-50 border border-rose-300 text-rose-900">{error}</p>}
      {!report ? (
        <p className="text-[#575653]">{busy ? 'Loading analytics...' : ''}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {kpis.map(({ label, value, Icon }) => (
              <div key={label} className={card}>
                <div className="flex items-center gap-1.5 text-[11px] text-[#575653]">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <div className="text-xl font-bold font-mono mt-1">{value}</div>
              </div>
            ))}
          </div>

          <div className={card}>
            <DailyChart data={report.series} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={`${card} space-y-2`}>
              <div className="font-bold">Traffic sources (new visitors)</div>
              <Donut rows={report.sources.map((s) => ({ label: SOURCE_LABEL[s.source] || s.source, value: s.visitors, color: SOURCE_COLOR[s.source] || '#999' }))} />
              <p className="text-[10px] text-[#787774]">
                Tip: add <span className="font-mono">?utm_source=facebook</span> or <span className="font-mono">?utm_source=whatsapp</span> to links you share, so
                each one is counted correctly.
              </p>
            </div>

            <div className={`${card} space-y-2`}>
              <div className="font-bold">Conversion funnel</div>
              {report.funnel.map((f, i) => {
                const top = Math.max(1, report.funnel[0].value);
                const w = Math.max(2, (f.value / top) * 100);
                return (
                  <div key={f.key}>
                    {i > 0 && f.dropOff !== null && (
                      <div className={`text-[10px] pl-2 ${f === biggestDrop ? 'text-rose-700 font-bold' : 'text-[#787774]'}`}>
                        ↓ {f.ofPrevious}% continue · {f.dropOff}% drop off{f === biggestDrop ? ' (biggest leak)' : ''}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-28 shrink-0">{f.label}</div>
                      <div className="flex-1 h-6 bg-[#F4F3EF] rounded">
                        <div className="h-6 rounded flex items-center px-2 text-white text-[11px] font-bold" style={{ width: `${w}%`, background: `hsl(${150 - i * 22} 70% ${32 + i * 3}%)` }}>
                          {num(f.value)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={`${card} space-y-2`}>
              <div className="font-bold">Most viewed products</div>
              <Bars rows={report.mostViewed.map((p) => ({ label: p.name, value: p.views, hint: `${p.sold} sold` }))} color="#2563EB" empty="No product views yet." />
            </div>
            <div className={`${card} space-y-2`}>
              <div className="font-bold">Most sold products (units)</div>
              <Bars rows={report.mostSold.map((p) => ({ label: p.name, value: p.sold, hint: `${num(p.views)} views` }))} color="#C5A059" empty="No orders in this period." />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={`${card} space-y-2`}>
              <div className="font-bold">Seller activity</div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-[11px] text-[#575653]">Registered sellers</div>
                  <div className="text-lg font-bold font-mono">{report.sellers.registered ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#575653]">Active this week (got orders)</div>
                  <div className="text-lg font-bold font-mono">
                    {latestWeek?.activeSellers ?? 0}
                    {report.sellers.registered ? (
                      <span className="text-xs text-[#575653]"> ({Math.round(((latestWeek?.activeSellers || 0) / report.sellers.registered) * 100)}%)</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <Bars
                rows={report.sellers.weeks.map((w) => ({ label: `Week of ${w.week}`, value: w.orders, hint: `${w.activeSellers} active sellers` }))}
                color="#0E7A43"
                empty="No orders in this period."
              />
              {report.sellers.top.length > 0 && (
                <div className="pt-1 text-[11px] text-[#454441]">
                  Top: {report.sellers.top.map((s) => `${s.name} (${s.orders})`).join(' · ')}
                </div>
              )}
            </div>

            <div className={`${card} space-y-3`}>
              <div className="font-bold">
                Cancellations {t.cancellationRate ?? 0}% · Returns {t.returnRate ?? 0}% <span className="font-normal text-[#575653]">(of orders)</span>
              </div>
              <div>
                <div className="text-[11px] text-[#575653] mb-1">Cancellation reasons</div>
                <Bars rows={report.cancelReasons.map((c) => ({ label: c.reason, value: c.count }))} color="#BE123C" empty="No cancellations." />
              </div>
              <div>
                <div className="text-[11px] text-[#575653] mb-1">Return reasons (approved)</div>
                <Bars rows={report.returnReasons.map((c) => ({ label: c.reason, value: c.count }))} color="#D97706" empty="No returns." />
              </div>
            </div>
          </div>

          <AdminAdsSection from={report.from} to={report.to} />

          <div className={`${card} space-y-2`}>
            <div className="font-bold">When customers visit (page views by day and hour)</div>
            <div className="overflow-x-auto">
              <table className="text-[9px] border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="font-normal text-[#787774] w-5">
                        {h % 3 === 0 ? h : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                    <tr key={wd}>
                      <td className="pr-1 text-[#575653]">{WEEKDAYS[wd]}</td>
                      {report.heatmap[wd].map((v, h) => (
                        <td
                          key={h}
                          title={`${WEEKDAYS[wd]} ${h}:00 — ${v} page views`}
                          className="w-5 h-5 rounded-sm"
                          style={{ background: v ? `rgba(14,122,67,${0.12 + 0.88 * (v / heatMax)})` : '#F4F3EF' }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[#787774]">Darker = busier. Run flash deals and ads in the busiest hours.</p>
          </div>

          <p className="text-[10px] text-[#787774]">
            Counted by the store itself (no third-party trackers): a visitor is a device; impressions count when a product is half on screen. Numbers
            are saved every 5 minutes.
          </p>
        </>
      )}
    </div>
  );
};
