import React, { useEffect, useRef, useState } from 'react';
import { Check, Clapperboard, KeyRound, RefreshCw } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { askForAiKey } from './AiKeyNudge';

// Pro AI video: Google's video AI makes a real moving video (a car driving on a road...) from the
// product's main picture and the seller's words. Google charges the seller's own card for it (no free
// limit), so it runs only on the seller's own AI key with billing on. The server does the work in the
// background (1-3 minutes); the job id is remembered, so closing this window does not lose the video.

const PER_SECOND_USD = 0.07; // Google's 720p price (Nov 2026); shown as an estimate
const PKR_PER_USD = 280;

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Please sign in again.');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Could not reach the store. Please try again.'), { code: data?.code });
  return data as T;
}

const jobKey = (productId: string) => `anokha.proVideo.${productId}`;
const savedJob = (productId: string) => {
  try {
    return localStorage.getItem(jobKey(productId)) || '';
  } catch {
    return '';
  }
};
const keepJob = (productId: string, id: string) => {
  try {
    if (id) localStorage.setItem(jobKey(productId), id);
    else localStorage.removeItem(jobKey(productId));
  } catch {}
};

const PRO_IDEAS = ['Driving fast on a highway', 'Slowly turning, studio lights', 'Being used by a happy customer', 'Close-up details, cinematic', 'Flying through the clouds'];

export const ProVideoPanel: React.FC<{ product: { id: string; name: string }; onAdded: (url: string) => void }> = ({ product, onAdded }) => {
  const { showToast } = useStore();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState(8);
  const [shape, setShape] = useState<'16:9' | '9:16'>('16:9');
  const [agree, setAgree] = useState(false);
  // someone who talks about the product: an AI woman / man, or the person in the seller's photo
  const [presenter, setPresenter] = useState<'NONE' | 'AI_WOMAN' | 'AI_MAN' | 'PHOTO'>('NONE');
  const [lang, setLang] = useState<'UR' | 'EN'>('UR');
  const [photo, setPhoto] = useState<{ data: string; preview: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      // made smaller (max 1024 px, JPG) before sending; it is used only for this video and not saved
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.88);
      setPhoto({ data: url.split(',')[1], preview: url });
    } catch {
      setError('This photo could not be opened. Use a JPG or PNG picture.');
    }
  };
  const [jobId, setJobId] = useState(savedJob(product.id));
  const [job, setJob] = useState<{ status: 'RUNNING' | 'DONE' | 'FAILED'; url?: string; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());

  // Does the seller have their own key? (and a video still being made from before)
  useEffect(() => {
    call<{ hasKey: boolean; job: any }>(`/api/seller/coach/pro-video?job=${encodeURIComponent(jobId)}`)
      .then((d) => {
        setHasKey(d.hasKey ?? true);
        if (d.job) setJob(d.job);
        else if (jobId) {
          keepJob(product.id, '');
          setJobId('');
        }
      })
      .catch(() => setHasKey(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While Google is making it: check every 6 seconds
  useEffect(() => {
    if (!jobId || (job && job.status !== 'RUNNING')) return;
    started.current = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    const poll = setInterval(() => {
      call<{ job: any }>(`/api/seller/coach/pro-video?job=${encodeURIComponent(jobId)}`)
        .then((d) => {
          if (!d.job) return;
          setJob(d.job);
          if (d.job.status !== 'RUNNING') keepJob(product.id, d.job.status === 'DONE' ? jobId : '');
        })
        .catch(() => {});
    }, 6000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [jobId, job?.status, product.id]);

  const usd = seconds * PER_SECOND_USD;
  const start = async () => {
    setError('');
    setBusy(true);
    try {
      const d = await call<{ jobId: string }>('/api/seller/coach/pro-video', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          prompt,
          seconds,
          shape,
          agree,
          presenter,
          lang,
          consent,
          personPhoto: presenter === 'PHOTO' ? photo?.data || '' : '',
        }),
      });
      keepJob(product.id, d.jobId);
      setJobId(d.jobId);
      setJob({ status: 'RUNNING' });
      setElapsed(0);
    } catch (err: any) {
      if (err?.code === 'PRO_KEY_NEEDED') setHasKey(false);
      setError(err?.message || 'Could not start the video.');
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!job?.url) return;
    setBusy(true);
    try {
      await call('/api/seller/coach/video-save', { method: 'POST', body: JSON.stringify({ productId: product.id, videoUrl: job.url }) });
      keepJob(product.id, '');
      showToast('Pro video added to the listing. Customers can see it now.');
      onAdded(job.url);
    } catch (err: any) {
      setError(err?.message || 'Could not add the video.');
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    keepJob(product.id, '');
    setJobId('');
    setJob(null);
    setError('');
    setAgree(false);
  };

  if (hasKey === false) {
    return (
      <div className="space-y-2 text-xs">
        <p className="p-3 bg-amber-50 border border-amber-300 rounded">
          Pro AI video is made by Google's video AI and <strong>Google charges your own card</strong> for it (about PKR {Math.round(8 * PER_SECOND_USD * PKR_PER_USD)} for 8 seconds). So it runs only on <strong>your own AI key</strong>, with billing turned on for that key's Google project.
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-[#33322F]">
          <li>Add your free AI key in "My AI keys" (top of the AI Assistant page).</li>
          <li>
            In Google AI Studio, open the key's project and press <strong>"Set up billing"</strong> (add your card there yourself).
          </li>
          <li>Come back here and make your Pro video.</li>
        </ol>
        <button type="button" onClick={() => askForAiKey()} className="w-full py-2.5 bg-[#0E7A43] text-white font-bold rounded cursor-pointer flex items-center justify-center gap-2">
          <KeyRound className="w-4 h-4" /> Add my AI key
        </button>
        <p className="text-[11px] text-[#575653]">The free video (first tab) works without any of this.</p>
      </div>
    );
  }

  if (job?.status === 'RUNNING') {
    return (
      <div className="space-y-2 text-xs">
        <div className="p-4 rounded-xl bg-[#141413] text-white text-center space-y-2">
          <Clapperboard className="w-8 h-8 mx-auto animate-pulse text-[#C5A059]" />
          <div className="font-bold text-sm">Google's AI is filming your product...</div>
          <div className="text-white/70">This takes 1 to 3 minutes{elapsed ? ` (${elapsed} s so far)` : ''}. You can close this window: the video keeps being made, open it again later from the same product.</div>
        </div>
      </div>
    );
  }

  if (job?.status === 'DONE' && job.url) {
    return (
      <div className="space-y-2">
        <video src={job.url} controls autoPlay loop playsInline className="w-full rounded-xl bg-black" />
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <button type="button" disabled={busy} onClick={add} className="w-full py-2.5 bg-[#0E7A43] text-white font-bold text-sm rounded cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {busy ? 'Adding to the listing...' : 'Add to my listing'}
        </button>
        <button type="button" onClick={again} className="w-full py-2 border border-[#DCD9D2] text-xs font-semibold rounded cursor-pointer flex items-center justify-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Make another (charged again)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {job?.status === 'FAILED' && <p className="text-xs p-2 bg-rose-50 border border-rose-200 rounded text-rose-800">{job.error}</p>}
      <label className="block text-xs font-semibold" htmlFor="pro-wish">
        What should happen in the video? (any language)
      </label>
      <textarea
        id="pro-wish"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={600}
        placeholder="e.g. The car drives fast on a highway at sunset, camera follows it"
        className="w-full px-3 py-2 rounded-lg border border-[#DCD9D2] rounded text-sm focus:border-black focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRO_IDEAS.map((idea) => (
          <button key={idea} type="button" onClick={() => setPrompt(idea)} className="px-2 py-1 text-[11px] border border-[#DCD9D2] rounded-full bg-[#FBFBF9] cursor-pointer hover:border-black">
            {idea}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="font-semibold">Length</span>
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white">
            {[4, 6, 8, 10, 12, 15].map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-semibold">Shape</span>
          <select value={shape} onChange={(e) => setShape(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white">
            <option value="16:9">Wide (product page, Facebook)</option>
            <option value="9:16">Tall (WhatsApp status, TikTok)</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="font-semibold">Someone talking about it</span>
          <select value={presenter} onChange={(e) => setPresenter(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white">
            <option value="NONE">No one (music only)</option>
            <option value="AI_WOMAN">AI woman</option>
            <option value="AI_MAN">AI man</option>
            <option value="PHOTO">A person from my photo</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-semibold">They speak</span>
          <select value={lang} disabled={presenter === 'NONE'} onChange={(e) => setLang(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white disabled:opacity-50">
            <option value="UR">Urdu</option>
            <option value="EN">English</option>
          </select>
        </label>
      </div>
      {presenter !== 'NONE' && (
        <p className="text-[11px] text-[#575653]">
          They hold the product, look at the camera and tell its features and price, with natural lips, eyes and hand movement. Choose 8 seconds or more so they have time to talk.
        </p>
      )}
      {presenter === 'PHOTO' && (
        <div className="p-2.5 border border-[#DCD9D2] rounded space-y-2 text-xs">
          <div className="flex items-center gap-3">
            {photo ? <img src={photo.preview} alt="Presenter" className="w-16 h-16 object-cover rounded-full rounded-xl border border-[#E7E5DF]" /> : null}
            <label className="px-3 py-1.5 border border-[#DCD9D2] rounded font-semibold cursor-pointer">
              {photo ? 'Change photo' : 'Choose a photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-[11px] text-[#575653]">A clear, front-facing photo of one adult, face well lit. The photo is used only to make this video and is not saved.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>This is me, or this person has allowed me to use their photo for this advert. (Never use a famous person or someone without permission.)</span>
          </label>
        </div>
      )}
      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-xs space-y-1.5">
        <div>
          Google charges <strong>your own card</strong> about <strong>${usd.toFixed(2)} (≈ PKR {Math.round(usd * PKR_PER_USD)})</strong> for this video. The store does not take anything.
        </div>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>I understand Google will charge my card for this video.</span>
        </label>
      </div>
      <p className="text-[11px] text-[#575653]">Made from this product's main picture. Pictures with people or children may be refused by Google's safety rules.</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button
        type="button"
        disabled={!agree || busy || hasKey === null || (presenter === 'PHOTO' && (!photo || !consent))}
        onClick={start}
        className="w-full py-2.5 bg-[#0E7A43] text-white font-bold text-sm rounded cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Clapperboard className="w-4 h-4" /> {busy ? 'Starting...' : 'Make my Pro video'}
      </button>
    </div>
  );
};
