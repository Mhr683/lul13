import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles, Check, X, Send, Copy, Download, Search, Film, BarChart3, Settings2, Inbox, PlusCircle, ListChecks, Package, ImagePlus, Wand2, Pencil, ChevronRight } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { HelpDot } from './HelpDot';

// Admin → AI Social Manager (server/socialManager.ts and server/dailyVideo.ts). The AI prepares
// Facebook / Instagram posts; the owner checks, edits and approves each one. Five simple tabs:
// Today (what needs a yes), New post (3 steps), All posts, Report, Settings.
// Accounts are joined through Meta's own tokens, never a password.

type Post = {
  id: string;
  kind: 'DAILY' | 'IDEA';
  video?: string;
  day: string;
  idea?: string;
  productNames: string[];
  caption: string;
  images: string[];
  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'FAILED';
  createdAt: string;
  postAt?: string;
  postedAt?: string;
  tries?: number;
  posted?: { facebook?: string; instagram?: string; errors?: string[] };
  usedAi?: boolean;
};
type Conn = { facebook: { connected: boolean; name?: string; error?: string }; instagram: { connected: boolean; username?: string; error?: string }; whatsapp: { connected: boolean } } | null;
type VideoJob = { id: string; day: string; productName: string; status: string; link: string; error?: string };
type Report = { rows: { kind: string; name: string; postedAt: string; facebook: boolean; instagram: boolean; likes: number; comments: number; shares: number }[]; total: { likes: number; comments: number; shares: number }; posts: number };
type Pick = { id: string; name: string; price: number; image: string };
type Tab = 'TODAY' | 'NEW' | 'ALL' | 'REPORT' | 'SETTINGS';

async function api<T = any>(path: string, body?: unknown): Promise<T> {
  await auth.authStateReady();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
  return data as T;
}

// ---------------------------------------------------------------- small pieces
const box = 'bg-white border border-black/10 rounded-xl';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-bold rounded-lg cursor-pointer disabled:opacity-50 transition-colors';
const btnMain = `${btn} bg-[#0E7A43] text-white hover:bg-[#0B6437]`;
const btnDark = `${btn} bg-[#141413] text-white hover:bg-black`;
const btnGold = `${btn} bg-[#C5A059] text-black hover:bg-[#B48F48]`;
const btnSoft = `${btn} bg-white border border-black/15 text-[#141413] hover:bg-black/5`;
const pkTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const hourLabel = (h: number) => (h === 12 ? '12 baje dopahar' : h > 12 ? `${h - 12} baje ${h >= 19 ? 'raat' : 'shaam'}` : `${h} baje subah`);

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '⏳ Aap ki "Yes" ka intezar', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  READY: { label: '⏳ Aap ki "Yes" ka intezar', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  APPROVED: { label: '🕗 Waqt par jayegi', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  POSTED: { label: '✅ Post ho gayi', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  REJECTED: { label: 'Nahi bheji', cls: 'bg-stone-50 text-stone-500 border-stone-200' },
  FAILED: { label: '⚠️ Post nahi ho saki', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  MAKING: { label: 'Ban rahi hai...', cls: 'bg-stone-50 text-stone-600 border-stone-200' },
};
const Badge: React.FC<{ s: string }> = ({ s }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${STATUS[s]?.cls || 'bg-stone-50 border-stone-200'}`}>{STATUS[s]?.label || s}</span>
);
const StepTitle: React.FC<{ n: number; title: string; hint?: string }> = ({ n, title, hint }) => (
  <div className="flex items-start gap-3 mb-3">
    <span className="shrink-0 w-7 h-7 rounded-full bg-[#141413] text-white text-sm font-extrabold flex items-center justify-center">{n}</span>
    <div>
      <div className="text-[15px] font-extrabold text-[#141413]">{title}</div>
      {hint && <div className="text-[12px] text-[#575653]">{hint}</div>}
    </div>
  </div>
);
const Empty: React.FC<{ icon: React.ReactNode; text: string; action?: React.ReactNode }> = ({ icon, text, action }) => (
  <div className={`${box} p-8 text-center`}>
    <div className="mx-auto w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-3 text-[#575653]">{icon}</div>
    <p className="text-sm text-[#575653] mb-3">{text}</p>
    {action}
  </div>
);

// ---------------------------------------------------------------- one post
const PostCard: React.FC<{ post: Post; onChange: (p: Post) => void }> = ({ post, onChange }) => {
  const { showToast } = useStore();
  const [text, setText] = useState(post.caption);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  useEffect(() => setText(post.caption), [post.caption]);
  const open = post.status === 'DRAFT' || post.status === 'FAILED';
  const editable = post.status === 'DRAFT' || post.status === 'APPROVED';
  const changed = text.trim() !== post.caption.trim();

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      // unsaved words are saved first, so the post goes out with the owner's text
      if ((action === 'approve' || action === 'post-now') && changed) await api(`/api/admin/social/${post.id}`, { action: 'caption', caption: text });
      const r = await api<{ post: Post }>(`/api/admin/social/${post.id}`, { action, ...extra });
      onChange(r.post);
      if (action === 'caption') setEditing(false);
      showToast(
        action === 'approve'
          ? `Theek hai: ${pkTime(r.post.postAt)} par post hogi.`
          : action === 'post-now'
            ? 'Post ho rahi hai, 1-2 minute mein Facebook par nazar aayegi.'
            : action === 'reject'
              ? 'Yeh post nahi jayegi.'
              : action === 'rewrite'
                ? 'AI ne nayi likhai bana di.'
                : 'Save ho gaya.'
      );
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBusy('');
    }
  };
  const copy = () => navigator.clipboard?.writeText(text).then(() => showToast('Likhai copy ho gayi. TikTok / WhatsApp mein Paste karein.'), () => showToast('Copy nahi ho saka.'));
  const title = post.kind === 'DAILY' ? 'AI ki rozana post' : post.idea ? post.idea.split('\n')[0].slice(0, 70) : 'Aap ki post';

  return (
    <div className={`${box} overflow-hidden`}>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-black/5 bg-[#FBFBF9]">
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold text-[#141413] truncate">{post.kind === 'DAILY' ? '🤖 ' : '💡 '}{title}</div>
          <div className="text-[11px] text-[#575653] truncate">
            {post.productNames.length ? post.productNames.slice(0, 2).join(' · ').slice(0, 90) : post.video ? 'Aap ki video' : 'Aap ki photos'} · {pkTime(post.createdAt)}
          </div>
        </div>
        <Badge s={post.status} />
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-4 p-4">
        {/* pictures / video */}
        <div>
          {post.video ? (
            <video src={post.video} controls playsInline className="w-full aspect-square object-contain rounded-lg bg-black" />
          ) : (
            <>
              <img src={post.images[0]} alt="" className="w-full aspect-square object-cover rounded-lg border border-black/10" loading="lazy" />
              {post.images.length > 1 && (
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {post.images.slice(1, 4).map((u) => (
                    <img key={u} src={u} alt="" className="w-full aspect-square object-cover rounded border border-black/10" loading="lazy" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* words */}
        <div className="min-w-0 flex flex-col">
          <div className="text-[11px] font-bold text-[#575653] uppercase tracking-wide mb-1">Post ki likhai</div>
          {editing ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(16, Math.max(8, text.split('\n').length + 1))}
              className="w-full text-[13px] leading-snug border border-[#C5A059] rounded-lg p-3 font-sans focus:outline-none"
              autoFocus
            />
          ) : (
            <div className="whitespace-pre-wrap text-[13px] leading-snug bg-[#FBFBF9] border border-black/10 rounded-lg p-3 max-h-64 overflow-y-auto">{post.caption}</div>
          )}

          {post.status === 'APPROVED' && <p className="text-[12px] text-blue-800 mt-2">🕗 {pkTime(post.postAt)} par Facebook aur Instagram par jayegi.</p>}
          {post.status === 'POSTED' && (
            <p className="text-[12px] text-emerald-800 mt-2">
              ✅ {pkTime(post.postedAt)} par gayi{post.posted?.facebook ? ' · Facebook ✔' : ''}
              {post.posted?.instagram ? ' · Instagram ✔' : ''}
            </p>
          )}
          {!!post.posted?.errors?.length && <p className="text-[12px] text-rose-700 mt-2">⚠️ {post.posted.errors.join(' · ')}</p>}

          {/* main actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            {editing ? (
              <>
                <button className={btnGold} disabled={!!busy || !changed} onClick={() => act('caption', { caption: text })}>
                  <Check className="w-4 h-4" /> Save
                </button>
                <button
                  className={btnSoft}
                  onClick={() => {
                    setText(post.caption);
                    setEditing(false);
                  }}
                >
                  Wapas
                </button>
              </>
            ) : (
              <>
                {open && (
                  <button className={btnMain} disabled={!!busy} onClick={() => act('approve')}>
                    <Check className="w-4 h-4" /> Yes, post karein
                  </button>
                )}
                {(open || post.status === 'APPROVED') && (
                  <button className={btnDark} disabled={!!busy} onClick={() => act('post-now')}>
                    <Send className="w-4 h-4" /> {busy === 'post-now' ? 'Ja rahi hai...' : 'Abhi foran'}
                  </button>
                )}
                {editable && (
                  <button className={btnSoft} disabled={!!busy} onClick={() => setEditing(true)}>
                    <Pencil className="w-4 h-4" /> Likhai badlein
                  </button>
                )}
                {post.status === 'DRAFT' && (
                  <button className={btnSoft} disabled={!!busy} onClick={() => act('rewrite')}>
                    <Sparkles className="w-4 h-4" /> {busy === 'rewrite' ? 'Likh raha hai...' : 'AI dobara likhe'}
                  </button>
                )}
                {post.status !== 'POSTED' && post.status !== 'REJECTED' && (
                  <button className={`${btnSoft} text-rose-700`} disabled={!!busy} onClick={() => act('reject')}>
                    <X className="w-4 h-4" /> Nahi
                  </button>
                )}
              </>
            )}
          </div>

          {/* hand sharing (TikTok, WhatsApp Channel, X) */}
          {!editing && (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-black/5 text-[12px] text-[#575653]">
              <span>TikTok / WhatsApp ke liye:</span>
              <button className="inline-flex items-center gap-1 font-bold text-[#141413] hover:underline cursor-pointer" onClick={copy}>
                <Copy className="w-3.5 h-3.5" /> Likhai copy
              </button>
              {(post.video || post.images[0]) && (
                <a className="inline-flex items-center gap-1 font-bold text-[#141413] hover:underline" href={post.video || post.images[0]} download target="_blank" rel="noreferrer">
                  <Download className="w-3.5 h-3.5" /> {post.video ? 'Video' : 'Tasveer'} download
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- joining the accounts
// Facebook's own settings do the joining (the owner logs in there himself); "Check karein" then finds
// the account through the Page. No password or key is ever typed here.
const ConnectAccounts: React.FC<{ conn: Conn; onConn: (c: Conn) => void }> = ({ conn, onConn }) => {
  const { showToast } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const r = await api<{ connections: Conn }>('/api/admin/social/check', {});
      onConn(r.connections);
      showToast(r.connections?.instagram.connected ? `Instagram jur gaya: @${r.connections.instagram.username}` : 'Instagram abhi nazar nahi aaya. Qadam dobara dekhein, phir 1-2 minute baad check karein.');
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setChecking(false);
    }
  };
  const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
    <ol className="space-y-2 mt-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[13px]">
          <span className="shrink-0 w-5 h-5 rounded-full bg-[#141413] text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
  const accounts = [
    {
      id: 'fb',
      name: 'Facebook Page',
      icon: '📘',
      ok: !!conn?.facebook.connected,
      detail: conn?.facebook.connected ? conn.facebook.name || 'Jura hua' : 'Abhi jura nahi',
      err: conn?.facebook.error,
      how: <Steps items={['Facebook Page website se jura hua hai. Kuch karne ki zaroorat nahi.', 'Agar yahan "Nahi jura" aaye to mujhe (Claude ko) batayein: Page ka naya token lagana hoga.']} />,
    },
    {
      id: 'ig',
      name: 'Instagram',
      icon: '📸',
      ok: !!conn?.instagram.connected,
      detail: conn?.instagram.connected ? `@${conn.instagram.username}` : 'Abhi jura nahi: posts sirf Facebook par jati hain',
      err: conn?.instagram.error,
      how: (
        <>
          <Steps
            items={[
              <>
                Phone par <b>Instagram app</b> kholein → apni profile → ☰ → <b>Settings</b> → <b>Account type and tools</b> → <b>Switch to professional account</b> → <b>Business</b> chunein. (Pehle se Business ho to agla qadam.)
              </>,
              <>
                Neeche wala button dabayein. Facebook khulega: wahan <b>Anokha Shopping Hub</b> Page chunein → <b>Linked accounts</b> → <b>Instagram</b> → <b>Connect account</b>. Instagram ka login aap khud karein.
              </>,
              <>
                Wapas aa kar <b>"Check karein"</b> dabayein. Jur gaya to yahan ✔ aa jayega aur posts Instagram par bhi jayengi.
              </>,
            ]}
          />
          <div className="flex flex-wrap gap-2 mt-4">
            <a className={btnDark} href="https://www.facebook.com/settings/?tab=linked_instagram" target="_blank" rel="noreferrer">
              Facebook mein Instagram jorein ↗
            </a>
            <button className={btnMain} onClick={check} disabled={checking}>
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} /> Check karein
            </button>
          </div>
        </>
      ),
    },
    {
      id: 'wa',
      name: 'WhatsApp (aap ko "Yes/No" ke message)',
      icon: '💬',
      ok: !!conn?.whatsapp.connected,
      detail: conn?.whatsapp.connected ? 'Jura hua: nayi video / post ka message aap ke WhatsApp par aata hai' : 'Abhi sirf e-mail aati hai',
      how: <Steps items={['WhatsApp jura hua hai. Kuch karne ki zaroorat nahi.']} />,
    },
    {
      id: 'other',
      name: 'TikTok · YouTube · X · WhatsApp Channel',
      icon: '🎵',
      ok: false,
      manual: true,
      detail: 'Abhi khud share karein',
      how: (
        <Steps
          items={[
            'In ko jorne ke liye un companiyon ki manzoori (approval) chahiye hoti hai. Woh hum baad mein karenge.',
            'Tab tak: har post ke neeche "Likhai copy" aur "Download" dabayein, phir app mein post kar ke likhai Paste kar dein.',
            'Rozana video ke page par bhi TikTok / WhatsApp / X ke share buttons hain.',
          ]}
        />
      ),
    },
  ];
  return (
    <div className={`${box} p-5`}>
      <h3 className="text-[15px] font-extrabold mb-1">Accounts jorein</h3>
      <p className="text-[12px] text-[#575653] mb-3">Har account par dabayein aur qadam dekhein. Accounts Facebook ke apne tareeqe se jurte hain: password kabhi yahan ya kisi ko na dein.</p>
      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="border border-black/10 rounded-xl">
            <button className="w-full flex items-center gap-3 p-3 text-left cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span className="text-xl">{a.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold">{a.name}</span>
                <span className="block text-[12px] text-[#575653] truncate">{a.detail}</span>
              </span>
              <span
                className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${a.ok ? 'bg-emerald-100 text-emerald-800' : (a as any).manual ? 'bg-stone-100 text-stone-600' : 'bg-rose-100 text-rose-700'}`}
              >
                {a.ok ? '✔ Jura hua' : (a as any).manual ? 'Khud share' : 'Jorein →'}
              </span>
            </button>
            {open === a.id && (
              <div className="px-4 pb-4 border-t border-black/5">
                {a.how}
                {a.err && <p className="text-[11px] text-rose-700 mt-2">Facebook ka jawab: {a.err}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the panel
export const AdminSocialPanel: React.FC = () => {
  const { showToast } = useStore();
  const [tab, setTab] = useState<Tab>('TODAY');
  const [posts, setPosts] = useState<Post[]>([]);
  const [conn, setConn] = useState<Conn>(null);
  const [settings, setSettings] = useState({ autoDaily: true, postHourPk: 20, rules: '' });
  const [rules, setRules] = useState('');
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'POSTED' | 'REJECTED'>('ALL');

  // new post (3 steps)
  const [source, setSource] = useState<'PRODUCT' | 'OWN' | 'AUTO' | null>(null);
  const [idea, setIdea] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [media, setMedia] = useState<{ kind: 'photo' | 'video'; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [making, setMaking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([api('/api/admin/social'), api('/api/admin/daily-video').catch(() => ({ jobs: [] }))]);
      setPosts(s.posts || []);
      setConn(s.connections);
      setSettings(s.settings);
      setRules(s.settings?.rules || '');
      setVideos((v.jobs || []).slice(0, 10));
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => {
      api<{ products: Pick[] }>(`/api/admin/social/products?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setFound(r.products))
        .catch(() => setFound([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const waiting = posts.filter((p) => p.status === 'DRAFT' || p.status === 'FAILED');
  const scheduled = posts.filter((p) => p.status === 'APPROVED');
  const weekAgo = Date.now() - 7 * 86400_000;
  const postedWeek = posts.filter((p) => p.status === 'POSTED' && Date.parse(p.postedAt || '') >= weekAgo).length;
  const videoWaiting = videos.filter((v) => v.status === 'READY');
  const shown = useMemo(() => (filter === 'ALL' ? posts : posts.filter((p) => (filter === 'DRAFT' ? p.status === 'DRAFT' || p.status === 'FAILED' : p.status === filter))), [posts, filter]);
  const updatePost = (np: Post) => setPosts((list) => list.map((x) => (x.id === np.id ? np : x)));

  const saveSettings = async (next: Partial<typeof settings>) => {
    const s = { ...settings, ...next };
    try {
      const r = await api<{ settings: typeof settings }>('/api/admin/social/settings', s);
      setSettings(r.settings);
      showToast('Save ho gaya.');
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (list.some((f) => f.size > 95 * 1024 * 1024)) return showToast('File bohat bari hai (100 MB se kam honi chahiye). Video chhoti kar ke dobara lagayein.');
    setUploading((n) => n + list.length);
    await auth.authStateReady();
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    for (const f of list) {
      try {
        const res = await fetch('/api/admin/social/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': f.type || 'application/octet-stream' }, body: f });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Upload nahi ho saka.');
        setMedia((m) => (data.kind === 'video' ? [{ kind: 'video', url: data.url }] : [...m.filter((x) => x.kind === 'photo'), { kind: 'photo' as const, url: data.url }].slice(-4)));
      } catch (e: any) {
        showToast(`${f.name}: ${e.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const resetNew = () => {
    setSource(null);
    setIdea('');
    setPicked([]);
    setMedia([]);
    setQ('');
  };
  const canMake = source === 'AUTO' || (source === 'PRODUCT' && picked.length > 0) || (source === 'OWN' && media.length > 0);
  const makeDraft = async () => {
    setMaking(true);
    try {
      const video = media.find((m) => m.kind === 'video')?.url;
      const photos = media.filter((m) => m.kind === 'photo').map((m) => m.url);
      const r = await api<{ post: Post }>('/api/admin/social/draft', {
        idea,
        productIds: source === 'PRODUCT' ? picked.map((p) => p.id) : [],
        photos: source === 'OWN' ? photos : [],
        ...(source === 'OWN' && video ? { video } : {}),
      });
      setPosts((list) => [r.post, ...list]);
      resetNew();
      setTab('TODAY');
      showToast('Post tayyar hai. Dekh kar "Yes, post karein" dabayein.');
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setMaking(false);
    }
  };
  const loadReport = useCallback(async () => {
    try {
      setReport(await api('/api/admin/social/report'));
    } catch (e: any) {
      showToast(e.message);
    }
  }, [showToast]);
  useEffect(() => {
    if (tab === 'REPORT' && !report) loadReport();
  }, [tab, report, loadReport]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'TODAY', label: 'Aaj ka kaam', icon: <Inbox className="w-4 h-4" />, count: waiting.length + videoWaiting.length },
    { id: 'NEW', label: 'Nayi post', icon: <PlusCircle className="w-4 h-4" /> },
    { id: 'ALL', label: 'Sab posts', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'REPORT', label: 'Report', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'SETTINGS', label: 'Settings', icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-5xl">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            AI Social Manager <HelpDot id="admin.tab.SOCIAL" />
          </h2>
          <p className="text-[13px] text-[#575653]">AI posts tayyar karta hai. Aap dekh kar "Yes" karte hain, phir woh Facebook / Instagram par chali jati hai.</p>
        </div>
        <button className={btnSoft} onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* account strip */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { name: 'Facebook', ok: !!conn?.facebook.connected },
          { name: 'Instagram', ok: !!conn?.instagram.connected },
          { name: 'WhatsApp', ok: !!conn?.whatsapp.connected },
        ].map((a) => (
          <button
            key={a.name}
            onClick={() => setTab('SETTINGS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-bold cursor-pointer ${
              a.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${a.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {a.name} {a.ok ? 'jura hua' : 'nahi jura'}
          </button>
        ))}
      </div>

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-black/10 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold whitespace-nowrap border-b-2 -mb-px cursor-pointer ${
              tab === t.id ? 'border-[#C5A059] text-[#141413]' : 'border-transparent text-[#575653] hover:text-[#141413]'
            }`}
          >
            {t.icon}
            {t.label}
            {!!t.count && <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] flex items-center justify-center">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ TODAY */}
      {tab === 'TODAY' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: waiting.length + videoWaiting.length, label: 'Aap ki "Yes" chahiye', cls: 'text-amber-700' },
              { n: scheduled.length, label: 'Waqt par jayengi', cls: 'text-blue-700' },
              { n: postedWeek, label: 'Is hafte post huin', cls: 'text-emerald-700' },
            ].map((c) => (
              <div key={c.label} className={`${box} p-4`}>
                <div className={`text-3xl font-extrabold ${c.cls}`}>{c.n}</div>
                <div className="text-[12px] text-[#575653] mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {videoWaiting.map((v) => (
            <a key={v.id} href={v.link} target="_blank" rel="noreferrer" className={`${box} p-4 flex items-center gap-3 hover:bg-black/[0.02]`}>
              <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Film className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-extrabold">Aaj ki video tayyar hai</span>
                <span className="block text-[12px] text-[#575653] truncate">{v.productName}</span>
              </span>
              <span className="text-[13px] font-bold text-[#0E7A43] flex items-center">
                Dekh kar Yes / No <ChevronRight className="w-4 h-4" />
              </span>
            </a>
          ))}

          {waiting.length ? (
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold">Yeh posts aap ki "Yes" ka intezar kar rahi hain</h3>
              {waiting.map((p) => (
                <PostCard key={p.id} post={p} onChange={updatePost} />
              ))}
            </div>
          ) : (
            !videoWaiting.length && (
              <Empty
                icon={<Check className="w-6 h-6" />}
                text={
                  settings.autoDaily
                    ? `Abhi koi kaam baqi nahi. AI kal subah 11 baje nayi post tayyar karega${scheduled.length ? `, aur ${scheduled.length} post waqt par jayegi` : ''}.`
                    : 'Abhi koi kaam baqi nahi.'
                }
                action={
                  <button className={btnGold} onClick={() => setTab('NEW')}>
                    <PlusCircle className="w-4 h-4" /> Nayi post banwayein
                  </button>
                }
              />
            )
          )}

          {scheduled.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold">Waqt par jane wali posts</h3>
              {scheduled.map((p) => (
                <PostCard key={p.id} post={p} onChange={updatePost} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ NEW POST */}
      {tab === 'NEW' && (
        <div className="space-y-4">
          <div className={`${box} p-5`}>
            <StepTitle n={1} title="Post kis cheez ki ho?" hint="Ek chunein" />
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { id: 'PRODUCT' as const, icon: <Package className="w-6 h-6" />, title: 'Store ke products', text: 'Website ke 1 se 6 products chunein' },
                { id: 'OWN' as const, icon: <ImagePlus className="w-6 h-6" />, title: 'Apni photo / video', text: 'Mobile ya PC se lagayein' },
                { id: 'AUTO' as const, icon: <Wand2 className="w-6 h-6" />, title: 'AI khud chune', text: 'AI naya product chun lega' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSource(o.id)}
                  className={`text-left p-4 rounded-xl border-2 cursor-pointer transition-colors ${source === o.id ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-black/10 hover:border-black/25'}`}
                >
                  <div className={source === o.id ? 'text-[#8A6A2B]' : 'text-[#575653]'}>{o.icon}</div>
                  <div className="text-sm font-extrabold mt-2">{o.title}</div>
                  <div className="text-[12px] text-[#575653]">{o.text}</div>
                </button>
              ))}
            </div>

            {source === 'PRODUCT' && (
              <div className="mt-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-[#575653]" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product ka naam likh kar dhoondein..." className="w-full text-sm border border-black/15 rounded-lg py-2.5 pl-9 pr-3" autoFocus />
                  {found.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-black/15 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                      {found.map((p) => (
                        <button
                          key={p.id}
                          className="w-full flex items-center gap-3 p-2.5 text-left text-[13px] hover:bg-black/5 cursor-pointer"
                          onClick={() => {
                            if (!picked.some((x) => x.id === p.id) && picked.length < 6) setPicked([...picked, p]);
                            setQ('');
                            setFound([]);
                          }}
                        >
                          {p.image && <img src={p.image} alt="" className="w-10 h-10 object-cover rounded" />}
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="font-bold whitespace-nowrap">Rs {Math.round(p.price).toLocaleString('en-PK')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {picked.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                    {picked.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 border border-black/10 rounded-lg text-[12px]">
                        {p.image && <img src={p.image} alt="" className="w-9 h-9 object-cover rounded" />}
                        <span className="flex-1 truncate">{p.name}</span>
                        <button className="cursor-pointer text-[#575653] hover:text-rose-700" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} aria-label="Hatayein">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {source === 'OWN' && (
              <div className="mt-4">
                <label className="flex flex-col items-center justify-center gap-1 p-6 border-2 border-dashed border-black/20 rounded-xl cursor-pointer hover:bg-black/[0.02] text-center">
                  <ImagePlus className="w-7 h-7 text-[#575653]" />
                  <span className="text-sm font-bold">Yahan dabayein aur photo / video chunein</span>
                  <span className="text-[12px] text-[#575653]">4 photos tak, ya 1 video (MP4, 100 MB se kam)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      upload(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {uploading > 0 && <p className="text-[12px] text-blue-700 mt-2">Upload ho raha hai, intezar karein...</p>}
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {media.map((m) => (
                      <span key={m.url} className="relative">
                        {m.kind === 'video' ? <video src={m.url} className="h-24 rounded-lg border border-black/10 bg-black" muted /> : <img src={m.url} alt="" className="w-24 h-24 object-cover rounded-lg border border-black/10" />}
                        <button className="absolute -top-2 -right-2 bg-white border border-black/20 rounded-full p-1 cursor-pointer" onClick={() => setMedia(media.filter((x) => x.url !== m.url))} aria-label="Hatayein">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {source === 'AUTO' && <p className="mt-4 text-[13px] text-[#575653]">AI aisa product chunega jo pehle post nahi hua, stock mein hai aur Facebook par chal sakta hai.</p>}
          </div>

          <div className={`${box} p-5 ${source ? '' : 'opacity-50 pointer-events-none'}`}>
            <StepTitle n={2} title="AI ko kya kehna hai? (zaroori nahi)" hint="Jo likhenge AI wahi karega" />
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder={'Jaise:\n"Sardiyon ki sale, har cheez par 10% off, code WINTER10"\n"Chhoti post likho, Urdu mein"'}
              className="w-full text-sm border border-black/15 rounded-lg p-3"
            />
          </div>

          <div className={`${box} p-5 ${source ? '' : 'opacity-50 pointer-events-none'}`}>
            <StepTitle n={3} title="Post banayein" hint="Post foran nahi jayegi: pehle aap dekhenge" />
            <div className="flex flex-wrap gap-2">
              <button className={btnGold} onClick={makeDraft} disabled={making || uploading > 0 || !canMake}>
                <Sparkles className="w-4 h-4" /> {making ? 'AI post bana raha hai...' : 'AI se post banao'}
              </button>
              <button className={btnSoft} onClick={resetNew}>
                Sab saaf karein
              </button>
            </div>
            {!canMake && source && <p className="text-[12px] text-[#575653] mt-2">{source === 'PRODUCT' ? 'Pehle kam se kam 1 product chunein.' : 'Pehle photo ya video lagayein.'}</p>}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ ALL POSTS */}
      {tab === 'ALL' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ALL', 'Sab'],
                ['DRAFT', 'Intezar'],
                ['APPROVED', 'Jayengi'],
                ['POSTED', 'Post ho gayin'],
                ['REJECTED', 'Nahi bhejin'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold border cursor-pointer ${filter === id ? 'bg-[#141413] text-white border-[#141413]' : 'bg-white border-black/15 text-[#575653]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length ? shown.map((p) => <PostCard key={p.id} post={p} onChange={updatePost} />) : <Empty icon={<ListChecks className="w-6 h-6" />} text="Yahan koi post nahi." />}

          <div className={`${box} p-4`}>
            <h3 className="text-sm font-extrabold mb-2 flex items-center gap-1.5">
              <Film className="w-4 h-4" /> Rozana videos (3 baje banti, 5 baje jati hai)
            </h3>
            {!videos.length && <p className="text-[12px] text-[#575653]">Abhi koi video nahi.</p>}
            {videos.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-black/5 last:border-0 text-[13px]">
                <span className="truncate max-w-[60%]">
                  <span className="text-[#575653]">{v.day}</span> · {v.productName}
                </span>
                <span className="flex items-center gap-2">
                  <Badge s={v.status} />
                  <a href={v.link} target="_blank" rel="noreferrer" className="font-bold text-[#0E7A43] hover:underline">
                    Kholein
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ REPORT */}
      {tab === 'REPORT' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold">Pichle 7 din (posts + rozana videos)</h3>
            <button className={btnSoft} onClick={loadReport}>
              <RefreshCw className="w-4 h-4" /> Taaza karein
            </button>
          </div>
          {!report ? (
            <p className="text-[13px] text-[#575653]">Report aa rahi hai...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Posts', report.posts],
                  ['👍 Likes', report.total.likes],
                  ['💬 Comments', report.total.comments],
                  ['↗ Shares', report.total.shares],
                ].map(([k, v]) => (
                  <div key={k} className={`${box} p-4`}>
                    <div className="text-2xl font-extrabold">{Number(v).toLocaleString('en-PK')}</div>
                    <div className="text-[12px] text-[#575653]">{k}</div>
                  </div>
                ))}
              </div>
              <div className={`${box} divide-y divide-black/5`}>
                {report.rows.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="truncate">
                      {r.kind === 'Video' ? '🎬' : '🖼️'} {r.name}
                    </span>
                    <span className="shrink-0 text-[#575653]">
                      👍 {r.likes} · 💬 {r.comments} · ↗ {r.shares}
                    </span>
                  </div>
                ))}
                {!report.rows.length && <p className="px-4 py-3 text-[13px] text-[#575653]">Pichle 7 din mein koi post nahi gayi.</p>}
              </div>
              <p className="text-[12px] text-[#575653]">Facebook / Instagram se website par kitne log aaye: "Traffic & Conversion" tab dekhein.</p>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------ SETTINGS */}
      {tab === 'SETTINGS' && (
        <div className="space-y-4">
          <ConnectAccounts conn={conn} onConn={setConn} />

          <div className={`${box} p-5 space-y-4`}>
            <h3 className="text-[15px] font-extrabold">Rozana ka kaam</h3>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4" checked={settings.autoDaily} onChange={(e) => saveSettings({ autoDaily: e.target.checked })} />
              <span>
                <span className="block text-sm font-bold">AI roz subah 11 baje ek post tayyar kare</span>
                <span className="block text-[12px] text-[#575653]">Naye product ki 4 tasveerein + Roman Urdu likhai. Aap ko e-mail aati hai, phir aap "Yes" karte hain.</span>
              </span>
            </label>
            <div>
              <div className="text-sm font-bold mb-1">"Yes" ki hui post kis waqt jaye</div>
              <select className="border border-black/15 rounded-lg px-3 py-2 text-sm" value={settings.postHourPk} onChange={(e) => saveSettings({ postHourPk: Number(e.target.value) })}>
                {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`${box} p-5`}>
            <h3 className="text-[15px] font-extrabold">Hamesha ki hidayat</h3>
            <p className="text-[12px] text-[#575653] mb-2">AI har post likhte waqt yeh baatein maanega.</p>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={4}
              placeholder={'Jaise:\nEmoji kam lagao\nHar post ke aakhir mein likho: WhatsApp 0306-5690358\nChhoti posts likho'}
              className="w-full text-sm border border-black/15 rounded-lg p-3"
            />
            <button className={`${btnGold} mt-2`} disabled={rules === settings.rules} onClick={() => saveSettings({ rules })}>
              <Check className="w-4 h-4" /> Hidayat save karein
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
