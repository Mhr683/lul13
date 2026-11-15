import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Copy, AlertTriangle } from 'lucide-react';
import { browserEnv, openInChromeUrl } from '../services/browserEnv';

// Part of the install box: a one-tap way out of browsers that cannot install the app (WhatsApp /
// Facebook / Instagram in-app browsers, Samsung / Mi browsers, Chrome on iPhone), and fixes for
// every common install problem, in simple Roman Urdu.

type Problem = { q: string; a: string[] };

const ANDROID: Problem[] = [
  {
    q: 'Menu mein "Install app" ya "Add to Home screen" nahi hai',
    a: [
      'Page Chrome mein khula hona chahiye (WhatsApp / Facebook ke andar nahi). Upar "Chrome mein kholein" dabayein.',
      'Page 2 dafa refresh karein, 5 second ruk kar dobara ⋮ menu dekhein.',
      'Ho sakta hai app pehle se install ho: phone ki apps list mein naam dhoondein.',
    ],
  },
  {
    q: 'Install dabaya, "Installing…" aaya phir kuch nahi hua',
    a: [
      '1 minute intezar karein, page band na karein. Internet on rahe.',
      'Phone ki saari apps wali list (app drawer) mein naam search karein: aksar wahan aa chuki hoti hai.',
      'Redmi / Xiaomi / POCO / Oppo / Vivo / Realme: neeche wala "Home screen shortcuts" ka tareeqa karein, phir dobara install karein.',
    ],
  },
  {
    q: 'Redmi / Xiaomi / POCO / Oppo / Vivo / Realme par install nahi hoti',
    a: [
      'Phone ki Settings → Apps → Manage apps → Chrome kholein.',
      '"Other permissions" (ya App permissions) mein "Home screen shortcuts" / "Create desktop shortcut" ko Allow karein.',
      'Wapis aa kar page refresh karein aur dobara Install dabayein.',
    ],
  },
  {
    q: 'App install ho gayi magar icon nazar nahi aa raha',
    a: ['Home screen ke aakhri page par dekhein, ya apps list mein naam search karein.', 'Icon ko ungli se daba kar home screen par le aayein.'],
  },
  {
    q: 'App khulti hai magar khaali / purana page dikhata hai',
    a: ['App poori tarah band karein (recent apps se hata dein) aur 2 dafa kholein: naya version aa jata hai.', 'Internet check karein.'],
  },
  {
    q: '"Storage full" ya install fail',
    a: ['Phone mein kam se kam 500 MB jagah khali karein.', 'Play Store se "Chrome" aur "Android System WebView" update karein.'],
  },
  {
    q: 'Samsung Internet / Mi Browser istemal kar rahe hain',
    a: ['Sab se aasaan: upar "Chrome mein kholein" dabayein aur Chrome se install karein.', 'Samsung Internet mein: neeche ≡ menu → "Add page to" → "Home screen".'],
  },
];

const IOS: Problem[] = [
  {
    q: 'Share ka button nahi mil raha',
    a: ['iPhone par app sirf Safari se lagti hai. Chrome / WhatsApp mein khula ho to link copy kar ke Safari mein kholein.', 'Safari mein page ko thora upar scroll karein ya neeche tap karein: toolbar aur Share (⬆) nazar aa jayega.'],
  },
  {
    q: 'Share list mein "Add to Home Screen" nahi hai',
    a: ['Share list ko neeche tak scroll karein.', 'Na mile to list ke aakhir mein "Edit Actions" dabayein aur "Add to Home Screen" ko (+) se jor dein.'],
  },
  {
    q: 'Icon lag gaya magar khaali page khulta hai',
    a: ['Icon ko daba kar hata dein, Safari mein page refresh karein aur dobara "Add to Home Screen" karein.'],
  },
];

const DESKTOP: Problem[] = [
  {
    q: 'Address bar mein install ka nishan (⊞ / ⬇) nahi hai',
    a: [
      'Chrome ya Microsoft Edge istemal karein (Firefox mein app install nahi hoti).',
      'Chrome: ⋮ menu → "Cast, save and share" → "Install page as app".',
      'Edge: ⋯ menu → "Apps" → "Install this site as an app".',
    ],
  },
  {
    q: 'Install ke baad app nahi mil rahi',
    a: ['Start menu mein naam search karein, ya Desktop par icon dekhein.', 'Chrome mein address bar par chrome://apps likh kar bhi app khul jati hai.'],
  },
];

/** part "blocker": the way out of a browser that cannot install (nothing when the browser is fine); "problems": the fixes list */
export const PWAInstallHelp: React.FC<{ device: 'ios' | 'android' | 'desktop'; appName: string; part: 'blocker' | 'problems' }> = ({
  device,
  appName,
  part,
}) => {
  const env = browserEnv();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const problems = device === 'ios' ? IOS : device === 'android' ? ANDROID : DESKTOP;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  // Where the app cannot be installed at all: the way out comes first
  const blocker =
    device === 'android' && (env.inApp || env.otherBrowser)
      ? `Aap ne yeh page ${env.inApp ? `${env.inApp} ke andar` : env.otherBrowser} mein khola hai. Yahan se app install nahi hoti, Chrome mein kholein.`
      : device === 'ios' && env.iosNotSafari
      ? `iPhone par app sirf Safari se lagti hai. Link copy karein, Safari kholein, upar address par daba kar Paste karein.`
      : '';

  if (part === 'blocker' && !blocker) return null;
  return (
    <div className="space-y-3">
      {part === 'blocker' && (
        <div className="p-3.5 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-950 text-xs space-y-2.5">
          <p className="flex items-start gap-2 font-semibold leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{blocker}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {device === 'android' && (
              <a
                href={openInChromeUrl()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Chrome mein kholein
              </a>
            )}
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400 bg-white font-bold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Link copy ho gaya ✓' : 'Link copy karein'}
            </button>
          </div>
          {device === 'android' && env.inApp && (
            <p className="text-[11px] leading-relaxed text-amber-900/80">
              Button kaam na kare to {env.inApp} mein upar ⋮ (teen nuqte) dabayein → "Open in Chrome" / "Open in browser".
            </p>
          )}
        </div>
      )}

      {part === 'problems' && (
      <div className="rounded-xl border border-black/10 bg-white">
        <p className="px-4 pt-3 pb-1 text-xs font-bold text-[#141413]">Install mein masla? ({appName})</p>
        <ul className="divide-y divide-black/5">
          {problems.map((p, i) => (
            <li key={p.q}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left text-[12px] font-semibold text-[#141413] cursor-pointer hover:bg-black/[0.03]"
              >
                <span>{p.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <ol className="px-4 pb-3 list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed text-black/70">
                  {p.a.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </div>
      )}
    </div>
  );
};
