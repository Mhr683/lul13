import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';

export interface AuthResult {
  ok: boolean;
  message?: string;
}

// Turns Firebase Auth error codes into short messages a customer can act on
function friendlyAuthError(error: any): string {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Email ghalat hai. Sahi email likhein.';
    case 'auth/missing-password':
      return 'Password likhein.';
    case 'auth/weak-password':
      return 'Password kam az kam 6 characters ka hona chahiye.';
    case 'auth/email-already-in-use':
      return 'Is email se account pehle se bana hua hai. Login karein ya "Password bhool gaye" dabayein.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Email ya password ghalat hai.';
    case 'auth/too-many-requests':
      return 'Bohat zyada koshishein ho gayi hain. Thori der baad dobara try karein.';
    case 'auth/user-disabled':
      return 'Ye account band kar diya gaya hai.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login window band kar di gayi.';
    case 'auth/network-request-failed':
      return 'Internet connection check karein aur dobara try karein.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Ye login tareeqa abhi store mein chalu nahi hai. Store owner Firebase Authentication mein ise enable karein.';
    case 'auth/unauthorized-domain':
      return 'Ye website ka domain Firebase mein authorized nahi hai. Store owner ise Authorized domains mein add karein.';
    default:
      return error?.message || 'Login nahi ho saka. Dobara try karein.';
  }
}
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  UserProfile,
  Product,
  Category,
  CartItem,
  Order,
  Coupon,
  Review,
  AuditLog,
  AITask,
  StoreNotification,
  StoreSettings,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderShipment,
  ProductPrivate,
  OrderPrivate,
} from '../types/store';
import { generateCourierTrackingUrl } from '../services/shippingService';
import { INITIAL_SETTINGS } from '../data/seedData';
import { isBuiltInOwnerEmail } from '../config/owners';
import {
  splitProductPrivate,
  mergeProductPrivate,
  mergeOrderPrivate,
  splitOrderItemsPrivate,
} from '../services/privateData';
import {
  PaymentGatewayService,
  sanitizeDocId,
  sanitizeSku,
  sanitizeSlug,
} from '../services/abstractions';
import { ShippingCalculationService } from '../services/shippingService';

interface StoreContextValue {
  // Auth
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
  signInWithGoogle: () => Promise<AuthResult>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  resendVerificationEmail: () => Promise<AuthResult>;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;

  // Store Data
  products: Product[];
  categories: Category[];
  coupons: Coupon[];
  reviews: Review[];
  orders: Order[];
  auditLogs: AuditLog[];
  aiTasks: AITask[];
  notifications: StoreNotification[];
  settings: StoreSettings;

  // Cart & Wishlist
  cart: CartItem[];
  wishlist: string[];
  appliedCoupon: Coupon | null;
  addToCart: (product: Product, quantity?: number, variantLabel?: string) => void;
  removeFromCart: (productId: string, variantLabel?: string) => void;
  updateCartQuantity: (productId: string, quantity: number, variantLabel?: string) => void;
  clearCart: () => void;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  toggleWishlist: (productId: string) => void;

  // Storefront & Admin Operations
  placeOrder: (payload: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    destCountryIso?: string;
    shippingAddressSummary: string;
    shippingMethodId: string;
    shippingFee: number;
    paymentMethod: PaymentMethod;
    paymentSubMethod?: string;
    paymentReference?: string;
    paymentProofDetails?: string;
    district?: string;
    tehsil?: string;
    stateProvince?: string;
    postalCode?: string;
    countryName?: string;
    notes?: string;
    isQuoteRequest?: boolean;
    directAutoDebit?: boolean;
    authCredentials?: {
      accountNumber?: string;
      pinOrPassword?: string;
      authType?: 'MPIN' | 'PASSWORD' | 'OTP' | '3DS';
      verified?: boolean;
    };
  }) => Promise<Order>;
  verifyManualPayment: (orderId: string, action: 'APPROVE' | 'REJECT', note?: string) => Promise<void>;
  updateShippingQuote: (orderId: string, payload: {
    quoteAmount: number;
    quoteCourier: string;
    quoteEstimatedDays: string;
    quoteCustomsMode: 'DAP' | 'DDP' | 'NOT_APPLICABLE';
    quoteAdminNotes?: string;
  }) => Promise<void>;
  acceptOrRejectShippingQuote: (orderId: string, accept: boolean) => Promise<void>;
  submitReview: (payload: {
    productId: string;
    productName: string;
    rating: number;
    title: string;
    comment: string;
  }) => Promise<void>;

  // Admin & AI Mutators (Persisted to Firestore + Audit Log)
  saveProduct: (product: Partial<Product> & { name: string; price: number; category: string }, actionLabel?: string) => Promise<Product>;
  importProductsBatch: (items: Product[]) => Promise<{ count: number }>;
  removeProduct: (productId: string) => Promise<void>;
  saveCategory: (cat: Partial<Category> & { name: string }) => Promise<Category>;
  adjustInventory: (productId: string, newStock: number, reason?: string) => Promise<void>;
  updateOrderState: (orderId: string, status: OrderStatus, trackingNumber?: string, courierName?: string) => Promise<void>;
  confirmOrder: (orderId: string) => Promise<void>;
  cancelFakeOrder: (orderId: string, reason?: string) => Promise<void>;
  addOrUpdateOrderShipment: (
    orderId: string,
    shipment: Partial<OrderShipment> & { courierName: string; trackingNumber: string }
  ) => Promise<void>;
  saveCoupon: (coupon: Partial<Coupon> & { code: string; type: Coupon['type']; value: number }) => Promise<Coupon>;
  deleteCouponById: (couponId: string) => Promise<void>;
  moderateReview: (reviewId: string, status: Review['status']) => Promise<void>;
  updateStoreSettings: (updated: Partial<StoreSettings>) => Promise<void>;
  recordAuditLog: (action: string, resource: string, details?: string) => Promise<void>;
  createOrUpdateAITask: (task: Partial<AITask> & { id: string; name: string; toolName: string }) => Promise<AITask>;
  markNotificationRead: (notificationId: string) => Promise<void>;

  // Active Context for AI Memory
  selectedAdminProduct: Product | null;
  setSelectedAdminProduct: (p: Product | null) => void;
  selectedAdminOrder: Order | null;
  setSelectedAdminOrder: (o: Order | null) => void;
  cancelAITask: (taskId: string) => Promise<void>;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const CART_STORAGE_KEY = 'store_cart_v1';
const WISHLIST_STORAGE_KEY = 'store_wishlist_v1';
const PRODUCTS_STORAGE_KEY = 'store_products_v2';
const CATEGORIES_STORAGE_KEY = 'store_categories_v2';
const SETTINGS_STORAGE_KEY = 'store_settings_config';

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  // Admin-only supplier/cost data, merged into products and orders for admins only
  const [productPrivate, setProductPrivate] = useState<Record<string, ProductPrivate>>({});
  const [orderPrivate, setOrderPrivate] = useState<Record<string, OrderPrivate>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return saved ? { ...INITIAL_SETTINGS, ...JSON.parse(saved) } : INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [selectedAdminProduct, setSelectedAdminProduct] = useState<Product | null>(null);
  const [selectedAdminOrder, setSelectedAdminOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  // Continuously sync products to local storage so catalog never disappears on refresh
  useEffect(() => {
    try {
      if (products && products.length > 0) {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
      }
    } catch {
      // ignore
    }
  }, [products]);

  // Continuously sync categories to local storage
  useEffect(() => {
    try {
      if (categories && categories.length > 0) {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
      }
    } catch {
      // ignore
    }
  }, [categories]);

  // 0. Persistent Server Catalog Hydration
  useEffect(() => {
    const hydrateServerCatalog = async () => {
      try {
        const prodRes = await fetch('/api/catalog/products');
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          if (Array.isArray(prodData.products)) {
            setProducts(prodData.products);
            try {
              localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(prodData.products));
            } catch {}
          }
        }
      } catch (e) {
        console.warn('Server catalog hydration fallback:', e);
      }

      try {
        const catRes = await fetch('/api/catalog/categories');
        if (catRes.ok) {
          const catData = await catRes.json();
          if (Array.isArray(catData.categories)) {
            setCategories(catData.categories);
            try {
              localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(catData.categories));
            } catch {}
          }
        }
      } catch (e) {
        console.warn('Server categories hydration fallback:', e);
      }
    };

    hydrateServerCatalog();
  }, []);

  const isAdmin = Boolean(
    userProfile &&
      ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER'].includes(
        userProfile.role
      )
  );

  // 1. Auth Listener & Profile Synchronization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setEmailVerified(Boolean(user?.emailVerified));
      if (user) {
        // Hold the UI (e.g. the admin gate) until this user's role is known
        setAuthReady(false);
        // The server decides the role (owner / invited admin / customer) and keeps users/{uid} in sync
        try {
          const token = await user.getIdToken();
          const syncRes = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (syncRes.ok) {
            const data = await syncRes.json();
            if (data?.profile) {
              setUserProfile(data.profile as UserProfile);
              setAuthReady(true);
              return;
            }
          }
        } catch (syncErr) {
          console.warn('Account sync with server failed, using direct profile read:', syncErr);
        }

        // Server unavailable: read the profile directly. A verified built-in owner email may
        // promote itself to SUPER_ADMIN here (Firestore rules allow exactly that, nothing more).
        const userRef = doc(db, 'users', user.uid);
        const verifiedOwner = Boolean(user.emailVerified && isBuiltInOwnerEmail(user.email));
        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const existingProfile = snap.data() as UserProfile;
            if (verifiedOwner && existingProfile.role !== 'SUPER_ADMIN') {
              await updateDoc(userRef, { role: 'SUPER_ADMIN', updatedAt: new Date().toISOString() }).catch(() => {});
              existingProfile.role = 'SUPER_ADMIN';
            }
            setUserProfile(existingProfile);
          } else {
            const newProfile: UserProfile = {
              uid: user.uid,
              email: (user.email || '').slice(0, 250),
              name: (user.displayName || user.email?.split('@')[0] || 'Customer').slice(0, 110),
              role: verifiedOwner ? 'SUPER_ADMIN' : 'CUSTOMER',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          console.error('Error syncing user profile:', err);
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. Public Catalog Listeners (Products, Categories, Coupons, Approved Reviews, Settings)
  useEffect(() => {
    if (!authReady) return;

    const prodQuery = isAdmin
      ? collection(db, 'products')
      : query(collection(db, 'products'), where('status', '==', 'ACTIVE'));

    const unsubProducts = onSnapshot(
      prodQuery,
      (snap) => {
        const firestoreList = snap.docs.map((d) => d.data() as Product);
        setProducts(firestoreList);
        try {
          localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(firestoreList));
        } catch {}
      },
      (err) => {
        console.warn('Products listener error:', err.message);
      }
    );

    const unsubCategories = onSnapshot(
       query(collection(db, 'categories'), where('slug', '>=', '')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Category);
        setCategories(list);
        try {
          localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
        } catch {}
      },
      () => {}
    );

    const coupQuery = isAdmin
      ? collection(db, 'coupons')
      : query(collection(db, 'coupons'), where('active', '==', true));

    const unsubCoupons = onSnapshot(
      coupQuery,
      (snap) => {
        setCoupons(snap.docs.map((d) => d.data() as Coupon));
      },
      () => {}
    );

    const revQuery = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'APPROVED'));

    const unsubReviews = onSnapshot(
      revQuery,
      (snap) => {
        setReviews(snap.docs.map((d) => d.data() as Review));
      },
      () => {}
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'store_config'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as StoreSettings;
          setSettings(data);
          try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
          } catch {}
        }
      },
      () => {}
    );

    return () => {
      unsubProducts();
      unsubCategories();
      unsubCoupons();
      unsubReviews();
      unsubSettings();
    };
  }, [authReady, isAdmin]);

  // 4. Authenticated Listeners (Orders, Audit Logs, AI Tasks, Notifications)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setOrders([]);
      setAuditLogs([]);
      setAiTasks([]);
      setNotifications([]);
      return;
    }

    const ordersQ = isAdmin
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid));

    const unsubOrders = onSnapshot(
      ordersQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const notifQ = isAdmin
      ? collection(db, 'notifications')
      : query(collection(db, 'notifications'), where('userId', '==', firebaseUser.uid));

    const unsubNotifs = onSnapshot(
      notifQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StoreNotification);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    let unsubAudit = () => {};
    let unsubTasks = () => {};
    let unsubProductPrivate = () => {};
    let unsubOrderPrivate = () => {};

    if (!isAdmin) {
      setProductPrivate({});
      setOrderPrivate({});
    }

    if (isAdmin) {
      unsubProductPrivate = onSnapshot(
        collection(db, 'product_private'),
        (snap) => {
          const map: Record<string, ProductPrivate> = {};
          snap.docs.forEach((d) => {
            map[d.id] = d.data() as ProductPrivate;
          });
          setProductPrivate(map);
        },
        (err) => console.warn('product_private listener error:', err.message)
      );

      unsubOrderPrivate = onSnapshot(
        collection(db, 'order_private'),
        (snap) => {
          const map: Record<string, OrderPrivate> = {};
          snap.docs.forEach((d) => {
            map[d.id] = d.data() as OrderPrivate;
          });
          setOrderPrivate(map);
        },
        (err) => console.warn('order_private listener error:', err.message)
      );

      unsubAudit = onSnapshot(
        collection(db, 'audit_logs'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AuditLog);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      );

      unsubTasks = onSnapshot(
        collection(db, 'ai_tasks'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AITask);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAiTasks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ai_tasks')
      );
    }

    return () => {
      unsubOrders();
      unsubNotifs();
      unsubAudit();
      unsubTasks();
      unsubProductPrivate();
      unsubOrderPrivate();
    };
  }, [authReady, firebaseUser, isAdmin]);

  // Order documents are customer-readable, so supplier fields must never be written into them.
  const toPublicOrder = (o: Order): Order =>
    Array.isArray(o.items) ? { ...o, items: splitOrderItemsPrivate(o.items).publicItems } : o;

  // Admins see products/orders with their supplier data merged in; customers never receive it.
  const productsView = React.useMemo(
    () => (isAdmin ? products.map((p) => mergeProductPrivate(p, productPrivate[p.id])) : products),
    [isAdmin, products, productPrivate]
  );
  const ordersView = React.useMemo(
    () => (isAdmin ? orders.map((o) => mergeOrderPrivate(o, orderPrivate[o.id])) : orders),
    [isAdmin, orders, orderPrivate]
  );

  // Auth Actions
  const signInWithGoogle = async (): Promise<AuthResult> => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in successfully.');
      return { ok: true };
    } catch (error: any) {
      if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
        // Popups are blocked inside some embedded previews / in-app browsers
        await signInWithRedirect(auth, googleProvider);
        return { ok: true };
      }
      console.error('Sign-in failed:', error);
      const message = friendlyAuthError(error);
      showToast(message);
      return { ok: false, message };
    }
  };

  const signUpWithEmail = async (name: string, email: string, password: string): Promise<AuthResult> => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim().slice(0, 110) });
      }
      await sendEmailVerification(cred.user).catch(() => {});
      showToast('Account created. Please check your email to verify it.');
      return { ok: true, message: 'Account ban gaya. Email mein aaya hua link khol kar email verify karein.' };
    } catch (error: any) {
      return { ok: false, message: friendlyAuthError(error) };
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      showToast('Signed in successfully.');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, message: friendlyAuthError(error) };
    }
  };

  const resetPassword = async (email: string): Promise<AuthResult> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { ok: true, message: 'Password reset ka link aapki email par bhej diya gaya hai.' };
    } catch (error: any) {
      return { ok: false, message: friendlyAuthError(error) };
    }
  };

  const resendVerificationEmail = async (): Promise<AuthResult> => {
    if (!auth.currentUser) return { ok: false, message: 'Please sign in first.' };
    try {
      await sendEmailVerification(auth.currentUser);
      return { ok: true, message: 'Verification email dobara bhej di gayi hai.' };
    } catch (error: any) {
      return { ok: false, message: friendlyAuthError(error) };
    }
  };

  // Re-checks the account after the user clicks the verification link (refreshes token + role)
  const refreshAccount = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (syncRes.ok) {
        const data = await syncRes.json();
        if (data?.profile) setUserProfile(data.profile as UserProfile);
      }
    } catch {}
    setEmailVerified(Boolean(auth.currentUser?.emailVerified));
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
    showToast('Signed out.');
  };

  // Cart & Wishlist Actions
  const addToCart = (product: Product, quantity = 1, variantLabel = 'Standard Edition') => {
    if (product.stock <= 0) {
      showToast(`${product.name} is currently out of stock.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && item.variantLabel === variantLabel
      );
      if (idx > -1) {
        const updated = [...prev];
        const nextQty = Math.min(product.stock, updated[idx].quantity + quantity);
        updated[idx] = { ...updated[idx], quantity: nextQty };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          quantity: Math.min(product.stock, quantity),
          variantLabel,
          primaryImage: product.primaryImage,
          category: product.category,
        },
      ];
    });
    showToast(`Added ${product.name} to shopping bag.`);
  };

  const removeFromCart = (productId: string, variantLabel = 'Standard Edition') => {
    setCart((prev) =>
      prev.filter(
        (item) => !(item.productId === productId && item.variantLabel === variantLabel)
      )
    );
  };

  const updateCartQuantity = (
    productId: string,
    quantity: number,
    variantLabel = 'Standard Edition'
  ) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantLabel);
      return;
    }
    const product = products.find((p) => p.id === productId);
    const maxStock = product ? product.stock : 99;
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId && item.variantLabel === variantLabel
          ? { ...item, quantity: Math.min(maxStock, quantity) }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  const applyCouponCode = (rawCode: string): { success: boolean; message: string } => {
    const clean = rawCode.trim().toUpperCase();
    const found = coupons.find((c) => c.code.toUpperCase() === clean && c.active);
    if (!found) {
      return { success: false, message: 'Invalid or expired promotional code.' };
    }
    const subtotal = cart.reduce((sum, item) => {
      const liveProd = products.find((p) => p.id === item.productId);
      const trustedUnitPrice = liveProd ? liveProd.price : item.price;
      return sum + trustedUnitPrice * item.quantity;
    }, 0);
    if (found.minCartAmount && subtotal < found.minCartAmount) {
      return {
        success: false,
        message: `Coupon ${found.code} requires a minimum order of $${found.minCartAmount}.`,
      };
    }
    setAppliedCoupon(found);
    return { success: true, message: `Coupon ${found.code} applied.` };
  };

  const removeCoupon = () => setAppliedCoupon(null);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      if (prev.includes(productId)) {
        showToast('Removed from saved pieces.');
        return prev.filter((id) => id !== productId);
      }
      showToast('Saved to wishlist.');
      return [...prev, productId];
    });
  };

  // Audit Log Helper
  const recordAuditLog = async (action: string, resource: string, details?: string) => {
    if (!auth.currentUser || !isAdmin) return;
    const logId = sanitizeDocId(`log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const entry: AuditLog = {
      id: logId,
      actorUid: auth.currentUser.uid,
      actorName: (userProfile?.name || auth.currentUser.email || 'Admin').slice(0, 110),
      action: action.slice(0, 115),
      resource: resource.slice(0, 115),
      ...(details ? { details: details.slice(0, 1950) } : {}),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'audit_logs', logId), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `audit_logs/${logId}`);
    }
  };

  // Notification Helper
  const pushNotification = async (
    type: StoreNotification['type'],
    title: string,
    message: string
  ) => {
    if (!auth.currentUser) return;
    const notifId = sanitizeDocId(`notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const notif: StoreNotification = {
      id: notifId,
      userId: auth.currentUser.uid,
      type,
      title: title.slice(0, 150),
      message: message.slice(0, 580),
      read: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'notifications', notifId), notif);
    } catch (err) {
      console.warn('Could not persist notification:', err);
    }
  };

  // Place Order Flow (Revalidating prices & stock against trusted catalog records)
  // Place Order Flow (Server-Side Atomic Order Placement & Stock Revalidation)
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    const destCountryIso = (payload.destCountryIso || 'PK').toUpperCase();
    const isDomestic = destCountryIso === 'PK';

    // Strict validation: Reject COD outside Pakistan
    if (payload.paymentMethod === 'COD' && !isDomestic) {
      throw new Error('Cash on Delivery (COD) is strictly restricted to Pakistan domestic destinations.');
    }

    // Call server-side /api/orders/create endpoint with optional auth token
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const orderRes = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        couponCode: appliedCoupon?.code,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        shippingAddress: {
          address: payload.shippingAddressSummary,
          city: payload.district || '',
          district: payload.district,
          tehsil: payload.tehsil,
          state: payload.stateProvince || '',
          postalCode: payload.postalCode || '',
          country: payload.countryName || (isDomestic ? 'Pakistan' : destCountryIso),
          countryIso: destCountryIso,
        },
        paymentMethod: payload.paymentMethod,
        tid: payload.paymentReference,
        notes: payload.notes,
        destCountryIso,
      }),
    });

    const resData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(resData.error || 'Failed to place order.');
    }

    const createdOrder: Order = resData.order;

    // Persist guest tracking credentials in localStorage so guests can track anytime
    if (resData.orderAccessToken) {
      try {
        localStorage.setItem(
          'atelier_latest_order',
          JSON.stringify({
            orderNumber: createdOrder.orderNumber,
            orderAccessToken: resData.orderAccessToken,
          })
        );
      } catch {}
    }

    // Update local state with the authoritative server-created order
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === createdOrder.id || o.orderNumber === createdOrder.orderNumber);
      return exists ? prev : [createdOrder, ...prev];
    });

    // Notify user of order submission
    await pushNotification(
      'NEW_ORDER',
      `Order ${createdOrder.orderNumber} Recorded`,
      `${payload.customerName} submitted an order for ${settings.currency} ${createdOrder.total.toLocaleString()}.`
    );

    clearCart();
    return createdOrder;
  };

  // Verify Manual Payment Workflow (Admin Only, Server and Local State Synchronized)
  const verifyManualPayment = async (orderId: string, action: 'APPROVE' | 'REJECT', note?: string) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    if (!isAdmin) {
      showToast('Unauthorized: Only authorized administrators may verify manual payments.');
      return;
    }

    const actor = userProfile?.name || firebaseUser?.email || 'Administrator';

    // Synchronize with server verification endpoint
    let serverVerification: any = null;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const srvRes = await fetch('/api/admin/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: target.id,
          orderNumber: target.orderNumber,
          action,
          customerEmail: target.customerEmail,
          note,
          currentPaymentStatus: target.paymentStatus,
          currentOrderStatus: target.status,
        }),
      });

      const resJson = await srvRes.json();
      if (!srvRes.ok) {
        showToast(resJson.error || 'Payment verification rejected by server.');
        return;
      }
      serverVerification = resJson.verification;
    } catch (err: any) {
      showToast(err?.message || 'Failed to reach payment verification server.');
      return;
    }

    const now = serverVerification?.verifiedAt || new Date().toISOString();
    const nextPaymentStatus: PaymentStatus = serverVerification?.newPaymentStatus || (action === 'APPROVE' ? 'PAID' : 'FAILED');
    const nextOrderStatus: OrderStatus = serverVerification?.newOrderStatus || (action === 'APPROVE' ? 'CONFIRMED' : 'CANCELLED');

    let approvedReceiptHtml = target.paymentReceiptEmailHtml || '';
    let approvedSubject = target.paymentReceiptEmailSubject || `Payment Received: Order #${target.orderNumber} | ${settings.storeName || 'Store'}`;

    if (action === 'APPROVE') {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const mailRes = await fetch('/api/email/send-payment-receipt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            toEmail: target.customerEmail,
            customerName: target.customerName,
            orderNumber: target.orderNumber,
            storeName: settings.storeName || 'Store',
            paymentMethod: target.paymentMethod,
            paymentSubMethod: target.paymentSubMethod,
            paymentReference: target.paymentReference || 'Bank / Wallet Reconciled',
            totalAmount: target.total,
            currency: target.currency || settings.currency,
            items: [],
            shippingAddress: target.shippingAddressSummary,
            district: target.district,
            tehsil: target.tehsil,
          }),
        });
        if (mailRes.ok) {
          const mailData = await mailRes.json();
          approvedReceiptHtml = mailData.htmlPreview || '';
          if (mailData.subject) approvedSubject = mailData.subject;
        }
      } catch (e) {
        console.warn('Failed to send verified receipt email:', e);
      }
    }

    const updatedOrder: Order = {
      ...target,
      paymentStatus: nextPaymentStatus,
      status: nextOrderStatus,
      paymentVerifiedBy: serverVerification?.verifiedBy || actor,
      paymentVerifiedAt: now,
      paymentVerificationNote: serverVerification?.note || note || (action === 'APPROVE' ? 'Payment verified in bank ledger.' : 'Transaction ID not recognized or funds unreceived.'),
      paymentReceiptEmailSent: action === 'APPROVE' ? true : target.paymentReceiptEmailSent,
      paymentReceiptEmailSentAt: action === 'APPROVE' ? now : target.paymentReceiptEmailSentAt,
      paymentReceiptEmailSubject: action === 'APPROVE' ? approvedSubject : target.paymentReceiptEmailSubject,
      paymentReceiptEmailRecipient: target.customerEmail,
      paymentReceiptEmailHtml: approvedReceiptHtml || target.paymentReceiptEmailHtml,
      updatedAt: now,
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          action === 'APPROVE' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
          `Order:${target.orderNumber}`,
          `Payment verified as ${nextPaymentStatus} by ${actor}. Ref: ${target.paymentReference || 'N/A'}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }

    showToast(
      action === 'APPROVE'
        ? `Payment for Order ${target.orderNumber} VERIFIED and confirmed.`
        : `Payment for Order ${target.orderNumber} REJECTED.`
    );
  };

  // Admin Update Shipping Quote Workflow for International Orders
  const updateShippingQuote = async (
    orderId: string,
    payload: {
      quoteAmount: number;
      quoteCourier: string;
      quoteEstimatedDays: string;
      quoteCustomsMode: 'DAP' | 'DDP' | 'NOT_APPLICABLE';
      quoteAdminNotes?: string;
    }
  ) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    const updatedTotal = Number(((target.subtotal || 0) + payload.quoteAmount).toFixed(2));
    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updatedOrder: Order = {
      ...target,
      status: 'QUOTE_READY',
      shippingFee: payload.quoteAmount,
      total: updatedTotal,
      quoteAmount: payload.quoteAmount,
      quoteCourier: payload.quoteCourier,
      quoteEstimatedDays: payload.quoteEstimatedDays,
      quoteCustomsMode: payload.quoteCustomsMode,
      quoteAdminNotes: payload.quoteAdminNotes,
      quoteExpiresAt: expiryIso,
      shippingCalculationSnapshot: {
        destCountryIso: target.destCountryIso || 'US',
        destZoneName: 'Manual Freight Quotation',
        carrier: payload.quoteCourier,
        actualWeightKg: target.shippingCalculationSnapshot?.actualWeightKg || 1.0,
        volumetricWeightKg: target.shippingCalculationSnapshot?.volumetricWeightKg || 1.0,
        billableWeightKg: target.shippingCalculationSnapshot?.billableWeightKg || 1.0,
        baseFee: payload.quoteAmount,
        additionalWeightFee: 0,
        freeShippingApplied: false,
        finalShippingFee: payload.quoteAmount,
        currency: target.currency || 'PKR',
        customsMode: payload.quoteCustomsMode,
        customsNotice: `International Freight: ${payload.quoteCustomsMode}. Valid for 7 days until ${expiryIso.slice(0, 10)}.`,
        estimatedDelivery: payload.quoteEstimatedDays,
        requiresManualQuote: true,
        calculatedAt: nowIso,
      },
      updatedAt: nowIso,
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          'SHIPPING_QUOTE_ISSUED',
          `Order:${target.orderNumber}`,
          `Issued freight quote: PKR ${payload.quoteAmount} via ${payload.quoteCourier} (${payload.quoteCustomsMode})`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }

    showToast(`Shipping quote issued for Order ${target.orderNumber}. Client can now accept and pay.`);
  };

  // Client Accept or Reject Shipping Quote Workflow (Trusted Server Validation & Expiry Enforcement)
  const acceptOrRejectShippingQuote = async (orderId: string, accept: boolean) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    try {
      const resp = await fetch('/api/orders/respond-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: target.id,
          orderNumber: target.orderNumber,
          currentStatus: target.status,
          quoteExpiresAt: target.quoteExpiresAt,
          action: accept ? 'ACCEPT' : 'REJECT',
          actorUid: firebaseUser?.uid || 'guest-user',
          actorEmail: firebaseUser?.email || target.customerEmail,
        }),
      });

      const resData = await resp.json();

      if (!resp.ok) {
        if (resData.isExpired || resData.rejectedCode === 'QUOTE_EXPIRED') {
          // Trusted server detected expiry and calculated transition
          const expiredOrder: Order = {
            ...target,
            status: 'QUOTE_EXPIRED',
            updatedAt: resData.serverTimestamp || new Date().toISOString(),
          };
          if (firebaseUser && isAdmin) {
            try {
              await setDoc(doc(db, 'orders', target.id), toPublicOrder(expiredOrder));
              await recordAuditLog(
                'QUOTE_EXPIRED',
                `Order:${target.orderNumber}`,
                `Quote expired past deadline ${target.quoteExpiresAt}. Server confirmed expiration.`
              );
            } catch {
              // ignore
            }
          }
          setOrders((prev) => prev.map((o) => (o.id === target.id ? expiredOrder : o)));
          showToast(resData.error || 'This freight quote has expired. Please contact concierge for a refreshed quotation.');
          return;
        }
        showToast(resData.error || 'Failed to update quote status.');
        return;
      }

      const updatedOrder: Order = {
        ...target,
        status: resData.newStatus,
        paymentStatus: resData.newPaymentStatus,
        updatedAt: resData.serverTimestamp || new Date().toISOString(),
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
          await recordAuditLog(
            resData.auditLog?.action || (accept ? 'QUOTE_ACCEPTED' : 'QUOTE_REJECTED'),
            `Order:${target.orderNumber}`,
            resData.auditLog?.details || `Quote ${accept ? 'accepted' : 'declined'} by client.`
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
        }
      } else {
        setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
      }

      showToast(accept ? 'Shipping quote accepted. Please submit advance payment.' : 'Shipping quote declined.');
    } catch (err: any) {
      showToast(err?.message || 'Error processing quote response.');
    }
  };

  // Submit Customer Review
  const submitReview: StoreContextValue['submitReview'] = async (payload) => {
    if (!firebaseUser) {
      showToast('Please sign in with Google to publish a verified review.');
      return;
    }
    const revId = sanitizeDocId(`rev-${Date.now()}`);
    const newReview: Review = {
      id: revId,
      productId: payload.productId,
      productName: payload.productName.slice(0, 190),
      userId: firebaseUser.uid,
      authorName: (userProfile?.name || firebaseUser.displayName || 'Verified Client').slice(0, 110),
      rating: Math.min(5, Math.max(1, Math.round(payload.rating))),
      title: payload.title.slice(0, 150),
      comment: payload.comment.slice(0, 1900),
      verifiedPurchase: true,
      status: 'APPROVED',
      helpfulCount: 1,
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'reviews', revId), newReview);
      showToast('Thank you. Your review has been published.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${revId}`);
    }
  };

  // Admin & AI: Save or Create Product
  const saveProduct: StoreContextValue['saveProduct'] = async (input, actionLabel) => {
    const existingProd = input.id ? products.find((p) => p.id === input.id) : undefined;
    const prodId = existingProd?.id || sanitizeDocId(input.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
    const now = new Date().toISOString();

    const cleanProduct: Product = {
      id: prodId,
      sku: sanitizeSku(input.sku || existingProd?.sku || `SKU-${Date.now().toString().slice(-5)}`),
      name: (input.name || existingProd?.name || 'Untitled Product').slice(0, 195),
      slug: sanitizeSlug(input.slug || input.name || existingProd?.slug || prodId),
      shortDescription: (
        input.shortDescription ??
        existingProd?.shortDescription ??
        ''
      ).slice(0, 490),
      description: (
        input.description ??
        existingProd?.description ??
        ''
      ).slice(0, 4900),
      price: Math.max(0, Number(input.price ?? existingProd?.price ?? 0)),
      // No invented "was" price: only show a crossed-out price when the admin sets one
      compareAtPrice: Math.max(
        0,
        Number(('compareAtPrice' in input ? input.compareAtPrice : existingProd?.compareAtPrice) ?? 0) || 0
      ),
      stock: Math.max(0, Math.round(Number(input.stock ?? existingProd?.stock ?? 15))),
      reservedStock: Math.max(0, Math.round(Number(input.reservedStock ?? existingProd?.reservedStock ?? 0))),
      lowStockThreshold: Math.max(
        1,
        Math.round(Number(input.lowStockThreshold ?? existingProd?.lowStockThreshold ?? 5))
      ),
      category: (input.category || existingProd?.category || 'General').slice(0, 75),
      subcategory: (input.subcategory || existingProd?.subcategory || 'Standard').slice(0, 75),
      brand: (input.brand || existingProd?.brand || settings.storeName || 'Store Brand').slice(0, 75),
      status: input.status || existingProd?.status || 'ACTIVE',
      featured: Boolean(input.featured ?? existingProd?.featured ?? false),
      bestSeller: Boolean(input.bestSeller ?? existingProd?.bestSeller ?? false),
      newArrival: Boolean(input.newArrival ?? existingProd?.newArrival ?? true),
      seoTitle: (input.seoTitle ?? existingProd?.seoTitle ?? `${input.name} | ${settings.storeName || 'Store'}`).slice(0, 155),
      seoDescription: (
        input.seoDescription ??
        existingProd?.seoDescription ??
        (input.shortDescription || `Discover ${input.name} from ${settings.storeName || 'our store'}.`)
      ).slice(0, 310),
      seoKeywords: (
        input.seoKeywords ??
        existingProd?.seoKeywords ??
        `${input.category?.toLowerCase() || 'product'}, ${settings.storeName?.toLowerCase() || 'store'}`
      ).slice(0, 390),
      primaryImage: (input.primaryImage || existingProd?.primaryImage || '').slice(0, 980),
      rating: Number(input.rating ?? existingProd?.rating ?? 5.0),
      reviewCount: Math.round(Number(input.reviewCount ?? existingProd?.reviewCount ?? 0)),
      weightKg: Number(input.weightKg ?? existingProd?.weightKg ?? 0.8),
      dimensions: (input.dimensions || existingProd?.dimensions || '30cm x 20cm x 10cm').slice(0, 95),
      createdAt: existingProd?.createdAt || now,
      updatedAt: now,
    };

    // Admin-only supplier/cost data lives in product_private/{id}, never on the public product
    const existingPrivate = productPrivate[prodId];
    const pickNumber = (v: unknown) =>
      v === undefined || v === null || v === '' || isNaN(Number(v)) ? undefined : Math.max(0, Number(v));
    const privateFields: ProductPrivate = {
      productId: prodId,
      supplierName: (input.supplierName ?? existingPrivate?.supplierName ?? 'Own Stock') as string,
      supplierProductUrl: String(input.supplierProductUrl ?? existingPrivate?.supplierProductUrl ?? '').slice(0, 1000),
      supplierSku: String(input.supplierSku ?? existingPrivate?.supplierSku ?? '').slice(0, 100),
      updatedAt: now,
    };
    const supplierCost = pickNumber(input.supplierCostPrice ?? existingPrivate?.supplierCostPrice);
    if (supplierCost !== undefined) privateFields.supplierCostPrice = supplierCost;
    const costPrice = pickNumber(input.costPrice ?? existingPrivate?.costPrice);
    if (costPrice !== undefined) privateFields.costPrice = costPrice;

    const fullProduct: Product = mergeProductPrivate(cleanProduct, privateFields);

    // Always update local reactive state and localStorage immediately
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === prodId || p.sku.toLowerCase() === cleanProduct.sku.toLowerCase());
      const next = exists
        ? prev.map((p) => (p.id === prodId || p.sku.toLowerCase() === cleanProduct.sku.toLowerCase() ? cleanProduct : p))
        : [cleanProduct, ...prev];
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setProductPrivate((prev) => ({ ...prev, [prodId]: privateFields }));

    // Persist through the server (it splits public and private data)
    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch('/api/catalog/products/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(fullProduct),
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'products', prodId), cleanProduct);
        await setDoc(doc(db, 'product_private', prodId), privateFields);
        await recordAuditLog(
          actionLabel || (existingProd ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED'),
          `Product:${cleanProduct.sku}`,
          `${cleanProduct.name} (PKR ${cleanProduct.price}, Stock: ${cleanProduct.stock})`
        );
        if (cleanProduct.stock <= (cleanProduct.lowStockThreshold || 5)) {
          await pushNotification(
            'LOW_STOCK',
            `Low Stock Alert: ${cleanProduct.name}`,
            `SKU ${cleanProduct.sku} has ${cleanProduct.stock} units remaining.`
          );
        }
      } catch (error) {
        console.warn(`Firestore saveProduct sync error for ${prodId}:`, error);
      }
    }

    return fullProduct;
  };

  // Bulk import products atomically (Persists to React state, localStorage, server disk, & Firestore)
  const importProductsBatch: StoreContextValue['importProductsBatch'] = async (items) => {
    if (!items || items.length === 0) return { count: 0 };

    // Supplier/cost columns from the CSV stay admin-only (product_private)
    const splitItems = items
      .filter((p) => p && p.id)
      .map((p) => ({ id: p.id, ...splitProductPrivate(p) }));

    // 1. Update React state immediately with deduplication
    setProducts((prev) => {
      const map = new Map<string, Product>();
      prev.forEach((p) => {
        if (p && p.id) map.set(p.id, p);
      });
      splitItems.forEach((s) => {
        map.set(s.id, s.publicData as Product);
      });
      const next = Array.from(map.values());
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Persist through the server in chunks: a Firestore batch holds at most 500 writes and
    // each product needs up to 3 (public doc, cleanup, private doc)
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const CHUNK = 100;
      for (let i = 0; i < items.length; i += CHUNK) {
        await fetch('/api/catalog/products/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ products: items.slice(i, i + CHUNK) }),
        });
      }
    } catch (err) {
      console.warn('Server catalog batch error:', err);
    }

    // 3. Extract and register any new categories from imported products
    const uniqueCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    const newCategoryObjects: Category[] = [];
    uniqueCategories.forEach((catName) => {
      const existing = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      if (!existing) {
        const slug = sanitizeSlug(catName);
        const newCat: Category = {
          id: sanitizeDocId(`cat-${slug}`),
          name: catName,
          slug,
          description: `Curated collections for ${catName}.`,
          productCount: items.filter((i) => i.category.toLowerCase() === catName.toLowerCase()).length,
        };
        newCategoryObjects.push(newCat);
      }
    });

    if (newCategoryObjects.length > 0) {
      setCategories((prev) => [...prev, ...newCategoryObjects]);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/catalog/categories/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ categories: newCategoryObjects }),
        });
      } catch {}
    }

    // 4. If logged in with admin privileges, sync to Firestore
    // Written with the admin's own sign-in, so the catalog saves even when the server has no
    // Firebase admin credentials. Each product takes up to 2 writes; a batch allows 500.
    let failed = 0;
    let lastError: unknown = null;
    if (firebaseUser && isAdmin) {
      const now = new Date().toISOString();
      const BATCH = 200;
      for (let i = 0; i < splitItems.length; i += BATCH) {
        const chunk = splitItems.slice(i, i + BATCH);
        try {
          const batch = writeBatch(db);
          for (const s of chunk) {
            batch.set(doc(db, 'products', s.id), s.publicData);
            if (s.privateData) batch.set(doc(db, 'product_private', s.id), { ...s.privateData, updatedAt: now });
          }
          await batch.commit();
        } catch (err) {
          // One invalid product fails the whole batch: retry this chunk one by one
          for (const s of chunk) {
            try {
              await setDoc(doc(db, 'products', s.id), s.publicData);
              if (s.privateData) await setDoc(doc(db, 'product_private', s.id), { ...s.privateData, updatedAt: now });
            } catch (itemErr) {
              failed++;
              lastError = itemErr;
              console.warn(`Product ${s.id} could not be saved:`, itemErr);
            }
          }
        }
      }
      if (failed === splitItems.length && splitItems.length > 0) {
        throw new Error(`Koi product save nahi hua (${(lastError as any)?.message || 'permission error'}).`);
      }
    }

    return { count: items.length - failed };
  };

  // Delete Product
  const removeProduct = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== productId);
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Remove from server disk storage
    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch(`/api/catalog/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await deleteDoc(doc(db, 'products', productId));
        await deleteDoc(doc(db, 'product_private', productId)).catch(() => {});
        await recordAuditLog(
          'PRODUCT_DELETED',
          `Product:${target?.sku || productId}`,
          `Deleted product ${target?.name || productId}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
      }
    }
  };

  // Save or Create Category
  const saveCategory: StoreContextValue['saveCategory'] = async (input) => {
    const slug = sanitizeSlug(input.slug || input.name);
    const catId = input.id || sanitizeDocId(`cat-${slug}`);
    const newCat: Category = {
      id: catId,
      name: input.name.slice(0, 95),
      slug,
      description: (input.description || `${input.name} collection.`).slice(0, 580),
      seoTitle: (input.seoTitle || `${input.name} — ${settings.storeName}`).slice(0, 150),
      seoDescription: (input.seoDescription || `Explore ${input.name} handcrafted by ${settings.storeName}.`).slice(0, 310),
      productCount: input.productCount ?? products.filter((p) => p.category === input.name).length,
    };

    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch('/api/catalog/categories/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category: newCat }),
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'categories', catId), newCat);
        await recordAuditLog('CATEGORY_SAVED', `Category:${newCat.slug}`, newCat.name);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `categories/${catId}`);
      }
    } else {
      setCategories((prev) => [newCat, ...prev.filter((c) => c.id !== catId)]);
    }
    return newCat;
  };

  // Inventory Adjustment
  const adjustInventory = async (productId: string, newStock: number, reason = 'Manual Adjustment') => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const clamped = Math.max(0, Math.round(newStock));
    await saveProduct(
      { ...target, stock: clamped },
      `INVENTORY_ADJUSTED (${reason}: ${target.stock} -> ${clamped})`
    );
  };

  // Order Status Update / Cancel (with Stock Restoration) / Refund
  const updateOrderState = async (
    orderId: string,
    status: OrderStatus,
    trackingNumber?: string,
    courierName?: string
  ) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    const wasAlreadyCancelledOrRefunded =
      target.status === 'CANCELLED' || target.status === 'REFUNDED';

    const paymentStatus =
      status === 'REFUNDED'
        ? 'REFUNDED'
        : status === 'CANCELLED' && target.paymentStatus === 'PAID'
        ? 'REFUND_PENDING'
        : status === 'DELIVERED'
        ? 'PAID'
        : target.paymentStatus;

    const updatedOrder: Order = {
      ...target,
      status,
      paymentStatus,
      ...(trackingNumber !== undefined ? { trackingNumber: trackingNumber.slice(0, 110) } : {}),
      ...(courierName !== undefined ? { courierName: courierName.slice(0, 100) } : {}),
      updatedAt: new Date().toISOString(),
    };

    // Authoritative stock restoration and notification on server when an order is cancelled
    if (
      !wasAlreadyCancelledOrRefunded &&
      status === 'CANCELLED'
    ) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/orders/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: target.id,
            orderNumber: target.orderNumber,
            reason: 'Cancelled by operator/customer',
          }),
        });
      } catch (err) {
        console.warn('Server order cancellation error:', err);
      }
    } else {
      // Synchronize with server to trigger server-side transactional emails (e.g., Order Shipped via Resend)
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/orders/update-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: target.id,
            orderNumber: target.orderNumber,
            status,
            trackingNumber: trackingNumber !== undefined ? trackingNumber : target.trackingNumber,
            courierName: courierName !== undefined ? courierName : target.courierName,
          }),
        });
      } catch (err) {
        console.warn('Server order update status error:', err);
      }
    }

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          `ORDER_${status}`,
          `Order:${target.orderNumber}`,
          `Updated status from ${target.status} to ${status} (Payment: ${paymentStatus})`
        );
        if (status === 'REFUNDED') {
          await pushNotification(
            'REFUND',
            `Refund Recorded: ${target.orderNumber}`,
            `Order ${target.orderNumber} ($${target.total.toFixed(2)}) marked as REFUNDED for ${target.customerEmail}.`
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }
  };

  // Confirm Order by Customer
  const confirmOrder = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...target,
      status: 'CONFIRMED',
      confirmedByCustomer: true,
      confirmedAt: now,
      confirmedBy: userProfile?.name || userProfile?.email || 'Admin',
      updatedAt: now,
    };

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/orders/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderId: target.id, orderNumber: target.orderNumber }),
      });
    } catch (e) {
      console.warn('Confirm order server request error:', e);
    }

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          'ORDER_CONFIRMED',
          `Order:${target.orderNumber}`,
          'Order confirmed by customer - ready to forward to supplier'
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }
    showToast(`Order #${target.orderNumber} confirmed! Ready for supplier.`);
  };

  // Cancel Fake / Not Responding Order
  const cancelFakeOrder = async (orderId: string, reason?: string) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    const now = new Date().toISOString();
    const cancelReason = reason || 'Fake / Customer not responding';
    const updatedOrder: Order = {
      ...target,
      status: 'CANCELLED',
      cancellationReason: cancelReason,
      cancelledAt: now,
      updatedAt: now,
    };

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/orders/cancel-fake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderId: target.id, orderNumber: target.orderNumber, reason: cancelReason }),
      });
    } catch (e) {
      console.warn('Cancel fake order server request error:', e);
    }

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          'ORDER_CANCELLED_FAKE',
          `Order:${target.orderNumber}`,
          `Cancelled: ${cancelReason}`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }
    showToast(`Order #${target.orderNumber} cancelled (${cancelReason}).`);
  };

  // Add or Update Order Shipment (Multi-Shipment Dropshipping)
  const addOrUpdateOrderShipment = async (
    orderId: string,
    shipment: Partial<OrderShipment> & { courierName: string; trackingNumber: string }
  ) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    const now = new Date().toISOString();
    const shpId = shipment.id || `shp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const autoUrl = generateCourierTrackingUrl(shipment.courierName, shipment.trackingNumber);
    const trackingUrl = shipment.trackingUrl && shipment.trackingUrl.trim() ? shipment.trackingUrl.trim() : autoUrl;

    const formattedShipment: OrderShipment = {
      id: shpId,
      supplierName: shipment.supplierName || 'Own Stock',
      itemIds: Array.isArray(shipment.itemIds) ? shipment.itemIds : [],
      courierName: shipment.courierName,
      trackingNumber: shipment.trackingNumber.trim(),
      trackingUrl,
      status: shipment.status || 'SHIPPED',
      updatedAt: now,
    };

    const existingShipments: OrderShipment[] = Array.isArray(target.shipments) ? [...target.shipments] : [];
    const idx = existingShipments.findIndex((s) => s.id === shpId);
    if (idx >= 0) {
      existingShipments[idx] = formattedShipment;
    } else {
      existingShipments.push(formattedShipment);
    }

    // Auto-update order status: SHIPPED when all shipments are shipped/beyond, DELIVERED when all delivered
    let nextStatus: OrderStatus = target.status;
    if (existingShipments.length > 0) {
      const allDelivered = existingShipments.every((s) => s.status === 'DELIVERED');
      const allShippedOrBeyond = existingShipments.every((s) =>
        ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(s.status)
      );
      if (allDelivered) {
        nextStatus = 'DELIVERED';
      } else if (allShippedOrBeyond) {
        nextStatus = 'SHIPPED';
      }
    }

    const updatedOrder: Order = {
      ...target,
      shipments: existingShipments,
      status: nextStatus,
      courierName: existingShipments[0]?.courierName || target.courierName,
      trackingNumber: existingShipments[0]?.trackingNumber || target.trackingNumber,
      ...(nextStatus === 'DELIVERED' ? { paymentStatus: 'PAID' } : {}),
      updatedAt: now,
    };

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/orders/shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: target.id,
          orderNumber: target.orderNumber,
          shipment: formattedShipment,
        }),
      });
    } catch (e) {
      console.warn('Server shipment update error:', e);
    }

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), toPublicOrder(updatedOrder));
        await recordAuditLog(
          'ORDER_SHIPMENT_UPDATED',
          `Order:${target.orderNumber}`,
          `Shipment ${formattedShipment.courierName} #${formattedShipment.trackingNumber} (${formattedShipment.status})`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }
    showToast(`Shipment for #${target.orderNumber} updated!`);
  };

  // Save Coupon
  const saveCoupon: StoreContextValue['saveCoupon'] = async (input) => {
    const coupId = input.id || sanitizeDocId(`coup-${input.code.toLowerCase()}`);
    const cleanCode = input.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 35) || 'PROMO20';
    const newCoupon: Coupon = {
      id: coupId,
      code: cleanCode,
      type: input.type,
      value: Math.max(0, Number(input.value)),
      minCartAmount: Number(input.minCartAmount ?? 100),
      maxDiscount: Number(input.maxDiscount ?? 500),
      ...(input.categoryFilter ? { categoryFilter: input.categoryFilter.slice(0, 90) } : {}),
      usageLimit: Math.round(Number(input.usageLimit ?? 100)),
      usedCount: Math.round(Number(input.usedCount ?? 0)),
      active: input.active ?? true,
      expiresAt: input.expiresAt || '2027-12-31T00:00:00.000Z',
      createdAt: input.createdAt || new Date().toISOString(),
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'coupons', coupId), newCoupon);
        await recordAuditLog(
          'COUPON_SAVED',
          `Coupon:${cleanCode}`,
          `Type: ${newCoupon.type}, Value: ${newCoupon.value}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `coupons/${coupId}`);
      }
    } else {
      setCoupons((prev) => [newCoupon, ...prev.filter((c) => c.id !== coupId)]);
    }
    return newCoupon;
  };

  const deleteCouponById = async (couponId: string) => {
    if (firebaseUser && isAdmin) {
      try {
        await deleteDoc(doc(db, 'coupons', couponId));
        await recordAuditLog('COUPON_DELETED', `Coupon:${couponId}`, 'Removed promotional code');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `coupons/${couponId}`);
      }
    } else {
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
    }
  };

  // Moderate Review
  const moderateReview = async (reviewId: string, status: Review['status']) => {
    const target = reviews.find((r) => r.id === reviewId);
    if (!target) return;
    const updated: Review = { ...target, status };
    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'reviews', reviewId), updated);
        await recordAuditLog('REVIEW_MODERATED', `Review:${reviewId}`, `Set status to ${status}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
      }
    } else {
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
    }
  };

  // Update Store Settings
  const updateStoreSettings = async (updated: Partial<StoreSettings>) => {
    const nextSettings: StoreSettings = {
      ...settings,
      ...updated,
      id: 'store_config',
      updatedAt: new Date().toISOString(),
    };
    // Always update local state immediately
    setSettings(nextSettings);
    try {
      localStorage.setItem('atelier_aurelia_store_settings', JSON.stringify(nextSettings));
    } catch {
      // ignore quota errors
    }
    if (!firebaseUser || !isAdmin) {
      showToast('Settings sirf is browser mein badli hain. Save karne ke liye admin login karein.');
      return;
    }
    try {
      // Firestore rejects undefined values; required text fields must be strings
      const toSave = JSON.parse(JSON.stringify(nextSettings));
      toSave.storeName = String(toSave.storeName || 'My Store');
      toSave.contactEmail = String(toSave.contactEmail || '');
      toSave.currency = String(toSave.currency || 'PKR');
      toSave.taxRate = Number(toSave.taxRate) || 0;
      await setDoc(doc(db, 'settings', 'store_config'), toSave);
      showToast('Store settings saved.');
      recordAuditLog('SETTINGS_UPDATED', 'StoreSettings', JSON.stringify(updated).slice(0, 1900)).catch(() => {});
    } catch (error: any) {
      console.error('Settings save failed:', error);
      showToast(`Settings save nahi huin: ${error?.message || error}`);
    }
  };

  // Create or Update Long-Running AI Task
  const createOrUpdateAITask: StoreContextValue['createOrUpdateAITask'] = async (taskInput) => {
    const existingTask = aiTasks.find((t) => t.id === taskInput.id);
    const now = new Date().toISOString();
    const taskRecord: AITask = {
      id: sanitizeDocId(taskInput.id),
      actorUid: firebaseUser?.uid || 'admin',
      name: taskInput.name.slice(0, 190),
      toolName: taskInput.toolName.slice(0, 95),
      status: taskInput.status || existingTask?.status || 'RUNNING',
      totalItems: Math.max(0, Math.round(taskInput.totalItems ?? existingTask?.totalItems ?? 1)),
      completedItems: Math.max(
        0,
        Math.round(taskInput.completedItems ?? existingTask?.completedItems ?? 0)
      ),
      failedItems: Math.max(0, Math.round(taskInput.failedItems ?? existingTask?.failedItems ?? 0)),
      ...(taskInput.summary ? { summary: taskInput.summary.slice(0, 1950) } : {}),
      createdAt: existingTask?.createdAt || now,
      updatedAt: now,
    };

    // Always update local reactive state immediately
    setAiTasks((prev) => {
      const exists = prev.some((t) => t.id === taskRecord.id);
      return exists
        ? prev.map((t) => (t.id === taskRecord.id ? taskRecord : t))
        : [taskRecord, ...prev];
    });

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'ai_tasks', taskRecord.id), taskRecord);
      } catch (error) {
        console.warn(`Firestore createOrUpdateAITask sync error for ${taskRecord.id}:`, error);
      }
    }
    return taskRecord;
  };

  const cancelAITask = async (taskId: string) => {
    const target = aiTasks.find((t) => t.id === taskId);
    if (!target) return;
    await createOrUpdateAITask({
      id: target.id,
      name: target.name,
      toolName: target.toolName,
      status: 'CANCELLED',
      totalItems: target.totalItems,
      completedItems: target.completedItems,
      failedItems: target.failedItems,
      summary: `${target.summary ? `${target.summary} · ` : ''}Cancelled by administrator.`,
    });
    await recordAuditLog('AI_TASK_CANCELLED', `AITask:${target.id}`, target.name);
    showToast(`AI task "${target.name}" cancelled.`);
  };

  const markNotificationRead = async (notificationId: string) => {
    const target = notifications.find((n) => n.id === notificationId);
    if (!target) return;
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
      }
    } else {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    }
  };

  return (
    <StoreContext.Provider
      value={{
        firebaseUser,
        userProfile,
        authReady,
        isAdmin,
        emailVerified,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        resetPassword,
        resendVerificationEmail,
        refreshAccount,
        signOut,
        products: productsView,
        categories,
        coupons,
        reviews,
        orders: ordersView,
        auditLogs,
        aiTasks,
        notifications,
        settings,
        cart,
        wishlist,
        appliedCoupon,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        applyCouponCode,
        removeCoupon,
        toggleWishlist,
        placeOrder,
        verifyManualPayment,
        updateShippingQuote,
        acceptOrRejectShippingQuote,
        submitReview,
        saveProduct,
        importProductsBatch,
        removeProduct,
        saveCategory,
        adjustInventory,
        updateOrderState,
        confirmOrder,
        cancelFakeOrder,
        addOrUpdateOrderShipment,
        saveCoupon,
        deleteCouponById,
        moderateReview,
        updateStoreSettings,
        recordAuditLog,
        createOrUpdateAITask,
        markNotificationRead,
        selectedAdminProduct,
        setSelectedAdminProduct,
        selectedAdminOrder,
        setSelectedAdminOrder,
        cancelAITask,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
