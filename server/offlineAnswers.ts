// Answers and drafts written without the AI. Used whenever the AI is not set up, out of quota or
// busy, so the help chat, the product form and CSV uploads keep working (the AI only makes them nicer).

// ---------------------------------------------------------------- help chat

interface StoreFacts {
  storeName?: string;
  helplineWhatsAppFormatted?: string;
  helplineWhatsApp?: string;
  supportEmail?: string;
  helplineEmail?: string;
  contactEmail?: string;
  deliveryPromiseText?: string;
}

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}`, 'i').test(text));

/** A useful reply from the store's own facts, for the common questions (English and Roman Urdu) */
export function offlineSupportReply(message: string, store: StoreFacts, orderNumber?: string): string {
  const t = String(message || '').toLowerCase();
  const whatsapp = store.helplineWhatsAppFormatted || store.helplineWhatsApp || '';
  const email = store.supportEmail || store.helplineEmail || store.contactEmail || '';
  const contact = [whatsapp && `WhatsApp ${whatsapp}`, email && `email ${email}`].filter(Boolean).join(' or ');
  const team = `Our team will also reply in this chat soon${contact ? ` (or contact us on ${contact})` : ''}.`;

  if (has(t, ['agent', 'human', 'person', 'insaan', 'banda', 'call me', 'complain', 'shikayat'])) {
    return `Sorry for the trouble. A team member will reply in this chat soon${contact ? `. You can also reach us on ${contact}` : ''}.`;
  }
  if (has(t, ['damage', 'broken', 'toot', 'kharab', 'wrong item', 'ghalat', 'galat', 'return', 'refund', 'wapis', 'exchange', 'replace'])) {
    return `Sorry about that. You can ask for a return within 7 days of delivery: open "Track an order", enter your order number and phone number, and choose the return option, or send us a photo of the item. ${team}`;
  }
  if (has(t, ['cancel', 'cancle'])) {
    return `To cancel, open "Track an order", enter your order number and phone number, and press Cancel (possible until the parcel is shipped). ${team}`;
  }
  if (orderNumber || has(t, ['track', 'order', 'parcel', 'kahan', 'kab', 'status', 'pohanch', 'pahunch', 'deliver kab', 'where is'])) {
    return `You can see your order's progress any time: open "Track an order" on the website and enter your order number${orderNumber ? ` (${orderNumber})` : ''} and phone number. The courier tracking number appears there once the parcel is shipped. ${team}`;
  }
  if (has(t, ['delivery', 'shipping', 'charges', 'kitne din', 'days', 'courier', 'deliver'])) {
    return `Delivery: ${store.deliveryPromiseText || 'by courier across Pakistan; the tracking number is shared once the parcel is dispatched'}. The exact delivery charge is shown at checkout before you order.`;
  }
  if (has(t, ['cod', 'cash', 'payment', 'pay', 'bank', 'easypaisa', 'jazzcash', 'raast', 'nayapay', 'paise', 'paisay'])) {
    return 'You can pay Cash on Delivery, or by bank transfer / Raast / NayaPay where shown at checkout. For a transfer, enter the Transaction ID (TID) at checkout and we verify it. We never ask for your card PIN, OTP or password.';
  }
  if (has(t, ['price', 'qeemat', 'rate', 'discount', 'coupon', 'offer', 'sale'])) {
    return `Prices and current offers are shown on each product page, and coupons are applied at checkout. ${team}`;
  }
  if (has(t, ['seller', 'sell', 'vendor', 'apna samaan', 'shop khol'])) {
    return 'You can sell on our marketplace: open "Sell on Anokha Shopping Hub" (Seller Center) at the top of the website and create a seller account.';
  }
  if (has(t, ['hi', 'hello', 'salam', 'aoa', 'assalam', 'hey'])) {
    return `Hello! Welcome to ${store.storeName || 'our store'}. How can we help you? You can ask about an order, delivery, payment or returns.`;
  }
  return `Thank you! We have received your message. ${team}`;
}

// ---------------------------------------------------------------- product text

const clean = (s: unknown, max = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A plain, honest product text from the name and category (no invented specifications) */
export function offlineProductContent(input: { name: string; category?: string; brand?: string; storeName?: string }) {
  const name = clean(input.name);
  const category = clean(input.category, 60) || 'General';
  const brand = clean(input.brand, 60);
  const store = clean(input.storeName, 60) || 'Anokha Shopping Hub';
  const words = Array.from(new Set(`${name} ${category}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))).slice(0, 10);
  const highlights = [
    `${name}${brand && brand.toLowerCase() !== 'no brand' ? ` by ${brand}` : ''}`,
    `Category: ${category}`,
    'Cash on Delivery available all over Pakistan',
    'Easy returns within 7 days of delivery',
    'Checked and packed before dispatch',
  ];
  return {
    title: name,
    shortDescription: `${name} available at ${store} with Cash on Delivery across Pakistan.`,
    description: highlights.map((h) => `• ${h}`).join('\n'),
    seoTitle: `${name} | Buy Online in Pakistan`.slice(0, 70),
    seoDescription: `Buy ${name} online in Pakistan at ${store}. ${category}. Cash on Delivery, fast delivery and easy returns.`.slice(0, 160),
    seoKeywords: words.join(', '),
    tags: words,
    highlights,
    faq: [
      { question: 'Is Cash on Delivery available?', answer: 'Yes, you can pay cash when the parcel is delivered, anywhere in Pakistan.' },
      { question: 'Can I return it?', answer: 'Yes, within 7 days of delivery if there is a problem with the item.' },
    ],
    socialCaption: `${name} now at ${store}. Order online with Cash on Delivery!`,
    adCopy: `${name} – order now at ${store}. Cash on Delivery all over Pakistan.`,
    fallback: true,
  };
}
