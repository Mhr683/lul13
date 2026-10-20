import React, { useId } from 'react';

// Anokha Shopping Hub brand: the bird carrying a shopping bag (same drawing as
// public/brand-mark.svg) and the wordmark: the first word of the store name in green
// Poppins ExtraBold, the rest in spaced orange capitals, so the logo still works if the store name
// is changed in the admin settings.

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = '' }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 140 100"
      width={size * 1.4}
      height={size}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0B7A3E" />
          <stop offset="1" stopColor="#2BC774" />
        </linearGradient>
        <linearGradient id={`${id}o`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F0612C" />
          <stop offset="1" stopColor="#FFB347" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22B865" />
          <stop offset="1" stopColor="#0B7A3E" />
        </linearGradient>
      </defs>
      <path d="M16 78 C6 50 18 22 40 6 C38 30 46 50 66 62 C52 74 34 80 16 78 Z" fill={`url(#${id}g)`} />
      <path d="M36 84 C42 54 58 26 88 10 C80 32 82 50 92 62 C76 76 56 84 36 84 Z" fill={`url(#${id}o)`} />
      <path d="M84 50 C88 38 100 34 108 40 L118 42 L108 46 C104 56 92 62 80 60 Z" fill={`url(#${id}o)`} />
      <circle cx="101" cy="42" r="1.8" fill="#fff" />
      <line x1="114" y1="45" x2="114" y2="55" stroke="#F0612C" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M109 62 v-3 a5 4.5 0 0 1 10 0 v3" fill="none" stroke="#0B7A3E" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M103 61 h22 l3 21 a3 3 0 0 1 -3 3.4 h-22 a3 3 0 0 1 -3 -3.4 z" fill={`url(#${id}b)`} />
      <path d="M103 61 h22 l.5 3.5 h-23 z" fill="#075A2D" opacity=".5" />
      <path d="M107.5 73 q6.5 5 13 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
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
  const words = name.trim().split(/\s+/);
  const main = words[0] || name;
  const rest = words.slice(1).join(' ');
  const dims = {
    sm: { mark: 26, main: 'text-[19px]', rest: 'text-[7px]' },
    md: { mark: 32, main: 'text-[22px] sm:text-[25px]', rest: 'text-[7.5px] sm:text-[8.5px]' },
    lg: { mark: 44, main: 'text-[32px]', rest: 'text-[11px]' },
  }[size];
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`} aria-label={name}>
      {showMark && <BrandMark size={dims.mark} />}
      <span className="flex flex-col leading-none min-w-0" aria-hidden="true">
        <span
          className={`${dims.main} font-brand font-extrabold uppercase tracking-[0.02em] truncate ${
            tone === 'dark' ? 'text-[#2BC774]' : 'text-[#0B7A3E]'
          }`}
        >
          {main}
        </span>
        {rest && (
          <span
            className={`${dims.rest} mt-[3px] font-brand font-bold uppercase tracking-[0.3em] truncate ${
              tone === 'dark' ? 'text-[#FFB347]' : 'text-[#F07A2A]'
            }`}
          >
            {rest}
          </span>
        )}
      </span>
    </span>
  );
};
