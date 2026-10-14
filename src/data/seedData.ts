import { Product, Category, Coupon, Review, StoreSettings } from '../types/store';

export const HERO_IMAGE_PATH = '';
export const IMG_HANDBAG = '';
export const IMG_WATCH = '';
export const IMG_FRAGRANCE = '';

export const INITIAL_SETTINGS: StoreSettings = {
  id: 'store_config',
  storeName: 'My Store',
  tagline: 'Quality Products & Reliable Delivery',
  logoUrl: '',
  contactEmail: '',
  supportEmail: '',
  address: '',
  // Central Merchant & Currency Settings
  merchantCountry: 'PK',
  currency: 'PKR',
  secondaryDisplayCurrency: 'USD',
  usdToPkrRate: 278.5,
  isRateStatic: true,
  taxRate: 0,
  // Domestic Logistics
  domesticBaseFee: 250,
  domesticIncludedWeightKg: 1.0,
  domesticAdditionalPerKg: 120,
  domesticFreeShippingThreshold: 5000,
  domesticVolumetricDivisor: 5000,
  domesticSupportedCouriers: ['TCS', 'Leopards Courier', 'M&P Courier', 'Pakistan Post'],
  internationalZones: [],
  allowInternationalManualQuotes: true,
  // Payment Providers
  easypaisaEnabled: false,
  easypaisaStoreId: '',
  easypaisaHashKey: '',
  easypaisaAccountNum: '',
  easypaisaEnvironment: 'sandbox',
  jazzcashEnabled: false,
  jazzcashMerchantId: '',
  jazzcashPassword: '',
  jazzcashIntegritySalt: '',
  jazzcashEnvironment: 'sandbox',
  googleMapsApiKey: '',
  cardEnabled: true,
  installmentsEnabled: false,
  bankAccountEnabled: true,
  sadapayEnabled: false,
  codEnabled: true,
  codMinOrder: 0,
  codMaxOrder: 500000,
  nayapayEnabled: true,
  nayapayAccountTitle: '',
  nayapayNumber: '',
  nayapayInstructions: 'Transfer order amount via NayaPay and submit your Transaction ID (TID) below.',
  raastEnabled: true,
  raastAccountTitle: '',
  raastIban: '',
  bankName: '',
  bankAccountTitle: '',
  bankAccountNumber: '',
  bankIban: '',
  bankTransferInstructions: 'Transfer via Bank or Raast to store account and submit your Transaction ID (TID) below.',
  guestCheckoutEnabled: true,
  aiTone: 'Professional',
  // Client Helpline
  helplinePhone: '+92 300 1234567',
  helplineWhatsApp: '923001234567',
  helplineWhatsAppFormatted: '+92 300 1234567',
  helplineEmail: 'support@store.com',
  helplineHours: 'Monday – Saturday: 9:00 AM – 9:00 PM PKT',
  // Store Policies & Legal Content (Editable by Admin)
  whatsappNumber: '923001234567',
  refundPolicy: `### Refund & Return Policy\n\nThank you for shopping with us. We want you to be completely satisfied with your purchase.\n\n#### 1. Return Window\nYou may request a return or exchange within **7 days** of receiving your package.\n\n#### 2. Eligibility Requirements\n- The product must be unused, unwashed, and in its original condition with all tags and original packaging intact.\n- Items damaged due to customer misuse, altered products, or perishable goods are non-returnable.\n- For defective or wrong items received, please notify us within 48 hours with parcel photos.\n\n#### 3. How to Initiate a Return\nContact our support helpline via WhatsApp at the number listed below or email our support desk with your **Order Number** and reason for return. Our courier rider will arrange a pickup or you will be guided to drop the parcel at the nearest courier center.\n\n#### 4. Refund Processing\n- **Cash on Delivery Orders:** Refunds are credited via Bank Transfer, Raast, or store credit voucher within 3–5 working days after inspection.\n- **Advance Online Payments:** Refunds are returned to the originating bank account or card within 5–7 business days.\n- Original shipping fees are non-refundable unless the return is due to a merchant error.`,
  termsAndConditions: `### Terms & Conditions\n\nWelcome to our online store. By accessing our website, placing an order, or utilizing our services, you agree to comply with and be bound by the following terms:\n\n#### 1. General Conditions\nAll products, prices, and specifications displayed on our storefront are subject to availability and may be updated without prior notice.\n\n#### 2. Order Placement & Acceptance\nPlacing an order constitutes an offer to purchase. An order is formally confirmed upon stock reservation and validation of customer contact details. For Cash on Delivery orders, we reserve the right to verify contact via WhatsApp or telephone before dispatch.\n\n#### 3. Pricing & Taxes\nAll prices are listed in PKR (Pakistani Rupees) unless otherwise specified. Applicable domestic sales taxes and courier shipping tariffs are calculated and shown at checkout.\n\n#### 4. Payment Protocols\nWe accept Cash on Delivery (COD), Direct Bank Transfer, Raast P2P payments, NayaPay, and other authorized gateway methods. For manual transfers, valid Transaction Reference IDs (TID) must be provided.\n\n#### 5. Limitation of Liability\nUnder no circumstances shall the store, its operators, or logistics partners be liable for indirect or consequential damages arising from the use of goods sold.`,
  privacyPolicy: `### Privacy Policy\n\nYour privacy is of utmost importance to us. This policy details how we collect, safeguard, and use your personal data.\n\n#### 1. Information We Collect\nWhen you place an order or interact with our storefront, we collect:\n- Full name and delivery address (including city, district, and postal code)\n- Mobile phone number (for courier dispatch and SMS/WhatsApp delivery updates)\n- Email address (for transactional invoices, receipts, and order notifications)\n- Transaction IDs for bank/Raast transfers (we never store card PINs or passwords)\n\n#### 2. How We Use Your Data\n- To process, verify, pack, and ship your orders via trusted domestic couriers (TCS, Leopards, PostEx, Trax, M&P)\n- To send real-time tracking alerts and electronic receipts\n- To respond to customer helpline inquiries and resolve support tickets\n\n#### 3. Data Confidentiality & Security\nWe do not sell, rent, or trade your personal information to third-party marketing brokers. Your data is encrypted in transit and stored securely on cloud database infrastructure.`,
  shippingPolicy: `### Shipping & Delivery Policy\n\nWe provide fast, reliable, and tracked delivery across all cities and regions of Pakistan.\n\n#### 1. Courier Partners\nAll domestic parcels are dispatched through verified nationwide courier partners including **TCS**, **Leopards Courier**, **PostEx**, **Trax Logistics**, and **M&P Express**.\n\n#### 2. Delivery Timeframes\n- **Major Metropolitan Hubs (Karachi, Lahore, Islamabad/Rawalpindi):** 2 to 3 business days.\n- **Other Cities & Towns:** 3 to 5 business days.\n- **Rural / Remote Districts:** 4 to 6 business days.\n\n#### 3. Shipping Charges & Free Delivery\n- Standard domestic delivery tariff is **PKR 250** per parcel.\n- Enjoy **FREE SHIPPING** on all orders exceeding **PKR 5,000**!\n\n#### 4. Order Tracking\nEvery dispatched package is assigned a unique courier tracking number. You can monitor the real-time status of your parcel on our **Track Order** page by simply entering your Order Reference and phone number.\n\n#### 5. Open Parcel & Delivery Inspection\nCourier riders adhere to official safety protocol. For Cash on Delivery orders, handover cash to the courier representative before opening the sealed flyer. In case of any discrepancy or issue, our 24/7 customer helpline is immediately available to assist you.`,
  contactUsContent: `We are here to assist you with order inquiries, product sizing, delivery tracking, and after-sales support. Reach out through any of our direct channels below:`,
  updatedAt: new Date().toISOString(),
};

export const INITIAL_CATEGORIES: Category[] = [];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_COUPONS: Coupon[] = [];

export const INITIAL_REVIEWS: Review[] = [];

export const SAMPLE_CSV_TEMPLATE = `sku,name,price,stock,category,brand,shortDescription
SKU-001,Premium Cotton Shirt,2500,50,Apparel,Store Brand,Breathable high quality cotton shirt.
SKU-002,Classic Leather Wallet,1800,30,Accessories,Store Brand,Handcrafted bifold leather wallet.
SKU-003,Stainless Steel Water Bottle,1200,45,Home & Living,Store Brand,Double-walled insulated water bottle.`;
