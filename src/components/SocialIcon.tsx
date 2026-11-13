import React from 'react';
import type { SocialPlatform } from '../services/socialLinks';

// Small brand-coloured badge for a social platform (no brand logo files needed).
const LOOK: Record<SocialPlatform, { bg: string; text: string; fg?: string }> = {
  FACEBOOK: { bg: '#1877F2', text: 'f' },
  INSTAGRAM: { bg: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', text: 'IG' },
  YOUTUBE: { bg: '#FF0000', text: '▶' },
  TIKTOK: { bg: '#111111', text: '♪' },
  X: { bg: '#000000', text: '𝕏' },
  TELEGRAM: { bg: '#229ED9', text: '✈' },
  WHATSAPP_CHANNEL: { bg: '#25D366', text: 'W' },
  OTHER: { bg: '#6B6963', text: '🔗' },
};

export const SocialIcon: React.FC<{ platform: SocialPlatform; size?: number; className?: string }> = ({ platform, size = 20, className = '' }) => {
  const l = LOOK[platform] || LOOK.OTHER;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-md font-bold text-white shrink-0 leading-none ${className}`}
      style={{ width: size, height: size, background: l.bg, fontSize: Math.round(size * (l.text.length > 1 ? 0.42 : 0.55)) }}
    >
      {l.text}
    </span>
  );
};
