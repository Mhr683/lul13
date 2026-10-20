import React, { useEffect, useState } from 'react';

// Seller shop picture, or the shop's initials when there is none (or it fails to load)
export const SellerAvatar: React.FC<{ src?: string | null; name: string; size?: number; className?: string }> = ({
  src,
  name,
  size = 40,
  className = '',
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return src && !broken ? (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      referrerPolicy="no-referrer"
      className={`rounded-full object-cover shrink-0 bg-[#F4F3EF] ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`rounded-full shrink-0 bg-[#9A3412] text-white font-bold flex items-center justify-center ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || 'S'}
    </span>
  );
};
