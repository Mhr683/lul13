import React, { useEffect, useRef, useState } from 'react';

// Asks "Leave ...?" when the phone's back button would close Seller Center or the admin panel.
// The first history entry becomes a "leave" marker with the real entry on top. Chrome's back button
// skips entries a page adds before the visitor has touched it, so the marker is added on the first tap.
// (The store has the same guard inside StorefrontView, together with its page-by-page back button.)
export const ExitGuard: React.FC<{ appName: string }> = ({ appName }) => {
  const [open, setOpen] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const events = ['pointerup', 'touchend', 'keydown', 'click'] as const;
    const arm = () => {
      events.forEach((n) => window.removeEventListener(n, arm, true));
      const st = window.history.state;
      if (st?.inSite || st?.exitMarker) return;
      const href = window.location.href;
      window.history.replaceState({ exitMarker: true }, '', href);
      window.history.pushState({ ...(st || {}), inSite: true }, '', href);
    };
    events.forEach((n) => window.addEventListener(n, arm, true));
    const onPop = () => {
      if (window.history.state?.exitMarker && !leavingRef.current) setOpen(true);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      events.forEach((n) => window.removeEventListener(n, arm, true));
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const stay = () => {
    setOpen(false);
    // Puts the entry back on top of the marker (done on a tap, so Chrome keeps it)
    if (window.history.state?.exitMarker) {
      window.history.pushState({ inSite: true }, '', window.location.href);
    }
  };
  const leave = () => {
    leavingRef.current = true;
    setOpen(false);
    // From the marker to the page before; an installed app closes
    window.history.back();
    setTimeout(() => {
      window.close();
      leavingRef.current = false;
    }, 600);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={stay}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white max-w-sm w-full p-6 rounded-xl shadow-2xl text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-semibold text-[#141413]">Leave {appName}?</p>
        <p className="text-sm text-[#575653]">Kya aap waqai bahar jana chahte hain?</p>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            autoFocus
            onClick={stay}
            className="flex-1 py-3 rounded-lg bg-[#1a7f4b] text-white text-sm font-semibold cursor-pointer"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={leave}
            className="flex-1 py-3 rounded-lg border border-black/20 text-[#141413] text-sm font-semibold cursor-pointer"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};
