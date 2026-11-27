import { useEffect, useRef } from 'react';

// A form or sheet opened inside a tab (e.g. Seller Center's product editor) gets its own history
// entry while it is open, so the phone's back button closes it and stays on the same tab, instead
// of going back to the tab before. Closing it with its own buttons removes that entry again.
export function useBackCloses(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const pushedRef = useRef(false);
  useEffect(() => {
    try {
      if (open && !pushedRef.current) {
        pushedRef.current = true;
        window.history.pushState({ ...(window.history.state || {}), inSite: true, sheet: true }, '', window.location.href);
      } else if (!open && pushedRef.current) {
        pushedRef.current = false;
        if (window.history.state?.sheet) window.history.back();
      }
    } catch {
      /* history is not available: the form still closes with its own buttons */
    }
  }, [open]);
  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current || window.history.state?.sheet) return;
      pushedRef.current = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

// Gives each tab of Seller Center / the admin panel its own history entry, so the phone's back
// button goes to the previous tab instead of closing the app. The first entry of the visit is
// ExitGuard's "leave" marker, which asks before the app is closed.
export function useTabHistory<T extends string>(tab: T, setTab: (t: T) => void, isValid: (t: string) => boolean) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const fromBackRef = useRef(false);
  const firstRef = useRef(true);
  const setTabRef = useRef(setTab);
  setTabRef.current = setTab;
  const isValidRef = useRef(isValid);
  isValidRef.current = isValid;

  useEffect(() => {
    const onPop = () => {
      const st = window.history.state;
      if (st?.exitMarker) return;
      const t = st?.tab;
      if (typeof t === 'string' && t !== tabRef.current && isValidRef.current(t)) {
        fromBackRef.current = true;
        setTabRef.current(t as T);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    try {
      if (firstRef.current) {
        // The entry the app opened on remembers its tab (ExitGuard copies it when it adds the marker)
        firstRef.current = false;
        window.history.replaceState({ ...(window.history.state || {}), tab }, '');
        return;
      }
      if (fromBackRef.current) {
        fromBackRef.current = false;
        return;
      }
      if (window.history.state?.tab === tab) return;
      window.history.pushState({ inSite: true, tab }, '', window.location.href);
    } catch {
      /* history is not available (very old browser): tabs still work, only back does not */
    }
  }, [tab]);
}
