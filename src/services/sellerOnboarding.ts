// Seller sign-up rules shared by the Seller Center wizard and the server (/api/seller/apply), so
// both ask for the same documents and judge passwords the same way.

export type KycKind = 'ID_FRONT' | 'ID_BACK' | 'BUSINESS_DOC';
export type IdDocType = 'CNIC' | 'NATIONAL_ID' | 'PASSPORT';

export const KYC_LABELS: Record<KycKind, string> = {
  ID_FRONT: 'ID front side',
  ID_BACK: 'ID back side',
  BUSINESS_DOC: 'Business registration / trade licence',
};

/** Pictures (JPG, PNG, WEBP) or a PDF, up to 8 MB each */
export const KYC_MAX_BYTES = 8 * 1024 * 1024;

/** Pakistanis use their CNIC; elsewhere a national ID card or a passport */
export const idDocTypeFor = (countryCode: string, chosen?: string): IdDocType =>
  String(countryCode).toUpperCase() === 'PK' ? 'CNIC' : chosen === 'PASSPORT' ? 'PASSPORT' : 'NATIONAL_ID';

/** Documents a seller must upload before applying */
export function requiredKyc(countryCode: string, sellerType: string, idDocType?: string): KycKind[] {
  const t = idDocTypeFor(countryCode, idDocType);
  const kinds: KycKind[] = ['ID_FRONT'];
  if (t !== 'PASSPORT') kinds.push('ID_BACK');
  if (sellerType === 'BUSINESS') kinds.push('BUSINESS_DOC');
  return kinds;
}

/** 0–4 and what to improve; sellers need at least 3 ("Good") */
export function passwordStrength(pw: string): { score: number; label: string; tips: string[] } {
  const tips: string[] = [];
  if (pw.length < 8) tips.push('at least 8 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) tips.push('small and CAPITAL letters');
  if (!/\d/.test(pw)) tips.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) tips.push('a symbol like @ # !');
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  // Very common passwords are weak whatever their shape
  if (/^(password|12345678|qwerty|pakistan|admin|11111111)/i.test(pw)) score = 0;
  score = Math.min(4, pw.length < 8 ? Math.min(score, 1) : score);
  return { score, label: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score], tips };
}

export const MIN_SELLER_PASSWORD_SCORE = 3;
