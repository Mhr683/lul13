import React, { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { auth } from '../lib/firebase';

// Like / dislike a product. One vote per customer: the signed-in account, otherwise this device.
// The totals come with the product from the catalog; the customer's own vote is remembered here.

type Vote = 'LIKE' | 'DISLIKE' | 'NONE';
const VOTER_KEY = 'voter_id_v1';
const MINE_KEY = 'my_reactions_v1';

function voterId(): string {
  try {
    let id = localStorage.getItem(VOTER_KEY);
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  } catch {
    return '0'.repeat(32);
  }
}
const readMine = (): Record<string, Vote> => {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const saveMine = (productId: string, vote: Vote) => {
  try {
    const all = readMine();
    if (vote === 'NONE') delete all[productId];
    else all[productId] = vote;
    localStorage.setItem(MINE_KEY, JSON.stringify(all));
  } catch {}
};

export const ProductReactions: React.FC<{
  productId: string;
  likes?: number;
  dislikes?: number;
  showToast?: (msg: string) => void;
}> = ({ productId, likes = 0, dislikes = 0, showToast }) => {
  const [counts, setCounts] = useState({ likes, dislikes });
  const [mine, setMine] = useState<Vote>(() => readMine()[productId] || 'NONE');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCounts({ likes, dislikes });
    setMine(readMine()[productId] || 'NONE');
  }, [productId, likes, dislikes]);

  const vote = async (clicked: 'LIKE' | 'DISLIKE') => {
    if (busy) return;
    const next: Vote = mine === clicked ? 'NONE' : clicked;
    // show it at once; corrected from the server's answer
    const prev = { counts, mine };
    setCounts((c) => ({
      likes: Math.max(0, c.likes + (next === 'LIKE' ? 1 : 0) - (mine === 'LIKE' ? 1 : 0)),
      dislikes: Math.max(0, c.dislikes + (next === 'DISLIKE' ? 1 : 0) - (mine === 'DISLIKE' ? 1 : 0)),
    }));
    setMine(next);
    setBusy(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ value: next, voterId: voterId() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save your reaction.');
      setCounts({ likes: data.likes, dislikes: data.dislikes });
      setMine(data.mine);
      saveMine(productId, data.mine);
    } catch (err: any) {
      setCounts(prev.counts);
      setMine(prev.mine);
      showToast?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const btn = (active: boolean, tone: string) =>
    `px-3 py-1.5 border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 ${
      active ? tone : 'bg-white border-black/15 text-[#141413] hover:border-black/40'
    }`;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Do you like this product?">
      <button
        type="button"
        disabled={busy}
        onClick={() => vote('LIKE')}
        aria-pressed={mine === 'LIKE'}
        className={btn(mine === 'LIKE', 'bg-emerald-600 border-emerald-600 text-white')}
      >
        <ThumbsUp className="w-4 h-4" /> {counts.likes}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => vote('DISLIKE')}
        aria-pressed={mine === 'DISLIKE'}
        className={btn(mine === 'DISLIKE', 'bg-rose-600 border-rose-600 text-white')}
      >
        <ThumbsDown className="w-4 h-4" /> {counts.dislikes}
      </button>
    </div>
  );
};
