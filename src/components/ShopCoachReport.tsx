import React, { useState } from 'react';
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, TrendingUp } from 'lucide-react';

// Shop Coach report for a seller: health, scores, charts (drawn as plain SVG, no chart library) and
// every problem with what it costs and how to fix it. Data comes from /api/seller/coach.

export type Coach = {
  shopName: string;
  health: { level: 'GREEN' | 'YELLOW' | 'RED'; score: number };
  headline: string;
  scores: { onTimeDelivery: number | null; cancellation: number | null; returns: number | null; rating: number | null; positivePercent: number | null };
  last30: { orders: number; sales: number; avgOrder: number };
  lowStock?: { id: string; name: string; stock: number }[];
  newOrdersToday?: number;
  issues: { level: 'RED' | 'YELLOW' | 'INFO'; title: string; detail: string; impact: string; fix: string; tab?: string; key?: string; action?: 'REWRITE_ALL' }[];
  strengths: string[];
  charts: {
    salesByDay: { date: string; orders: number; sales: number }[];
    statusBreakdown: { label: string; value: number }[];
    topProducts: { name: string; units: number; sales: number }[];
  };
  generatedAt: string;
};

const pkr = (n: number) => `PKR ${Math.round(n || 0).toLocaleString('en-PK')}`;
const HEALTH = {
  GREEN: { ring: '#0E7A43', label: 'Good', bg: 'bg-emerald-50 border-emerald-300' },
  YELLOW: { ring: '#D97706', label: 'Needs attention', bg: 'bg-amber-50 border-amber-300' },
  RED: { ring: '#BE123C', label: 'Urgent', bg: 'bg-rose-50 border-rose-300' },
};
const LEVEL = {
  RED: { Icon: AlertOctagon, box: 'border-rose-300 bg-rose-50', icon: 'text-rose-700', tag: 'Urgent' },
  YELLOW: { Icon: AlertTriangle, box: 'border-amber-300 bg-amber-50', icon: 'text-amber-700', tag: 'Fix soon' },
  INFO: { Icon: Info, box: 'border-sky-200 bg-sky-50', icon: 'text-sky-700', tag: 'Tip' },
};

const ScoreRing: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-label={`Health score ${score} of 100`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="#E7E5DF" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="43" textAnchor="middle" fontSize="18" fontWeight="700" fill="#141413">
        {score}
      </text>
    </svg>
  );
};

// Daily sales (bars) for the last 30 days
const SalesChart: React.FC<{ data: Coach['charts']['salesByDay'] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.sales));
  const w = 600;
  const h = 150;
  const bw = w / data.length;
  const shown = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-[#575653] mb-1">
        <span>Sales per day · last 30 days</span>
        <span className="font-semibold text-[#141413]">
          {shown ? `${shown.date}: ${pkr(shown.sales)} · ${shown.orders} order(s)` : `Highest day ${pkr(max === 1 ? 0 : max)}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full h-40" preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={h - h * f} y2={h - h * f} stroke="#EEECE6" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const bh = d.sales ? Math.max(3, (d.sales / max) * (h - 6)) : d.orders ? 3 : 0;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={h} fill="transparent" />
              <rect x={i * bw + bw * 0.15} y={h - bh} width={bw * 0.7} height={bh} rx="2" fill={hover === i ? '#0B5E34' : '#0E7A43'} opacity={d.sales ? 1 : 0.35} />
              {i % 5 === 0 && (
                <text x={i * bw + bw / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="#787774">
                  {d.date}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const BarList: React.FC<{ title: string; rows: { label: string; value: number; hint?: string }[]; color: string }> = ({ title, rows, color }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-[#575653]">{title}</div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[#787774]">No data yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.label} className="text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="truncate">{r.label}</span>
              <span className="font-mono font-semibold shrink-0">
                {r.value}
                {r.hint ? ` · ${r.hint}` : ''}
              </span>
            </div>
            <div className="h-2 bg-[#EEECE6] rounded">
              <div className="h-2 rounded" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export const ShopCoachReport: React.FC<{
  coach: Coach;
  onGo?: (tab: string) => void;
  compact?: boolean;
  /** Hides a blue tip (urgent problems cannot be hidden) */
  onHide?: (key: string) => void;
  /** Button for a one-click fix the app can run (e.g. rewrite all descriptions) */
  renderAction?: (action: 'REWRITE_ALL') => React.ReactNode;
}> = ({ coach, onGo, compact, onHide, renderAction }) => {
  const [showAll, setShowAll] = useState(!compact);
  const h = HEALTH[coach.health.level] || HEALTH.GREEN;
  const s = coach.scores;
  const tiles = [
    { label: 'On-time delivery', value: s.onTimeDelivery === null ? '—' : `${s.onTimeDelivery}%`, good: s.onTimeDelivery === null || s.onTimeDelivery >= 90 },
    // null = fewer than 5 real orders: too early to judge
    { label: 'Cancellation', value: s.cancellation === null ? '—' : `${s.cancellation}%`, good: s.cancellation === null || s.cancellation <= 5 },
    { label: 'Returns', value: s.returns === null ? '—' : `${s.returns}%`, good: s.returns === null || s.returns <= 5 },
    { label: 'Customer rating', value: s.rating === null ? 'New' : `${s.rating} ★`, good: s.rating === null || s.rating >= 4 },
  ];
  const issues = showAll ? coach.issues : coach.issues.slice(0, 3);

  return (
    <div className="space-y-4 text-[#141413]">
      <div className={`p-4 border rounded-lg flex flex-wrap items-center gap-4 ${h.bg}`}>
        <ScoreRing score={coach.health.score ?? 0} color={h.ring} />
        <div className="flex-1 min-w-[200px]">
          <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: h.ring }}>
            Shop health · {h.label}
          </div>
          <div className="text-base font-bold">{coach.headline}</div>
          <div className="text-xs text-[#454441]">
            Last 30 days: {coach.last30.orders} orders · {pkr(coach.last30.sales)} sales · average order {pkr(coach.last30.avgOrder)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className={`p-3 border rounded-lg bg-white ${t.good ? 'border-black/10' : 'border-rose-300'}`}>
            <div className="text-[10px] text-[#575653]">{t.label}</div>
            <div className={`text-lg font-bold ${t.good ? '' : 'text-rose-700'}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-white border border-black/10 rounded-lg space-y-4">
        <SalesChart data={coach.charts.salesByDay} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BarList title="Orders by status (30 days)" rows={coach.charts.statusBreakdown.map((r) => ({ label: r.label, value: r.value }))} color="#3B82F6" />
          <BarList
            title="Best sellers (units)"
            rows={coach.charts.topProducts.map((t) => ({ label: t.name, value: t.units, hint: pkr(t.sales) }))}
            color="#C5A059"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">
          {coach.issues.length ? `What needs fixing (${coach.issues.length})` : 'Nothing to fix right now'}
        </div>
        {issues.map((i) => {
          const L = LEVEL[i.level];
          return (
            <div key={i.title} className={`p-3 border rounded-lg text-xs space-y-1 ${L.box}`}>
              <div className="flex items-start gap-2">
                <L.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${L.icon}`} />
                <div className="flex-1">
                  <div className="font-bold text-sm">
                    {i.title} <span className={`ml-1 text-[10px] uppercase ${L.icon}`}>{L.tag}</span>
                  </div>
                  <div className="text-[#454441]">{i.detail}</div>
                </div>
              </div>
              <div className="pl-6">
                <strong>What it costs you:</strong> {i.impact}
              </div>
              <div className="pl-6">
                <strong>What to do:</strong> {i.fix}
              </div>
              {(onGo || renderAction || onHide) && (
                <div className="pl-6 flex flex-wrap items-center gap-2">
                  {i.action && renderAction ? renderAction(i.action) : null}
                  {onGo && i.tab && !i.action && (
                    <button type="button" onClick={() => onGo(i.tab!)} className="mt-1 px-2.5 py-1 bg-white border border-black/20 font-semibold cursor-pointer">
                      Fix it →
                    </button>
                  )}
                  {onHide && i.level === 'INFO' && i.key && (
                    <button type="button" onClick={() => onHide(i.key!)} className="mt-1 px-2 py-1 text-[#575653] underline cursor-pointer">
                      Hide tip
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!showAll && coach.issues.length > 3 && (
          <button type="button" onClick={() => setShowAll(true)} className="text-xs font-semibold text-[#0E7A43] underline cursor-pointer">
            Show all {coach.issues.length} points
          </button>
        )}
      </div>

      {coach.strengths.length > 0 && (
        <div className="p-3 bg-white border border-emerald-200 rounded-lg text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-emerald-800">
            <TrendingUp className="w-4 h-4" /> Going well
          </div>
          {coach.strengths.map((t) => (
            <div key={t} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
