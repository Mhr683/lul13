import { checkPhone } from './intlAddress';

// Seller (vendor) application for sellers from any country: who they are, where they operate and
// ship from, tax number and how they are paid. Shared by Seller Center (form hints) and the server
// (the check that counts).

export type SellerType = 'INDIVIDUAL' | 'BUSINESS';
export type PayoutMethod = 'PK_BANK' | 'IBAN' | 'US_ACH' | 'PAYONEER';

export const PAYOUT_METHODS: { id: PayoutMethod; label: string; hint: string }[] = [
  { id: 'PK_BANK', label: 'Pakistani bank / wallet', hint: 'Bank or wallet account in Pakistan (IBAN or account number)' },
  { id: 'IBAN', label: 'Bank account with IBAN', hint: 'Europe, UK, Gulf, Turkey and most countries: IBAN + SWIFT/BIC' },
  { id: 'US_ACH', label: 'US bank (routing number)', hint: 'United States: 9-digit routing number + account number' },
  { id: 'PAYONEER', label: 'Payoneer', hint: 'Any country: the email of your Payoneer account' },
];

export interface PayoutDetails {
  method: PayoutMethod;
  accountHolder: string;
  bankName?: string;
  /** PK_BANK: account number or PK IBAN; US_ACH: account number */
  accountNumber?: string;
  iban?: string;
  swift?: string;
  routingNumber?: string;
  payoneerEmail?: string;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** IBAN with a valid checksum (ISO 13616, mod 97) */
export function isValidIban(raw: string): boolean {
  const iban = String(raw || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/** US ABA routing number (9 digits with checksum) */
export function isValidRoutingNumber(raw: string): boolean {
  const r = String(raw || '').replace(/\D/g, '');
  if (r.length !== 9) return false;
  const d = r.split('').map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

const isSwift = (v: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v);

export interface VendorApplication {
  sellerType: SellerType;
  shopName: string;
  ownerName: string;
  /** Registered business name (businesses) */
  businessName?: string;
  countryCode: string;
  phone: string;
  city: string;
  /** Where orders are shipped from */
  warehouseCountry: string;
  warehouseCity: string;
  // private (only the seller and the store's admins see these)
  idNumber: string; // CNIC in Pakistan; national ID / passport elsewhere
  taxId?: string; // NTN / VAT / EIN / TRN ...
  address: string;
  payout: PayoutDetails;
}

/** Checks a seller application; returns the cleaned application or every problem found */
export function checkVendorApplication(b: any): { ok: true; app: VendorApplication; phoneE164: string } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const sellerType: SellerType = b?.sellerType === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';
  const countryCode = clean(b?.countryCode || 'PK', 2).toUpperCase();
  const isPk = countryCode === 'PK';
  const shopName = clean(b?.shopName, 60);
  const ownerName = clean(b?.ownerName, 80);
  const businessName = clean(b?.businessName, 120);
  const city = clean(b?.city, 60);
  const warehouseCountry = clean(b?.warehouseCountry || countryCode, 2).toUpperCase();
  const warehouseCity = clean(b?.warehouseCity || city, 60);
  const address = clean(b?.address, 300);
  const idRaw = clean(b?.idNumber ?? b?.cnic, 30);
  const taxId = clean(b?.taxId, 30).toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) problems.push('Country of operation');
  if (shopName.length < 3) problems.push('Shop name');
  if (ownerName.length < 3) problems.push('Your full name');
  if (sellerType === 'BUSINESS' && businessName.length < 3) problems.push('Registered business name');
  const phone = checkPhone(countryCode, String(b?.phone || ''));
  if (!phone.valid) problems.push(`Mobile number (${phone.message || 'not valid for the country'})`);
  if (city.length < 2) problems.push('City');
  if (address.length < 8) problems.push('Business / warehouse address');
  if (!/^[A-Z]{2}$/.test(warehouseCountry)) problems.push('Warehouse country');
  if (warehouseCity.length < 2) problems.push('Warehouse city');

  // Identity: CNIC (13 digits) in Pakistan; national ID / passport number elsewhere
  const idNumber = isPk ? idRaw.replace(/[^\d-]/g, '') : idRaw.toUpperCase();
  if (isPk ? idNumber.replace(/-/g, '').length !== 13 : !/^[A-Z0-9-]{5,30}$/.test(idNumber)) {
    problems.push(isPk ? 'CNIC (13 digits)' : 'National ID / passport number');
  }
  // Tax number: required for businesses (NTN / VAT / EIN / TRN ...), optional for individuals
  if (taxId && !/^[A-Z0-9][A-Z0-9 ./-]{3,29}$/.test(taxId)) problems.push('Tax ID / VAT number (letters and digits only)');
  if (sellerType === 'BUSINESS' && !taxId) problems.push('Tax ID / VAT number (required for businesses)');

  // Payout
  const p = b?.payout || {};
  const method: PayoutMethod = ['PK_BANK', 'IBAN', 'US_ACH', 'PAYONEER'].includes(p.method) ? p.method : isPk ? 'PK_BANK' : 'IBAN';
  const payout: PayoutDetails = { method, accountHolder: clean(p.accountHolder || b?.accountTitle, 80) };
  if (method !== 'PAYONEER' && payout.accountHolder.length < 3) problems.push('Account holder name');
  if (method === 'PK_BANK') {
    payout.bankName = clean(p.bankName || b?.bankName, 60);
    payout.accountNumber = clean(p.accountNumber || b?.accountNumber, 40).replace(/\s+/g, '').toUpperCase();
    if ((payout.bankName || '').length < 2) problems.push('Bank / wallet name');
    if (/^PK/.test(payout.accountNumber) ? !isValidIban(payout.accountNumber) : (payout.accountNumber || '').length < 8) {
      problems.push('Account number / IBAN');
    }
  } else if (method === 'IBAN') {
    payout.bankName = clean(p.bankName, 60);
    payout.iban = clean(p.iban, 40).replace(/\s+/g, '').toUpperCase();
    payout.swift = clean(p.swift, 11).replace(/\s+/g, '').toUpperCase();
    if (!isValidIban(payout.iban)) problems.push('IBAN (check the number: its checksum does not match)');
    if (payout.swift && !isSwift(payout.swift)) problems.push('SWIFT / BIC (8 or 11 characters)');
  } else if (method === 'US_ACH') {
    payout.bankName = clean(p.bankName, 60);
    payout.routingNumber = clean(p.routingNumber, 12).replace(/\D/g, '');
    payout.accountNumber = clean(p.accountNumber, 20).replace(/\D/g, '');
    if (!isValidRoutingNumber(payout.routingNumber)) problems.push('Routing number (9 digits)');
    if ((payout.accountNumber || '').length < 4) problems.push('US account number');
  } else {
    payout.payoneerEmail = clean(p.payoneerEmail, 120).toLowerCase();
    if (!isEmail(payout.payoneerEmail)) problems.push('Payoneer email');
    if (!payout.accountHolder) payout.accountHolder = ownerName;
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    phoneE164: phone.e164,
    app: {
      sellerType,
      shopName,
      ownerName,
      ...(sellerType === 'BUSINESS' ? { businessName } : {}),
      countryCode,
      phone: isPk ? `0${phone.e164.slice(3)}` : phone.e164,
      city,
      warehouseCountry,
      warehouseCity,
      idNumber,
      ...(taxId ? { taxId } : {}),
      address,
      payout,
    },
  };
}

/** One line for the admin: "IBAN AE07 0331 ... (Emirates NBD)" */
export const payoutSummary = (p?: Partial<PayoutDetails> | null, legacy?: { bankName?: string; accountTitle?: string; accountNumber?: string }) => {
  if (!p?.method) return legacy?.accountNumber ? `${legacy.bankName || 'Bank'} · ${legacy.accountTitle || ''} · ${legacy.accountNumber}` : '-';
  const label = PAYOUT_METHODS.find((m) => m.id === p.method)?.label || p.method;
  if (p.method === 'PAYONEER') return `${label}: ${p.payoneerEmail}`;
  if (p.method === 'IBAN') return `${label}: ${p.iban}${p.swift ? ` · SWIFT ${p.swift}` : ''}${p.bankName ? ` · ${p.bankName}` : ''} · ${p.accountHolder}`;
  if (p.method === 'US_ACH') return `${label}: routing ${p.routingNumber} · account ${p.accountNumber}${p.bankName ? ` · ${p.bankName}` : ''} · ${p.accountHolder}`;
  return `${label}: ${p.bankName} · ${p.accountHolder} · ${p.accountNumber}`;
};
