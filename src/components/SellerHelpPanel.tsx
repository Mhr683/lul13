import React, { useEffect } from 'react';
import { Headphones, X, Bot, MessageSquare, Mail, BookOpen, ShieldCheck } from 'lucide-react';

// Seller Center → Help: every way a seller gets help, in one place (top bar). The AI Assistant answers at
// once; the store team answers messages within a day; WhatsApp takes details, screenshots and voice notes.

type Props = {
  open: boolean;
  onClose: () => void;
  shopName: string;
  whatsappDigits: string;
  whatsappShown: string;
  email: string;
  waitingReplies: number;
  onAi: () => void;
  onMessageStore: () => void;
  onConversations: () => void;
  onRules: () => void;
};

export const SellerHelpButton: React.FC<{ onClick: () => void; unread?: number }> = ({ onClick, unread = 0 }) => (
  <button
    type="button"
    onClick={onClick}
    className="relative h-9 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
    title="Help: AI Assistant, store team, WhatsApp, e-mail"
    aria-label="Seller help"
  >
    <Headphones className="w-4 h-4" />
    <span className="hidden sm:inline">Help</span>
    {unread > 0 && (
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
        {unread}
      </span>
    )}
  </button>
);

export const SellerHelpPanel: React.FC<Props> = ({
  open,
  onClose,
  shopName,
  whatsappDigits,
  whatsappShown,
  email,
  waitingReplies,
  onAi,
  onMessageStore,
  onConversations,
  onRules,
}) => {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;

  const wa = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Assalam o Alaikum, I am the seller "${shopName}". My problem: `)}`
    : '';
  const go = (f: () => void) => () => {
    f();
    onClose();
  };
  const row = 'w-full p-3.5 rounded-xl border text-left flex items-start gap-3 cursor-pointer transition-colors';

  return (
    <div role="dialog" aria-modal="true" aria-label="Seller help" className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-[#141413] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-sm font-bold">Seller help</div>
              <div className="text-[11px] text-white/60">Every way to get help, in one place</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-2.5 max-h-[78vh] overflow-y-auto">
          <button type="button" onClick={go(onAi)} className={`${row} border-emerald-200 bg-emerald-50/60 hover:border-emerald-500`}>
            <Bot className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              <strong className="block text-[13px]">Ask the AI Assistant</strong>
              <span className="text-[11.5px] text-[#575653]">Answers at once, day and night: orders, stock, prices, account health, an error on a screenshot.</span>
            </span>
          </button>

          <button type="button" onClick={go(onMessageStore)} className={`${row} border-[#E7E5DF] hover:border-black`}>
            <MessageSquare className="w-5 h-5 text-[#141413] shrink-0 mt-0.5" />
            <span>
              <strong className="block text-[13px]">Message the store team</strong>
              <span className="text-[11.5px] text-[#575653]">For orders, payouts, listings or your account. The team replies within a day; you also get the reply by e-mail.</span>
            </span>
          </button>
          <button type="button" onClick={go(onConversations)} className="w-full text-left px-3 text-[11.5px] font-semibold text-[#0E7A43] underline cursor-pointer">
            My conversations with the store{waitingReplies > 0 ? ` (${waitingReplies} new reply${waitingReplies > 1 ? 'ies' : ''})` : ''} →
          </button>

          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" onClick={onClose} className={`${row} border-emerald-300 hover:border-emerald-600`}>
              <span className="w-5 h-5 shrink-0 mt-0.5 text-[17px] leading-none">📱</span>
              <span>
                <strong className="block text-[13px]">WhatsApp seller support {whatsappShown ? `(${whatsappShown})` : ''}</strong>
                <span className="text-[11.5px] text-[#575653]">Send your problem with details, screenshots or a voice note. The team replies within 24 hours.</span>
              </span>
            </a>
          )}

          {email && (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(`Seller: ${shopName}`)}`}
              onClick={onClose}
              className={`${row} border-[#E7E5DF] hover:border-black`}
            >
              <Mail className="w-5 h-5 text-[#141413] shrink-0 mt-0.5" />
              <span>
                <strong className="block text-[13px]">E-mail</strong>
                <span className="text-[11.5px] text-[#575653] break-all">{email}</span>
              </span>
            </a>
          )}

          <button type="button" onClick={go(onRules)} className={`${row} border-[#E7E5DF] hover:border-black`}>
            <ShieldCheck className="w-5 h-5 text-[#141413] shrink-0 mt-0.5" />
            <span>
              <strong className="block text-[13px]">Seller rules</strong>
              <span className="text-[11.5px] text-[#575653]">Dispatch time, returns, branded items, account health.</span>
            </span>
          </button>

          <p className="flex items-start gap-2 px-1 pt-1 text-[11px] text-[#6B6963]">
            <BookOpen className="w-4 h-4 shrink-0" />
            Every page and form has a round <strong className="mx-0.5">?</strong> next to it with step-by-step help in Roman Urdu.
          </p>
        </div>
      </div>
    </div>
  );
};
