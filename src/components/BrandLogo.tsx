import React from 'react';
import { useOptionalSettings } from '../context/StoreContext';

// Anokha Shopping Hub brand: the green "AS" ribbon monogram (public/brand-mark.svg, vectorised from
// the approved logo) and the wordmark. The first word of the store name is set in green Montserrat
// ExtraBold capitals, the rest in smaller dark-green capitals, so the logo still works if the store
// name is changed in the admin settings. The full logo with text is public/brand-logo.svg.
// A logo uploaded in Admin → Store settings (settings.logoUrl) replaces the monogram; when it
// already contains the name (settings.logoHasName), the text next to it is left out.

const MARK_RATIO = 250.65 / 179.34;

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => {
  const settings = useOptionalSettings();
  if (settings?.logoUrl) {
    return (
      <img
        src={settings.logoUrl}
        alt=""
        aria-hidden="true"
        height={size}
        style={{ height: size, width: 'auto', maxWidth: size * 4 }}
        className={`shrink-0 select-none object-contain ${className}`}
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/brand-mark.svg"
      alt=""
      aria-hidden="true"
      width={Math.round(size * MARK_RATIO)}
      height={size}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
};

export const BrandLogo: React.FC<{
  name?: string;
  /** 'light' for light backgrounds, 'dark' for the black footer / Seller Center bar */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showMark?: boolean;
  className?: string;
}> = ({ name = 'Anokha Shopping Hub', tone = 'light', size = 'md', showMark = true, className = '' }) => {
  const settings = useOptionalSettings();
  const words = name.trim().split(/\s+/);
  const main = words[0] || name;
  const rest = words.slice(1).join(' ');
  const dims = {
    // Very narrow phones (or a big phone font, e.g. Oppo A5s): a little smaller so the whole name fits
    sm: { mark: 24, main: 'text-[18px] max-[360px]:text-[15px]', rest: 'text-[7.5px] max-[360px]:text-[6.5px]' },
    md: { mark: 30, main: 'text-[21px] sm:text-[24px]', rest: 'text-[8px] sm:text-[9px]' },
    lg: { mark: 42, main: 'text-[30px]', rest: 'text-[11.5px]' },
  }[size];
  // An uploaded logo that already shows the name: the picture alone, a little taller
  if (settings?.logoUrl && settings.logoHasName) {
    return (
      <span className={`inline-flex items-center min-w-0 ${className}`} aria-label={name}>
        <BrandMark size={Math.round(dims.mark * 1.5)} />
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`} aria-label={name}>
      {showMark && <BrandMark size={dims.mark} className={size === 'sm' ? 'max-[360px]:h-5 max-[360px]:w-auto' : ''} />}
      <span className="flex flex-col leading-none min-w-0" aria-hidden="true">
        <span
          className={`${dims.main} font-brand font-extrabold uppercase tracking-[0.01em] truncate ${
            tone === 'dark' ? 'text-[#34C77B]' : 'text-[#0E7A43]'
          }`}
        >
          {main}
        </span>
        {rest && (
          <span
            className={`${dims.rest} mt-[3px] font-brand font-bold uppercase tracking-[0.14em] truncate ${
              tone === 'dark' ? 'text-[#BFEFD3]' : 'text-[#0B6236]'
            }`}
          >
            {rest}
          </span>
        )}
      </span>
    </span>
  );
};
