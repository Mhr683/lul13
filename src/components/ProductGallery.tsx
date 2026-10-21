import React, { useEffect, useMemo, useState } from 'react';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';

// Product page gallery: the big picture (zooms where the mouse points, tap opens full screen),
// a row of thumbnails for every picture, and the product video when the seller added one.

const youTubeId = (url: string) => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : '';
};
const isVideoFile = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url) || /\/o\/products%2F[^?]+\.(mp4|webm|mov)/i.test(url);

type Slide = { kind: 'image'; src: string } | { kind: 'video'; src: string; youTube: string };

export const ProductGallery: React.FC<{
  images?: string[];
  primaryImage?: string;
  videoUrl?: string;
  alt: string;
  fallback: React.ReactNode;
}> = ({ images, primaryImage, videoUrl, alt, fallback }) => {
  const slides = useMemo<Slide[]>(() => {
    const pics = Array.from(new Set([...(images || []), ...(primaryImage ? [primaryImage] : [])].filter(Boolean))).slice(0, 8);
    const list: Slide[] = pics.map((src) => ({ kind: 'image', src }));
    if (videoUrl && (youTubeId(videoUrl) || isVideoFile(videoUrl))) list.push({ kind: 'video', src: videoUrl, youTube: youTubeId(videoUrl) });
    return list;
  }, [images, primaryImage, videoUrl]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => setIndex(0), [slides]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % slides.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + slides.length) % slides.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, slides.length]);

  const current = slides[Math.min(index, slides.length - 1)];
  if (!current || (current.kind === 'image' && slides.length === 1 && broken[current.src])) {
    return <div className="aspect-[4/3] w-full bg-[#F7F6F2] border border-black/[0.07] overflow-hidden">{fallback}</div>;
  }

  const video = (s: Extract<Slide, { kind: 'video' }>, big = false) =>
    s.youTube ? (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${s.youTube}`}
        title={`${alt} video`}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    ) : (
      <video src={s.src} controls playsInline preload="metadata" className={`w-full h-full ${big ? 'object-contain' : 'object-contain bg-black'}`} />
    );

  const step = (dir: 1 | -1) => setIndex((i) => (i + dir + slides.length) % slides.length);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full bg-[#F7F6F2] border border-black/[0.07] overflow-hidden">
        {current.kind === 'image' ? (
          <img
            src={current.src}
            alt={alt}
            onError={() => setBroken((b) => ({ ...b, [current.src]: true }))}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            onClick={() => setFull(true)}
            style={zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            className="w-full h-full object-contain cursor-zoom-in transition-transform duration-150"
          />
        ) : (
          video(current)
        )}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono">
              {index + 1}/{slides.length}
            </span>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <button
              key={`${s.kind}-${s.src}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={s.kind === 'video' ? 'Play video' : `Picture ${i + 1}`}
              className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 border-2 overflow-hidden bg-[#F7F6F2] cursor-pointer ${
                i === index ? 'border-[#0E7A43]' : 'border-transparent hover:border-black/30'
              }`}
            >
              {s.kind === 'image' ? (
                <img src={s.src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <>
                  {s.youTube ? (
                    <img src={`https://i.ytimg.com/vi/${s.youTube}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <video src={`${s.src}#t=0.5`} muted preload="metadata" className="w-full h-full object-cover" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-6 h-6 text-white" fill="currentColor" />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {full && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setFull(false)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 text-white cursor-pointer" onClick={() => setFull(false)}>
            <X className="w-7 h-7" />
          </button>
          {slides.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 text-white cursor-pointer"
              >
                <ChevronLeft className="w-9 h-9" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 text-white cursor-pointer"
              >
                <ChevronRight className="w-9 h-9" />
              </button>
            </>
          )}
          <div className="w-[92vw] h-[82vh]" onClick={(e) => e.stopPropagation()}>
            {current.kind === 'image' ? <img src={current.src} alt={alt} className="w-full h-full object-contain" /> : video(current, true)}
          </div>
        </div>
      )}
    </div>
  );
};
