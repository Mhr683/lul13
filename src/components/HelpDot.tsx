import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { HELP_GUIDES as BASE_GUIDES } from '../data/helpGuides';
import { HELP_GUIDES_MORE } from '../data/helpGuidesMore';

// The detailed second-round guides replace the shorter ones with the same id
const HELP_GUIDES = { ...BASE_GUIDES, ...HELP_GUIDES_MORE };

// A small colourful "?" circle next to a function in Admin and Seller Center. Clicking it opens that
// function's guide: what it does and how to do it, step by step (src/data/helpGuides.ts). It works
// inside buttons and labels too (it is not a <button> itself and stops the click from going on).

export const HelpDot: React.FC<{ id: string; className?: string }> = ({ id, className = '' }) => {
  const [open, setOpen] = useState(false);
  const guide = HELP_GUIDES[id];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!guide) return null;

  const show = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Help: ${guide.title}`}
        title="Madad / Help"
        onClick={show}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && show(e)}
        className={`inline-flex items-center justify-center shrink-0 w-[18px] h-[18px] rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-sky-500 text-white text-[11px] font-extrabold leading-none shadow-sm ring-2 ring-white cursor-pointer hover:scale-110 transition-transform align-middle select-none ${className}`}
      >
        ?
      </span>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl text-[#141413] text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white px-5 py-4 flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-extrabold shrink-0">?</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base leading-snug">{guide.title}</p>
                  {guide.what && <p className="text-xs text-white/90 mt-1 leading-relaxed">{guide.what}</p>}
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-white/20 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4 text-sm">
                {guide.steps.length > 0 && (
                  <div>
                    <p className="font-bold text-violet-800 mb-2">Step by step:</p>
                    <ol className="space-y-2">
                      {guide.steps.map((s, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-800 text-xs font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed pt-0.5">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {guide.tips && guide.tips.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="font-bold text-amber-900 mb-1">Yaad rakhein:</p>
                    <ul className="list-disc pl-5 space-y-1 text-amber-950">
                      {guide.tips.map((t, i) => (
                        <li key={i} className="leading-relaxed">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-[#141413] text-white font-semibold cursor-pointer"
                >
                  Samajh gaya
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
