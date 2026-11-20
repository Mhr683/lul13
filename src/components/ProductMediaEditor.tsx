import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Video, X, Star, ArrowLeft, ArrowRight, Link2 } from 'lucide-react';
import { HelpDot } from './HelpDot';

// Pictures (up to 9, the first is the main one shown on product cards) and one optional video for a
// product in Seller Center. Files are uploaded through `upload`; links (https://...) can be pasted too.
// The 9 places follow the picture set big marketplaces use (main on white, features, benefits, size, ...).

export const MAX_IMAGES = 9;

export const IMAGE_SLOTS: { title: string; tip: string }[] = [
  { title: 'Main', tip: 'Only the product on a pure white background, no text or logo; the product fills most of the picture' },
  { title: 'Features', tip: 'The product with its 3-5 main features pointed out (e.g. "3 heat levels", "USB-C")' },
  { title: 'Benefits', tip: 'What the customer gains: how it makes life easier' },
  { title: 'Size', tip: 'Length, width, height and weight, next to a hand or an everyday object' },
  { title: 'Lifestyle', tip: 'The product being used in real life: at home, at work, by a person' },
  { title: 'How to use', tip: '3-4 steps with pictures (1 → 2 → 3), little text' },
  { title: 'Why us', tip: 'Why buy from your shop: quality, guarantee, Cash on Delivery, easy return' },
  { title: 'Compare', tip: 'Your product vs. ordinary ones with ✓ and ✗; never another brand\'s name or logo (write "Others")' },
  { title: 'In the box', tip: 'Everything that comes in the package, laid out and counted' },
];

// Large phone photos are shrunk in the browser (longest side 2000 px, JPEG) before upload: the 2000 x 2000
// pictures sellers make for the 9-picture set stay sharp
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < 350 * 1024 || file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Checks a picture: square, big enough, and (for the main picture) a white background. Reads the
// picture's edge pixels; pictures from other websites that the browser may not read get only the size check.
export type PictureCheck = { width: number; height: number; square: boolean; bigEnough: boolean; whiteBackground: boolean | null };
const checkCache = new Map<string, Promise<PictureCheck | null>>();
export function checkPicture(src: string): Promise<PictureCheck | null> {
  const hit = checkCache.get(src);
  if (hit) return hit;
  const job = new Promise<PictureCheck | null>((resolve) => {
    const foreign = /^https?:\/\//i.test(src) && !src.startsWith(location.origin);
    const load = (cors: boolean) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let whiteBackground: boolean | null = null;
      try {
        const size = 200;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        // the outer 4 % on every side
        const band = Math.max(2, Math.round(size * 0.04));
        let edge = 0;
        let white = 0;
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            if (x >= band && x < size - band && y >= band && y < size - band) continue;
            const i = (y * size + x) * 4;
            edge++;
            if (d[i] >= 242 && d[i + 1] >= 242 && d[i + 2] >= 242) white++;
          }
        whiteBackground = white / edge >= 0.9;
      } catch {
        whiteBackground = null;
      }
      resolve({ width: w, height: h, square: Math.abs(w - h) <= Math.max(w, h) * 0.03, bigEnough: Math.min(w, h) >= 1000, whiteBackground });
    };
    // A website that does not allow reading its pictures: load it plainly, only the size is checked
    img.onerror = () => (cors ? load(false) : resolve(null));
    img.src = src;
    };
    load(foreign);
  });
  checkCache.set(src, job);
  return job;
}

export const isVideoFile = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

/** A pasted link made usable: http:// becomes https://, and "youtu.be/..." gets https:// in front ('' if it is not a link) */
export const fixLink = (raw: string) => {
  const u = raw.trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) return `https://${u.slice(7)}`;
  if (/^\/\//.test(u)) return `https:${u}`;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u) ? `https://${u}` : '';
};

export const ProductMediaEditor: React.FC<{
  images: string[];
  videoUrl: string;
  onChange: (next: { images: string[]; videoUrl: string }) => void;
  upload: (file: Blob) => Promise<string>;
  onError: (message: string) => void;
  // Puts the main picture's product on a white background with AI; returns the new picture's link
  makeWhite?: (url: string) => Promise<string>;
}> = ({ images, videoUrl, onChange, upload, onError, makeWhite }) => {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  const [videoLink, setVideoLink] = useState('');
  // Size / square / white-background check of each picture
  const [checks, setChecks] = useState<Record<string, PictureCheck | null>>({});
  useEffect(() => {
    let alive = true;
    images.forEach((src) => {
      if (src in checks) return;
      checkPicture(src).then((r) => alive && setChecks((c) => ({ ...c, [src]: r })));
    });
    return () => {
      alive = false;
    };
  }, [images]);
  const main = images[0] ? checks[images[0]] : undefined;
  const warnings: string[] = [];
  if (main) {
    if (main.whiteBackground === false) warnings.push('The main picture (1) should have a pure white background with only the product on it.');
    if (!main.square) warnings.push(`The main picture is not square (${main.width} × ${main.height}). Use 2000 × 2000 (1:1).`);
  }
  const small = images.filter((src) => checks[src] && !checks[src]!.bigEnough).map((src) => images.indexOf(src) + 1);
  if (small.length) warnings.push(`Picture${small.length > 1 ? 's' : ''} ${small.join(', ')} ${small.length > 1 ? 'are' : 'is'} small (under 1000 px). 2000 × 2000 looks sharp when customers zoom.`);
  const notSquare = images.slice(1).filter((src) => checks[src] && !checks[src]!.square).map((src) => images.indexOf(src) + 1);
  if (notSquare.length) warnings.push(`Picture${notSquare.length > 1 ? 's' : ''} ${notSquare.join(', ')} ${notSquare.length > 1 ? 'are' : 'is'} not square; square (1:1) pictures look best everywhere.`);

  const setImages = (next: string[]) => onChange({ images: next.slice(0, MAX_IMAGES), videoUrl });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return onError(`You can add up to ${MAX_IMAGES} pictures.`);
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) onError(`Only ${room} more picture(s) fit; the first ${room} are being added.`);
    let list = [...images];
    for (let i = 0; i < chosen.length; i++) {
      setBusy(`Uploading picture ${i + 1} of ${chosen.length}...`);
      try {
        const url = await upload(await shrinkImage(chosen[i]));
        list = [...list, url];
        onChange({ images: list.slice(0, MAX_IMAGES), videoUrl });
      } catch (err: any) {
        onError(err.message || 'Could not upload the picture.');
      }
    }
    setBusy('');
  };

  const addVideo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return onError('The video can be at most 50 MB. Please trim or compress it.');
    setBusy('Uploading the video...');
    try {
      onChange({ images, videoUrl: await upload(file) });
    } catch (err: any) {
      onError(err.message || 'Could not upload the video.');
    } finally {
      setBusy('');
    }
  };

  const addLink = () => {
    const u = fixLink(link);
    if (!u) return onError('This does not look like a picture link. Copy the full link, or upload the picture instead.');
    if (images.length >= MAX_IMAGES) return onError(`You can add up to ${MAX_IMAGES} pictures.`);
    if (!images.includes(u)) setImages([...images, u]);
    setLink('');
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };

  const btn = 'px-3 py-1.5 rounded-lg border border-[#DCD9D2] text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-black disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-[#141413]">
          Pictures ({images.length}/{MAX_IMAGES}) · best: all 9, square 2000 × 2000 <HelpDot id="seller.product.pictures9" />
        </span>
        {busy && <span className="text-[11px] text-[#0E7A43] font-semibold">{busy}</span>}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {images.map((src, i) => (
          <div key={src} className="space-y-0.5">
          <div className={`relative aspect-square border ${i === 0 ? 'border-[#0E7A43] border-2' : 'border-[#DCD9D2]'} bg-[#F7F6F2]`} title={IMAGE_SLOTS[i]?.tip}>
            <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
            <span className={`absolute left-0 top-0 px-1 text-white text-[9px] font-bold ${i === 0 ? 'bg-[#0E7A43]' : 'bg-black/60'}`}>
              {i + 1}
            </span>
            {checks[src] && (!checks[src]!.bigEnough || !checks[src]!.square || (i === 0 && checks[src]!.whiteBackground === false)) && (
              <span className="absolute left-0 bottom-5 px-1 bg-amber-400 text-black text-[9px] font-bold" title="See the note below the pictures">
                !
              </span>
            )}
            <button
              type="button"
              onClick={() => setImages(images.filter((_, k) => k !== i))}
              aria-label="Remove picture"
              className="absolute right-0 top-0 w-5 h-5 bg-black/70 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50">
              <button type="button" onClick={() => move(i, -1)} aria-label="Move left" className="p-0.5 text-white cursor-pointer disabled:opacity-30" disabled={i === 0}>
                <ArrowLeft className="w-3 h-3" />
              </button>
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => setImages([src, ...images.filter((_, k) => k !== i)])}
                  aria-label="Make main picture"
                  title="Make main picture"
                  className="p-0.5 text-white cursor-pointer"
                >
                  <Star className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => move(i, 1)}
                aria-label="Move right"
                className="p-0.5 text-white cursor-pointer disabled:opacity-30"
                disabled={i === images.length - 1}
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          <p className="text-[9.5px] leading-tight text-[#575653] truncate" title={IMAGE_SLOTS[i]?.tip}>
            {IMAGE_SLOTS[i]?.title}
          </p>
          </div>
        ))}
        {/* The places still empty, each with what belongs there */}
        {IMAGE_SLOTS.slice(images.length).map((slot, k) => (
          <div key={slot.title} className="space-y-0.5">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => photoInput.current?.click()}
              title={slot.tip}
              className="w-full aspect-square border-2 border-dashed border-black/20 flex flex-col items-center justify-center gap-0.5 px-1 text-center text-[9.5px] leading-tight text-[#575653] hover:border-black cursor-pointer disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" />
              <span className="font-bold">{images.length + k + 1}</span>
              <span className="line-clamp-3">{slot.tip.split(/[:,(]/)[0]}</span>
            </button>
            <p className="text-[9.5px] leading-tight text-[#8A8780] truncate">{slot.title}</p>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <ul className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900 space-y-0.5 list-disc pl-6">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {/* The main picture is not on white (or cannot be checked): AI can put the product on white */}
      {makeWhite && images[0] && main && main.whiteBackground !== true && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            disabled={!!busy}
            onClick={async () => {
              setBusy('Making a white background with AI (up to a minute)...');
              try {
                const fresh = await makeWhite(images[0]);
                // the old picture moves to the end (useful as a lifestyle picture) when there is room
                const rest = images.slice(1);
                onChange({ images: [fresh, ...rest, ...(rest.length < MAX_IMAGES - 1 ? [images[0]] : [])].slice(0, MAX_IMAGES), videoUrl });
              } catch (err: any) {
                onError(err.message || 'The picture could not be made right now.');
              } finally {
                setBusy('');
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-[#0E7A43] text-white font-semibold cursor-pointer disabled:opacity-50"
          >
            ✨ Make white background (AI)
          </button>
          <span className="text-[#575653]">
            Live products need the main picture on pure white. Free way: the Photoroom or Pixelcut phone app, or remove.bg, then upload.
          </span>
        </div>
      )}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="or paste a picture link (optional)"
          className="flex-1 min-w-0 px-3 py-1.5 bg-white rounded-lg border border-[#DCD9D2] text-xs focus:border-black focus:outline-none"
        />
        <button type="button" onClick={addLink} disabled={!link.trim()} className={btn}>
          <Link2 className="w-3.5 h-3.5" /> Add link
        </button>
      </div>

      <div className="pt-2 border-t border-black/10 space-y-2">
        <span className="text-[11px] font-bold text-[#141413]">Video (optional, 1 video, up to 50 MB) <HelpDot id="seller.product.media" /></span>
        {videoUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            {isVideoFile(videoUrl) ? (
              <video src={videoUrl} controls preload="metadata" className="w-48 max-h-32 bg-black" />
            ) : (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0E7A43] underline break-all">
                {videoUrl}
              </a>
            )}
            <button type="button" onClick={() => onChange({ images, videoUrl: '' })} className={btn}>
              <X className="w-3.5 h-3.5" /> Remove video
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => videoInput.current?.click()} className={btn}>
              <Video className="w-3.5 h-3.5" /> Upload video
            </button>
            <input
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="or paste a YouTube / video link (optional)"
              className="flex-1 min-w-[180px] px-3 py-1.5 bg-white rounded-lg border border-[#DCD9D2] text-xs focus:border-black focus:outline-none"
            />
            <button
              type="button"
              disabled={!videoLink.trim()}
              onClick={() => {
                const u = fixLink(videoLink);
                if (!u) return onError('This does not look like a video link. Copy the full link, or upload the video instead.');
                onChange({ images, videoUrl: u });
                setVideoLink('');
              }}
              className={btn}
            >
              <Link2 className="w-3.5 h-3.5" /> Add link
            </button>
          </div>
        )}
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            addVideo(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};
