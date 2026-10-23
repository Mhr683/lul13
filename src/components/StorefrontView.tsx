import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  ArrowRight,
  Star,
  Check,
  Minus,
  Plus,
  Trash2,
  ShieldCheck,
  Truck,
  RotateCcw,
  SlidersHorizontal,
  X,
  Mail,
  Printer,
  Copy,
  ExternalLink,
  CreditCard,
  Smartphone,
  Calendar,
  Building2,
  HelpCircle,
  Info,
  Tag,
  ChevronDown,
  ChevronUp,
  Lock,
  MapPin,
  ArrowLeft,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Package,
  Headphones,
  MessageCircle,
  Phone,
  Menu,
  Loader2,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { Product, PaymentMethod, Order } from '../types/store';
import { ProductImage } from './ProductImage';
import { OrderTimeline } from './OrderTimeline';
import { CustomerNotificationsBell } from './CustomerNotificationsBell';
import { rememberOrder, tokenForOrder } from '../services/myOrders';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HeaderNavDropdowns } from './HeaderNavDropdowns';
import { buildNavSections, productMatchesNav } from '../data/navMatch';
import type { DetectedAddressPayload } from './GoogleMapsAddressDetector';
import { CustomerHelplineDrawer } from './CustomerHelplineDrawer';
import { PWAInstallButton } from './PWAInstallButton';
import { BrandLogo } from './BrandLogo';
import { SellerShopPage } from './SellerShopPage';
import { ProductReactions } from './ProductReactions';
import { ProductRatingBadge, SellerRatingBadge, SellerScoreCards, useShopInfo, rankScore } from './SellerRating';
import { ProductGallery } from './ProductGallery';
import { ProductInfoTabs } from './ProductInfoTabs';
import { BackInStockForm, BoughtTogether, RecentlyViewedStrip, useRecentlyViewed } from './ProductExtras';
import { PolicyDocument } from './PolicyDocument';
import { CUSTOMER_PROTECTION } from '../data/policies';
import { withFlashPrices, referralOf, type Campaign, campaignProducts } from '../services/promotions';
import { track } from '../services/analytics';
import {
  WelcomeOfferPopup,
  DailyDeals,
  SocialProofToast,
  CampaignBanners,
  CampaignPage,
  ReferAndEarnCard,
  liveCampaigns,
  fetchReferral,
  type ReferralInfo,
} from './GrowthWidgets';

// The seller's customer rating under "Sold & shipped by" on the product page
const PdpSellerRating: React.FC<{ sellerId: string }> = ({ sellerId }) => {
  const shop = useShopInfo(sellerId);
  return shop ? (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#575653]">Seller rating:</span>
        <SellerRatingBadge shop={shop} />
      </div>
      <SellerScoreCards shop={shop} />
    </div>
  ) : null;
};
import { PWAInstallModal } from './PWAInstallModal';
import { HERO_IMAGE_PATH } from '../data/seedData';
import { SHIPPING_METHODS, calculateShippingFee, formatDualPrice, formatPKR } from '../services/abstractions';
import { ShippingCalculationService, ShippingCalculationResponse } from '../services/shippingService';
import {
  ALL_WORLD_COUNTRIES,
  getStatesForCountry,
  getCitiesForState,
  getPostalRuleForCountry,
  getSuggestedPakistanPostalCode,
  getTehsilsForDistrict,
  verifyAddressAndIdentity,
  verifyPaymentInstrument,
  detectCardBrand,
} from '../services/addressAndPaymentVerification';
import type { PolicyPageType } from './StorePolicyPages';

// Loaded only when needed (checkout map, policy/tracking pages) to keep the first download small
const GoogleMapsAddressDetector = lazy(() =>
  import('./GoogleMapsAddressDetector').then((m) => ({ default: m.GoogleMapsAddressDetector }))
);
const StorePolicyPages = lazy(() => import('./StorePolicyPages').then((m) => ({ default: m.StorePolicyPages })));
import { AuthModal } from './AuthPanel';

type StoreSubView =
  | 'HOME'
  | 'CATALOG'
  | 'PRODUCT_DETAIL'
  | 'CHECKOUT'
  | 'ACCOUNT'
  | 'WISHLIST'
  | 'REFUND_POLICY'
  | 'TERMS'
  | 'PRIVACY_POLICY'
  | 'SHIPPING_POLICY'
  | 'CONTACT_US'
  | 'ORDER_TRACKING'
  | 'SHOP'
  | 'CAMPAIGN';


// The customer store. The admin console (/admin) and Seller Center (/seller) are separate apps with
// their own links, so nothing here leads to the admin console.
export const StorefrontView: React.FC = () => {
  const {
    products: catalogProducts,
    categories,
    reviews,
    orders,
    cart,
    wishlist,
    appliedCoupon,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    emailVerified,
    signInWithGoogle,
    signOut,
    resendVerificationEmail,
    refreshAccount,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    applyCouponCode,
    removeCoupon,
    toggleWishlist,
    placeOrder,
    acceptOrRejectShippingQuote,
    submitReview,
    showToast,
  } = useStore();

  // Live flash deals become the price (the normal price shows crossed out); re-checked every minute
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const products = useMemo(() => withFlashPrices(catalogProducts), [catalogProducts, minuteTick]);
  const campaignsLive = useMemo(() => liveCampaigns(settings), [settings, minuteTick]);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);

  const [subView, setSubView] = useState<StoreSubView>('HOME');
  // The seller whose shop page is open (#shop/<sellerId>)
  const [shopSellerId, setShopSellerId] = useState<string | null>(null);
  const openShop = (sellerId: string) => {
    setShopSellerId(sellerId);
    setSubView('SHOP');
    window.history.pushState(null, '', `#shop/${encodeURIComponent(sellerId)}`);
    window.scrollTo({ top: 0 });
  };
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [isHelplineOpen, setIsHelplineOpen] = useState(false);
  const [helplineInitialTab, setHelplineInitialTab] = useState<'AI_CHAT' | 'WHATSAPP' | 'EMAIL' | 'PHONE'>('AI_CHAT');
  const [helplineOrderNumber, setHelplineOrderNumber] = useState<string | undefined>(undefined);

  // WhatsApp number normalization for store links
  const rawWa = settings.whatsappNumber || settings.helplineWhatsApp || '923001234567';
  const cleanWa = rawWa.replace(/[^0-9]/g, '');

  // Traffic analytics: each screen is a page view; the product page and checkout are funnel steps
  useEffect(() => {
    track.pageView();
    if (subView === 'CHECKOUT') track.checkoutStarted();
  }, [subView]);
  useEffect(() => {
    if (subView === 'PRODUCT_DETAIL' && selectedProduct?.id) track.productView(selectedProduct.id);
  }, [subView, selectedProduct?.id]);

  // Festival campaign page (#campaign/<slug>)
  const campaignSlugRef = useRef('');
  useEffect(() => {
    if (subView !== 'CAMPAIGN' || openCampaign) return;
    const c = campaignsLive.find((x) => x.slug.toLowerCase() === campaignSlugRef.current);
    if (c) setOpenCampaign(c);
  }, [subView, openCampaign, campaignsLive]);
  const showCampaign = (c: Campaign) => {
    setOpenCampaign(c);
    campaignSlugRef.current = c.slug.toLowerCase();
    setSubView('CAMPAIGN');
    window.history.pushState(null, '', `#campaign/${encodeURIComponent(c.slug)}`);
    window.scrollTo({ top: 0 });
  };

  const pendingProductIdRef = useRef('');
  const [pendingProductTick, setPendingProductTick] = useState(0);

  // URL Routing for Policy and Tracking Pages
  useEffect(() => {
    const handleUrlRoute = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      // Seller ids are case-sensitive, so they are read from the original hash
      const shopMatch = /^#shop\/(.+)$/i.exec(window.location.hash);
      const campaignMatch = /^#campaign\/(.+)$/i.exec(window.location.hash);
      // A product link (#product/<id>, e.g. from a back-in-stock email): opened once the catalog is loaded
      const productMatch = /^#product\/(.+)$/i.exec(window.location.hash);
      if (productMatch) {
        pendingProductIdRef.current = decodeURIComponent(productMatch[1]);
        setPendingProductTick((n) => n + 1);
      } else if (shopMatch) {
        setShopSellerId(decodeURIComponent(shopMatch[1]));
        setSubView('SHOP');
      } else if (campaignMatch) {
        campaignSlugRef.current = decodeURIComponent(campaignMatch[1]).toLowerCase();
        setSubView('CAMPAIGN');
      } else if (path === '/refund-policy' || hash === '#refund-policy') {
        setSubView('REFUND_POLICY');
      } else if (path === '/terms' || path === '/terms-and-conditions' || hash === '#terms' || hash === '#terms-and-conditions') {
        setSubView('TERMS');
      } else if (path === '/privacy-policy' || hash === '#privacy-policy') {
        setSubView('PRIVACY_POLICY');
      } else if (path === '/shipping-policy' || hash === '#shipping-policy') {
        setSubView('SHIPPING_POLICY');
      } else if (path === '/contact' || path === '/contact-us' || hash === '#contact' || hash === '#contact-us') {
        setSubView('CONTACT_US');
      } else if (path === '/track' || path === '/track-order' || hash === '#track' || hash === '#track-order') {
        setSubView('ORDER_TRACKING');
        const params = new URLSearchParams(window.location.search);
        const ord = params.get('order');
        if (ord) setTrackingOrderInput(ord);
      }
    };

    handleUrlRoute();
    window.addEventListener('popstate', handleUrlRoute);
    window.addEventListener('hashchange', handleUrlRoute);
    return () => {
      window.removeEventListener('popstate', handleUrlRoute);
      window.removeEventListener('hashchange', handleUrlRoute);
    };
  }, []);

  // Dynamic SEO Metadata & Product Schema JSON-LD Synchronization
  React.useEffect(() => {
    if (subView === 'PRODUCT_DETAIL' && selectedProduct) {
      document.title = selectedProduct.seoTitle || `${selectedProduct.name} | ${settings.storeName}`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          selectedProduct.seoDescription || selectedProduct.shortDescription || selectedProduct.name
        );
      }
      let ldScript = document.getElementById('dynamic-product-jsonld') as HTMLScriptElement | null;
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.id = 'dynamic-product-jsonld';
        ldScript.type = 'application/ld+json';
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        description: selectedProduct.description || selectedProduct.shortDescription,
        brand: { '@type': 'Brand', name: selectedProduct.brand },
        offers: {
          '@type': 'Offer',
          price: selectedProduct.price,
          priceCurrency: 'PKR',
          availability:
            selectedProduct.stock > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
      });
    } else {
      document.title = `${settings.storeName} — Online Shopping in Pakistan`;
    }
  }, [subView, selectedProduct, settings.storeName]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('ALL');
  const [activeCollection, setActiveCollection] = useState<'ALL' | 'NEW_ARRIVALS' | 'BEST_SELLERS' | 'OFFERS'>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedSection, setMobileExpandedSection] = useState<string | null>(null);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string>('ALL');
  const [priceCeiling, setPriceCeiling] = useState<number>(500000);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING'>('RELEVANCE');

  // Product Detail state
  const [selectedVariant, setSelectedVariant] = useState<string>('Obsidian / Standard');
  const [detailQty, setDetailQty] = useState<number>(1);
  // Products this browser opened (saved on the device; shown on the home and product pages)
  const recentlyViewed = useRecentlyViewed();

  // Review Form state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  // Coupon Input in Cart
  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  // Multi-Step Checkout & Anti-Fraud Verification State (All 250+ World Countries, 5,000+ States, 150,000+ Cities)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [customerName, setCustomerName] = useState(userProfile?.name || '');
  const [customerEmail, setCustomerEmail] = useState(userProfile?.email || '');
  const [countryIso, setCountryIso] = useState('PK');
  const [country, setCountry] = useState('Pakistan');
  const [stateIso, setStateIso] = useState('PB');
  const [stateProvince, setStateProvince] = useState('Punjab');
  const [district, setDistrict] = useState('Lahore');
  const [tehsil, setTehsil] = useState('Model Town');
  const [customTehsil, setCustomTehsil] = useState('');
  const [isCustomTehsil, setIsCustomTehsil] = useState(false);
  const city = district;
  const setCity = setDistrict;
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [customerPhone, setCustomerPhone] = useState(userProfile?.phone || '');

  // Prefill checkout contact details once a signed-in customer's profile loads
  useEffect(() => {
    if (!userProfile) return;
    setCustomerName((prev) => prev || userProfile.name || '');
    setCustomerEmail((prev) => prev || userProfile.email || '');
    setCustomerPhone((prev) => prev || userProfile.phone || '');
  }, [userProfile]);
  const [shippingMethodId, setShippingMethodId] = useState(SHIPPING_METHODS[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [paymentSubMethod, setPaymentSubMethod] = useState<'RAAST' | 'RAAST_SWIFT' | 'NAYAPAY' | 'BANK'>('RAAST');

  // Customer TID & Manual Transfer Submission States
  const [bankAccountName, setBankAccountName] = useState('Meezan Bank');
  const [walletMobileNumber, setWalletMobileNumber] = useState('');
  const [walletAccountTitle, setWalletAccountTitle] = useState('');
  const [wireReferenceNumber, setWireReferenceNumber] = useState('');
  const [checkoutErrorBanner, setCheckoutErrorBanner] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const [orderNotes, setOrderNotes] = useState('');
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [confirmedSplitOrders, setConfirmedSplitOrders] = useState<Order[]>([]);
  const [confirmedOrderAccessToken, setConfirmedOrderAccessToken] = useState<string | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingOrderInput, setTrackingOrderInput] = useState('');

  // Opens the tracking page for one of the customer's orders (from the notification bell / order lists)
  const openOrderTracking = (orderNumber: string) => {
    setTrackingOrderInput(orderNumber);
    setTrackingTokenInput(tokenForOrder(orderNumber) || '');
    setSubView('ORDER_TRACKING');
    window.history.pushState(null, '', '#track');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [trackingTokenInput, setTrackingTokenInput] = useState('');
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResendingReceipt, setIsResendingReceipt] = useState(false);

  const handleTrackOrder = async (orderNum: string, tokenStr?: string) => {
    if (!orderNum || !orderNum.trim()) return;
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackedOrder(null);
    try {
      const qToken = tokenStr || confirmedOrderAccessToken || '';
      const url = `/api/orders/track?order=${encodeURIComponent(orderNum.trim())}${qToken ? `&token=${encodeURIComponent(qToken)}` : ''}`;
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success && data.order) {
        setTrackedOrder(data.order);
      } else {
        setTrackingError(data.error || 'Unable to locate order tracking details.');
      }
    } catch {
      setTrackingError('Network error while looking up order tracking details.');
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const orderParam = params.get('order');
      const tokenParam = params.get('token');
      if (orderParam) {
        setTrackingOrderInput(orderParam);
        if (tokenParam) setTrackingTokenInput(tokenParam);
        setIsTrackingModalOpen(true);
        handleTrackOrder(orderParam, tokenParam || '');
      }
    }
  }, []);

  const handleResendReceipt = async (orderNumber: string, toEmail: string) => {
    setIsResendingReceipt(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/email/resend-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderNumber, toEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendStatus(`Receipt email successfully re-dispatched to ${toEmail}!`);
      } else {
        setResendStatus(data.error || 'Failed to re-dispatch email.');
      }
    } catch {
      setResendStatus('Failed to reach email server.');
    } finally {
      setIsResendingReceipt(false);
    }
  };

  const selectedCountryRecord = useMemo(
    () => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === countryIso) || ALL_WORLD_COUNTRIES[0],
    [countryIso]
  );

  const isNationalPakistan = selectedCountryRecord.isNational;

  // Checkout Payment Gateways: Only Cash on Delivery & Manual Bank / NayaPay / Raast with TID
  const isCodAvailable = Boolean(isNationalPakistan && (settings.codEnabled ?? true));
  const isRaastAvailable = Boolean((settings.raastEnabled ?? true) || isNationalPakistan);
  const isNayaPayAvailable = Boolean(settings.nayapayEnabled ?? true);
  const isManualQuoteAvailable = Boolean(!isNationalPakistan && settings.allowInternationalManualQuotes);

  const availableStates = useMemo(
    () => getStatesForCountry(countryIso),
    [countryIso]
  );

  const availableDistricts = useMemo(
    () => getCitiesForState(countryIso, stateIso),
    [countryIso, stateIso]
  );
  const availableCities = availableDistricts;

  const availableTehsils = useMemo(
    () => getTehsilsForDistrict(district),
    [district]
  );

  const effectiveTehsil = isCustomTehsil && customTehsil.trim() ? customTehsil.trim() : tehsil;

  const postalRule = useMemo(
    () => getPostalRuleForCountry(countryIso),
    [countryIso]
  );

  const suggestedPakistanPostalCode = useMemo(() => {
    if (!isNationalPakistan) return null;
    return getSuggestedPakistanPostalCode(effectiveTehsil) || getSuggestedPakistanPostalCode(district);
  }, [isNationalPakistan, effectiveTehsil, district]);

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    const tehsils = getTehsilsForDistrict(nextDistrict);
    if (tehsils.length > 0) {
      setTehsil(tehsils[0]);
      setIsCustomTehsil(false);
      setCustomTehsil('');
    }
  };

  const handleSelectCountryByIso = (nextIso: string) => {
    const foundCountry =
      ALL_WORLD_COUNTRIES.find((c) => c.isoCode === nextIso) || ALL_WORLD_COUNTRIES[0];
    setCountryIso(foundCountry.isoCode);
    setCountry(foundCountry.name);

    const states = getStatesForCountry(foundCountry.isoCode);
    const firstState = states[0];
    const nextStateIso = firstState?.isoCode || 'CENTRAL';
    const nextStateName = firstState?.name || foundCountry.name;
    setStateIso(nextStateIso);
    setStateProvince(nextStateName);

    const districts = getCitiesForState(foundCountry.isoCode, nextStateIso);
    const defaultDistrict = districts[0]?.name || nextStateName;
    setDistrict(defaultDistrict);
    const tehsils = getTehsilsForDistrict(defaultDistrict);
    setTehsil(tehsils[0] || 'Center');
    setIsCustomTehsil(false);
    setCustomTehsil('');

    const initialPostal = foundCountry.isNational
      ? getSuggestedPakistanPostalCode(tehsils[0] || defaultDistrict) || getSuggestedPakistanPostalCode(defaultDistrict) || ''
      : '';
    setPostalCode(initialPostal);
    setCustomerPhone(userProfile?.phone || '');
  };

  const handleAddressAutoDetected = (payload: DetectedAddressPayload) => {
    // 1. Synchronize Country
    let currentCountryIso = countryIso;
    if (payload.countryIso) {
      const targetIso = payload.countryIso.toUpperCase();
      const foundCountry =
        ALL_WORLD_COUNTRIES.find((c) => c.isoCode === targetIso) ||
        ALL_WORLD_COUNTRIES.find(
          (c) => c.name.toLowerCase() === payload.countryName?.toLowerCase()
        );
      if (foundCountry) {
        currentCountryIso = foundCountry.isoCode;
        if (foundCountry.isoCode !== countryIso) {
          setCountryIso(foundCountry.isoCode);
          setCountry(foundCountry.name);
        }
      }
    }

    // 2. Synchronize State / Province
    const availableSts = getStatesForCountry(currentCountryIso);
    let targetStateIso = stateIso;
    let targetStateName = stateProvince;

    if (payload.stateProvince && availableSts.length > 0) {
      const stQuery = payload.stateProvince.toLowerCase().trim();
      const matchedState = availableSts.find(
        (s) =>
          s.name.toLowerCase() === stQuery ||
          stQuery.includes(s.name.toLowerCase()) ||
          s.name.toLowerCase().includes(stQuery) ||
          s.isoCode.toLowerCase() === stQuery
      );
      if (matchedState) {
        targetStateIso = matchedState.isoCode;
        targetStateName = matchedState.name;
        setStateIso(matchedState.isoCode);
        setStateProvince(matchedState.name);
      } else {
        targetStateName = payload.stateProvince;
        setStateProvince(payload.stateProvince);
      }
    }

    // 3. Synchronize District / City & Tehsil
    const curDistricts = getCitiesForState(currentCountryIso, targetStateIso);
    let finalDistrict = district;

    if (payload.district || payload.cityDistrict) {
      const rawCity = (payload.district || payload.cityDistrict || '').trim();
      const cleanTarget = rawCity
        .replace(/\b(District|Tehsil|City|Division|Sub-District)\b/gi, '')
        .trim();

      const matchedDistrict = curDistricts.find(
        (d) =>
          d.name.toLowerCase() === cleanTarget.toLowerCase() ||
          cleanTarget.toLowerCase().includes(d.name.toLowerCase()) ||
          d.name.toLowerCase().includes(cleanTarget.toLowerCase())
      );

      finalDistrict = matchedDistrict ? matchedDistrict.name : (cleanTarget || rawCity);
      setDistrict(finalDistrict);

      const tehsils = getTehsilsForDistrict(finalDistrict);
      if (tehsils.length > 0) {
        const matchedTehsil = tehsils.find(
          (t) =>
            payload.streetAddress?.toLowerCase().includes(t.toLowerCase()) ||
            payload.formattedAddress?.toLowerCase().includes(t.toLowerCase())
        );
        setTehsil(matchedTehsil || tehsils[0]);
        setIsCustomTehsil(false);
      }
    }

    // 4. Synchronize Postal / ZIP Code (Guaranteed Auto-Fill!)
    const autoPostal =
      payload.postalCode?.trim() ||
      getSuggestedPakistanPostalCode(finalDistrict) ||
      (finalDistrict ? getSuggestedPakistanPostalCode(getTehsilsForDistrict(finalDistrict)[0]) : null) ||
      '';

    if (autoPostal) {
      setPostalCode(autoPostal);
    }

    // 5. Synchronize Complete Street Address
    if (payload.streetAddress && payload.streetAddress.trim()) {
      setStreetAddress(payload.streetAddress.trim());
    } else if (payload.formattedAddress && payload.formattedAddress.trim()) {
      setStreetAddress(payload.formattedAddress.trim());
    }
  };

  // Ensure active payment method is strictly valid and configured for destination country
  React.useEffect(() => {
    const isCurrentValid =
      (paymentMethod === 'COD' && isCodAvailable) ||
      ((paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && isRaastAvailable) ||
      (paymentMethod === 'NAYAPAY' && isNayaPayAvailable) ||
      (paymentMethod === 'MANUAL_QUOTE' && isManualQuoteAvailable);

    if (!isCurrentValid) {
      if (isNationalPakistan) {
        if (isCodAvailable) {
          setPaymentMethod('COD');
        } else if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST');
        } else if (isNayaPayAvailable) {
          setPaymentMethod('NAYAPAY');
          setPaymentSubMethod('NAYAPAY');
        }
      } else {
        if (isManualQuoteAvailable) {
          setPaymentMethod('MANUAL_QUOTE');
        } else if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST_SWIFT');
        }
      }
    }
  }, [
    isNationalPakistan,
    paymentMethod,
    isCodAvailable,
    isRaastAvailable,
    isNayaPayAvailable,
    isManualQuoteAvailable,
  ]);

  const addressVerification = useMemo(
    () =>
      verifyAddressAndIdentity({
        countryIsoCode: countryIso,
        countryName: country,
        stateName: stateProvince,
        cityName: district,
        districtName: district,
        tehsilName: effectiveTehsil,
        streetAddress,
        postalCode,
        phone: customerPhone,
        email: customerEmail || userProfile?.email || '',
      }),
    [
      countryIso,
      country,
      stateProvince,
      district,
      effectiveTehsil,
      streetAddress,
      postalCode,
      customerPhone,
      customerEmail,
      userProfile?.email,
    ]
  );

  const paymentVerification = useMemo(
    () =>
      verifyPaymentInstrument({
        isNationalPakistan,
        paymentMethod,
        paymentSubMethod,
        walletMobileNumber,
        walletAccountTitle,
        wireReferenceNumber,
        bankAccountName,
      }),
    [
      isNationalPakistan,
      paymentMethod,
      paymentSubMethod,
      walletMobileNumber,
      walletAccountTitle,
      wireReferenceNumber,
      bankAccountName,
    ]
  );

  // Header menu with only the entries that have products
  const navSections = useMemo(() => buildNavSections(products), [products]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.status === 'ACTIVE')
      .filter((p) => {
        // Category / subcategory (header menu or sidebar); see src/data/navMatch.ts
        if (!productMatchesNav(p, activeCategory, activeSubcategory)) return false;

        // Collection filter
        if (activeCollection === 'NEW_ARRIVALS' && !p.newArrival) return false;
        if (activeCollection === 'BEST_SELLERS' && !p.bestSeller) return false;
        if (activeCollection === 'OFFERS' && !(p.compareAtPrice && p.compareAtPrice > p.price)) return false;

        // Brand filter
        if (activeBrand !== 'ALL' && p.brand.trim().toLowerCase() !== activeBrand.trim().toLowerCase()) return false;
        if (p.price > priceCeiling) return false;
        if (inStockOnly && p.stock <= 0) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const tokens = q.split(/\s+/).filter(Boolean);
          const fullText = `${p.name} ${p.category} ${p.subcategory || ''} ${p.brand} ${p.sku} ${p.shortDescription || ''} ${p.description || ''} ${p.seoKeywords || ''}`.toLowerCase();

          // Smart synonyms
          if ((q.includes('kid') || q.includes('child') || q.includes('bach')) && (p.category.toLowerCase() === 'children' || (p.subcategory || '').toLowerCase().includes('kid'))) {
            return true;
          }
          if ((q.includes('perfume') || q.includes('fragrance') || q.includes('scent')) && p.category.toLowerCase() === 'fragrance') {
            return true;
          }
          if ((q.includes('watch') || q.includes('ghari')) && (p.category.toLowerCase() === 'watches' || p.category.toLowerCase() === 'horology')) {
            return true;
          }

          return tokens.every((token) => fullText.includes(token));
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PRICE_ASC') return a.price - b.price;
        if (sortBy === 'PRICE_DESC') return b.price - a.price;
        // Fair "Top rated": real averages weighted by how many reviews they have (see rankScore)
        if (sortBy === 'RATING') {
          return rankScore(b.rating, b.reviewCount) - rankScore(a.rating, a.reviewCount) || (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
        }
        if (sortBy === 'NEWEST') return b.createdAt.localeCompare(a.createdAt);
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
  }, [products, activeCategory, activeSubcategory, activeCollection, activeBrand, priceCeiling, inStockOnly, searchQuery, sortBy]);

  // The catalog grid shows products in steps so phones never render thousands of cards at once
  const CATALOG_STEP = 24;
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(CATALOG_STEP);
  useEffect(() => {
    setCatalogVisibleCount(CATALOG_STEP);
  }, [activeCategory, activeSubcategory, activeCollection, activeBrand, priceCeiling, inStockOnly, searchQuery, sortBy]);
  const visibleCatalogProducts = useMemo(
    () => filteredProducts.slice(0, catalogVisibleCount),
    [filteredProducts, catalogVisibleCount]
  );

  const brands = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.brand));
    return Array.from(set);
  }, [products]);

  // Cart Calculations
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const couponAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'PERCENTAGE') {
      const raw = (cartSubtotal * appliedCoupon.value) / 100;
      return appliedCoupon.maxDiscount ? Math.min(raw, appliedCoupon.maxDiscount) : raw;
    }
    if (appliedCoupon.type === 'FIXED') {
      return Math.min(cartSubtotal, appliedCoupon.value);
    }
    return 0;
  }, [cartSubtotal, appliedCoupon]);

  // Abandoned checkout: with the customer's consent, the cart and phone are saved (at most once a
  // minute) so the store can send one WhatsApp reminder if the order is not finished
  const [cartReminderConsent, setCartReminderConsent] = useState(true);
  const lastCartSave = useRef(0);
  useEffect(() => {
    if (subView !== 'CHECKOUT' || !cartReminderConsent || !cart.length) return;
    const phone = String(customerPhone || '').replace(/[^\d+]/g, '');
    if (!/^(\+?92|0)3\d{9}$/.test(phone)) return;
    const t = setTimeout(() => {
      if (Date.now() - lastCartSave.current < 60_000) return;
      lastCartSave.current = Date.now();
      fetch('/api/carts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: customerName,
          consent: true,
          items: cart.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.price })),
        }),
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [subView, cartReminderConsent, cart, customerPhone, customerName]);

  // Refer & Earn credit the signed-in customer can use (the server applies the same cap)
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [useCredit, setUseCredit] = useState(true);
  useEffect(() => {
    if (!firebaseUser || subView !== 'CHECKOUT') return;
    fetchReferral().then(setReferral).catch(() => {});
  }, [firebaseUser, subView]);
  const creditAmount = useMemo(() => {
    if (!useCredit || !referral?.enabled || !(referral.available > 0)) return 0;
    const cap = (cartSubtotal * Math.min(100, referral.maxPercentOfOrder ?? referralOf(settings).maxPercentOfOrder)) / 100;
    return Math.floor(Math.min(referral.available, Math.max(0, cap - (appliedCoupon?.id === 'welcome-offer' ? couponAmount : 0))));
  }, [useCredit, referral, cartSubtotal, settings, appliedCoupon, couponAmount]);
  const discountAmount = couponAmount + creditAmount;

  // Live Country & Courier Shipping Calculation
  const liveShippingCalc = useMemo<ShippingCalculationResponse>(() => {
    return ShippingCalculationService.calculate({
      destinationCountryIso: countryIso,
      items: cart,
      catalogProducts: products,
      settings,
      selectedCourier: shippingMethodId,
      hasFreeShippingCoupon: appliedCoupon?.type === 'FREE_SHIPPING',
      discountPkr: discountAmount,
    });
  }, [countryIso, cart, products, settings, shippingMethodId, appliedCoupon, discountAmount]);

  const isQuoteFlow = liveShippingCalc.requiresManualQuote || paymentMethod === 'MANUAL_QUOTE';

  // Shipping fee in PKR (same unit as product prices and the server-side order total)
  const shippingFee = useMemo(() => {
    if (isQuoteFlow) return 0;
    return Number(liveShippingCalc.finalShippingFee.toFixed(2));
  }, [isQuoteFlow, liveShippingCalc.finalShippingFee]);

  // Tax: Sales tax applies to domestic Pakistan orders; international is export (0% PK sales tax, customs handled at destination DAP)
  const taxAmount = useMemo(() => {
    if (!isNationalPakistan) return 0;
    const taxable = Math.max(0, cartSubtotal - discountAmount);
    return Number(((taxable * (settings.taxRate || 0)) / 100).toFixed(2));
  }, [isNationalPakistan, cartSubtotal, discountAmount, settings.taxRate]);

  const grandTotal = Number(
    (Math.max(0, cartSubtotal - discountAmount) + taxAmount + shippingFee).toFixed(2)
  );

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setDetailQty(1);
    setSelectedVariant(
      product.category === 'Horology'
        ? '40mm Titanium / Sapphire'
        : product.category === 'Fragrance'
        ? '100ml Extrait Flacon'
        : 'Obsidian / Brushed Brass'
    );
    recentlyViewed.remember(product.id);
    setSubView('PRODUCT_DETAIL');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Opens the product of a #product/<id> link as soon as it is in the catalog
  useEffect(() => {
    const id = pendingProductIdRef.current;
    if (!id) return;
    const p = products.find((x) => x.id === id);
    if (!p) return;
    pendingProductIdRef.current = '';
    handleSelectProduct(p);
  }, [pendingProductTick, products]);

  // Brings a missing checkout field into view and focuses it, so the customer sees what is missing
  const focusCheckoutField = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    }, 120);
  };

  const handleConfirmAddress = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((customerName || userProfile?.name || '').trim().length < 2) {
      setCheckoutErrorBanner('Enter your full name, the name the parcel will be addressed to.');
      focusCheckoutField('checkout-customer-name');
      return;
    }
    if (!addressVerification.isFullyVerified) {
      setCheckoutErrorBanner(
        'Address Verification Incomplete: Please fill all required address fields (Receiver Phone, Complete Street Address, Tehsil, Postal Code) before proceeding to payment.'
      );
      return;
    }
    setCheckoutErrorBanner(null);
    setCheckoutStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmittingOrder) return;

    // If on Step 1, submitting confirms the address and transitions to Step 2
    if (checkoutStep === 1) {
      handleConfirmAddress(e);
      return;
    }

    if (!addressVerification.isFullyVerified) {
      setCheckoutErrorBanner(
        'Please complete all required delivery details (Receiver Phone, Email and Complete Street Address) before continuing.'
      );
      setCheckoutStep(1);
      return;
    }

    if ((customerName || userProfile?.name || '').trim().length < 2) {
      setCheckoutErrorBanner('Enter your full name, the name the parcel will be addressed to.');
      setCheckoutStep(1);
      focusCheckoutField('checkout-customer-name');
      return;
    }

    if (!paymentVerification.valid) {
      setCheckoutErrorBanner(paymentVerification.message);
      return;
    }

    setCheckoutErrorBanner(null);

    // Direct submit for Cash on Delivery or Manual Transfer with TID (stays PENDING_VERIFICATION)
    setIsSubmittingOrder(true);
    try {
      // Street + area only; the server appends city, province, postal code, country and phone
      const fullAddress = `${streetAddress.trim()}${effectiveTehsil ? `, ${effectiveTehsil}` : ''}`;
      const isCod = paymentMethod === 'COD';
      const effectiveTid = isCod
        ? 'COD_DOORSTEP'
        : wireReferenceNumber.trim();
      // Customer's own note only; payment details are stored in their own order fields
      const customerNote = [
        orderNotes.trim(),
        !isCod && walletAccountTitle ? `Sender title: ${walletAccountTitle}` : '',
        !isCod && walletMobileNumber ? `Sender account: ${walletMobileNumber}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const proofSummary = isCod
        ? 'Cash on Delivery at Destination Address'
        : `Manual ${paymentMethod === 'NAYAPAY' ? 'NayaPay' : 'Bank/RAAST'} Transfer · TID: ${effectiveTid}`;

      const order = await placeOrder({
        customerName: customerName || userProfile?.name || 'Guest Customer',
        customerEmail: customerEmail || userProfile?.email || 'guest@example.com',
        customerPhone,
        destCountryIso: countryIso,
        shippingAddressSummary: fullAddress,
        district,
        tehsil: effectiveTehsil,
        stateProvince,
        postalCode: postalCode.trim(),
        countryName: country,
        shippingMethodId: liveShippingCalc.carrier,
        shippingFee: liveShippingCalc.finalShippingFee,
        paymentMethod,
        paymentSubMethod,
        paymentReference: isCod ? undefined : effectiveTid,
        paymentProofDetails: proofSummary,
        notes: customerNote || undefined,
        isQuoteRequest: isQuoteFlow,
        directAutoDebit: false,
        ...({ useReferralCredit: creditAmount > 0 } as any),
      });
      setConfirmedOrderNumber(order.orderNumber);
      setConfirmedSplitOrders(order.splitOrders || []);
      if (order.orderAccessToken) {
        setConfirmedOrderAccessToken(order.orderAccessToken);
        // Lets this device show the orders' updates and list them under "your orders"
        // (one order per seller; they share the checkout's access token)
        for (const o of order.splitOrders?.length ? order.splitOrders : [order]) {
          rememberOrder(o.orderNumber, order.orderAccessToken);
        }
      }
      setCheckoutStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitErr: any) {
      const rawMessage = submitErr?.message || '';
      let friendlyMsg = 'We were unable to complete your order right now. Please verify your details and tap Submit Order again.';

      if (
        rawMessage.toLowerCase().includes('insufficient stock') ||
        rawMessage.toLowerCase().includes('out of stock') ||
        rawMessage.toLowerCase().includes('stock')
      ) {
        friendlyMsg = 'One or more items in your cart has limited inventory or has sold out. Please adjust the item quantities in your cart and try again.';
      } else if (
        rawMessage.toLowerCase().includes('strictly restricted to pakistan') ||
        rawMessage.toLowerCase().includes('cash on delivery')
      ) {
        friendlyMsg = 'Cash on Delivery (COD) is available only within Pakistan. For international delivery, please select an advance payment method.';
      } else if (
        rawMessage.toLowerCase().includes('network') ||
        rawMessage.toLowerCase().includes('failed to fetch')
      ) {
        friendlyMsg = 'A temporary network interruption occurred. Your cart has been safely preserved. Please check your internet connection and try again.';
      } else if (
        rawMessage.toLowerCase().includes('address') ||
        rawMessage.toLowerCase().includes('phone') ||
        rawMessage.toLowerCase().includes('tehsil')
      ) {
        friendlyMsg = 'Please verify that your delivery address, receiver phone number, and district/tehsil are completely filled.';
      } else if (rawMessage) {
        friendlyMsg = rawMessage;
      }

      setCheckoutErrorBanner(friendlyMsg);
      // Ensure error is brought into customer's view
      setTimeout(() => {
        const errorEl = document.getElementById('checkout-friendly-error');
        if (errorEl) {
          errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !reviewComment.trim()) return;
    await submitReview({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      rating: reviewRating,
      title: reviewTitle || 'Exceptional Craftsmanship',
      comment: reviewComment,
    });
    setReviewTitle('');
    setReviewComment('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFBF9] text-[#141413] overflow-x-clip">
      {/* Slim Announcement Bar with 24/7 Helpline */}
      <div className="bg-[#141413] text-[#FBFBF9] text-xs py-2 px-6 flex flex-wrap items-center justify-between gap-2 tracking-wide">
        <span className="truncate">
          {settings.announcementText ||
            `Free delivery on orders above PKR ${(settings.domesticFreeShippingThreshold || 10000).toLocaleString()} · Cash on Delivery available`}
        </span>
        <div className="flex items-center gap-3 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => {
              setHelplineInitialTab('AI_CHAT');
              setIsHelplineOpen(true);
            }}
            className="text-white/80 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Headphones className="w-3 h-3 text-emerald-400" />
            <span>Help &amp; Support</span>
          </button>
          <span className="text-white/30">|</span>
          <button
            type="button"
            onClick={() => {
              setHelplineInitialTab('WHATSAPP');
              setIsHelplineOpen(true);
            }}
            className="text-emerald-300 hover:text-emerald-200 font-medium flex items-center gap-1 cursor-pointer"
          >
            <MessageCircle className="w-3 h-3 text-emerald-400" />
            <span>WhatsApp: {settings.helplineWhatsAppFormatted || settings.helplineWhatsApp || 'Contact Support'}</span>
          </button>
        </div>
      </div>

      {/* Top Bar Contract: Zone 1 Brand Wordmark | Zone 2 Dropdown Nav Links | Zone 3 Actions */}
      <header className="sticky top-0 z-30 bg-[#FBFBF9]/95 backdrop-blur-md border-b border-black/[0.07]">
        {/* Row 1: brand | search | actions */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-5">
          {/* Mobile / tablet menu hamburger (the nav row only shows on large screens) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="xl:hidden p-2 -ml-2 text-neutral-700 hover:text-black cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand wordmark */}
          <button
            onClick={() => {
              setActiveCategory('ALL');
              setActiveSubcategory('ALL');
              setActiveCollection('ALL');
              setSubView('HOME');
            }}
            className="shrink-0 cursor-pointer max-w-[52vw] min-w-0"
            aria-label={`${settings.storeName} home`}
          >
            <BrandLogo name={settings.storeName} />
          </button>

          {/* Global search */}
          <div className="flex-1 max-w-xl mx-2 hidden sm:block min-w-0">
            <GlobalHeaderSearch
              products={products}
              categories={categories}
              onSelectProduct={handleSelectProduct}
              onViewAllResults={(q, cat) => {
                setSearchQuery(q);
                if (cat) setActiveCategory(cat);
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>

          {/* Primary actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setHelplineInitialTab('AI_CHAT');
                setIsHelplineOpen(true);
              }}
              className="hidden sm:flex px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full text-xs font-semibold items-center gap-1.5 transition-colors cursor-pointer"
              title="Helpline (AI Chat, WhatsApp, Email)"
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="hidden xl:inline">Helpline</span>
            </button>

            <button
              onClick={() => setSubView('WISHLIST')}
              aria-label="Wishlist"
              className="p-2 text-[#575653] hover:text-[#141413] transition-colors relative cursor-pointer flex items-center"
            >
              <Heart className="w-5 h-5 stroke-[1.5]" />
              {wishlist.length > 0 && (
                <span className="ml-0.5 text-xs font-mono tabular-nums text-[#141413]">{wishlist.length}</span>
              )}
            </button>

            <CustomerNotificationsBell onOpenOrder={openOrderTracking} />

            <button
              onClick={() => setCartDrawerOpen(true)}
              className="px-3 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium flex items-center gap-1.5 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
              aria-label="Shopping bag"
            >
              <ShoppingBag className="w-4 h-4 stroke-[1.5]" />
              <span className="hidden sm:inline">Bag</span>
              <span className="font-mono tabular-nums">({cartCount})</span>
            </button>

            <button
              onClick={() => {
                if (!firebaseUser) {
                  setAuthModalOpen(true);
                } else {
                  setSubView('ACCOUNT');
                }
              }}
              className="px-2.5 sm:px-3 py-2 border border-[#141413] text-[#141413] text-xs font-medium hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              title={firebaseUser ? 'My account' : 'Login / Sign up'}
              aria-label={firebaseUser ? 'My account' : 'Login / Sign up'}
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[90px] truncate">
                {firebaseUser ? (userProfile?.name || 'Account').split(' ')[0] : 'Login'}
              </span>
            </button>
          </div>
        </div>

        {/* Row 2 (wide screens, 1280px+): navigation links + track order */}
        <div className="hidden xl:block border-t border-black/[0.05]">
          <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between gap-4">
          <nav className="flex items-center min-w-0">
            <HeaderNavDropdowns
              sections={navSections}
              activeCategory={activeCategory}
              activeSubcategory={activeSubcategory}
              activeCollection={activeCollection}
              subView={subView}
              onSelectCategory={(cat, subcat, col) => {
                setActiveCategory(cat);
                setActiveSubcategory(subcat || 'ALL');
                setActiveCollection((col as any) || 'ALL');
                setSearchQuery('');
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateHome={() => {
                setActiveCategory('ALL');
                setActiveSubcategory('ALL');
                setActiveCollection('ALL');
                setSubView('HOME');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateOffers={() => {
                setActiveCategory('ALL');
                setActiveSubcategory('ALL');
                setActiveCollection('OFFERS');
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenTrackOrder={() => {
                setSubView('ORDER_TRACKING');
                window.history.pushState(null, '', '#track');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenContact={() => {
                setSubView('CONTACT_US');
                window.history.pushState(null, '', '#contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenAbout={() => setAboutModalOpen(true)}
            />
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSubView('ORDER_TRACKING');
                window.history.pushState(null, '', '#track');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center px-3.5 py-1.5 border border-neutral-300 rounded-full text-xs font-medium text-neutral-800 hover:border-black hover:text-black transition-colors whitespace-nowrap cursor-pointer"
            >
              Track an order
            </button>
            <PWAInstallButton variant="header" />
          </div>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="sm:hidden px-4 py-2 border-t border-black/[0.05] bg-[#FBFBF9] flex items-center gap-2">
          <div className="flex-1">
            <GlobalHeaderSearch
              products={products}
              categories={categories}
              onSelectProduct={handleSelectProduct}
              onViewAllResults={(q, cat) => {
                setSearchQuery(q);
                if (cat) setActiveCategory(cat);
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        </div>
      </header>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Mobile Slide-Over Navigation Drawer with Accordion Sections */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
              <BrandLogo name={settings.storeName} size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-neutral-500 hover:text-black cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('ALL');
                  setActiveSubcategory('ALL');
                  setActiveCollection('ALL');
                  setSubView('HOME');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-black"
              >
                Home
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (firebaseUser) {
                    setSubView('ACCOUNT');
                  } else {
                    setAuthModalOpen(true);
                  }
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800 flex items-center justify-between"
              >
                <span>{firebaseUser ? 'My Account' : 'Login / Sign up'}</span>
                <User className="w-4 h-4 text-neutral-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setHelplineInitialTab('AI_CHAT');
                  setIsHelplineOpen(true);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800 flex items-center justify-between"
              >
                <span>Helpline</span>
                <Headphones className="w-4 h-4 text-emerald-600" />
              </button>

              {navSections.map((section) => {
                const isExpanded = mobileExpandedSection === section.id;
                return (
                  <div key={section.id} className="border-b border-neutral-100 pb-2">
                    <button
                      type="button"
                      onClick={() => setMobileExpandedSection(isExpanded ? null : section.id)}
                      className="w-full flex items-center justify-between py-2 px-3 text-sm font-semibold text-neutral-800 hover:text-black"
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="pl-4 pr-2 py-1 space-y-1 bg-neutral-50/50 rounded">
                        {section.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveCategory(item.categoryFilter);
                              setActiveSubcategory(item.subcategoryFilter || 'ALL');
                              setActiveCollection(item.collectionFilter || 'ALL');
                              setSubView('CATALOG');
                              setMobileMenuOpen(false);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black hover:bg-white rounded flex items-center justify-between"
                          >
                            <span>{item.name}</span>
                            <span className="text-[10px] text-neutral-400 font-mono">{item.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setActiveCategory('ALL');
                  setActiveSubcategory('ALL');
                  setActiveCollection('OFFERS');
                  setSubView('CATALOG');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-red-600 flex items-center justify-between"
              >
                <span>Special Offers</span>
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono">SALE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSubView('ORDER_TRACKING');
                  window.history.pushState(null, '', '#track');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800 flex items-center justify-between"
              >
                <span>Track Your Order</span>
                <Package className="w-4 h-4 text-[#8C6D46]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAboutModalOpen(true);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800"
              >
                About Us
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSubView('CONTACT_US');
                  window.history.pushState(null, '', '#contact');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800 flex items-center justify-between"
              >
                <span>Contact &amp; WhatsApp Support</span>
                <MessageCircle className="w-4 h-4 text-emerald-600" />
              </button>

              {/* Mobile Legal & Customer Care Policies */}
              <div className="pt-2 border-t border-neutral-100 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 px-3 block">
                  Customer Care &amp; Policies
                </span>
                <a
                  href="/seller"
                  className="block w-full text-left py-1.5 px-3 text-xs font-semibold text-[#86672A] hover:text-black rounded"
                >
                  Sell on {settings.storeName || 'My Store'} → Seller Center
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSubView('REFUND_POLICY');
                    window.history.pushState(null, '', '#refund-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black rounded"
                >
                  Refund &amp; Return Policy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSubView('SHIPPING_POLICY');
                    window.history.pushState(null, '', '#shipping-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black rounded"
                >
                  Shipping &amp; Delivery Policy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSubView('TERMS');
                    window.history.pushState(null, '', '#terms');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black rounded"
                >
                  Terms &amp; Conditions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSubView('PRIVACY_POLICY');
                    window.history.pushState(null, '', '#privacy-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black rounded"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About Us Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white max-w-lg w-full p-6 sm:p-8 rounded-lg shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setAboutModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-black cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-xs uppercase tracking-widest text-[#8C6D46] font-semibold">
              About us
            </div>
            <h3 className="text-2xl font-display font-medium text-black">
              About {settings.storeName}
            </h3>
            {(settings.aboutText ||
              `${settings.storeName} is an online store delivering useful everyday products across Pakistan.\nOrder online, pay Cash on Delivery or by bank transfer, and track your parcel with the courier tracking number we share once it is dispatched.`)
              .split('\n')
              .filter((line) => line.trim())
              .map((line, i) => (
                <p key={i} className="text-sm text-neutral-600 leading-relaxed">
                  {line}
                </p>
              ))}
            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="px-5 py-2 bg-black text-white text-xs font-semibold rounded hover:bg-neutral-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {/* ======================== 1. HOME VIEW ======================== */}
        {subView === 'HOME' && (
          <div>
            {/* Festival / event campaigns (Eid, Black Friday, ...) and flash deals with a countdown */}
            <CampaignBanners campaigns={campaignsLive} onOpen={showCampaign} />
            <DailyDeals
              products={products}
              onSelect={handleSelectProduct}
              onAdd={(p) => addToCart(p, 1)}
              Image={({ src, alt }) => <ProductImage src={src} alt={alt} className="w-full h-full object-cover" />}
            />

            {/* What this visitor looked at before (saved on their device only) */}
            {recentlyViewed.ids.length > 0 && (
              <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8">
                <RecentlyViewedStrip
                  ids={recentlyViewed.ids}
                  products={products}
                  onSelect={handleSelectProduct}
                  onClear={recentlyViewed.clear}
                />
              </div>
            )}

            {/* Section 1: Storefront Hero */}
            <section className="relative border-b border-black/[0.07]">
              <div className="max-w-[1360px] mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-5 space-y-6">
                  <div className="text-xs tracking-widest uppercase text-[#8C6D46] font-medium">
                    {settings.heroEyebrow || 'Cash on Delivery · All over Pakistan'}
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-display font-medium leading-[1.08] tracking-tight text-[#141413]">
                    {settings.heroTitle || settings.tagline || `Welcome to ${settings.storeName || 'our store'}`}
                  </h1>
                  <p className="text-base text-[#575653] leading-relaxed max-w-xl">
                    {settings.heroSubtitle ||
                      'Quality products at fair prices, delivered to your door. Order now and pay when your parcel arrives.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setSubView('CATALOG');
                      }}
                      className="px-6 py-3.5 bg-[#141413] text-[#FBFBF9] text-sm font-medium flex items-center gap-3 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Shop Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="pt-4 border-t border-black/[0.06] flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[#575653]">
                    {(settings.heroHighlights || 'Cash on Delivery|Nationwide Delivery|Easy Returns')
                      .split('|')
                      .map((h) => h.trim())
                      .filter(Boolean)
                      .map((h, i) => (
                        <React.Fragment key={h}>
                          {i > 0 && <span aria-hidden="true">·</span>}
                          <span>{h}</span>
                        </React.Fragment>
                      ))}
                  </div>
                </div>

                <div className="lg:col-span-7">
                  {(() => {
                    // Admin-chosen banner, otherwise the first featured / active product photo
                    const heroProduct =
                      products.find((p) => p.status === 'ACTIVE' && p.featured && p.primaryImage) ||
                      products.find((p) => p.status === 'ACTIVE' && p.primaryImage);
                    const heroSrc = settings.heroImageUrl || heroProduct?.primaryImage || HERO_IMAGE_PATH;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!settings.heroImageUrl && heroProduct) handleSelectProduct(heroProduct);
                          else {
                            setActiveCategory('ALL');
                            setSubView('CATALOG');
                          }
                        }}
                        className="block aspect-[16/9] w-full overflow-hidden bg-[#F3F2EE] relative cursor-pointer"
                      >
                        <ProductImage src={heroSrc} alt={heroProduct?.name || settings.storeName} className="w-full h-full object-cover" />
                        {!settings.heroImageUrl && heroProduct && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex items-end p-6">
                            <div className="text-white text-sm font-semibold tracking-wide text-left [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                              {heroProduct.name} · {formatPKR(heroProduct.price)}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </section>

            {/* Section 2: Featured Collection Grid (with Category Filter Bar) */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24 border-b border-black/[0.07]">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46] mb-2">
                    Our Products
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                    Featured Products
                  </h2>
                </div>

                {/* Interactive Segmented Category Filter */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#EBEAE5] border border-black/20">
                  <button
                    onClick={() => {
                      setActiveCategory('ALL');
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      activeCategory === 'ALL' && activeSubcategory === 'ALL' && activeCollection === 'ALL'
                        ? 'bg-black text-white shadow-sm'
                        : 'text-black hover:bg-black/10'
                    }`}
                  >
                    All Products ({products.filter((p) => p.status === 'ACTIVE').length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setActiveCategory(cat.name);
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        activeCategory.toLowerCase() === cat.name.toLowerCase()
                          ? 'bg-black text-white shadow-sm'
                          : 'text-black hover:bg-black/10'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Column Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProducts.slice(0, 12).map((product) => (
                  <article
                    key={product.id}
                    data-pid={product.id}
                    className="group flex flex-col justify-between border border-black/15 bg-white transition-transform duration-150 hover:-translate-y-0.5 shadow-sm"
                  >
                    <div>
                      <div
                        onClick={() => handleSelectProduct(product)}
                        className="aspect-[4/3] w-full bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                      >
                        <ProductImage
                          src={product.primaryImage}
                          alt={product.name}
                          category={product.category}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id);
                          }}
                          aria-label={`Save ${product.name}`}
                          className="absolute top-3 right-3 p-2 bg-white/90 text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              wishlist.includes(product.id) ? 'fill-current' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="p-5">
                        {/* Unboxed metadata */}
                        <div className="flex items-center gap-2 text-xs font-bold text-stone-900 mb-1.5">
                          <span className="uppercase tracking-wider">{product.brand}</span>
                          <span aria-hidden="true">·</span>
                          <span>{product.category}</span>
                          {product.stock <= (product.lowStockThreshold || 5) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-red-700 font-extrabold">
                                Only {product.stock} left
                              </span>
                            </>
                          )}
                        </div>

                        <h3
                          onClick={() => handleSelectProduct(product)}
                          className="text-base font-extrabold text-black group-hover:text-stone-700 transition-colors cursor-pointer line-clamp-1"
                        >
                          {product.name}
                        </h3>

                        <ProductRatingBadge rating={product.rating} reviewCount={product.reviewCount} className="mt-1" />

                        <p className="text-xs text-black font-medium mt-1.5 line-clamp-2 leading-relaxed">
                          {product.shortDescription}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-5 pt-3 border-t border-black/10 flex items-center justify-between gap-4">
                      <div className="font-mono tabular-nums">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-extrabold text-black">
                            {formatPKR(product.price)}
                          </span>
                          {product.compareAtPrice && product.compareAtPrice > product.price && (
                            <span className="text-xs text-stone-600 line-through font-semibold">
                              {formatPKR(product.compareAtPrice)}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => addToCart(product, 1)}
                        className="px-3.5 py-2 bg-black text-white text-xs font-bold hover:bg-stone-800 transition-colors whitespace-nowrap cursor-pointer shadow-sm"
                      >
                        Add to Bag
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-12 text-center">
                <button
                  onClick={() => setSubView('CATALOG')}
                  className="px-8 py-3.5 border border-[#141413] text-xs font-semibold uppercase tracking-widest text-[#141413] hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                >
                  View Complete Catalog ({products.filter((p) => p.status === 'ACTIVE').length} Pieces)
                </button>
              </div>
            </section>

            {/* Section 3: Provenance, Quantitative Craftsmanship & Client Proof */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                    Why shop with us
                  </div>
                  <h2 className="text-3xl font-display font-medium text-[#141413]">
                    Easy ordering, delivered across Pakistan.
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-black/[0.07] text-sm">
                    <div className="flex gap-3">
                      <Truck className="w-5 h-5 text-[#8C6D46] shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Cash on Delivery</div>
                        <div className="text-xs text-[#575653] mt-0.5">Pay when the parcel reaches you.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Package className="w-5 h-5 text-[#8C6D46] shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Track your order</div>
                        <div className="text-xs text-[#575653] mt-0.5">Courier tracking number shared on dispatch.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <MessageCircle className="w-5 h-5 text-[#8C6D46] shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">WhatsApp support</div>
                        <div className="text-xs text-[#575653] mt-0.5">
                          {settings.helplineWhatsAppFormatted || settings.helplineWhatsApp || 'Message us any time.'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <RotateCcw className="w-5 h-5 text-[#8C6D46] shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Returns</div>
                        <div className="text-xs text-[#575653] mt-0.5">As per our refund &amp; return policy.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reviews.slice(0, 2).map((rev) => (
                    <blockquote
                      key={rev.id}
                      className="p-6 bg-white border border-black/[0.07] flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-[#8C6D46]">
                          <span className="font-mono tabular-nums">{rev.rating}.0 / 5.0</span>
                          <span aria-hidden="true">·</span>
                          <span>Customer review</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{rev.title}</h3>
                        <p className="text-xs text-[#575653] leading-relaxed">“{rev.comment}”</p>
                      </div>
                      <footer className="pt-3 border-t border-black/[0.05] text-xs text-[#141413] font-medium">
                        {rev.authorName}
                        {rev.productName && (
                          <span className="block text-[11px] text-[#787774] font-normal mt-0.5">
                            Product: {rev.productName}
                          </span>
                        )}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ======================== 2. CATALOG & SEARCH VIEW ======================== */}
        {subView === 'CATALOG' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b border-black/[0.07] gap-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#787774] mb-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('ALL');
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                      setSubView('HOME');
                    }}
                    className="hover:text-black cursor-pointer"
                  >
                    Home
                  </button>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                    }}
                    className="hover:text-black cursor-pointer font-medium"
                  >
                    {activeCategory === 'ALL' ? 'Catalog' : activeCategory}
                  </button>
                  {activeSubcategory !== 'ALL' && (
                    <>
                      <span>/</span>
                      <span className="text-[#141413] font-semibold">{activeSubcategory}</span>
                    </>
                  )}
                  {activeCollection !== 'ALL' && (
                    <>
                      <span>/</span>
                      <span className="text-black font-semibold uppercase">{activeCollection.replace('_', ' ')}</span>
                    </>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                  {activeSubcategory !== 'ALL'
                    ? `${activeCategory} — ${activeSubcategory}`
                    : activeCollection === 'NEW_ARRIVALS'
                    ? 'New Arrivals'
                    : activeCollection === 'BEST_SELLERS'
                    ? 'Best Sellers'
                    : activeCollection === 'OFFERS'
                    ? 'Special Offers & Archive Sale'
                    : activeCategory === 'ALL'
                    ? 'Complete Archive & Collection'
                    : `${activeCategory} Collection`}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="text-xs text-neutral-500 font-mono">
                    Showing {filteredProducts.length} piece{filteredProducts.length === 1 ? '' : 's'}
                  </span>
                  {(activeCategory !== 'ALL' || activeSubcategory !== 'ALL' || activeCollection !== 'ALL' || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                        setSearchQuery('');
                      }}
                      className="ml-2 text-xs font-medium text-neutral-800 hover:text-black underline underline-offset-4 cursor-pointer"
                    >
                      Clear All Filters ×
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#787774] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search category, SKU, fabric..."
                    className="pl-10 pr-4 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413] w-64"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort products"
                  className="px-3.5 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413]"
                >
                  <option value="RELEVANCE">Sort: Curated Relevance</option>
                  <option value="NEWEST">Sort: Newest Editions</option>
                  <option value="PRICE_ASC">Sort: Price Low to High</option>
                  <option value="PRICE_DESC">Sort: Price High to Low</option>
                  <option value="RATING">Sort: Highest Client Rating</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-8">
              {/* Left Filter Rail */}
              <aside className="lg:col-span-3 space-y-8">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Category</span>
                    </span>
                    {activeCategory !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCategory('ALL');
                          setActiveSubcategory('ALL');
                        }}
                        className="text-[11px] text-neutral-500 hover:text-black cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </h3>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between rounded cursor-pointer ${
                        activeCategory === 'ALL' && activeSubcategory === 'ALL' && activeCollection === 'ALL'
                          ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                          : 'text-[#575653] hover:text-[#141413] hover:bg-black/5'
                      }`}
                    >
                      <span>All Products</span>
                      <span className="font-mono text-[11px] opacity-70">
                        {products.filter((p) => p.status === 'ACTIVE').length}
                      </span>
                    </button>
                    {categories.map((cat) => {
                      const count = products.filter(
                        (p) =>
                          p.status === 'ACTIVE' &&
                          (p.category.toLowerCase() === cat.name.toLowerCase() ||
                            (cat.name === 'Men' && (p.category === 'Men' || p.subcategory?.includes('Men'))) ||
                            (cat.name === 'Women' && (p.category === 'Women' || p.subcategory?.includes('Women'))) ||
                            (cat.name === 'Children' && (p.category === 'Children' || p.subcategory?.includes('Children'))))
                      ).length;

                      const isSelected = activeCategory.toLowerCase() === cat.name.toLowerCase();

                      return (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setActiveCategory(cat.name);
                            setActiveSubcategory('ALL');
                            setActiveCollection('ALL');
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between rounded cursor-pointer ${
                            isSelected
                              ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                              : 'text-[#575653] hover:text-[#141413] hover:bg-black/5'
                          }`}
                        >
                          <span>{cat.name}</span>
                          <span className="font-mono text-[11px] opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3">
                    Brands
                  </h3>
                  <div className="space-y-1.5">
                    {['ALL', ...brands].map((b) => (
                      <button
                        key={b}
                        onClick={() => setActiveBrand(b)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          activeBrand === b
                            ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                            : 'text-[#575653] hover:text-[#141413]'
                        }`}
                      >
                        {b === 'ALL' ? 'All Brands' : b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold uppercase tracking-wider text-[#141413]">
                      Max Price
                    </span>
                    <span className="font-mono tabular-nums text-[#141413] text-right">
                      {formatPKR(priceCeiling)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={500000}
                    step={500}
                    value={priceCeiling}
                    onChange={(e) => setPriceCeiling(Number(e.target.value))}
                    className="w-full accent-[#141413]"
                  />
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <label className="flex items-center gap-2.5 text-xs text-[#141413] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="accent-[#141413]"
                    />
                    <span>Immediate Dispatch Only (In Stock)</span>
                  </label>
                </div>
              </aside>

              {/* Right Product Grid */}
              <div className="lg:col-span-9">
                {filteredProducts.length === 0 ? (
                  <div className="p-12 border border-black/[0.07] bg-white text-center space-y-4">
                    <p className="text-base font-display text-[#141413]">
                      No archival pieces match your current filter criteria.
                    </p>
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveBrand('ALL');
                        setPriceCeiling(500000);
                        setSearchQuery('');
                        setInStockOnly(false);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {visibleCatalogProducts.map((product) => (
                      <article
                        key={product.id}
                        data-pid={product.id}
                        className="group flex flex-col justify-between border border-black/[0.07] bg-white"
                      >
                        <div>
                          <div
                            onClick={() => handleSelectProduct(product)}
                            className="aspect-[4/3] bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                          >
                            <ProductImage
                              src={product.primaryImage}
                              alt={product.name}
                              category={product.category}
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 mb-1">
                              <span>{product.sku}</span>
                              <span aria-hidden="true">·</span>
                              <span>{product.category}</span>
                            </div>
                            <h3
                              onClick={() => handleSelectProduct(product)}
                              className="text-base font-extrabold text-black group-hover:text-stone-700 cursor-pointer line-clamp-1"
                            >
                              {product.name}
                            </h3>
                            <ProductRatingBadge rating={product.rating} reviewCount={product.reviewCount} className="mt-1" />
                            <p className="text-xs text-black font-medium mt-1 line-clamp-2">
                              {product.shortDescription}
                            </p>
                            {product.sellerId && product.sellerName && (
                              <button
                                type="button"
                                onClick={() => openShop(product.sellerId!)}
                                className="mt-1.5 text-[11px] font-semibold text-[#0E7A43] hover:underline cursor-pointer truncate max-w-full"
                              >
                                by {product.sellerName} · visit store
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-4 pt-3 border-t border-black/10 flex items-center justify-between">
                          <div className="font-mono tabular-nums">
                            <span className="text-base font-extrabold text-black block">
                              {formatPKR(product.price)}
                            </span>
                          </div>
                          <button
                            onClick={() => addToCart(product, 1)}
                            className="px-3.5 py-1.5 bg-black text-white text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-sm"
                          >
                            Add to Bag
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-2 pt-8 text-xs text-[#575653]">
                    <span>
                      {visibleCatalogProducts.length} / {filteredProducts.length} products
                    </span>
                    {visibleCatalogProducts.length < filteredProducts.length && (
                      <button
                        type="button"
                        onClick={() => setCatalogVisibleCount((n) => n + CATALOG_STEP)}
                        className="px-6 py-2.5 bg-[#141413] text-white text-xs font-bold cursor-pointer hover:bg-black"
                      >
                        Show more products
                      </button>
                    )}
                  </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================== FESTIVAL CAMPAIGN PAGE ======================== */}
        {subView === 'CAMPAIGN' && (
          openCampaign ? (
            <CampaignPage
              campaign={openCampaign}
              products={campaignProducts(openCampaign, products)}
              onSelect={handleSelectProduct}
              onAdd={(p) => addToCart(p, 1)}
              onBack={() => {
                setOpenCampaign(null);
                setSubView('HOME');
                window.history.pushState(null, '', '/');
              }}
              Image={({ src, alt }) => <ProductImage src={src} alt={alt} className="w-full h-full object-cover" />}
            />
          ) : (
            <div className="max-w-xl mx-auto px-6 py-16 text-center text-sm text-[#575653]">This offer has ended or is loading...</div>
          )
        )}

        {/* ======================== SELLER SHOP PAGE ======================== */}
        {subView === 'SHOP' && shopSellerId && (
          <SellerShopPage
            sellerId={shopSellerId}
            products={products}
            onSelectProduct={handleSelectProduct}
            onAddToCart={(p) => addToCart(p, 1)}
            onBack={() => {
              if (selectedProduct) setSubView('PRODUCT_DETAIL');
              else setSubView('HOME');
              window.history.pushState(null, '', '/');
            }}
            showToast={showToast}
          />
        )}

        {/* ======================== 3. PRODUCT DETAIL VIEW (PDP) ======================== */}
        {subView === 'PRODUCT_DETAIL' && selectedProduct && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-20">
            <div>
              <button
                onClick={() => setSubView('CATALOG')}
                className="text-xs text-[#575653] hover:text-[#141413] mb-6 inline-flex items-center gap-2 cursor-pointer"
              >
                <span>← Back to {selectedProduct.category}</span>
              </button>

              {/* Contiguous Purchase Module: Sticky Gallery Left + Purchase Module Right */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-7 space-y-4">
                  <ProductGallery
                    images={selectedProduct.images}
                    primaryImage={selectedProduct.primaryImage}
                    videoUrl={selectedProduct.videoUrl}
                    alt={selectedProduct.name}
                    fallback={
                      <ProductImage
                        src={selectedProduct.primaryImage}
                        alt={selectedProduct.name}
                        category={selectedProduct.category}
                        className="w-full h-full object-cover"
                      />
                    }
                  />
                </div>

                {/* Right Contiguous Purchase Module */}
                <div className="lg:col-span-5 bg-white border border-black/[0.08] p-8 space-y-6">
                  <div className="flex items-center gap-2 text-xs text-[#787774]">
                    <span className="uppercase tracking-widest text-[#8C6D46] font-medium">
                      {selectedProduct.brand}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedProduct.category}</span>
                  </div>
                  <ProductRatingBadge
                    rating={selectedProduct.rating}
                    reviewCount={selectedProduct.reviewCount}
                    size={16}
                    className="!text-xs !mt-2"
                  />

                  <h1 className="text-3xl font-display font-medium text-[#141413]">
                    {selectedProduct.name}
                  </h1>
                  <div className="text-xs text-[#575653] flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      Sold &amp; shipped by{' '}
                      <strong className="text-[#141413]">{selectedProduct.sellerName || settings.storeName || 'My Store'}</strong>
                    </span>
                    {selectedProduct.sellerId && (
                      <button
                        type="button"
                        onClick={() => openShop(selectedProduct.sellerId!)}
                        className="px-2.5 py-1 border border-[#0E7A43] text-[#0E7A43] font-bold hover:bg-[#0E7A43] hover:text-white transition-colors cursor-pointer"
                      >
                        Visit store →
                      </button>
                    )}
                  </div>
                  {selectedProduct.sellerId && <PdpSellerRating sellerId={selectedProduct.sellerId} />}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#575653]">
                    <span>Do you like this product?</span>
                    <ProductReactions
                      productId={selectedProduct.id}
                      likes={selectedProduct.likes}
                      dislikes={selectedProduct.dislikes}
                      showToast={showToast}
                    />
                  </div>

                  <div className="space-y-1 font-mono tabular-nums">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold text-[#141413]">
                        {formatPKR(selectedProduct.price)}
                      </span>
                      {selectedProduct.compareAtPrice &&
                        selectedProduct.compareAtPrice > selectedProduct.price && (
                          <span className="text-sm text-[#787774] line-through">
                            {formatPKR(selectedProduct.compareAtPrice)}
                          </span>
                        )}
                    </div>
                  </div>

                  <p className="text-sm text-[#575653] leading-relaxed">
                    {selectedProduct.shortDescription || selectedProduct.description}
                  </p>

                  {/* Quantity + Primary Buy Actions */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#575653]">Availability</span>
                      <span className="font-mono tabular-nums font-medium text-[#141413]">
                        {selectedProduct.stock > 0
                          ? `${selectedProduct.stock} pieces ready for dispatch`
                          : 'Out of Stock'}
                      </span>
                    </div>

                    {selectedProduct.stock <= 0 && (
                      <BackInStockForm productId={selectedProduct.id} defaultEmail={firebaseUser?.email || ''} />
                    )}

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-black/20 bg-[#FBFBF9]">
                        <button
                          type="button"
                          onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-4 text-xs font-mono tabular-nums font-semibold">
                          {detailQty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailQty((q) => Math.min(selectedProduct.stock || 1, q + 1))
                          }
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          addToCart(selectedProduct, detailQty, selectedVariant)
                        }
                        disabled={selectedProduct.stock <= 0}
                        className="flex-1 py-3.5 px-6 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Add to Shopping Bag
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleWishlist(selectedProduct.id)}
                        className="p-3.5 border border-black/20 text-[#141413] hover:border-[#141413] cursor-pointer"
                        aria-label="Save to Wishlist"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            wishlist.includes(selectedProduct.id) ? 'fill-current' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        addToCart(selectedProduct, detailQty, selectedVariant);
                        setConfirmedOrderNumber(null);
                        setCheckoutStep(1);
                        setSubView('CHECKOUT');
                      }}
                      className="w-full py-3 border border-[#141413] text-[#141413] text-xs font-semibold uppercase tracking-widest hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                    >
                      Buy Now
                    </button>
                  </div>

                  {/* Delivery & returns (keep these promises true for the store) */}
                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs text-[#575653]">
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>
                        {settings.deliveryPromiseText ||
                          'Delivery across Pakistan by courier, usually in 3–6 working days. Cash on Delivery available.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <RotateCcw className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <button
                        type="button"
                        onClick={() => {
                          setSubView('REFUND_POLICY');
                          window.history.pushState(null, '', '#refund-policy');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="underline hover:text-[#141413] cursor-pointer text-left"
                      >
                        Returns &amp; refunds as per our policy
                      </button>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <MessageCircle className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>
                        Questions? WhatsApp {settings.helplineWhatsAppFormatted || settings.helplineWhatsApp || 'our support team'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Description and verified-buyer reviews */}
            <ProductInfoTabs
              productId={selectedProduct.id}
              description={selectedProduct.description}
              shortDescription={selectedProduct.shortDescription}
              details={[
                { label: 'SKU', value: selectedProduct.sku },
                { label: 'Dimensions', value: selectedProduct.dimensions || 'Standard' },
                { label: 'Weight', value: `${selectedProduct.weightKg || 0.85} kg` },
              ]}
              legacyReviews={reviews.filter((r) => r.productId === selectedProduct.id && r.status === 'APPROVED') as any}
            />

            {/* Frequently bought together (real checkouts; same category until there are enough) */}
            <BoughtTogether
              product={selectedProduct}
              products={products}
              onSelect={handleSelectProduct}
              onAdd={(p) => addToCart(p, 1)}
            />

            {/* Recently viewed on this device */}
            {recentlyViewed.ids.some((id) => id !== selectedProduct.id) && (
              <div className="pt-10 border-t border-black/[0.07]">
                <RecentlyViewedStrip ids={recentlyViewed.ids} products={products} onSelect={handleSelectProduct} excludeId={selectedProduct.id} />
              </div>
            )}
          </div>
        )}

        {/* ======================== 4. MULTI-STEP CHECKOUT VIEW ======================== */}
        {subView === 'CHECKOUT' && (
          <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
            {checkoutStep === 3 && confirmedOrderNumber ? (() => {
              const confirmedOrder = orders.find((o) => o.orderNumber === confirmedOrderNumber);
              const isOrderPaid = confirmedOrder?.paymentStatus === 'PAID';
              const isCod = paymentMethod === 'COD' || confirmedOrder?.paymentMethod === 'COD';
              const isPendingVerification = !isOrderPaid && !isCod;

              const activeTid = confirmedOrder?.paymentReference || wireReferenceNumber || 'TID-PENDING';
              const activeRecipientEmail = customerEmail || userProfile?.email || 'customer@gmail.com';
              const activeStoreName = settings.storeName || 'Online Store';
              const activeTotalPkr = Math.round(confirmedOrder?.total ?? grandTotal);

              const paymentMethodLabel =
                paymentMethod === 'HBL_BANK' || paymentMethod === 'BANK_ACCOUNT'
                  ? 'Direct Bank Account / 1Link Transfer'
                  : paymentMethod === 'RAAST_IBAN'
                  ? 'Advance RAAST Instant Transfer'
                  : paymentMethod === 'NAYAPAY'
                  ? 'Advance NayaPay Digital Wallet'
                  : paymentMethod === 'BANK_TRANSFER'
                  ? 'Advance Bank Wire Transfer'
                  : paymentMethod === 'COD'
                  ? 'Cash on Delivery (Courier Doorstep)'
                  : paymentMethod;

              const fallbackOrderForModal: Order = confirmedOrder || {
                id: `ord-${confirmedOrderNumber}`,
                orderNumber: confirmedOrderNumber,
                userId: firebaseUser?.uid || 'guest-checkout',
                customerName: customerName || userProfile?.name || 'Valued Patron',
                customerEmail: activeRecipientEmail,
                status: isOrderPaid ? 'CONFIRMED' : 'PENDING',
                paymentStatus: isOrderPaid ? 'PAID' : isCod ? 'PENDING' : 'PENDING_VERIFICATION',
                paymentMethod,
                paymentSubMethod,
                paymentReference: activeTid,
                district,
                tehsil: effectiveTehsil,
                total: grandTotal,
                currency: settings.currency || 'PKR',
                shippingAddressSummary: `${streetAddress}, ${effectiveTehsil ? `Tehsil ${effectiveTehsil}, ` : ''}District ${district}, ${country}`,
                createdAt: new Date().toISOString(),
              };

              return (
                <div className="bg-white border border-black/[0.08] p-8 sm:p-10 max-w-2xl mx-auto space-y-6">
                  <div className={`w-10 h-10 ${isOrderPaid ? 'bg-emerald-600 text-white' : 'bg-[#141413] text-[#FBFBF9]'} flex items-center justify-center`}>
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                      {isOrderPaid
                        ? 'Order Confirmed & Paid'
                        : isCod
                        ? 'Cash on Delivery Order Logged'
                        : 'Order Placed — Awaiting Payment Verification'}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-display font-medium text-[#141413] mt-1">
                      {isOrderPaid
                        ? `Order ${confirmedOrderNumber} Confirmed — Payment Verified`
                        : isCod
                        ? `Order ${confirmedOrderNumber} Placed — Cash on Delivery`
                        : `Order ${confirmedOrderNumber} Placed — Awaiting Payment Verification`}
                    </h1>
                  </div>

                  {/* Payment Status Notification Banner */}
                  {isOrderPaid ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-500/50 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            ✓
                          </div>
                          <strong className="text-emerald-950 text-sm font-semibold">
                            Payment Charged &amp; Confirmed!
                          </strong>
                        </div>
                        <span className="px-2.5 py-0.5 bg-emerald-700 text-white font-mono text-[11px] font-bold tracking-wider">
                          PAID · AUTO-CONFIRMED
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        <strong className="text-emerald-950 font-bold">{activeStoreName}</strong> has received your advance payment. The amount has been credited to the store's merchant account and your order is now <strong>CONFIRMED</strong>. Packaging and fulfillment have started.
                      </p>
                    </div>
                  ) : isCod ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 space-y-1">
                      <strong className="text-amber-950 text-xs font-semibold">
                        Cash on Delivery (COD) Registered
                      </strong>
                      <p className="text-[11px] text-amber-800">
                        Payment will be collected at your doorstep in cash by the courier upon delivery.
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 bg-amber-50 border border-amber-400 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            ⏳
                          </div>
                          <strong className="text-amber-950 text-sm font-semibold">
                            Payment Pending Verification
                          </strong>
                        </div>
                        <span className="px-2.5 py-0.5 bg-amber-800 text-white font-mono text-[11px] font-bold tracking-wider">
                          UNPAID · PENDING VERIFICATION
                        </span>
                      </div>
                      <div className="text-xs text-amber-900 leading-relaxed space-y-2 bg-white/90 p-3.5 border border-amber-300/80 rounded">
                        <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                          <span>⚠️ Account Charge &amp; Verification Notice:</span>
                        </p>
                        <p>
                          <strong>No money has been deducted from your bank or wallet automatically.</strong> The website is not connected to a live payment gateway yet, so a manual bank / wallet transfer is required.
                        </p>
                        <p>
                          Your order and payment reference (<strong className="font-mono text-amber-950 font-bold">{activeTid}</strong>) have been recorded as <strong>PENDING</strong>. Once the store receives your transfer and confirms it, the order status changes to <strong>&apos;PAID&apos;</strong> and <strong>&apos;CONFIRMED&apos;</strong> and processing begins.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Items from several sellers: one order (and parcel) per seller */}
                  {confirmedSplitOrders.length > 1 && (
                    <div className="p-4 bg-sky-50 border border-sky-300 text-xs space-y-2">
                      <strong className="block text-sky-950">
                        Your order will arrive in {confirmedSplitOrders.length} separate parcels (each seller ships their own parcel):
                      </strong>
                      <ul className="space-y-1">
                        {confirmedSplitOrders.map((o) => (
                          <li key={o.orderNumber} className="flex flex-wrap justify-between gap-2 font-mono">
                            <span className="font-bold text-[#141413]">{o.orderNumber}</span>
                            <span className="font-sans text-[#141413]">{o.sellerName || activeStoreName}</span>
                            <span className="text-[#141413]">{formatPKR(o.total)}</span>
                          </li>
                        ))}
                      </ul>
                      <span className="block text-sky-900">
                        Total: <strong>{formatPKR(confirmedSplitOrders.reduce((s, o) => s + (Number(o.total) || 0), 0))}</strong> · each order has its own tracking.
                      </span>
                    </div>
                  )}

                  {/* Payment & Order Summary Dossier */}
                  <div className="p-4 bg-[#F7F6F2] border border-black/[0.06] text-xs space-y-2 font-mono tabular-nums">
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Store Name:</span>
                      <strong className="text-[#141413] font-semibold">{activeStoreName}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Order Reference:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Status:</span>
                      <strong className={isOrderPaid ? "text-emerald-700 font-bold" : isCod ? "text-amber-800" : "text-amber-800 font-bold"}>
                        {isOrderPaid
                          ? 'PAID · Advance Payment Received'
                          : isCod
                          ? 'PENDING (Due on Delivery)'
                          : 'PENDING VERIFICATION · Unpaid'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Order Status:</span>
                      <strong className={isOrderPaid ? "text-emerald-700 font-bold" : "text-amber-800 font-semibold"}>
                        {isOrderPaid ? 'CONFIRMED · In Fulfillment' : 'PENDING · Awaiting Payment'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Protocol:</span>
                      <span className="text-[#141413] font-medium">{paymentMethodLabel}</span>
                    </div>
                    {!isCod && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Payment Reference / TID:</span>
                        <span className="text-[#8C6D46] font-bold font-mono">{activeTid}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">{isOrderPaid ? 'Total Amount Paid:' : 'Total Payable:'}</span>
                      <strong className="text-[#141413] font-bold">
                        PKR {activeTotalPkr.toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">District:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrder?.district || district}</strong>
                    </div>
                    {(confirmedOrder?.tehsil || effectiveTehsil) && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Tehsil:</span>
                        <strong className="text-[#141413] font-semibold">{confirmedOrder?.tehsil || effectiveTehsil}</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#787774]">Destination:</span>
                      <span className="text-[#141413] text-right truncate max-w-[280px]">
                        {streetAddress}, {effectiveTehsil ? `${effectiveTehsil}, ` : ''}{district}, {country}
                      </span>
                    </div>
                  </div>

                  {/* Transactional Real Email Notice */}
                  <div className="p-4 bg-emerald-50/80 border border-emerald-300 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-emerald-700" />
                        <strong className="text-emerald-950 text-xs">
                          Confirmation Email Dispatched
                        </strong>
                      </div>
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${isOrderPaid ? 'text-emerald-800 bg-emerald-100 border border-emerald-300' : 'text-amber-800 bg-amber-100 border border-amber-300'}`}>
                        {isOrderPaid ? '✓ Payment Received' : '⏳ Awaiting Verification'}
                      </span>
                    </div>
                    <div className="text-xs text-emerald-900 space-y-1">
                      <div>
                        <span className="text-emerald-700">Recipient Email: </span>
                        <strong className="font-mono text-slate-900">{activeRecipientEmail}</strong>
                      </div>
                      <div>
                        <span className="text-emerald-700">Order Reference: </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-800">
                          Order #{confirmedOrderNumber} | {activeStoreName}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 pt-1 leading-relaxed">
                        A real transactional email has been sent to your email inbox via Resend with complete order details and itemized invoice.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={isResendingReceipt}
                        onClick={() => handleResendReceipt(confirmedOrderNumber, activeRecipientEmail)}
                        className="px-3.5 py-1.5 border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {isResendingReceipt ? 'Sending...' : '↺ Resend Email'}
                      </button>
                    </div>
                    {resendStatus && (
                      <div className="text-[11px] font-medium text-emerald-800 bg-emerald-100 p-2 border border-emerald-300 rounded">
                        {resendStatus}
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Order Confirmation (Instant Dispatch Verification) */}
                  {(() => {
                    const rawWa = settings.whatsappNumber || settings.helplineWhatsApp || '923001234567';
                    const cleanWa = rawWa.replace(/[^0-9]/g, '');
                    const activeMethod = isCod
                      ? 'Cash on Delivery (COD)'
                      : isOrderPaid
                      ? 'Paid in Advance'
                      : 'Bank/Raast Transfer (TID submitted)';
                    const waMsg = `Assalam-o-Alaikum! I have placed Order #${confirmedOrderNumber} on ${activeStoreName}.\n\nCustomer: ${customerName || userProfile?.name || 'Customer'}\nPhone: ${customerPhone || 'On file'}\nTotal: PKR ${activeTotalPkr.toLocaleString()}\nPayment Method: ${activeMethod}\n\nPlease confirm my order. Thank you!`;
                    const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(waMsg)}`;

                    return (
                      <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded space-y-2.5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-emerald-700" />
                            <strong className="text-emerald-950 text-sm font-bold">
                              Confirm on WhatsApp
                            </strong>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/90 px-2 py-0.5 rounded uppercase tracking-wider">
                            Priority Dispatch
                          </span>
                        </div>
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          Click the button below to send a pre-filled confirmation message with your Order Reference <strong className="font-mono text-emerald-950 font-bold">#{confirmedOrderNumber}</strong> directly to our WhatsApp support team for instant order verification.
                        </p>
                        <div className="pt-1">
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition-colors shadow-xs w-full sm:w-auto cursor-pointer"
                          >
                            <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
                            Confirm on WhatsApp (#{confirmedOrderNumber})
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Guest & Member Live Order Tracking Card */}
                  <div className="p-4 bg-amber-50/90 border border-amber-300 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-800" />
                        <strong className="text-amber-950 text-xs font-semibold">
                          Live Order Tracking Link
                        </strong>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded">
                        Guest & Member Access
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      You can track your order status, payment verification, and courier dispatch anytime at the link below:
                    </p>
                    <div className="p-2.5 bg-white border border-amber-200/80 rounded font-mono text-[11px] text-amber-950 truncate select-all flex items-center justify-between gap-2">
                      <span className="truncate">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/track?order=${confirmedOrderNumber}${confirmedOrderAccessToken ? `&token=${confirmedOrderAccessToken}` : ''}`
                          : `/track?order=${confirmedOrderNumber}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTrackingOrderInput(confirmedOrderNumber);
                          if (confirmedOrderAccessToken) setTrackingTokenInput(confirmedOrderAccessToken);
                          setIsTrackingModalOpen(true);
                          handleTrackOrder(confirmedOrderNumber, confirmedOrderAccessToken || '');
                        }}
                        className="px-4 py-2 bg-[#141413] hover:bg-[#2A2A28] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Track Order Status
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const trackUrl = `${window.location.origin}/track?order=${confirmedOrderNumber}${confirmedOrderAccessToken ? `&token=${confirmedOrderAccessToken}` : ''}`;
                          navigator.clipboard?.writeText(trackUrl);
                          showToast?.('Tracking link copied to clipboard!');
                        }}
                        className="px-3 py-2 border border-amber-400 text-amber-950 hover:bg-amber-100 text-xs font-medium cursor-pointer"
                      >
                        📋 Copy Tracking Link
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2">
                    <button
                      onClick={() => setSubView('ACCOUNT')}
                      className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28] text-center"
                    >
                      View Order Timeline & Account
                    </button>
                    <button
                      onClick={() => setSubView('HOME')}
                      className="px-6 py-3 border border-black/20 text-xs font-medium cursor-pointer hover:border-[#141413] text-center"
                    >
                      Return to Storefront
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-8">
                  <div className="border-b border-black/[0.08] pb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h1 className="text-3xl font-display font-medium text-[#141413]">
                        Private Client Checkout
                      </h1>
                      <p className="text-xs text-[#575653] mt-0.5">
                        Real-Time Address, Postal & Anti-Fraud Payment Verification System
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-mono border ${
                        addressVerification.isFullyVerified && paymentVerification.valid
                          ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                          : 'bg-amber-50 text-amber-900 border-amber-300'
                      }`}
                    >
                      {addressVerification.isFullyVerified && paymentVerification.valid
                        ? '✓ SYSTEM VERIFIED · ANTI-FRAUD PROTECTED'
                        : '⚠ VERIFICATION IN PROGRESS'}
                    </span>
                  </div>

                  {/* Multi-Step Checkout Progress Stepper */}
                  <div className="bg-[#FAF9F5] border border-black/[0.08] p-3.5 rounded shadow-xs">
                    <div className="flex items-center justify-between">
                      {/* Step 1 Indicator */}
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${
                          checkoutStep === 1 ? 'text-[#F85606]' : 'text-emerald-700 hover:text-emerald-800'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            checkoutStep === 1
                              ? 'bg-[#F85606] text-white ring-2 ring-[#F85606]/20'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {checkoutStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 1</span>
                          <span className="font-bold">Address & Delivery</span>
                        </div>
                      </button>

                      <div className={`flex-1 h-0.5 mx-2.5 sm:mx-4 ${checkoutStep >= 2 ? 'bg-emerald-600' : 'bg-black/15'}`} />

                      {/* Step 2 Indicator */}
                      <button
                        type="button"
                        disabled={!addressVerification.isFullyVerified}
                        onClick={() => {
                          if (addressVerification.isFullyVerified) {
                            setCheckoutStep(2);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className={`flex items-center gap-2 text-xs font-semibold ${
                          checkoutStep === 2
                            ? 'text-[#F85606]'
                            : checkoutStep > 2
                            ? 'text-emerald-700'
                            : 'text-[#575653]'
                        } ${addressVerification.isFullyVerified ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            checkoutStep === 2
                              ? 'bg-[#F85606] text-white ring-2 ring-[#F85606]/20'
                              : checkoutStep > 2
                              ? 'bg-emerald-600 text-white'
                              : 'bg-black/10 text-[#787774]'
                          }`}
                        >
                          {checkoutStep > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 2</span>
                          <span className="font-bold">Payment Method</span>
                        </div>
                      </button>

                      <div className={`flex-1 h-0.5 mx-2.5 sm:mx-4 ${checkoutStep === 3 ? 'bg-emerald-600' : 'bg-black/15'}`} />

                      {/* Step 3 Indicator */}
                      <div className={`flex items-center gap-2 text-xs font-semibold ${checkoutStep === 3 ? 'text-emerald-700' : 'text-[#575653]'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          checkoutStep === 3 ? 'bg-emerald-600 text-white ring-2 ring-emerald-600/20' : 'bg-black/10 text-[#787774]'
                        }`}>
                          3
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 3</span>
                          <span className="font-bold">Confirmation</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {checkoutErrorBanner && (
                    <div
                      id="checkout-friendly-error"
                      className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-400 rounded text-[#141413] text-xs leading-relaxed shadow-sm flex items-start gap-3.5"
                    >
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1.5 flex-1">
                        <div className="font-bold text-amber-950 flex items-center justify-between">
                          <span className="text-sm">Notice: Order Could Not Be Completed</span>
                          <button
                            type="button"
                            onClick={() => setCheckoutErrorBanner(null)}
                            className="text-amber-800 hover:text-amber-950 text-[11px] font-semibold cursor-pointer underline"
                          >
                            Dismiss
                          </button>
                        </div>
                        <p className="text-amber-900 text-xs leading-relaxed">{checkoutErrorBanner}</p>
                        <div className="pt-1.5 flex flex-wrap items-center gap-3 text-[11px] border-t border-amber-200">
                          <span className="text-amber-800 font-medium">Need instant assistance?</span>
                          <a
                            href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I need help completing my order on ${settings.storeName || 'your store'}: "${checkoutErrorBanner}"`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Chat with Support on WhatsApp
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ================= STEP 1: ADDRESS CONFIRMATION ================= */}
                  {checkoutStep === 1 && (
                    <div className="space-y-6">
                      {/* Client Identity & Real-Time Verified Country / State / City / Address */}
                      <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                        01. Client Identity & Verified Delivery Destination
                      </h2>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          addressVerification.isFullyVerified ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {addressVerification.isFullyVerified
                          ? '✓ RIGHT ADDRESS (ALL FIELDS VERIFIED)'
                          : '✕ ADDRESS INCOMPLETE OR WRONG FORMAT'}
                      </span>
                    </div>

                    {/* Quick Jurisdiction Switcher: Pakistan National vs International Worldwide */}
                    <div className="space-y-3 p-3.5 bg-[#F7F6F2] border border-black/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectCountryByIso('PK')}
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">🇵🇰 Pakistan (National Delivery)</span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            All Pakistani Provinces & Cities · Advance + Cash on Delivery (COD)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSelectCountryByIso(isNationalPakistan ? 'GB' : countryIso)
                          }
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            !isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">
                            🌍 International Worldwide ({ALL_WORLD_COUNTRIES.length} Countries & Territories)
                          </span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            Every Country, State & City in the World · 100% Advance Payment Only
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Google Maps Live Address Auto-Detection */}
                    <Suspense fallback={<div className="h-12 border border-black/10 bg-black/[0.02]" />}>
                      <GoogleMapsAddressDetector
                        countryIso={countryIso}
                        currentStreetAddress={streetAddress}
                        onAddressDetected={handleAddressAutoDetected}
                      />
                    </Suspense>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="checkout-customer-name" className="block text-xs text-[#575653] mb-1">
                          Full Name (poora naam) <span className="text-red-600">*</span>
                        </label>
                        <input
                          id="checkout-customer-name"
                          type="text"
                          required
                          autoComplete="name"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Enter your full name"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            checkoutErrorBanner && customerName.trim().length < 2
                              ? 'border-red-500 ring-1 ring-red-500'
                              : 'border-black/15'
                          }`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">Email Address</label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.emailValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.emailValid ? '✓ Verified' : '✕ Wrong Email'}
                          </span>
                        </div>
                        <input
                          type="email"
                          required
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="client@domain.com"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.emailValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                      </div>

                      {/* Complete 250+ World Countries Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Country ({ALL_WORLD_COUNTRIES.length} Countries)
                          </label>
                          <span className="text-[10px] font-mono text-emerald-700">
                            ✓ {isNationalPakistan ? 'National (PK)' : `International (${countryIso})`}
                          </span>
                        </div>
                        <select
                          value={countryIso}
                          onChange={(e) => handleSelectCountryByIso(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {ALL_WORLD_COUNTRIES.map((c) => (
                            <option key={c.isoCode} value={c.isoCode}>
                              {c.flag} {c.name} ({c.phonePrefix}) — {c.isNational ? 'Advance & COD' : 'Advance Only'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Complete States / Provinces Selector for Selected Country */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            State / Province ({availableStates.length} in {country})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.stateValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.stateValid ? '✓ Verified State' : '✕ Select State'}
                          </span>
                        </div>
                        <select
                          value={stateIso}
                          onChange={(e) => {
                            const nextStateCode = e.target.value;
                            const stObj = availableStates.find((s) => s.isoCode === nextStateCode);
                            const nextStateName = stObj?.name || nextStateCode;
                            setStateIso(nextStateCode);
                            setStateProvince(nextStateName);
                            const nextCities = getCitiesForState(countryIso, nextStateCode);
                            if (nextCities.length > 0) {
                              handleDistrictChange(nextCities[0].name);
                            } else {
                              handleDistrictChange(nextStateName);
                            }
                          }}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableStates.map((st) => (
                            <option key={`${st.countryCode}-${st.isoCode}`} value={st.isoCode}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* District Selector (Replaced City with District as requested) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            District ({availableDistricts.length} in {stateProvince})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.districtValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.districtValid ? '✓ Verified District' : '✕ Wrong District'}
                          </span>
                        </div>
                        <select
                          value={district}
                          onChange={(e) => handleDistrictChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableDistricts.slice(0, 600).map((dt, idx) => (
                            <option key={`${dt.name}-${idx}`} value={dt.name}>
                              {dt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tehsil Selector Box (As requested: box for selecting Tehsil) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Tehsil ({availableTehsils.length} in {district})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.tehsilValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.tehsilValid ? '✓ Verified Tehsil' : '✕ Required'}
                          </span>
                        </div>
                        {!isCustomTehsil ? (
                          <div className="space-y-1.5">
                            <select
                              value={tehsil}
                              onChange={(e) => {
                                if (e.target.value === '__OTHER_CUSTOM__') {
                                  setIsCustomTehsil(true);
                                  setCustomTehsil('');
                                } else {
                                  setTehsil(e.target.value);
                                }
                              }}
                              className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                            >
                              {availableTehsils.map((th, idx) => (
                                <option key={`${th}-${idx}`} value={th}>
                                  {th}
                                </option>
                              ))}
                              <option value="__OTHER_CUSTOM__">
                                ➕ Other / Custom Tehsil...
                              </option>
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="relative">
                              <input
                                type="text"
                                required
                                value={customTehsil}
                                onChange={(e) => setCustomTehsil(e.target.value)}
                                placeholder={`Enter Tehsil for ${district}`}
                                className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomTehsil(false);
                                  setTehsil(availableTehsils[0] || 'Center');
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
                              >
                                List
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Postal / ZIP Code with Real-Time District/Tehsil Validation */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Postal / ZIP Code ({selectedCountryRecord.isoCode})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.postalValid ? '✓ Right Postal Code' : '✕ Wrong Postal Code'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder={postalRule.example}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.postalValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <div className="flex flex-wrap items-center justify-between text-[10px] mt-1 gap-1">
                          <span className={addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                            {addressVerification.fieldMessages.postal}
                          </span>
                          {suggestedPakistanPostalCode && postalCode.trim() !== suggestedPakistanPostalCode && (
                            <button
                              type="button"
                              onClick={() => setPostalCode(suggestedPakistanPostalCode)}
                              className="text-emerald-800 font-semibold underline hover:text-emerald-950 cursor-pointer"
                            >
                              Auto-fill {effectiveTehsil || district} GPO ({suggestedPakistanPostalCode})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Receiver Phone with Real-Time Country Dial Code Check */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Courier Receiver Ph. No. ({selectedCountryRecord.phonePrefix})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.phoneValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.phoneValid ? '✓ Right Phone' : '✕ Wrong Phone'}
                          </span>
                        </div>
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder={`${selectedCountryRecord.phonePrefix} 300 1234567`}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.phoneValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.phone}
                        </span>
                        <label className="mt-1.5 flex items-start gap-1.5 text-[10px] text-[#575653] cursor-pointer">
                          <input type="checkbox" checked={cartReminderConsent} onChange={(e) => setCartReminderConsent(e.target.checked)} className="mt-0.5" />
                          If I don't finish my order, you may send me one reminder on WhatsApp / SMS.
                        </label>
                      </div>

                      {/* Complete Street Address with Live Verification */}
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Complete Street, House / Building & Sector Address
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.streetValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.streetValid ? '✓ Right Street Address' : '✕ Wrong / Incomplete Street'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="House/Plot #, Street #, Sector/Phase, Landmark"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.streetValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.street} · {addressVerification.fieldMessages.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Notes / Instructions */}
                    <div className="bg-white border border-black/[0.07] p-5 space-y-2">
                      <label className="block text-xs font-semibold text-[#141413]">
                        Delivery Notes / Landmark Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Gate code, famous landmark, nearest shop, or preferred delivery timing"
                        className="w-full px-3.5 py-2.5 border border-black/15 text-xs rounded"
                      />
                    </div>

                    {/* Address Live Verification & Confirmation Status Box */}
                    <div
                      className={`p-4 border rounded-lg text-xs ${
                        addressVerification.isFullyVerified
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                          : 'bg-amber-50/90 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {addressVerification.isFullyVerified ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-xs font-bold uppercase tracking-wide">
                              {addressVerification.isFullyVerified
                                ? '✓ Address Verified & Ready for Confirmation'
                                : '⚠ Address Verification in Progress'}
                            </strong>
                            <span
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                                addressVerification.isFullyVerified
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : 'bg-amber-200 text-amber-900'
                              }`}
                            >
                              {addressVerification.isFullyVerified ? 'READY FOR PAYMENT' : 'ADDRESS INCOMPLETE'}
                            </span>
                          </div>

                          {addressVerification.isFullyVerified ? (
                            <>
                              <p className="text-emerald-900 font-medium">
                                {customerName} · <span className="font-mono">{customerPhone}</span> · {customerEmail}
                              </p>
                              <p className="text-emerald-800 text-[11px] font-mono">
                                {streetAddress}, {effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}{district}, {stateProvince}, {postalCode}, {country}
                              </p>
                              <p className="text-[11px] text-emerald-800 pt-1 font-medium border-t border-emerald-200/80">
                                The address is complete. Click "Confirm Address" below to choose online payment or Cash on Delivery on the next page.
                              </p>
                            </>
                          ) : (
                            <p className="text-amber-900 text-[11px] leading-relaxed">
                              Please complete the delivery address (street / area, phone number, tehsil and postal code are required so the parcel arrives without delay).
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 1 Primary Action Button: Confirm Address & Proceed to Payment */}
                    <button
                      type="button"
                      onClick={handleConfirmAddress}
                      disabled={!addressVerification.isFullyVerified}
                      className="w-full py-4 bg-[#F85606] hover:bg-[#E04D05] text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm disabled:opacity-40 disabled:hover:bg-[#F85606] cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      {!addressVerification.isFullyVerified ? (
                        <span>Complete Address Verification Above to Continue</span>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Confirm Address &amp; Proceed to Payment (Step 2) →</span>
                          <span className="text-[10px] opacity-90 font-medium">(confirm the address and continue to payment)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ================= STEP 2: PAYMENT METHOD (2nd Page) ================= */}
                {checkoutStep === 2 && (
                  <div className="space-y-6">
                    {/* Confirmed Delivery Address Card at top of Step 2 */}
                    <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-lg shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-emerald-950 font-bold text-xs uppercase tracking-wide">
                              ✓ Confirmed Delivery Address
                            </strong>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-semibold font-mono">
                              VERIFIED
                            </span>
                          </div>
                          <p className="text-xs text-emerald-950 font-medium mt-0.5">
                            {customerName} · <span className="font-mono">{customerPhone}</span> · {customerEmail}
                          </p>
                          <p className="text-[11px] text-emerald-800 mt-0.5">
                            {streetAddress}, {effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}{district}, {stateProvince}, {postalCode}, {country}
                          </p>
                          {orderNotes && (
                            <p className="text-[10px] text-emerald-700 mt-1 italic">
                              Delivery Notes: "{orderNotes}"
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-3.5 py-2 border border-emerald-600 text-emerald-900 hover:bg-emerald-100 text-xs font-semibold rounded flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Change Address</span>
                        <span className="text-[10px] font-normal">(change address)</span>
                      </button>
                    </div>

                    {/* Step 2: National & International Payment Protocol + Anti-Fraud Verification */}
                    <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                          02. Select Payment Method
                        </h2>
                        <p className="text-[11px] text-[#575653] mt-0.5">
                          {isNationalPakistan
                            ? 'Pakistan Checkout · Supported payment methods: Cash on Delivery, NayaPay, and RAAST/IBAN bank transfer with TID.'
                            : 'International orders outside Pakistan require 100% Advance Settlement or Logistics Freight Quote.'}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          paymentVerification.valid ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {paymentVerification.valid
                          ? `✓ METHOD READY (Risk Score: ${paymentVerification.fraudScore}%)`
                          : '✕ PAYMENT DETAILS REQUIRED'}
                      </span>
                    </div>

                    {/* Checkout Notice */}
                    <div className="flex items-center gap-2.5 p-3.5 bg-amber-50/70 border border-amber-300 text-xs text-amber-900 rounded">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700" />
                      <span className="font-medium leading-relaxed">
                        Select Cash on Delivery or transfer via Bank / RAAST / NayaPay and submit your Transaction ID (TID). Orders remain <strong>PENDING_VERIFICATION</strong> until verified by store administration.
                      </span>
                    </div>

                    {/* Payment Method Selector Tabs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 1. Cash on Delivery (COD) */}
                      {isCodAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('COD')}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'COD'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center text-white shadow-xs">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Cash on Delivery (COD)</span>
                            <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">Pay at Doorstep</span>
                          </div>
                          {paymentMethod === 'COD' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 2. Bank Transfer / RAAST */}
                      {isRaastAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('RAAST_IBAN');
                            setPaymentSubMethod('RAAST');
                          }}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-[#006C35] flex items-center justify-center text-white shadow-xs">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Bank Transfer / RAAST</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Submit TID / Reference</span>
                          </div>
                          {(paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 3. NayaPay Wallet */}
                      {isNayaPayAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('NAYAPAY');
                            setPaymentSubMethod('NAYAPAY');
                          }}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'NAYAPAY'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-[#C2410C] flex items-center justify-center text-white font-bold text-xs shadow-xs">
                            NP
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">NayaPay Wallet</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Submit TID / Reference</span>
                          </div>
                          {paymentMethod === 'NAYAPAY' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 4. International Customs Quote (only outside Pakistan) */}
                      {isManualQuoteAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('MANUAL_QUOTE')}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'MANUAL_QUOTE'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-stone-700 flex items-center justify-center text-white shadow-xs">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Customs &amp; Freight Quote</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Manual quote</span>
                          </div>
                          {paymentMethod === 'MANUAL_QUOTE' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* ========================================================================= */}
                    {/* PAYMENT METHOD FORM PANELS */}
                    {/* ========================================================================= */}

                    {/* 1. CASH ON DELIVERY (COD) PANEL */}
                    {paymentMethod === 'COD' && isNationalPakistan && (
                      <div className="p-5 bg-white border border-amber-300 rounded space-y-4 text-xs">
                        <div className="p-4 bg-amber-50/70 border border-amber-300 rounded space-y-2 text-amber-950">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-amber-700" />
                            <strong className="text-xs">Cash on Delivery (COD) · Pay at Doorstep</strong>
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-900">
                            Pay cash directly to the courier agent when your package is delivered to your doorstep.
                          </p>
                          <ul className="list-disc pl-4 text-[10.5px] space-y-0.5 text-amber-800">
                            <li>Please prepare exact cash of <strong>{formatPKR(grandTotal)}</strong> upon delivery.</li>
                            <li>Standard parcel transit: 2–4 business days via Leopards / TCS.</li>
                          </ul>
                        </div>

                        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded text-[11px] text-amber-950 flex items-center justify-between">
                          <span>Payable Amount at Delivery:</span>
                          <strong className="font-mono text-sm text-amber-900 font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 2. BANK TRANSFER / RAAST PANEL */}
                    {(paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && (
                      <div className="p-5 bg-white border border-[#006C35]/30 rounded space-y-4 text-xs">
                        {/* Store Treasury Bank Details */}
                        <div className="p-4 bg-[#F8F9FA] border border-black/[0.08] rounded space-y-2 text-[#333333]">
                          <div className="flex items-center justify-between pb-1 border-b border-black/[0.06]">
                            <strong className="text-xs text-[#141413] flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-[#006C35]" />
                              Official Store Bank &amp; RAAST Account Details
                            </strong>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                              MANUAL TRANSFER
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            <div>
                              <span className="text-[#787774] block">Bank Name:</span>
                              <strong className="text-[#141413]">{settings.bankName || 'Askari Bank / Meezan Bank / HBL'}</strong>
                            </div>
                            <div>
                              <span className="text-[#787774] block">Account Title:</span>
                              <strong className="text-[#141413]">{settings.raastAccountTitle || settings.storeName || 'Store Account'}</strong>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-[#787774] block">Account No. / IBAN / RAAST ID:</span>
                              <strong className="font-mono text-[#006C35] text-xs font-bold select-all">
                                {settings.raastIban || 'Askari / Meezan (Details in Admin Settings)'}
                              </strong>
                            </div>
                          </div>
                          <p className="text-[10.5px] text-[#666666] pt-1 border-t border-black/[0.06]">
                            {settings.bankTransferInstructions || 'Please transfer the exact order amount via your mobile banking app or RAAST. After transferring, enter the Transaction ID (TID) from your receipt below.'}
                          </p>
                        </div>

                        {/* Customer TID Submission Form */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#141413] mb-1">
                              Bank / RAAST Transaction ID (TID) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={wireReferenceNumber}
                              onChange={(e) => setWireReferenceNumber(e.target.value.toUpperCase())}
                              placeholder="e.g. 240810192834 or RAAST-984210"
                              className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs focus:border-[#006C35] focus:ring-1 focus:ring-[#006C35] outline-hidden uppercase"
                            />
                            <span className="block text-[10px] text-[#787774] mt-1">
                              Required: Min 6 alphanumeric characters from your bank receipt / SMS
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-[#141413] mb-1">
                                Your Sender Account Title (Optional)
                              </label>
                              <input
                                type="text"
                                value={walletAccountTitle}
                                onChange={(e) => setWalletAccountTitle(e.target.value)}
                                placeholder="Your Name on Bank Account"
                                className="w-full px-3.5 py-2 bg-white border border-black/20 rounded text-xs outline-hidden"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#141413] mb-1">
                                Sender Bank Name (Optional)
                              </label>
                              <select
                                value={bankAccountName}
                                onChange={(e) => setBankAccountName(e.target.value)}
                                className="w-full px-3.5 py-2 bg-white border border-black/20 rounded text-xs outline-hidden cursor-pointer"
                              >
                                <option value="Meezan Bank">Meezan Bank</option>
                                <option value="HBL">HBL (Habib Bank Limited)</option>
                                <option value="Bank Alfalah">Bank Alfalah</option>
                                <option value="MCB">MCB Bank</option>
                                <option value="Standard Chartered">Standard Chartered</option>
                                <option value="UBL">UBL</option>
                                <option value="Faysal Bank">Faysal Bank</option>
                                <option value="Askari Bank">Askari Bank</option>
                                <option value="Other Bank / RAAST">Other Bank / RAAST</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Order Verification Notice */}
                        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-[11px] text-amber-950 space-y-1">
                          <strong className="block font-semibold">⚠️ Verification Workflow:</strong>
                          <p className="leading-relaxed">
                            Your order will stay in <strong>PENDING_VERIFICATION</strong> status. Our administration team will verify the transfer in our bank records. Only after admin approval will the payment status change to <strong>Payment Received</strong>.
                          </p>
                        </div>

                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-950 flex items-center justify-between">
                          <span>Amount to Transfer:</span>
                          <strong className="font-mono text-sm text-[#006C35] font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 3. NAYAPAY PANEL */}
                    {paymentMethod === 'NAYAPAY' && (
                      <div className="p-5 bg-white border border-[#F37021]/30 rounded space-y-4 text-xs">
                        {/* Store NayaPay Wallet Details */}
                        <div className="p-4 bg-[#F8F9FA] border border-black/[0.08] rounded space-y-2 text-[#333333]">
                          <div className="flex items-center justify-between pb-1 border-b border-black/[0.06]">
                            <strong className="text-xs text-[#141413] flex items-center gap-1.5">
                              Official Store NayaPay Wallet Details
                            </strong>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 font-bold text-[10px] rounded">
                              MANUAL TRANSFER
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            <div>
                              <span className="text-[#787774] block">Account Title:</span>
                              <strong className="text-[#141413]">{settings.nayapayAccountTitle || settings.storeName || 'Store Account'}</strong>
                            </div>
                            <div>
                              <span className="text-[#787774] block">NayaPay Number / ID:</span>
                              <strong className="font-mono text-[#B4470B] text-xs font-bold select-all">
                                {settings.nayapayNumber || '0300-XXXXXXX (Configured in Settings)'}
                              </strong>
                            </div>
                          </div>
                          <p className="text-[10.5px] text-[#666666] pt-1 border-t border-black/[0.06]">
                            {settings.nayapayInstructions || 'Send payment via NayaPay to the merchant number above. Enter your 6+ digit Transaction ID (TID) from your NayaPay receipt below.'}
                          </p>
                        </div>

                        {/* Customer TID Submission Form */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#141413] mb-1">
                              NayaPay Transaction ID (TID) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={wireReferenceNumber}
                              onChange={(e) => setWireReferenceNumber(e.target.value.toUpperCase())}
                              placeholder="e.g. NAYA-84920192 or 12-digit TID"
                              className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs focus:border-[#F37021] focus:ring-1 focus:ring-[#F37021] outline-hidden uppercase"
                            />
                            <span className="block text-[10px] text-[#787774] mt-1">
                              Required: Enter the Transaction ID from your NayaPay transfer confirmation
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#141413] mb-1">
                              Your Sender NayaPay Mobile Number (Optional)
                            </label>
                            <input
                              type="tel"
                              value={walletMobileNumber}
                              onChange={(e) => setWalletMobileNumber(e.target.value)}
                              placeholder="03XX-XXXXXXX"
                              className="w-full px-3.5 py-2 bg-white border border-black/20 rounded font-mono text-xs outline-hidden"
                            />
                          </div>
                        </div>

                        {/* Order Verification Notice */}
                        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-[11px] text-amber-950 space-y-1">
                          <strong className="block font-semibold">⚠️ Verification Workflow:</strong>
                          <p className="leading-relaxed">
                            Your order will stay in <strong>PENDING_VERIFICATION</strong> status. Our administrator will verify the funds in our NayaPay wallet before marking the order as <strong>Payment Received</strong>.
                          </p>
                        </div>

                        <div className="p-3 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-950 flex items-center justify-between">
                          <span>Amount to Transfer:</span>
                          <strong className="font-mono text-sm text-[#B4470B] font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 4. INTERNATIONAL CONCIERGE QUOTE PANEL */}
                    {paymentMethod === 'MANUAL_QUOTE' && !isNationalPakistan && (
                      <div className="p-5 bg-white border border-[#C5A059]/40 rounded space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-[#141413]">International Shipping Quote</strong>
                          <span className="px-2 py-0.5 bg-[#C5A059] text-[#0B0F17] font-mono text-[10px] font-semibold rounded">
                            QUOTE REQUIRED
                          </span>
                        </div>
                        <p className="text-[#575653] leading-relaxed text-[11px]">
                          Your destination ({country}) requires a binding freight and customs tariff calculation. We will calculate the exact shipping cost and send you a quote before any payment is requested.
                        </p>
                      </div>
                    )}

                    {/* Real-Time Payment Status Validation Banner */}
                    <div
                      className={`p-3 border rounded text-xs font-mono ${
                        paymentVerification.valid
                          ? 'bg-emerald-50/70 border-emerald-600/40 text-emerald-900'
                          : 'bg-rose-50/70 border-rose-500/40 text-rose-900'
                      }`}
                    >
                      {paymentVerification.message}
                    </div>

                    <div>
                      <label className="block text-xs text-[#575653] mb-1">
                        Delivery Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Gate code, landmark, or preferred delivery hour"
                        className="w-full px-3.5 py-2 border border-black/15 text-xs rounded"
                      />
                    </div>
                  </div>

                    {/* Step 2 Inline Friendly Error Banner */}
                    {checkoutErrorBanner && (
                      <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded text-[#141413] text-xs leading-relaxed shadow-sm flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <strong className="block text-amber-950 font-bold">Checkout Notice:</strong>
                          <p className="text-amber-900">{checkoutErrorBanner}</p>
                          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            <a
                              href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I need assistance placing my order on ${settings.storeName || 'your store'}: "${checkoutErrorBanner}"`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-800 font-bold hover:underline"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Need help? Chat on WhatsApp
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Row on Step 2 */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        disabled={isSubmittingOrder}
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-5 py-4 border border-black/20 text-[#141413] hover:bg-[#F7F6F2] disabled:opacity-50 text-xs font-semibold uppercase tracking-wider rounded cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Address</span>
                      </button>

                      <button
                        type="submit"
                        disabled={
                          isSubmittingOrder ||
                          cart.length === 0 ||
                          !addressVerification.isFullyVerified ||
                          !paymentVerification.valid
                        }
                        className="flex-1 py-4 bg-[#F85606] hover:bg-[#E04D05] text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm disabled:opacity-60 disabled:hover:bg-[#F85606] cursor-pointer disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 select-none"
                      >
                        {isSubmittingOrder ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                            <span>Processing & Confirming Order... Please wait</span>
                          </div>
                        ) : !paymentVerification.valid ? (
                          'Complete Payment Details to Continue'
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>
                              {paymentMethod === 'COD'
                                ? `Confirm Order (Cash on Delivery) · ${formatPKR(grandTotal)}`
                                : `Submit Order with TID (${paymentMethod === 'NAYAPAY' ? 'NayaPay' : 'Bank/RAAST'}) · ${formatPKR(grandTotal)}`}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#787774] text-center mt-2 leading-relaxed">
                      🔒 {paymentMethod === 'COD'
                        ? 'Pay cash directly to courier on delivery.'
                        : 'Order will stay in PENDING_VERIFICATION status until verified and approved by the store administrator.'}
                    </p>
                  </div>
                )}
                </form>

                {/* Right Order Summary */}
                <aside className="lg:col-span-5 bg-white border border-black/[0.07] p-6 space-y-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                    Order Summary ({cartCount} items)
                  </h2>

                  <div className="divide-y divide-black/[0.06] max-h-80 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={`${item.productId}-${item.variantLabel}`}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 bg-[#F7F6F2] shrink-0 overflow-hidden">
                            <ProductImage src={item.primaryImage} alt={item.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#141413] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-[#787774]">
                              {item.variantLabel} · Qty {item.quantity}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs">
                    <div className="flex justify-between text-[#575653]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                    </div>
                    {couponAmount > 0 && (
                      <div className="flex justify-between text-[#166534]">
                        <span>Discount ({appliedCoupon?.code})</span>
                        <span className="font-mono tabular-nums">-{formatDualPrice(couponAmount, true)}</span>
                      </div>
                    )}
                    {referral?.enabled && referral.available > 0 && (
                      <label className="flex justify-between items-center gap-2 text-[#166534] cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
                          Refer & Earn credit ({formatPKR(referral.available)} available)
                        </span>
                        <span className="font-mono tabular-nums">{creditAmount > 0 ? `-${formatDualPrice(creditAmount, true)}` : '—'}</span>
                      </label>
                    )}
                    <div className="flex justify-between items-start text-[#575653]">
                      <div>
                        <span className="block font-medium text-[#141413]">
                          {liveShippingCalc.carrier}
                        </span>
                        <span className="block text-[10px] text-[#787774]">
                          {liveShippingCalc.zoneName} · {liveShippingCalc.billableWeightKg}kg billable
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-right">
                        {isQuoteFlow ? (
                          <span className="text-[#8C6D46] font-medium">Pending Quote</span>
                        ) : liveShippingCalc.freeShippingApplied ? (
                          <span className="text-emerald-700">COMPLIMENTARY</span>
                        ) : (
                          <>
                            {formatPKR(shippingFee)}
                          </>
                        )}
                      </span>
                    </div>

                    {/* Customs Tariff & Tax Breakdown */}
                    <div className="flex justify-between text-[#575653]">
                      <div>
                        <span>Tax &amp; Customs</span>
                        <span className="block text-[10px] text-[#787774]">
                          {isNationalPakistan
                            ? `Sales Tax (${settings.taxRate}%)`
                            : `Export Tax 0% · Customs Mode: ${liveShippingCalc.customsMode}`}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums">
                        {taxAmount > 0 ? formatDualPrice(taxAmount, true) : 'PKR 0 (DAP)'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#F7F6F2] border border-black/[0.05] text-[10px] text-[#575653] leading-relaxed">
                      <strong>Customs Term:</strong> {liveShippingCalc.customsNotice}
                    </div>

                    <div className="flex justify-between text-base font-semibold text-[#141413] pt-3 border-t border-black/[0.07]">
                      <span>Total Due</span>
                      <span className="font-mono tabular-nums text-right">
                        {formatPKR(grandTotal)}
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {/* ======================== 5. CLIENT ACCOUNT & ORDER TIMELINE ======================== */}
        {subView === 'ACCOUNT' && (
          <div className="max-w-[1200px] mx-auto px-6 py-12 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-black/[0.07] gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                  My Account
                </div>
                <h1 className="text-3xl font-display font-medium text-[#141413]">
                  {firebaseUser ? userProfile?.name || firebaseUser.email : 'Guest'}
                </h1>
                <p className="text-xs text-[#575653] mt-1">
                  {firebaseUser
                    ? `${userProfile?.email || firebaseUser.email || ''}${isAdmin ? ` · ${userProfile?.role}` : ''}`
                    : 'Sign in to see your orders and tracking on every device.'}
                </p>
              </div>

              <div>
                {firebaseUser ? (
                  <button
                    onClick={async () => {
                      await signOut();
                      setSubView('HOME');
                    }}
                    className="px-5 py-2.5 border border-black/20 text-xs font-medium hover:border-[#141413] cursor-pointer"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                  >
                    Login / Sign up
                  </button>
                )}
              </div>
            </div>

            {firebaseUser && !emailVerified && firebaseUser.providerData.some((p) => p.providerId === 'password') && (
              <div className="p-4 bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
                <span>
                  Your email ({firebaseUser.email}) is not verified yet. Please open the link we emailed you.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await resendVerificationEmail();
                      showToast(r.message || '');
                    }}
                    className="px-3 py-1.5 border border-amber-500 font-semibold cursor-pointer"
                  >
                    Resend link
                  </button>
                  <button
                    type="button"
                    onClick={refreshAccount}
                    className="px-3 py-1.5 bg-amber-600 text-white font-semibold cursor-pointer"
                  >
                    I have verified it
                  </button>
                </div>
              </div>
            )}

            {/* The rules that protect the customer on every order */}
            <details className="group bg-white border border-emerald-200">
              <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#0E7A43]" />
                  <span>
                    <strong className="block text-sm text-[#141413]">Customer Protection Policy</strong>
                    <span className="text-xs text-[#575653]">Original products, 7-day returns, refunds and support on every order</span>
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-[#575653] transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 border-t border-black/[0.06] pt-4">
                <PolicyDocument intro={CUSTOMER_PROTECTION.intro} sections={CUSTOMER_PROTECTION.sections} compact />
              </div>
            </details>

            {/* Refer & Earn: share a link, get credit when a friend's first order is delivered */}
            <ReferAndEarnCard signedIn={!!firebaseUser} onSignIn={() => setAuthModalOpen(true)} showToast={showToast} />

            <div className="space-y-6">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Order History & Fulfillment Timelines ({orders.length})
              </h2>

              {orders.length === 0 ? (
                <div className="p-8 bg-white border border-black/[0.07] text-xs text-[#575653]">
                  No orders recorded in this session yet. Explore the collection to place your first order.
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-6 bg-white border border-black/[0.07] space-y-4"
                    >
                      {/* Live progress (the customer's orders update in real time) */}
                      <OrderTimeline order={order} />
                      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-black/[0.05]">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-semibold text-sm text-[#141413]">
                            {order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[#787774]">
                            {order.createdAt.slice(0, 10)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#141413]">
                            Status:{' '}
                            {order.status === 'PENDING' ? (
                              <span className="text-amber-800 font-semibold">
                                PENDING (Awaiting Payment)
                              </span>
                            ) : order.status === 'PENDING_CONFIRMATION' ? (
                              <span className="text-amber-800 font-semibold">
                                Order received · awaiting confirmation call
                              </span>
                            ) : order.status === 'CONFIRMED' ? (
                              <span className="text-emerald-800 font-semibold">
                                CONFIRMED (Processing &amp; Fulfillment)
                              </span>
                            ) : (
                              <span className="font-semibold">{order.status}</span>
                            )}
                          </span>
                          <span aria-hidden="true">·</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#787774]">Payment:</span>
                            {order.paymentStatus === 'PAID' ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold text-[10px] rounded">
                                ✓ PAID · Verified &amp; Confirmed
                              </span>
                            ) : order.paymentStatus === 'PENDING_VERIFICATION' ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[10px] rounded">
                                ⏳ PENDING VERIFICATION · Unpaid
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-medium text-[10px] rounded">
                                {order.paymentStatus}
                              </span>
                            )}
                            <span className="text-[#787774]">({order.paymentMethod})</span>
                            {order.paymentReference && (
                              <span className="text-[#8C6D46] font-mono font-semibold text-[11px]">
                                Ref: {order.paymentReference}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="font-mono tabular-nums text-sm font-semibold text-[#141413] text-right">
                          <span>{formatPKR(order.total)}</span>
                        </div>
                      </div>

                      {/* Prominent Payment Notice for unverified orders */}
                      {order.paymentStatus === 'PENDING_VERIFICATION' && (
                        <div className="p-3 bg-amber-50/90 border border-amber-300 text-xs text-amber-900 rounded space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>⚠️ Payment Notice:</span>
                            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                              NOT CHARGED AUTOMATICALLY
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            No money was deducted from your account automatically. The order is <strong>PENDING</strong> and will be confirmed and prepared once the store verifies your payment.
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-[#575653] flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <span className="text-[#787774]">Store: </span>
                          <strong className="text-[#141413] font-semibold">{settings.storeName || 'Online Store'}</strong>
                          <span className="mx-2 text-black/20">|</span>
                          <span className="text-[#787774]">Destination: </span>
                          {order.shippingAddressSummary || 'In-Boutique Collection'}
                        </div>
                        <div className="flex items-center gap-3">
                          {order.trackingNumber && (
                            <div className="font-mono">
                              Tracking: <strong>{order.trackingNumber}</strong>
                            </div>
                          )}
                          <span className="text-[11px] text-[#575653] font-mono">
                            Email updates sent to {order.customerEmail}
                          </span>
                        </div>
                      </div>

                      {/* Interactive International Shipping Quote Workflow Banner */}
                      {order.status === 'QUOTE_REQUESTED' && (
                        <div className="p-3 bg-amber-50 border border-amber-300 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-amber-950">Freight Quote Requested</strong>
                            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5">UNDER REVIEW</span>
                          </div>
                          <p className="text-amber-900 text-[11px]">
                            We are calculating the international shipping cost for your parcel. You will see the quote here.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_READY' && (
                        <div className="p-4 bg-emerald-50 border border-emerald-600/40 text-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-950 font-medium">Formal Freight &amp; Customs Quote Ready</strong>
                            <span className="text-[10px] font-mono bg-emerald-600 text-white px-2 py-0.5">ACTION REQUIRED</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] bg-white p-3 border border-emerald-600/20">
                            <div>Courier: <strong className="text-black block">{order.quoteCourier || 'DHL Express'}</strong></div>
                            <div>Customs: <strong className="text-black block">{order.quoteCustomsMode || 'DAP'}</strong></div>
                            <div>Delivery: <strong className="text-black block">{order.quoteEstimatedDays || '4–6 days'}</strong></div>
                            <div>Shipping Fee: <strong className="text-emerald-800 block">PKR {order.quoteAmount?.toLocaleString()}</strong></div>
                          </div>
                          {order.quoteAdminNotes && (
                            <p className="text-[11px] text-[#575653] italic">
                              Note: {order.quoteAdminNotes}
                            </p>
                          )}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, true)}
                              className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-semibold cursor-pointer"
                            >
                              ✓ Accept Quote &amp; Proceed to Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, false)}
                              className="px-3 py-2 border border-rose-300 text-rose-800 text-xs font-medium cursor-pointer"
                            >
                              ✕ Decline Quote
                            </button>
                          </div>
                        </div>
                      )}

                      {order.status === 'QUOTE_ACCEPTED' && (
                        <div className="p-3 bg-blue-50 border border-blue-300 text-xs space-y-1">
                          <strong className="text-blue-950">Freight Quote Accepted</strong>
                          <p className="text-blue-900 text-[11px]">
                            Carrier: {order.quoteCourier || 'DHL Express'} ({order.quoteCustomsMode || 'DAP'}). Total balance: PKR {order.total?.toLocaleString()}. Payment remains {order.paymentStatus}. Please initiate bank wire or RAAST transfer to confirm shipment.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_REJECTED' && (
                        <div className="p-3 bg-slate-100 border border-slate-300 text-xs text-slate-700">
                          <strong>Freight Quote Declined</strong> — Order closed without charge.
                        </div>
                      )}

                      {/* Order Fulfillment Stepper Timeline */}
                      <div className="grid grid-cols-5 gap-2 pt-2">
                        {(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const).map(
                          (step, idx) => {
                            const statusOrder = [
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                            ];
                            const currentIdx = statusOrder.indexOf(order.status as any);
                            const stepIdx = statusOrder.indexOf(step);
                            const active = currentIdx >= stepIdx;
                            return (
                              <div key={step} className="space-y-1">
                                <div
                                  className={`h-1 w-full ${
                                    order.status === 'CANCELLED' || order.status === 'REFUNDED'
                                      ? 'bg-[#991B1B]/30'
                                      : active
                                      ? 'bg-[#141413]'
                                      : 'bg-black/10'
                                  }`}
                                />
                                <span className="block text-[10px] font-mono uppercase text-[#787774]">
                                  0{idx + 1}. {step}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== 6. WISHLIST VIEW ======================== */}
        {subView === 'WISHLIST' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-8">
            <h1 className="text-3xl font-display font-medium text-[#141413]">
              My Wishlist ({wishlist.length})
            </h1>
            {wishlist.length === 0 ? (
              <div className="p-10 bg-white border border-black/[0.07] text-xs text-[#575653]">
                Your wishlist is empty. Click the heart icon on any piece to save it for later inspection.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => wishlist.includes(p.id))
                  .map((product) => (
                    <div
                      key={product.id}
                      data-pid={product.id}
                      className="p-5 bg-white border border-black/[0.07] flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div
                          onClick={() => handleSelectProduct(product)}
                          className="aspect-[4/3] bg-[#F7F6F2] mb-4 overflow-hidden cursor-pointer"
                        >
                          <ProductImage src={product.primaryImage} alt={product.name} />
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{product.name}</h3>
                        <p className="text-xs font-mono tabular-nums text-[#575653] mt-1">
                          <span className="font-semibold text-[#141413]">{formatPKR(product.price)}</span> · {product.stock} in stock
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addToCart(product, 1)}
                          className="flex-1 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                        >
                          Move to Bag
                        </button>
                        <button
                          onClick={() => toggleWishlist(product.id)}
                          className="p-2 border border-black/15 text-[#575653] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Welcome offer for first-time visitors, and real recent purchases */}
      <WelcomeOfferPopup
        settings={settings}
        onApply={(code) => {
          const r = applyCouponCode(code);
          showToast(r.success ? `Code ${code} will be used on your first order.` : `Use code ${code} at checkout.`);
        }}
      />
      <SocialProofToast
        enabled={settings.socialProofEnabled !== false}
        onOpen={(id) => {
          const p = products.find((x) => x.id === id);
          if (p) handleSelectProduct(p);
        }}
      />

      {/* Slide-Over Shopping Bag Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FBFBF9] h-full flex flex-col justify-between border-l border-black/10 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.08]">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Shopping Bag ({cartCount})
              </h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="px-2.5 py-1 border border-black/15 text-[11px] text-[#575653] hover:text-[#141413] cursor-pointer"
                  >
                    Clear Bag
                  </button>
                )}
                <button
                  onClick={() => setCartDrawerOpen(false)}
                  className="p-1.5 text-[#575653] hover:text-[#141413] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 divide-y divide-black/[0.06]">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#575653]">
                  Your shopping bag is currently empty.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={`${item.productId}-${item.variantLabel}`}
                    className="py-4 flex gap-4"
                  >
                    <div className="w-16 h-16 bg-[#F3F2EE] shrink-0 overflow-hidden">
                      <ProductImage src={item.primaryImage} alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-[#141413] truncate">
                          {item.name}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.productId, item.variantLabel)}
                          className="text-[#787774] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[11px] text-[#787774] mt-0.5">{item.variantLabel}</div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-black/15 bg-white">
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity - 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-2.5 text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity + 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-4 border-t border-black/[0.08] space-y-4">
                {/* Promotional Code Box */}
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Promo code"
                      className="flex-1 px-3 py-2 bg-white border border-black/15 text-xs font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const res = applyCouponCode(couponInput);
                        setCouponFeedback(res.message);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {couponFeedback && (
                    <div className="text-[11px] text-[#575653] mt-1 flex items-center justify-between">
                      <span>{couponFeedback}</span>
                      {appliedCoupon && (
                        <button
                          onClick={() => {
                            removeCoupon();
                            setCouponFeedback(null);
                          }}
                          className="underline text-[#991B1B] cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#575653]">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[#166534]">
                      <span>Discount{appliedCoupon ? ` (${appliedCoupon.code})` : ''}{creditAmount > 0 ? ' + referral credit' : ''}</span>
                      <span className="font-mono tabular-nums">-{formatDualPrice(discountAmount, true)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-[#141413] pt-2 border-t border-black/[0.06]">
                    <span>Estimated Total</span>
                    <span className="font-mono tabular-nums text-right">
                      {formatPKR(Math.max(0, cartSubtotal - discountAmount))}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCartDrawerOpen(false);
                    setConfirmedOrderNumber(null);
                    setCheckoutStep(1);
                    setSubView('CHECKOUT');
                  }}
                  className="w-full py-3.5 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] cursor-pointer"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Dedicated Store Policy & Order Tracking Pages */}
      {['REFUND_POLICY', 'TERMS', 'PRIVACY_POLICY', 'SHIPPING_POLICY', 'CONTACT_US', 'ORDER_TRACKING'].includes(subView) && (
        <Suspense fallback={<div className="min-h-[50vh]" />}>
        <StorePolicyPages
          page={subView as PolicyPageType}
          settings={settings}
          initialOrderNumber={trackingOrderInput || confirmedOrderNumber || ''}
          initialPhone={customerPhone || ''}
          initialToken={trackingTokenInput || (trackingOrderInput ? '' : confirmedOrderAccessToken || '')}
          onOpenOrder={openOrderTracking}
          onNavigate={(dest) => {
            if (dest === 'HOME' || dest === 'CATALOG') {
              setSubView(dest);
              window.history.pushState(null, '', dest === 'HOME' ? '/' : '#catalog');
            } else {
              setSubView(dest);
              window.history.pushState(null, '', `#${dest.toLowerCase().replace('_', '-')}`);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        </Suspense>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-[#141413] text-[#FBFBF9] border-t border-white/10 mt-20">
        <div className="max-w-[1360px] mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-10 text-xs">
          {/* Col 1: Store Brand & Direct WhatsApp */}
          <div className="space-y-4">
            <BrandLogo name={settings.storeName} tone="dark" size="lg" />
            <p className="text-white/60 leading-relaxed">
              Quality curated products, nationwide expedited delivery, and dedicated customer support. Operated with precision and care.
            </p>
            {/* Click-to-Chat WhatsApp Badge */}
            <div className="pt-1">
              <a
                href={`https://wa.me/${(settings.whatsappNumber || settings.helplineWhatsApp || '923001234567').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Assalam-o-Alaikum! I have an inquiry for ${settings.storeName || 'your store'}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded transition-colors shadow-xs"
              >
                <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
                <span>WhatsApp: {settings.helplineWhatsAppFormatted || settings.whatsappNumber || '+92 300 1234567'}</span>
              </a>
            </div>
          </div>

          {/* Col 2: Customer Policies & Legal */}
          <div className="space-y-2.5">
            <div className="font-semibold uppercase tracking-wider text-white/90">
              Customer Care &amp; Policies
            </div>
            <ul className="space-y-2 text-white/70">
              <li>
                <a href="/seller" className="font-semibold text-[#E5C98A] hover:text-white transition-colors">
                  Sell on {settings.storeName || 'My Store'} → Seller Center
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('REFUND_POLICY');
                    window.history.pushState(null, '', '#refund-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white cursor-pointer transition-colors text-left"
                >
                  Refund &amp; Return Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('TERMS');
                    window.history.pushState(null, '', '#terms');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white cursor-pointer transition-colors text-left"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('PRIVACY_POLICY');
                    window.history.pushState(null, '', '#privacy-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white cursor-pointer transition-colors text-left"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('SHIPPING_POLICY');
                    window.history.pushState(null, '', '#shipping-policy');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white cursor-pointer transition-colors text-left"
                >
                  Shipping &amp; Delivery Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('ORDER_TRACKING');
                    window.history.pushState(null, '', '#track');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer transition-colors text-left flex items-center gap-1.5"
                >
                  <Package className="w-3.5 h-3.5 inline" />
                  <span>Track Your Order</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSubView('CONTACT_US');
                    window.history.pushState(null, '', '#contact');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white cursor-pointer transition-colors text-left"
                >
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Collections & Shopping */}
          <div className="space-y-2.5">
            <div className="font-semibold uppercase tracking-wider text-white/90">Collections</div>
            <ul className="space-y-1.5 text-white/60">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setActiveCategory(c.name);
                      setSubView('CATALOG');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white cursor-pointer transition-colors text-left"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
              <li className="pt-2">
                <PWAInstallButton variant="footer" />
              </li>
            </ul>
          </div>

          {/* Col 4: Helpline & Courier Logistics */}
          <div className="space-y-3">
            <div className="font-semibold uppercase tracking-wider text-white/90">
              Client Support &amp; Couriers
            </div>
            <ul className="space-y-2 text-white/60">
              <li>
                <a
                  href={`https://wa.me/${(settings.whatsappNumber || settings.helplineWhatsApp || '923001234567').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Assalam-o-Alaikum! I need help with my order on ${settings.storeName || 'the store'}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>WhatsApp: {settings.helplineWhatsAppFormatted || settings.whatsappNumber || '+92 300 1234567'}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${settings.helplineEmail || settings.contactEmail || 'support@store.com'}`}
                  className="hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-white/60 shrink-0" />
                  <span>{settings.helplineEmail || settings.contactEmail || 'support@store.com'}</span>
                </a>
              </li>
              <li>
                <a
                  href={`tel:${settings.helplinePhone || '+923001234567'}`}
                  className="hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-white/60 shrink-0" />
                  <span>{settings.helplinePhone || '+92 (042) 3578-9000'}</span>
                </a>
              </li>
              <li className="text-[11px] text-white/40 pt-1">
                Nationwide Courier: TCS · Leopards · PostEx · Trax · M&amp;P
              </li>
              <li className="text-[11px] text-white/40">
                Operating Hours: {settings.helplineHours || 'Mon–Sat: 9:00 AM – 9:00 PM'}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Horizontal Policy Links */}
        <div className="max-w-[1360px] mx-auto px-6 py-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-white/50">
          <span>© 2026 {settings.storeName}. All Rights Reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-white/60">
            <button
              onClick={() => {
                setSubView('REFUND_POLICY');
                window.history.pushState(null, '', '#refund-policy');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white cursor-pointer"
            >
              Refund Policy
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSubView('TERMS');
                window.history.pushState(null, '', '#terms');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSubView('PRIVACY_POLICY');
                window.history.pushState(null, '', '#privacy-policy');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSubView('SHIPPING_POLICY');
                window.history.pushState(null, '', '#shipping-policy');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white cursor-pointer"
            >
              Shipping Policy
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSubView('CONTACT_US');
                window.history.pushState(null, '', '#contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-white cursor-pointer"
            >
              Contact Us
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setSubView('ORDER_TRACKING');
                window.history.pushState(null, '', '#track');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-amber-300 font-medium cursor-pointer"
            >
              Track Order
            </button>
          </div>
        </div>
      </footer>


      {/* ========================================================================= */}
      {/* 7.5. GUEST & MEMBER LIVE ORDER TRACKING MODAL */}
      {/* Accessible via /track?order=...&token=... or on-screen Tracking Link */}
      {/* ========================================================================= */}
      {isTrackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#FBFBF9] border border-black/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#141413] text-[#FBFBF9] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-semibold tracking-wide">Live Order Tracking & Status</h3>
                  <div className="text-[10px] text-white/60">Courier & Verification Portal</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTrackingModalOpen(false)}
                className="text-white/60 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Search Form */}
              <div className="p-4 bg-white border border-black/[0.08] rounded space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#787774] mb-1">
                      Order Reference (e.g. ORD-104928)
                    </label>
                    <input
                      type="text"
                      value={trackingOrderInput}
                      onChange={(e) => setTrackingOrderInput(e.target.value.toUpperCase())}
                      placeholder="ORD-XXXXXX"
                      className="w-full px-3 py-2 border border-black/20 text-xs font-mono uppercase bg-[#FBFBF9]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#787774] mb-1">
                      Access Token (for Guest Orders)
                    </label>
                    <input
                      type="text"
                      value={trackingTokenInput}
                      onChange={(e) => setTrackingTokenInput(e.target.value)}
                      placeholder="Token from confirmation or email"
                      className="w-full px-3 py-2 border border-black/20 text-xs font-mono bg-[#FBFBF9]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={trackingLoading || !trackingOrderInput.trim()}
                    onClick={() => handleTrackOrder(trackingOrderInput, trackingTokenInput)}
                    className="px-5 py-2 bg-[#141413] hover:bg-[#2A2A28] disabled:opacity-40 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {trackingLoading ? 'Searching...' : 'Locate Order'}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {trackingError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{trackingError}</span>
                </div>
              )}

              {/* Order Tracking Dossier */}
              {trackedOrder && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-black/[0.08] rounded space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-[#8C6D46] font-semibold">
                          Order Reference
                        </div>
                        <div className="text-lg font-mono font-bold text-[#141413]">
                          {trackedOrder.orderNumber}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded ${
                          trackedOrder.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : trackedOrder.status === 'SHIPPED'
                            ? 'bg-sky-100 text-sky-800'
                            : trackedOrder.status === 'CANCELLED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          Status: {trackedOrder.status}
                        </span>
                        <span className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded ${
                          trackedOrder.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          Payment: {trackedOrder.paymentStatus}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#787774] block">Payment Protocol:</span>
                        <strong className="text-[#141413]">{trackedOrder.paymentMethod}</strong>
                        {trackedOrder.paymentReference && (
                          <div className="text-[11px] text-[#8C6D46] pt-0.5">
                            TID: {trackedOrder.paymentReference}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-[#787774] block">Total Amount:</span>
                        <strong className="text-[#141413] text-sm">
                          {trackedOrder.currency} {Number(trackedOrder.total).toLocaleString()}
                        </strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[#787774] block">Shipping Destination:</span>
                        <span className="text-[#141413]">{trackedOrder.shippingAddressSummary}</span>
                      </div>
                      {trackedOrder.trackingNumber && (
                        <div className="sm:col-span-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded">
                          <span className="font-semibold block">Courier Tracking:</span>
                          <span className="font-mono text-xs">
                            {trackedOrder.courierName || 'Courier'} — {trackedOrder.trackingNumber}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Order Items */}
                    {Array.isArray(trackedOrder.items) && trackedOrder.items.length > 0 && (
                      <div className="border-t border-black/[0.06] pt-3 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                          Ordered Items ({trackedOrder.items.length})
                        </div>
                        <div className="divide-y divide-black/[0.04]">
                          {trackedOrder.items.map((it: any, idx: number) => (
                            <div key={idx} className="py-2 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-[#141413]">{it.name}</span>
                                <span className="text-[#787774] font-mono text-[11px] ml-2">({it.sku})</span>
                              </div>
                              <div className="font-mono text-right">
                                <span>{it.quantity} × {trackedOrder.currency} {Number(it.price).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Customer Cancellation Option for PENDING orders */}
                    {(trackedOrder.status === 'PENDING' || trackedOrder.status === 'PENDING_CONFIRMATION') && (
                      <div className="border-t border-black/[0.06] pt-3 flex items-center justify-between">
                        <span className="text-[11px] text-[#787774]">
                          Order is currently pending fulfillment. You may cancel it to restore items.
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Are you sure you want to cancel this order?')) return;
                            try {
                              const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
                              const cRes = await fetch('/api/orders/cancel', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: JSON.stringify({
                                  orderNumber: trackedOrder.orderNumber,
                                  orderAccessToken: trackingTokenInput || confirmedOrderAccessToken,
                                  reason: 'Cancelled by customer',
                                }),
                              });
                              const cData = await cRes.json();
                              if (cRes.ok) {
                                showToast?.('Order cancelled and inventory restored.');
                                handleTrackOrder(trackedOrder.orderNumber, trackingTokenInput);
                              } else {
                                showToast?.(cData.error || 'Failed to cancel order.');
                              }
                            } catch {
                              showToast?.('Network error cancelling order.');
                            }
                          }}
                          className="px-3.5 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium cursor-pointer"
                        >
                          Cancel Order
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-white border-t border-black/[0.08] flex justify-end">
              <button
                type="button"
                onClick={() => setIsTrackingModalOpen(false)}
                className="px-5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
              >
                Close Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. FLOATING 24/7 HELPLINE & CLIENT CONCIERGE WIDGET */}
      {/* Quick access to AI Chat, WhatsApp direct chat, and Email Tickets */}
      {/* ========================================================================= */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        {/* Direct WhatsApp Instant Chat Launch Pill */}
        <a
          href={`https://wa.me/${settings.helplineWhatsApp || ''}?text=${encodeURIComponent(
            'Assalam o Alaikum, I need assistance regarding an inquiry.'
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Direct WhatsApp (${settings.helplineWhatsAppFormatted || 'Helpline'})`}
          className="w-11 h-11 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg border border-emerald-500/40 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
        </a>

        {/* 24/7 Helpline & AI Concierge Pill */}
        <button
          type="button"
          onClick={() => {
            setHelplineInitialTab('AI_CHAT');
            setIsHelplineOpen(true);
          }}
          className="px-4 py-2.5 rounded-full bg-[#141413] hover:bg-[#2A2A28] text-[#FBFBF9] shadow-xl border border-white/20 flex items-center gap-2.5 transition-transform hover:scale-105 active:scale-95 cursor-pointer text-xs font-medium"
        >
          <div className="relative flex items-center justify-center">
            <Headphones className="w-4 h-4 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </div>
          <span className="font-semibold tracking-wide">24/7 Helpline & AI</span>
        </button>
      </div>

      {/* Customer Helpline Drawer Modal */}
      <CustomerHelplineDrawer
        isOpen={isHelplineOpen}
        onClose={() => setIsHelplineOpen(false)}
        initialTab={helplineInitialTab}
        initialOrderNumber={helplineOrderNumber}
      />
    </div>
  );
};
