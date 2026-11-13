import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ExternalLink, LogOut, Menu, MoreHorizontal, ShieldCheck, UserCog, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { SellerAvatar } from './SellerAvatar';
import { PWAInstallButton } from './PWAInstallButton';
import { HelpDot } from './HelpDot';

// The frame of Seller Center once a shop is approved: a grouped sidebar on computers, a bottom bar
// and a drawer on phones, a top bar with the shop menu and notifications, and a page header with the
// title, a one-line explanation and the page's "?" guide. The pages themselves stay as they are.

export interface ShellTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}
export interface ShellGroup {
  label: string;
  tabs: ShellTab[];
}

export const SellerShell: React.FC<{
  storeName: string;
  shopName: string;
  shopLogo?: string | null;
  shopUrl: string;
  storeUrl: string;
  subtitle: React.ReactNode;
  groups: ShellGroup[];
  /** The 4 tabs on the phone's bottom bar (the 5th button opens the full menu) */
  mobileTabs: string[];
  active: string;
  onTab: (id: string) => void;
  page: { title: string; description: string; help?: string };
  unread: number;
  /** Small controls shown in the top bar before the bell (e.g. the sound on/off switch) */
  topExtra?: React.ReactNode;
  onSignOut: () => void;
  banner?: React.ReactNode;
  children: React.ReactNode;
}> = (p) => {
  const [drawer, setDrawerState] = useState(false);
  // A tap that opens the menu must not also close it (some phones send a second click)
  const openedAt = useRef(0);
  const setDrawer = (open: boolean) => {
    if (open) openedAt.current = Date.now();
    else if (Date.now() - openedAt.current < 350) return;
    setDrawerState(open);
  };
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const all = p.groups.flatMap((g) => g.tabs);
  const go = (id: string) => {
    p.onTab(id);
    setDrawerState(false);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const Nav = ({ onPick }: { onPick: (id: string) => void }) => (
    <nav className="space-y-5">
      {p.groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#8A8780]">{g.label}</div>
          <div className="space-y-0.5">
            {g.tabs.map((t) => {
              const Icon = t.icon;
              const on = p.active === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPick(t.id)}
                  className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors ${
                    on ? 'bg-[#E8F3EC] text-[#0B5E34]' : 'text-[#3A3936] hover:bg-[#F2F1EC]'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      on ? 'bg-[#0E7A43] text-white' : 'bg-[#F2F1EC] text-[#575653] group-hover:bg-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 text-left truncate">{t.label}</span>
                  {!!t.badge && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const ShopCard = () => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F7F6F2] border border-[#E7E5DF]">
      <SellerAvatar src={p.shopLogo} name={p.shopName} size={40} className="border border-black/10" />
      <div className="min-w-0">
        <div className="text-[13px] font-bold truncate">{p.shopName}</div>
        <a href={p.shopUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[#0E7A43] inline-flex items-center gap-1">
          View my shop <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );

  return (
    <div className="seller-ui min-h-screen bg-[#F6F5F1] text-[#141413]">
      {/* ------------------------------------------------ top bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#E7E5DF]">
        <div className="h-14 px-3 sm:px-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setDrawer(true)}
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#F2F1EC] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <BrandLogo name={p.storeName} size="sm" />
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#0E7A43] text-white text-[10px] font-bold uppercase tracking-wider">
              Seller Center
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden md:block">
              <PWAInstallButton />
            </div>
            <a
              href={p.storeUrl}
              className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3A3936] hover:bg-[#F2F1EC]"
            >
              Store <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {p.topExtra}
            <button
              type="button"
              aria-label="Messages and notices"
              onClick={() => go('MESSAGES')}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#F2F1EC] cursor-pointer"
            >
              <Bell className="w-5 h-5 text-[#3A3936]" />
              {p.unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {p.unread}
                </span>
              )}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenu(!menu)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-[#F2F1EC] cursor-pointer"
              >
                <SellerAvatar src={p.shopLogo} name={p.shopName} size={30} className="border border-black/10" />
                <span className="hidden sm:block max-w-[140px] truncate text-xs font-bold">{p.shopName}</span>
                <ChevronDown className="w-4 h-4 text-[#8A8780]" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-[#E7E5DF] shadow-xl p-2 text-[13px] z-50">
                  <div className="px-2 py-2 border-b border-[#EFEDE8] mb-1">
                    <div className="font-bold truncate">{p.shopName}</div>
                    <div className="text-[11px] text-[#8A8780]">{p.subtitle}</div>
                  </div>
                  <a href={p.shopUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#F2F1EC]">
                    <ExternalLink className="w-4 h-4" /> View my shop
                  </a>
                  <button type="button" onClick={() => go('PROFILE')} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#F2F1EC] cursor-pointer">
                    <UserCog className="w-4 h-4" /> Profile & payout
                  </button>
                  <button type="button" onClick={() => go('RULES')} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#F2F1EC] cursor-pointer">
                    <ShieldCheck className="w-4 h-4" /> Seller rules
                  </button>
                  <button
                    type="button"
                    onClick={p.onSignOut}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ------------------------------------------------ sidebar (computers) */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto bg-white border-r border-[#E7E5DF] p-3 gap-4">
          <ShopCard />
          <Nav onPick={go} />
        </aside>

        {/* ------------------------------------------------ page */}
        <main className="flex-1 min-w-0 pb-24 lg:pb-10">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  {p.page.title} {p.page.help && <HelpDot id={p.page.help} />}
                </h1>
                {p.page.description && <p className="text-[13px] text-[#6B6963] mt-0.5">{p.page.description}</p>}
              </div>
            </div>
            {p.banner}
            {p.children}
          </div>
        </main>
      </div>

      {/* ------------------------------------------------ bottom bar (phones) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E7E5DF] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {p.mobileTabs.map((id) => {
            const t = all.find((x) => x.id === id);
            if (!t) return null;
            const Icon = t.icon;
            const on = p.active === id;
            return (
              <button key={id} type="button" onClick={() => go(id)} className="relative flex flex-col items-center gap-0.5 py-2 cursor-pointer">
                <span className={`w-10 h-7 rounded-full flex items-center justify-center ${on ? 'bg-[#E8F3EC] text-[#0B5E34]' : 'text-[#6B6963]'}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className={`text-[10.5px] max-[360px]:text-[9.5px] max-w-full px-0.5 truncate font-semibold ${on ? 'text-[#0B5E34]' : 'text-[#6B6963]'}`}>{t.label}</span>
                {!!t.badge && (
                  <span className="absolute top-1 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 cursor-pointer">
            <span
              className={`w-10 h-7 rounded-full flex items-center justify-center ${
                !p.mobileTabs.includes(p.active) ? 'bg-[#E8F3EC] text-[#0B5E34]' : 'text-[#6B6963]'
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className={`text-[10.5px] font-semibold ${!p.mobileTabs.includes(p.active) ? 'text-[#0B5E34]' : 'text-[#6B6963]'}`}>More</span>
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------ drawer (phones) */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setDrawer(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-[84%] max-w-[320px] bg-white shadow-2xl p-3 overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <BrandLogo name={p.storeName} size="sm" />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawer(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#F2F1EC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ShopCard />
            <Nav onPick={go} />
            <div className="pt-2 border-t border-[#EFEDE8] space-y-1">
              <PWAInstallButton />
              <button
                type="button"
                onClick={p.onSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
