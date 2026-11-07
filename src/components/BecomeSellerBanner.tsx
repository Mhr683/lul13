import React from 'react';
import { Store, ArrowRight, BadgePercent, Wallet, Truck, Smartphone } from 'lucide-react';
import type { StoreSettings } from '../types/store';
import { DEFAULT_NEW_SELLER_FREE_DAYS } from '../services/promotions';

// Invites every customer to open their own shop. The button opens the Seller Center welcome page
// (sign-up), on its own address (seller.<domain>) when the store runs on its domain.

export const sellerCenterUrl = () => {
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '/seller';
  return `${window.location.protocol}//seller.${host.replace(/^(www|seller|admin)\./, '')}/`;
};

export const BecomeSellerBanner: React.FC<{ settings: StoreSettings }> = ({ settings }) => {
  // Admin → Settings → Home page & store texts can hide it or change its texts
  if (settings.sellerBannerHidden) return null;
  const storeName = settings.storeName || 'our store';
  const title = settings.sellerBannerTitle?.trim() || `Open your own shop on ${storeName}`;
  const text =
    settings.sellerBannerText?.trim() ||
    'Apna kaam shuru karein — ghar baithe apne products bechein aur har order par kamaayein. Customers across Pakistan, one free account.';
  const button = settings.sellerBannerButton?.trim() || "Start selling — it's free";
  // The same offer the server applies to new sellers' orders (server.ts, newSellerFreeDays)
  const freeDays = Math.max(0, Number(settings.newSellerFreeDays ?? DEFAULT_NEW_SELLER_FREE_DAYS));
  const perks = [
    { icon: BadgePercent, title: freeDays > 0 ? `0% commission for ${freeDays} days` : 'No monthly fee', text: 'Start selling at no cost' },
    { icon: Wallet, title: 'Free account', text: 'No monthly fee, only a small commission per sale' },
    { icon: Truck, title: 'We collect the cash', text: 'Cash on Delivery collected and paid to your bank' },
    { icon: Smartphone, title: 'Run it from your phone', text: 'Orders, tracking and earnings in one app' },
  ];

  return (
    <section className="max-w-[1360px] mx-auto px-3 sm:px-6 pt-5">
      <a
        href={sellerCenterUrl()}
        className="group block relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3D2A] via-[#0E5A3C] to-[#0E7A43] text-white shadow-lg"
      >
        {/* soft gold glow */}
        <div className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full bg-[#C5A059]/25 blur-3xl" />
        <div className="relative p-5 max-[380px]:p-4 sm:p-7 lg:p-8 grid lg:grid-cols-[1.1fr_1fr] gap-6 max-[380px]:gap-4 items-center">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C5A059] text-[#0B0F17] text-[11px] font-bold uppercase tracking-wider">
              <Store className="w-3.5 h-3.5" /> Become a seller
            </span>
            <h2 className="text-2xl max-[380px]:text-xl sm:text-3xl lg:text-4xl font-display font-semibold leading-tight">
              {title}
            </h2>
            <p className="text-sm sm:text-base text-white/85 whitespace-pre-line">{text}</p>
            <span className="inline-flex items-center gap-2 mt-1 px-5 py-3 rounded-full bg-white text-[#0B3D2A] text-sm font-bold shadow-md group-hover:bg-[#F4E6C3] transition-colors">
              {button} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {perks.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl bg-white/10 border border-white/15 p-3 sm:p-4 backdrop-blur-sm">
                <Icon className="w-5 h-5 text-[#E5C98A] mb-1.5" />
                <div className="text-xs sm:text-sm font-bold leading-snug">{title}</div>
                <div className="text-[11px] sm:text-xs text-white/75 leading-snug mt-0.5">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </a>
    </section>
  );
};
