import React, { useState } from 'react';
import { Download, Laptop, Smartphone, Apple, CheckCircle2, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';
import { useStore } from '../context/StoreContext';
import { portalAppName, portalFromLocation } from '../portalBranding';

const BANNER_CLOSED_KEY = 'pwa_banner_closed';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'pill' | 'footer' | 'onDark' | 'block';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { settings } = useStore();
  const { isInstallable, isInstalled, isIOS, isAndroid, isDesktop, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  // The strip can be hidden for this visit; it comes back the next time the site is opened
  const [bannerClosed, setBannerClosed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_CLOSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const closeBanner = () => {
    setBannerClosed(true);
    try {
      sessionStorage.setItem(BANNER_CLOSED_KEY, '1');
    } catch {}
  };

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setModalOpen(true);
      }
    } else {
      setModalOpen(true);
    }
  };

  // Get device icon
  const DeviceIcon = isIOS ? Apple : isAndroid ? Smartphone : Laptop;
  const deviceLabel = isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : 'PC / Laptop';
  const storeName = portalAppName(settings?.storeName || 'Store');

  // Top strip on every portal (store, Seller Center, admin), also before signing in
  if (variant === 'banner') {
    if (isInstalled || bannerClosed) return null;
    const portal = portalFromLocation();
    const why =
      portal === 'SELLER' ? 'manage your shop and orders' : portal === 'ADMIN' ? 'run your store' : 'shop in 1 tap';
    return (
      <>
        <div className={`bg-[#141413] text-[#FBFBF9] py-2 pl-3 pr-1.5 sm:px-4 flex items-center justify-between gap-2 text-xs border-b border-white/10 ${className}`}>
          <div className="flex items-center gap-2 min-w-0">
            <DeviceIcon className="w-4 h-4 text-[#C5A059] shrink-0" />
            <span className="leading-snug">
              Get the <strong>{storeName}</strong> app on your {deviceLabel} to {why}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClick}
              className="px-3 py-1.5 bg-[#C5A059] hover:bg-[#D4B36D] text-[#0B0F17] rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
            <button
              type="button"
              onClick={closeBanner}
              aria-label="Hide"
              className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  if (variant === 'footer') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors cursor-pointer ${className}`}
        >
          <DeviceIcon className="w-3.5 h-3.5 text-[#C5A059]" />
          <span>{isInstalled ? '✓ App Installed' : `Install on ${deviceLabel}`}</span>
        </button>
        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  // Seller Center header (dark bar) and admin sidebar (full-width)
  if (variant === 'onDark' || variant === 'block') {
    if (isInstalled) return null;
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          title={`Install ${storeName} on ${deviceLabel}`}
          className={
            variant === 'onDark'
              ? `px-2.5 py-1.5 border border-white/30 text-white text-xs flex items-center gap-1 cursor-pointer hover:bg-white/10 ${className}`
              : `w-full py-2 bg-[#141413] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-black ${className}`
          }
        >
          <Download className="w-3.5 h-3.5" />
          <span className={variant === 'onDark' ? 'hidden sm:inline' : ''}>Install App</span>
        </button>
        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  // Header button (default)
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
          isInstalled
            ? 'bg-black/5 text-[#141413]/70 hover:bg-black/10 border border-black/10'
            : 'bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#73541B] border border-[#C5A059]/40'
        } ${className}`}
        title={`Install ${storeName} on ${deviceLabel}`}
      >
        <DeviceIcon className="w-3.5 h-3.5 text-[#855B14] shrink-0" />
        <span className="hidden sm:inline">
          {isInstalled ? 'Installed' : 'Install App'}
        </span>
        {!isInstalled && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse"></span>
        )}
      </button>
      <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
