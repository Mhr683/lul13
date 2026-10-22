import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, PlugZap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { formatPKR } from '../services/abstractions';

// Traffic & Conversion → Ads & ROAS: Meta, Google Ads and TikTok spend (synced every 6 hours from the
// platforms' APIs, keys in the server .env) against the orders and revenue our own tracking credits
// to each platform / campaign. Visitors per source are in the Traffic sources chart above.

type PlatformRow = { platform: string; configured: boolean; error: string; spend: number; impressions: number; clicks: number; visitors: number; orders: number; revenue: number; roas: number | null };
type Campaign = {
  platform: string;
  campaignId: string;
  campaignName: string;
  channel?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach?: number;
  videoViews?: number;
  installs?: number;
  budget?: number;
  orders: number;
  revenue: number;
  roas: number | null;
  platformRoas?: number | null;
};
type AdsReport = { syncedAt: string | null; capi: boolean; usdToPkr: number; platforms: PlatformRow[]; organic: { visitors: number; orders: number; revenue: number }; campaigns: Campaign[] };

const NAME: Record<string, string> = { meta: 'Meta (Facebook / Instagram)', google: 'Google Ads (Search / Display / YouTube)', tiktok: 'TikTok Ads' };
const SHORT: Record<string, string> = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };
const COLOR: Record<string, string> = { meta: '#2563EB', google: '#F59E0B', tiktok: '#111827', organic: '#16A34A' };
const ENV: Record<string, string> = {
  meta: 'META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (and META_PIXEL_ID for Conversions API)',
  google: 'GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID',
  tiktok: 'TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID',
};
const UTM: Record<string, string> = {
  meta: '?utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}',
  google: '?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}',
  tiktok: '?utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__',
};
const num = (n: number) => Math.round(n || 0).toLocaleString('en-PK');
const roasText = (r: number | null | undefined) => (r === null || r === undefined ? '—' : `${r.toFixed(2)}×`);
const roasColor = (r: number | null | undefined) => (r === null || r === undefined ? '' : r >= 3 ? 'text-emerald-700' : r >= 1 ? 'text-amber-700' : 'text-rose-700');

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

export const AdminAdsSection: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const [data, setData] = useState<AdsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await call<AdsReport>(`/api/admin/ads?from=${from}&to=${to}`));
    } catch (err: any) {
      setMsg(err.message);
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await call<{ errors: Record<string, string> }>('/api/admin/ads/refresh', { method: 'POST' });
      const errs = Object.entries(r.errors || {});
      setMsg(errs.length ? `Synced with problems: ${errs.map(([p, e]) => `${SHORT[p]}: ${e}`).join(' · ')}` : 'Ad data refreshed.');
      await load();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const head = ['Platform', 'Campaign', 'Channel', 'Spend PKR', 'Impressions', 'Clicks', 'CTR %', 'CPC PKR', 'Orders', 'Revenue PKR', 'ROAS', 'Platform-reported ROAS'];
    const rows = data.campaigns.map((c) => [SHORT[c.platform], c.campaignName, c.channel || '', c.spend, c.impressions, c.clicks, c.ctr, c.cpc, c.orders, c.revenue, c.roas ?? '', c.platformRoas ?? '']);
    const esc = (v: any) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const text = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ads_${from}_to_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (!data) return <div className="p-4 bg-white border border-black/10 rounded-lg text-xs text-[#575653]">{msg || 'Loading ads...'}</div>;

  const anyConnected = data.platforms.some((p) => p.configured);
  const totalSpend = data.platforms.reduce((s, p) => s + p.spend, 0);
  const adRevenue = data.platforms.reduce((s, p) => s + p.revenue, 0);
  const share = [
    ...data.platforms.map((p) => ({ key: p.platform, label: SHORT[p.platform], value: p.visitors })),
    { key: 'organic', label: 'Organic', value: data.organic.visitors },
  ];
  const shareTotal = Math.max(1, share.reduce((s, x) => s + x.value, 0));

  return (
    <div className="p-4 bg-white border border-black/10 rounded-lg space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-sm">Ads & ROAS</div>
          <div className="text-[#575653]">
            {data.syncedAt ? `Ad data synced ${new Date(data.syncedAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · every 6 hours` : 'Ad data not synced yet'}
            {' · '}ROAS = our revenue from the ad ÷ ad spend · USD spend at PKR {data.usdToPkr}
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <button type="button" onClick={exportCsv} className="px-3 py-1.5 border border-black/20 font-semibold flex items-center gap-1 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={refresh} disabled={busy || !anyConnected} className="px-3 py-1.5 bg-[#141413] text-white font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh data
          </button>
        </div>
      </div>
      {msg && <p className="p-2 bg-[#FBFBF9] border border-black/10">{msg}</p>}

      {/* Visitors per channel: paid platforms vs organic */}
      <div>
        <div className="text-[11px] text-[#575653] mb-1">Visitors by channel (paid vs organic)</div>
        <div className="flex h-5 rounded overflow-hidden bg-[#EEECE6]">
          {share.map((s) =>
            s.value ? (
              <div key={s.key} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / shareTotal) * 100}%`, background: COLOR[s.key] }} />
            ) : null
          )}
        </div>
        <div className="flex flex-wrap gap-3 mt-1">
          {share.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR[s.key] }} />
              {s.label} {num(s.value)} ({Math.round((s.value / shareTotal) * 100)}%)
            </span>
          ))}
        </div>
      </div>

      {/* Per platform */}
      <div className="grid gap-2 md:grid-cols-3">
        {data.platforms.map((p) => (
          <div key={p.platform} className="p-3 border border-black/10 rounded-lg space-y-1">
            <div className="flex items-center justify-between gap-2">
              <strong>{NAME[p.platform]}</strong>
              {p.configured ? (
                p.error ? (
                  <span className="flex items-center gap-1 text-amber-700" title={p.error}>
                    <AlertTriangle className="w-3.5 h-3.5" /> sync problem
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> connected
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1 text-[#787774]">
                  <PlugZap className="w-3.5 h-3.5" /> not connected
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-2">
              <span className="text-[#575653]">Spend</span>
              <span className="font-mono text-right">{p.configured ? formatPKR(p.spend) : '—'}</span>
              <span className="text-[#575653]">Visitors / orders</span>
              <span className="font-mono text-right">
                {num(p.visitors)} / {num(p.orders)}
              </span>
              <span className="text-[#575653]">Revenue</span>
              <span className="font-mono text-right">{formatPKR(p.revenue)}</span>
              <span className="text-[#575653]">ROAS</span>
              <span className={`font-mono text-right font-bold ${roasColor(p.roas)}`}>{roasText(p.roas)}</span>
            </div>
            {p.error && <p className="text-[10px] text-amber-800 break-words">{p.error}</p>}
          </div>
        ))}
      </div>
      {totalSpend > 0 && (
        <p>
          All ads: spend <strong>{formatPKR(totalSpend)}</strong> → revenue <strong>{formatPKR(adRevenue)}</strong> · overall ROAS{' '}
          <strong className={roasColor(adRevenue / totalSpend)}>{roasText(adRevenue / totalSpend)}</strong>
        </p>
      )}

      {/* Unified campaign table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[#575653] border-b border-black/10">
              <th className="py-1.5 pr-2">Platform</th>
              <th className="py-1.5 pr-2">Campaign</th>
              <th className="py-1.5 pr-2 text-right">Spend</th>
              <th className="py-1.5 pr-2 text-right">Clicks</th>
              <th className="py-1.5 pr-2 text-right">CTR</th>
              <th className="py-1.5 pr-2 text-right">CPC</th>
              <th className="py-1.5 pr-2 text-right">Orders</th>
              <th className="py-1.5 pr-2 text-right">Revenue</th>
              <th className="py-1.5 text-right">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {data.campaigns.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-3 text-[#787774]">
                  No ad campaigns in this period yet.
                </td>
              </tr>
            ) : (
              data.campaigns.map((c) => (
                <tr key={`${c.platform}-${c.campaignId}-${c.campaignName}`}>
                  <td className="py-1.5 pr-2">
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: COLOR[c.platform] }} />
                    {SHORT[c.platform]}
                    {c.channel ? <span className="text-[#787774]"> · {c.channel}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2 max-w-[220px] truncate" title={c.campaignName}>
                    {c.campaignName}
                    {c.videoViews ? <span className="text-[#787774]"> · {num(c.videoViews)} video views</span> : null}
                    {c.installs ? <span className="text-[#787774]"> · {num(c.installs)} installs</span> : null}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{c.spend ? formatPKR(c.spend) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{num(c.clicks)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{c.ctr ? `${c.ctr}%` : '—'}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{c.cpc ? formatPKR(c.cpc) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{num(c.orders)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{formatPKR(c.revenue)}</td>
                  <td className={`py-1.5 text-right font-mono font-bold ${roasColor(c.roas)}`} title={c.platformRoas ? `Platform-reported ROAS ${roasText(c.platformRoas)}` : ''}>
                    {roasText(c.roas)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <details className="no-print">
        <summary className="cursor-pointer font-semibold">How to connect the ad accounts and credit orders to campaigns</summary>
        <div className="pt-2 space-y-2 text-[#454441]">
          <p>
            1. Put each platform's keys in the server's <span className="font-mono">.env</span> file (never in the app), then restart the server. Data then
            syncs every 6 hours, or press Refresh data.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {Object.entries(ENV).map(([p, v]) => (
              <li key={p}>
                <strong>{SHORT[p]}:</strong> <span className="font-mono">{v}</span>
              </li>
            ))}
          </ul>
          <p>2. Add these to the end of your ad's website link, so each order is credited to the right platform and campaign:</p>
          <ul className="list-disc pl-5 space-y-1 font-mono break-all">
            {Object.entries(UTM).map(([p, v]) => (
              <li key={p}>
                <span className="font-sans font-semibold">{SHORT[p]}: </span>
                {v}
              </li>
            ))}
          </ul>
          <p>
            3. Meta Conversions API {data.capi ? <strong className="text-emerald-700">is on</strong> : <span>is off (add META_PIXEL_ID)</span>}: purchases, add-to-cart and
            checkout are sent to Meta from the server so ads can optimise for sales (email / phone are hashed).
          </p>
        </div>
      </details>
    </div>
  );
};
