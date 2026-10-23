import React, { useEffect, useRef, useState } from 'react';
import { BellPlus, BellRing, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { forgetShopInfo } from './SellerRating';

// "Follow store" button for shop pages and product pages. Following takes an email (the signed-in
// customer's by default); the shop's new products are emailed, with an unfollow link in every email.
// Which shops this browser follows is remembered on the device. Server: server/follows.ts

const KEY = 'store_followed_shops_v1';
type Followed = Record<string, string>; // sellerId -> email

const readFollowed = (): Followed => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const writeFollowed = (f: Followed) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {}
};

async function call(path: string, email: string) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data;
}

export const FollowStoreButton: React.FC<{
  sellerId: string;
  shopName: string;
  followers?: number;
  size?: 'sm' | 'md';
  onChange?: (following: boolean) => void;
  showToast?: (msg: string) => void;
}> = ({ sellerId, shopName, followers, size = 'md', onChange, showToast }) => {
  const [email, setEmail] = useState(() => readFollowed()[sellerId] || '');
  const [following, setFollowing] = useState(() => Boolean(readFollowed()[sellerId]));
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState<number | undefined>(followers);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = readFollowed();
    setFollowing(Boolean(f[sellerId]));
    setEmail(f[sellerId] || '');
  }, [sellerId]);
  useEffect(() => setCount(followers), [followers]);

  const follow = async (address: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await call(`/api/shops/${encodeURIComponent(sellerId)}/follow`, address);
      writeFollowed({ ...readFollowed(), [sellerId]: address });
      setEmail(address);
      setFollowing(true);
      setAsking(false);
      if (!r.already && count !== undefined) setCount(count + 1);
      forgetShopInfo(sellerId);
      onChange?.(true);
      showToast?.(`You follow ${shopName}. We will email you about new products.`);
    } catch (err: any) {
      setError(err.message);
      // signed-in customers follow in one tap, so there is no box to show the error in
      if (!asking) showToast?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unfollow = async () => {
    setBusy(true);
    try {
      await call(`/api/shops/${encodeURIComponent(sellerId)}/unfollow`, email);
      const f = readFollowed();
      delete f[sellerId];
      writeFollowed(f);
      setFollowing(false);
      if (count) setCount(count - 1);
      forgetShopInfo(sellerId);
      onChange?.(false);
      showToast?.(`You no longer follow ${shopName}.`);
    } catch (err: any) {
      showToast?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const signedIn = auth.currentUser?.email;
    if (signedIn) return follow(signedIn.toLowerCase());
    setDraft('');
    setError('');
    setAsking(true);
  };

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-xs';
  return (
    <div className="relative inline-flex flex-col items-start" ref={boxRef}>
      <div className="inline-flex items-center gap-2">
        {following ? (
          <button
            type="button"
            disabled={busy}
            onClick={unfollow}
            title={`Following as ${email}. Click to unfollow.`}
            className={`${pad} font-bold border border-[#0E7A43] bg-[#0E7A43]/10 text-[#0E7A43] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 group`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className={`${pad} font-bold bg-[#0E7A43] text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 hover:bg-[#0B6336]`}
          >
            <BellPlus className="w-3.5 h-3.5" /> {busy ? '...' : 'Follow store'}
          </button>
        )}
        {count !== undefined && count > 0 && (
          <span className="text-[11px] text-[#575653]">
            {count.toLocaleString('en-PK')} {count === 1 ? 'follower' : 'followers'}
          </span>
        )}
      </div>
      {asking && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            follow(draft.trim().toLowerCase());
          }}
          className="absolute z-30 top-full left-0 mt-2 w-72 p-3 bg-white border border-black/15 shadow-lg space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-[#141413]">
              Get an email when <strong>{shopName}</strong> adds new products.
            </p>
            <button type="button" onClick={() => setAsking(false)} aria-label="Close" className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="email"
            required
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your email address"
            className="w-full px-3 py-2 border border-black/20 text-sm focus:border-black focus:outline-none"
          />
          {error && <p className="text-[11px] text-rose-700 font-semibold">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-2 bg-[#0E7A43] text-white text-xs font-bold cursor-pointer disabled:opacity-50">
            {busy ? 'Following...' : 'Follow'}
          </button>
          <p className="text-[10px] text-[#787774]">Every email has an unfollow link. We do not share your email.</p>
        </form>
      )}
    </div>
  );
};
