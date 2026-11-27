import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { smallImage, smallImageSet } from '../services/imageUrl';

interface ProductImageProps {
  src?: string;
  alt: string;
  category?: string;
  className?: string;
  /** Pictures seen as soon as the page opens (the first slide): loaded first, not lazily */
  eager?: boolean;
  /** How wide the picture shows (for picking the right copy); default: a product card */
  sizes?: string;
  /** Widths of the small copies to offer */
  widths?: number[];
}

// A small WebP copy the size of the card is shown (services/imageUrl.ts). If the copy cannot load,
// the original picture is tried, and only then the placeholder.
export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  category = 'Product',
  className = 'w-full h-full object-cover',
  eager = false,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  widths = [320, 480, 640],
}) => {
  // 0 = small copy, 1 = original picture, 2 = placeholder
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [src]);

  if (!src || stage >= 2) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F4F3EF] text-[#575653] p-6 text-center select-none ${className}`}
      >
        <Package className="w-7 h-7 stroke-[1.25] mb-2 text-[#8C6D46]" />
        <span className="text-xs tracking-wide font-medium text-[#141413] line-clamp-1">
          {alt}
        </span>
        <span className="text-[11px] text-[#787774] mt-0.5">{category}</span>
      </div>
    );
  }

  const set = stage === 0 ? smallImageSet(src, widths) : undefined;
  return (
    <img
      key={stage}
      src={set ? smallImage(src, widths[Math.min(1, widths.length - 1)]) : src}
      srcSet={set}
      sizes={set ? sizes : undefined}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setStage(set ? 1 : 2)}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
    />
  );
};
