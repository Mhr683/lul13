// Payment gateway merchant IDs and secret keys must never be in the publicly readable
// settings/store_config document. They live in settings_private/payment (server only).
import type { PaymentSecrets } from '../types/store';

export const PAYMENT_SECRET_FIELDS = [
  'easypaisaStoreId',
  'easypaisaHashKey',
  'jazzcashMerchantId',
  'jazzcashPassword',
  'jazzcashIntegritySalt',
] as const;

export type PaymentSecretField = (typeof PAYMENT_SECRET_FIELDS)[number];

export const PAYMENT_SECRETS_COLLECTION = 'settings_private';
export const PAYMENT_SECRETS_DOC = 'payment';

// Returns a copy of the settings without any payment secret fields
export function stripPaymentSecrets<T extends Record<string, any>>(settings: T): Omit<T, PaymentSecretField> {
  const copy: Record<string, any> = { ...settings };
  for (const key of PAYMENT_SECRET_FIELDS) delete copy[key];
  return copy as Omit<T, PaymentSecretField>;
}

// Non-empty secret values found in a settings document (to move them to the private document)
export function pickPaymentSecrets(data: Record<string, any> | null | undefined): Partial<PaymentSecrets> {
  const found: Record<string, string> = {};
  if (!data) return found;
  for (const key of PAYMENT_SECRET_FIELDS) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) found[key] = v.trim();
  }
  return found;
}
