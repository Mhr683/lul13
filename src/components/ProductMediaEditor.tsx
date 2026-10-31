import React, { useRef, useState } from 'react';
import { ImagePlus, Video, X, Star, ArrowLeft, ArrowRight, Link2 } from 'lucide-react';

// Pictures (up to 8, the first is the main one shown on product cards) and one optional video for a
// product in Seller Center. Files are uploaded through `upload`; links (https://...) can be pasted too.

export const MAX_IMAGES = 8;

// Large phone photos are shrunk in the browser (longest side 1600 px, JPEG) before upload
async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < 350 * 1024 || file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
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
}> = ({ images, videoUrl, onChange, upload, onError }) => {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  const [videoLink, setVideoLink] = useState('');

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

  const btn = 'px-3 py-1.5 border border-black/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-black disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-[#141413]">
          Pictures ({images.length}/{MAX_IMAGES}) · the first one is the main picture
        </span>
        {busy && <span className="text-[11px] text-[#0E7A43] font-semibold">{busy}</span>}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {images.map((src, i) => (
          <div key={src} className={`relative aspect-square border ${i === 0 ? 'border-[#0E7A43] border-2' : 'border-black/15'} bg-[#F7F6F2]`}>
            <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
            {i === 0 && (
              <span className="absolute left-0 top-0 px-1 bg-[#0E7A43] text-white text-[9px] font-bold">MAIN</span>
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
        ))}
        {images.length < MAX_IMAGES && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => photoInput.current?.click()}
            className="aspect-square border-2 border-dashed border-black/20 flex flex-col items-center justify-center gap-1 text-[10px] text-[#575653] hover:border-black cursor-pointer disabled:opacity-50"
          >
            <ImagePlus className="w-5 h-5" />
            Add
          </button>
        )}
      </div>
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
          className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-black/20 text-xs focus:border-black focus:outline-none"
        />
        <button type="button" onClick={addLink} disabled={!link.trim()} className={btn}>
          <Link2 className="w-3.5 h-3.5" /> Add link
        </button>
      </div>

      <div className="pt-2 border-t border-black/10 space-y-2">
        <span className="text-[11px] font-bold text-[#141413]">Video (optional, 1 video, up to 50 MB)</span>
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
              className="flex-1 min-w-[180px] px-3 py-1.5 bg-white border border-black/20 text-xs focus:border-black focus:outline-none"
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
