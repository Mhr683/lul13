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
const SellerCenterView = lazy(() =>
  import('./components/SellerCenterView').then((m) => ({ default: m.SellerCenterView }))
);
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthPanel } from './components/AuthPanel';
import { Portal, applyPortalBranding, portalFromLocation } from './portalBranding';

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
            Connecting to your account... changes will not be saved until then.
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
            subtitle="The admin panel is only for the store owner and the admins they have added."
            allowSignup={false}
          />
        ) : (
          <div className="space-y-4 text-sm text-[#141413]">
            <h2 className="text-xl font-display">No access</h2>
            <p className="text-xs text-[#575653]">
              You are signed in as <strong>{firebaseUser.email}</strong>, but this account is not an admin.
            </p>
            {usesPassword && !emailVerified && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2.5">
                Admin access requires a verified email. Open the link we emailed you, then press
                &quot;Check again&quot;.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refreshAccount}
                className="px-4 py-2 border border-black/20 text-xs font-semibold cursor-pointer"
              >
                Check again
              </button>
              <button
                type="button"
                onClick={signOut}
                className="px-4 py-2 bg-[#141413] text-white text-xs font-semibold cursor-pointer"
              >
                Logout / sign in with another account
              </button>
            </div>
          </div>
        )}
        <button type="button" onClick={onBack} className="text-xs underline text-[#575653] cursor-pointer">
          ← Back to the store
        </button>
      </div>
    </div>
  );
};

// Three separate parts of the site, each with its own link:
//   /         the store customers shop in
//   /seller   Seller Center for marketplace sellers
//   /admin    the store owner's admin console (old #admin links still open it)
// Each one also installs as its own app (see portalBranding.ts).
const MainRouter: React.FC = () => {
  const [mode, setMode] = useState<Portal>(portalFromLocation);

  useEffect(() => {
    applyPortalBranding(mode);
  }, [mode]);

  // Follow manual address changes and the browser back/forward buttons
  useEffect(() => {
    const sync = () => setMode(portalFromLocation());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
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

  const handleSwitchMode = (newMode: Portal) => {
    setMode(newMode);
    try {
      window.history.pushState(null, '', newMode === 'ADMIN' ? '/admin' : newMode === 'SELLER' ? '/seller' : '/');
      window.scrollTo({ top: 0 });
    } catch {}
  };

  return (
    <div className="relative min-h-screen">
      {mode === 'SELLER' ? (
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] text-sm text-[#575653]">
              Opening Seller Center...
            </div>
          }
        >
          <SellerCenterView />
        </Suspense>
      ) : mode === 'STOREFRONT' ? (
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
                Opening the admin panel...
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
