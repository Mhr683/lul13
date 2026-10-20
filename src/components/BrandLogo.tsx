import React from 'react';

// Anokha Shopping Hub brand: the bag mark (same drawing as public/icon.svg) and the wordmark.
// The first word of the store name is set in Playfair Display italic, the rest in spaced capitals,
// so the logo still works if the store name is changed in the admin settings.

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
    <defs>
      <linearGradient id="anokha-bag" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#E7C985" />
        <stop offset="1" stopColor="#A97E2C" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="#141413" />
    <path d="M17 21h30l4.6 31.5a4 4 0 0 1-4 4.5H16.4a4 4 0 0 1-4-4.5z" fill="url(#anokha-bag)" />
    <path d="M17 21h30l.6 4H16.4z" fill="#8A6522" opacity=".55" />
    <path d="M25.5 26v-9a6.5 6.5 0 0 1 13 0v9" fill="none" stroke="#E7C985" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="25.5" cy="26" r="1.5" fill="#141413" />
    <circle cx="38.5" cy="26" r="1.5" fill="#141413" />
    <path d="M24.5 51 32 33.5 39.5 51" fill="none" stroke="#141413" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M27.4 44.6q4.6 3.6 9.2 0" fill="none" stroke="#141413" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M45.5 31l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#FBFBF9" />
  </svg>
);

export const BrandLogo: React.FC<{
  name?: string;
  /** 'light' for light backgrounds, 'dark' for the black footer / Seller Center bar */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showMark?: boolean;
  className?: string;
}> = ({ name = 'Anokha Shopping Hub', tone = 'light', size = 'md', showMark = true, className = '' }) => {
  const words = name.trim().split(/\s+/);
  const main = words[0] || name;
  const rest = words.slice(1).join(' ');
  const dims = {
    sm: { mark: 28, main: 'text-[20px]', rest: 'text-[7.5px]' },
    md: { mark: 36, main: 'text-[25px] sm:text-[27px]', rest: 'text-[8.5px] sm:text-[9px]' },
    lg: { mark: 48, main: 'text-[34px]', rest: 'text-[11px]' },
  }[size];
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`} aria-label={name}>
      {showMark && <BrandMark size={dims.mark} />}
      <span className="flex flex-col leading-none min-w-0" aria-hidden="true">
        <span
          className={`${dims.main} font-brand italic font-bold tracking-[-0.01em] truncate ${
            tone === 'dark' ? 'text-[#FBFBF9]' : 'text-[#141413]'
          }`}
        >
          {main}
        </span>
        {rest && (
          <span
            className={`${dims.rest} mt-[3px] font-sans font-bold uppercase tracking-[0.34em] truncate ${
              tone === 'dark' ? 'text-[#E7C985]' : 'text-[#86672A]'
            }`}
          >
            {rest}
          </span>
        )}
      </span>
    </span>
  );
};
