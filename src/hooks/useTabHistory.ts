import { useEffect, useRef } from 'react';

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
