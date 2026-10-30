import { Resend } from 'resend';
import { Order, OrderStatus, PaymentStatus } from '../types/store';

export interface EmailLogEntry {
  orderId?: string;
  orderNumber?: string;
  type:
    | 'ORDER_PLACED_CUSTOMER'
    | 'ORDER_PLACED_OWNER'
    | 'PAYMENT_VERIFIED'
    | 'ORDER_SHIPPED'
    | 'ORDER_CANCELLED'
    | 'RECEIPT_RESEND'
    | 'SUPPORT_REPLY'
    | 'BACK_IN_STOCK'
    | 'QUESTION_ANSWERED'
    | 'FOLLOWED_SHOP_NEW_PRODUCTS'
    | 'LOGIN_CHECK';
  recipient: string;
  sender: string;
  subject: string;
  status: 'SENT' | 'FAILED';
  resendId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Persists an email transmission attempt to the Firestore `email_logs` collection.
 * Does not throw if logging fails.
 */
export async function logEmailAttempt(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  logData: EmailLogEntry
): Promise<void> {
  if (!adminDb) {
    console.warn('[EmailService] Firestore DB not provided; skipped writing to email_logs collection.');
    return;
  }
  try {
    // Firestore refuses undefined values (e.g. no orderId on login emails): leave those fields out
    const entry = Object.fromEntries(Object.entries(logData).filter(([, v]) => v !== undefined));
    await adminDb.collection('email_logs').add({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[EmailService] Failed to record log into email_logs collection:', err?.message || err);
  }
}

/**
 * Base dispatcher using the official Resend API.
 * Never throws — catches errors, logs to `email_logs`, and returns a safe result.
 */
async function sendViaResend(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  payload: {
    to: string;
    subject: string;
    html: string;
    text: string;
    type: EmailLogEntry['type'];
    order?: Partial<Order>;
    metadata?: Record<string, any>;
  }
): Promise<SendEmailResult> {
  const { to, subject, html, text, type, order, metadata } = payload;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.EMAIL_FROM?.trim() || 'Store Orders <onboarding@resend.dev>';
  const maskedTo = maskEmail(to);

  if (!to || !to.includes('@')) {
    const errorMsg = 'Invalid recipient email address provided.';
    console.warn(`[EmailService] ${errorMsg}`);
    await logEmailAttempt(adminDb, {
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      type,
      recipient: to || 'missing@address',
      sender,
      subject,
      status: 'FAILED',
      errorMessage: errorMsg,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return { success: false, error: errorMsg };
  }

  if (!apiKey) {
    const errorMsg = 'RESEND_API_KEY is not configured in environment variables.';
    console.warn(`[EmailService] ${errorMsg} Skipped sending real email for Order #${order?.orderNumber || 'N/A'}.`);
    await logEmailAttempt(adminDb, {
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      type,
      recipient: to,
      sender,
      subject,
      status: 'FAILED',
      errorMessage: errorMsg,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return { success: false, error: errorMsg };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: sender,
      to: [to],
      subject,
      html,
      text,
    });

    if (result.error) {
      const errorMsg = result.error.message || JSON.stringify(result.error);
      console.error(`[EmailService] Resend API error sending email for Order #${order?.orderNumber || 'N/A'}:`, errorMsg);
      await logEmailAttempt(adminDb, {
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        type,
        recipient: to,
        sender,
        subject,
        status: 'FAILED',
        errorMessage: errorMsg,
        metadata,
        createdAt: new Date().toISOString(),
      });
      return { success: false, error: errorMsg };
    }

    const resendId = result.data?.id || null;
    console.log(`[EmailService] ✓ Email dispatched via Resend for Order #${order?.orderNumber || 'N/A'} (ID: ${resendId}) | Subject: "${subject}"`);
    await logEmailAttempt(adminDb, {
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      type,
      recipient: to,
      sender,
      subject,
      status: 'SENT',
      resendId,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return { success: true, id: resendId || undefined };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(`[EmailService] Exception while dispatching via Resend for Order #${order?.orderNumber || 'N/A'}:`, errorMsg);
    await logEmailAttempt(adminDb, {
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      type,
      recipient: to,
      sender,
      subject,
      status: 'FAILED',
      errorMessage: errorMsg,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// HTML Email Layout Wrapper
// ============================================================================
function wrapEmailHtml(params: {
  storeName: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerColor?: 'emerald' | 'amber' | 'blue' | 'rose' | 'dark';
  contentHtml: string;
  footerNotes?: string;
  supportEmail?: string;
}): string {
  const {
    storeName,
    bannerTitle,
    bannerSubtitle,
    bannerColor = 'dark',
    contentHtml,
    footerNotes,
    supportEmail,
  } = params;

  const currentYear = new Date().getFullYear();

  const bannerStyles = {
    emerald: { bg: '#ECFDF5', border: '#10B981', text: '#065F46', sub: '#047857', badge: '✓' },
    amber: { bg: '#FFFBEB', border: '#F59E0B', text: '#78350F', sub: '#92400E', badge: '⏳' },
    blue: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E3A8A', sub: '#1D4ED8', badge: '📦' },
    rose: { bg: '#FFF1F2', border: '#F43F5E', text: '#881337', sub: '#9F1239', badge: '✕' },
    dark: { bg: '#1F2937', border: '#374151', text: '#F9FAFB', sub: '#D1D5DB', badge: '★' },
  }[bannerColor];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(bannerTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F6F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #141413; -webkit-font-smoothing: antialiased; line-height: 1.5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F6F6F4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: #FFFFFF; border: 1px solid #E5E5E2; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border-radius: 6px; overflow: hidden;">
          
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #111827; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 2px; color: #FFFFFF; text-transform: uppercase;">
                ${escapeHtml(storeName)}
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 1.5px; color: #D1D5DB; text-transform: uppercase;">
                Official Order &amp; Delivery Notification
              </p>
            </td>
          </tr>

          <!-- Notification Status Banner -->
          <tr>
            <td style="background-color: ${bannerStyles.bg}; border-bottom: 2px solid ${bannerStyles.border}; padding: 18px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" valign="middle">
                    <div style="width: 28px; height: 28px; background-color: ${bannerStyles.border}; border-radius: 50%; color: #FFFFFF; text-align: center; line-height: 28px; font-weight: bold; font-size: 14px;">
                      ${bannerStyles.badge}
                    </div>
                  </td>
                  <td valign="middle" style="padding-left: 12px;">
                    <strong style="color: ${bannerStyles.text}; font-size: 14px; display: block;">
                      ${escapeHtml(bannerTitle)}
                    </strong>
                    <span style="color: ${bannerStyles.sub}; font-size: 12px;">
                      ${escapeHtml(bannerSubtitle)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 24px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: #111827;">
                ${escapeHtml(storeName)} Customer Support
              </p>
              ${
                supportEmail
                  ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #6B7280;">Questions? Contact us anytime at <a href="mailto:${escapeHtml(
                      supportEmail
                    )}" style="color: #2563EB; text-decoration: none;">${escapeHtml(
                      supportEmail
                    )}</a></p>`
                  : ''
              }
              ${
                footerNotes
                  ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #9CA3AF;">${escapeHtml(
                      footerNotes
                    )}</p>`
                  : ''
              }
              <p style="margin: 12px 0 0 0; font-size: 10px; color: #9CA3AF;">
                © ${currentYear} ${escapeHtml(storeName)}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Helper: Format items table
function renderItemsTableHtml(items?: any[], currency: string = 'PKR'): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `
      <tr>
        <td colspan="2" style="padding: 12px 0; font-size: 12px; color: #6B7280;">Standard Order Manifest</td>
      </tr>
    `;
  }

  return items
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #E5E7EB;">
      <td style="padding: 10px 0; font-size: 13px; color: #111827;">
        <strong>${escapeHtml(item.name || 'Product')}</strong>
        ${item.sku ? `<span style="display: block; font-size: 11px; color: #6B7280; font-family: monospace;">SKU: ${escapeHtml(item.sku)}</span>` : ''}
        <span style="display: block; font-size: 11px; color: #6B7280;">Qty: ${item.quantity || 1} × ${currency} ${Number(item.price || 0).toLocaleString()}</span>
      </td>
      <td style="padding: 10px 0; font-size: 13px; color: #111827; text-align: right; font-family: monospace; font-weight: 600;">
        ${currency} ${(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()}
      </td>
    </tr>`
    )
    .join('');
}

// ============================================================================
// LOGIN CHECK (admin: "confirm it's you" link / seller: one-time code)
// ============================================================================
export async function sendLoginCheckEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  params: { to: string; storeName?: string; portal: 'ADMIN' | 'SELLER'; link?: string; code?: string }
): Promise<SendEmailResult> {
  const storeName = params.storeName || 'Store';
  const where = params.portal === 'ADMIN' ? 'Admin panel' : 'Seller Center';
  // The subject is saved in email_logs, so it never contains the code
  const subject = params.code ? `Your ${where} login code | ${storeName}` : `Confirm your ${where} login | ${storeName}`;
  const action = params.link
    ? `<p style="margin: 0 0 20px 0;"><a href="${escapeHtml(params.link)}" style="display: inline-block; padding: 12px 22px; background-color: #111827; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 14px;">Yes, it's me: verify login</a></p>`
    : `<p style="margin: 0 0 20px 0; font-size: 30px; letter-spacing: 6px; font-family: monospace; font-weight: 700; color: #111827;">${escapeHtml(params.code || '')}</p>`;
  const html = wrapEmailHtml({
    storeName,
    bannerTitle: `${where} login`,
    bannerSubtitle: 'Someone is signing in with your account',
    bannerColor: 'dark',
    contentHtml: `
      <p style="margin: 0 0 16px 0; font-size: 14px;">If this is you, ${params.link ? 'press the button below' : 'enter this code on the login screen'}. It works for 5 minutes.</p>
      ${action}
      <p style="margin: 0; font-size: 12px; color: #B91C1C;">If this was not you, do not press anything and change your password at once.</p>`,
  });
  const text = params.link
    ? `${where} login: if this is you, open this link within 5 minutes:\n${params.link}\n\nIf this was not you, ignore this email and change your password.`
    : `${where} login code: ${params.code} (valid for 5 minutes).\n\nIf this was not you, ignore this email and change your password.`;
  return sendViaResend(adminDb, { to: params.to, subject, html, text, type: 'LOGIN_CHECK', metadata: { portal: params.portal } });
}

// ============================================================================
// SUPPORT REPLY (admin answered a helpline chat / ticket)
// ============================================================================
export async function sendSupportReplyEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  params: {
    to: string;
    customerName?: string;
    ticketNumber: string;
    replyText: string;
    storeName?: string;
    supportEmail?: string;
  }
): Promise<SendEmailResult> {
  const storeName = params.storeName || 'Store';
  const subject = `Reply to your message (${params.ticketNumber}) | ${storeName}`;
  const safeReply = escapeHtml(params.replyText).replace(/\n/g, '<br>');
  const html = wrapEmailHtml({
    storeName,
    bannerTitle: 'We replied to your message',
    bannerSubtitle: `Ticket ${params.ticketNumber}`,
    bannerColor: 'blue',
    supportEmail: params.supportEmail,
    contentHtml: `
      <p style="margin: 0 0 16px 0; font-size: 14px;">Assalam o Alaikum ${escapeHtml(params.customerName || '')},</p>
      <div style="margin: 0 0 16px 0; padding: 16px; background-color: #F9FAFB; border-left: 3px solid #3B82F6; font-size: 14px; color: #111827;">
        ${safeReply}
      </div>
      <p style="margin: 0; font-size: 12px; color: #6B7280;">You can reply from the Helpline chat on our website.</p>`,
  });
  const text = `Assalam o Alaikum ${params.customerName || ''},\n\n${params.replyText}\n\n${storeName} Support (Ticket ${params.ticketNumber})`;
  return sendViaResend(adminDb, {
    to: params.to,
    subject,
    html,
    text,
    type: 'SUPPORT_REPLY',
    metadata: { ticketNumber: params.ticketNumber },
  });
}

// ============================================================================
// BACK IN STOCK (customer asked to be told when a product returns)
// ============================================================================
export async function sendBackInStockEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  params: {
    to: string;
    productName: string;
    productUrl: string;
    price?: number;
    storeName?: string;
    supportEmail?: string;
  }
): Promise<SendEmailResult> {
  const storeName = params.storeName || 'Store';
  const subject = `Back in stock: ${params.productName} | ${storeName}`;
  const priceLine = params.price ? `PKR ${Number(params.price).toLocaleString('en-PK')}` : '';
  const html = wrapEmailHtml({
    storeName,
    bannerTitle: 'It is back in stock',
    bannerSubtitle: params.productName,
    bannerColor: 'emerald',
    supportEmail: params.supportEmail,
    footerNotes: 'You asked us to tell you once. We will not email you about this product again.',
    contentHtml: `
      <p style="margin: 0 0 12px 0; font-size: 14px;">Assalam o Alaikum,</p>
      <p style="margin: 0 0 16px 0; font-size: 14px;"><strong>${escapeHtml(params.productName)}</strong> is available again${
        priceLine ? ` for <strong>${escapeHtml(priceLine)}</strong>` : ''
      }. Stock is limited, so order soon.</p>
      <p style="margin: 0 0 8px 0;">
        <a href="${escapeHtml(params.productUrl)}" style="display: inline-block; padding: 12px 22px; background-color: #111827; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 4px;">View product</a>
      </p>`,
  });
  const text = `Assalam o Alaikum,\n\n${params.productName} is back in stock${priceLine ? ` (${priceLine})` : ''}.\n${params.productUrl}\n\n${storeName}`;
  return sendViaResend(adminDb, { to: params.to, subject, html, text, type: 'BACK_IN_STOCK', metadata: { productName: params.productName } });
}

// ============================================================================
// NEW PRODUCTS IN A FOLLOWED SHOP
// ============================================================================
export async function sendFollowedShopEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  params: {
    to: string;
    shopName: string;
    shopUrl: string;
    unsubscribeUrl: string;
    products: { name: string; price: number; url: string; image?: string }[];
    storeName?: string;
    supportEmail?: string;
  }
): Promise<SendEmailResult> {
  const storeName = params.storeName || 'Store';
  const n = params.products.length;
  const subject = `${params.shopName}: ${n === 1 ? params.products[0].name : `${n} new products`} | ${storeName}`;
  const rows = params.products
    .slice(0, 6)
    .map(
      (p) => `
      <tr>
        <td width="72" style="padding: 8px 0;">${
          p.image && /^https:\/\//i.test(p.image)
            ? `<img src="${escapeHtml(p.image)}" width="64" height="64" alt="" style="display:block; width:64px; height:64px; object-fit:cover; border:1px solid #E5E7EB;">`
            : ''
        }</td>
        <td style="padding: 8px 0 8px 10px; font-size: 13px;">
          <a href="${escapeHtml(p.url)}" style="color: #111827; font-weight: 600; text-decoration: none;">${escapeHtml(p.name)}</a>
          <span style="display:block; color:#374151; font-family: monospace;">PKR ${Number(p.price || 0).toLocaleString('en-PK')}</span>
        </td>
      </tr>`
    )
    .join('');
  const html = wrapEmailHtml({
    storeName,
    bannerTitle: `New in ${params.shopName}`,
    bannerSubtitle: n === 1 ? 'A new product from a shop you follow' : `${n} new products from a shop you follow`,
    bannerColor: 'blue',
    supportEmail: params.supportEmail,
    contentHtml: `
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin: 18px 0 0 0;"><a href="${escapeHtml(params.shopUrl)}" style="display: inline-block; padding: 11px 20px; background-color: #111827; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 13px; border-radius: 4px;">Visit ${escapeHtml(params.shopName)}</a></p>
      <p style="margin: 18px 0 0 0; font-size: 11px; color: #6B7280;">You follow ${escapeHtml(params.shopName)}. <a href="${escapeHtml(params.unsubscribeUrl)}" style="color: #6B7280;">Unfollow</a></p>`,
  });
  const text = `New in ${params.shopName}:\n${params.products
    .slice(0, 6)
    .map((p) => `- ${p.name} (PKR ${Number(p.price || 0).toLocaleString('en-PK')}) ${p.url}`)
    .join('\n')}\n\n${params.shopUrl}\nUnfollow: ${params.unsubscribeUrl}`;
  return sendViaResend(adminDb, { to: params.to, subject, html, text, type: 'FOLLOWED_SHOP_NEW_PRODUCTS', metadata: { shopName: params.shopName, count: n } });
}

// ============================================================================
// QUESTION ANSWERED (the seller / store answered a customer's product question)
// ============================================================================
export async function sendQuestionAnsweredEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  params: {
    to: string;
    customerName?: string;
    productName: string;
    productUrl: string;
    question: string;
    answer: string;
    storeName?: string;
    supportEmail?: string;
  }
): Promise<SendEmailResult> {
  const storeName = params.storeName || 'Store';
  const subject = `Your question was answered: ${params.productName} | ${storeName}`;
  const html = wrapEmailHtml({
    storeName,
    bannerTitle: 'Your question was answered',
    bannerSubtitle: params.productName,
    bannerColor: 'blue',
    supportEmail: params.supportEmail,
    contentHtml: `
      <p style="margin: 0 0 12px 0; font-size: 14px;">Assalam o Alaikum ${escapeHtml(params.customerName || '')},</p>
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #6B7280;">You asked:</p>
      <div style="margin: 0 0 14px 0; padding: 12px 14px; background-color: #F9FAFB; font-size: 14px;">${escapeHtml(params.question).replace(/\n/g, '<br>')}</div>
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #6B7280;">Answer:</p>
      <div style="margin: 0 0 18px 0; padding: 12px 14px; background-color: #EFF6FF; border-left: 3px solid #3B82F6; font-size: 14px;">${escapeHtml(params.answer).replace(/\n/g, '<br>')}</div>
      <p style="margin: 0;"><a href="${escapeHtml(params.productUrl)}" style="color: #2563EB; font-weight: 600;">View the product</a></p>`,
  });
  const text = `Assalam o Alaikum ${params.customerName || ''},\n\nYou asked: ${params.question}\n\nAnswer: ${params.answer}\n\n${params.productUrl}\n${storeName}`;
  return sendViaResend(adminDb, { to: params.to, subject, html, text, type: 'QUESTION_ANSWERED', metadata: { productName: params.productName } });
}

// ============================================================================
// 1. ORDER PLACED (TO CUSTOMER)
// ============================================================================
export async function sendOrderPlacedCustomerEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  order: Order,
  settings: { storeName?: string; supportEmail?: string; currency?: string } = {}
): Promise<SendEmailResult> {
  const storeName = settings.storeName || 'Store';
  const currency = order.currency || settings.currency || 'PKR';
  const customerName = order.customerName || 'Valued Customer';
  const orderNumber = order.orderNumber;
  const isPaid = order.paymentStatus === 'PAID';
  const isCod = order.paymentMethod === 'COD';

  const subject = `Order Confirmed: #${orderNumber} | ${storeName}`;

  const bannerTitle = isPaid
    ? 'Payment Confirmed & Order Placed!'
    : isCod
    ? 'Order Placed — Cash on Delivery'
    : 'Order Placed — Awaiting Payment Verification';

  const bannerSubtitle = isPaid
    ? `Your payment has been received. Order #${orderNumber} is confirmed for processing.`
    : isCod
    ? `Order #${orderNumber} is registered. Please keep exact cash ready upon delivery.`
    : `Order #${orderNumber} recorded. We are awaiting admin reconciliation for your TID.`;

  const bannerColor = isPaid ? 'emerald' : isCod ? 'blue' : 'amber';

  const paymentStatusDisplay = isPaid
    ? 'PAID · CONFIRMED'
    : isCod
    ? 'PENDING (Pay Cash on Handover)'
    : 'PENDING VERIFICATION';

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #111827;">
      Assalam-o-Alaikum <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #4B5563;">
      Thank you for your order with <strong>${escapeHtml(storeName)}</strong>. Your order reference is <strong style="font-family: monospace; color: #111827;">#${escapeHtml(orderNumber)}</strong>. Below is your detailed receipt and delivery manifest.
    </p>

    <!-- Order Summary Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 4px; margin-bottom: 24px; padding: 14px 16px;">
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280; width: 45%;">Order Reference:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #111827; font-family: monospace;">#${escapeHtml(orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Payment Method:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #111827;">${escapeHtml(order.paymentMethod || 'COD')}</td>
      </tr>
      ${
        order.paymentReference
          ? `<tr>
              <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Transaction Ref (TID):</td>
              <td style="padding: 5px 0; font-size: 12px; font-weight: 700; font-family: monospace; color: #D97706;">${escapeHtml(order.paymentReference)}</td>
            </tr>`
          : ''
      }
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Payment Status:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: ${isPaid ? '#047857' : '#B45309'};">${escapeHtml(paymentStatusDisplay)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Total Amount:</td>
        <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #111827; font-family: monospace;">${currency} ${Number(order.total).toLocaleString()}</td>
      </tr>
    </table>

    <!-- Shipping Destination -->
    <div style="background-color: #FFFFFF; border: 1px solid #E5E7EB; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; display: block; margin-bottom: 4px; font-weight: 600;">Delivery Address:</span>
      <p style="margin: 0; font-size: 13px; color: #111827;">
        ${escapeHtml(order.shippingAddressSummary || 'On file')}
      </p>
      ${
        order.district || order.tehsil
          ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #6B7280;">
              ${order.district ? `District: <strong>${escapeHtml(order.district)}</strong> ` : ''}
              ${order.tehsil ? `| Tehsil: <strong>${escapeHtml(order.tehsil)}</strong> ` : ''}
            </p>`
          : ''
      }
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #6B7280;">
        Contact Phone: <strong style="font-family: monospace;">${escapeHtml(order.customerPhone || 'N/A')}</strong>
      </p>
    </div>

    <!-- Item Manifest -->
    <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #111827; margin: 0 0 12px 0; border-bottom: 1px solid #111827; padding-bottom: 6px;">
      Items in Your Order
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
      ${renderItemsTableHtml(order.items, currency)}
    </table>

    <!-- Financial Breakdown -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #E5E7EB; padding-top: 12px; font-size: 12px;">
      <tr>
        <td style="padding: 4px 0; color: #6B7280;">Subtotal:</td>
        <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #111827;">${currency} ${Number(order.subtotal || order.total).toLocaleString()}</td>
      </tr>
      ${
        order.discount && order.discount > 0
          ? `<tr>
              <td style="padding: 4px 0; color: #047857;">Discount (${escapeHtml(order.couponCode || 'Promo')}):</td>
              <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #047857;">-${currency} ${Number(order.discount).toLocaleString()}</td>
            </tr>`
          : ''
      }
      ${
        order.shippingFee && order.shippingFee > 0
          ? `<tr>
              <td style="padding: 4px 0; color: #6B7280;">Shipping &amp; Delivery:</td>
              <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #111827;">${currency} ${Number(order.shippingFee).toLocaleString()}</td>
            </tr>`
          : `<tr>
              <td style="padding: 4px 0; color: #047857;">Shipping:</td>
              <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #047857;">Free Shipping</td>
            </tr>`
      }
      <tr style="border-top: 2px solid #111827;">
        <td style="padding: 8px 0; font-size: 13px; font-weight: 700; color: #111827;">Total:</td>
        <td style="padding: 8px 0; text-align: right; font-size: 15px; font-weight: 700; font-family: monospace; color: #111827;">${currency} ${Number(order.total).toLocaleString()}</td>
      </tr>
    </table>
  `;

  const text = `
Dear ${customerName},

Thank you for your order #${orderNumber} at ${storeName}.

Order Reference: #${orderNumber}
Payment Method: ${order.paymentMethod || 'COD'}
Payment Status: ${paymentStatusDisplay}
${order.paymentReference ? `Transaction ID: ${order.paymentReference}\n` : ''}Total Amount: ${currency} ${Number(order.total).toLocaleString()}

Delivery Address:
${order.shippingAddressSummary || 'On file'}
${order.district ? `District: ${order.district}\n` : ''}${order.tehsil ? `Tehsil: ${order.tehsil}\n` : ''}Phone: ${order.customerPhone || 'N/A'}

We will notify you once your order is verified and dispatched.
${settings.supportEmail ? `Support: ${settings.supportEmail}` : ''}
  `.trim();

  return sendViaResend(adminDb, {
    to: order.customerEmail,
    subject,
    html: wrapEmailHtml({
      storeName,
      bannerTitle,
      bannerSubtitle,
      bannerColor,
      contentHtml,
      supportEmail: settings.supportEmail,
    }),
    text,
    type: 'ORDER_PLACED_CUSTOMER',
    order,
    metadata: { orderTotal: order.total, currency },
  });
}

// ============================================================================
// 2. ORDER PLACED (TO STORE OWNER)
// ============================================================================
export async function sendOrderPlacedOwnerEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  order: Order,
  settings: { storeName?: string; supportEmail?: string; contactEmail?: string; currency?: string } = {}
): Promise<SendEmailResult> {
  const storeName = settings.storeName || 'Store';
  const currency = order.currency || settings.currency || 'PKR';
  const ownerEmail =
    process.env.STORE_OWNER_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    settings.supportEmail?.trim() ||
    settings.contactEmail?.trim() ||
    'aatech683@gmail.com';

  const orderNumber = order.orderNumber;
  const subject = `🔔 [New Order #${orderNumber}] ${currency} ${Number(order.total).toLocaleString()} - ${order.customerName || 'Customer'}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #111827;">
      A new order has just been placed on <strong>${escapeHtml(storeName)}</strong>!
    </p>

    <!-- Admin Quick Stats -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 4px; margin-bottom: 24px; padding: 14px 16px;">
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #92400E; width: 45%;">Order Reference:</td>
        <td style="padding: 5px 0; font-size: 13px; font-weight: 700; color: #78350F; font-family: monospace;">#${escapeHtml(orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #92400E;">Total Value:</td>
        <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #78350F; font-family: monospace;">${currency} ${Number(order.total).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #92400E;">Payment Protocol:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #78350F;">${escapeHtml(order.paymentMethod || 'COD')}</td>
      </tr>
      ${
        order.paymentReference
          ? `<tr>
              <td style="padding: 5px 0; font-size: 12px; color: #92400E;">Submitted TID:</td>
              <td style="padding: 5px 0; font-size: 13px; font-weight: 700; font-family: monospace; color: #B45309;">${escapeHtml(order.paymentReference)}</td>
            </tr>`
          : ''
      }
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #92400E;">Current Status:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #78350F;">${escapeHtml(order.status)} (Payment: ${escapeHtml(order.paymentStatus)})</td>
      </tr>
    </table>

    <!-- Customer Contact Card -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 4px; padding: 14px 16px; margin-bottom: 24px;">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; display: block; margin-bottom: 6px; font-weight: 600;">Customer Details:</span>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #111827;"><strong>Name:</strong> ${escapeHtml(order.customerName || 'N/A')}</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #111827;"><strong>Email:</strong> <a href="mailto:${escapeHtml(order.customerEmail)}" style="color: #2563EB;">${escapeHtml(order.customerEmail)}</a></p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #111827;"><strong>Phone:</strong> <a href="tel:${escapeHtml(order.customerPhone || '')}" style="color: #2563EB; font-family: monospace;">${escapeHtml(order.customerPhone || 'N/A')}</a></p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #4B5563;">
        <strong>Address:</strong> ${escapeHtml(order.shippingAddressSummary || 'On file')}
        ${order.district ? `<br><strong>District:</strong> ${escapeHtml(order.district)}` : ''}
        ${order.tehsil ? `<br><strong>Tehsil:</strong> ${escapeHtml(order.tehsil)}` : ''}
      </p>
    </div>

    <!-- Order Items -->
    <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #111827; margin: 0 0 12px 0; border-bottom: 1px solid #111827; padding-bottom: 6px;">
      Ordered Items Manifest
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      ${renderItemsTableHtml(order.items, currency)}
    </table>

    ${
      order.notes
        ? `<div style="background-color: #F3F4F6; padding: 12px 14px; border-left: 3px solid #6B7280; font-size: 12px; color: #374151; margin-bottom: 20px;">
            <strong>Order Notes / System Log:</strong> ${escapeHtml(order.notes)}
          </div>`
        : ''
    }
  `;

  const text = `
[NEW ORDER ALERT] #${orderNumber}

Total: ${currency} ${Number(order.total).toLocaleString()}
Customer: ${order.customerName || 'N/A'} (${order.customerEmail}, ${order.customerPhone || 'N/A'})
Payment: ${order.paymentMethod || 'COD'} (Status: ${order.paymentStatus})
${order.paymentReference ? `TID: ${order.paymentReference}\n` : ''}
Destination: ${order.shippingAddressSummary || 'On file'}

Items:
${(order.items || []).map((i) => `- ${i.name} (Qty: ${i.quantity}, ${currency} ${i.price})`).join('\n')}
  `.trim();

  return sendViaResend(adminDb, {
    to: ownerEmail,
    subject,
    html: wrapEmailHtml({
      storeName,
      bannerTitle: `New Order Alert: #${orderNumber}`,
      bannerSubtitle: `${currency} ${Number(order.total).toLocaleString()} from ${order.customerName || 'Customer'}`,
      bannerColor: 'amber',
      contentHtml,
    }),
    text,
    type: 'ORDER_PLACED_OWNER',
    order,
    metadata: { orderTotal: order.total, ownerRecipient: ownerEmail },
  });
}

// ============================================================================
// 3. PAYMENT VERIFIED (TO CUSTOMER)
// ============================================================================
export async function sendPaymentVerifiedEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  order: Order,
  settings: { storeName?: string; supportEmail?: string; currency?: string } = {},
  verificationNote?: string
): Promise<SendEmailResult> {
  const storeName = settings.storeName || 'Store';
  const currency = order.currency || settings.currency || 'PKR';
  const customerName = order.customerName || 'Valued Customer';
  const orderNumber = order.orderNumber;

  const subject = `✓ Payment Verified & Received: Order #${orderNumber} | ${storeName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #111827;">
      Assalam-o-Alaikum <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #4B5563;">
      We are delighted to confirm that your payment for Order <strong style="font-family: monospace; color: #111827;">#${escapeHtml(orderNumber)}</strong> has been verified and recorded in the merchant treasury of <strong>${escapeHtml(storeName)}</strong>. Your order is now officially locked and authorized for priority packaging and dispatch!
    </p>

    <!-- Payment Verification Certificate Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ECFDF5; border: 1px solid #10B981; border-radius: 4px; margin-bottom: 24px; padding: 16px;">
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #065F46; width: 45%;">Order Reference:</td>
        <td style="padding: 5px 0; font-size: 13px; font-weight: 700; color: #065F46; font-family: monospace;">#${escapeHtml(orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #065F46;">Payment Status:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #047857;">PAID · PAYMENT VERIFIED &amp; RECEIVED</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #065F46;">Payment Method:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 600; color: #065F46;">${escapeHtml(order.paymentMethod || 'Advance Payment')}</td>
      </tr>
      ${
        order.paymentReference
          ? `<tr>
              <td style="padding: 5px 0; font-size: 12px; color: #065F46;">Verified TID:</td>
              <td style="padding: 5px 0; font-size: 13px; font-weight: 700; font-family: monospace; color: #065F46;">${escapeHtml(order.paymentReference)}</td>
            </tr>`
          : ''
      }
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #065F46;">Total Amount Paid:</td>
        <td style="padding: 5px 0; font-size: 15px; font-weight: 700; color: #065F46; font-family: monospace;">${currency} ${Number(order.total).toLocaleString()}</td>
      </tr>
      ${
        verificationNote
          ? `<tr>
              <td style="padding: 5px 0; font-size: 12px; color: #065F46;">Admin Note:</td>
              <td style="padding: 5px 0; font-size: 12px; color: #047857;">${escapeHtml(verificationNote)}</td>
            </tr>`
          : ''
      }
    </table>

    <!-- Destination Summary -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; display: block; margin-bottom: 4px; font-weight: 600;">Delivery Destination:</span>
      <p style="margin: 0; font-size: 13px; color: #111827;">${escapeHtml(order.shippingAddressSummary || 'On file')}</p>
    </div>

    <!-- Items -->
    <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #111827; margin: 0 0 12px 0; border-bottom: 1px solid #111827; padding-bottom: 6px;">
      Confirmed Manifest
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
      ${renderItemsTableHtml(order.items, currency)}
    </table>
  `;

  const text = `
Dear ${customerName},

Your payment has been received and verified successfully.

Store: ${storeName}
Order Reference: #${orderNumber}
Payment Status: PAID · VERIFIED BY ADMIN
${order.paymentReference ? `Transaction ID (TID): ${order.paymentReference}\n` : ''}Total Amount: ${currency} ${Number(order.total).toLocaleString()}
${verificationNote ? `Note: ${verificationNote}\n` : ''}
Your order is now being packaged for express delivery.
  `.trim();

  return sendViaResend(adminDb, {
    to: order.customerEmail,
    subject,
    html: wrapEmailHtml({
      storeName,
      bannerTitle: 'Your Payment Has Been Received!',
      bannerSubtitle: `Payment verified & approved for Order #${orderNumber}`,
      bannerColor: 'emerald',
      contentHtml,
      supportEmail: settings.supportEmail,
    }),
    text,
    type: 'PAYMENT_VERIFIED',
    order,
    metadata: { orderTotal: order.total, currency },
  });
}

// ============================================================================
// 4. ORDER SHIPPED (TO CUSTOMER)
// ============================================================================
export async function sendOrderShippedEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  order: Order,
  courierName?: string,
  trackingNumber?: string,
  settings: { storeName?: string; supportEmail?: string; currency?: string; appUrl?: string } = {}
): Promise<SendEmailResult> {
  const storeName = settings.storeName || 'Store';
  const currency = order.currency || settings.currency || 'PKR';
  const customerName = order.customerName || 'Valued Customer';
  const orderNumber = order.orderNumber;
  const safeCourier = courierName || order.courierName || 'Courier';
  const safeTracking = trackingNumber || order.trackingNumber || 'Tracking Pending';
  const appUrl = settings.appUrl || process.env.APP_URL || '';

  const shipments = Array.isArray(order.shipments) && order.shipments.length > 0 ? order.shipments : [];

  const subject = shipments.length > 1
    ? `📦 Order #${orderNumber} Has Shipped (${shipments.length} Consignments) | ${storeName}`
    : `📦 Your Order #${orderNumber} Has Shipped! (${safeCourier}) | ${storeName}`;

  const storeTrackingUrl = appUrl
    ? `${appUrl.replace(/\/$/, '')}/track?order=${encodeURIComponent(orderNumber)}${
        order.orderAccessToken ? `&token=${encodeURIComponent(order.orderAccessToken)}` : ''
      }`
    : '';

  // Render multi-shipment cards or single courier dossier
  let trackingSectionHtml = '';
  if (shipments.length > 0) {
    trackingSectionHtml = `
      <div style="margin-bottom: 24px;">
        <h4 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #1E3A8A; margin: 0 0 12px 0;">
          Consignment Tracking (${shipments.length} ${shipments.length === 1 ? 'Package' : 'Packages'})
        </h4>
        ${shipments
          .map(
            (s, idx) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; margin-bottom: 12px; padding: 14px 16px;">
            <tr>
              <td style="padding: 4px 0; font-size: 12px; color: #1E3A8A; width: 40%;"><strong>Package #${idx + 1}:</strong></td>
              <td style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #1E3A8A;">${escapeHtml(s.courierName)} · <span style="font-size: 11px; background-color: #DBEAFE; padding: 2px 6px; border-radius: 3px;">${escapeHtml(s.status)}</span></td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-size: 12px; color: #1E3A8A;">Tracking Number:</td>
              <td style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #1D4ED8; font-family: monospace;">${escapeHtml(s.trackingNumber)}</td>
            </tr>
            ${
              s.trackingUrl
                ? `<tr>
                    <td colspan="2" style="padding-top: 10px;">
                      <a href="${escapeHtml(s.trackingUrl)}" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 7px 16px; font-size: 12px; font-weight: 600; border-radius: 4px;">
                        Track on ${escapeHtml(s.courierName)} Portal ↗
                      </a>
                    </td>
                  </tr>`
                : ''
            }
          </table>
        `
          )
          .join('')}
      </div>
    `;
  } else {
    trackingSectionHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #EFF6FF; border: 1px solid #3B82F6; border-radius: 4px; margin-bottom: 24px; padding: 16px;">
        <tr>
          <td style="padding: 5px 0; font-size: 12px; color: #1E3A8A; width: 45%;">Courier Partner:</td>
          <td style="padding: 5px 0; font-size: 13px; font-weight: 700; color: #1E3A8A;">${escapeHtml(safeCourier)}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-size: 12px; color: #1E3A8A;">Consignment / Tracking #:</td>
          <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #1D4ED8; font-family: monospace;">${escapeHtml(safeTracking)}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-size: 12px; color: #1E3A8A;">Dispatch Status:</td>
          <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #1D4ED8;">DISPATCHED / IN TRANSIT</td>
        </tr>
        ${
          order.paymentMethod === 'COD'
            ? `<tr>
                <td style="padding: 5px 0; font-size: 12px; color: #1E3A8A;">Payment on Handover:</td>
                <td style="padding: 5px 0; font-size: 13px; font-weight: 700; color: #DC2626; font-family: monospace;">
                  ${currency} ${Number(order.total).toLocaleString()} (Cash Due on Delivery)
                </td>
              </tr>`
            : `<tr>
                <td style="padding: 5px 0; font-size: 12px; color: #1E3A8A;">Payment:</td>
                <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #047857;">PAID IN ADVANCE (No payment due to rider)</td>
              </tr>`
        }
      </table>
    `;
  }

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #111827;">
      Assalam-o-Alaikum <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #4B5563;">
      Great news! Your package for Order <strong style="font-family: monospace; color: #111827;">#${escapeHtml(orderNumber)}</strong> has been inspected, packaged, and handed over to our courier partner. It is now on its way to your destination!
    </p>

    ${trackingSectionHtml}

    ${
      storeTrackingUrl
        ? `<div style="text-align: center; margin-bottom: 24px;">
            <a href="${escapeHtml(storeTrackingUrl)}" style="display: inline-block; background-color: #111827; color: #FFFFFF; text-decoration: none; padding: 12px 28px; font-size: 13px; font-weight: 600; border-radius: 4px; letter-spacing: 0.5px;">
              Track Order Live in Store
            </a>
          </div>`
        : ''
    }

    <!-- Shipping Destination -->
    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; display: block; margin-bottom: 4px; font-weight: 600;">Delivery Destination:</span>
      <p style="margin: 0; font-size: 13px; color: #111827;">${escapeHtml(order.shippingAddressSummary || 'On file')}</p>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #6B7280;">Phone for Courier Rider: <strong style="font-family: monospace;">${escapeHtml(order.customerPhone || 'N/A')}</strong></p>
    </div>

    <!-- Items in Transit -->
    <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #111827; margin: 0 0 12px 0; border-bottom: 1px solid #111827; padding-bottom: 6px;">
      Package Contents
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
      ${renderItemsTableHtml(order.items, currency)}
    </table>
  `;

  const trackingTextList = shipments.length > 0
    ? shipments.map((s, idx) => `Package ${idx + 1} (${s.courierName}): ${s.trackingNumber}${s.trackingUrl ? ` -> ${s.trackingUrl}` : ''}`).join('\n')
    : `Courier: ${safeCourier}\nTracking Number: ${safeTracking}`;

  const text = `
Dear ${customerName},

Your order #${orderNumber} from ${storeName} has shipped!

${trackingTextList}
${order.paymentMethod === 'COD' ? `Amount Due on Delivery: ${currency} ${Number(order.total).toLocaleString()} (Cash on Delivery)\n` : 'Payment Status: PAID IN ADVANCE\n'}${storeTrackingUrl ? `Track Live: ${storeTrackingUrl}\n` : ''}
Delivery Address:
${order.shippingAddressSummary || 'On file'}
Phone: ${order.customerPhone || 'N/A'}
  `.trim();

  return sendViaResend(adminDb, {
    to: order.customerEmail,
    subject,
    html: wrapEmailHtml({
      storeName,
      bannerTitle: 'Your Package Has Dispatched!',
      bannerSubtitle: shipments.length > 1
        ? `${shipments.length} consignments dispatched for Order #${orderNumber}`
        : `Handed over to ${safeCourier} · Tracking #${safeTracking}`,
      bannerColor: 'blue',
      contentHtml,
      supportEmail: settings.supportEmail,
    }),
    text,
    type: 'ORDER_SHIPPED',
    order,
    metadata: {
      courier: safeCourier,
      trackingNumber: safeTracking,
      shipmentCount: shipments.length,
    },
  });
}

// ============================================================================
// 5. ORDER CANCELLED (TO CUSTOMER)
// ============================================================================
export async function sendOrderCancelledEmail(
  adminDb: FirebaseFirestore.Firestore | null | undefined,
  order: Order,
  reason?: string,
  settings: { storeName?: string; supportEmail?: string; currency?: string } = {}
): Promise<SendEmailResult> {
  const storeName = settings.storeName || 'Store';
  const currency = order.currency || settings.currency || 'PKR';
  const customerName = order.customerName || 'Valued Customer';
  const orderNumber = order.orderNumber;
  const safeReason = reason || order.cancellationReason || 'Cancelled upon customer request or payment verification failure.';

  const subject = `Order Cancelled: #${orderNumber} | ${storeName}`;

  const wasPaid = order.paymentStatus === 'PAID';

  const contentHtml = `
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #111827;">
      Assalam-o-Alaikum <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #4B5563;">
      This email is to notify you that Order <strong style="font-family: monospace; color: #111827;">#${escapeHtml(orderNumber)}</strong> has been marked as <strong>CANCELLED</strong>.
    </p>

    <!-- Cancellation Notice Box -->
    <div style="background-color: #FFF1F2; border: 1px solid #F43F5E; border-radius: 4px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #881337;">
        Cancellation Reason:
      </p>
      <p style="margin: 0; font-size: 13px; color: #9F1239; line-height: 1.5;">
        ${escapeHtml(safeReason)}
      </p>
    </div>

    <!-- Financial Notice -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 4px; margin-bottom: 24px; padding: 14px 16px;">
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280; width: 45%;">Order Reference:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: #111827; font-family: monospace;">#${escapeHtml(orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Order Value:</td>
        <td style="padding: 5px 0; font-size: 13px; font-weight: 700; color: #111827; font-family: monospace;">${currency} ${Number(order.total).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; font-size: 12px; color: #6B7280;">Payment Status:</td>
        <td style="padding: 5px 0; font-size: 12px; font-weight: 700; color: ${wasPaid ? '#D97706' : '#6B7280'};">
          ${wasPaid ? 'REFUND PENDING / ELIGIBLE' : 'NO CHARGE RECORDED'}
        </td>
      </tr>
    </table>

    ${
      wasPaid
        ? `<div style="background-color: #FFFBEB; border-left: 3px solid #F59E0B; padding: 12px 14px; font-size: 12px; color: #92400E; margin-bottom: 24px;">
            <strong>Refund Information:</strong> Because an advance payment was recorded for this order, our accounting desk will initiate your refund to your originating account within 2–3 business days. If you have any questions, please contact our support desk.
          </div>`
        : ''
    }

    <p style="margin: 0; font-size: 13px; color: #4B5563;">
      If you did not request this cancellation or believe this was an error, please contact our support helpline immediately.
    </p>
  `;

  const text = `
Dear ${customerName},

Your order #${orderNumber} at ${storeName} has been cancelled.

Reason: ${safeReason}
Order Total: ${currency} ${Number(order.total).toLocaleString()}
${wasPaid ? 'An advance payment was recorded; our team will process your refund.\n' : 'No funds were charged.\n'}
If you have any questions, please contact our support team.
  `.trim();

  return sendViaResend(adminDb, {
    to: order.customerEmail,
    subject,
    html: wrapEmailHtml({
      storeName,
      bannerTitle: `Order #${orderNumber} Cancelled`,
      bannerSubtitle: safeReason,
      bannerColor: 'rose',
      contentHtml,
      supportEmail: settings.supportEmail,
    }),
    text,
    type: 'ORDER_CANCELLED',
    order,
    metadata: { reason: safeReason },
  });
}
