import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, X, RefreshCw, Check, Film, Download } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { askForAiKey } from './AiKeyNudge';

// Shop Coach "no video" fix. The seller writes what kind of video they want; the server's AI writes a
// plan (words, picture order, colours); this browser animates the product's own pictures into a
// 12-15 second ad with music, records it (canvas + MediaRecorder) and adds it to the listing.
// No paid video AI: the only AI cost is one short text call.

import { FPS, SIZE, VOICE_START, cutOut, decodeVoice, drawFrame, pickMime, startMusic, totalSeconds, type Frame, type Plan } from '../services/videoRender';
import { ProVideoPanel } from './ProVideoPanel';

/** A small JPEG of the main picture (base64, no prefix) for the AI to look at */
function thumbOf(pic: HTMLImageElement | ImageBitmap): string {
  try {
    const iw = (pic as any).width as number;
    const ih = (pic as any).height as number;
    const k = Math.min(1, 384 / Math.max(iw, ih));
    const c = document.createElement('canvas');
    c.width = Math.round(iw * k);
    c.height = Math.round(ih * k);
    c.getContext('2d')!.drawImage(pic, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75).split(',')[1] || '';
  } catch {
    return '';
  }
}

type VideoProduct = { id: string; name: string; brand: string; image?: string };

async function authed(path: string, init: RequestInit = {}) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Please sign in again.');
  const token = await auth.currentUser.getIdToken();
  return fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}
async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authed(path, init);
  const data = await res.json().catch(() => ({}));
  // (a video made with the ready-made design shows its own note instead, so recording is not covered)
  if (data?.code === 'AI_KEY_NEEDED') askForAiKey(data.error);
  if (!res.ok) throw new Error(data?.error || (res.status === 413 ? 'The video is too large.' : 'Could not reach the store. Please try again.'));
  return data as T;
}

async function loadPicture(productId: string, url: string, i: number): Promise<HTMLImageElement | ImageBitmap | null> {
  try {
    // pictures stored on this store draw directly; pictures on other websites come through the server
    const same = url.startsWith('/') || url.startsWith(window.location.origin);
    const res = same ? await fetch(url) : await authed(`/api/seller/coach/video-image?productId=${encodeURIComponent(productId)}&i=${i}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    if ('createImageBitmap' in window) return await createImageBitmap(blob);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

const IDEAS = ['Eid sale, bold and exciting', 'Luxury, premium look', 'Fun and colourful', 'Simple and clean', 'Urdu mein likho', 'For gifting'];

// ------------------------------------------------------------------ the maker window
export const VideoMakerModal: React.FC<{ product: VideoProduct; onClose: (added: boolean, videoUrl?: string) => void }> = ({ product, onClose }) => {
  const { showToast } = useStore();
  const [prompt, setPrompt] = useState('');
  const [step, setStep] = useState<'ask' | 'making' | 'done' | 'saving'>('ask');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [music, setMusic] = useState(true);
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [added, setAdded] = useState(false);
  // made with the ready-made design because today's free AI uses are finished
  const [keyNote, setKeyNote] = useState(false);
  // FREE: made here from the pictures; PRO: Google's video AI on the seller's own (paid) key
  const [mode, setMode] = useState<'FREE' | 'PRO'>('FREE');
  // voice-over: a woman's or man's voice telling the product's features
  const [voice, setVoice] = useState<'NONE' | 'FEMALE' | 'MALE'>('FEMALE');
  const [lang, setLang] = useState<'UR' | 'EN'>('UR');
  const [voiceNote, setVoiceNote] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef(false);
  const supported = Boolean(pickMime()) && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

  useEffect(
    () => () => {
      stopRef.current = true;
      if (video) URL.revokeObjectURL(video.url);
    },
    [video]
  );

  const make = async () => {
    setError('');
    setVoiceNote('');
    setStep('making');
    setProgress(0);
    stopRef.current = false;
    try {
      // 1. the product's saved pictures, and the product cut out of each (plain backgrounds only)
      setStatus('Getting the pictures ready...');
      const saved = await apiJson<{ product: { images?: string[]; primaryImage?: string } }>(`/api/seller/products/${encodeURIComponent(product.id)}`);
      const urls = (saved.product.images?.length ? saved.product.images : saved.product.primaryImage ? [saved.product.primaryImage] : []).slice(0, 8);
      const loaded = await Promise.all(urls.map((u, i) => loadPicture(product.id, u, i)));
      if (!loaded[0]) throw new Error('The main product picture could not be opened. Check that it still shows on the product page.');
      // pictures that failed to open are replaced by the main one, so the numbers still match
      const pics = loaded.map((p) => p || loaded[0]!) as (HTMLImageElement | ImageBitmap)[];
      const cuts = pics.map((p) => cutOut(p));
      // 2. the AI sees a small copy of the main picture and plans the words, colours and movement
      setStatus('The AI is planning your video...');
      const r = await apiJson<{ plan: Plan; usedAi: boolean; aiKeyNeeded?: boolean; product: { shopName: string } }>('/api/seller/coach/video-plan', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, prompt, thumb: thumbOf(pics[0]), voice, lang }),
      });
      setKeyNote(Boolean(r.aiKeyNeeded));
      // 3. the voice-over (a woman's or man's voice telling the features), if asked for
      let voiceBuf: AudioBuffer | null = null;
      if (voice !== 'NONE' && r.plan.voiceScript) {
        setStatus('Recording the voice...');
        try {
          const v = await apiJson<{ audio: string; mime?: string; aiKeyNeeded?: boolean; error?: string }>('/api/seller/coach/voiceover', {
            method: 'POST',
            body: JSON.stringify({ script: r.plan.voiceScript, voice, lang }),
          });
          if (v.aiKeyNeeded) setKeyNote(true);
          if (v.audio) {
            const bin = atob(v.audio);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            voiceBuf = await decodeVoice(bytes.buffer, v.mime);
          }
          if (!voiceBuf) setVoiceNote(v.error || 'The voice could not be made this time; the video has music only.');
        } catch {
          setVoiceNote('The voice could not be made this time; the video has music only.');
        }
      }
      // scenes may only point at the pictures that exist
      const plan: Plan = { ...r.plan, scenes: r.plan.scenes.map((s) => ({ ...s, image: Math.min(s.image, pics.length - 1) })) };
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      // the video lasts at least as long as the voice
      const seconds = Math.max(totalSeconds(plan), voiceBuf ? VOICE_START + voiceBuf.duration + 1.2 : 0);
      const frame: Frame = { pics, plan, shopName: r.product.shopName, cuts };
      drawFrame(ctx, frame, 0);

      setStatus(r.usedAi ? 'Making your video... keep this screen open' : 'Making your video (ready-made style, the AI is busy)... keep this screen open');
      const stream: MediaStream = (canvas as any).captureStream(FPS);
      const audio = startMusic(plan, seconds, { music, voice: voiceBuf });
      if (audio?.track) stream.addTrack(audio.track);
      const mime = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const finished = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
      rec.start(500);
      const began = performance.now();
      // the phone stops drawing when the screen is left: the video would jump, so it is made again
      let left = false;
      const onHide = () => {
        if (document.hidden) left = true;
      };
      document.addEventListener('visibilitychange', onHide);
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = (performance.now() - began) / 1000;
          if (stopRef.current || left || t >= seconds) return resolve();
          drawFrame(ctx, frame, t);
          setProgress(Math.round((t / seconds) * 100));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      drawFrame(ctx, frame, seconds);
      rec.stop();
      await finished;
      audio?.ac.close().catch(() => {});
      stream.getTracks().forEach((tr) => tr.stop());
      document.removeEventListener('visibilitychange', onHide);
      if (stopRef.current) return;
      if (left) throw new Error('The screen was left while the video was being made. Press "Make my video" again and keep this screen open for about 20 seconds.');
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      if (blob.size < 20_000) throw new Error('The video did not record properly. Keep this screen open while it is being made and try again.');
      setVideo({ blob, url: URL.createObjectURL(blob) });
      setProgress(100);
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setStep('ask');
    }
  };

  const addToListing = async () => {
    if (!video) return;
    setStep('saving');
    try {
      const up = await apiJson<{ url: string }>('/api/seller/media/upload', { method: 'POST', body: video.blob, headers: { 'Content-Type': video.blob.type } });
      await apiJson('/api/seller/coach/video-save', { method: 'POST', body: JSON.stringify({ productId: product.id, videoUrl: up.url }) });
      setAdded(true);
      showToast('Video added to the listing. Customers can see it now.');
      onClose(true, up.url);
    } catch (err: any) {
      setError(err?.message || 'Could not add the video.');
      setStep('done');
    }
  };

  const close = () => {
    stopRef.current = true;
    onClose(added);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Make a product video">
      <div className="bg-white w-full sm:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-[#141413]">
        <div className="flex items-start gap-2">
          <Film className="w-5 h-5 text-[#0E7A43] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Make a video with AI</div>
            <div className="text-[11px] text-[#575653] truncate">{product.name}</div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {(step === 'ask' || mode === 'PRO') && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F1F0EC] rounded-lg text-xs font-semibold" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'FREE'}
              onClick={() => setMode('FREE')}
              className={`py-2 rounded-md cursor-pointer ${mode === 'FREE' ? 'bg-white shadow-sm' : 'text-[#575653]'}`}
            >
              Free video
              <span className="block text-[10px] font-normal text-[#575653]">your pictures, animated</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'PRO'}
              onClick={() => setMode('PRO')}
              className={`py-2 rounded-md cursor-pointer ${mode === 'PRO' ? 'bg-white shadow-sm' : 'text-[#575653]'}`}
            >
              Pro AI video ✨
              <span className="block text-[10px] font-normal text-[#575653]">really moves · paid by you</span>
            </button>
          </div>
        )}

        {mode === 'PRO' ? (
          <ProVideoPanel product={product} onAdded={(url) => {
            setAdded(true);
            onClose(true, url);
          }} />
        ) : !supported ? (
          <p className="text-xs p-3 bg-amber-50 border border-amber-300 rounded">
            This browser cannot make videos. Open Seller Center in Google Chrome (phone or computer) and try again, or upload your own video.
          </p>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              className={`w-full aspect-square rounded-xl bg-[#141413] ${step === 'making' ? '' : 'hidden'}`}
            />
            {step === 'ask' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold" htmlFor="video-wish">
                  What kind of video do you want? (any language)
                </label>
                <textarea
                  id="video-wish"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="e.g. Eid sale video, golden colours, show that it is soft and comfortable"
                  className="w-full px-3 py-2 rounded-lg border border-[#DCD9D2] rounded text-sm focus:border-black focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setPrompt((p) => (p ? `${p}, ${idea.toLowerCase()}` : idea))}
                      className="px-2 py-1 text-[11px] border border-[#DCD9D2] rounded-full bg-[#FBFBF9] cursor-pointer hover:border-black"
                    >
                      + {idea}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="font-semibold">Voice telling the features</span>
                    <select value={voice} onChange={(e) => setVoice(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white">
                      <option value="FEMALE">Woman's voice</option>
                      <option value="MALE">Man's voice</option>
                      <option value="NONE">No voice</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Language</span>
                    <select value={lang} disabled={voice === 'NONE'} onChange={(e) => setLang(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-[#DCD9D2] rounded bg-white disabled:opacity-50">
                      <option value="UR">Urdu</option>
                      <option value="EN">English</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> Add background music
                </label>
                <p className="text-[11px] text-[#575653]">
                  The video (about 15 seconds) is made from this product's own pictures, with moving words, the price and music. It is free: no paid video service is used.
                </p>
                {error && <p className="text-xs text-rose-700">{error}</p>}
                <button type="button" onClick={make} className="w-full py-2.5 bg-[#0E7A43] text-white font-bold text-sm rounded cursor-pointer flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" /> Make my video
                </button>
              </div>
            )}
            {step === 'making' && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold">{status}</div>
                <div className="h-2 bg-[#EEECE6] rounded">
                  <div className="h-2 bg-[#0E7A43] rounded transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {(step === 'done' || step === 'saving') && video && (
              <div className="space-y-2">
                <video src={video.url} controls autoPlay loop playsInline className="w-full aspect-square rounded-xl bg-black" />
                {voiceNote && <p className="text-[11px] p-2 bg-amber-50 border border-amber-300 rounded">{voiceNote}</p>}
                {keyNote && (
                  <div className="text-[11px] p-2 bg-amber-50 border border-amber-300 rounded flex flex-wrap items-center gap-2">
                    <span className="flex-1 min-w-[180px]">
                      Made with the ready-made design: today's free AI uses are finished. Add your own free AI key and the AI designs every video from your words.
                    </span>
                    <button type="button" onClick={() => askForAiKey()} className="px-2 py-1 bg-[#0E7A43] text-white font-bold rounded cursor-pointer">
                      Add my free key
                    </button>
                  </div>
                )}
                {error &&<p className="text-xs text-rose-700">{error}</p>}
                <button
                  type="button"
                  disabled={step === 'saving'}
                  onClick={addToListing}
                  className="w-full py-2.5 bg-[#0E7A43] text-white font-bold text-sm rounded cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> {step === 'saving' ? 'Adding to the listing...' : 'Add to my listing'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={step === 'saving'}
                    onClick={() => {
                      URL.revokeObjectURL(video.url);
                      setVideo(null);
                      setStep('ask');
                    }}
                    className="py-2 border border-[#DCD9D2] text-xs font-semibold rounded cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Change and make again
                  </button>
                  <a
                    href={video.url}
                    download={`${product.name.slice(0, 40).replace(/[^\w\- ]+/g, '') || 'product'}-video.${video.blob.type.includes('mp4') ? 'mp4' : 'webm'}`}
                    className="py-2 border border-[#DCD9D2] text-xs font-semibold rounded flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Save to phone
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ the Shop Coach buttons
export const VideoFixActions: React.FC<{ products: VideoProduct[]; onDone: () => void; onEdit: (productId: string) => void }> = ({ products, onDone, onEdit }) => {
  const [listOpen, setListOpen] = useState(false);
  const [making, setMaking] = useState<VideoProduct | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const left = products.filter((p) => !done.includes(p.id));
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (left.length === 1 ? setMaking(left[0]) : setListOpen(true))}
          className="mt-1 px-3 py-1.5 bg-[#0E7A43] text-white rounded-lg font-bold cursor-pointer"
        >
          ✨ Self fix (make a video with AI)
        </button>
        <button type="button" onClick={() => setListOpen((o) => !o)} className="mt-1 px-3 py-1.5 bg-white border border-[#DCD9D2] font-semibold cursor-pointer">
          {listOpen ? 'Hide list' : `Upload my own video (${left.length})`}
        </button>
      </div>
      {listOpen && (
        <ul className="bg-white rounded-xl border border-[#E7E5DF] divide-y divide-black/[0.06] max-h-80 overflow-y-auto">
          {products.map((p) => (
            <li key={p.id} className="px-3 py-2 flex items-center gap-2">
              {p.image ? <img src={p.image} alt="" loading="lazy" className="w-9 h-9 object-cover rounded shrink-0 bg-[#EEECE6]" /> : null}
              <span className="flex-1 min-w-0 truncate" title={p.name}>
                {p.name}
              </span>
              {done.includes(p.id) ? (
                <span className="shrink-0 text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Video added
                </span>
              ) : (
                <>
                  <button type="button" onClick={() => setMaking(p)} className="shrink-0 px-2 py-1 bg-[#0E7A43] text-white rounded-lg font-semibold cursor-pointer">
                    ✨ AI video
                  </button>
                  <button type="button" onClick={() => onEdit(p.id)} title="Open the product and upload your own video" className="shrink-0 px-2 py-1 border border-[#DCD9D2] font-semibold cursor-pointer flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Upload
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {making && (
        <VideoMakerModal
          product={making}
          onClose={(added) => {
            if (added) {
              setDone((d) => [...d, making.id]);
              if (left.length <= 1) onDone();
            }
            setMaking(null);
          }}
        />
      )}
    </div>
  );
};
