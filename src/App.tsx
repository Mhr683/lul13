/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { StorefrontView } from './components/StorefrontView';

// The admin console is large; loading it on demand keeps it out of every customer's download
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthPanel } from './components/AuthPanel';

// Only signed-in admins can open the admin console; everyone else gets a login / access-denied screen.
const AdminGate: React.FC<{ children: React.ReactNode; onBack: () => void }> = ({ children, onBack }) => {
  const { authReady, firebaseUser, userProfile, isAdmin, emailVerified, signOut, refreshAccount } = useStore();

  // authReady turns true only after the signed-in user's profile/role has been loaded
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] text-sm text-[#575653]">
        Loading...
      </div>
    );
  }

  if (isAdmin) {
    return (
      <>
        {!firebaseUser && (
          <div className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-900 text-xs font-semibold px-4 py-1.5 text-center">
            Account se connect ho raha hai... tab tak tabdeeliyan save nahi hongi.
          </div>
        )}
        {children}
      </>
    );
  }

  const usesPassword = firebaseUser?.providerData.some((p) => p.providerId === 'password');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] p-4">
      <div className="w-full max-w-md bg-white border border-black/10 p-6 sm:p-8 space-y-5">
        {!firebaseUser ? (
          <AuthPanel
            title="Admin login"
            subtitle="Store ka admin panel sirf store owner aur unke banaye hue admins ke liye hai."
            allowSignup={false}
          />
        ) : (
          <div className="space-y-4 text-sm text-[#141413]">
            <h2 className="text-xl font-display">Access nahi hai</h2>
            <p className="text-xs text-[#575653]">
              Aap <strong>{firebaseUser.email}</strong> se login hain, lekin ye account admin nahi hai.
            </p>
            {usesPassword && !emailVerified && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2.5">
                Admin access ke liye email verify hona zaroori hai. Email mein aaya link kholein, phir
                &quot;Dobara check karein&quot; dabayein.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refreshAccount}
                className="px-4 py-2 border border-black/20 text-xs font-semibold cursor-pointer"
              >
                Dobara check karein
              </button>
              <button
                type="button"
                onClick={signOut}
                className="px-4 py-2 bg-[#141413] text-white text-xs font-semibold cursor-pointer"
              >
                Logout / doosre account se login
              </button>
            </div>
          </div>
        )}
        <button type="button" onClick={onBack} className="text-xs underline text-[#575653] cursor-pointer">
          ← Store par wapas jayein
        </button>
      </div>
    </div>
  );
};

const MainRouter: React.FC = () => {
  const [mode, setMode] = useState<'STOREFRONT' | 'ADMIN'>(() => {
    try {
      // The address (#admin / #store) wins over the mode remembered from the last visit
      if (typeof window !== 'undefined' && window.location.hash === '#admin') return 'ADMIN';
      if (typeof window !== 'undefined' && window.location.hash === '#store') return 'STOREFRONT';
      const saved = localStorage.getItem('atelier_app_mode');
      if (saved === 'ADMIN' || saved === 'STOREFRONT') return saved;
    } catch {}
    return 'STOREFRONT';
  });

  // Follow manual address changes and the browser back/forward buttons
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#admin') setMode('ADMIN');
      else if (window.location.hash === '#store' || window.location.hash === '') setMode('STOREFRONT');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [adminInitialTab, setAdminInitialTab] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('atelier_admin_tab') || 'PRODUCTS';
    } catch {
      return 'PRODUCTS';
    }
  });
  const [autoOpenNewProduct, setAutoOpenNewProduct] = useState(false);
  const { toastMessage } = useStore();

  const handleSwitchMode = (newMode: 'STOREFRONT' | 'ADMIN') => {
    setMode(newMode);
    try {
      localStorage.setItem('atelier_app_mode', newMode);
      if (typeof window !== 'undefined') {
        window.location.hash = newMode === 'ADMIN' ? '#admin' : '#store';
      }
    } catch {}
  };

  return (
    <div className="relative min-h-screen">
      {mode === 'STOREFRONT' ? (
        <StorefrontView
          onOpenAdmin={(tab?: string, openNewProduct?: boolean) => {
            const chosenTab = tab || 'PRODUCTS';
            setAdminInitialTab(chosenTab);
            try {
              localStorage.setItem('atelier_admin_tab', chosenTab);
            } catch {}
            setAutoOpenNewProduct(Boolean(openNewProduct));
            handleSwitchMode('ADMIN');
          }}
        />
      ) : (
        <AdminGate onBack={() => handleSwitchMode('STOREFRONT')}>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] text-sm text-[#575653]">
                Admin panel khul raha hai...
              </div>
            }
          >
            <AdminDashboardView
              initialTab={adminInitialTab as any}
              autoOpenNewProduct={autoOpenNewProduct}
              onReturnToStore={() => {
                handleSwitchMode('STOREFRONT');
                setAutoOpenNewProduct(false);
              }}
            />
          </Suspense>
        </AdminGate>
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-5 py-3 bg-[#141413] text-[#FBFBF9] border border-white/15 text-xs font-medium shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <MainRouter />
    </StoreProvider>
  );
}
