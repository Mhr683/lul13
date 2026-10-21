import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  Terminal,
  Cpu,
  Tag,
  MessageSquare,
  Bell,
  ShieldAlert,
  Settings,
  ArrowLeft,
  Plus,
  Send,
  Upload,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Camera,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Key,
  ShieldCheck,
  Save,
  CreditCard,
  ExternalLink,
  Globe,
  Inbox,
  Sparkles,
  Clock,
  User,
  Mail,
  Phone,
  Bot,
  CheckCircle2,
  MessageCircle,
  Menu,
  Store,
  RotateCcw,
  Rocket,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { AdminTeamPanel } from './AdminTeamPanel';
import { PWAInstallButton } from './PWAInstallButton';
import { AdminCatalogPanel } from './AdminCatalogPanel';
import { AdminSellerInbox } from './AdminSellerInbox';
import { BrandLogo } from './BrandLogo';
import { AdminOrdersOverview } from './AdminOrdersOverview';
import { StoreTextsPanel } from './StoreTextsPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { AdminSellersPanel } from './AdminSellersPanel';
import { AdminReturnsPanel } from './AdminReturnsPanel';
import { AdminGrowthPanel } from './AdminGrowthPanel';
import { AdminPaymentKeysPanel } from './AdminPaymentKeysPanel';
import {
  Product,
  Order,
  OrderStatus,
  OrderShipment,
  SupplierName,
  AIMessageRecord,
  ProductStudioShot,
  CustomerInquiryTicket,
} from '../types/store';
import {
  COURIER_OPTIONS,
  SUPPLIER_OPTIONS,
  generateCourierTrackingUrl,
} from '../services/shippingService';
import { SAMPLE_CSV_TEMPLATE } from '../data/seedData';
import { formatDualPrice, formatPKR, USD_TO_PKR_RATE, EmailNotificationService, sanitizeDocId, sanitizeSku, sanitizeSlug } from '../services/abstractions';
import { canExecuteAITool } from '../ai/permissions';
import {
  validateCsvFileUpload,
  validateProductPayload,
  validateCouponPayload,
  parseCsvLineRFC4180,
  parseCsvRFC4180,
  detectCsvDelimiter,
  parseNumericPrice,
  parseNumericStock,
  detectPriceCurrency,
  validateAIToolArgs,
} from '../validation/validators';

type AdminTab =
  | 'DASHBOARD'
  | 'CATALOG'
  | 'ORDERS'
  | 'COUPONS'
  | 'REVIEWS'
  | 'AI_COMMAND_CENTER'
  | 'AI_TASKS'
  | 'AUDIT_LOGS'
  | 'NOTIFICATIONS'
  | 'SETTINGS'
  | 'SELLERS'
  | 'SELLER_INBOX'
  | 'RETURNS'
  | 'GROWTH';

const ADMIN_TABS: AdminTab[] = [
  'DASHBOARD', 'CATALOG', 'ORDERS', 'RETURNS', 'GROWTH', 'COUPONS', 'REVIEWS', 'AI_COMMAND_CENTER', 'AI_TASKS', 'AUDIT_LOGS', 'NOTIFICATIONS', 'SETTINGS', 'SELLERS', 'SELLER_INBOX',
];
// Tabs remembered from before the listing work moved to Seller Center fall back to the dashboard
const validTab = (tab: string | undefined): AdminTab => (ADMIN_TABS.includes(tab as AdminTab) ? (tab as AdminTab) : 'DASHBOARD');

interface PendingConfirmation {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, any>;
  onConfirm: () => Promise<string>;
}

export interface ParsedCsvRow {
  rowNumber: number;
  sku: string;
  name: string;
  price: number;
  originalCsvPrice?: number;
  csvCurrency?: 'PKR' | 'USD' | 'DIRECT';
  stock: number;
  category: string;
  brand: string;
  shortDescription: string;
  seoTitle?: string;
  seoDescription?: string;
  compareAtPrice?: number;
  costPrice?: number;
  primaryImage?: string;
  supplierName?: string;
  supplierCostPrice?: number;
  supplierProductUrl?: string;
  supplierSku?: string;
  weightKg?: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

const DEMO_AI_COMMANDS = [
  'Create a new product "Wireless Earbuds A9 Pro", price PKR 2,499, category Electronics. Generate the listing and SEO content.',
  'Find products with stock below 5.',
  'Increase the price of all products in the Kitchen & Lifestyle category by 10%.',
  'Find products without SEO descriptions and generate SEO metadata for them.',
  'Create a 10% discount coupon EID10 for orders above PKR 3,000.',
  'Show orders that have not shipped.',
  'Rewrite all descriptions in the Personal Care & Beauty category in simple, friendly English.',
  'Analyze today’s store sales and best-selling categories.',
];

export const AdminDashboardView: React.FC<{
  onReturnToStore: () => void;
  initialTab?: AdminTab;
}> = ({
  onReturnToStore,
  initialTab = 'DASHBOARD',
}) => {
  const {
    products,
    categories,
    orders,
    coupons,
    reviews,
    auditLogs,
    aiTasks,
    notifications,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signOut,
    saveProduct,
    importProductsBatch,
    removeProduct,
    saveCategory,
    adjustInventory,
    updateOrderState,
    confirmOrder,
    cancelFakeOrder,
    addOrUpdateOrderShipment,
    verifyManualPayment,
    updateShippingQuote,
    saveCoupon,
    deleteCouponById,
    moderateReview,
    updateStoreSettings,
    recordAuditLog,
    createOrUpdateAITask,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotifications,
    addOrderTrackingEvent,
    removeProductsBatch,
    selectedAdminProduct,
    setSelectedAdminProduct,
    selectedAdminOrder,
    setSelectedAdminOrder,
    cancelAITask,
    showToast,
  } = useStore();

  const [activeTab, setActiveTab] = useState<AdminTab>(validTab(initialTab));

  // Unread seller conversations (badge on "Seller Messages"); a count query, checked every 2 minutes
  const [sellerUnread, setSellerUnread] = useState(0);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await auth.authStateReady();
        if (!auth.currentUser) return;
        const res = await fetch('/api/admin/seller-threads/unread-count', {
          headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!stop && res.ok) setSellerUnread(Number(data.unread) || 0);
      } catch {}
    };
    check();
    const t = setInterval(check, 120_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  const [dateFilter, setDateFilter] = useState<'TODAY' | '7D' | '30D' | 'ALL'>('30D');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [selectedOrderForFulfillment, setSelectedOrderForFulfillment] = useState<Order | null>(null);
  const [editingShipment, setEditingShipment] = useState<Partial<OrderShipment> | null>(null);
  const [customTrackingUrlOverride, setCustomTrackingUrlOverride] = useState<boolean>(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(validTab(initialTab));
    }
  }, [initialTab]);

  // Floating AI Copilot Drawer Toggle (available on non-AI tabs)
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  // Settings visibility toggles for merchant secrets
  const [showGoogleMapsKey, setShowGoogleMapsKey] = useState(false);

  // AI Conversation State
  const [aiMessages, setAiMessages] = useState<AIMessageRecord[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Welcome to the AI Executive Command Center. Tell me what operation to perform in natural language—such as creating products, adjusting category pricing, generating missing SEO metadata, importing CSV catalogs, creating coupons, or auditing unshipped orders—and I will execute it directly against your store database.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

  // Product Editor & AI Studio Image Generator State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const selectedProductIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  // Products table: filtered once per change and shown one page at a time
  const ADMIN_PRODUCTS_PER_PAGE = 50;
  const [adminProductPage, setAdminProductPage] = useState(0);
  const adminFilteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products.filter(
      (p) =>
        (supplierFilter === 'ALL' || (p.supplierName || 'Own Stock') === supplierFilter) &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          p.status.toLowerCase().includes(term))
    );
  }, [products, supplierFilter, productSearch]);
  const adminProductPageCount = Math.max(1, Math.ceil(adminFilteredProducts.length / ADMIN_PRODUCTS_PER_PAGE));
  const adminVisibleProducts = useMemo(
    () =>
      adminFilteredProducts.slice(
        adminProductPage * ADMIN_PRODUCTS_PER_PAGE,
        (adminProductPage + 1) * ADMIN_PRODUCTS_PER_PAGE
      ),
    [adminFilteredProducts, adminProductPage]
  );
  useEffect(() => {
    setAdminProductPage(0);
  }, [supplierFilter, productSearch]);
  useEffect(() => {
    if (adminProductPage > adminProductPageCount - 1) setAdminProductPage(adminProductPageCount - 1);
  }, [adminProductPage, adminProductPageCount]);

  const [studioShots, setStudioShots] = useState<ProductStudioShot[]>([]);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatingShots, setGeneratingShots] = useState(false);

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState(SAMPLE_CSV_TEMPLATE);
  const [selectedDelimiter, setSelectedDelimiter] = useState<string>('auto');
  const [csvCurrency, setCsvCurrency] = useState<'PKR' | 'USD' | 'DIRECT'>('PKR');
  const [csvUploadedFileName, setCsvUploadedFileName] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Copy supplier images into the store's Firebase Storage so they survive the supplier deleting them
  const [archiveCsvImages, setArchiveCsvImages] = useState(true);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvPreviewPage, setCsvPreviewPage] = useState(1);
  const [parsedCsvRows, setParsedCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    updated: number;
    failed: number;
  } | null>(null);
  const [csvEnriching, setCsvEnriching] = useState(false);

  // Coupon Form State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [newCouponValue, setNewCouponValue] = useState(20);
  const [newCouponMinAmount, setNewCouponMinAmount] = useState(200);

  // International Freight Quoting & Transactional Receipt Modal State
  const [quotingOrder, setQuotingOrder] = useState<Order | null>(null);
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<Order | null>(null);
  const [quoteFreightAmount, setQuoteFreightAmount] = useState<number>(8500);
  const [quoteCourierChoice, setQuoteCourierChoice] = useState<string>('DHL Express International');
  const [quoteDeliveryTime, setQuoteDeliveryTime] = useState<string>('4–6 business days');
  const [quoteCustomsRule, setQuoteCustomsRule] = useState<'DAP' | 'DDP'>('DAP');
  const [quoteSpecialInstructions, setQuoteSpecialInstructions] = useState<string>('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<
    'ALL' | 'TO_CONFIRM' | 'TO_SHIP' | 'PENDING_VERIFICATION' | 'PAID' | 'COD'
  >('ALL');

  // Unified Communications Inbox & Customer Inquiries State
  const [inboxTickets, setInboxTickets] = useState<CustomerInquiryTicket[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxTab, setInboxTab] = useState<'MESSAGES' | 'ALERTS'>('MESSAGES');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [activeReplyTicketId, setActiveReplyTicketId] = useState<string | null>(null);
  const [merchantReplyText, setMerchantReplyText] = useState('');
  const [isSendingMerchantReply, setIsSendingMerchantReply] = useState(false);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simForm, setSimForm] = useState({
    name: 'Mohsin Ali',
    email: 'mohsin.ali@example.pk',
    phone: '+92 300 9876543',
    orderNumber: 'AA-ORD-9021',
    category: 'ORDER_TRACKING',
    subject: 'Order delivery status & Cash on Delivery inquiry',
    message: 'Hello, when will my order AA-ORD-9021 be delivered? Can I pay the delivery rider in cash?',
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedResult, setSimulatedResult] = useState<any | null>(null);

  const fetchInboxTickets = async () => {
    setInboxLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/helpline/tickets', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setInboxTickets(data.tickets);
      }
    } catch (err) {
      console.warn('Failed to fetch inbox tickets:', err);
    } finally {
      setInboxLoading(false);
    }
  };

  // Customer inbox: checked every minute while the admin app is in front (the server keeps the list
  // in memory, so this costs no database reads most of the time)
  useEffect(() => {
    fetchInboxTickets();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchInboxTickets();
    }, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && fetchInboxTickets();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleSimulateIncomingMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simForm.name.trim() || !simForm.email.trim() || !simForm.message.trim()) {
      showToast?.('Please fill name, email, and inquiry message.');
      return;
    }
    setIsSimulating(true);
    setSimulatedResult(null);
    try {
      const res = await fetch('/api/helpline/contact-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...simForm,
          channel: 'LIVE_CUSTOMER_TEST',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSimulatedResult(data);
        showToast?.(`AI Auto-Reply generated for Ticket #${data.ticketNumber}!`);
        await fetchInboxTickets();
      } else {
        showToast?.(data.error || 'Failed to submit test message');
      }
    } catch {
      showToast?.('Network error submitting test message');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSendMerchantReply = async (ticketId: string) => {
    if (!merchantReplyText.trim()) return;
    setIsSendingMerchantReply(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/helpline/tickets/${ticketId}/merchant-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          merchantReply: merchantReplyText.trim(),
          status: 'IN_PROGRESS',
        }),
      });
      const data = await res.json();
      if (data.success) {
        const where = Array.isArray(data.deliveredTo) && data.deliveredTo.length ? data.deliveredTo.join(', ') : 'inbox only';
        const problems = Array.isArray(data.deliveryErrors) && data.deliveryErrors.length ? ` (${data.deliveryErrors.join('; ')})` : '';
        showToast?.(`Reply sent: ${where}${problems}. AI will stay quiet in this chat for 30 minutes.`);
        setMerchantReplyText('');
        setActiveReplyTicketId(null);
        await fetchInboxTickets();
      } else {
        showToast?.(data.error || 'Failed to send reply');
      }
    } catch {
      showToast?.('Failed to send merchant reply');
    } finally {
      setIsSendingMerchantReply(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/helpline/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`Ticket status updated to ${newStatus}`);
        await fetchInboxTickets();
      }
    } catch {
      showToast?.('Failed to update ticket status');
    }
  };

  const unreadTicketsCount = useMemo(
    () => inboxTickets.filter((t) => t.status === 'OPEN').length,
    [inboxTickets]
  );
  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const pendingVerificationOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION'),
    [orders]
  );

  // WhatsApp helpers for confirming orders and sharing tracking with customers
  const buildWhatsAppLink = (phone: string | undefined, message: string) => {
    let digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  const buildConfirmMessage = (order: Order) => {
    const itemsText = (order.items || []).map((i) => `• ${i.name} x${i.quantity}`).join('\n');
    return (
      `Hello ${order.customerName}!\n\n` +
      `${settings.storeName || 'Our store'} has received your order #${order.orderNumber}:\n${itemsText}\n\n` +
      `Total: ${formatPKR(order.total)} (${order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod})\n` +
      `Address: ${order.shippingAddressSummary || ''}\n\n` +
      `Please reply "YES" to confirm your order. Thank you!`
    );
  };

  const buildTrackingMessage = (order: Order) => {
    const shipments = order.shipments || [];
    const lines = shipments.length
      ? shipments
          .map((s) => `• ${s.courierName}: ${s.trackingNumber}${s.trackingUrl ? `\n  ${s.trackingUrl}` : ''}`)
          .join('\n')
      : order.trackingNumber
      ? `• ${order.courierName || 'Courier'}: ${order.trackingNumber}`
      : '';
    return (
      `Hello ${order.customerName}!\n\n` +
      `Your order #${order.orderNumber} has been handed to the courier.\n${lines}\n\n` +
      `You can also track your order on our website (order number + phone number).\n` +
      `${order.paymentMethod === 'COD' ? `Please pay ${formatPKR(order.total)} on delivery.\n` : ''}` +
      `Thank you! ${settings.storeName || ''}`
    );
  };

  // Text the admin pastes into the supplier's portal when forwarding an order
  const buildSupplierCopyText = (order: Order, supplier?: string) => {
    const items = (order.items || []).filter(
      (i) => !supplier || (i.supplierName || 'Own Stock') === supplier
    );
    const itemsText = items
      .map(
        (i) =>
          `${i.name} | Qty: ${i.quantity}${i.supplierSku ? ` | Supplier SKU: ${i.supplierSku}` : ''}${
            i.supplierProductUrl ? ` | ${i.supplierProductUrl}` : ''
          }`
      )
      .join('\n');
    const itemsValue = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const isWholeOrder = items.length === (order.items || []).length;
    const codAmount = order.paymentMethod === 'COD' ? (isWholeOrder ? order.total : itemsValue) : 0;
    return (
      `Order: ${order.orderNumber}\n` +
      `Name: ${order.customerName}\n` +
      `Phone: ${order.customerPhone || ''}\n` +
      `Address: ${order.shippingAddressSummary || ''}\n` +
      `City: ${order.district || ''}\n` +
      `Items:\n${itemsText}\n` +
      `COD Amount: ${order.paymentMethod === 'COD' ? formatPKR(codAmount) : 'PAID (no cash to collect)'}`
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied.`);
    } catch {
      window.prompt('Copy this text:', text);
    }
  };

  // Helper: Profit calculation per order (selling price - supplierCostPrice - shipping cost)
  const getOrderProfitStats = (order: Order) => {
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      return { sellingPrice: 0, supplierCost: 0, shippingCost: 0, profit: 0, marginPercent: 0 };
    }
    const sellingPrice = Number(order.total) || 0;
    let supplierCost = 0;
    let missingCost = false;
    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item.supplierCostPrice === undefined || item.supplierCostPrice === null) missingCost = true;
        const itemCost = Number(item.supplierCostPrice ?? 0);
        supplierCost += itemCost * (item.quantity || 1);
      }
    }
    // Delivery charged to the customer is paid on to the supplier/courier
    const shippingCost = Number(order.shippingFee) || 0;
    const profit = sellingPrice - supplierCost - shippingCost;
    const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
    return {
      sellingPrice,
      supplierCost,
      shippingCost,
      profit,
      missingCost,
      marginPercent: Number(marginPercent.toFixed(1)),
    };
  };

  // Date-filtered orders based on range selector (TODAY, 7D, 30D, ALL)
  const dateFilteredOrders = useMemo(() => {
    if (dateFilter === 'ALL') return orders;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return orders.filter((o) => {
      const orderTime = new Date(o.createdAt).getTime();
      if (isNaN(orderTime)) return true;
      if (dateFilter === 'TODAY') {
        return new Date(o.createdAt).toDateString() === new Date().toDateString();
      }
      if (dateFilter === '7D') {
        return now - orderTime <= 7 * dayMs;
      }
      if (dateFilter === '30D') {
        return now - orderTime <= 30 * dayMs;
      }
      return true;
    });
  }, [orders, dateFilter]);

  // Financial & Profit Calculations for Date Range (Requirement 7)
  const dateFinancials = useMemo(() => {
    let grossRevenue = 0;
    let totalSupplierCost = 0;
    let totalShippingCost = 0;
    let totalProfit = 0;
    let eligibleCount = 0;

    for (const ord of dateFilteredOrders) {
      if (ord.status === 'CANCELLED' || ord.status === 'REFUNDED') continue;
      eligibleCount++;
      const pStats = getOrderProfitStats(ord);
      grossRevenue += pStats.sellingPrice;
      totalSupplierCost += pStats.supplierCost;
      totalShippingCost += pStats.shippingCost;
      totalProfit += pStats.profit;
    }

    const netMarginPercent = grossRevenue > 0 ? (totalProfit / grossRevenue) * 100 : 0;
    return {
      grossRevenue,
      totalSupplierCost,
      totalShippingCost,
      totalProfit,
      eligibleCount,
      netMarginPercent: Number(netMarginPercent.toFixed(1)),
    };
  }, [dateFilteredOrders]);

  // Analytics Calculations (Grounded in actual state)
  const totalRevenue = useMemo(
    () =>
      dateFilteredOrders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
        .reduce((sum, o) => sum + o.total, 0),
    [dateFilteredOrders]
  );

  const avgOrderValue = useMemo(
    () => (dateFinancials.eligibleCount > 0 ? dateFinancials.grossRevenue / dateFinancials.eligibleCount : 0),
    [dateFinancials]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= (p.lowStockThreshold || 5)),
    [products]
  );

  const missingSeoProducts = useMemo(
    () => products.filter((p) => !p.seoDescription || p.seoDescription.trim() === ''),
    [products]
  );

  const unshippedOrders = useMemo(
    () => orders.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status)),
    [orders]
  );

  const displayedOrders = useMemo(() => {
    if (orderPaymentFilter === 'TO_CONFIRM') {
      return orders.filter((o) => o.status === 'PENDING_CONFIRMATION');
    }
    if (orderPaymentFilter === 'TO_SHIP') {
      return orders.filter((o) => ['CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status));
    }
    if (orderPaymentFilter === 'PENDING_VERIFICATION') {
      return orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION');
    }
    if (orderPaymentFilter === 'PAID') {
      return orders.filter((o) => o.paymentStatus === 'PAID');
    }
    if (orderPaymentFilter === 'COD') {
      return orders.filter((o) => o.paymentMethod === 'COD');
    }
    return orders;
  }, [orders, orderPaymentFilter]);

  const categoryRevenueBreakdown = useMemo(() => {
    const map: Record<string, { count: number; stockValue: number }> = {};
    for (const p of products) {
      if (!map[p.category]) map[p.category] = { count: 0, stockValue: 0 };
      map[p.category].count += 1;
      map[p.category].stockValue += p.price * p.stock;
    }
    return Object.entries(map).map(([name, stats]) => ({ name, ...stats }));
  }, [products]);

  // Execute a single AI Tool Call against actual StoreContext mutators with RBAC Permission & Runtime Validation Checks
  const executeSingleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<{ status: 'EXECUTED' | 'PENDING_CONFIRMATION'; summary: string }> => {
    const permCheck = canExecuteAITool(userProfile?.role, name);
    if (!permCheck.allowed) {
      await recordAuditLog('AI_PERMISSION_DENIED', name, permCheck.reason || 'Permission denied');
      return {
        status: 'EXECUTED',
        summary: `Blocked: ${permCheck.reason}`,
      };
    }

    const argValidation = validateAIToolArgs(name, args);
    if (!argValidation.valid) {
      return {
        status: 'EXECUTED',
        summary: `Validation Error in ${name}(): ${argValidation.errors.join(' ')}`,
      };
    }

    switch (name) {
      case 'createProduct': {
        const created = await saveProduct(
          {
            name: args.name || 'New Product',
            sku: args.sku,
            price: Number(args.price || 450),
            compareAtPrice: args.compareAtPrice ? Number(args.compareAtPrice) : undefined,
            costPrice: args.costPrice ? Number(args.costPrice) : undefined,
            stock: Number(args.stock ?? 100),
            category: args.category || (categories[0]?.name || 'General'),
            brand: args.brand || settings.storeName || 'Store Brand',
            shortDescription: args.shortDescription,
            description: args.description,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            seoKeywords: args.seoKeywords,
            featured: Boolean(args.featured ?? false),
            ...(args.imageUrl && /^https?:\/\//i.test(String(args.imageUrl)) ? { primaryImage: String(args.imageUrl) } : {}),
            supplierName: args.supplierName ? String(args.supplierName) : 'Own Stock',
            ...(args.supplierCostPrice ? { supplierCostPrice: Number(args.supplierCostPrice) } : {}),
            ...(args.supplierProductUrl ? { supplierProductUrl: String(args.supplierProductUrl) } : {}),
            ...(args.supplierSku ? { supplierSku: String(args.supplierSku) } : {}),
          },
          'AI_TOOL:createProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Created product "${created.name}" (SKU: ${created.sku}, Price: ${formatDualPrice(created.price)}, Stock: ${created.stock}).`,
        };
      }

      case 'updateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `No matching product found for "${args.productIdOrName}".`,
          };
        }

        const updated = await saveProduct(
          {
            ...target,
            ...(args.price !== undefined ? { price: Number(args.price) } : {}),
            ...(args.stock !== undefined ? { stock: Number(args.stock) } : {}),
            ...(args.description ? { description: String(args.description) } : {}),
            ...(args.shortDescription ? { shortDescription: String(args.shortDescription) } : {}),
            ...(args.seoTitle ? { seoTitle: String(args.seoTitle) } : {}),
            ...(args.seoDescription ? { seoDescription: String(args.seoDescription) } : {}),
            ...(args.status ? { status: args.status } : {}),
            ...(args.imageUrl && /^https?:\/\//i.test(String(args.imageUrl)) ? { primaryImage: String(args.imageUrl) } : {}),
            ...(args.supplierName ? { supplierName: String(args.supplierName) } : {}),
            ...(args.supplierCostPrice !== undefined ? { supplierCostPrice: Number(args.supplierCostPrice) } : {}),
            ...(args.supplierProductUrl ? { supplierProductUrl: String(args.supplierProductUrl) } : {}),
            ...(args.supplierSku ? { supplierSku: String(args.supplierSku) } : {}),
          },
          'AI_TOOL:updateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Updated "${updated.name}" (${updated.sku}) — Price: ${formatDualPrice(updated.price)}, Stock: ${updated.stock}.`,
        };
      }

      case 'duplicateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found for duplication.`,
          };
        }

        const cloned = await saveProduct(
          {
            ...target,
            id: undefined,
            sku: args.newSku || `${target.sku}-COPY`,
            name: `${target.name} (Edition Copy)`,
          },
          'AI_TOOL:duplicateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Duplicated "${target.name}" as "${cloned.name}" (SKU: ${cloned.sku}).`,
        };
      }

      case 'searchProducts': {
        const q = String(args.query || '').toLowerCase();
        const maxStock = args.maxStock !== undefined ? Number(args.maxStock) : undefined;
        const found = products.filter((p) => {
          const matchesText =
            !q ||
            q === 'all' ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q);
          const matchesStock = maxStock === undefined || p.stock <= maxStock;
          return matchesText && matchesStock;
        });
        return {
          status: 'EXECUTED',
          summary: `Found ${found.length} matching product(s): ${
            found
              .slice(0, 6)
              .map((p) => `${p.name} [${p.sku}] (${formatDualPrice(p.price)}, ${p.stock} in stock)`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'createCategory': {
        const createdCat = await saveCategory({
          name: String(args.name || 'New Collection'),
          description: args.description,
          seoTitle: args.seoTitle,
          seoDescription: args.seoDescription,
        });
        return {
          status: 'EXECUTED',
          summary: `Created category "${createdCat.name}" (slug: /${createdCat.slug}).`,
        };
      }

      case 'bulkUpdateCategoryPrices': {
        const cat = String(args.category || 'ALL');
        const hasAmt = args.amountChange !== undefined && args.amountChange !== null && !isNaN(Number(args.amountChange));
        const rawAmt = hasAmt ? Number(args.amountChange) : null;
        const pct = args.percentageChange !== undefined && args.percentageChange !== null && !isNaN(Number(args.percentageChange)) ? Number(args.percentageChange) : null;
        const rawCurrency = String(args.currency || 'PKR').toUpperCase().trim();
        const isUsd = rawCurrency === 'USD' || rawCurrency === '$' || rawCurrency === 'DOLLAR' || rawCurrency === 'DOLLARS';

        // Catalog prices are stored in PKR; a USD amount is converted at the configured rate.
        const usdRate = settings.usdToPkrRate || USD_TO_PKR_RATE;
        const amtInPkr = rawAmt !== null
          ? (isUsd ? Math.round(rawAmt * usdRate) : rawAmt)
          : null;

        const matching = products.filter(
          (p) => cat.toUpperCase() === 'ALL' || p.category.toLowerCase().includes(cat.toLowerCase())
        );

        let changeDesc = '';
        if (amtInPkr !== null) {
          changeDesc = `${amtInPkr >= 0 ? '+' : '-'}PKR ${Math.abs(amtInPkr).toLocaleString()}`;
        } else {
          changeDesc = `${(pct ?? 0) >= 0 ? `+${pct ?? 0}%` : `${pct}%`}`;
        }

        const confirmId = `conf-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Adjust prices by ${changeDesc} across ${matching.length} products in "${cat}". Do you want me to continue?`,
            toolName: 'bulkUpdateCategoryPrices',
            args,
            onConfirm: async () => {
              const taskId = `task-bulk-price-${Date.now()}`;
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${changeDesc} on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'RUNNING',
                totalItems: matching.length,
                completedItems: 0,
              });
              let count = 0;
              for (const prod of matching) {
                let nextPrice: number;
                if (amtInPkr !== null) {
                  nextPrice = Math.max(1, Math.round(prod.price + amtInPkr));
                } else {
                  nextPrice = Math.max(1, Math.round(prod.price * (1 + (pct ?? 0) / 100)));
                }
                await saveProduct(
                  { ...prod, price: nextPrice },
                  `AI_BULK_PRICE_CHANGE (${changeDesc})`
                );
                count++;
              }
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${changeDesc} on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'COMPLETED',
                totalItems: matching.length,
                completedItems: count,
                summary: `Updated prices for ${count} products in ${cat} by ${changeDesc}.`,
              });
              return `Confirmed & updated prices for ${count} products in ${cat} by ${changeDesc}.`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Queued confirmation to change prices by ${changeDesc} for ${matching.length} products in ${cat}.`,
        };
      }

      case 'deleteProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target = products.find(
          (p) =>
            p.id.toLowerCase() === queryStr ||
            p.sku.toLowerCase() === queryStr ||
            p.name.toLowerCase().includes(queryStr)
        );
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Could not locate product "${args.productIdOrName}" for deletion.`,
          };
        }
        const confirmId = `conf-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete product "${target.name}" (${target.sku})? This action cannot be undone.`,
            toolName: 'deleteProduct',
            args,
            onConfirm: async () => {
              await removeProduct(target.id);
              return `Permanently deleted "${target.name}" (${target.sku}).`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting confirmation to permanently delete "${target.name}".`,
        };
      }

      case 'bulkDeleteProducts': {
        const scope = String(args.scope || 'ALL').trim().toUpperCase();
        let targets = products;
        if (scope !== 'ALL') {
          targets = products.filter(
            (p) =>
              p.category.toUpperCase() === scope ||
              p.status.toUpperCase() === scope ||
              p.brand.toUpperCase() === scope
          );
        }
        if (targets.length === 0) {
          return {
            status: 'EXECUTED',
            summary: `No products found matching scope "${args.scope}".`,
          };
        }
        const confirmId = `conf-bulk-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete all ${targets.length} product(s) in "${scope === 'ALL' ? 'Entire Store Catalog' : args.scope}"? This action cannot be undone.`,
            toolName: 'bulkDeleteProducts',
            args,
            onConfirm: async () => {
              for (const p of targets) {
                await removeProduct(p.id);
              }
              return `Permanently deleted all ${targets.length} product(s) from "${scope === 'ALL' ? 'Entire Store Catalog' : args.scope}".`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting administrator confirmation to delete ${targets.length} product(s).`,
        };
      }

      case 'updateInventory': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found.`,
          };
        }
        const nextStock = Math.max(0, Math.round(Number(args.newStock || 0)));
        const delta = Math.abs(nextStock - target.stock);
        if (delta >= 50 || (target.stock > 0 && nextStock === 0)) {
          const confirmId = `conf-inv-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `Large inventory change on "${target.name}" (${target.sku}): ${target.stock} → ${nextStock} units. Confirm execution?`,
              toolName: 'updateInventory',
              args,
              onConfirm: async () => {
                await adjustInventory(target.id, nextStock, 'Confirmed AI Inventory Change');
                return `Confirmed & updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required for large stock change on "${target.name}" (${target.stock} → ${nextStock} units).`,
          };
        }

        await adjustInventory(target.id, nextStock, 'AI Assistant Command');
        return {
          status: 'EXECUTED',
          summary: `Updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`,
        };
      }

      case 'getLowStockProducts': {
        const threshold = Number(args.threshold ?? 5);
        const low = products.filter((p) => p.stock <= threshold);
        return {
          status: 'EXECUTED',
          summary: `Products with stock <= ${threshold} (${low.length}): ${
            low.map((p) => `${p.name} [${p.sku}: ${p.stock} units]`).join(', ') || 'None'
          }.`,
        };
      }

      case 'generateMissingSEO': {
        const targets = products.filter(
          (p) => !p.seoDescription || p.seoDescription.trim() === ''
        );
        const listToProcess = targets.length > 0 ? targets : products.slice(0, 3);
        const taskId = `task-seo-${Date.now()}`;
        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'RUNNING',
          totalItems: listToProcess.length,
          completedItems: 0,
        });

        let done = 0;
        for (const p of listToProcess) {
          await saveProduct(
            {
              ...p,
              seoTitle: `${p.name} — Handcrafted ${p.category} | ${settings.storeName}`,
              seoDescription: `Acquire the ${p.name} by ${p.brand}. ${
                p.shortDescription || 'Crafted from noble materials with insured global courier delivery.'
              }`,
              seoKeywords: `${p.name.toLowerCase()}, ${p.category.toLowerCase()}, ${p.brand.toLowerCase()}, bespoke luxury`,
            },
            'AI_TOOL:generateMissingSEO'
          );
          done++;
        }

        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'COMPLETED',
          totalItems: listToProcess.length,
          completedItems: done,
          summary: `Generated SEO titles, meta descriptions, and keywords for ${done} products.`,
        });

        return {
          status: 'EXECUTED',
          summary: `Generated and saved SEO metadata for ${done} products (${listToProcess
            .map((p) => p.sku)
            .join(', ')}).`,
        };
      }

      case 'rewriteCategoryDescriptions': {
        const targetKey = String(args.categoryOrProduct || '').toLowerCase();
        const tone = String(args.tone || 'Luxury');
        const matches = products.filter(
          (p) =>
            p.category.toLowerCase().includes(targetKey) ||
            p.name.toLowerCase().includes(targetKey)
        );
        const list = matches.length > 0 ? matches : selectedAdminProduct ? [selectedAdminProduct] : [];
        let updatedCount = 0;
        for (const p of list) {
          await saveProduct(
            {
              ...p,
              description: `[${tone} Edition] Meticulously realized by ${p.brand} artisans, the ${p.name} exemplifies enduring architectural proportion and tactile permanence. ${p.shortDescription || ''}`,
            },
            `AI_TOOL:rewriteDescriptions(${tone})`
          );
          updatedCount++;
        }
        return {
          status: 'EXECUTED',
          summary: `Rewrote ${updatedCount} product description(s) in "${tone}" tone.`,
        };
      }

      case 'generateProductImages': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) ||
          selectedAdminProduct ||
          products[0];

        if (target) {
          await handleGenerateStudioShots(target.name, target.category);
          return {
            status: 'EXECUTED',
            summary: `Generated 5 studio photography variations (White Background, Studio Shot, Lifestyle, Macro, Editorial) for "${target.name}".`,
          };
        }
        return {
          status: 'EXECUTED',
          summary: 'Generated studio photography variations.',
        };
      }

      case 'createCoupon': {
        if (!args.code || args.value === undefined) {
          return {
            status: 'EXECUTED',
            summary: 'Give both the coupon code and the discount, e.g. "EID10, 10% off, above 3000".',
          };
        }
        const saved = await saveCoupon({
          code: String(args.code),
          type: (args.type as any) || 'PERCENTAGE',
          value: Number(args.value),
          minCartAmount: Number(args.minCartAmount || 0),
          categoryFilter: args.categoryFilter,
          usageLimit: Number(args.usageLimit || 100),
        });
        return {
          status: 'EXECUTED',
          summary: `Created active coupon "${saved.code}" (${saved.type}: ${saved.value}${
            saved.minCartAmount ? `, min order ${formatPKR(saved.minCartAmount)}` : ''
          }).`,
        };
      }

      case 'deleteCoupon': {
        const codeStr = String(args.code || '').toUpperCase();
        const targetCoupon = coupons.find((c) => c.code.toUpperCase() === codeStr);
        if (!targetCoupon) {
          return {
            status: 'EXECUTED',
            summary: `Coupon "${codeStr}" not found.`,
          };
        }
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: `conf-coupon-${Date.now()}`,
            description: `Delete coupon "${targetCoupon.code}"? Customers will no longer be able to use it.`,
            toolName: 'deleteCoupon',
            args,
            onConfirm: async () => {
              await deleteCouponById(targetCoupon.id);
              return `Deleted coupon "${targetCoupon.code}".`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Confirmation required to delete coupon "${targetCoupon.code}".`,
        };
      }

      case 'searchOrders': {
        const q = String(args.statusOrQuery || 'UNSHIPPED').toUpperCase();
        const matched =
          q === 'UNSHIPPED'
            ? unshippedOrders
            : orders.filter(
                (o) =>
                  o.status.toUpperCase().includes(q) ||
                  o.customerName.toUpperCase().includes(q) ||
                  o.orderNumber.toUpperCase().includes(q)
              );
        return {
          status: 'EXECUTED',
          summary: `Found ${matched.length} matching order(s): ${
            matched
              .map((o) => `${o.orderNumber} (${o.customerName}, ${formatDualPrice(o.total)}, ${o.status})`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'cancelOrder':
      case 'refundOrder':
      case 'updateOrderStatus': {
        const targetId = String(args.orderNumberOrId || '');
        const nextStatus: OrderStatus =
          name === 'cancelOrder'
            ? 'CANCELLED'
            : name === 'refundOrder'
            ? 'REFUNDED'
            : (String(args.status || 'SHIPPED') as OrderStatus);

        const targetOrder =
          orders.find(
            (o) =>
              o.orderNumber.toLowerCase() === targetId.toLowerCase() ||
              o.id.toLowerCase() === targetId.toLowerCase()
          ) || selectedAdminOrder;

        if (!targetOrder) {
          return {
            status: 'EXECUTED',
            summary: `Order "${targetId}" was not found in active records.`,
          };
        }

        if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
          const confirmId = `conf-ord-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `${
                nextStatus === 'REFUNDED' ? 'Record Refund for' : 'Cancel'
              } Order ${targetOrder.orderNumber} (${formatDualPrice(targetOrder.total)} for ${
                targetOrder.customerName
              })? Inventory will be restored automatically.`,
              toolName: name,
              args,
              onConfirm: async () => {
                await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
                return `Order ${targetOrder.orderNumber} marked as ${nextStatus} and stock restored.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required to mark Order ${targetOrder.orderNumber} as ${nextStatus}.`,
          };
        }

        await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
        return {
          status: 'EXECUTED',
          summary: `Order ${targetOrder.orderNumber} updated to ${nextStatus}.`,
        };
      }

      case 'searchCustomers': {
        const q = String(args.query || 'ALL').toLowerCase();
        const customerMap = new Map<string, { name: string; email: string; orders: number; spend: number }>();
        for (const o of orders) {
          const prev = customerMap.get(o.customerEmail) || {
            name: o.customerName,
            email: o.customerEmail,
            orders: 0,
            spend: 0,
          };
          prev.orders += 1;
          prev.spend += o.total;
          customerMap.set(o.customerEmail, prev);
        }
        const list = Array.from(customerMap.values()).filter(
          (c) => q === 'all' || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
        return {
          status: 'EXECUTED',
          summary: `Customer Directory (${list.length}): ${
            list
              .map((c) => `${c.name} <${c.email}> — ${c.orders} order(s), Total: ${formatDualPrice(c.spend)}`)
              .join('; ') || 'No matching customers'
          }.`,
        };
      }

      case 'sendCustomerEmail': {
        // Draft only: the admin reviews it and sends it from their own email app
        const toEmail = String(args.toEmail || '').trim();
        const subject = String(args.subject || `${settings.storeName || 'Store'} order update`);
        const message = String(args.message || '');
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: `conf-email-${Date.now()}`,
            description: `Email draft for ${toEmail || '(no address)'} — "${subject}":\n\n${message}\n\nConfirm to open it in your email app.`,
            toolName: 'sendCustomerEmail',
            args,
            onConfirm: async () => {
              window.open(
                `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
                '_blank'
              );
              await recordAuditLog('AI_EMAIL_DRAFT_OPENED', toEmail, subject);
              return `Opened the email draft to ${toEmail} in your email app. Press send there.`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Email draft ready for ${toEmail}. Review it below; nothing has been sent.`,
        };
      }

      case 'importCSV': {
        // Product imports now happen in each seller's Seller Center
        return {
          status: 'EXECUTED',
          summary: 'Product imports are done in Seller Center: open /seller → Products → CSV / Bulk listing.',
        };
      }

      case 'getOrdersToConfirm': {
        const pending = orders.filter((o) => o.status === 'PENDING_CONFIRMATION');
        return {
          status: 'EXECUTED',
          summary: pending.length
            ? `${pending.length} order(s) need a confirmation call/WhatsApp: ${pending
                .map(
                  (o) =>
                    `${o.orderNumber} — ${o.customerName}, ${o.customerPhone || 'no phone'}, ${formatPKR(o.total)} (${o.paymentMethod})`
                )
                .join('; ')}. Open Orders → "Call to Confirm" to confirm or mark fake.`
            : 'No orders are waiting for confirmation.',
        };
      }

      case 'getSupplierOrders': {
        const supplier = String(args.supplierName || 'ALL').trim();
        const isAll = supplier.toUpperCase() === 'ALL';
        const toForward = orders.filter((o) => ['CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status));
        const lines: string[] = [];
        for (const o of toForward) {
          const items = (o.items || []).filter(
            (i) => isAll || (i.supplierName || 'Own Stock').toLowerCase() === supplier.toLowerCase()
          );
          if (items.length === 0) continue;
          lines.push(
            `${o.orderNumber} [${o.status}] ${o.customerName}, ${o.customerPhone || ''}, ${o.shippingAddressSummary || ''} — ${items
              .map((i) => `${i.name} x${i.quantity} (${i.supplierName || 'Own Stock'}${i.supplierSku ? ` ${i.supplierSku}` : ''})`)
              .join(', ')}${o.paymentMethod === 'COD' ? ` — COD ${formatPKR(o.total)}` : ' — PAID'}`
          );
        }
        return {
          status: 'EXECUTED',
          summary: lines.length
            ? `${lines.length} order(s) to place with ${isAll ? 'suppliers' : supplier}:\n${lines.join('\n')}\nUse "📦 Supplier & Tracking" on each order to copy the details.`
            : `No confirmed orders waiting for ${isAll ? 'any supplier' : supplier}.`,
        };
      }

      case 'getProfitReport': {
        const period = String(args.period || '30D').toUpperCase();
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const inPeriod = orders.filter((o) => {
          if (['CANCELLED', 'REFUNDED'].includes(o.status)) return false;
          const t = new Date(o.createdAt).getTime();
          if (period === 'TODAY') return new Date(o.createdAt).toDateString() === new Date().toDateString();
          if (period === '7D') return now - t <= 7 * dayMs;
          if (period === '30D') return now - t <= 30 * dayMs;
          return true;
        });
        let sales = 0;
        let cost = 0;
        let delivery = 0;
        const byProduct = new Map<string, { name: string; profit: number; qty: number }>();
        for (const o of inPeriod) {
          const stats = getOrderProfitStats(o);
          sales += stats.sellingPrice;
          cost += stats.supplierCost;
          delivery += stats.shippingCost;
          for (const i of o.items || []) {
            const entry = byProduct.get(i.productId) || { name: i.name, profit: 0, qty: 0 };
            entry.qty += i.quantity;
            entry.profit += (i.price - Number(i.supplierCostPrice ?? 0)) * i.quantity;
            byProduct.set(i.productId, entry);
          }
        }
        const top = Array.from(byProduct.values())
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 5)
          .map((p) => `${p.name} (${p.qty} sold, ${formatPKR(p.profit)})`);
        const missingCost = products.filter((p) => p.status === 'ACTIVE' && !p.supplierCostPrice).length;
        return {
          status: 'EXECUTED',
          summary: `Profit report (${period}): ${inPeriod.length} orders, sales ${formatPKR(sales)}, supplier cost ${formatPKR(
            cost
          )}, delivery ${formatPKR(delivery)}, estimated profit ${formatPKR(sales - cost - delivery)}.${
            top.length ? ` Top products by profit: ${top.join('; ')}.` : ''
          }${missingCost ? ` Warning: ${missingCost} active product(s) have no supplier cost, so profit is overstated.` : ''}`,
        };
      }

      case 'suggestSellingPrice': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const product = queryStr
          ? products.find(
              (p) =>
                p.id.toLowerCase() === queryStr ||
                p.sku.toLowerCase() === queryStr ||
                p.name.toLowerCase().includes(queryStr)
            )
          : selectedAdminProduct || undefined;
        const supplierCost = Number(args.supplierCost ?? product?.supplierCostPrice ?? 0);
        if (!supplierCost || supplierCost <= 0) {
          return {
            status: 'EXECUTED',
            summary: 'Give the supplier cost (or set it on the product), then I will suggest a price.',
          };
        }
        const margin = Math.min(90, Math.max(1, Number(args.marginPercent ?? 30)));
        const raw = supplierCost / (1 - margin / 100);
        // Round up to a price ending in 9 (e.g. 1,249)
        const suggested = Math.ceil(raw / 10) * 10 - 1;
        return {
          status: 'EXECUTED',
          summary: `${product ? `${product.name}: ` : ''}supplier cost ${formatPKR(supplierCost)} + ${margin}% margin → suggested price ${formatPKR(
            suggested
          )} (profit about ${formatPKR(suggested - supplierCost)} per piece before delivery/returns).${
            product ? ` Current price is ${formatPKR(product.price)}.` : ''
          } Nothing was changed.`,
        };
      }

      case 'draftCustomerMessage': {
        const orderRef = String(args.orderNumber || '').toUpperCase();
        const order =
          orders.find((o) => o.orderNumber.toUpperCase() === orderRef || o.id.toUpperCase() === orderRef) ||
          selectedAdminOrder;
        if (!order) {
          return { status: 'EXECUTED', summary: `Order "${args.orderNumber}" not found.` };
        }
        const type = String(args.messageType || 'CONFIRM').toUpperCase();
        const text =
          type === 'TRACKING'
            ? buildTrackingMessage(order)
            : type === 'CUSTOM'
            ? `Assalam-o-Alaikum ${order.customerName}!\n\n${String(args.customText || '')}\n\nOrder #${order.orderNumber}\n${settings.storeName || ''}`
            : buildConfirmMessage(order);
        const link = buildWhatsAppLink(order.customerPhone, text);
        return {
          status: 'EXECUTED',
          summary: `WhatsApp draft for ${order.customerName} (${order.customerPhone || 'no phone'}):\n\n${text}\n\nOpen to send: ${link}`,
        };
      }

      case 'exportCSV': {
        if (String(args.resourceType || 'PRODUCTS').toUpperCase() === 'ORDERS') {
          handleExportOrdersCsv();
          return {
            status: 'EXECUTED',
            summary: `Exported ${orders.length} orders to CSV download.`,
          };
        }
        handleExportProductsCsv();
        return {
          status: 'EXECUTED',
          summary: `Exported ${products.length} products to CSV download.`,
        };
      }

      case 'analyzeStoreMetrics':
      default: {
        const lowList = lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ');
        const unshippedList = unshippedOrders
          .map((o) => `${o.orderNumber} (${formatDualPrice(o.total)})`)
          .join(', ');
        return {
          status: 'EXECUTED',
          summary: `Live Audit — Revenue: ${formatDualPrice(totalRevenue)} across ${
            orders.length
          } orders | Low Stock (${lowStockProducts.length}): ${
            lowList || 'None'
          } | Unshipped Orders (${unshippedOrders.length}): ${unshippedList || 'None'}.`,
        };
      }
    }
  };

  // Send Natural Language Instruction to Server-Side Gemini Operator
  const handleSendAICommand = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? aiInput).trim();
    if (!promptToSend || aiBusy) return;

    const userMsg: AIMessageRecord = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiBusy(true);

    try {
      const storeSnapshot = {
        storeName: settings.storeName,
        currency: settings.currency,
        actorUid: firebaseUser?.uid || 'local-admin',
        actorName: userProfile?.name || firebaseUser?.email || 'Executive Admin',
        userRole: userProfile?.role || 'SUPER_ADMIN',
        currentTab: activeTab,
        currentFilter: productSearch || dateFilter,
        stagedCsvRowCount: parsedCsvRows.length,
        productCount: products.length,
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
        })),
        missingSeoProducts: missingSeoProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
        })),
        orderCount: orders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        unshippedOrders: unshippedOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.customerName,
          total: o.total,
          status: o.status,
        })),
        coupons: coupons.map((c) => ({ code: c.code, type: c.type, value: c.value })),
        categories: categories.map((c) => c.name),
        selectedProduct: selectedAdminProduct
          ? {
              id: selectedAdminProduct.id,
              sku: selectedAdminProduct.sku,
              name: selectedAdminProduct.name,
              price: selectedAdminProduct.price,
              category: selectedAdminProduct.category,
            }
          : null,
        selectedOrder: selectedAdminOrder
          ? {
              id: selectedAdminOrder.id,
              orderNumber: selectedAdminOrder.orderNumber,
              customerName: selectedAdminOrder.customerName,
              status: selectedAdminOrder.status,
              paymentStatus: selectedAdminOrder.paymentStatus,
              total: selectedAdminOrder.total,
            }
          : null,
        aiTone: settings.aiTone || 'Professional',
      };

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: promptToSend, storeContext: storeSnapshot }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service returned an error.');
      }

      const executedTools: AIMessageRecord['toolExecutions'] = [];
      if (Array.isArray(data.blockedCalls)) {
        for (const bc of data.blockedCalls) {
          executedTools.push({
            name: bc.name,
            args: {},
            status: 'FAILED',
            resultSummary: `Blocked by Server Guard: ${bc.reason}`,
          });
        }
      }
      if (Array.isArray(data.functionCalls)) {
        for (const fc of data.functionCalls) {
          const outcome = await executeSingleToolCall(fc.name, fc.args || {});
          executedTools.push({
            name: fc.name,
            args: fc.args || {},
            status: outcome.status,
            resultSummary: outcome.summary,
          });
        }
      }

      const assistantReply: AIMessageRecord = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.text ||
          (executedTools.length > 0
            ? executedTools.map((t) => t.resultSummary).join('\n')
            : 'Operation analyzed.'),
        timestamp: new Date().toISOString(),
        toolExecutions: executedTools,
      };

      setAiMessages((prev) => [...prev, assistantReply]);
    } catch (error: any) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `AI execution error: ${error?.message || 'Please retry.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  // RFC-4180 Compliant Multi-line CSV & TSV Parser & Deep Validator
  const handleParseCsv = (
    raw: string,
    forcedDelimiter?: string,
    forcedCurrency?: 'PKR' | 'USD' | 'DIRECT'
  ): ParsedCsvRow[] => {
    if (!raw || !raw.trim()) {
      showToast('CSV is empty. Please upload or paste catalog data.');
      setParsedCsvRows([]);
      return [];
    }

    const activeDelimiter =
      forcedDelimiter || (selectedDelimiter === 'auto' ? undefined : selectedDelimiter);
    const { rows: allRows, malformedQuotes } = parseCsvRFC4180(raw, activeDelimiter);

    if (allRows.length < 2) {
      showToast('CSV must contain a header row and at least one product row.');
      setParsedCsvRows([]);
      return [];
    }

    const rawHeaders = allRows[0];
    const normalizedHeaders = rawHeaders.map((h) =>
      h.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    );

    // Priority-based column finder: checks candidate synonyms in strict order of precedence!
    const findColIndex = (candidates: string[]) => {
      // 1. Exact normalized match pass
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h === cleanCand);
        if (idx !== -1) return idx;
      }
      // 2. Substring match pass (in candidate priority order)
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h.includes(cleanCand));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const nameIdx = findColIndex([
      'name',
      'title',
      'productname',
      'producttitle',
      'itemname',
      'itemtitle',
      'product',
      'item',
      'heading',
      'label',
    ]);

    // Priority for Price: NEVER match 'cost' or 'amount' before real price headers!
    const regularPriceIdx = findColIndex([
      'regularprice',
      'price',
      'sellingprice',
      'unitprice',
      'retailprice',
      'saleprice',
      'productprice',
      'itemprice',
      'pricepkr',
      'priceusd',
      'pkr',
      'usd',
      'rate',
      'msrp',
    ]);

    const salePriceIdx = findColIndex([
      'saleprice',
      'specialprice',
      'discountprice',
      'offerprice',
    ]);

    const skuIdx = findColIndex([
      'sku',
      'productsku',
      'variantsku',
      'itemsku',
      'itemcode',
      'code',
      'id',
      'productid',
      'barcode',
      'upc',
    ]);

    const inStockIdx = findColIndex(['instock', 'instock?']);
    // "In stock?" (WooCommerce 1/0 flag) also contains the word "stock"; it must not be read as a quantity
    const rawStockIdx = findColIndex([
      'stock',
      'quantity',
      'qty',
      'inventory',
      'inventoryquantity',
      'units',
      'available',
      'stockcount',
      'count',
      'onhand',
    ]);
    const stockIdx = rawStockIdx === inStockIdx ? -1 : rawStockIdx;

    // Prioritize categories
    const categoryIdx = findColIndex([
      'categories',
      'category',
      'productcategories',
      'productcategory',
      'collection',
      'department',
      'group',
      'cat',
      'producttype',
    ]);

    const brandIdx = findColIndex([
      'brand',
      'vendor',
      'manufacturer',
      'designer',
      'maker',
      'company',
      'supplier',
    ]);

    const descIdx = findColIndex([
      'shortdescription',
      'description',
      'desc',
      'body',
      'bodyhtml',
      'details',
      'summary',
      'about',
    ]);

    const compareAtPriceIdx = findColIndex([
      'compareatprice',
      'originalprice',
      'listprice',
      'oldprice',
      'wasprice',
    ]);

    const costPriceIdx = findColIndex([
      'costprice',
      'unitcost',
      'cost',
      'buyprice',
      'purchaseprice',
    ]);

    const seoTitleIdx = findColIndex([
      'seotitle',
      'metatitle',
      'pagetitle',
    ]);

    const seoDescIdx = findColIndex([
      'seodescription',
      'metadescription',
      'metadesc',
    ]);

    const imageIdx = findColIndex([
      'images',
      'image',
      'imageurl',
      'primaryimage',
      'featuredimage',
      'photo',
      'picture',
      'img',
      'src',
    ]);

    // Dropshipping columns (admin-only, stored in product_private)
    const supplierNameIdx = findColIndex(['supplier', 'suppliername', 'dropshipper', 'source']);
    const supplierCostIdx = findColIndex([
      'suppliercost',
      'supplierprice',
      'suppliercostprice',
      'wholesaleprice',
      'dropshipprice',
    ]);
    const supplierUrlIdx = findColIndex([
      'supplierlink',
      'supplierurl',
      'supplierproducturl',
      'sourcelink',
      'sourceurl',
      'productlink',
    ]);
    const supplierSkuIdx = findColIndex(['suppliersku', 'suppliercode', 'sourcesku']);
    const weightIdx = findColIndex(['weightkg', 'weight']);

    // Auto-detect currency if not explicitly forced by button click
    let activeCurrency: 'PKR' | 'USD' | 'DIRECT' = forcedCurrency || csvCurrency;
    if (!forcedCurrency) {
      const detected = detectPriceCurrency(raw.slice(0, 5000), rawHeaders);
      if (detected === 'PKR') {
        activeCurrency = 'PKR';
        setCsvCurrency('PKR');
      } else if (detected === 'USD' && csvCurrency !== 'PKR') {
        activeCurrency = 'USD';
        setCsvCurrency('USD');
      }
    }

    const seenSkusInBatch = new Set<string>();

    const rows = allRows.slice(1).map((cells, index) => {
      const rawName = nameIdx !== -1 ? (cells[nameIdx] || '').trim() : '';
      const rawSku = skuIdx !== -1 ? (cells[skuIdx] || '').trim() : '';

      // Clean and sanitize SKU: replace spaces and weird characters with hyphens
      let cleanedSku = rawSku.replace(/[^a-zA-Z0-9_\-\.]/g, '-').replace(/^-+|-+$/g, '');
      const fallbackSku = `AA-${(rawName || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CSV'}-${String(index + 1).padStart(3, '0')}`;
      if (!cleanedSku) {
        cleanedSku = fallbackSku;
      }

      // Extract Price (WooCommerce sale price vs regular price support)
      const rawSale = salePriceIdx !== -1 ? parseNumericPrice(cells[salePriceIdx] || '') : NaN;
      const rawRegular = regularPriceIdx !== -1 ? parseNumericPrice(cells[regularPriceIdx] || '') : NaN;

      const hasValidSale = !isNaN(rawSale) && rawSale > 0;
      const hasValidRegular = !isNaN(rawRegular) && rawRegular > 0;

      let rawProductPrice = hasValidSale ? rawSale : hasValidRegular ? rawRegular : NaN;

      // Smart fallback: If price column wasn't detected or empty, look for any cell with numeric price
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        for (let col = 0; col < cells.length; col++) {
          if (col !== skuIdx && col !== stockIdx) {
            const candidatePrice = parseNumericPrice(cells[col] || '');
            if (!isNaN(candidatePrice) && candidatePrice > 0) {
              rawProductPrice = candidatePrice;
              break;
            }
          }
        }
      }

      let rawCompareAt =
        hasValidSale && hasValidRegular && rawRegular > rawSale
          ? rawRegular
          : compareAtPriceIdx !== -1
          ? parseNumericPrice(cells[compareAtPriceIdx] || '')
          : undefined;

      let finalPrice = isNaN(rawProductPrice) ? 0 : rawProductPrice;
      let finalCompareAt = rawCompareAt;

      // Currency conversion (catalog prices are stored in PKR):
      // 'PKR': CSV has Pakistani Rupees (e.g., Rs. 2,500) -> stored as PKR 2,500
      // 'USD': CSV has US Dollars (e.g., $25) -> converted to PKR at the store rate
      // 'DIRECT': Exact numbers without any conversion
      if (activeCurrency === 'USD' && finalPrice > 0) {
        const usdRate = settings.usdToPkrRate || USD_TO_PKR_RATE;
        finalPrice = Math.round(finalPrice * usdRate);
        if (finalCompareAt && !isNaN(finalCompareAt) && finalCompareAt > 0) {
          finalCompareAt = Math.round(finalCompareAt * usdRate);
        }
      }

      // Stock handling (numeric stock vs WooCommerce "In stock?" 1/0)
      let parsedStock = 15;
      let isStockDefaulted = false;
      if (stockIdx !== -1 && cells[stockIdx]?.trim()) {
        const res = parseNumericStock(cells[stockIdx], 15);
        parsedStock = res.stock;
        isStockDefaulted = res.isDefault;
      } else if (inStockIdx !== -1 && cells[inStockIdx]?.trim()) {
        const val = cells[inStockIdx].trim();
        if (val === '1' || val.toLowerCase() === 'yes' || val.toLowerCase() === 'instock') {
          // Only a yes/no flag: dropship items are available from the supplier, so use a working quantity
          parsedStock = 100;
        } else if (val === '0' || val.toLowerCase() === 'no' || val.toLowerCase() === 'outofstock') {
          parsedStock = 0;
        }
      } else {
        isStockDefaulted = true;
      }

      // Category extraction (filtering WooCommerce "Simple" product types)
      let rawCategory = categoryIdx !== -1 ? (cells[categoryIdx] || '').trim() : '';
      if (['simple', 'variable', 'grouped', 'external'].includes(rawCategory.toLowerCase())) {
        rawCategory = '';
      }
      if (!rawCategory) {
        const altIdx = normalizedHeaders.findIndex(
          (h, i) => i !== categoryIdx && (h.includes('cat') || h.includes('group') || h.includes('collection'))
        );
        if (altIdx !== -1) {
          rawCategory = (cells[altIdx] || '').trim();
        }
      }
      if (rawCategory) {
        rawCategory = rawCategory
          .replace(/&amp;/g, '&')
          .replace(/&gt;/g, '>')
          .replace(/<[^>]*>/g, '');
        const parts = rawCategory.split(/[,>]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          rawCategory = parts[parts.length - 1] || parts[0];
        }
      }
      const category = rawCategory || 'General';

      const brand = (brandIdx !== -1 && cells[brandIdx]?.trim()) || settings.storeName || 'Store Brand';

      // Clean HTML from short description
      let shortDescription = descIdx !== -1 ? (cells[descIdx] || '').trim() : '';
      if (shortDescription) {
        shortDescription = shortDescription
          .replace(/<[^>]*>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 490);
      }

      const seoTitle = (seoTitleIdx !== -1 && cells[seoTitleIdx]?.trim()) || '';
      const seoDescription = (seoDescIdx !== -1 && cells[seoDescIdx]?.trim()) || '';
      const costPrice = costPriceIdx !== -1 ? parseNumericPrice(cells[costPriceIdx] || '') : undefined;
      const cellText = (idx: number) => (idx !== -1 ? (cells[idx] || '').trim() : '');
      const rawSupplierName = cellText(supplierNameIdx);
      const supplierName =
        SUPPLIER_OPTIONS.find((s) => s.toLowerCase() === rawSupplierName.toLowerCase()) || rawSupplierName || undefined;
      const supplierCostRaw =
        supplierCostIdx !== -1 ? parseNumericPrice(cells[supplierCostIdx] || '') : costPrice;
      const supplierCostPrice =
        supplierCostRaw !== undefined && !isNaN(supplierCostRaw) && supplierCostRaw > 0
          ? activeCurrency === 'USD'
            ? Math.round(supplierCostRaw * (settings.usdToPkrRate || USD_TO_PKR_RATE))
            : supplierCostRaw
          : undefined;
      const supplierProductUrl = /^https?:\/\//i.test(cellText(supplierUrlIdx)) ? cellText(supplierUrlIdx) : undefined;
      const supplierSku = cellText(supplierSkuIdx) || undefined;
      const weightRaw = weightIdx !== -1 ? parseFloat((cells[weightIdx] || '').replace(/[^0-9.]/g, '')) : NaN;
      const weightKg = !isNaN(weightRaw) && weightRaw > 0 ? weightRaw : undefined;

      // Extract image URL (WooCommerce multiple comma-separated images)
      let primaryImage: string | undefined = undefined;
      if (imageIdx !== -1 && cells[imageIdx]?.trim()) {
        const rawImg = cells[imageIdx].trim();
        const firstUrl = rawImg.split(/[\s,]+/)[0]?.trim();
        if (firstUrl && (firstUrl.startsWith('http://') || firstUrl.startsWith('https://'))) {
          primaryImage = firstUrl;
        }
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (malformedQuotes && index === allRows.length - 2) {
        warnings.push('Encountered unclosed quote in file');
      }

      // Name handling with auto-fallback
      let finalName = rawName;
      if (!finalName) {
        // Fallback: use first cell that looks like text
        const textCell = cells.find((c) => c && c.trim().length > 2 && isNaN(Number(c)));
        finalName = textCell ? textCell.trim() : `Catalog Piece #${index + 1}`;
        warnings.push(`Name auto-assigned: ${finalName}`);
      }

      // Price handling
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        errors.push('Missing valid price');
      }

      if (rawSku && rawSku !== cleanedSku) {
        warnings.push(`Sanitized SKU: ${cleanedSku}`);
      } else if (!rawSku) {
        warnings.push(`Auto-assigned SKU: ${cleanedSku}`);
      }

      if (isStockDefaulted) {
        warnings.push('Stock defaulted to 15');
      }

      // Disambiguate duplicate SKUs instead of blocking import
      let finalSku = cleanedSku;
      const lowerSku = finalSku.toLowerCase();
      if (seenSkusInBatch.has(lowerSku)) {
        finalSku = `${cleanedSku}-${index + 1}`;
        warnings.push(`Auto-disambiguated duplicate SKU: ${finalSku}`);
      }
      seenSkusInBatch.add(finalSku.toLowerCase());

      const duplicate = products.some((p) => p.sku.toLowerCase() === finalSku.toLowerCase());

      return {
        rowNumber: index + 2,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        originalCsvPrice: isNaN(rawProductPrice) ? 0 : rawProductPrice,
        csvCurrency: activeCurrency,
        stock: parsedStock,
        category,
        brand,
        shortDescription,
        ...(seoTitle ? { seoTitle } : {}),
        ...(seoDescription ? { seoDescription } : {}),
        ...(finalCompareAt && !isNaN(finalCompareAt) ? { compareAtPrice: finalCompareAt } : {}),
        ...(costPrice && !isNaN(costPrice) ? { costPrice } : {}),
        ...(primaryImage ? { primaryImage } : {}),
        ...(supplierName ? { supplierName } : {}),
        ...(supplierCostPrice ? { supplierCostPrice } : {}),
        ...(supplierProductUrl ? { supplierProductUrl } : {}),
        ...(supplierSku ? { supplierSku } : {}),
        ...(weightKg ? { weightKg } : {}),
        valid: errors.length === 0,
        errors,
        warnings,
        duplicate,
      };
    });

    setParsedCsvRows(rows);
    setCsvImportSummary(null);
    return rows;
  };

  // AI Enrich CSV Rows (Generates missing descriptions & SEO before import)
  const handleAIEnrichCsv = async (inputRows?: ParsedCsvRow[]): Promise<ParsedCsvRow[]> => {
    const baseRows =
      inputRows && inputRows.length > 0
        ? inputRows
        : parsedCsvRows.length > 0
        ? parsedCsvRows
        : handleParseCsv(csvRawText);
    if (baseRows.length === 0) return [];

    setCsvEnriching(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/enrich-csv-rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows: baseRows, tone: settings.aiTone || 'Professional' }),
      });
      const data = await res.json();
      if (Array.isArray(data.enriched)) {
        const nextRows: ParsedCsvRow[] = baseRows.map((row) => {
          const match = data.enriched.find((e: any) => e.sku === row.sku || e.name === row.name);
          if (!match) return row;
          return {
            ...row,
            shortDescription: match.shortDescription || row.shortDescription,
            seoTitle: match.seoTitle || row.seoTitle,
            seoDescription: match.seoDescription || row.seoDescription,
          };
        });
        setParsedCsvRows(nextRows);
        showToast('AI enriched CSV rows with luxury descriptions & SEO metadata.');
        return nextRows;
      }
      return baseRows;
    } catch {
      showToast('AI enrichment failed. Using existing row data.');
      return baseRows;
    } finally {
      setCsvEnriching(false);
    }
  };

  // Auto-Fix All CSV Validation Issues (sanitizes SKUs, auto-assigns names, repairs prices)
  const handleAutoFixAllRows = () => {
    if (parsedCsvRows.length === 0) return;
    const seen = new Set<string>();
    const fixed = parsedCsvRows.map((r, i) => {
      let sku = (r.sku || `AA-ITEM-${r.rowNumber}`).replace(/[^a-zA-Z0-9_\-\.]/g, '-');
      if (seen.has(sku.toLowerCase())) {
        sku = `${sku}-${i + 1}`;
      }
      seen.add(sku.toLowerCase());

      const name = r.name && r.name !== 'Untitled Product' ? r.name : `Catalog Piece #${i + 1}`;
      const price = !isNaN(r.price) && r.price > 0 ? r.price : 25;
      const stock = !isNaN(r.stock) && r.stock >= 0 ? r.stock : 15;

      return {
        ...r,
        sku,
        name,
        price,
        stock,
        category: r.category || 'General',
        brand: r.brand || settings.storeName || 'Store Brand',
        valid: true,
        errors: [],
        warnings: [...r.warnings, 'Auto-repaired for instant catalog import'],
      };
    });
    setParsedCsvRows(fixed);
    showToast(`Auto-repaired all ${fixed.length} rows. Ready to import!`);
  };

  // Execute CSV Import into Store Database
  const handleCommitCsvImport = async (inputRows?: ParsedCsvRow[]) => {
    let rowsToCommit = inputRows && inputRows.length > 0 ? inputRows : parsedCsvRows;
    if (rowsToCommit.length === 0) {
      showToast('No parsed rows to import. Please stage or upload CSV data.');
      return { imported: 0, updated: 0, failed: 0 };
    }

    setCsvImporting(true);
    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errorDetails: string[] = [];

    const taskId = `task-csv-${Date.now()}`;
    try {
      await createOrUpdateAITask({
        id: taskId,
        name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
        toolName: 'importCSV',
        status: 'RUNNING',
        totalItems: rowsToCommit.length,
        completedItems: 0,
      });
    } catch {
      // Background task telemetry should never block catalog import
    }

    try {
      // Step 1: Collect external images to download & archive locally so links never expire
      const externalImageUrls = Array.from(
        new Set(
          rowsToCommit
            .map((r) => r.primaryImage)
            .filter((img): img is string => Boolean(img && (img.startsWith('http://') || img.startsWith('https://'))))
        )
      );

      let localImageMap: Record<string, string> = {};
      if (archiveCsvImages && externalImageUrls.length > 0) {
        showToast(`Downloading & archiving ${externalImageUrls.length} images to local store storage...`);
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
          const batchRes = await fetch('/api/media/batch-download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ urls: externalImageUrls }),
          });
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            if (batchData.storageUnavailable) {
              showToast('Firebase Storage is not enabled (needs the Blaze plan). Images are using the supplier links for now.');
            } else {
              const results: Record<string, string> = batchData.results || {};
              // Keep only images that really moved to our storage
              localImageMap = Object.fromEntries(Object.entries(results).filter(([src, dst]) => dst && dst !== src));
              showToast(`${Object.keys(localImageMap).length} / ${externalImageUrls.length} images saved to store storage.`);
            }
          }
        } catch (err) {
          console.warn('Batch image archiver fallback:', err);
        }
      }

      const productsToBatch: Product[] = [];
      const now = new Date().toISOString();

      for (const row of rowsToCommit) {
        // Safe on-the-fly sanitization so small issues never reject valid products
        const cleanSku = (row.sku || `AA-ITEM-${row.rowNumber}`)
          .replace(/[^a-zA-Z0-9_\-]/g, '-')
          .slice(0, 60);
        const cleanName = (row.name && row.name !== 'Untitled Product' ? row.name : `Catalog Piece #${row.rowNumber}`).slice(0, 190);
        const cleanPrice = !isNaN(row.price) && row.price > 0 ? row.price : 10;
        const cleanStock = !isNaN(row.stock) && row.stock >= 0 ? Math.round(row.stock) : 15;
        const finalImage = (row.primaryImage && localImageMap[row.primaryImage]) ? localImageMap[row.primaryImage] : (row.primaryImage || '');

        try {
          const existing = products.find((p) => p.sku.toLowerCase() === cleanSku.toLowerCase());
          const prodId = existing?.id || sanitizeDocId(`prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

          const prepared: Product = {
            id: prodId,
            sku: sanitizeSku(cleanSku),
            name: cleanName,
            slug: sanitizeSlug(cleanName || prodId),
            price: cleanPrice,
            // Only show a crossed-out price when the CSV really has one (no invented discounts)
            compareAtPrice: row.compareAtPrice && row.compareAtPrice > cleanPrice ? Math.round(Number(row.compareAtPrice)) : 0,
            // Supplier data is split into product_private when saved
            ...(row.costPrice ? { costPrice: Math.max(0, Number(row.costPrice)) } : {}),
            supplierName: row.supplierName || existing?.supplierName || 'Own Stock',
            ...(row.supplierCostPrice
              ? { supplierCostPrice: row.supplierCostPrice }
              : existing?.supplierCostPrice
              ? { supplierCostPrice: existing.supplierCostPrice }
              : {}),
            ...(row.supplierProductUrl || existing?.supplierProductUrl
              ? { supplierProductUrl: row.supplierProductUrl || existing?.supplierProductUrl }
              : {}),
            ...(row.supplierSku || existing?.supplierSku ? { supplierSku: row.supplierSku || existing?.supplierSku } : {}),
            stock: cleanStock,
            reservedStock: 0,
            lowStockThreshold: 5,
            category: (row.category || 'General').slice(0, 75),
            subcategory: 'Catalog Collection',
            brand: (row.brand || settings.storeName || 'Store Brand').slice(0, 75),
            shortDescription: (row.shortDescription || `Item: ${cleanName}`).slice(0, 480),
            description: (row.shortDescription || `${cleanName} from our catalog collection.`).slice(0, 4800),
            status: 'ACTIVE',
            featured: false,
            bestSeller: false,
            newArrival: true,
            seoTitle: (row.seoTitle || `${cleanName} | ${settings.storeName || 'Store'}`).slice(0, 150),
            seoDescription: (row.seoDescription || `Discover ${cleanName} from our store.`).slice(0, 310),
            seoKeywords: `${(row.category || 'general').toLowerCase()}, ${(settings.storeName || 'store').toLowerCase()}`,
            primaryImage: finalImage.slice(0, 980),
            rating: existing?.rating ?? 0,
            reviewCount: existing?.reviewCount ?? 0,
            weightKg: row.weightKg || existing?.weightKg || 0.5,
            dimensions: existing?.dimensions || '20cm x 15cm x 10cm',
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };

          productsToBatch.push(prepared);
          if (existing) updated++;
          else imported++;
        } catch (err: any) {
          failed++;
          errorDetails.push(`SKU ${cleanSku}: ${err?.message || 'Save error'}`);
        }
      }

      if (productsToBatch.length > 0) {
        await importProductsBatch(productsToBatch);
      }

      try {
        await createOrUpdateAITask({
          id: taskId,
          name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
          toolName: 'importCSV',
          status: failed === rowsToCommit.length ? 'FAILED' : 'COMPLETED',
          totalItems: rowsToCommit.length,
          completedItems: imported + updated,
          failedItems: failed,
          summary: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}${errorDetails.length > 0 ? ` (${errorDetails.slice(0, 3).join(', ')})` : ''}`,
        });
      } catch {
        // Ignore telemetry errors
      }

      const summary = { imported, updated, failed };
      setCsvImportSummary(summary);
      showToast(`CSV Import complete: ${imported} created, ${updated} updated, ${failed} failed.`);
      return summary;
    } catch (globalErr: any) {
      showToast(`CSV import error: ${globalErr?.message || 'Please retry.'}`);
      return { imported, updated, failed: rowsToCommit.length - (imported + updated) };
    } finally {
      setCsvImporting(false);
    }
  };

  // Export Orders to CSV file download
  const handleExportOrdersCsv = () => {
    const headers = ['orderNumber', 'customerName', 'customerEmail', 'status', 'paymentStatus', 'paymentMethod', 'total', 'trackingNumber', 'createdAt'];
    const csvLines = [
      headers.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${(o.customerName || '').replace(/"/g, '""')}"`,
          `"${(o.customerEmail || '').replace(/"/g, '""')}"`,
          o.status,
          o.paymentStatus,
          o.paymentMethod,
          o.total,
          `"${(o.trackingNumber || '').replace(/"/g, '""')}"`,
          o.createdAt,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `store-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Orders', `Exported ${orders.length} orders to CSV`);
    showToast(`Exported ${orders.length} orders to CSV.`);
  };

  // Export Products to CSV file download
  const handleExportProductsCsv = () => {
    // Same columns the CSV importer understands, so an export can be re-imported anywhere
    const headers = [
      'sku', 'name', 'price', 'compare_at_price', 'stock', 'category', 'brand', 'shortDescription',
      'image', 'supplier', 'supplier_cost', 'supplier_link', 'supplier_sku', 'weight', 'status', 'seoTitle',
    ];
    const cell = (value: unknown) => {
      const text = value === undefined || value === null ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csvLines = [
      headers.join(','),
      ...products.map((p) =>
        [
          p.sku,
          p.name,
          p.price,
          p.compareAtPrice || '',
          p.stock,
          p.category,
          p.brand,
          p.shortDescription,
          p.primaryImage,
          p.supplierName,
          p.supplierCostPrice ?? '',
          p.supplierProductUrl,
          p.supplierSku,
          p.weightKg ?? '',
          p.status,
          p.seoTitle,
        ]
          .map(cell)
          .join(',')
      ),
    ];
    // BOM so Excel opens Urdu / special characters correctly
    const blob = new Blob(['﻿' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `store-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Products', `Exported ${products.length} products to CSV`);
    showToast(`Exported ${products.length} products to CSV.`);
  };

  // Download Ready-to-use Sample CSV Template
  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample-catalog.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded sample CSV template.');
  };

  // Load sample template into staging area
  const handleLoadSampleTemplate = () => {
    setCsvRawText(SAMPLE_CSV_TEMPLATE);
    setCsvUploadedFileName('sample-product-catalog.csv');
    handleParseCsv(SAMPLE_CSV_TEMPLATE);
    showToast('Loaded sample luxury catalog template.');
  };

  // Generate AI Content inside Product Modal
  const handleGenerateModalContent = async () => {
    if (!editingProduct?.name) {
      showToast('Enter a product name first.');
      return;
    }
    setGeneratingContent(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/generate-product-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: editingProduct.name,
          category: editingProduct.category || 'Leather Goods',
          brand: editingProduct.brand || settings.storeName || 'Store Brand',
          price: editingProduct.price || 850,
          tone: settings.aiTone || 'Professional',
        }),
      });
      const data = await res.json();
      setEditingProduct((prev) => ({
        ...prev,
        shortDescription: data.shortDescription || prev?.shortDescription,
        description: data.description || prev?.description,
        seoTitle: data.seoTitle || prev?.seoTitle,
        seoDescription: data.seoDescription || prev?.seoDescription,
        seoKeywords: data.seoKeywords || prev?.seoKeywords,
      }));
      showToast('AI generated complete product copy & SEO metadata.');
    } catch {
      showToast('AI generation failed. Please retry.');
    } finally {
      setGeneratingContent(false);
    }
  };

  // Generate 5 Studio Shot Variations for a Product
  const handleGenerateStudioShots = async (productName: string, category: string) => {
    setGeneratingShots(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/generate-product-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productName, category }),
      });
      const data = await res.json();
      if (Array.isArray(data.shots)) {
        setStudioShots(data.shots);
        showToast(`Generated 5 studio shot variations for ${productName}.`);
      }
    } catch {
      showToast('Studio shot generation failed.');
    } finally {
      setGeneratingShots(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FBFBF9] text-[#141413]">
      {/* Phones/tablets: the sidebar slides in over the page; desktops (lg+) keep it fixed */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-black/[0.08] bg-white flex flex-col justify-between overflow-y-auto transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <BrandLogo name={settings.storeName} size="sm" className="max-w-[170px]" />
            <button
              onClick={onReturnToStore}
              className="text-xs text-[#575653] hover:text-[#141413] flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Store</span>
            </button>
          </div>

          <nav className="space-y-1 text-xs">
            {(
              [
                { id: 'AI_COMMAND_CENTER', label: 'AI Command Center', icon: Terminal },
                { id: 'DASHBOARD', label: 'Executive Analytics', icon: LayoutDashboard },
                { id: 'CATALOG', label: 'Products (all sellers)', icon: Package },
                { id: 'ORDERS', label: 'Orders (all sellers)', icon: ShoppingCart },
                { id: 'RETURNS', label: 'Returns & Complaints', icon: RotateCcw },
                { id: 'GROWTH', label: 'Marketing & Growth', icon: Rocket },
                { id: 'COUPONS', label: 'Promotions & Coupons', icon: Tag },
                { id: 'REVIEWS', label: 'Client Reviews', icon: MessageSquare },
                { id: 'AI_TASKS', label: 'AI Background Tasks', icon: Cpu },
                { id: 'AUDIT_LOGS', label: 'Security Audit Log', icon: ShieldAlert },
                { id: 'NOTIFICATIONS', label: 'Customer Inbox', icon: Inbox },
                { id: 'SELLER_INBOX', label: 'Seller Messages', icon: MessageSquare },
                { id: 'SELLERS', label: 'Sellers & Payouts', icon: Store },
                { id: 'SETTINGS', label: 'Store & AI Settings', icon: Settings },
              ] as { id: AdminTab; label: string; icon: any }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              const isInbox = item.id === 'NOTIFICATIONS';
              const totalUnread = unreadTicketsCount + unreadAlertsCount;
              const isSellerInbox = item.id === 'SELLER_INBOX';

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                    try {
                      localStorage.setItem('atelier_admin_tab', item.id);
                    } catch {}
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer rounded-sm ${
                    active
                      ? 'bg-[#C5A059] text-black font-extrabold shadow-sm'
                      : 'text-black font-bold hover:text-black hover:bg-black/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0 text-[#141413]" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isInbox && totalUnread > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        active ? 'bg-black text-[#FBFBF9]' : 'bg-[#C5A059] text-black'
                      }`}
                      title={`${unreadTicketsCount} open inquiries, ${unreadAlertsCount} unread alerts`}
                    >
                      {totalUnread}
                    </span>
                  )}
                  {isSellerInbox && sellerUnread > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        active ? 'bg-black text-[#FBFBF9]' : 'bg-rose-600 text-white'
                      }`}
                      title={`${sellerUnread} seller conversations need a reply`}
                    >
                      {sellerUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User / Role Status */}
        <div className="p-4 border-t border-black/[0.08] space-y-3 text-xs">
          <PWAInstallButton variant="block" />
          {firebaseUser && (
            <div className="space-y-2">
              <div>
                <div className="font-medium text-[#141413] truncate">{userProfile?.name}</div>
                <div className="text-[11px] text-[#575653] truncate">{firebaseUser.email}</div>
                <div className="text-[11px] font-mono text-[#86672A] mt-0.5">Role: {userProfile?.role}</div>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  onReturnToStore();
                }}
                className="w-full py-2 border border-black/20 text-[#141413] font-semibold text-xs cursor-pointer hover:bg-black/[0.04]"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left | Actions Right */}
        <header className="min-h-16 border-b border-black/[0.08] px-4 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 bg-white/90 backdrop-blur-xs sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs text-[#575653] min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 border border-black/15 text-[#141413] cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="hidden sm:inline">Admin Console</span>
            <span className="hidden sm:inline">/</span>
            <span className="text-[#141413] font-medium">{activeTab.replace(/_/g, ' ')}</span>
            {selectedAdminProduct && (
              <>
                <span className="hidden md:inline">/</span>
                <span className="hidden md:inline text-[#86672A] font-mono truncate max-w-[260px]">
                  Context: {selectedAdminProduct.sku} ({selectedAdminProduct.name})
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            {activeTab !== 'AI_COMMAND_CENTER' && (
              <button
                onClick={() => setCopilotDrawerOpen((o) => !o)}
                className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>AI Copilot</span>
              </button>
            )}
            <button
              onClick={handleExportProductsCsv}
              className="px-3 py-2 border border-black/[0.12] text-xs text-[#2A2A28] hover:border-black/40 flex items-center gap-1.5 cursor-pointer"
              aria-label="Export Catalog CSV"
              title="Export Catalog CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export Catalog CSV</span>
            </button>
            <button
              onClick={onReturnToStore}
              className="px-3 py-2 border border-black/[0.12] text-xs text-[#2A2A28] hover:border-black/40 cursor-pointer"
            >
              <span className="md:hidden">Store</span>
              <span className="hidden md:inline">View Live Storefront</span>
            </button>
          </div>
        </header>

        {/* Confirmation Banner Gate for High-Risk AI Actions */}
        {pendingConfirmations.length > 0 && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-8 py-4 space-y-3">
            {pendingConfirmations.map((conf) => (
              <div
                key={conf.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="whitespace-pre-wrap">
                    <strong>AI Safety Confirmation Required:</strong> {conf.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      const summary = await conf.onConfirm();
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
                      setAiMessages((prev) => [
                        ...prev,
                        {
                          id: `conf-done-${Date.now()}`,
                          role: 'assistant',
                          content: `Confirmed & Executed: ${summary}`,
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Approve & Execute
                  </button>
                  <button
                    onClick={() =>
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id))
                    }
                    className="px-3.5 py-1.5 border border-black/15 text-xs text-[#454441] cursor-pointer"
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workspace Content */}
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto space-y-8">
          {/* ======================== TAB 1: AI COMMAND CENTER ======================== */}
          {activeTab === 'AI_COMMAND_CENTER' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 8 Cols: Natural Language Chat & Execution Log */}
              <div className="lg:col-span-8 bg-white border border-black/[0.08] flex flex-col h-[680px]">
                <div className="p-4 border-b border-black/[0.08] flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-semibold text-[#141413]">
                      Autonomous Store Operator (Gemini Function Calling)
                    </h1>
                    <p className="text-xs text-[#575653]">
                      Executes real database mutations, SEO generation, pricing updates, and order workflows.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#86672A]">
                    Tone: {settings.aiTone || 'Professional'}
                  </span>
                </div>

                {/* Message History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 border ${
                        msg.role === 'user'
                          ? 'bg-[#F5F4F0] border-black/[0.12] ml-12'
                          : 'bg-[#FBFBF9] border-black/[0.08] mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#575653] mb-2 font-mono">
                        <span>{msg.role === 'user' ? 'ADMIN INSTRUCTION' : 'AI OPERATOR'}</span>
                        <span>{msg.timestamp.slice(11, 19)}</span>
                      </div>
                      <p className="text-xs text-[#2A2A28] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-black/[0.08] space-y-2">
                          <div className="text-[11px] font-mono uppercase text-[#86672A]">
                            Executed Store Tools ({msg.toolExecutions.length}):
                          </div>
                          {msg.toolExecutions.map((t, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-white border border-black/[0.08] text-xs font-mono space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-emerald-700 font-semibold">{t.name}()</span>
                                <span className="text-[11px] text-[#575653]">{t.status}</span>
                              </div>
                              <div className="text-[#454441] text-[11px]">{t.resultSummary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiBusy && (
                    <div className="p-4 bg-[#FBFBF9] border border-black/[0.08] text-xs text-[#575653] font-mono">
                      Analyzing store telemetry and executing authorized tools...
                    </div>
                  )}
                </div>

                {/* Prompt Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAICommand();
                  }}
                  className="p-4 border-t border-black/[0.08] flex gap-3 bg-[#FBFBF9]"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Tell the AI what to do (e.g., 'Create a new product for Nike Air Max 270 price $180' or 'Increase price of Leather Goods by 10%')..."
                    className="flex-1 px-4 py-3 bg-white border border-black/[0.12] text-xs text-[#141413] focus:outline-none focus:border-[#C5A059]"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy}
                    className="px-6 py-3 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 hover:bg-[#d4b26a] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Execute</span>
                  </button>
                </form>
              </div>

              {/* Right 4 Cols: Built-in Demo Commands & Store Context */}
              <div className="lg:col-span-4 space-y-6">
                <div className="p-5 bg-white border border-black/[0.08] space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#86672A]">
                    One-Click Demo AI Commands
                  </h2>
                  <p className="text-xs text-[#575653]">
                    Click any instruction below to watch the AI execute real database changes:
                  </p>
                  <div className="space-y-2">
                    {DEMO_AI_COMMANDS.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendAICommand(cmd)}
                        disabled={aiBusy}
                        className="w-full text-left p-3 bg-[#FBFBF9] border border-black/[0.08] hover:border-[#C5A059] text-xs text-[#2A2A28] transition-colors cursor-pointer"
                      >
                        “{cmd}”
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-white border border-black/[0.08] space-y-3 text-xs">
                  <h3 className="font-semibold uppercase tracking-wider text-[#141413]">
                    Live Store Memory Context
                  </h3>
                  <div className="space-y-1.5 text-[#575653] font-mono tabular-nums">
                    <div>Active Products: {products.length}</div>
                    <div>Low Stock Alerts: {lowStockProducts.length}</div>
                    <div>Missing SEO Metadata: {missingSeoProducts.length}</div>
                    <div>Unshipped Orders: {unshippedOrders.length}</div>
                    <div>Active Coupons: {coupons.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 2: EXECUTIVE DASHBOARD ======================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display font-medium text-[#141413]">
                    Store Telemetry & Financial Overview
                  </h1>
                  <p className="text-xs text-[#575653]">
                    Real-time metrics computed directly from active orders and inventory records.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 border border-black/[0.08]">
                  {(['TODAY', '7D', '30D', 'ALL'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateFilter(range)}
                      className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                        dateFilter === range
                          ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                          : 'text-[#575653] hover:text-[#141413]'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Key KPI Stat Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Gross Revenue (PKR)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {formatPKR(totalRevenue)}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono">
                    {orders.length} settled / active orders
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Average Order Value (AOV)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {formatPKR(avgOrderValue)}
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">
                    Tax Rate: {settings.taxRate}%
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Catalog SKUs & Inventory</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {products.length} SKUs
                  </div>
                  <div className="text-[11px] text-amber-700 font-mono">
                    {lowStockProducts.length} low-stock alerts (&le;5 units)
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Unshipped Fulfillment Queue</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {unshippedOrders.length} Orders
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">
                    {coupons.filter((c) => c.active).length} active promotions
                  </div>
                </div>
              </div>

              {/* Dropshipping profit for the selected date range (cancelled/refunded orders excluded) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Sales ({dateFilter})</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {formatPKR(dateFinancials.grossRevenue)}
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">{dateFinancials.eligibleCount} orders</div>
                </div>
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Supplier Cost ({dateFilter})</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {formatPKR(dateFinancials.totalSupplierCost)}
                  </div>
                </div>
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Delivery Charges ({dateFilter})</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {formatPKR(dateFinancials.totalShippingCost)}
                  </div>
                </div>
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Estimated Profit ({dateFilter})</div>
                  <div
                    className={`text-2xl font-mono tabular-nums font-semibold ${
                      dateFinancials.totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatPKR(dateFinancials.totalProfit)}
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">
                    Margin {dateFinancials.netMarginPercent}% · returns not included
                  </div>
                </div>
              </div>

              {/* Category Valuation Chart & Low Stock Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-6 p-6 bg-white border border-black/[0.08] space-y-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                    Inventory Valuation by Category
                  </h2>
                  <div className="space-y-4">
                    {categoryRevenueBreakdown.map((item) => {
                      const maxVal = Math.max(
                        ...categoryRevenueBreakdown.map((c) => c.stockValue),
                        1
                      );
                      const widthPct = Math.min(100, Math.round((item.stockValue / maxVal) * 100));
                      return (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#2A2A28] font-medium">
                              {item.name} ({item.count} SKUs)
                            </span>
                            <span className="font-mono tabular-nums text-[#86672A]">
                              {formatPKR(item.stockValue)}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-black/[0.04] overflow-hidden">
                            <div
                              className="h-full bg-[#C5A059]"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-6 p-6 bg-white border border-black/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                      Low Stock Priority Attention ({lowStockProducts.length})
                    </h2>
                    <button
                      onClick={() => setActiveTab('CATALOG')}
                      className="text-xs text-[#86672A] hover:underline cursor-pointer"
                    >
                      View products →
                    </button>
                  </div>
                  <div className="divide-y divide-black/[0.08]">
                    {lowStockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-[#141413]">{p.name}</div>
                          <div className="text-[11px] font-mono text-[#575653]">
                            {p.sku} · {p.category}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono tabular-nums text-amber-700 font-semibold">
                            {p.stock} left
                          </span>
                          <span className="text-[10px] text-[#575653]">{p.sellerName || 'Store'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products and orders of every seller: review and stop only (sellers work in Seller Center) */}
          {activeTab === 'CATALOG' && <AdminCatalogPanel />}
          {activeTab === 'ORDERS' && <AdminOrdersOverview />}

          {/* ======================== TAB 7: COUPONS & DISCOUNTS ======================== */}
          {activeTab === 'COUPONS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = validateCouponPayload({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  if (!v.valid) {
                    showToast(v.errors[0]);
                    return;
                  }
                  await saveCoupon({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  setNewCouponCode('');
                  showToast('Promotional coupon created.');
                }}
                className="lg:col-span-4 bg-white border border-black/[0.08] p-6 space-y-4 h-fit"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Create Promotional Code
                </h2>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#575653] mb-1">Coupon Code</label>
                    <input
                      type="text"
                      required
                      value={newCouponCode}
                      onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                      placeholder="SUMMER20"
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Discount Type</label>
                    <select
                      value={newCouponType}
                      onChange={(e) => setNewCouponType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                      <option value="FREE_SHIPPING">Complimentary Shipping</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Discount Value</label>
                    <input
                      type="number"
                      value={newCouponValue}
                      onChange={(e) => setNewCouponValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Minimum Cart Subtotal ($)</label>
                    <input
                      type="number"
                      value={newCouponMinAmount}
                      onChange={(e) => setNewCouponMinAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>

              <div className="lg:col-span-8 bg-white border border-black/[0.08] p-6 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Active Promotional Codes ({coupons.length})
                </h2>
                <div className="divide-y divide-black/[0.08]">
                  {coupons.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-semibold text-[#86672A] text-sm">
                          {c.code}
                        </span>
                        <span className="text-[#575653] ml-3">
                          {c.type === 'PERCENTAGE'
                            ? `${c.value}% OFF`
                            : c.type === 'FIXED'
                            ? `${formatDualPrice(c.value)} OFF`
                            : 'FREE SHIPPING'}{' '}
                          (Min Order: {formatDualPrice(c.minCartAmount || 0)})
                        </span>
                      </div>
                      <button
                        onClick={() => deleteCouponById(c.id)}
                        className="text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 8: REVIEWS MODERATION ======================== */}
          {activeTab === 'REVIEWS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Client Reviews & Moderation ({reviews.length})
              </h1>
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 bg-white border border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[#86672A]">
                        ★ {r.rating}.0 / 5.0 · {r.productName || r.productId} · Status: {r.status}
                      </div>
                      <div className="font-semibold text-[#141413]">{r.title}</div>
                      <p className="text-[#454441]">{r.comment}</p>
                      <div className="text-[#73726E]">— {r.authorName}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => moderateReview(r.id, 'APPROVED')}
                        className="px-3 py-1.5 bg-emerald-50 border border-emerald-400 text-emerald-800 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moderateReview(r.id, 'REJECTED')}
                        className="px-3 py-1.5 bg-rose-50 border border-rose-400 text-rose-800 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 9: AI BACKGROUND TASKS ======================== */}
          {activeTab === 'AI_TASKS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Long-Running AI Tasks & Batch Queue ({aiTasks.length})
              </h1>
              {aiTasks.length === 0 ? (
                <div className="p-8 bg-white border border-black/[0.08] text-xs text-[#575653]">
                  No background AI tasks have been triggered yet. Run a bulk SEO generation, bulk price change, or CSV import to monitor progress here.
                </div>
              ) : (
                <div className="space-y-3">
                  {aiTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-5 bg-white border border-black/[0.08] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#141413]">{task.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-[#575653]">
                            (ID: {task.id} · Actor: {task.actorUid})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[#86672A]">{task.status}</span>
                          {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                            <button
                              onClick={() => cancelAITask(task.id)}
                              className="px-2.5 py-1 bg-rose-50 border border-rose-400 text-rose-800 font-mono text-[11px] cursor-pointer"
                            >
                              Cancel Task
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[#575653] font-mono">
                        Tool: {task.toolName} · Progress: {task.completedItems} / {task.totalItems}{' '}
                        items · Failed: {task.failedItems} · Started: {task.createdAt.slice(0, 19).replace('T', ' ')}
                      </div>
                      {task.summary && <div className="text-[#454441]">{task.summary}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 10: AUDIT LOGS ======================== */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Immutable Security & AI Execution Audit Trail ({auditLogs.length})
              </h1>
              <div className="bg-white border border-black/[0.08] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.08] text-[#575653] font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Resource</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.08] font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 text-[#575653]">
                          {log.createdAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-4 text-[#141413]">{log.actorName || log.actorUid}</td>
                        <td className="py-2.5 px-4 text-[#86672A]">{log.action}</td>
                        <td className="py-2.5 px-4 text-[#454441]">{log.resource}</td>
                        <td className="py-2.5 px-4 text-[#575653]">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 11: INBOX & AI AUTO-REPLY ======================== */}
          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-6">
              {/* Inbox Header & AI Engine Status */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/10 pb-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-display text-[#141413]">Client Communications Inbox</h1>
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      AI Auto-Reply Active 24/7
                    </span>
                  </div>
                  <p className="text-xs text-[#575653] mt-1">
                    Live customer inquiries, instant AI Autonomous Auto-Replies, and store operational alerts.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSimulatedResult(null);
                      setShowSimulateModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#C5A059] text-black text-xs font-bold flex items-center gap-1.5 hover:bg-[#B38F48] transition-colors cursor-pointer shadow-sm rounded-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-black" />
                    <span>Test Customer Message &amp; AI Reply</span>
                  </button>
                  <button
                    onClick={fetchInboxTickets}
                    disabled={inboxLoading}
                    className="px-3 py-1.5 bg-white border border-black/20 text-[#141413] text-xs font-medium flex items-center gap-1.5 hover:bg-black/5 transition-colors cursor-pointer rounded-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${inboxLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Sub-Tabs: Customer Messages vs Store Alerts */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-black/10">
                <button
                  onClick={() => setInboxTab('MESSAGES')}
                  className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    inboxTab === 'MESSAGES'
                      ? 'border-[#C5A059] text-black font-extrabold'
                      : 'border-transparent text-[#575653] hover:text-black'
                  }`}
                >
                  <Inbox className="w-4 h-4 text-[#86672A]" />
                  <span>Customer Inquiries &amp; Messages</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 text-[#141413]">
                    {inboxTickets.length}
                  </span>
                  {unreadTicketsCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#C5A059] text-black">
                      {unreadTicketsCount} Open
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setInboxTab('ALERTS')}
                  className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    inboxTab === 'ALERTS'
                      ? 'border-[#C5A059] text-black font-extrabold'
                      : 'border-transparent text-[#575653] hover:text-black'
                  }`}
                >
                  <Bell className="w-4 h-4 text-[#575653]" />
                  <span>Operational &amp; Store Alerts</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 text-[#141413]">
                    {notifications.length}
                  </span>
                  {unreadAlertsCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                      {unreadAlertsCount} Unread
                    </span>
                  )}
                </button>
              </div>

              {/* VIEW 1: CUSTOMER INQUIRIES & AI AUTO-REPLIES */}
              {inboxTab === 'MESSAGES' && (
                <div className="space-y-5">
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Total Inquiries</div>
                      <div className="text-xl font-display font-bold text-[#141413] mt-1">{inboxTickets.length}</div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Instant AI Auto-Replied</div>
                      <div className="text-xl font-display font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#86672A]" />
                        <span>{inboxTickets.filter((t) => t.aiAutoReply).length}</span>
                        <span className="text-xs font-normal text-emerald-600 font-mono">(100%)</span>
                      </div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Open Tickets</div>
                      <div className="text-xl font-display font-bold text-amber-600 mt-1">{unreadTicketsCount}</div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Resolved Inquiries</div>
                      <div className="text-xl font-display font-bold text-[#141413] mt-1">
                        {inboxTickets.filter((t) => t.status === 'RESOLVED').length}
                      </div>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-black/10 rounded-sm">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                      {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setTicketStatusFilter(st)}
                          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            ticketStatusFilter === st
                              ? 'bg-black text-[#FBFBF9]'
                              : 'bg-black/5 text-[#575653] hover:text-black'
                          }`}
                        >
                          {st === 'ALL'
                            ? `All (${inboxTickets.length})`
                            : st === 'OPEN'
                            ? `Open (${unreadTicketsCount})`
                            : st === 'IN_PROGRESS'
                            ? `In Progress (${inboxTickets.filter((t) => t.status === 'IN_PROGRESS').length})`
                            : `Resolved (${inboxTickets.filter((t) => t.status === 'RESOLVED').length})`}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={ticketSearchQuery}
                        onChange={(e) => setTicketSearchQuery(e.target.value)}
                        placeholder="Search customer, email, ticket..."
                        className="w-full sm:w-64 bg-[#FBFBF9] border border-black/15 px-3 py-1.5 text-xs rounded focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  {/* Customer Tickets List */}
                  {inboxLoading && inboxTickets.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#575653] bg-white border border-black/10">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#86672A] mb-2" />
                      Loading communications inbox...
                    </div>
                  ) : inboxTickets.length === 0 ? (
                    <div className="p-10 text-center bg-white border border-black/10 space-y-3">
                      <Inbox className="w-8 h-8 text-[#86672A] mx-auto opacity-60" />
                      <div className="text-sm font-semibold text-[#141413]">No customer messages received yet</div>
                      <p className="text-xs text-[#575653] max-w-md mx-auto">
                        Customer inquiries submitted via the Storefront Helpline, Live AI Chat, or contact form will appear here with instant AI auto-replies.
                      </p>
                      <button
                        onClick={() => setShowSimulateModal(true)}
                        className="px-3.5 py-1.5 bg-[#C5A059] text-black text-xs font-bold hover:bg-[#B38F48] transition-colors rounded-sm cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Simulate First Customer Message</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {inboxTickets
                        .filter((t) => {
                          if (ticketStatusFilter !== 'ALL' && t.status !== ticketStatusFilter) return false;
                          if (ticketSearchQuery.trim()) {
                            const q = ticketSearchQuery.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              t.email.toLowerCase().includes(q) ||
                              t.ticketNumber.toLowerCase().includes(q) ||
                              (t.phone && t.phone.toLowerCase().includes(q)) ||
                              (t.orderNumber && t.orderNumber.toLowerCase().includes(q)) ||
                              t.message.toLowerCase().includes(q) ||
                              (t.aiAutoReply && t.aiAutoReply.toLowerCase().includes(q))
                            );
                          }
                          return true;
                        })
                        .map((ticket) => {
                          const isOpen = ticket.status === 'OPEN';
                          const isResolved = ticket.status === 'RESOLVED';
                          const isReplyActive = activeReplyTicketId === ticket.id;

                          return (
                            <div
                              key={ticket.id}
                              className={`bg-white border rounded-sm transition-all shadow-sm ${
                                isOpen ? 'border-amber-400/80 ring-1 ring-amber-400/20' : 'border-black/15'
                              }`}
                            >
                              {/* Card Header */}
                              <div className="p-4 border-b border-black/5 bg-[#FAFAF8] flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-xs bg-black text-[#FBFBF9] px-2 py-0.5 rounded">
                                    {ticket.ticketNumber}
                                  </span>
                                  <span className="font-mono text-[11px] bg-black/5 text-[#575653] px-2 py-0.5 rounded">
                                    {ticket.category}
                                  </span>
                                  <span className="text-[11px] bg-[#C5A059]/20 text-[#8F7029] font-medium px-2 py-0.5 rounded flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    {ticket.channel === 'AI_CHAT'
                                      ? 'Live AI Chat'
                                      : ticket.channel === 'WHATSAPP'
                                      ? 'WhatsApp'
                                      : 'Helpline Form'}
                                  </span>
                                  <span className="text-[11px] text-[#575653] flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3" />
                                    {new Date(ticket.createdAt).toLocaleString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <select
                                    value={ticket.status}
                                    onChange={(e) =>
                                      handleUpdateTicketStatus(
                                        ticket.id,
                                        e.target.value as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
                                      )
                                    }
                                    className={`px-2 py-1 text-[11px] font-bold rounded border cursor-pointer ${
                                      isOpen
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : isResolved
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-blue-100 text-blue-800 border-blue-300'
                                    }`}
                                  >
                                    <option value="OPEN">Status: OPEN</option>
                                    <option value="IN_PROGRESS">Status: IN PROGRESS</option>
                                    <option value="RESOLVED">Status: RESOLVED</option>
                                  </select>
                                </div>
                              </div>

                              {/* Customer Contact Info Bar */}
                              <div className="px-4 py-2.5 bg-white border-b border-black/5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#575653]">
                                <div className="flex items-center gap-1.5 text-[#141413] font-semibold">
                                  <User className="w-3.5 h-3.5 text-[#86672A]" />
                                  <span>{ticket.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3.5 h-3.5 text-[#575653]" />
                                  <a href={`mailto:${ticket.email}`} className="hover:underline text-black">
                                    {ticket.email}
                                  </a>
                                </div>
                                {ticket.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-[#575653]" />
                                    <a href={`tel:${ticket.phone}`} className="hover:underline text-black">
                                      {ticket.phone}
                                    </a>
                                    <a
                                      href={`https://wa.me/${ticket.phone.replace(/[^0-9]/g, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded hover:bg-emerald-100 border border-emerald-300 ml-1"
                                    >
                                      Chat WhatsApp
                                    </a>
                                  </div>
                                )}
                                {ticket.orderNumber && (
                                  <div className="flex items-center gap-1.5 font-mono text-[11px] bg-[#EFEFEA] px-2 py-0.5 rounded text-black font-bold">
                                    <Package className="w-3 h-3 text-[#86672A]" />
                                    <span>Order: {ticket.orderNumber}</span>
                                  </div>
                                )}
                              </div>

                              {/* Message Content & AI Auto-Reply */}
                              <div className="p-4 space-y-4">
                                {ticket.needsHuman && (
                                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                                    {ticket.needsHuman && (
                                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">
                                        Customer wants a person — please reply
                                      </span>
                                    )}
                                  </div>
                                )}

                                {Array.isArray(ticket.messages) && ticket.messages.length > 0 ? (
                                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                    {ticket.messages.map((m, idx) => (
                                      <div
                                        key={`${m.at}-${idx}`}
                                        className={`p-2.5 rounded-sm text-xs border ${
                                          m.role === 'customer'
                                            ? 'bg-[#FBFBF9] border-black/10 mr-10'
                                            : m.role === 'admin'
                                            ? 'bg-blue-50 border-blue-200 ml-10'
                                            : 'bg-[#FAF8F5] border-[#C5A059]/40 ml-10'
                                        }`}
                                      >
                                        <div className="flex justify-between gap-2 text-[10px] font-bold mb-1 text-[#575653]">
                                          <span>
                                            {m.role === 'customer' ? ticket.name || 'Customer' : m.role === 'admin' ? 'You (team)' : 'AI assistant'}
                                          </span>
                                          <span className="font-mono font-normal">
                                            {new Date(m.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            {m.delivery ? ` · ${m.delivery}` : ''}
                                          </span>
                                        </div>
                                        <div className="whitespace-pre-line text-[#141413]">{m.text}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                <>
                                {/* Customer Original Query */}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] uppercase tracking-wider font-bold text-[#575653]">
                                    Customer Message / Query:
                                  </div>
                                  <div className="p-3 bg-[#FBFBF9] border border-black/10 rounded-sm text-xs text-[#141413] leading-relaxed font-sans">
                                    {ticket.subject && (
                                      <div className="font-bold text-[#141413] mb-1">{ticket.subject}</div>
                                    )}
                                    <div className="whitespace-pre-line">{ticket.message}</div>
                                  </div>
                                </div>

                                {/* Instant AI Autonomous Auto-Reply */}
                                {ticket.aiAutoReply && (
                                  <div className="p-3.5 bg-[#FAF8F5] border border-[#C5A059]/40 rounded-sm space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-1.5 font-bold text-[#8F7029]">
                                        <Sparkles className="w-3.5 h-3.5 text-[#86672A]" />
                                        <span>Instant AI Autonomous Auto-Reply (Dispatched)</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-bold border border-emerald-300 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Sent in &lt; 2.0s
                                      </span>
                                    </div>
                                    <div className="text-xs text-[#2A2927] whitespace-pre-line leading-relaxed pl-1 border-l-2 border-[#C5A059]/60">
                                      {ticket.aiAutoReply}
                                    </div>
                                    {ticket.aiAutoRepliedAt && (
                                      <div className="text-[10px] text-[#575653] font-mono">
                                        Dispatched at:{' '}
                                        {new Date(ticket.aiAutoRepliedAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Merchant Reply (if any) */}
                                {ticket.merchantReply && (
                                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-sm space-y-1 text-xs">
                                    <div className="font-bold text-blue-900 flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5" />
                                      <span>Merchant Direct Follow-up Note:</span>
                                    </div>
                                    <p className="text-blue-950 whitespace-pre-line">{ticket.merchantReply}</p>
                                    {ticket.merchantRepliedAt && (
                                      <div className="text-[10px] text-blue-700 font-mono">
                                        Replied: {new Date(ticket.merchantRepliedAt).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                )}
                                </>
                                )}

                                {/* Action Buttons: Follow-up / Status change */}
                                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-black/5">
                                  <div className="flex items-center gap-2">
                                    {!isReplyActive ? (
                                      <button
                                        onClick={() => {
                                          setActiveReplyTicketId(ticket.id);
                                          setMerchantReplyText('');
                                        }}
                                        className="px-2.5 py-1 bg-black text-[#FBFBF9] text-xs font-medium rounded hover:bg-black/80 transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>Reply to customer</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setActiveReplyTicketId(null)}
                                        className="px-2.5 py-1 bg-black/5 text-[#141413] text-xs rounded hover:bg-black/10 transition-colors cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    )}

                                    {isOpen && (
                                      <button
                                        onClick={() => handleUpdateTicketStatus(ticket.id, 'RESOLVED')}
                                        className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold rounded hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Mark Resolved</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-[#575653]">
                                    Channel: <strong>{ticket.channel}</strong> &bull; Ticket ID:{' '}
                                    <span className="font-mono">{ticket.id}</span>
                                  </div>
                                </div>

                                {/* Inline Merchant Reply Box */}
                                {isReplyActive && (
                                  <div className="p-3 bg-[#FBFBF9] border border-black/15 rounded-sm space-y-2 mt-2">
                                    <label className="block text-xs font-bold text-[#141413]">
                                      Write Direct Merchant Follow-up to {ticket.name}:
                                    </label>
                                    <textarea
                                      rows={3}
                                      value={merchantReplyText}
                                      onChange={(e) => setMerchantReplyText(e.target.value)}
                                      placeholder={`Dear ${ticket.name}, thank you for contacting us...`}
                                      className="w-full bg-white border border-black/15 p-2 text-xs rounded focus:outline-none focus:border-black"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => setActiveReplyTicketId(null)}
                                        className="px-3 py-1 bg-black/5 text-xs rounded cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleSendMerchantReply(ticket.id)}
                                        disabled={isSendingMerchantReply || !merchantReplyText.trim()}
                                        className="px-3.5 py-1 bg-black text-[#FBFBF9] text-xs font-bold rounded cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>{isSendingMerchantReply ? 'Sending...' : 'Send & Mark Resolved'}</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: OPERATIONAL & STORE NOTIFICATIONS */}
              {inboxTab === 'ALERTS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#141413]">
                      Store Alerts &amp; Operational Events ({notifications.length})
                    </h2>
                    {notifications.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {unreadAlertsCount > 0 && (
                          <>
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {unreadAlertsCount} unread system notifications
                            </span>
                            <button
                              type="button"
                              onClick={() => markAllNotificationsRead()}
                              className="px-3 py-1.5 bg-[#141413] text-white text-xs font-semibold cursor-pointer hover:bg-black"
                            >
                              Mark all read
                            </button>
                          </>
                        )}
                        {notifications.length - unreadAlertsCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const count = notifications.length - unreadAlertsCount;
                              if (window.confirm(`Delete ${count} read alerts?`)) deleteNotifications();
                            }}
                            className="px-3 py-1.5 bg-rose-50 border border-rose-400 text-rose-800 text-xs font-semibold cursor-pointer hover:bg-rose-100"
                          >
                            Delete all read ({notifications.length - unreadAlertsCount})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#575653] bg-white border border-black/10">
                      No operational alerts at this time. All store systems operating normally.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-4 border flex items-center justify-between text-xs rounded-sm transition-colors ${
                            n.read
                              ? 'bg-black/[0.02] border-black/[0.08] text-[#575653]'
                              : 'bg-white border-[#C5A059]/60 text-[#141413] shadow-xs'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-[#86672A] font-bold">[{n.type}]</span>
                              <strong className="text-[#141413]">{n.title}</strong>
                            </div>
                            <p className="text-xs text-[#454441]">{n.message}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!n.read && (
                              <button
                                onClick={() => markNotificationRead(n.id)}
                                className="px-2.5 py-1 bg-[#F5F4F0] text-[11px] font-semibold text-black hover:bg-black/10 transition-colors cursor-pointer rounded"
                              >
                                Mark Read
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotifications([n.id])}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 cursor-pointer rounded"
                              aria-label="Delete alert"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SIMULATE INCOMING CUSTOMER MESSAGE MODAL */}
              {showSimulateModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white border border-black/20 w-full max-w-lg rounded-md shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-black/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#86672A]" />
                        <h2 className="text-base font-display font-bold text-[#141413]">
                          Test Live Customer Message &amp; AI Auto-Reply
                        </h2>
                      </div>
                      <button
                        onClick={() => setShowSimulateModal(false)}
                        className="p-1 text-[#575653] hover:text-[#141413] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-[#575653]">
                      Simulate a customer sending a message. As soon as received, Gemini AI will autonomously generate a luxury personalized reply in real time and deliver it to this Inbox!
                    </p>

                    {/* Quick Fill Templates */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[#141413]">Quick-fill realistic samples:</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Babar Azam',
                              email: 'babar.a@example.pk',
                              phone: '+92 321 9988776',
                              orderNumber: 'AA-ORD-9021',
                              category: 'ORDER_TRACKING',
                              subject: 'Delivery time in Lahore DHA & TCS tracking',
                              message:
                                'Hello, when will my order AA-ORD-9021 reach Lahore DHA Phase 5? When will I get the TCS tracking SMS?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          📦 Lahore Delivery
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Sara Khan',
                              email: 'sara.k@example.com',
                              phone: '+92 300 4433221',
                              orderNumber: '',
                              category: 'PAYMENT_COD',
                              subject: 'Cash on Delivery rules in Karachi',
                              message:
                                'Do you offer Cash on Delivery for luxury handbags in Karachi? What is the maximum order limit?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          💳 COD Rules (English)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Zeeshan Ali',
                              email: 'zeeshan@example.pk',
                              phone: '+92 333 7788990',
                              orderNumber: 'AA-ORD-9044',
                              category: 'BESPOKE_REQUEST',
                              subject: 'Watch dial custom engraving request',
                              message:
                                'Can you engrave the initials Z.A in gold foil on the back case of the Swiss Chronographe watch?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          ✨ Bespoke Engraving
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleSimulateIncomingMessage} className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Name</label>
                          <input
                            type="text"
                            required
                            value={simForm.name}
                            onChange={(e) => setSimForm({ ...simForm, name: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Email</label>
                          <input
                            type="email"
                            required
                            value={simForm.email}
                            onChange={(e) => setSimForm({ ...simForm, email: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Phone / WhatsApp</label>
                          <input
                            type="tel"
                            value={simForm.phone}
                            onChange={(e) => setSimForm({ ...simForm, phone: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Order # (Optional)</label>
                          <input
                            type="text"
                            value={simForm.orderNumber}
                            onChange={(e) => setSimForm({ ...simForm, orderNumber: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Message</label>
                        <textarea
                          rows={3}
                          required
                          value={simForm.message}
                          onChange={(e) => setSimForm({ ...simForm, message: e.target.value })}
                          className="w-full bg-[#FBFBF9] border border-black/15 p-2 rounded focus:outline-none focus:border-black"
                        />
                      </div>

                      {/* Display live result inside modal if completed */}
                      {simulatedResult && (
                        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded space-y-2">
                          <div className="flex items-center gap-2 text-emerald-900 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>AI Auto-Reply Successfully Generated!</span>
                          </div>
                          <div className="text-[11px] text-emerald-800 font-mono">
                            Ticket: {simulatedResult.ticketNumber}
                          </div>
                          <div className="p-2.5 bg-white border border-emerald-200 rounded text-xs text-[#141413] whitespace-pre-line">
                            {simulatedResult.aiAutoReply}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/10">
                        <button
                          type="button"
                          onClick={() => setShowSimulateModal(false)}
                          className="px-3 py-1.5 bg-black/5 text-[#141413] rounded cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          type="submit"
                          disabled={isSimulating}
                          className="px-4 py-1.5 bg-[#C5A059] text-black font-bold rounded flex items-center gap-1.5 hover:bg-[#B38F48] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isSimulating ? 'AI is Auto-Replying...' : 'Submit & Trigger AI Reply'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 12: STORE, MERCHANT, PAYMENT & LOGISTICS SETTINGS ======================== */}
          {activeTab === 'SELLERS' && <AdminSellersPanel />}
          {activeTab === 'RETURNS' && <AdminReturnsPanel />}
          {activeTab === 'GROWTH' && <AdminGrowthPanel />}
          {activeTab === 'SELLER_INBOX' && <AdminSellerInbox onUnreadChange={setSellerUnread} />}

          {activeTab === 'SETTINGS' && (
            <div className="max-w-4xl bg-white border border-black/15 p-6 sm:p-8 space-y-8">
              <div>
                <h1 className="text-2xl font-display font-bold text-[#141413]">
                  Merchant, Payment, Shipping &amp; Currency Configuration
                </h1>
                <p className="text-xs font-semibold text-[#141413] mt-1.5">
                  Centrally configure store operations operated from Pakistan (PK) with dual-currency display and worldwide shipping zones.
                </p>
              </div>

              {/* 0. Admins & owner login */}
              <AdminTeamPanel />

              {/* 0b. Customer-facing home page texts */}
              <StoreTextsPanel />

              {/* 0c. Move the store between AI Studio / Firebase projects */}
              <BackupRestorePanel />

              {/* 1. Merchant Identity & Dual-Currency */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    01. Central Merchant &amp; Dual-Currency Settings
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-[#141413] bg-[#EFEFEA] px-2.5 py-0.5 border border-black/20 rounded">
                    PKR Base Currency
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Legal Name</label>
                    <input
                      type="text"
                      value={settings.storeName || ''}
                      onChange={(e) => updateStoreSettings({ storeName: e.target.value })}
                      placeholder="e.g. My Store"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Tagline / Slogan</label>
                    <input
                      type="text"
                      value={settings.tagline || ''}
                      onChange={(e) => updateStoreSettings({ tagline: e.target.value })}
                      placeholder="e.g. Quality Products & Reliable Delivery"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Logo URL</label>
                    <input
                      type="text"
                      value={settings.logoUrl || ''}
                      onChange={(e) => updateStoreSettings({ logoUrl: e.target.value })}
                      placeholder="https://.../logo.png"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Base Currency</label>
                    <input
                      type="text"
                      value={settings.currency || 'PKR'}
                      onChange={(e) => updateStoreSettings({ currency: e.target.value.toUpperCase() })}
                      placeholder="PKR"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Secondary Display Currency</label>
                    <input
                      type="text"
                      value={settings.secondaryDisplayCurrency || 'USD'}
                      onChange={(e) => updateStoreSettings({ secondaryDisplayCurrency: e.target.value.toUpperCase() })}
                      placeholder="USD"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Merchant Operating Country</label>
                    <input
                      type="text"
                      value={settings.merchantCountry || 'PK'}
                      onChange={(e) => updateStoreSettings({ merchantCountry: e.target.value.toUpperCase() })}
                      placeholder="PK"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Support Email</label>
                    <input
                      type="email"
                      value={settings.supportEmail || ''}
                      onChange={(e) => updateStoreSettings({ supportEmail: e.target.value })}
                      placeholder="support@store.com"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Physical Address</label>
                    <input
                      type="text"
                      value={settings.address || ''}
                      onChange={(e) => updateStoreSettings({ address: e.target.value })}
                      placeholder="e.g. 123 Commerce St, Lahore, Pakistan"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">USD to PKR Store Valuation Rate</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.usdToPkrRate || 278.5}
                      onChange={(e) => updateStoreSettings({ usdToPkrRate: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Domestic Sales Tax (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.taxRate ?? 0}
                      onChange={(e) => updateStoreSettings({ taxRate: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Domestic Pakistan Logistics Configuration */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    02. Pakistan Domestic Shipping Calculator
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 border border-emerald-300 rounded">
                    TCS / Leopards Active
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Base Shipping Fee (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticBaseFee ?? 250}
                      onChange={(e) => updateStoreSettings({ domesticBaseFee: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Included Weight (kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.domesticIncludedWeightKg ?? 1.0}
                      onChange={(e) => updateStoreSettings({ domesticIncludedWeightKg: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Additional Per Kg (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticAdditionalPerKg ?? 120}
                      onChange={(e) => updateStoreSettings({ domesticAdditionalPerKg: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Free Shipping Threshold (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticFreeShippingThreshold ?? 10000}
                      onChange={(e) => updateStoreSettings({ domesticFreeShippingThreshold: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                </div>
                <div className="p-3.5 bg-[#F2F1EC] border-2 border-black/20 text-xs text-[#141413] font-semibold">
                  <strong className="text-black font-black">Couriers Configured:</strong> TCS, Leopards Courier, M&amp;P Courier, Pakistan Post. Manual tracking dispatch supported.
                </div>
              </div>

              {/* 3. Payment Gateways & API Credentials (JazzCash, Easypaisa, Google Maps, Bank & COD) */}
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between border-b-2 border-black pb-3 gap-2">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                      03. Payment Gateways &amp; API Credentials
                    </h2>
                    <p className="text-xs text-[#141413] font-semibold mt-1">
                      Configure your official JazzCash, Easypaisa, Google Maps, and banking credentials. You can update these anytime when ready.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold text-amber-950 bg-amber-100 border-2 border-amber-400 rounded">
                    <ShieldCheck className="w-4 h-4 text-amber-800" />
                    Treasury Security Center
                  </span>
                </div>

                {/* Online gateway credentials are never stored in the public settings document; the panel
                    below sends them to the server, which keeps them in settings_private/payment. */}
                <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 space-y-2 rounded-xs text-xs text-[#141413]">
                  <div className="font-bold">Online payments (JazzCash / Easypaisa / cards)</div>
                  <p className="font-semibold">
                    The store currently accepts Cash on Delivery and bank / NayaPay / Raast transfers (with TID).
                    To add an online gateway, first open a merchant account (Safepay, PayFast, JazzCash or Easypaisa).
                  </p>
                  <p>
                    Enter gateway keys only in the private box below. Other store settings can be read by every visitor,
                    so never paste keys into any other field.
                  </p>
                </div>
                <AdminPaymentKeysPanel />

                {/* 3C. Google Maps Platform API Key */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded bg-blue-600/15 text-blue-800 flex items-center justify-center font-black text-xs">
                        <Globe className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#141413]">Google Maps Platform API Key</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${settings.googleMapsApiKey ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}`}>
                            {settings.googleMapsApiKey ? 'Custom Key Active' : 'Default Prototype Key Active'}
                          </span>
                        </div>
                        <p className="text-xs text-[#141413] font-semibold mt-0.5">
                          Powers interactive map pinning, street address autocomplete, and GPS coordinates during customer checkout.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t-2 border-black/10 text-xs space-y-2">
                    <label className="block text-[#141413] font-bold text-xs">Google Maps API Key (Starts with AIza...)</label>
                    <div className="relative">
                      <input
                        type={showGoogleMapsKey ? 'text' : 'password'}
                        value={settings.googleMapsApiKey || ''}
                        onChange={(e) => updateStoreSettings({ googleMapsApiKey: e.target.value })}
                        placeholder="Paste your Google Maps API Key here..."
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleMapsKey(!showGoogleMapsKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413] hover:text-black cursor-pointer"
                      >
                        {showGoogleMapsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#141413] font-semibold">
                      Leave empty to continue using the built-in prototype key, or paste your own Google Cloud key to use your quota.
                    </p>
                  </div>
                </div>

                {/* 3D. Cash on Delivery Settings */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">Cash on Delivery (COD)</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Available for Pakistan domestic shipping with courier reconciliation.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.codEnabled)}
                        onChange={(e) => updateStoreSettings({ codEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.codEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.codEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                  {settings.codEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                      <div>
                        <label className="block text-[#141413] font-bold text-xs mb-1.5">Minimum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMinOrder ?? 500}
                          onChange={(e) => updateStoreSettings({ codMinOrder: Number(e.target.value) })}
                          className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[#141413] font-bold text-xs mb-1.5">Maximum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMaxOrder ?? 150000}
                          onChange={(e) => updateStoreSettings({ codMaxOrder: Number(e.target.value) })}
                          className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3E. NayaPay Configuration */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">NayaPay Merchant Wallet</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Manual TID verification. Displays at checkout only when enabled and details configured.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.nayapayEnabled)}
                        onChange={(e) => updateStoreSettings({ nayapayEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.nayapayEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.nayapayEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">NayaPay Account Title</label>
                      <input
                        type="text"
                        value={settings.nayapayAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ nayapayAccountTitle: e.target.value })}
                        placeholder="Registered business or merchant name"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">NayaPay Registered Mobile / ID</label>
                      <input
                        type="text"
                        value={settings.nayapayNumber || ''}
                        onChange={(e) => updateStoreSettings({ nayapayNumber: e.target.value })}
                        placeholder="e.g. 03XXXXXXXXX"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Merchant Payment Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.nayapayInstructions || ''}
                        onChange={(e) => updateStoreSettings({ nayapayInstructions: e.target.value })}
                        placeholder="Specific instructions for customer to transfer exact PKR and provide TID"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3F. RAAST & Bank Transfer Configuration */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">RAAST Instant &amp; Bank Transfer (Domestic &amp; International)</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Manual ledger reconciliation. Displays at checkout only when enabled and account details exist.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.raastEnabled)}
                        onChange={(e) => updateStoreSettings({ raastEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.raastEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.raastEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Beneficiary Account Title</label>
                      <input
                        type="text"
                        value={settings.raastAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ raastAccountTitle: e.target.value })}
                        placeholder="Official treasury or entity account title"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        value={settings.bankName || ''}
                        onChange={(e) => updateStoreSettings({ bankName: e.target.value })}
                        placeholder="Scheduled bank name"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">RAAST IBAN / Account Number</label>
                      <input
                        type="text"
                        value={settings.raastIban || ''}
                        onChange={(e) => updateStoreSettings({ raastIban: e.target.value })}
                        placeholder="e.g. PKXXBANKXXXXXXXXXXXXXXXX"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Wire &amp; RAAST Transfer Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.bankTransferInstructions || ''}
                        onChange={(e) => updateStoreSettings({ bankTransferInstructions: e.target.value })}
                        placeholder="Clear instructions for transfer and reference submission"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Credentials Notification Bar */}
                <div className="flex items-center justify-between p-4 sm:p-5 bg-[#141413] text-[#FBFBF9] border-2 border-black rounded-xs shadow-md">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#FBFBF9]">Store Treasury Settings Active</div>
                    <p className="text-xs text-[#EFEFEA] font-semibold mt-0.5">
                      All changes are automatically saved to your store configuration and live at checkout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateStoreSettings({});
                      showToast('✅ All payment gateway settings and API credentials saved.');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C5A059] text-[#141413] text-xs font-bold rounded-xs hover:bg-[#D4B36D] transition-colors cursor-pointer shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save All Settings
                  </button>
                </div>
              </div>

              {/* 4. International Zones & Manual Quote Rules */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#86672A]">
                    04. International Shipping Zones &amp; Freight Rates ({settings.internationalZones?.length || 0} Zones)
                  </h2>
                  <span className="text-[11px] font-mono text-emerald-700">
                    Customs Mode: DAP (Delivered at Place)
                  </span>
                </div>
                <div className="divide-y divide-black/[0.08] bg-[#FBFBF9] border border-black/[0.08] p-4 space-y-3">
                  {settings.internationalZones?.map((z) => (
                    <div key={z.id} className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <strong className="text-[#141413]">{z.name}</strong>
                        <div className="text-[11px] text-[#575653] font-mono">
                          Countries: {z.countries.join(', ')} · Courier: {z.courier}
                        </div>
                      </div>
                      <div className="font-mono text-right">
                        <div className="text-[#141413] font-semibold">PKR {z.baseFee.toLocaleString()} base</div>
                        <div className="text-[10px] text-[#575653]">+PKR {z.perAdditionalKgFee}/kg additional</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. 24/7 Client Helpline, WhatsApp & AI Concierge Configuration */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    05. 24/7 Client Helpline &amp; WhatsApp Concierge Configuration
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 border border-emerald-300 rounded">
                    Active Multi-Channel Helpline
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      WhatsApp Display Number
                    </label>
                    <input
                      type="text"
                      value={settings.helplineWhatsAppFormatted || ''}
                      onChange={(e) => updateStoreSettings({ helplineWhatsAppFormatted: e.target.value })}
                      placeholder="+92 300 0000000"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      WhatsApp Raw Number (with country code, no +)
                    </label>
                    <input
                      type="text"
                      value={settings.helplineWhatsApp || ''}
                      onChange={(e) => updateStoreSettings({ helplineWhatsApp: e.target.value })}
                      placeholder="923000000000"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Helpline Email Address
                    </label>
                    <input
                      type="email"
                      value={settings.helplineEmail || ''}
                      onChange={(e) => updateStoreSettings({ helplineEmail: e.target.value })}
                      placeholder="support@store.com"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Phone / Helpline Number
                    </label>
                    <input
                      type="text"
                      value={settings.helplinePhone || ''}
                      onChange={(e) => updateStoreSettings({ helplinePhone: e.target.value })}
                      placeholder="+92 (042) 0000-0000"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Helpline Operating Hours
                    </label>
                    <input
                      type="text"
                      value={settings.helplineHours || ''}
                      onChange={(e) => updateStoreSettings({ helplineHours: e.target.value })}
                      placeholder="24/7 Customer Support Desk"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Store Policies & Legal Content Management (Editable by Admin) */}
              <div className="bg-[#FAF9F5] border-2 border-black/15 p-6 rounded-lg space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.1] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#141413]">
                      Store Policies & Legal Pages Content
                    </h3>
                    <p className="text-xs text-[#575653] mt-0.5">
                      Configure and edit the customer-facing Refund Policy, Terms & Conditions, Privacy Policy, Shipping Policy, Contact Us details, and WhatsApp Click-to-Chat numbers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateStoreSettings({});
                      showToast('✅ Store policy pages and legal content saved successfully!');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#141413] text-[#FBFBF9] text-xs font-bold rounded hover:bg-[#2A2A28] cursor-pointer shadow-sm shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    Save All Policies
                  </button>
                </div>

                {/* WhatsApp & Contact Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Store WhatsApp Number (For Click-to-Chat & Order Confirmation)
                    </label>
                    <input
                      type="text"
                      value={settings.whatsappNumber || settings.helplineWhatsApp || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateStoreSettings({
                          whatsappNumber: val,
                          helplineWhatsApp: val.replace(/[^0-9]/g, ''),
                          helplineWhatsAppFormatted: val,
                        });
                      }}
                      placeholder="e.g. +92 300 1234567 or 923001234567"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                    <p className="text-[11px] text-[#787774] mt-1">
                      Used for customer WhatsApp click-to-chat and instant &quot;Confirm on WhatsApp&quot; buttons after order placement.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Contact Us Page Message / Introduction
                    </label>
                    <input
                      type="text"
                      value={settings.contactUsContent || ''}
                      onChange={(e) => updateStoreSettings({ contactUsContent: e.target.value })}
                      placeholder="Introductory text displayed at the top of the Contact Us page"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] focus:border-black focus:outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Refund & Return Policy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[#141413] font-bold text-xs uppercase tracking-wider">
                      Refund & Return Policy
                    </label>
                    <span className="text-[11px] text-[#787774]">Markdown headings (###) and bullet lists supported</span>
                  </div>
                  <textarea
                    rows={6}
                    value={settings.refundPolicy || ''}
                    onChange={(e) => updateStoreSettings({ refundPolicy: e.target.value })}
                    placeholder="Enter store return window, conditions, return pickup steps, and refund processing details..."
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono text-xs leading-relaxed focus:border-black focus:outline-none"
                  />
                </div>

                {/* Shipping & Delivery Policy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[#141413] font-bold text-xs uppercase tracking-wider">
                      Shipping & Delivery Policy
                    </label>
                    <span className="text-[11px] text-[#787774]">Courier partners: TCS, Leopards, PostEx, Trax, M&P</span>
                  </div>
                  <textarea
                    rows={6}
                    value={settings.shippingPolicy || ''}
                    onChange={(e) => updateStoreSettings({ shippingPolicy: e.target.value })}
                    placeholder="Detail delivery timeframes across Pakistan cities, courier partners, shipping fees, and free delivery thresholds..."
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono text-xs leading-relaxed focus:border-black focus:outline-none"
                  />
                </div>

                {/* Terms & Conditions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[#141413] font-bold text-xs uppercase tracking-wider">
                      Terms & Conditions
                    </label>
                    <span className="text-[11px] text-[#787774]">Customer contract & store purchase terms</span>
                  </div>
                  <textarea
                    rows={6}
                    value={settings.termsAndConditions || ''}
                    onChange={(e) => updateStoreSettings({ termsAndConditions: e.target.value })}
                    placeholder="Enter store terms, pricing conditions, order acceptance, and limitation of liability..."
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono text-xs leading-relaxed focus:border-black focus:outline-none"
                  />
                </div>

                {/* Privacy Policy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[#141413] font-bold text-xs uppercase tracking-wider">
                      Privacy Policy
                    </label>
                    <span className="text-[11px] text-[#787774]">Data protection & confidentiality disclosure</span>
                  </div>
                  <textarea
                    rows={6}
                    value={settings.privacyPolicy || ''}
                    onChange={(e) => updateStoreSettings({ privacyPolicy: e.target.value })}
                    placeholder="Describe how customer delivery addresses, phone numbers, and payment references are protected..."
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono text-xs leading-relaxed focus:border-black focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateStoreSettings({});
                      showToast('✅ Store policy pages and legal content saved successfully!');
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#C5A059] text-[#141413] text-xs font-bold rounded hover:bg-[#D4B36D] cursor-pointer shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save Policies & Legal Content
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Floating AI Copilot Drawer when on non-AI tabs */}
      {copilotDrawerOpen && activeTab !== 'AI_COMMAND_CENTER' && (
        <div className="w-96 border-l border-black/[0.08] bg-white flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-black/[0.08] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#86672A]">
              AI Store Copilot
            </span>
            <button
              onClick={() => setCopilotDrawerOpen(false)}
              className="text-[#575653] hover:text-[#141413] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {aiMessages.slice(-6).map((m) => (
              <div
                key={m.id}
                className={`p-3 border ${
                  m.role === 'user'
                    ? 'bg-[#F5F4F0] border-black/[0.12]'
                    : 'bg-[#FBFBF9] border-black/[0.08]'
                }`}
              >
                <div className="text-[#2A2A28] whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendAICommand();
            }}
            className="p-3 border-t border-black/[0.08] flex gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Command this page..."
              className="flex-1 px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-xs text-[#141413]"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
            >
              Run
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
