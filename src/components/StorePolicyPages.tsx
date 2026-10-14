import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  FileText,
  Truck,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  Package,
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Send,
} from 'lucide-react';
import { StoreSettings, Order } from '../types/store';

export type PolicyPageType =
  | 'REFUND_POLICY'
  | 'TERMS'
  | 'PRIVACY_POLICY'
  | 'SHIPPING_POLICY'
  | 'CONTACT_US'
  | 'ORDER_TRACKING';

interface StorePolicyPagesProps {
  page: PolicyPageType;
  settings: StoreSettings;
  onNavigate: (page: PolicyPageType | 'HOME' | 'CATALOG') => void;
  initialOrderNumber?: string;
  initialPhone?: string;
}

export const StorePolicyPages: React.FC<StorePolicyPagesProps> = ({
  page,
  settings,
  onNavigate,
  initialOrderNumber = '',
  initialPhone = '',
}) => {
  // WhatsApp number normalization
  const rawWa = settings.whatsappNumber || settings.helplineWhatsApp || '923001234567';
  const cleanWa = rawWa.replace(/[^0-9]/g, '');
  const displayWa =
    settings.helplineWhatsAppFormatted ||
    (rawWa.startsWith('+') ? rawWa : `+${rawWa}`);

  // Order Tracking states
  const [trackOrderNumber, setTrackOrderNumber] = useState(initialOrderNumber);
  const [trackPhone, setTrackPhone] = useState(initialPhone);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  // Contact Form states
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactOrderNum, setContactOrderNum] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactSending, setContactSending] = useState(false);

  // Auto-search if initial parameters provided
  useEffect(() => {
    if (page === 'ORDER_TRACKING' && initialOrderNumber.trim()) {
      executeTrackOrder(initialOrderNumber.trim(), initialPhone.trim());
    }
  }, [page, initialOrderNumber, initialPhone]);

  const executeTrackOrder = async (orderRef: string, phoneRef: string) => {
    if (!orderRef.trim()) {
      setTrackingError('Please enter your Order Reference (e.g. ORD-104928).');
      return;
    }
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const params = new URLSearchParams();
      params.set('order', orderRef.trim().toUpperCase());
      if (phoneRef.trim()) {
        params.set('phone', phoneRef.trim());
      }
      // Also pass any query token if present in URL
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) params.set('token', token);
      }

      const res = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to locate order. Please check your order reference and phone number.');
      }
      setTrackedOrder(data.order);
    } catch (err: any) {
      setTrackingError(err.message || 'Unable to find order matching these details.');
      setTrackedOrder(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactMessage.trim()) return;
    setContactSending(true);
    try {
      await fetch('/api/helpline/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail || 'customer@store.com',
          phone: contactPhone,
          orderNumber: contactOrderNum,
          category: 'GENERAL_INQUIRY',
          subject: contactOrderNum ? `Inquiry regarding Order #${contactOrderNum}` : 'Storefront Customer Inquiry',
          message: contactMessage,
          channel: 'WEB_FORM',
        }),
      });
      setContactSubmitted(true);
      setContactMessage('');
    } catch (err) {
      console.warn('Failed to submit contact ticket:', err);
      setContactSubmitted(true);
    } finally {
      setContactSending(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2500);
    }
  };

  // Render markdown-like paragraphs and headings
  const renderFormattedContent = (content?: string) => {
    if (!content) return null;
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) {
        return (
          <h2 key={idx} className="text-xl sm:text-2xl font-display font-semibold text-[#141413] mt-8 mb-4 border-b border-black/[0.08] pb-2">
            {trimmed.replace('### ', '')}
          </h2>
        );
      }
      if (trimmed.startsWith('#### ')) {
        return (
          <h3 key={idx} className="text-base font-semibold text-[#141413] mt-6 mb-2">
            {trimmed.replace('#### ', '')}
          </h3>
        );
      }
      if (trimmed.startsWith('- ')) {
        const itemText = trimmed.replace('- ', '');
        return (
          <li key={idx} className="ml-5 list-disc text-sm text-[#444340] leading-relaxed my-1">
            <span dangerouslySetInnerHTML={{ __html: itemText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          </li>
        );
      }
      if (!trimmed) {
        return <div key={idx} className="h-3" />;
      }
      return (
        <p key={idx} className="text-sm text-[#444340] leading-relaxed my-2">
          <span dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </p>
      );
    });
  };

  const getPageTitleAndIcon = () => {
    switch (page) {
      case 'REFUND_POLICY':
        return {
          title: 'Refund & Return Policy',
          subtitle: 'Clear, customer-first return and refund guidelines',
          icon: <RefreshCw className="w-6 h-6 text-[#141413]" />,
        };
      case 'TERMS':
        return {
          title: 'Terms & Conditions',
          subtitle: 'Official customer agreement, pricing, and service terms',
          icon: <FileText className="w-6 h-6 text-[#141413]" />,
        };
      case 'PRIVACY_POLICY':
        return {
          title: 'Privacy Policy',
          subtitle: 'How we safeguard your personal information and transaction data',
          icon: <ShieldCheck className="w-6 h-6 text-[#141413]" />,
        };
      case 'SHIPPING_POLICY':
        return {
          title: 'Shipping & Delivery Policy',
          subtitle: 'Nationwide logistics, courier partners, and transit timelines',
          icon: <Truck className="w-6 h-6 text-[#141413]" />,
        };
      case 'CONTACT_US':
        return {
          title: 'Contact Us & Customer Support',
          subtitle: 'Reach our team directly via WhatsApp, phone, or message form',
          icon: <Phone className="w-6 h-6 text-[#141413]" />,
        };
      case 'ORDER_TRACKING':
        return {
          title: 'Live Order Tracking',
          subtitle: 'Track your package, courier details, and real-time delivery status',
          icon: <Package className="w-6 h-6 text-[#141413]" />,
        };
    }
  };

  const pageMeta = getPageTitleAndIcon();

  return (
    <div className="min-h-screen bg-[#FBFBF9] text-[#141413]">
      {/* Top Breadcrumb Navigation Bar */}
      <div className="border-b border-black/[0.08] bg-white sticky top-0 z-30">
        <div className="max-w-[1240px] mx-auto px-6 py-3.5 flex items-center justify-between text-xs">
          <nav className="flex items-center gap-2 text-[#787774]">
            <button
              onClick={() => onNavigate('HOME')}
              className="hover:text-[#141413] font-medium cursor-pointer transition-colors"
            >
              Home
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <button
              onClick={() => onNavigate('CATALOG')}
              className="hover:text-[#141413] font-medium cursor-pointer transition-colors"
            >
              Shop
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-[#141413] font-semibold">{pageMeta.title}</span>
          </nav>

          <div className="flex items-center gap-3">
            {/* Quick WhatsApp Header Link */}
            <a
              href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I have a question regarding ${settings.storeName || 'your store'}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] rounded transition-colors shadow-xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp Support</span>
            </a>
            <button
              onClick={() => onNavigate('HOME')}
              className="px-3 py-1 border border-black/15 text-[11px] font-medium hover:border-black cursor-pointer transition-colors"
            >
              Back to Store
            </button>
          </div>
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-[#141413] text-[#FBFBF9] py-12 px-6">
        <div className="max-w-[1240px] mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/10 rounded-sm text-emerald-400">
              {pageMeta.icon}
            </div>
            <div className="text-xs uppercase tracking-widest text-[#C5A059] font-semibold">
              {settings.storeName || 'Official Storefront'}
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-medium tracking-tight">
            {pageMeta.title}
          </h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl leading-relaxed">
            {pageMeta.subtitle}
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-[1240px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Content Area */}
          <div className="lg:col-span-8 bg-white border border-black/[0.08] p-6 sm:p-10 rounded shadow-xs">
            {/* 1. REFUND POLICY */}
            {page === 'REFUND_POLICY' && (
              <div className="space-y-4">
                {renderFormattedContent(settings.refundPolicy)}
                <div className="mt-8 p-4 bg-emerald-50 border border-emerald-300 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Need to initiate a return or exchange?
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Chat directly with our support desk on WhatsApp with your Order ID.
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/${cleanWa}?text=${encodeURIComponent('Assalam-o-Alaikum! I would like to request a return/refund for my order.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shrink-0 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Request on WhatsApp
                  </a>
                </div>
              </div>
            )}

            {/* 2. TERMS & CONDITIONS */}
            {page === 'TERMS' && (
              <div className="space-y-4">
                {renderFormattedContent(settings.termsAndConditions)}
              </div>
            )}

            {/* 3. PRIVACY POLICY */}
            {page === 'PRIVACY_POLICY' && (
              <div className="space-y-4">
                {renderFormattedContent(settings.privacyPolicy)}
              </div>
            )}

            {/* 4. SHIPPING POLICY */}
            {page === 'SHIPPING_POLICY' && (
              <div className="space-y-4">
                {renderFormattedContent(settings.shippingPolicy)}
                <div className="mt-8 p-5 bg-[#FAF9F5] border border-black/10 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#141413]">
                      Have an existing order in transit?
                    </div>
                    <p className="text-xs text-[#575653]">
                      Check real-time courier consignment status and dispatch timeline.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('ORDER_TRACKING')}
                    className="px-5 py-2.5 bg-[#141413] hover:bg-[#2A2A28] text-white text-xs font-semibold rounded shrink-0 cursor-pointer flex items-center gap-2 transition-colors"
                  >
                    <Search className="w-4 h-4" />
                    Track Your Order
                  </button>
                </div>
              </div>
            )}

            {/* 5. CONTACT US */}
            {page === 'CONTACT_US' && (
              <div className="space-y-8">
                <div>
                  <p className="text-sm text-[#444340] leading-relaxed">
                    {settings.contactUsContent ||
                      'We are dedicated to providing prompt, professional assistance. Reach out through any of our channels below:'}
                  </p>
                </div>

                {/* Primary WhatsApp Click-To-Chat Banner */}
                <div className="p-6 bg-emerald-50 border-2 border-emerald-500 rounded-lg shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0">
                        <MessageCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                          Instant Response Channel
                        </div>
                        <h3 className="text-lg font-bold text-emerald-950">
                          Chat on WhatsApp: {displayWa}
                        </h3>
                        <p className="text-xs text-emerald-700">
                          {settings.helplineHours || 'Available Monday – Saturday: 9:00 AM – 9:00 PM PKT'}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I have an inquiry for ${settings.storeName || 'your store'}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded shadow-sm transition-colors w-full sm:w-auto"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Open WhatsApp Chat
                    </a>
                  </div>
                </div>

                {/* Direct Contact Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#FAF9F5] border border-black/[0.08] rounded space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#141413] uppercase tracking-wider">
                      <Mail className="w-4 h-4 text-[#8C6D46]" />
                      <span>Email Support</span>
                    </div>
                    <a
                      href={`mailto:${settings.helplineEmail || settings.contactEmail || 'support@store.com'}`}
                      className="text-xs font-mono text-blue-600 hover:underline block pt-1"
                    >
                      {settings.helplineEmail || settings.contactEmail || 'support@store.com'}
                    </a>
                    <p className="text-[11px] text-[#787774]">Inquiries replied within 24 hours.</p>
                  </div>

                  <div className="p-4 bg-[#FAF9F5] border border-black/[0.08] rounded space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#141413] uppercase tracking-wider">
                      <Phone className="w-4 h-4 text-[#8C6D46]" />
                      <span>Phone Helpline</span>
                    </div>
                    <a
                      href={`tel:${settings.helplinePhone || '+923001234567'}`}
                      className="text-xs font-mono text-[#141413] font-bold block pt-1"
                    >
                      {settings.helplinePhone || '+92 (042) 3578-9000'}
                    </a>
                    <p className="text-[11px] text-[#787774]">Direct operator desk during working hours.</p>
                  </div>

                  <div className="p-4 bg-[#FAF9F5] border border-black/[0.08] rounded space-y-1 sm:col-span-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#141413] uppercase tracking-wider">
                      <MapPin className="w-4 h-4 text-[#8C6D46]" />
                      <span>Head Office & Warehouse</span>
                    </div>
                    <p className="text-xs text-[#2A2A28] pt-1">
                      {settings.address || 'Commercial Center, Gulberg III, Lahore, Pakistan'}
                    </p>
                    <p className="text-[11px] text-[#787774]">Order fulfillment and return processing hub.</p>
                  </div>
                </div>

                {/* Send Us a Message Form */}
                <div className="border-t border-black/[0.08] pt-8 space-y-4">
                  <h3 className="text-lg font-bold text-[#141413]">
                    Send Us an Inquiry Message
                  </h3>
                  <p className="text-xs text-[#575653]">
                    Fill in your details below and our customer desk will attend to your request promptly.
                  </p>

                  {contactSubmitted ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-300 rounded text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <div className="text-sm font-bold text-emerald-950">
                        Inquiry Received Successfully!
                      </div>
                      <p className="text-xs text-emerald-800">
                        Thank you for reaching out. A representative will contact you via WhatsApp or Email shortly.
                      </p>
                      <button
                        type="button"
                        onClick={() => setContactSubmitted(false)}
                        className="mt-3 px-4 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded cursor-pointer"
                      >
                        Submit Another Message
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleContactSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-[#141413] mb-1">
                            Your Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder="Full name"
                            className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-black/20 text-xs focus:border-black focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#141413] mb-1">
                            Phone / WhatsApp Number
                          </label>
                          <input
                            type="tel"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            placeholder="03XXXXXXXXX"
                            className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-black/20 text-xs focus:border-black focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#141413] mb-1">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-black/20 text-xs focus:border-black focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#141413] mb-1">
                            Order Reference (Optional)
                          </label>
                          <input
                            type="text"
                            value={contactOrderNum}
                            onChange={(e) => setContactOrderNum(e.target.value.toUpperCase())}
                            placeholder="ORD-XXXXXX"
                            className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-black/20 text-xs font-mono uppercase focus:border-black focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#141413] mb-1">
                          Message / Query Details *
                        </label>
                        <textarea
                          rows={4}
                          required
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          placeholder="How can we assist you with our products or your order?"
                          className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-black/20 text-xs focus:border-black focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={contactSending}
                          className="px-6 py-2.5 bg-[#141413] hover:bg-[#2A2A28] disabled:opacity-50 text-white font-semibold text-xs rounded flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {contactSending ? 'Submitting...' : 'Submit Inquiry'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* 6. ORDER TRACKING PAGE */}
            {page === 'ORDER_TRACKING' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-[#141413]">
                    Track Your Package Status
                  </h2>
                  <p className="text-xs text-[#575653] leading-relaxed">
                    Enter your <strong>Order Reference</strong> (found in your SMS/Email invoice) and the <strong>Phone Number</strong> provided during checkout to verify and view live courier tracking information.
                  </p>
                </div>

                {/* Form Card */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeTrackOrder(trackOrderNumber, trackPhone);
                  }}
                  className="p-5 bg-[#FAF9F5] border border-black/15 rounded space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#141413] mb-1 uppercase tracking-wider">
                        Order Reference # *
                      </label>
                      <input
                        type="text"
                        required
                        value={trackOrderNumber}
                        onChange={(e) => setTrackOrderNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. ORD-104928"
                        className="w-full px-3.5 py-2.5 bg-white border border-black/20 text-xs font-mono font-bold uppercase focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#141413] mb-1 uppercase tracking-wider">
                        Customer Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={trackPhone}
                        onChange={(e) => setTrackPhone(e.target.value)}
                        placeholder="e.g. 03001234567"
                        className="w-full px-3.5 py-2.5 bg-white border border-black/20 text-xs font-mono focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <span className="text-[11px] text-[#787774]">
                      Fast lookup via nationwide courier partners (TCS, Leopards, PostEx, Trax, M&P).
                    </span>
                    <button
                      type="submit"
                      disabled={trackingLoading || !trackOrderNumber.trim() || !trackPhone.trim()}
                      className="px-6 py-2.5 bg-[#141413] hover:bg-[#2A2A28] disabled:opacity-40 text-white font-bold text-xs rounded flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                    >
                      <Search className="w-4 h-4" />
                      {trackingLoading ? 'Locating Order...' : 'Track Order'}
                    </button>
                  </div>
                </form>

                {/* Tracking Error Alert */}
                {trackingError && (
                  <div className="p-4 bg-red-50 border border-red-300 rounded text-red-900 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="block">Order Lookup Notice:</strong>
                      <p>{trackingError}</p>
                      <p className="text-[11px] text-red-700 pt-1">
                        Please confirm your phone number matches the number entered at checkout, or contact customer support on WhatsApp for manual verification.
                      </p>
                    </div>
                  </div>
                )}

                {/* Tracked Order Result Card */}
                {trackedOrder && (
                  <div className="space-y-6 pt-4 border-t border-black/[0.08]">
                    {/* Header info bar */}
                    <div className="p-5 bg-white border border-black/15 rounded-lg shadow-xs space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
                        <div>
                          <div className="text-[10px] font-bold text-[#8C6D46] uppercase tracking-widest">
                            Order Dossier
                          </div>
                          <div className="text-xl font-mono font-bold text-[#141413]">
                            #{trackedOrder.orderNumber}
                          </div>
                          <div className="text-[11px] text-[#787774]">
                            Placed on {new Date(trackedOrder.createdAt).toLocaleDateString('en-PK', { dateStyle: 'long' })}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                              trackedOrder.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : trackedOrder.status === 'SHIPPED'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : trackedOrder.status === 'CANCELLED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {trackedOrder.status === 'DELIVERED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {trackedOrder.status === 'SHIPPED' && <Truck className="w-3.5 h-3.5" />}
                            {trackedOrder.status === 'CANCELLED' && <XCircle className="w-3.5 h-3.5" />}
                            {trackedOrder.status !== 'DELIVERED' &&
                              trackedOrder.status !== 'SHIPPED' &&
                              trackedOrder.status !== 'CANCELLED' && <Clock3 className="w-3.5 h-3.5" />}
                            <span>Status: {trackedOrder.status}</span>
                          </span>
                        </div>
                      </div>

                      {/* Visual 4-Step Fulfillment Timeline */}
                      <div className="py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#575653] mb-3">
                          Fulfillment Progress
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          {/* Step 1: Placed */}
                          <div className="space-y-1">
                            <div className="w-7 h-7 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                              ✓
                            </div>
                            <div className="font-semibold text-[#141413] text-[11px]">Placed</div>
                          </div>

                          {/* Step 2: Payment / Verified */}
                          <div className="space-y-1">
                            <div
                              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center font-bold text-xs ${
                                trackedOrder.paymentStatus === 'PAID' ||
                                trackedOrder.status === 'CONFIRMED' ||
                                trackedOrder.status === 'SHIPPED' ||
                                trackedOrder.status === 'DELIVERED'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-amber-500 text-white'
                              }`}
                            >
                              {trackedOrder.paymentStatus === 'PAID' ? '✓' : '2'}
                            </div>
                            <div className="font-semibold text-[#141413] text-[11px]">
                              {trackedOrder.paymentStatus === 'PAID' ? 'Verified' : 'Processing'}
                            </div>
                          </div>

                          {/* Step 3: Shipped / In Transit */}
                          <div className="space-y-1">
                            <div
                              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center font-bold text-xs ${
                                trackedOrder.status === 'SHIPPED' || trackedOrder.status === 'DELIVERED'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-black/15 text-black/40'
                              }`}
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </div>
                            <div className="font-semibold text-[#141413] text-[11px]">Dispatched</div>
                          </div>

                          {/* Step 4: Delivered */}
                          <div className="space-y-1">
                            <div
                              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center font-bold text-xs ${
                                trackedOrder.status === 'DELIVERED'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-black/15 text-black/40'
                              }`}
                            >
                              ✓
                            </div>
                            <div className="font-semibold text-[#141413] text-[11px]">Delivered</div>
                          </div>
                        </div>
                      </div>

                      {/* Courier Name & Tracking Number Dossier (High Priority User Request) */}
                      <div className="p-4 bg-blue-50/80 border border-blue-200 rounded space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 block">
                              Assigned Courier Partner
                            </span>
                            <div className="text-base font-bold text-blue-950 flex items-center gap-2">
                              <Truck className="w-4 h-4 text-blue-700" />
                              <span>{trackedOrder.courierName || 'TCS Express'}</span>
                            </div>
                          </div>

                          <div className="space-y-1 text-right">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 block">
                              Courier Consignment / Tracking #
                            </span>
                            <div className="flex items-center gap-2 font-mono text-sm font-bold text-blue-900 bg-white px-3 py-1.5 border border-blue-300 rounded">
                              <span>{trackedOrder.trackingNumber || 'Pending Courier Handover'}</span>
                              {trackedOrder.trackingNumber && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(trackedOrder.trackingNumber || '')}
                                  title="Copy tracking number"
                                  className="text-blue-600 hover:text-blue-800 cursor-pointer p-0.5"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {copiedTracking && (
                              <div className="text-[10px] text-emerald-700 font-semibold">
                                ✓ Copied to clipboard!
                              </div>
                            )}
                          </div>
                        </div>

                        {trackedOrder.status === 'SHIPPED' && (
                          <p className="text-xs text-blue-800 leading-relaxed border-t border-blue-200/60 pt-2">
                            Your shipment has been handed over to <strong>{trackedOrder.courierName || 'the courier partner'}</strong>. Delivery riders will contact you on your registered phone number prior to arrival.
                          </p>
                        )}
                      </div>

                      {/* Delivery Address & Payment Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                        <div className="p-3.5 bg-[#FAF9F5] border border-black/[0.08] rounded space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#787774] block">
                            Destination Address
                          </span>
                          <p className="text-[#141413] font-medium leading-relaxed">
                            {trackedOrder.shippingAddressSummary || 'Customer delivery address on file.'}
                          </p>
                        </div>
                        <div className="p-3.5 bg-[#FAF9F5] border border-black/[0.08] rounded space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#787774] block">
                            Payment Details
                          </span>
                          <div className="flex justify-between">
                            <span className="text-[#575653]">Payment Method:</span>
                            <strong className="text-[#141413]">{trackedOrder.paymentMethod || 'COD'}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#575653]">Payment Status:</span>
                            <strong className={trackedOrder.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-800'}>
                              {trackedOrder.paymentStatus}
                            </strong>
                          </div>
                          <div className="flex justify-between border-t border-black/[0.06] pt-1">
                            <span className="text-[#141413] font-semibold">Total Payable:</span>
                            <strong className="text-sm font-mono text-[#141413]">
                              {trackedOrder.currency || 'PKR'} {Number(trackedOrder.total).toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Order Items Manifest */}
                      {Array.isArray(trackedOrder.items) && trackedOrder.items.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#575653]">
                            Items in this Consignment
                          </div>
                          <div className="divide-y divide-black/[0.06] border border-black/[0.08] rounded overflow-hidden">
                            {trackedOrder.items.map((item, idx) => (
                              <div key={idx} className="p-3 bg-white flex items-center justify-between text-xs">
                                <div>
                                  <strong className="text-[#141413] block">{item.name}</strong>
                                  <span className="text-[11px] text-[#787774]">
                                    Qty: {item.quantity} × {trackedOrder.currency || 'PKR'} {Number(item.price).toLocaleString()}
                                  </span>
                                </div>
                                <div className="font-mono font-bold text-[#141413]">
                                  {trackedOrder.currency || 'PKR'} {(Number(item.price) * Number(item.quantity)).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inquire on WhatsApp regarding this specific order */}
                      <div className="p-4 bg-emerald-50 border border-emerald-300 rounded flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="space-y-0.5 text-center sm:text-left">
                          <strong className="text-xs font-bold text-emerald-950 block">
                            Have questions regarding this shipment?
                          </strong>
                          <p className="text-[11px] text-emerald-800">
                            Connect with customer support directly on WhatsApp with your Order Reference.
                          </p>
                        </div>
                        <a
                          href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I am checking on my Order #${trackedOrder.orderNumber}. Courier: ${trackedOrder.courierName || 'TCS'}, Tracking: ${trackedOrder.trackingNumber || 'N/A'}. Please give me an update.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition-colors shrink-0"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Chat on WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Navigation & Policy Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Quick Links Menu */}
            <div className="bg-white border border-black/[0.08] p-5 rounded shadow-xs space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#141413] border-b border-black/[0.08] pb-2">
                Store Policies & Legal
              </div>
              <ul className="space-y-1.5 text-xs">
                <li>
                  <button
                    onClick={() => onNavigate('REFUND_POLICY')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'REFUND_POLICY'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Refund & Return Policy</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('TERMS')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'TERMS'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Terms & Conditions</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('PRIVACY_POLICY')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'PRIVACY_POLICY'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Privacy Policy</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('SHIPPING_POLICY')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'SHIPPING_POLICY'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Shipping & Delivery Policy</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('CONTACT_US')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'CONTACT_US'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Contact Us</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('ORDER_TRACKING')}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      page === 'ORDER_TRACKING'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#444340] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>Track Your Order</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </li>
              </ul>
            </div>

            {/* Direct WhatsApp Callout Card */}
            <div className="bg-emerald-900 text-white p-6 rounded shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Helpline</span>
              </div>
              <h4 className="text-base font-bold text-white leading-snug">
                Need Instant Assistance With Your Order?
              </h4>
              <p className="text-xs text-emerald-100 leading-relaxed">
                Connect directly with our customer concierge desk on WhatsApp for sizing advice, payment verification, and dispatch updates.
              </p>
              <a
                href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Assalam-o-Alaikum! I would like help from ${settings.storeName || 'the store'}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#064e3b] font-bold text-xs rounded transition-colors shadow-xs"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                Chat Now: {displayWa}
              </a>
            </div>

            {/* Safe Shopping Guarantee Card */}
            <div className="bg-white border border-black/[0.08] p-5 rounded space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#141413]">
                <ShieldCheck className="w-4 h-4 text-[#8C6D46]" />
                <span>Verified Merchant Assurance</span>
              </div>
              <p className="text-[#575653] leading-relaxed text-[11px]">
                Nationwide verified delivery with Cash on Delivery (COD) and real-time shipment monitoring across Pakistan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
