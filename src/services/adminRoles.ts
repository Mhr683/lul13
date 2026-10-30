// Which parts of the admin console each team role may use. Shared by the admin menu (what is shown)
// and the server's requireAdmin (what is allowed), so a hidden section cannot be reached through
// its API either.

export type AdminTab =
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
  | 'GROWTH'
  | 'TRAFFIC'
  | 'QUESTIONS';

export const ADMIN_TABS: AdminTab[] = [
  'DASHBOARD', 'CATALOG', 'ORDERS', 'RETURNS', 'GROWTH', 'TRAFFIC', 'COUPONS', 'REVIEWS', 'QUESTIONS',
  'AI_COMMAND_CENTER', 'AI_TASKS', 'AUDIT_LOGS', 'NOTIFICATIONS', 'SETTINGS', 'SELLERS', 'SELLER_INBOX',
];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  PRODUCT_MANAGER: 'Product Manager',
  ORDER_MANAGER: 'Order Manager',
};

/** Sections per role; the owner and admins see everything */
const ROLE_TABS: Record<string, AdminTab[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  ADMIN: 'ALL',
  MANAGER: ['DASHBOARD', 'CATALOG', 'ORDERS', 'RETURNS', 'QUESTIONS', 'REVIEWS', 'NOTIFICATIONS', 'COUPONS', 'GROWTH', 'AI_COMMAND_CENTER'],
  PRODUCT_MANAGER: ['DASHBOARD', 'CATALOG', 'QUESTIONS', 'REVIEWS', 'AI_COMMAND_CENTER'],
  ORDER_MANAGER: ['DASHBOARD', 'ORDERS', 'RETURNS', 'NOTIFICATIONS', 'AI_COMMAND_CENTER'],
};

export function tabsForRole(role?: string | null): AdminTab[] {
  const t = ROLE_TABS[String(role || '').toUpperCase()];
  return t === 'ALL' ? ADMIN_TABS : t || [];
}

export const roleCanUseTab = (role: string | null | undefined, tab: AdminTab) => tabsForRole(role).includes(tab);

/**
 * The admin section an API path belongs to (null = not limited to one section). Order matters:
 * the first matching prefix wins.
 */
const API_AREAS: Array<[RegExp, AdminTab]> = [
  [/^\/api\/admin\/payment-secrets/, 'SETTINGS'],
  [/^\/api\/admin\/(sellers|payouts|seller-list)(\/|$)/, 'SELLERS'],
  [/^\/api\/admin\/(seller-threads|seller-notices)(\/|$)/, 'SELLER_INBOX'],
  [/^\/api\/admin\/(ads|analytics)(\/|$)/, 'TRAFFIC'],
  [/^\/api\/admin\/(carts|flash-deal)(\/|$)/, 'GROWTH'],
  [/^\/api\/admin\/returns(\/|$)/, 'RETURNS'],
  [/^\/api\/admin\/questions(\/|$)/, 'QUESTIONS'],
  [/^\/api\/admin\/feedback(\/|$)/, 'REVIEWS'],
  [/^\/api\/admin\/products(\/|$)/, 'CATALOG'],
  [/^\/api\/admin\/verify-payment/, 'ORDERS'],
  [/^\/api\/orders\/(update-status|confirm|cancel-fake)/, 'ORDERS'],
  [/^\/api\/email\/(send-payment-receipt|receipt|resend-receipt)/, 'ORDERS'],
];

export function adminAreaOfPath(path: string): AdminTab | null {
  for (const [re, tab] of API_AREAS) if (re.test(path)) return tab;
  return null;
}
