// Keeps sellers welcomed, encouraged and active, automatically (no admin work):
//   - Welcome: every approved seller gets a welcome message from the store team in Seller Center
//   - First listing: a congratulations message once the shop has its first product
//   - No products yet: an e-mail every 10 days (at most NUDGE_MAX times) to start listing
//   - Account health below 90: a message in Seller Center and an e-mail, again when it drops 5+ more
//     points or after 7 days still below 90; it is re-armed once health is back at 90 or more
// Runs inside the server every few hours. What was sent is kept on the seller doc (sellers/{uid}.engagement),
// so nothing is sent twice, also after a restart. Products come from memory; health reads a seller's
// orders (cached) at most once a day.

import type { PostNotice } from './sellerInbox';

export interface EngagementEmail {
  subject: string;
  title: string;
  color: 'emerald' | 'amber' | 'rose';
  paragraphs: string[];
  bullets?: string[];
  button: string;
}

export interface SellerEngagementDeps {
  adminDb: FirebaseFirestore.Firestore;
  postNotice: PostNotice;
  /** The seller's products (from memory), or null while the catalog is still loading */
  productsOfSeller: (uid: string) => any[] | null;
  healthOf: (seller: any) => Promise<{ score: number; reasons: { level: string; text: string }[] }>;
  setSellerFields: (uid: string, fields: Record<string, any>) => Promise<void>;
  sendEmail: (seller: any, email: EngagementEmail) => Promise<boolean>;
  storeName: () => string;
}

const DAY = 24 * 3600_000;
const RUN_EVERY_MS = 3 * 3600_000;
const FIRST_RUN_MS = 2 * 60_000;
const NUDGE_EVERY_DAYS = 10;
const NUDGE_MAX = 12;
const HEALTH_LIMIT = 90;
const HEALTH_REPEAT_DAYS = 7;
const HEALTH_CHECK_EVERY_MS = DAY;

const ago = (iso: unknown) => (iso ? Date.now() - Date.parse(String(iso)) : Infinity);

export function startSellerEngagement(d: SellerEngagementDeps) {
  const healthCheckedAt = new Map<string, number>();
  let running = false;

  const welcome = (shop: string, store: string) =>
    [
      `Assalam o Alaikum! ${store} ki family mein ${shop} ka dil se khush aamdeed. Aap ki dukaan tayyar hai aur hum aap ki kamyabi mein aap ke saath hain.`,
      '',
      'Shuru karne ke 3 aasaan qadam:',
      '1. Products → "Add product" se apna pehla item lagayein: saaf tasveerein, poori tafseel aur sahi qeemat.',
      '2. Profile mein dukaan ka logo aur cover photo lagayein, is se customers bharosa karte hain.',
      '3. Order aaye to 48 ghante ke andar dispatch karein, achhi reviews aur zyada orders milte hain.',
      '',
      'Bohat se products ek saath lagane hon to "CSV / Bulk listing" istemal karein. Koi bhi sawal ho to Messages mein humein likhein ya AI Assistant se poochein.',
      '',
      'Aaj hi pehla product lagayein, pehla order aap ka intezar kar raha hai! 💪',
    ].join('\n');

  const firstListing = (shop: string) =>
    [
      `Mubarak ho! ${shop} ka pehla product live ho gaya hai. Yeh bohat bara qadam hai, ab customers aap ki dukaan dekh aur khareed sakte hain. 🎉`,
      '',
      'Aage barhne ke liye:',
      '• Mazeed products lagayein: zyada products = zyada orders.',
      '• Har product par 3-4 saaf tasveerein aur poori tafseel likhein.',
      '• Apne product ka link WhatsApp, Facebook aur Instagram par share karein (product par "Share" dabayein).',
      '• Orders 48 ghante mein dispatch karein taake account health 100 rahe.',
      '',
      'Hamein aap par fakhar hai. Isi tarah kaam karte rahein! 🚀',
    ].join('\n');

  const runOnce = async () => {
    if (running) return;
    running = true;
    const store = d.storeName();
    let sent = { welcome: 0, first: 0, nudge: 0, health: 0 };
    try {
      const snap = await d.adminDb.collection('sellers').where('status', '==', 'APPROVED').limit(2000).get();
      for (const doc of snap.docs) {
        const seller = { ...(doc.data() as any), id: doc.id };
        const uid = doc.id;
        const shop = String(seller.shopName || 'Aap ki dukaan');
        const eng = seller.engagement || {};
        const now = new Date().toISOString();
        const update: Record<string, any> = {};
        try {
          // 1. Welcome (every approved seller, once)
          if (!eng.welcomeAt) {
            await d.postNotice(uid, shop, `Khush aamdeed, ${shop}! 🎉`, welcome(shop, store), 'INFO', 'ADMIN');
            update.welcomeAt = now;
            sent.welcome++;
          }

          const products = d.productsOfSeller(uid);
          if (products) {
            const listed = products.filter((p) => p.status !== 'ARCHIVED').length;

            // 2. First listing (once, also for shops that listed before this started)
            if (listed > 0 && !eng.firstListingAt) {
              await d.postNotice(uid, shop, 'Mubarak ho! Aap ki pehli listing live hai 🎊', firstListing(shop), 'INFO', 'ADMIN');
              update.firstListingAt = now;
              sent.first++;
            }

            // 3. No products yet: an e-mail every 10 days
            const nudges = Number(eng.nudges) || 0;
            const since = eng.lastNudgeAt || seller.approvedAt || eng.welcomeAt || update.welcomeAt;
            if (listed === 0 && nudges < NUDGE_MAX && ago(since) >= NUDGE_EVERY_DAYS * DAY) {
              const ok = await d.sendEmail(seller, {
                subject: `${shop}: aap ki dukaan aap ka intezar kar rahi hai | ${store}`,
                title: 'Aap ka pehla product kab aa raha hai?',
                color: 'amber',
                paragraphs: [
                  `${shop} ${store} par approve ho chuki hai, lekin abhi tak dukaan mein koi product nahi laga.`,
                  `Customers roz ${store} par shopping kar rahe hain. Sirf 5 minute mein pehla product laga kar aaj hi bechna shuru karein.`,
                ],
                bullets: [
                  'Seller Center → Products → "Add product"',
                  'Bohat se products ek saath: "CSV / Bulk listing" (AI se file banwane ka tareeqa bhi wahin hai)',
                  'Koi masla ho to Seller Center mein Messages par likhein, hum madad karenge',
                ],
                button: 'Pehla product lagayein',
              });
              // Without an e-mail address the reminder is not retried every run
              update.lastNudgeAt = now;
              update.nudges = nudges + 1;
              if (ok) sent.nudge++;
            }

            // 4. Account health below 90 (shops with products; checked once a day)
            if (listed > 0 && Date.now() - (healthCheckedAt.get(uid) || 0) >= HEALTH_CHECK_EVERY_MS) {
              healthCheckedAt.set(uid, Date.now());
              const health = await d.healthOf(seller);
              const score = Math.round(Number(health.score) || 0);
              if (score < HEALTH_LIMIT) {
                const last = Number(eng.healthAlertScore);
                const due = !eng.healthAlertAt || score <= last - 5 || ago(eng.healthAlertAt) >= HEALTH_REPEAT_DAYS * DAY;
                if (due) {
                  const reasons = health.reasons.filter((r) => r.level !== 'GREEN').map((r) => r.text).slice(0, 5);
                  const tips = [
                    'Har order 48 ghante ke andar dispatch karein.',
                    'Jo product stock mein nahi, use Draft kar dein ya stock barha dein.',
                    'Customer ki shikayat aur return jaldi hal karein.',
                    'Dashboard par Shop Coach aur "Fix now" se madad lein.',
                  ];
                  await d.postNotice(
                    uid,
                    shop,
                    `Aap ki account health ${score}/100 ho gayi hai`,
                    [
                      `${shop} ki account health 90 se neeche aa gayi hai. Ghabrayein nahi, isay wapas 100 tak laya ja sakta hai.`,
                      '',
                      ...(reasons.length ? ['Wajah:', ...reasons.map((r) => `• ${r}`), ''] : []),
                      'Behtar karne ke liye:',
                      ...tips.map((t) => `• ${t}`),
                      '',
                      'Health 60 se neeche jaye to products store se hat sakte hain, is liye abhi se theek kar lein.',
                    ].join('\n'),
                    score < 60 ? 'URGENT' : 'WARNING',
                    'ADMIN'
                  );
                  await d.sendEmail(seller, {
                    subject: `${shop}: account health ${score}/100, abhi theek karein | ${store}`,
                    title: `Account health: ${score}/100`,
                    color: score < 60 ? 'rose' : 'amber',
                    paragraphs: [`${shop} ki account health 90 se neeche aa gayi hai. Seller Center mein Dashboard par poori tafseel aur hal maujood hai.`],
                    bullets: [...reasons, ...tips].slice(0, 8),
                    button: 'Seller Center kholein',
                  });
                  update.healthAlertAt = now;
                  update.healthAlertScore = score;
                  sent.health++;
                }
              } else if (eng.healthAlertAt) {
                // Back at 90+: the next drop alerts again
                update.healthAlertAt = null;
                update.healthAlertScore = null;
              }
            }
          }
        } catch (err: any) {
          console.warn(`[engagement] ${shop}:`, err?.message);
        }
        if (Object.keys(update).length) await d.setSellerFields(uid, { engagement: update }).catch(() => {});
      }
      if (sent.welcome + sent.first + sent.nudge + sent.health) {
        console.log(`[engagement] welcome ${sent.welcome}, first listing ${sent.first}, start-listing e-mails ${sent.nudge}, health alerts ${sent.health}`);
      }
    } catch (err: any) {
      console.warn('[engagement] run failed:', err?.message);
    } finally {
      running = false;
    }
  };

  setTimeout(() => void runOnce(), FIRST_RUN_MS).unref?.();
  setInterval(() => void runOnce(), RUN_EVERY_MS).unref?.();
  return { runOnce };
}
