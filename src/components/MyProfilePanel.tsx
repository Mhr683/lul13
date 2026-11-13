import React, { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, Pencil, Plus, Star, Trash2, User } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { shrinkToSquareJpeg } from '../services/imageShrink';
import { addressOneLine } from '../services/intlAddress';
import {
  deleteAddress,
  getCustomerBook,
  makeDefaultAddress,
  onCustomerBook,
  saveAddress,
  saveDetails,
  savePhoto,
  type CustomerBook,
} from '../services/customerProfile';
import { AddressForm, draftFromSaved, draftProblem, draftToPayload, emptyDraft, type AddressDraft } from './AddressForm';

// My Account: profile photo, name and mobile number, and the saved delivery addresses
// (add, change, delete, choose the default one used first at checkout).

export const useCustomerBook = (signedIn: boolean) => {
  const [book, setBook] = useState<CustomerBook | null>(null);
  useEffect(() => {
    if (!signedIn) return setBook(null);
    let live = true;
    getCustomerBook()
      .then((b) => live && setBook(b))
      .catch(() => live && setBook({ photoUrl: '', addresses: [], defaultId: '' }));
    const off = onCustomerBook((b) => live && setBook(b));
    return () => {
      live = false;
      off();
    };
  }, [signedIn]);
  return book;
};

const box = 'bg-white border border-black/[0.08] rounded-2xl';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50';

export const MyProfilePanel: React.FC = () => {
  const { firebaseUser, userProfile, refreshAccount, showToast } = useStore();
  const book = useCustomerBook(!!firebaseUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Name and mobile number
  const [editDetails, setEditDetails] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Address being added / changed
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [bad, setBad] = useState('');

  if (!firebaseUser) return null;
  const displayName = userProfile?.name || firebaseUser.displayName || '';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok);
      return true;
    } catch (err: any) {
      showToast(err.message);
      if (err.field) setBad(err.field);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    try {
      const data = await shrinkToSquareJpeg(f, 256);
      await run(() => savePhoto(data), 'Profile photo saved.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const p = draftProblem(draft);
    if (p) {
      setBad(p.field);
      return showToast(p.message);
    }
    if (await run(() => saveAddress(draftToPayload(draft)), draft.id ? 'Address updated.' : 'Address saved.')) {
      setDraft(null);
      setBad('');
    }
  };

  return (
    <section className="space-y-4">
      {/* Photo, name, mobile */}
      <div className={`${box} p-5 flex flex-col sm:flex-row sm:items-center gap-4`}>
        <div className="relative w-20 h-20 shrink-0">
          {book?.photoUrl ? (
            <img src={book.photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border border-black/10" />
          ) : (
            <span className="w-20 h-20 rounded-full bg-[#F3F2EE] border border-black/10 flex items-center justify-center">
              <User className="w-9 h-9 text-[#A8A59E]" />
            </span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#141413] text-white flex items-center justify-center border-2 border-white cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </div>
        {editDetails ? (
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="px-3 py-2.5 border border-black/20 rounded-lg text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XXXXXXXXX" type="tel" className="px-3 py-2.5 border border-black/20 rounded-lg text-sm" />
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => saveDetails(name, phone), 'Your details are saved.')) {
                    setEditDetails(false);
                    refreshAccount();
                  }
                }}
                className={`${btn} bg-[#141413] text-white`}
              >
                Save
              </button>
              <button type="button" onClick={() => setEditDetails(false)} className={`${btn} border border-black/15`}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-[#141413] truncate">{displayName || 'Your name'}</div>
            <div className="text-sm text-[#575653]">{userProfile?.phone || 'No mobile number yet'}</div>
            <div className="text-xs text-[#8A8780] truncate">{firebaseUser.email}</div>
          </div>
        )}
        {!editDetails && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setName(displayName);
                setPhone(userProfile?.phone || '');
                setEditDetails(true);
              }}
              className={`${btn} border border-black/15`}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit details
            </button>
            {book?.photoUrl && (
              <button type="button" disabled={busy} onClick={() => run(() => savePhoto(''), 'Photo removed.')} className={`${btn} text-rose-700`}>
                Remove photo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved delivery addresses */}
      <div className={`${box} p-5 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-sans font-semibold text-[#141413] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#8C6D46]" /> My delivery addresses
          </h2>
          {!draft && (book?.addresses.length || 0) < 10 && (
            <button
              type="button"
              onClick={() => {
                setBad('');
                setDraft({ ...emptyDraft(displayName, userProfile?.phone || ''), label: book?.addresses.length ? 'Other' : 'Home' });
              }}
              className={`${btn} bg-[#141413] text-white`}
            >
              <Plus className="w-3.5 h-3.5" /> Add address
            </button>
          )}
        </div>

        {draft && (
          <div className="p-4 rounded-xl border border-black/15 bg-[#FBFBF9] space-y-3">
            <div className="text-sm font-semibold">{draft.id ? 'Change address' : 'New address'}</div>
            <AddressForm value={draft} onChange={setDraft} badField={bad} />
            <label className="flex items-center gap-2 text-xs text-[#3A3936] cursor-pointer">
              <input type="checkbox" checked={!!draft.makeDefault} onChange={(e) => setDraft({ ...draft, makeDefault: e.target.checked })} />
              Use this address first at checkout
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={saveDraft} className={`${btn} bg-[#0E7A43] text-white`}>
                {busy ? 'Saving...' : 'Save address'}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={`${btn} border border-black/15`}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!book ? (
          <p className="text-xs text-[#8A8780]">Loading...</p>
        ) : book.addresses.length === 0 ? (
          !draft && <p className="text-sm text-[#575653]">No saved address yet. Add one, and next time you only choose it at checkout.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {book.addresses.map((a) => {
              const isDefault = a.id === book.defaultId;
              return (
                <li key={a.id} className={`p-4 rounded-xl border ${isDefault ? 'border-[#0E7A43] bg-emerald-50/40' : 'border-black/10'} space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#F3F2EE] text-[11px] font-bold">{a.label}</span>
                    {isDefault && <span className="px-2 py-0.5 rounded-full bg-[#0E7A43] text-white text-[11px] font-bold">Default</span>}
                  </div>
                  <div className="text-sm font-semibold text-[#141413]">{a.name}</div>
                  <div className="text-xs text-[#3A3936] leading-relaxed">{addressOneLine(a)}</div>
                  <div className="text-xs text-[#575653]">{a.phoneNumber.startsWith('+92') ? `0${a.phoneNumber.slice(3)}` : a.phoneNumber}</div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBad('');
                        setDraft({ ...draftFromSaved(a), makeDefault: isDefault });
                      }}
                      className={`${btn} border border-black/15 !py-1.5`}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    {!isDefault && (
                      <button type="button" disabled={busy} onClick={() => run(() => makeDefaultAddress(a.id), 'Default address changed.')} className={`${btn} border border-black/15 !py-1.5`}>
                        <Star className="w-3.5 h-3.5" /> Make default
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => window.confirm(`Delete the address "${a.label}: ${a.line1}"?`) && run(() => deleteAddress(a.id), 'Address deleted.')}
                      className={`${btn} text-rose-700 !py-1.5`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
