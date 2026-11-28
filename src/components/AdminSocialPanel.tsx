import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles, Check, X, Send, Copy, Download, Search, Film, BarChart3, Link2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { HelpDot } from './HelpDot';

// Admin → AI Social Manager (server/socialManager.ts and server/dailyVideo.ts). The AI prepares
// Facebook / Instagram posts; the owner checks, edits and approves each one. Accounts are joined
// through Meta's own tokens, never a password. Sites without a posting API for us get "share by hand".

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
  postAt?: string;
  postedAt?: string;
  tries?: number;
  posted?: { facebook?: string; instagram?: string; errors?: string[] };
  usedAi?: boolean;
};
type Conn = { facebook: { connected: boolean; name?: string; error?: string }; instagram: { connected: boolean; username?: string; error?: string }; whatsapp: { connected: boolean } } | null;
type VideoJob = { id: string; day: string; productName: string; status: string; link: string; error?: string; posted?: { facebook?: string; instagram?: string; errors?: string[] } };
type Report = { rows: { kind: string; name: string; postedAt: string; facebook: boolean; instagram: boolean; likes: number; comments: number; shares: number }[]; total: { likes: number; comments: number; shares: number }; posts: number };
type Pick = { id: string; name: string; price: number; image: string };

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

const card = 'p-4 bg-white border border-black/10 rounded-lg';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md cursor-pointer disabled:opacity-50';
const pkTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Aap ki manzoori ka intezar', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approve: post hogi', cls: 'bg-blue-100 text-blue-800' },
  POSTED: { label: 'Post ho gayi', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Nahi', cls: 'bg-stone-100 text-stone-600' },
  FAILED: { label: 'Post nahi ho saki', cls: 'bg-rose-100 text-rose-800' },
  READY: { label: 'Aap ki manzoori ka intezar', cls: 'bg-amber-100 text-amber-800' },
  MAKING: { label: 'Ban rahi hai', cls: 'bg-stone-100 text-stone-600' },
};
const Badge: React.FC<{ s: string }> = ({ s }) => <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS[s]?.cls || 'bg-stone-100'}`}>{STATUS[s]?.label || s}</span>;

const PostCard: React.FC<{ post: Post; onChange: (p: Post) => void }> = ({ post, onChange }) => {
  const { showToast } = useStore();
  const [text, setText] = useState(post.caption);
  const [busy, setBusy] = useState('');
  useEffect(() => setText(post.caption), [post.caption]);
  const editable = post.status === 'DRAFT' || post.status === 'APPROVED';
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      // unsaved text is saved first, so the post goes out with the owner's words
      if ((action === 'approve' || action === 'post-now') && text.trim() !== post.caption.trim()) await api(`/api/admin/social/${post.id}`, { action: 'caption', caption: text });
      const r = await api<{ post: Post }>(`/api/admin/social/${post.id}`, { action, ...extra });
      onChange(r.post);
      showToast(
        action === 'approve' ? `Approve ho gayi: ${pkTime(r.post.postAt)} par post hogi.` : action === 'post-now' ? 'Post ho rahi hai...' : action === 'reject' ? 'Yeh post nahi jayegi.' : 'Save ho gaya.'
      );
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBusy('');
    }
  };
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => showToast('Likhai copy ho gayi. TikTok / WhatsApp mein Paste karein.'), () => showToast('Copy nahi ho saka.'));
  };
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold text-[#141413] truncate max-w-full">
          {post.kind === 'DAILY' ? '🤖 AI ki aaj ki post' : `💡 ${post.idea || 'Aap ka idea'}`} · <span className="font-normal text-[#575653]">{post.productNames.slice(0, 3).join(', ').slice(0, 90)}</span>
        </div>
        <Badge s={post.status} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {post.video && <video src={post.video} controls playsInline className="h-40 rounded border border-black/10 bg-black shrink-0" />}
        {post.images.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" title="Tasveer kholein / save karein">
            <img src={u} alt="" className="w-24 h-24 object-cover rounded border border-black/10 shrink-0" loading="lazy" />
          </a>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!editable}
        rows={Math.min(14, Math.max(6, text.split('\n').length + 1))}
        className="w-full text-[13px] leading-snug border border-black/15 rounded-md p-2 font-sans bg-[#FBFBF9]"
      />
      {post.status === 'APPROVED' && <p className="text-[12px] text-blue-800 mt-1">⏰ {pkTime(post.postAt)} par Facebook aur Instagram par jayegi.</p>}
      {post.status === 'POSTED' && (
        <p className="text-[12px] text-emerald-800 mt-1">
          ✅ {pkTime(post.postedAt)} {post.posted?.facebook ? '· Facebook ✔' : ''} {post.posted?.instagram ? '· Instagram ✔' : ''}
        </p>
      )}
      {!!post.posted?.errors?.length && <p className="text-[12px] text-rose-700 mt-1">{post.posted.errors.join(' · ')}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        {(post.status === 'DRAFT' || post.status === 'FAILED') && (
          <>
            <button className={`${btn} bg-[#0E7A43] text-white`} disabled={!!busy} onClick={() => act('approve')}>
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button className={`${btn} bg-[#141413] text-white`} disabled={!!busy} onClick={() => act('post-now')}>
              <Send className="w-3.5 h-3.5" /> Abhi post karein
            </button>
          </>
        )}
        {post.status === 'APPROVED' && (
          <button className={`${btn} bg-[#141413] text-white`} disabled={!!busy} onClick={() => act('post-now')}>
            <Send className="w-3.5 h-3.5" /> Abhi post karein
          </button>
        )}
        {editable && text.trim() !== post.caption.trim() && (
          <button className={`${btn} bg-[#C5A059] text-black`} disabled={!!busy} onClick={() => act('caption', { caption: text })}>
            Likhai save karein
          </button>
        )}
        {post.status === 'DRAFT' && (
          <button className={`${btn} bg-[#F1F0EC]`} disabled={!!busy} onClick={() => act('rewrite')}>
            <Sparkles className="w-3.5 h-3.5" /> {busy === 'rewrite' ? 'Likh raha hai...' : 'AI dobara likhe'}
          </button>
        )}
        {post.status !== 'POSTED' && post.status !== 'REJECTED' && (
          <button className={`${btn} bg-white border border-black/15`} disabled={!!busy} onClick={() => act('reject')}>
            <X className="w-3.5 h-3.5" /> Nahi
          </button>
        )}
        <button className={`${btn} bg-white border border-black/15`} onClick={copy} title="TikTok, WhatsApp Channel, X par khud lagane ke liye">
          <Copy className="w-3.5 h-3.5" /> Copy likhai
        </button>
        {(post.video || post.images[0]) && (
          <a className={`${btn} bg-white border border-black/15`} href={post.video || post.images[0]} download target="_blank" rel="noreferrer">
            <Download className="w-3.5 h-3.5" /> {post.video ? 'Video' : 'Tasveer'}
          </a>
        )}
      </div>
    </div>
  );
};

export const AdminSocialPanel: React.FC = () => {
  const { showToast } = useStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [conn, setConn] = useState<Conn>(null);
  const [settings, setSettings] = useState({ autoDaily: true, postHourPk: 20, rules: '' });
  const [rules, setRules] = useState('');
  // the owner's own photos / video for the next post (already uploaded)
  const [media, setMedia] = useState<{ kind: 'photo' | 'video'; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [idea, setIdea] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [making, setMaking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([api('/api/admin/social'), api('/api/admin/daily-video').catch(() => ({ jobs: [] }))]);
      setPosts(s.posts || []);
      setConn(s.connections);
      setSettings(s.settings);
      setRules(s.settings?.rules || '');
      setVideos((v.jobs || []).slice(0, 8));
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  // product search for the owner's own post
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => {
      api<{ products: Pick[] }>(`/api/admin/social/products?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setFound(r.products))
        .catch(() => setFound([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const saveSettings = async (next: Partial<typeof settings>) => {
    const s = { ...settings, ...next };
    setSettings(s);
    try {
      await api('/api/admin/social/settings', s);
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
        setMedia((m) => {
          // one video per post, or up to 4 photos
          if (data.kind === 'video') return [{ kind: 'video', url: data.url }];
          return [...m.filter((x) => x.kind === 'photo'), { kind: 'photo' as const, url: data.url }].slice(-4);
        });
      } catch (e: any) {
        showToast(`${f.name}: ${e.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const makeDraft = async () => {
    setMaking(true);
    try {
      const video = media.find((m) => m.kind === 'video')?.url;
      const photos = media.filter((m) => m.kind === 'photo').map((m) => m.url);
      const r = await api<{ post: Post }>('/api/admin/social/draft', { idea, productIds: picked.map((p) => p.id), photos, ...(video ? { video } : {}) });
      setPosts((list) => [r.post, ...list]);
      setIdea('');
      setPicked([]);
      setMedia([]);
      setQ('');
      showToast('Post tayyar hai. Neeche dekh kar Approve karein.');
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setMaking(false);
    }
  };
  const loadReport = async () => {
    try {
      setReport(await api('/api/admin/social/report'));
    } catch (e: any) {
      showToast(e.message);
    }
  };

  const Row: React.FC<{ name: string; ok: boolean; detail: string; note?: string }> = ({ name, ok, detail, note }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-black/5 last:border-0">
      <div>
        <div className="text-sm font-bold">{name}</div>
        <div className="text-[12px] text-[#575653]">{detail}</div>
        {note && <div className="text-[11px] text-rose-700 mt-0.5">{note}</div>}
      </div>
      <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>{ok ? '✔ Jura hua' : 'Khud share'}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            AI Social Manager <HelpDot id="admin.tab.SOCIAL" />
          </h2>
          <p className="text-xs text-[#575653]">AI posts tayyar karta hai, aap dekh kar Approve karte hain. Aap ki "Yes" ke baghair kuch post nahi hota.</p>
        </div>
        <button className={`${btn} bg-white border border-black/15`} onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* connections */}
        <div className={card}>
          <h3 className="text-sm font-extrabold mb-1 flex items-center gap-1.5">
            <Link2 className="w-4 h-4" /> Jure hue accounts
          </h3>
          <p className="text-[11px] text-[#575653] mb-2">Accounts Facebook ke apne tareeqe (token) se jurte hain. Password kabhi kisi ko na dein.</p>
          <Row name="Facebook Page" ok={!!conn?.facebook.connected} detail={conn?.facebook.connected ? conn.facebook.name || 'Jura hua' : 'Abhi jura nahi'} note={conn?.facebook.error} />
          <Row name="Instagram" ok={!!conn?.instagram.connected} detail={conn?.instagram.connected ? `@${conn.instagram.username}` : 'Abhi jura nahi'} note={conn?.instagram.error} />
          <Row name="WhatsApp (aap ko manzoori ke message)" ok={!!conn?.whatsapp.connected} detail={conn?.whatsapp.connected ? 'Jura hua' : 'Abhi e-mail se aata hai'} />
          <Row name="TikTok · WhatsApp Channel · X · YouTube" ok={false} detail='"Copy likhai" aur "Tasveer" se khud lagayein (rozana video ke page par share buttons hain)' />
        </div>

        {/* settings */}
        <div className={card}>
          <h3 className="text-sm font-extrabold mb-2">Rozana ka kaam</h3>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={settings.autoDaily} onChange={(e) => saveSettings({ autoDaily: e.target.checked })} />
            <span>
              <b>AI roz ek tasveer wali post tayyar kare</b>
              <span className="block text-[12px] text-[#575653]">Subah 11 baje ek naye product ki post (4 tasveerein + Roman Urdu likhai) tayyar ho kar aap ko e-mail aati hai.</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm mt-3">
            Approve ki hui post kis waqt jaye:
            <select className="border border-black/15 rounded px-2 py-1 text-sm" value={settings.postHourPk} onChange={(e) => saveSettings({ postHourPk: Number(e.target.value) })}>
              {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => (
                <option key={h} value={h}>
                  {h > 12 ? `${h - 12} baje shaam/raat` : h === 12 ? '12 baje dopahar' : `${h} baje subah`}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3">
            <div className="text-sm font-bold">Hamesha ki hidayat (har post par)</div>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={3}
              placeholder='Jaise: "Emoji kam lagao", "Har post ke aakhir mein likho: WhatsApp 0306-5690358", "Chhoti posts likho"'
              className="w-full text-[13px] border border-black/15 rounded-md p-2 mt-1"
            />
            {rules !== settings.rules && (
              <button className={`${btn} bg-[#C5A059] text-black mt-1`} onClick={() => saveSettings({ rules })}>
                Hidayat save karein
              </button>
            )}
          </div>
          <p className="text-[12px] text-[#575653] mt-3">🎬 Rozana video alag se 3 baje banti hai aur 5 baje jati hai (neeche list).</p>
        </div>
      </div>

      {/* the owner's own post */}
      <div className={card}>
        <h3 className="text-sm font-extrabold mb-2 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#C5A059]" /> Nayi post banwayein
        </h3>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder='Apni hidayat likhein, AI wahi karega. Jaise: "Sardiyon ki sale, har cheez par 10% off code WINTER10, chhoti post likho" ya "Naye ladies bags aa gaye, Urdu mein likho". Sab khaali chhor dein to AI khud product chunega.'
          className="w-full text-sm border border-black/15 rounded-md p-2"
        />
        <div className="mt-2">
          <label className={`${btn} bg-white border border-black/15`}>
            📷 Apni photo / video lagayein
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
          <span className="text-[11px] text-[#575653] ml-2">Mobile ya PC se: 4 photos tak, ya 1 video (MP4, 100 MB se kam)</span>
          {uploading > 0 && <span className="text-[11px] text-blue-700 ml-2">Upload ho raha hai...</span>}
          {media.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {media.map((m) => (
                <span key={m.url} className="relative">
                  {m.kind === 'video' ? <video src={m.url} className="h-20 rounded border border-black/10 bg-black" muted /> : <img src={m.url} alt="" className="w-20 h-20 object-cover rounded border border-black/10" />}
                  <button
                    className="absolute -top-1.5 -right-1.5 bg-white border border-black/20 rounded-full p-0.5 cursor-pointer"
                    onClick={() => setMedia(media.filter((x) => x.url !== m.url))}
                    aria-label="Hatayein"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="relative mt-2">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-[#575653]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Products dhoondein (zyada se zyada 6)" className="w-full text-sm border border-black/15 rounded-md py-2 pl-8 pr-2" />
          {found.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-black/15 rounded-md shadow-lg max-h-64 overflow-y-auto">
              {found.map((p) => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-2 p-2 text-left text-xs hover:bg-black/5 cursor-pointer"
                  onClick={() => {
                    if (!picked.some((x) => x.id === p.id) && picked.length < 6) setPicked([...picked, p]);
                    setQ('');
                    setFound([]);
                  }}
                >
                  {p.image && <img src={p.image} alt="" className="w-8 h-8 object-cover rounded" />}
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="font-bold">Rs {Math.round(p.price).toLocaleString('en-PK')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 bg-[#F1F0EC] rounded px-2 py-1 text-[11px]">
                {p.name.slice(0, 40)}
                <button className="cursor-pointer" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} aria-label="Hatayein">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <button className={`${btn} bg-[#C5A059] text-black mt-3`} onClick={makeDraft} disabled={making || uploading > 0}>
          <Sparkles className="w-3.5 h-3.5" /> {making ? 'AI post bana raha hai...' : 'AI se post banao'}
        </button>
      </div>

      {/* posts */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold">Posts</h3>
        {!posts.length && !loading && <p className="text-xs text-[#575653]">Abhi koi post nahi. Upar "AI se post banao" dabayein.</p>}
        {posts.map((p) => (
          <PostCard key={p.id} post={p} onChange={(np) => setPosts((list) => list.map((x) => (x.id === np.id ? np : x)))} />
        ))}
      </div>

      {/* daily videos */}
      <div className={card}>
        <h3 className="text-sm font-extrabold mb-2 flex items-center gap-1.5">
          <Film className="w-4 h-4" /> Rozana videos
        </h3>
        {!videos.length && <p className="text-xs text-[#575653]">Abhi koi video nahi.</p>}
        {videos.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-black/5 last:border-0 text-xs">
            <span className="truncate max-w-[60%]">
              {v.day} · {v.productName}
            </span>
            <span className="flex items-center gap-2">
              <Badge s={v.status} />
              <a href={v.link} target="_blank" rel="noreferrer" className="font-bold underline">
                {v.status === 'READY' ? 'Dekhein / Yes-No' : 'Dekhein / Share'}
              </a>
            </span>
          </div>
        ))}
      </div>

      {/* weekly report */}
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-extrabold flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> Pichle 7 din ki report
          </h3>
          <button className={`${btn} bg-white border border-black/15`} onClick={loadReport}>
            {report ? 'Dobara dekhein' : 'Report dekhein'}
          </button>
        </div>
        {report && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center mb-3">
              {[
                ['Posts', report.posts],
                ['Likes', report.total.likes],
                ['Comments', report.total.comments],
                ['Shares', report.total.shares],
              ].map(([k, v]) => (
                <div key={k} className="bg-[#FBFBF9] border border-black/10 rounded p-2">
                  <div className="text-lg font-extrabold">{Number(v).toLocaleString('en-PK')}</div>
                  <div className="text-[11px] text-[#575653]">{k}</div>
                </div>
              ))}
            </div>
            {report.rows.map((r, i) => (
              <div key={i} className="flex justify-between gap-2 text-xs py-1.5 border-b border-black/5 last:border-0">
                <span className="truncate">
                  {r.kind === 'Video' ? '🎬' : '🖼️'} {r.name}
                </span>
                <span className="shrink-0 text-[#575653]">
                  👍 {r.likes} · 💬 {r.comments} · ↗ {r.shares}
                </span>
              </div>
            ))}
            {!report.rows.length && <p className="text-xs text-[#575653]">Pichle 7 din mein koi post nahi gayi.</p>}
            <p className="text-[11px] text-[#575653] mt-2">Website par Facebook/Instagram se kitne log aaye: "Traffic & Conversion" tab dekhein.</p>
          </>
        )}
      </div>
    </div>
  );
};
