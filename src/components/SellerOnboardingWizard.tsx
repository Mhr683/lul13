import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { RecaptchaVerifier, linkWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import { ALL_WORLD_COUNTRIES } from '../services/addressAndPaymentVerification';
import { callingCodeOf, checkPhone } from '../services/intlAddress';
import { PAYOUT_METHODS, type PayoutDetails, type SellerType } from '../services/vendorRules';
import { KYC_LABELS, KYC_MAX_BYTES, idDocTypeFor, requiredKyc, type IdDocType, type KycKind } from '../services/sellerOnboarding';
import { PolicyDocument } from './PolicyDocument';
import { SUPPLIER_CODE } from '../data/policies';

// Seller sign-up in four steps (shop → identity → warehouse & payout → review), with a progress bar.
// What is typed is kept on this device until the application is sent, so a seller can stop and
// come back. ID documents go to private storage on the server; the mobile number is confirmed with
// an SMS code when the store has switched that on (/api/seller/onboarding-config).

const inputCls = 'w-full px-3 py-2 bg-white border border-black/20 text-xs text-[#141413] focus:border-black focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-[#141413] mb-1';

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Please sign in again.');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { code: data?.code });
  return data as T;
}

type Form = {
  sellerType: SellerType;
  countryCode: string;
  shopName: string;
  ownerName: string;
  businessName: string;
  phone: string;
  city: string;
  idDocType: IdDocType;
  idNumber: string;
  taxId: string;
  address: string;
  warehouseCountry: string;
  warehouseCity: string;
};
type Draft = { form: Form; payout: PayoutDetails; kycDocs: Partial<Record<KycKind, string>>; step: number };

const STEPS = ['Your shop', 'Identity', 'Warehouse & payout', 'Review & send'];

/** One document: pick or photograph it, it uploads at once */
const DocUpload: React.FC<{ kind: KycKind; value?: string; onDone: (ref: string) => void }> = ({ kind, value, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (file.size > KYC_MAX_BYTES) return setError('The file is too large (8 MB at most).');
    setBusy(true);
    try {
      const d = await call<{ ref: string }>(`/api/seller/kyc/upload?kind=${kind}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
      onDone(d.ref);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={`block p-3 border-2 border-dashed cursor-pointer text-center ${value ? 'border-emerald-500 bg-emerald-50/50' : 'border-black/20 hover:border-black/40 bg-[#FBFBF9]'}`}>
      <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      {preview ? (
        <img src={preview} alt="" className="mx-auto h-20 object-contain mb-1" />
      ) : busy ? (
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#575653]" />
      ) : value ? (
        <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600" />
      ) : (
        <FileUp className="w-6 h-6 mx-auto text-[#575653]" />
      )}
      <span className="block text-[11px] font-bold mt-1">{KYC_LABELS[kind]} *</span>
      <span className="block text-[10px] text-[#575653]">{value ? 'Uploaded ✓ (tap to change)' : 'Photo or PDF, clear and readable'}</span>
      {error && <span className="block text-[10px] text-rose-700 font-semibold mt-1">{error}</span>}
    </label>
  );
};

/** Sends an SMS code to the number and links it to the signed-in account */
const PhoneVerify: React.FC<{ e164: string; verified: boolean; onVerified: () => void }> = ({ e164, verified, onVerified }) => {
  const [sent, setSent] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  useEffect(() => () => verifier.current?.clear(), []);
  if (verified) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
        <CheckCircle2 className="w-4 h-4" /> Mobile number verified
      </div>
    );
  }
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!verifier.current) verifier.current = new RecaptchaVerifier(auth, 'seller-otp-recaptcha', { size: 'invisible' });
      setSent(await linkWithPhoneNumber(auth.currentUser!, e164, verifier.current));
    } catch (err: any) {
      setError(
        err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/provider-already-linked'
          ? 'This number is already used by another account.'
          : err?.code === 'auth/too-many-requests'
          ? 'Too many tries. Please wait a while and try again.'
          : err?.code === 'auth/operation-not-allowed'
          ? 'SMS verification is not switched on yet. Please contact the store.'
          : 'Could not send the SMS. Check the number and try again.'
      );
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!sent) return;
    setBusy(true);
    setError(null);
    try {
      await sent.confirm(code.trim());
      await auth.currentUser?.getIdToken(true); // the server reads the number from a fresh token
      onVerified();
    } catch {
      setError('Wrong or expired code. Please check the SMS and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p-2.5 bg-amber-50 border border-amber-300 space-y-2">
      <div id="seller-otp-recaptcha" />
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
        <Smartphone className="w-4 h-4" /> Verify your mobile number with an SMS code
      </div>
      {!sent ? (
        <button type="button" onClick={send} disabled={busy || !e164} className="px-3 py-1.5 bg-[#141413] text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer">
          {busy ? 'Sending…' : `Send code to ${e164 || 'your number'}`}
        </button>
      ) : (
        <div className="flex gap-2">
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
          <button type="button" onClick={confirm} disabled={busy || code.length < 6} className="px-3 py-1.5 bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer whitespace-nowrap">
            {busy ? 'Checking…' : 'Verify'}
          </button>
        </div>
      )}
      {error && <div className="text-[11px] text-rose-700 font-semibold">{error}</div>}
    </div>
  );
};

export const SellerOnboardingWizard: React.FC<{
  uid: string;
  storeName: string;
  rejectedReason: string;
  emailVerified: boolean;
  defaultName: string;
  onResendVerification: () => void;
  onRecheck: () => void;
  onSubmitted: () => void;
}> = ({ uid, storeName, rejectedReason, emailVerified, defaultName, onResendVerification, onRecheck, onSubmitted }) => {
  const { showToast } = useStore();
  const draftKey = `seller_apply_draft_v1:${uid}`;
  const saved = useMemo<Draft | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || 'null');
    } catch {
      return null;
    }
  }, [draftKey]);
  const [form, setForm] = useState<Form>(
    saved?.form || {
      sellerType: 'INDIVIDUAL',
      countryCode: 'PK',
      shopName: '',
      ownerName: defaultName,
      businessName: '',
      phone: '',
      city: '',
      idDocType: 'CNIC',
      idNumber: '',
      taxId: '',
      address: '',
      warehouseCountry: 'PK',
      warehouseCity: '',
    }
  );
  const [payout, setPayout] = useState<PayoutDetails>(saved?.payout || { method: 'PK_BANK', accountHolder: '' });
  const [kycDocs, setKycDocs] = useState<Partial<Record<KycKind, string>>>(saved?.kycDocs || {});
  const [step, setStep] = useState(Math.min(saved?.step || 0, STEPS.length - 1));
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [phoneOtp, setPhoneOtp] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState(auth.currentUser?.phoneNumber || '');

  useEffect(() => {
    fetch('/api/seller/onboarding-config')
      .then((r) => r.json())
      .then((d) => setPhoneOtp(!!d.phoneOtp))
      .catch(() => {});
  }, []);
  // Keep the draft on this device (ID numbers stay on the seller's own device until sent)
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ form, payout, kycDocs, step } as Draft));
    } catch {}
  }, [draftKey, form, payout, kycDocs, step]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPay = (k: keyof PayoutDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setPayout((p) => ({ ...p, [k]: e.target.value }));
  const isPk = form.countryCode === 'PK';
  const dial = callingCodeOf(form.countryCode);
  const phoneCheck = checkPhone(form.countryCode, form.phone);
  const phoneOk = phoneCheck.valid;
  const phoneVerified = phoneOk && verifiedPhone === phoneCheck.e164;
  const idType = idDocTypeFor(form.countryCode, form.idDocType);
  const docsNeeded = requiredKyc(form.countryCode, form.sellerType, idType);
  const taxLabel =
    ({ PK: 'NTN', AE: 'TRN (VAT)', SA: 'VAT number', GB: 'VAT number', US: 'EIN', IN: 'GSTIN', CA: 'Business Number' } as Record<string, string>)[form.countryCode] ||
    'Tax ID / VAT number';
  const chooseCountry = (code: string) => {
    setForm((f) => ({ ...f, countryCode: code, warehouseCountry: code, idDocType: code === 'PK' ? 'CNIC' : f.idDocType === 'CNIC' ? 'NATIONAL_ID' : f.idDocType }));
    setPayout((p) => ({ ...p, method: code === 'PK' ? 'PK_BANK' : code === 'US' ? 'US_ACH' : 'IBAN' }));
  };

  // What is still missing on each step (the server checks everything again)
  const missing = (s: number): string | null => {
    if (s === 0) {
      if (form.shopName.trim().length < 3) return 'Enter a shop name (at least 3 letters).';
      if (form.ownerName.trim().length < 3) return 'Enter your full name.';
      if (form.sellerType === 'BUSINESS' && form.businessName.trim().length < 3) return 'Enter the registered business name.';
      if (!phoneOk) return `Enter a valid mobile number for ${ALL_WORLD_COUNTRIES.find((c) => c.isoCode === form.countryCode)?.name || 'your country'}.`;
      if (phoneOtp && !phoneVerified) return 'Verify your mobile number with the SMS code.';
      if (form.city.trim().length < 2) return 'Enter your city.';
    }
    if (s === 1) {
      if (isPk ? form.idNumber.replace(/\D/g, '').length !== 13 : form.idNumber.trim().length < 5) return isPk ? 'Enter your 13-digit CNIC.' : 'Enter your ID / passport number.';
      if (form.sellerType === 'BUSINESS' && form.taxId.trim().length < 3) return `Enter the ${taxLabel}.`;
      const doc = docsNeeded.find((k) => !kycDocs[k]);
      if (doc) return `Upload: ${KYC_LABELS[doc]}.`;
      if (form.address.trim().length < 8) return 'Enter your full business address.';
    }
    if (s === 2) {
      if (form.warehouseCity.trim().length < 2) return 'Enter the warehouse city.';
      if (payout.method === 'PAYONEER' ? !payout.payoneerEmail : !payout.accountHolder?.trim()) return 'Fill in your payout details.';
      if (payout.method === 'PK_BANK' && (!payout.bankName || !payout.accountNumber)) return 'Enter the bank and account number / IBAN.';
      if (payout.method === 'IBAN' && !payout.iban) return 'Enter your IBAN.';
      if (payout.method === 'US_ACH' && (!payout.routingNumber || !payout.accountNumber)) return 'Enter the routing and account numbers.';
    }
    return null;
  };
  const next = () => {
    const m = missing(step);
    setProblem(m);
    if (!m) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const submit = async () => {
    for (let s = 0; s < 3; s++) {
      const m = missing(s);
      if (m) {
        setStep(s);
        return setProblem(m);
      }
    }
    if (!agreed) return setProblem('Please confirm the details and accept the seller rules.');
    setSaving(true);
    setProblem(null);
    try {
      await call('/api/seller/apply', { method: 'POST', body: JSON.stringify({ ...form, idDocType: idType, payout, kycDocs }) });
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      showToast('Application sent. We will review it soon.');
      onSubmitted();
    } catch (err: any) {
      setProblem(err.message);
    } finally {
      setSaving(false);
    }
  };

  const countryName = (iso: string) => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === iso)?.name || iso;
  const payoutLabel = PAYOUT_METHODS.find((m) => m.id === payout.method)?.label || payout.method;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-display">Open your shop on {storeName}</h1>
        <p className="text-xs text-[#575653]">
          Four short steps. Your ID, documents and bank details are seen only by the store team, for verification and payouts.
          What you type is kept on this device until you send it.
        </p>
      </div>

      {/* Progress */}
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => i < step && setStep(i)} className={`w-full text-left ${i < step ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-[#0E7A43]' : 'bg-black/10'}`} />
              <span className={`block mt-1 text-[10px] sm:text-[11px] font-bold ${i === step ? 'text-[#0E7A43]' : 'text-[#575653]'}`}>
                {i + 1}. {label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {rejectedReason && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs">
          Your previous application was not accepted: <strong>{rejectedReason}</strong>. Please correct the details and apply again.
        </div>
      )}
      {!emailVerified && (
        <div className="p-3 bg-amber-50 border border-amber-400 text-amber-950 text-xs space-y-2">
          <p>Please verify your email: click the link we sent to your inbox (or spam folder). You can fill in the steps meanwhile.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onResendVerification} className="px-3 py-1.5 border border-amber-500 font-semibold cursor-pointer">
              Resend email
            </button>
            <button type="button" onClick={onRecheck} className="px-3 py-1.5 bg-[#141413] text-white font-semibold cursor-pointer">
              I have verified it
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-black/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {step === 0 && (
          <>
            <div className="sm:col-span-2">
              <span className={labelCls}>I am selling as *</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['INDIVIDUAL', 'Individual', 'A person selling under their own name'],
                    ['BUSINESS', 'Business / company', 'A registered business (tax number needed)'],
                  ] as const
                ).map(([v, t, h]) => (
                  <label key={v} className={`p-2.5 border cursor-pointer flex gap-2 ${form.sellerType === v ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15'}`}>
                    <input type="radio" name="sellerType" checked={form.sellerType === v} onChange={() => setForm((f) => ({ ...f, sellerType: v }))} className="mt-0.5" />
                    <span>
                      <span className="block text-xs font-bold">{t}</span>
                      <span className="block text-[11px] text-[#575653]">{h}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Country of operation *</label>
              <select className={inputCls} value={form.countryCode} onChange={(e) => chooseCountry(e.target.value)}>
                {ALL_WORLD_COUNTRIES.map((c) => (
                  <option key={c.isoCode} value={c.isoCode}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Shop name *</label>
              <input className={inputCls} value={form.shopName} onChange={set('shopName')} placeholder="e.g. Ali Electronics" />
            </div>
            <div>
              <label className={labelCls}>Your full name (as on your ID) *</label>
              <input className={inputCls} value={form.ownerName} onChange={set('ownerName')} />
            </div>
            {form.sellerType === 'BUSINESS' && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Registered business name *</label>
                <input className={inputCls} value={form.businessName} onChange={set('businessName')} placeholder="As on your trade licence / registration" />
              </div>
            )}
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Mobile number *</label>
                <div className="flex">
                  <span className="shrink-0 px-2.5 py-2 border border-r-0 border-black/20 bg-[#F4F3EF] text-xs font-mono font-semibold">+{dial}</span>
                  <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder={isPk ? '03XXXXXXXXX' : 'Local mobile number'} inputMode="tel" />
                </div>
                {form.phone && !phoneOk && <span className="block text-[10px] text-rose-700 mt-1">{phoneCheck.message || 'Not a valid mobile number for this country.'}</span>}
              </div>
              <div>
                <label className={labelCls}>City *</label>
                <input className={inputCls} value={form.city} onChange={set('city')} placeholder={isPk ? 'e.g. Lahore' : 'e.g. Dubai'} />
              </div>
            </div>
            {phoneOtp && phoneOk && (
              <div className="sm:col-span-2">
                <PhoneVerify e164={phoneCheck.e164} verified={phoneVerified} onVerified={() => setVerifiedPhone(auth.currentUser?.phoneNumber || phoneCheck.e164)} />
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            {!isPk && (
              <div className="sm:col-span-2">
                <span className={labelCls}>ID document *</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['NATIONAL_ID', 'National ID card', 'Front and back'],
                      ['PASSPORT', 'Passport', 'Photo page'],
                    ] as const
                  ).map(([v, t, h]) => (
                    <label key={v} className={`p-2.5 border cursor-pointer flex gap-2 ${idType === v ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15'}`}>
                      <input type="radio" name="idDocType" checked={idType === v} onChange={() => setForm((f) => ({ ...f, idDocType: v }))} className="mt-0.5" />
                      <span>
                        <span className="block text-xs font-bold">{t}</span>
                        <span className="block text-[11px] text-[#575653]">{h}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>{isPk ? 'CNIC number *' : idType === 'PASSPORT' ? 'Passport number *' : 'National ID number *'}</label>
              <input className={inputCls} value={form.idNumber} onChange={set('idNumber')} placeholder={isPk ? 'XXXXX-XXXXXXX-X' : 'As on your document'} />
            </div>
            <div>
              <label className={labelCls}>
                {taxLabel} {form.sellerType === 'BUSINESS' ? '*' : '(optional)'}
              </label>
              <input className={inputCls} value={form.taxId} onChange={set('taxId')} />
            </div>
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {docsNeeded.map((k) => (
                <DocUpload key={k} kind={k} value={kycDocs[k]} onDone={(ref) => setKycDocs((d) => ({ ...d, [k]: ref }))} />
              ))}
            </div>
            <p className="sm:col-span-2 flex items-start gap-1.5 text-[10px] text-[#575653]">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
              Documents are stored privately and only the store team can open them, to confirm who you are. The name must match your shop owner name.
            </p>
            <div className="sm:col-span-2">
              <label className={labelCls}>Business address *</label>
              <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="sm:col-span-2 text-xs font-bold">Warehouse (orders ship from here)</div>
            <div>
              <label className={labelCls}>Warehouse country *</label>
              <select className={inputCls} value={form.warehouseCountry} onChange={set('warehouseCountry')}>
                {ALL_WORLD_COUNTRIES.map((c) => (
                  <option key={c.isoCode} value={c.isoCode}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Warehouse city *</label>
              <input className={inputCls} value={form.warehouseCity} onChange={set('warehouseCity')} placeholder="City" />
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-black/10 space-y-2">
              <div className="text-xs font-bold">How you get paid *</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAYOUT_METHODS.map((m) => (
                  <label key={m.id} className={`p-2.5 border cursor-pointer flex gap-2 ${payout.method === m.id ? 'border-[#0E7A43] bg-[#0E7A43]/[0.06]' : 'border-black/15'}`}>
                    <input type="radio" name="payoutMethod" checked={payout.method === m.id} onChange={() => setPayout((p) => ({ ...p, method: m.id }))} className="mt-0.5" />
                    <span>
                      <span className="block text-xs font-bold">{m.label}</span>
                      <span className="block text-[11px] text-[#575653]">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {payout.method !== 'PAYONEER' && (
              <div>
                <label className={labelCls}>Account holder name *</label>
                <input className={inputCls} value={payout.accountHolder} onChange={setPay('accountHolder')} />
              </div>
            )}
            {payout.method !== 'PAYONEER' && (
              <div>
                <label className={labelCls}>Bank {payout.method === 'PK_BANK' ? '/ wallet *' : '(optional)'}</label>
                <input className={inputCls} value={payout.bankName || ''} onChange={setPay('bankName')} placeholder={payout.method === 'PK_BANK' ? 'e.g. MCB, Meezan, NayaPay' : 'e.g. Emirates NBD'} />
              </div>
            )}
            {payout.method === 'PK_BANK' && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Account number / IBAN *</label>
                <input className={inputCls} value={payout.accountNumber || ''} onChange={setPay('accountNumber')} placeholder="PK36SCBL0000001123456702" />
              </div>
            )}
            {payout.method === 'IBAN' && (
              <>
                <div>
                  <label className={labelCls}>IBAN *</label>
                  <input className={inputCls} value={payout.iban || ''} onChange={setPay('iban')} placeholder="AE07 0331 2345 6789 0123 456" />
                </div>
                <div>
                  <label className={labelCls}>SWIFT / BIC (optional)</label>
                  <input className={inputCls} value={payout.swift || ''} onChange={setPay('swift')} placeholder="EBILAEAD" />
                </div>
              </>
            )}
            {payout.method === 'US_ACH' && (
              <>
                <div>
                  <label className={labelCls}>Routing number *</label>
                  <input className={inputCls} value={payout.routingNumber || ''} onChange={setPay('routingNumber')} placeholder="9 digits" inputMode="numeric" />
                </div>
                <div>
                  <label className={labelCls}>Account number *</label>
                  <input className={inputCls} value={payout.accountNumber || ''} onChange={setPay('accountNumber')} inputMode="numeric" />
                </div>
              </>
            )}
            {payout.method === 'PAYONEER' && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Payoneer account email *</label>
                <input className={inputCls} type="email" value={payout.payoneerEmail || ''} onChange={setPay('payoneerEmail')} />
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <div className="sm:col-span-2 space-y-3 text-xs">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
              <dt className="text-[#575653]">Shop</dt>
              <dd className="font-semibold">{form.shopName}</dd>
              <dt className="text-[#575653]">Owner</dt>
              <dd>
                {form.ownerName} · {form.sellerType === 'BUSINESS' ? `Business (${form.businessName})` : 'Individual'}
              </dd>
              <dt className="text-[#575653]">Country</dt>
              <dd>
                {countryName(form.countryCode)} · {form.city}
              </dd>
              <dt className="text-[#575653]">Mobile</dt>
              <dd>
                {phoneCheck.e164 || form.phone} {phoneVerified ? <span className="text-emerald-700 font-bold">✓ verified</span> : null}
              </dd>
              <dt className="text-[#575653]">ID</dt>
              <dd>
                {form.idNumber} · {docsNeeded.map((k) => (kycDocs[k] ? `${KYC_LABELS[k]} ✓` : `${KYC_LABELS[k]} missing`)).join(' · ')}
              </dd>
              <dt className="text-[#575653]">Ships from</dt>
              <dd>
                {countryName(form.warehouseCountry)} · {form.warehouseCity}
              </dd>
              <dt className="text-[#575653]">Payout</dt>
              <dd>{payoutLabel}</dd>
            </dl>
            <details className="border border-black/10">
              <summary className="px-3 py-2 font-bold cursor-pointer">Seller rules (Supplier Code of Conduct)</summary>
              <div className="px-3 pb-3 max-h-64 overflow-y-auto">
                <PolicyDocument intro={SUPPLIER_CODE.intro} sections={SUPPLIER_CODE.sections} compact />
              </div>
            </details>
            <label className="flex items-start gap-2 p-2.5 bg-[#F7F6F2] border border-black/10 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>
                I confirm these details and documents are true and mine, and I accept the seller rules of {storeName}. A false document
                closes the shop.
              </span>
            </label>
          </div>
        )}
      </div>

      {problem && <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">{problem}</div>}

      <div className="flex items-center gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="px-4 py-2.5 border border-black/20 bg-white text-xs font-bold flex items-center gap-1 cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className="flex-1 py-2.5 bg-[#141413] text-white text-sm font-bold flex items-center justify-center gap-1 cursor-pointer">
            Next: {STEPS[step + 1]} <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={saving || !emailVerified}
            className="flex-1 py-2.5 bg-[#0E7A43] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
            title={!emailVerified ? 'Verify your email first' : undefined}
          >
            {saving ? 'Sending…' : emailVerified ? 'Send application' : 'Verify your email to send'}
          </button>
        )}
      </div>
    </div>
  );
};
