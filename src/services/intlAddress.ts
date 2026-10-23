import { parsePhoneNumberFromString, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

// International shipping address: phone and postal-code rules that follow the selected country.
// Shared by the checkout form (browser) and order creation (server) so both check the same way.
// Phone numbers use libphonenumber (Google's numbering rules for every country).

/** Structured delivery address saved on each order (orders/{id}.shippingAddress) */
export interface ShippingAddress {
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "PK", "AE"
  countryName: string;
  line1: string; // house / building, street
  line2?: string; // apartment, floor, area (optional)
  city: string;
  state?: string; // state / province / region / emirate
  postalCode?: string;
  /** Pakistan only: tehsil / area chosen from the list */
  area?: string;
  phoneCountryCode: string; // calling code without "+", e.g. "971"
  phoneNumber: string; // E.164, e.g. "+971501234567"
  /** The country's own currency (prices are charged in PKR) */
  currency?: string;
}

// ---------------------------------------------------------------- phone

export interface PhoneCheck {
  valid: boolean;
  /** +971501234567 */
  e164: string;
  /** 050 123 4567 (as written in that country) */
  national: string;
  /** +971 50 123 4567 */
  international: string;
  callingCode: string;
  message: string;
}

/** Calling code of a country without "+" ("92" for PK), or '' if unknown */
export const callingCodeOf = (countryIso: string) => {
  try {
    return String(getCountryCallingCode(countryIso.toUpperCase() as CountryCode));
  } catch {
    return '';
  }
};

/**
 * Checks a phone number for the selected country. The number may be typed locally ("050 123 4567")
 * or with the code ("+971 50 123 4567"). Pakistan accepts mobile numbers only (couriers call/SMS them).
 */
export function checkPhone(countryIso: string, raw: string): PhoneCheck {
  const iso = String(countryIso || '').toUpperCase();
  const code = callingCodeOf(iso);
  const empty: PhoneCheck = { valid: false, e164: '', national: '', international: '', callingCode: code, message: '' };
  const text = String(raw || '').trim();
  if (!text) return { ...empty, message: 'Enter the receiver’s phone number.' };
  // (typed loosely: this TypeScript version does not pick up the library's PhoneNumber members)
  let parsed: any;
  try {
    parsed = parsePhoneNumberFromString(text, iso as CountryCode);
  } catch {
    parsed = undefined;
  }
  if (!parsed || !parsed.isValid()) {
    return { ...empty, message: `This is not a valid phone number for the selected country (+${code}).` };
  }
  if (parsed.country && parsed.country !== iso && !(iso === 'GB' && ['GG', 'JE', 'IM'].includes(parsed.country))) {
    return { ...empty, message: `This number is from another country (+${parsed.countryCallingCode}). Choose that country or enter a +${code} number.` };
  }
  // Pakistani mobiles are 3XX XXXXXXX after the code (the small metadata has no number types)
  if (iso === 'PK' && !/^3\d{9}$/.test(String(parsed.nationalNumber))) {
    return { ...empty, message: 'Enter a Pakistani mobile number (03XX XXXXXXX): couriers call and SMS it.' };
  }
  return {
    valid: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    international: parsed.formatInternational(),
    callingCode: String(parsed.countryCallingCode),
    message: `Valid ${iso} number: ${parsed.formatInternational()}`,
  };
}

// ---------------------------------------------------------------- postal / ZIP code

export interface PostalRule {
  /** false = the country has no postal codes (the field is hidden) */
  used: boolean;
  /** true = must be filled in */
  required: boolean;
  regex?: RegExp;
  example?: string;
  label: string;
}

// Countries without a postal-code system (or where it is not used for deliveries)
const NO_POSTAL = new Set([
  'AE', 'QA', 'HK', 'MO', 'AO', 'AG', 'AW', 'BS', 'BZ', 'BJ', 'BO', 'BW', 'BF', 'BI', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CK', 'CI',
  'DJ', 'DM', 'GQ', 'ER', 'FJ', 'GM', 'GH', 'GD', 'GY', 'KI', 'KP', 'ML', 'MR', 'MS', 'NR', 'NU', 'RW', 'KN', 'LC', 'ST', 'SC',
  'SL', 'SB', 'SR', 'SY', 'TG', 'TK', 'TO', 'TT', 'TV', 'UG', 'VU', 'YE', 'ZW', 'PA', 'JM', 'SO', 'TL', 'MW', 'LY', 'GA',
]);

// [regex, example, label] for countries whose format is well known; others accept 2-10 letters / digits
const POSTAL: Record<string, [RegExp, string, string?]> = {
  PK: [/^\d{5}$/, '54000', 'Postal code'],
  US: [/^\d{5}(-\d{4})?$/, '10022', 'ZIP code'],
  GB: [/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, 'SW1A 1AA', 'Postcode'],
  CA: [/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, 'M5R 2G3'],
  AU: [/^\d{4}$/, '2000', 'Postcode'],
  NZ: [/^\d{4}$/, '1010'],
  IN: [/^\d{6}$/, '110001', 'PIN code'],
  SA: [/^\d{5}(-\d{4})?$/, '12271'],
  KW: [/^\d{5}$/, '13001'],
  OM: [/^\d{3}$/, '100'],
  BH: [/^\d{3,4}$/, '317'],
  JO: [/^\d{5}$/, '11118'],
  IQ: [/^\d{5}$/, '10001'],
  IR: [/^\d{5}-?\d{5}$/, '1193653471'],
  AF: [/^\d{4}$/, '1001'],
  BD: [/^\d{4}$/, '1000'],
  LK: [/^\d{5}$/, '00100'],
  NP: [/^\d{5}$/, '44600'],
  MY: [/^\d{5}$/, '50050'],
  SG: [/^\d{6}$/, '018956'],
  ID: [/^\d{5}$/, '10110'],
  PH: [/^\d{4}$/, '1000'],
  TH: [/^\d{5}$/, '10200'],
  CN: [/^\d{6}$/, '100000'],
  JP: [/^\d{3}-?\d{4}$/, '104-0061'],
  KR: [/^\d{5}$/, '04524'],
  TR: [/^\d{5}$/, '34000'],
  EG: [/^\d{5}$/, '11511'],
  MA: [/^\d{5}$/, '10000'],
  NG: [/^\d{6}$/, '100001'],
  KE: [/^\d{5}$/, '00100'],
  ZA: [/^\d{4}$/, '8001'],
  DE: [/^\d{5}$/, '10115', 'Postleitzahl'],
  FR: [/^\d{5}$/, '75008'],
  IT: [/^\d{5}$/, '00184'],
  ES: [/^\d{5}$/, '28001'],
  NL: [/^\d{4}\s?[A-Z]{2}$/i, '1012 AB'],
  BE: [/^\d{4}$/, '1000'],
  CH: [/^\d{4}$/, '8001'],
  AT: [/^\d{4}$/, '1010'],
  SE: [/^\d{3}\s?\d{2}$/, '111 22'],
  NO: [/^\d{4}$/, '0150'],
  DK: [/^\d{4}$/, '1050'],
  FI: [/^\d{5}$/, '00100'],
  PL: [/^\d{2}-?\d{3}$/, '00-001'],
  PT: [/^\d{4}-?\d{3}$/, '1000-001'],
  IE: [/^[A-Z]\d[\dW]\s?[A-Z\d]{4}$/i, 'D02 X285', 'Eircode'],
  RU: [/^\d{6}$/, '101000'],
  BR: [/^\d{5}-?\d{3}$/, '01001-000', 'CEP'],
  MX: [/^\d{5}$/, '06000'],
  AR: [/^[A-Z]?\d{4}([A-Z]{3})?$/i, 'C1002'],
};

// Optional where many people do not use one for deliveries
const OPTIONAL_POSTAL = new Set(['PK', 'IE', 'SA', 'KW', 'OM', 'BH', 'JO', 'IQ', 'AF', 'BD', 'LK', 'NP', 'EG', 'MA', 'NG', 'KE', 'PH', 'ID']);

export function postalRuleFor(countryIso: string): PostalRule {
  const iso = String(countryIso || '').toUpperCase();
  if (NO_POSTAL.has(iso)) return { used: false, required: false, label: 'Postal code' };
  const rule = POSTAL[iso];
  return {
    used: true,
    required: !OPTIONAL_POSTAL.has(iso),
    regex: rule ? rule[0] : /^[A-Za-z0-9][A-Za-z0-9\s-]{1,9}$/,
    example: rule ? rule[1] : '',
    label: rule?.[2] || 'Postal / ZIP code',
  };
}

export function checkPostal(countryIso: string, raw: string): { valid: boolean; value: string; message: string } {
  const rule = postalRuleFor(countryIso);
  const value = String(raw || '').trim().toUpperCase().replace(/\s{2,}/g, ' ');
  if (!rule.used) return { valid: true, value: '', message: 'This country does not use postal codes.' };
  if (!value) return rule.required ? { valid: false, value, message: `Enter the ${rule.label}${rule.example ? ` (e.g. ${rule.example})` : ''}.` } : { valid: true, value, message: `${rule.label} (optional)` };
  if (rule.regex && !rule.regex.test(value)) {
    return { valid: false, value, message: `This ${rule.label} does not look right for the selected country${rule.example ? ` (e.g. ${rule.example})` : ''}.` };
  }
  return { valid: true, value, message: `Valid ${rule.label}` };
}

// ---------------------------------------------------------------- whole address

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Checks and tidies an address (both in the browser and on the server). Returns the cleaned
 * address, or the first problem as a customer-facing message.
 */
export function checkShippingAddress(
  raw: Partial<ShippingAddress> & { phone?: string },
  opts: { countryName?: string; currency?: string } = {}
): { ok: true; address: ShippingAddress } | { ok: false; field: string; message: string } {
  const countryCode = clean(raw.countryCode, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode) || !callingCodeOf(countryCode)) return { ok: false, field: 'country', message: 'Choose the delivery country.' };
  const line1 = clean(raw.line1, 200);
  if (line1.length < 5 || !/[A-Za-z؀-ۿ]/.test(line1)) {
    return { ok: false, field: 'line1', message: 'Enter the full address: house / building number and street (at least 5 characters).' };
  }
  const city = clean(raw.city, 80);
  if (city.length < 2) return { ok: false, field: 'city', message: 'Enter the city.' };
  const postal = checkPostal(countryCode, String(raw.postalCode || ''));
  if (!postal.valid) return { ok: false, field: 'postalCode', message: postal.message };
  const phone = checkPhone(countryCode, String(raw.phoneNumber || raw.phone || ''));
  if (!phone.valid) return { ok: false, field: 'phone', message: phone.message };
  return {
    ok: true,
    address: {
      countryCode,
      countryName: clean(raw.countryName || opts.countryName || countryCode, 60),
      line1,
      ...(clean(raw.line2, 120) ? { line2: clean(raw.line2, 120) } : {}),
      city,
      ...(clean(raw.state, 80) ? { state: clean(raw.state, 80) } : {}),
      ...(postal.value ? { postalCode: postal.value } : {}),
      ...(clean(raw.area, 80) ? { area: clean(raw.area, 80) } : {}),
      phoneCountryCode: phone.callingCode,
      phoneNumber: phone.e164,
      ...(clean(raw.currency || opts.currency, 3) ? { currency: clean(raw.currency || opts.currency, 3).toUpperCase() } : {}),
    },
  };
}

/** One line for labels, emails and the courier: "Flat 4, Al Barsha 1, Dubai, Dubai, United Arab Emirates" */
export const addressOneLine = (a: ShippingAddress) =>
  [a.line1, a.line2, a.area, a.city, a.state && a.state !== a.city ? a.state : '', a.postalCode, a.countryName].filter(Boolean).join(', ');
