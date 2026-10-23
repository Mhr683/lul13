import React, { useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';

// Customer photos / videos attached to a review: small thumbnails, tap to see full size.

export const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);

export const ReviewMediaStrip: React.FC<{ media?: string[] }> = ({ media }) => {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!media || !media.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2 pt-1">
        {media.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setOpen(u)}
            aria-label={isVideoUrl(u) ? 'Play customer video' : 'View customer photo'}
            className="relative w-16 h-16 sm:w-20 sm:h-20 border border-black/10 bg-[#F7F6F2] overflow-hidden cursor-zoom-in"
          >
            {isVideoUrl(u) ? (
              <>
                <video src={`${u}#t=0.5`} muted preload="metadata" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="w-5 h-5 text-white" fill="currentColor" />
                </span>
              </>
            ) : (
              <img src={u} alt="Customer photo" loading="lazy" className="w-full h-full object-cover" />
            )}
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Close" className="absolute top-4 right-4 text-white cursor-pointer" onClick={() => setOpen(null)}>
            <X className="w-7 h-7" />
          </button>
          <div className="max-w-[92vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {isVideoUrl(open) ? (
              <video src={open} controls autoPlay playsInline className="max-w-[92vw] max-h-[85vh]" />
            ) : (
              <img src={open} alt="Customer photo" className="max-w-[92vw] max-h-[85vh] object-contain" />
            )}
          </div>
        </div>
      )}
    </>
  );
};
