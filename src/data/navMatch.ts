import type { Product } from '../types/store';
import { MAIN_NAV_SECTIONS, type NavMenuSection, type NavCategoryItem } from './categoryNavigation';

// Matches products to the header menu (Shop / Men / Women / Children / Collections).
// Sellers name their categories freely ("Personal Care & Beauty", "Smart Gadgets", ...), so a menu
// entry such as "Health & Beauty" finds products by words in the category, subcategory, name and
// keywords instead of needing the exact same category name.

const GROUPS: Record<string, RegExp> = {
  'health & beauty': /beauty|personal care|skin ?care|hair|make ?up|cosmetic|health|trimmer|shaver|groom|serum|cream|lotion|massag|nail|lipstick|facial/,
  'home & kitchen': /kitchen|home|lifestyle|cook|decor|household|clean|storage|organi[sz]er|bottle|lunch|blender|cutlery/,
  watches: /\bwatch(es)?\b|smart ?watch|wrist ?watch/,
  fragrance: /perfume|fragrance|attar|\bscents?\b|cologne|body spray|\bmists?\b|\boud\b/,
  electronics: /electronic|gadget|airpod|earbud|headset|headphone|speaker|charger|power ?bank|\bcable|lighting|ring light|camera|mobile|phone|bluetooth|\bled\b|\busb\b|wireless|tripod|microphone|\bmic\b/,
  'leather goods': /\bbags?\b|handbag|luggage|backpack|wallet|purse|clutch|travel|leather/,
  jewelry: /jewel|necklace|bracelet|earring|\brings?\b|pendant|bangle|anklet|accessor/,
  men: /\b(men|mens|men's|male|gents?|man|boys?)\b/,
  women: /\b(women|womens|women's|ladies|lady|female|girls?|bridal)\b/,
  children: /\b(kids?|child|children|baby|babies|toddler|boys?|girls?|toys?|gaming|games?|school|infant)\b/,
};

const norm = (s: unknown) => String(s || '').trim().toLowerCase();
const haystack = (p: Product) => norm(`${p.category} ${p.subcategory || ''} ${p.name} ${p.seoKeywords || ''} ${p.shortDescription || ''}`);

// Words that mean the same thing in product names
const SYNONYMS: Record<string, string> = {
  footwear: 'footwear|shoe|sandal|slipper|sneaker|boot|chappal|heel',
  shoe: 'shoe|sandal|slipper|sneaker|boot|chappal|footwear',
  heel: 'heel|sandal|pump|stiletto|wedge',
  clothing: 'cloth|dress|frock|shirt|suit|kurta|trouser|jacket|top|wear|outfit|romper|legging|skirt',
  shirt: 'shirt|polo|tee',
  jacket: 'jacket|hoodie|coat|sweater|blazer',
  toy: 'toy|game|gaming|puzzle|doll|lego|rc |remote control',
  game: 'game|gaming|toy|puzzle|console',
  baby: 'baby|babies|infant|newborn|toddler|feeder|diaper',
  school: 'school|backpack|lunch|water bottle|stationery|pencil',
  accessory: 'accessor',
  handbag: 'handbag|bag|purse|clutch|tote',
  clutch: 'clutch|purse',
  ornament: 'ornament|jewel|necklace|earring|bracelet|ring',
  outerwear: 'outerwear|shawl|stole|jacket|coat|cardigan',
  shawl: 'shawl|stole|wrap',
  dress: 'dress|frock|gown|maxi',
  blouse: 'blouse|top|shirt',
  trouser: 'trouser|pant|chino|jeans',
};

// shoes -> shoe, watches -> watch, dresses -> dress, accessories -> accessory
const singular = (w: string) =>
  /ies$/.test(w) ? w.replace(/ies$/, 'y') : /(ch|sh|ss|x)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Trousers & Chinos" -> trousers OR chinos; "Kids Footwear" -> kid AND (footwear|shoe|sandal...)
const wordsPattern = (label: string): ((text: string) => boolean) | null => {
  const alternatives = norm(label)
    .split(/&|\/|,|\bor\b/)
    .map((part) =>
      part
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !['and', 'the', 'for', 'all'].includes(w))
        .map(singular)
        .filter((w) => w.length >= 3)
        // words must start where a word starts ("heel" must not match "wheel")
        .map((w) => new RegExp(`\\b(?:${SYNONYMS[w] || escape(w)})`))
    )
    .filter((words) => words.length > 0);
  if (!alternatives.length) return null;
  return (text) => alternatives.some((words) => words.every((re) => re.test(text)));
};

const matchesLabel = (p: Product, label: string) => {
  const l = norm(label);
  if (!l || l === 'all') return true;
  // A real category / subcategory name (from the sidebar) matches exactly
  if (norm(p.category) === l || norm(p.subcategory) === l) return true;
  const text = haystack(p);
  const group = GROUPS[l];
  if (group) return group.test(text);
  const matcher = wordsPattern(l);
  return matcher ? matcher(text) : false;
};

export function productMatchesNav(p: Product, category: string, subcategory: string) {
  if (category && category !== 'ALL' && !matchesLabel(p, category)) return false;
  if (subcategory && subcategory !== 'ALL' && !matchesLabel(p, subcategory)) return false;
  return true;
}

const matchesItem = (p: Product, item: NavCategoryItem) => {
  if (!productMatchesNav(p, item.categoryFilter, item.subcategoryFilter || 'ALL')) return false;
  if (item.collectionFilter === 'NEW_ARRIVALS') return Boolean(p.newArrival);
  if (item.collectionFilter === 'BEST_SELLERS') return Boolean(p.bestSeller);
  if (item.collectionFilter === 'OFFERS') return Boolean(p.compareAtPrice && p.compareAtPrice > p.price);
  return true;
};

export type NavItemWithCount = NavCategoryItem & { count: number };
export type NavSectionWithCounts = Omit<NavMenuSection, 'items'> & { items: NavItemWithCount[] };

/**
 * The header menu with product counts. Entries without products are left out (so customers never
 * land on an empty page) and the "Shop" menu lists the store's real categories.
 */
export function buildNavSections(products: Product[]): NavSectionWithCounts[] {
  const live = products.filter((p) => p.status === 'ACTIVE');
  if (!live.length) return MAIN_NAV_SECTIONS.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, count: 0 })) }));

  const byCategory = new Map<string, number>();
  for (const p of live) if (p.category) byCategory.set(p.category, (byCategory.get(p.category) || 0) + 1);
  const shopItems: NavItemWithCount[] = [
    { id: 'shop-all', name: 'All Products', slug: 'all-products', categoryFilter: 'ALL', count: live.length },
    ...Array.from(byCategory.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({
        id: `shop-${name}`,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        categoryFilter: name,
        count,
      })),
  ];

  return MAIN_NAV_SECTIONS.map((section) => {
    if (section.id === 'nav-shop') return { ...section, items: shopItems };
    const items = section.items
      .map((item) => ({ ...item, count: live.filter((p) => matchesItem(p, item)).length }))
      .filter((item) => item.count > 0);
    return { ...section, items };
  }).filter((section) => section.items.length > 0);
}
