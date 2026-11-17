// Website helpline: finds the store's own products a customer asks about (any language, spelling
// mistakes too) and reads the assistant's answer aloud in a woman's voice.
// Products come from the in-memory catalog copy: no Firestore reads.

export type HelplineProduct = {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number;
  image: string;
  url: string;
  rating: number;
  reviewCount: number;
};

export type ReplyLanguage = 'en' | 'ur' | 'roman';
export type ProductIntent = {
  wantsProducts: boolean;
  keywords: string[];
  minPrice: number;
  maxPrice: number;
  language: ReplyLanguage;
  // A person from the store should look at this (complaint, refund, damaged / wrong item, angry, asks for a person)
  needsPerson: boolean;
  personReason: string;
};

// Urdu script is certain from the letters; English vs Roman Urdu from common Roman Urdu words
const ROMAN_URDU = /\b(hai|hy|he|hain|kya|kia|ka|ki|ke|ko|se|mein|main|mujhe|mje|chahiye|chahie|chahye|kitne|kitna|dikhao|batao|btao|aap|ap|nahi|ni|koi|wala|wali|kr|kar|karo|krna|de|do|tak)\b/gi;
export function detectLanguage(text: string): ReplyLanguage {
  if (/[؀-ۿ]/.test(text)) return 'ur';
  const words = String(text).split(/\s+/).filter(Boolean).length || 1;
  const roman = (String(text).match(ROMAN_URDU) || []).length;
  return roman >= 2 || roman / words >= 0.25 ? 'roman' : 'en';
}

// The two closing lines after products, always in the customer's language
export function closingLines(lang: ReplyLanguage, storeUrl: string): string {
  if (lang === 'ur') return `مزید پروڈکٹس اور معلومات کے لیے ہماری ویب سائٹ وزٹ کریں: ${storeUrl}\nمجھے یہاں آپ کو مزید پروڈکٹس دکھانے کی اجازت نہیں، اس پریشانی کے لیے معذرت چاہتی ہوں۔`;
  if (lang === 'roman') return `Mazeed products aur maloomat ke liye hamari website visit karein: ${storeUrl}\nMujhe yahan aap ko mazeed products dikhane ki ijazat nahi, is pareshani ke liye maazrat chahti hoon.`;
  return `For more products and information, please visit our store: ${storeUrl}\nI am not allowed to show you more products here; I am sorry for the trouble.`;
}

export const languageName = (l: ReplyLanguage) =>
  l === 'ur' ? 'Urdu in Urdu script (اردو)' : l === 'roman' ? 'Roman Urdu (Urdu written in English letters)' : 'English';

const STOP = new Set(
  'a an the and or for of to in on with me my i you your is are was be do does have has please pls plz show give tell want need any some about price cost rate how much what which kya ka ki ke ko se mein main mujhe mjhe muje hai hy he hain hn ho koi kuch chahiye chahie chaiye dikhao dikha batao btao bata de do dein kitne kitna kitni wala wali wale aur or bhi b ye yeh woh wo hamein apke apka aap ap'.split(
    ' '
  )
);

export const tokens = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));

// Small spelling mistakes still match ("khadar" / "khaddar", "shoos" / "shoes")
function near(a: string, b: string): boolean {
  if (a === b) return true;
  // plural / short ending only ("shoe" / "shoes", "bag" / "bags"), not "head" / "headset"
  if (Math.min(a.length, b.length) >= 3 && Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  const squash = (s: string) => s.replace(/(.)\1+/g, '$1');
  if (squash(a) === squash(b)) return true;
  // one letter different / missing
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Best matching live, in-stock products, at most one per seller (so 2-3 different sellers show)
export function searchProducts(all: any[], intent: ProductIntent, baseUrl: string, max = 3): HelplineProduct[] {
  const want = Array.from(new Set(intent.keywords.flatMap(tokens))).slice(0, 12);
  if (!want.length) return [];
  const scored: { p: any; score: number }[] = [];
  for (const p of all) {
    if (p.status !== 'ACTIVE' || !(Number(p.stock) > 0) || !(Number(p.price) > 0)) continue;
    if (intent.maxPrice > 0 && Number(p.price) > intent.maxPrice) continue;
    if (intent.minPrice > 0 && Number(p.price) < intent.minPrice) continue;
    const fields: [string[], number][] = [
      [tokens(p.name), 3],
      [tokens(`${p.category} ${p.subcategory || ''}`), 2],
      [tokens(`${p.brand || ''} ${p.seoKeywords || ''}`), 1],
      [tokens(p.shortDescription), 1],
    ];
    let score = 0;
    let hits = 0;
    for (const w of want) {
      let best = 0;
      for (const [list, weight] of fields) if (weight > best && list.some((t) => near(w, t))) best = weight;
      if (best) hits++;
      score += best;
    }
    if (!hits) continue;
    // Most of the words must match when several were asked ("black leather bag")
    if (want.length >= 3 && hits < Math.ceil(want.length / 2)) continue;
    // Good rank: matches first, then rating, reviews, best seller / featured, a picture
    const rating = Number(p.rating) || 0;
    const reviews = Number(p.reviewCount) || 0;
    const quality = rating * Math.min(1, reviews / 5) + Math.log10(1 + reviews) + (p.bestSeller ? 1 : 0) + (p.featured ? 0.5 : 0) + (p.primaryImage ? 1 : -3);
    scored.push({ p, score: score * 10 + hits * 5 + quality });
  }
  scored.sort((a, b) => b.score - a.score);
  // Only close matches: a product that matched just one side word ("wireless") is left out
  const top = scored[0]?.score || 0;
  const close = scored.filter((s) => s.score >= top * 0.6);
  scored.length = 0;
  scored.push(...close);
  const seen = new Set<string>();
  const out: HelplineProduct[] = [];
  const abs = (u: string) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${baseUrl}${u.startsWith('/') ? '' : '/'}${u}`);
  // First the best product of each seller; when fewer sellers have it, the next best fill the rest
  const firstPass = scored.filter(({ p }) => {
    const seller = String(p.sellerId || p.sellerName || 'store');
    if (seen.has(seller)) return false;
    seen.add(seller);
    return true;
  });
  const picked = [...firstPass, ...scored.filter((s) => !firstPass.includes(s))];
  for (const { p } of picked) {
    out.push({
      id: p.id,
      name: String(p.name || '').slice(0, 140),
      price: Number(p.price) || 0,
      compareAtPrice: Number(p.compareAtPrice) > Number(p.price) ? Number(p.compareAtPrice) : 0,
      image: abs(String(p.primaryImage || (Array.isArray(p.images) ? p.images[0] : '') || '')),
      url: `${baseUrl}/p/${encodeURIComponent(p.id)}`,
      rating: Number(p.rating) || 0,
      reviewCount: Number(p.reviewCount) || 0,
    });
    if (out.length >= max) break;
  }
  return out;
}

// Facts the assistant may use about the products found (never invents others)
export function productFacts(list: HelplineProduct[], all: any[]): string {
  return list
    .map((h, i) => {
      const p = all.find((x) => x.id === h.id) || {};
      const desc = String(p.description || p.shortDescription || '')
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      return [
        `${i + 1}. ${h.name}`,
        `   Price: Rs ${h.price.toLocaleString('en-PK')}${h.compareAtPrice ? ` (was Rs ${h.compareAtPrice.toLocaleString('en-PK')})` : ''}`,
        `   In stock: yes${h.reviewCount ? ` · Rating ${h.rating.toFixed(1)} from ${h.reviewCount} reviews` : ''}`,
        p.category ? `   Category: ${p.category}` : '',
        desc ? `   Details: ${desc}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

// Reads what the customer is looking for (English, Urdu, Roman Urdu, with spelling mistakes)
export async function readIntent(ai: any, message: string, history: string[]): Promise<ProductIntent | null> {
  const prompt = `A customer wrote this in an online store's help chat (Pakistan). They may write English, Urdu script or Roman Urdu, with spelling mistakes.
Earlier messages (for context): ${history.slice(-4).join(' | ').slice(0, 800) || 'none'}
Message: "${message.slice(0, 600)}"

Return JSON only:
{"wantsProducts": true if they ask about a product / item / price / availability / details or want to buy or see something, else false,
 "keywords": product words for a store search, corrected spelling, in BOTH English and the Roman Urdu / common Pakistani name (e.g. "khaddar","suit","men"; "joote" -> "shoes","joota"), at most 8, no colours unless asked, empty if none,
 "minPrice": number or 0, "maxPrice": number or 0 (e.g. "2000 tak" -> 2000),
 "language": "ur" if written in Urdu script, "roman" if Urdu/Hindi written in English letters (Roman Urdu), "en" if English,
 "needsPerson": true only if a person from the store must handle it: a complaint, damaged / wrong / missing item, refund or money back, return or exchange request for their order, payment problem, very late order, angry or upset customer, or they ask for a person / call; false for normal questions (products, prices, COD, delivery time, how to track),
 "personReason": if needsPerson, a 3-6 word English reason (e.g. "damaged item complaint", "refund request"), else ""}`;
  try {
    const r: any = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0, httpOptions: { timeout: 20_000 } },
    });
    const j = JSON.parse(String(r.text || '{}').replace(/^```(json)?|```$/g, ''));
    return {
      wantsProducts: Boolean(j.wantsProducts),
      keywords: (Array.isArray(j.keywords) ? j.keywords : []).map((k: any) => String(k).slice(0, 40)).slice(0, 8),
      minPrice: Math.max(0, Number(j.minPrice) || 0),
      maxPrice: Math.max(0, Number(j.maxPrice) || 0),
      // Urdu letters are certain; otherwise the AI's reading of English vs Roman Urdu
      language: /[؀-ۿ]/.test(message) ? 'ur' : j.language === 'roman' || j.language === 'en' ? j.language : detectLanguage(message),
      needsPerson: Boolean(j.needsPerson),
      personReason: j.needsPerson ? String(j.personReason || 'customer needs help').slice(0, 60) : '',
    };
  } catch {
    return null;
  }
}

// Without the AI: the message's own words are used for the search
export function plainIntent(message: string): ProductIntent {
  const m = /(\d{3,6})\s*(tak|tk|under|se kam|below|max)/i.exec(message);
  return { wantsProducts: true, keywords: tokens(message).slice(0, 8), minPrice: 0, maxPrice: m ? Number(m[1]) : 0, language: detectLanguage(message), needsPerson: false, personReason: '' };
}

// ------------------------------------------------------------------ customer's voice message
// The browser sends a short WAV (16 kHz mono, made from the microphone recording). The AI writes down
// what was said; the recording itself is not kept anywhere.
export async function transcribeVoice(ai: any, wav: Buffer): Promise<string> {
  if (!(wav.length > 44 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE')) return '';
  // A (nearly) silent recording: the AI would make up words, so nothing is sent to it
  let sum = 0;
  let n = 0;
  for (let i = 44; i + 1 < wav.length; i += 2 * 4) {
    const s = wav.readInt16LE(i);
    sum += s * s;
    n++;
  }
  if (!n || Math.sqrt(sum / n) < 120) return '';
  const r: any = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
          {
            text: `A customer of an online store in Pakistan recorded this voice message. Write down exactly what they said, nothing else.
- Urdu, Punjabi or Hindi speech: write it in Roman Urdu (Urdu in English letters).
- English speech: write it in English.
- Only the words actually spoken in this recording. Fix nothing, add nothing, guess nothing, no notes. If there is no clear speech, return exactly: [no speech]`,
          },
        ],
      },
    ],
    config: { temperature: 0, httpOptions: { timeout: 30_000 } },
  });
  const text = String(r.text || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .slice(0, 1000);
  return /^\[?no speech\]?$/i.test(text) ? '' : text;
}

// ------------------------------------------------------------------ voice (woman's voice)
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
const FEMALE_VOICE = 'Kore';

// Gemini sends raw 16-bit PCM; browsers need a WAV header in front of it
function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function speakFemale(ai: any, text: string): Promise<Buffer | null> {
  const say = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  if (!say) return null;
  for (const model of TTS_MODELS) {
    try {
      const r: any = await ai.models.generateContent({
        model,
        // Only the answer itself: an instruction in front of it was sometimes read out loud as well
        contents: [{ role: 'user', parts: [{ text: say }] }],
        config: {
          responseModalities: ['AUDIO'] as any,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: FEMALE_VOICE } } },
          httpOptions: { timeout: 45_000 },
        },
      });
      const part = (r.candidates?.[0]?.content?.parts || []).find((x: any) => x.inlineData?.data);
      if (!part) continue;
      const raw = Buffer.from(part.inlineData.data, 'base64');
      const mime = String(part.inlineData.mimeType || '');
      if (/wav/i.test(mime) || raw.toString('ascii', 0, 4) === 'RIFF') return raw;
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
      return pcmToWav(raw, rate);
    } catch (err: any) {
      console.warn(`[helpline voice] ${model} failed:`, err?.message);
    }
  }
  return null;
}
