import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion, X } from 'lucide-react';
import { markQuestionSeen, questionsToCheck } from '../services/myQuestions';

// "The seller answered your question": the store checks the questions this phone asked (when the store
// opens, when it comes back to the screen, and every 5 minutes) and shows a card for each new answer,
// with a button to the product. Works without email or sign-in.

interface Answered {
  id: string;
  productId: string;
  productName: string;
  answer: string;
  answeredBy?: string;
}

export const QuestionAnswerNotifier: React.FC = () => {
  const [items, setItems] = useState<Answered[]>([]);

  const check = useCallback(async () => {
    const open = questionsToCheck();
    if (!open.length || document.visibilityState !== 'visible') return;
    try {
      const r = await fetch(`/api/questions/mine?ids=${encodeURIComponent(open.map((q) => q.id).join(','))}`);
      const d = await r.json();
      const answered: Answered[] = (Array.isArray(d?.questions) ? d.questions : []).filter((q: any) => q.status === 'ANSWERED' && q.answer);
      // Removed by the store: nothing to show, stop checking it
      for (const q of Array.isArray(d?.questions) ? d.questions : []) if (q.status === 'HIDDEN') markQuestionSeen(q.id);
      if (answered.length) setItems((cur) => [...cur, ...answered.filter((a) => !cur.some((c) => c.id === a.id))]);
    } catch {
      /* try again later */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 3000);
    const every = setInterval(check, 5 * 60_000);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [check]);

  if (!items.length) return null;
  const a = items[0];
  const close = () => {
    markQuestionSeen(a.id);
    setItems((cur) => cur.slice(1));
  };
  return (
    <div className="fixed left-3 right-3 bottom-20 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px] z-[90]" role="status" aria-live="polite">
      <div className="bg-white rounded-2xl border border-[#E7E5DF] shadow-2xl p-4 space-y-2">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#E8F3EC] text-[#0B5E34] flex items-center justify-center shrink-0">
            <MessageCircleQuestion className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-[#141413]">
              The {a.answeredBy === 'STORE' ? 'store' : 'seller'} answered your question
            </p>
            <p className="text-[12px] text-[#6B6963] truncate">{a.productName}</p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="p-1 rounded-lg hover:bg-[#F2F1EC] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-[#3A3936] leading-relaxed line-clamp-3 pl-3 border-l-2 border-[#0E7A43]">{a.answer}</p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              close();
              window.location.hash = `#product/${encodeURIComponent(a.productId)}`;
            }}
            className="flex-1 py-2 rounded-lg bg-[#0E7A43] text-white text-[12.5px] font-bold cursor-pointer"
          >
            View product
          </button>
          <button type="button" onClick={close} className="px-4 py-2 rounded-lg border border-[#DCD9D2] text-[12.5px] font-semibold cursor-pointer">
            OK
          </button>
        </div>
        {items.length > 1 && <p className="text-[11px] text-[#8A8780]">{items.length - 1} more answer(s)</p>}
      </div>
    </div>
  );
};
