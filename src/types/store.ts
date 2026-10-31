export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'PRODUCT_MANAGER'
  | 'ORDER_MANAGER'
  | 'CUSTOMER';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  /** Address of the customer's last order, saved by the server (prefills the next checkout) */
  defaultAddress?: import('../services/intlAddress').ShippingAddress & { updatedAt?: string };
  createdAt: string;
  updatedAt?: string;
}

export type SellerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/** Marketplace seller shop (sellers/{ownerUid}) */
export interface SellerShop {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  shopName: string;
  phone: string;
  city: string;
  status: SellerStatus;
  statusReason?: string;
  /** Overrides the store's default commission for this seller */
  commissionPercent?: number;
  /** Shop / profile picture: a small JPEG data URL or an https link */
  logoUrl?: string;
  /** Global sellers (src/services/vendorRules.ts) */
  sellerType?: 'INDIVIDUAL' | 'BUSINESS';
  businessName?: string;
  /** Country of operation (ISO code) */
  countryCode?: string;
  warehouseCountry?: string;
  warehouseCity?: string;
  /** Given when approved: unique vendor ID ("AV-PK-00001") and the country orders ship from */
  vendorId?: string;
  shipsFromCountry?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Seller details only the seller and the store admins can see (seller_private/{ownerUid}) */
export interface SellerPrivate {
  /** CNIC (Pakistan); empty for sellers from other countries */
  cnic: string;
  /** CNIC in Pakistan, national ID / passport number elsewhere */
  idNumber?: string;
  /** NTN / VAT / EIN / TRN ... */
  taxId?: string;
  address: string;
  /** How the seller is paid (Pakistani bank, IBAN, US routing number or Payoneer) */
  payout?: import('../services/vendorRules').PayoutDetails;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
}

export interface SellerPayout {
  id: string;
  sellerId: string;
  amount: number;
  orderIds: string[];
  reference: string;
  note?: string;
  paidAt: string;
  paidBy: string;
}

/** One choice of a product, e.g. "Red / Large" (src/services/productVariants.ts) */
export interface ProductVariant {
  id: string;
  name: string;
  /** Its own price; absent = the product's price */
  price?: number;
  stock: number;
  sku?: string;
}

export interface ProductStudioShot {
  shotType: string;
  caption: string;
  lightingSetup: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  approved?: boolean;
}

export type SupplierName = 'Oshi' | 'YourMart' | 'HHC' | 'Own Stock' | 'Other';

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  // Dropshipping & Admin-Only Supplier Fields
  supplierName?: SupplierName | string;
  supplierProductUrl?: string;
  supplierSku?: string;
  supplierCostPrice?: number;
  stock: number;
  reservedStock?: number;
  lowStockThreshold?: number;
  category: string;
  subcategory?: string;
  brand: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  /** Marketplace seller that sells and ships this product (absent = the store itself) */
  sellerId?: string;
  sellerName?: string;
  /** Seller's vendor ID (AV-<country>-00001) and the warehouse country the parcel leaves from */
  vendorId?: string;
  shipsFromCountry?: string;
  /** Where the seller ships this product and their own fees (src/services/productShipping.ts) */
  shipping?: import('../services/productShipping').ProductShipping;
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  primaryImage?: string;
  /** All pictures (up to 8, the first is primaryImage) */
  images?: string[];
  /** Optional product video (uploaded file or https link, e.g. YouTube) */
  videoUrl?: string;
  /** Flash deal: this price applies between flashStartsAt and flashEndsAt (src/services/promotions.ts) */
  flashPrice?: number;
  flashStartsAt?: string;
  flashEndsAt?: string;
  rating?: number;
  reviewCount?: number;
  /** Customer likes / dislikes (totals kept by the server) */
  likes?: number;
  dislikes?: number;
  weightKg?: number;
  dimensions?: string;
  /** Specifications, how to use, care and user manual (src/services/productInfo.ts) */
  info?: import('../services/productInfo').ProductInfo;
  /** Choices the customer picks from (colour, size, ...); stock is then the sum of theirs */
  variants?: ProductVariant[];
  /** What the choices are, e.g. "Colour" or "Size" */
  variantTitle?: string;
  createdAt: string;
  updatedAt?: string;
}

// Admin-only product data, stored in product_private/{productId} so customers can never read it.
export interface ProductPrivate {
  productId: string;
  costPrice?: number;
  supplierName?: SupplierName | string;
  supplierProductUrl?: string;
  supplierSku?: string;
  supplierCostPrice?: number;
  updatedAt?: string;
}

// Admin-only order data (supplier per item), stored in order_private/{orderId}.
export interface OrderPrivateItem {
  productId: string;
  supplierName?: SupplierName | string;
  supplierSku?: string;
  supplierProductUrl?: string;
  supplierCostPrice?: number;
}

export interface OrderPrivate {
  orderId: string;
  items: OrderPrivateItem[];
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  productCount?: number;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  variantLabel?: string;
  primaryImage?: string;
  category: string;
}

export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'RETURNED'
  | 'QUOTE_REQUESTED'
  | 'QUOTE_READY'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_EXPIRED';

export type PaymentStatus =
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentMethod =
  | 'COD'
  | 'RAAST_IBAN'
  | 'BANK_TRANSFER'
  | 'NAYAPAY'
  | 'HBL_BANK'
  | 'BANK_ACCOUNT'
  | 'MANUAL'
  | 'MANUAL_QUOTE'
  /** International card, paid on the gateway's hosted page (server/cardPayments.ts) */
  | 'CARD';

export type CustomsMode = 'NOT_APPLICABLE' | 'DAP' | 'DDP';

export interface ShippingCalculationSnapshot {
  destCountryIso: string;
  destZoneName: string;
  carrier: string;
  actualWeightKg: number;
  volumetricWeightKg: number;
  billableWeightKg: number;
  baseFee: number;
  additionalWeightFee: number;
  freeShippingApplied: boolean;
  finalShippingFee: number;
  currency: string;
  customsMode: CustomsMode;
  customsNotice: string;
  estimatedDelivery: string;
  requiresManualQuote: boolean;
  calculatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  image?: string;
  /** The variant the customer chose, e.g. "Red / Large" */
  variant?: string;
  // Dropshipping fields
  supplierName?: SupplierName | string;
  supplierSku?: string;
  supplierProductUrl?: string;
  supplierCostPrice?: number;
}

export type ShipmentCourier =
  | 'TCS'
  | 'Leopards'
  | 'PostEx'
  | 'M&P'
  | 'Trax'
  | 'BlueEx'
  | 'Call Courier'
  | 'Other';

export type ShipmentStatus =
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED';

/** One line in the order's tracking history shown to the customer */
export interface OrderTrackingEvent {
  at: string;
  /** Set when the event is a status change */
  status?: string;
  /** e.g. "Lahore hub" (admin location updates) */
  location?: string;
  note: string;
}

export interface OrderShipment {
  id: string;
  supplierName?: SupplierName | string;
  itemIds: string[];
  courierName: ShipmentCourier | string;
  trackingNumber: string;
  trackingUrl: string;
  status: ShipmentStatus;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string | null;
  orderAccessToken?: string;
  items?: OrderItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  destCountryIso?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentSubMethod?: string;
  paymentReference?: string;
  paymentProofDetails?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedAt?: string;
  paymentVerificationNote?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  /** The customer asked to cancel after the free-cancel time (src/services/cancelPolicy.ts) */
  cancelRequest?: import('../services/cancelPolicy').CancelRequest;
  /** Set by the server: true while this order's items are back in stock (cancelled/returned) */
  stockReleased?: boolean;
  /** Seller who ships this order; one checkout creates one order per seller */
  sellerId?: string;
  sellerName?: string;
  checkoutId?: string;
  /** Tracking history (oldest first), written by the server */
  trackingEvents?: OrderTrackingEvent[];
  confirmedByCustomer?: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  shippingFee?: number;
  total: number;
  currency?: string;
  exchangeRateSnapshot?: number;
  couponCode?: string;
  shippingAddressSummary?: string;
  /** Structured delivery address (country, lines, city, state, postal code, phone +code, currency) */
  shippingAddress?: import('../services/intlAddress').ShippingAddress;
  shippingCalculationSnapshot?: ShippingCalculationSnapshot;
  trackingNumber?: string;
  courierName?: string;
  shipments?: OrderShipment[];
  quoteAmount?: number;
  quoteCourier?: string;
  quoteEstimatedDays?: string;
  quoteCustomsMode?: CustomsMode;
  quoteAdminNotes?: string;
  quoteExpiresAt?: string;
  district?: string;
  tehsil?: string;
  paymentReceiptEmailSent?: boolean;
  paymentReceiptEmailSentAt?: string;
  paymentReceiptEmailSubject?: string;
  paymentReceiptEmailRecipient?: string;
  paymentReceiptEmailHtml?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO';
  value: number;
  minCartAmount?: number;
  maxDiscount?: number;
  categoryFilter?: string;
  usageLimit?: number;
  usedCount?: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  userId: string;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase?: boolean;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  helpfulCount?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName?: string;
  action: string;
  resource: string;
  details?: string;
  createdAt: string;
}

export interface AITask {
  id: string;
  actorUid: string;
  name: string;
  toolName: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalItems: number;
  completedItems: number;
  failedItems?: number;
  summary?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StoreNotification {
  id: string;
  userId: string;
  type:
    | 'NEW_ORDER'
    | 'PAYMENT_RECEIVED'
    | 'LOW_STOCK'
    | 'PAYMENT_FAILURE'
    | 'NEW_REVIEW'
    | 'REFUND'
    | 'IMPORT_FAILED'
    | 'AI_TASK_COMPLETED'
    | 'AI_TASK_FAILED';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ShippingZoneConfig {
  id: string;
  name: string;
  countries: string[];
  courier: string;
  baseFee: number;
  includedWeightKg: number;
  perAdditionalKgFee: number;
  volumetricDivisor: number;
  freeShippingThreshold?: number;
  estimatedDelivery: string;
  customsMode: CustomsMode;
  allowManualQuoteIfNoRate?: boolean;
}

// Payment gateway merchant IDs and secret keys. Stored in settings_private/payment, which only
// the server can read or write (never sent to browsers).
export interface PaymentSecrets {
  easypaisaStoreId?: string;
  easypaisaHashKey?: string;
  jazzcashMerchantId?: string;
  jazzcashPassword?: string;
  jazzcashIntegritySalt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  tagline?: string;
  // Home page texts (editable in admin Settings)
  announcementText?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageUrl?: string;
  heroHighlights?: string;
  deliveryPromiseText?: string;
  aboutText?: string;
  logoUrl?: string;
  address?: string;
  contactEmail: string;
  supportEmail?: string;
  // Central Merchant & Currency Config
  merchantCountry: string; // 'PK'
  currency: string; // Base currency: 'PKR'
  secondaryDisplayCurrency: string; // 'USD'
  usdToPkrRate: number; // Configurable store exchange rate (e.g. 278.5)
  isRateStatic: boolean;
  taxRate: number; // Domestic sales tax (%)
  // Domestic Pakistan Logistics
  domesticBaseFee: number; // PKR 250
  domesticIncludedWeightKg: number; // 1.0 kg
  domesticAdditionalPerKg: number; // PKR 120
  domesticFreeShippingThreshold: number; // PKR 10,000
  domesticVolumetricDivisor: number; // 5000
  domesticSupportedCouriers: string[]; // ['TCS', 'Leopards Courier', 'M&P Courier', 'Pakistan Post']
  // International Zones
  internationalZones: ShippingZoneConfig[];
  allowInternationalManualQuotes: boolean;
  // Payment Provider Configuration (public flags only; merchant IDs and secret keys live in
  // settings_private/payment, see PaymentSecrets)
  easypaisaEnabled?: boolean;
  easypaisaAccountNum?: string;
  easypaisaEnvironment?: 'sandbox' | 'production';
  jazzcashEnabled?: boolean;
  jazzcashEnvironment?: 'sandbox' | 'production';
  cardEnabled?: boolean;
  installmentsEnabled?: boolean;
  bankAccountEnabled?: boolean;
  sadapayEnabled?: boolean;
  codEnabled: boolean; // Pakistan only
  codMinOrder?: number;
  codMaxOrder?: number;
  nayapayEnabled: boolean;
  nayapayAccountTitle?: string;
  nayapayNumber?: string;
  nayapayInstructions?: string;
  raastEnabled: boolean;
  raastAccountTitle?: string;
  raastIban?: string;
  bankName?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankTransferInstructions?: string;
  guestCheckoutEnabled?: boolean;
  /** Default commission the store keeps on each seller sale (percent of the item amount) */
  marketplaceCommissionPercent?: number;
  /** New sellers pay 0% commission for this many days after approval */
  newSellerFreeDays?: number;
  // Growth features (src/services/promotions.ts)
  welcomeOffer?: import('../services/promotions').WelcomeOffer;
  referral?: import('../services/promotions').ReferralSettings;
  socialProofEnabled?: boolean;
  campaigns?: import('../services/promotions').Campaign[];
  googleMapsApiKey?: string;
  aiTone?: 'Professional' | 'Premium' | 'Friendly' | 'Minimal' | 'Luxury' | 'Persuasive';
  // 24/7 Client Helpline & Concierge Configuration
  helplinePhone?: string;
  helplineWhatsApp?: string;
  helplineWhatsAppFormatted?: string;
  helplineEmail?: string;
  helplineHours?: string;
  // Store Policies & Custom Legal Content (Editable by Admin)
  whatsappNumber?: string;
  refundPolicy?: string;
  termsAndConditions?: string;
  privacyPolicy?: string;
  shippingPolicy?: string;
  contactUsContent?: string;
  updatedAt?: string;
}

export interface CustomerHelplineMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: string[];
  // true when a person from the store wrote this (not the AI)
  fromTeam?: boolean;
}

export interface CustomerInquiryTicket {
  id: string;
  ticketNumber: string;
  name: string;
  email: string;
  phone?: string;
  orderNumber?: string;
  category: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  channel: string;
  createdAt: string;
  aiAutoReply?: string;
  aiAutoRepliedAt?: string;
  aiAutoReplyStatus?: 'SENT' | 'PENDING' | 'DISABLED';
  merchantReply?: string;
  merchantRepliedAt?: string;
  // Full conversation (website chat / WhatsApp / form)
  messages?: SupportThreadMessage[];
  needsHuman?: boolean;
  humanActiveUntil?: string;
  lastMessageAt?: string;
}

export interface SupportThreadMessage {
  role: 'customer' | 'ai' | 'admin';
  text: string;
  at: string;
  // For admin replies: where the reply was delivered
  delivery?: string;
}

export interface AIMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolExecutions?: {
    name: string;
    args: Record<string, any>;
    status: 'EXECUTED' | 'PENDING_CONFIRMATION' | 'CANCELLED' | 'FAILED';
    resultSummary?: string;
  }[];
}
