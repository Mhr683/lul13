// Ready-made categories for sellers' listings (Seller Center product form). A product is saved with
// the category name and its group as the subcategory; the store's menu matches both (navMatch.ts).
// Each category lists words that point to it, so the form can suggest a category from the name.

export interface CategoryGroup {
  group: string;
  categories: { name: string; words: string }[];
}

export const PRODUCT_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    group: 'Mobiles & Tablets',
    categories: [
      { name: 'Mobile Phones', words: 'mobile|smartphone|phone|iphone|android|galaxy|redmi|infinix|tecno|oppo|vivo' },
      { name: 'Tablets', words: 'tablet|ipad|tab' },
      { name: 'Phone Cases & Covers', words: 'case|cover|back cover|pouch|flip cover' },
      { name: 'Screen Protectors', words: 'screen protector|tempered glass|glass protector' },
      { name: 'Chargers & Cables', words: 'charger|cable|adapter|usb|type c|lightning|fast charging|car charger' },
      { name: 'Power Banks', words: 'power bank|powerbank' },
      { name: 'Phone Holders & Stands', words: 'phone holder|mobile stand|phone stand|car holder|selfie stick|tripod' },
    ],
  },
  {
    group: 'Electronics',
    categories: [
      { name: 'Earbuds & Headphones', words: 'earbud|airpod|headphone|headset|earphone|handsfree|tws|neckband' },
      { name: 'Speakers', words: 'speaker|soundbar|bluetooth speaker|woofer' },
      { name: 'Smart Watches', words: 'smart watch|smartwatch|fitness band|smart band' },
      { name: 'Cameras & Accessories', words: 'camera|webcam|action camera|dash cam|cctv|lens|ring light' },
      { name: 'Laptops & Computers', words: 'laptop|computer|pc|desktop|monitor|notebook|macbook' },
      { name: 'Computer Accessories', words: 'mouse|keyboard|usb hub|hard drive|ssd|flash drive|memory card|router|wifi|mouse pad' },
      { name: 'Gaming', words: 'gaming|game|console|playstation|ps4|ps5|xbox|controller|joystick|gamepad' },
      { name: 'TV & Video', words: 'tv|television|led tv|android box|projector|remote' },
      { name: 'Microphones', words: 'microphone|mic|lavalier|collar mic' },
      { name: 'Lighting & LED', words: 'led|light|lamp|bulb|torch|flashlight|strip light|fairy light|solar light' },
      { name: 'Batteries & Electrical', words: 'battery|cell|extension|switch|socket|wire|ups|inverter' },
    ],
  },
  {
    group: 'Home Appliances',
    categories: [
      { name: 'Kitchen Appliances', words: 'blender|juicer|mixer|grinder|chopper|air fryer|toaster|kettle|microwave|oven|sandwich maker|coffee maker' },
      { name: 'Irons & Garment Care', words: 'iron|steamer|garment steamer' },
      { name: 'Fans & Coolers', words: 'fan|cooler|air cooler|mini fan|exhaust' },
      { name: 'Heaters', words: 'heater|room heater|blower' },
      { name: 'Vacuum & Cleaning Machines', words: 'vacuum|cleaner machine|mop machine' },
      { name: 'Water Dispensers & Filters', words: 'water dispenser|water filter|purifier' },
      { name: 'Sewing Machines', words: 'sewing machine|silai' },
    ],
  },
  {
    group: 'Home & Kitchen',
    categories: [
      { name: 'Cookware', words: 'pan|pot|cookware|non stick|pressure cooker|karahi|wok|tawa|frying pan' },
      { name: 'Kitchen Tools & Gadgets', words: 'knife|peeler|cutter|grater|spatula|kitchen tool|slicer|whisk|chopping board|kitchen gadget' },
      { name: 'Dinnerware & Serving', words: 'plate|bowl|cup|mug|glass|dinner set|tea set|tray|cutlery|spoon|fork' },
      { name: 'Food Storage & Bottles', words: 'container|jar|lunch box|water bottle|bottle|flask|storage box|airtight' },
      { name: 'Home Decor', words: 'decor|vase|wall art|painting|frame|clock|candle|artificial flower|showpiece|mirror' },
      { name: 'Bedding & Linen', words: 'bedsheet|bed sheet|pillow|cushion|blanket|comforter|duvet|quilt|towel|mattress' },
      { name: 'Curtains & Rugs', words: 'curtain|blind|rug|carpet|mat|door mat' },
      { name: 'Storage & Organization', words: 'organizer|organiser|rack|shelf|hanger|basket|drawer|storage' },
      { name: 'Cleaning Supplies', words: 'mop|broom|cleaning|duster|brush|sponge|detergent|wiper' },
      { name: 'Bathroom Accessories', words: 'bathroom|shower|soap dispenser|toilet|tap|faucet' },
      { name: 'Furniture', words: 'furniture|chair|table|sofa|stool|bed|wardrobe|desk' },
      { name: 'Garden & Outdoor', words: 'garden|plant|pot|planter|seed|hose|outdoor|bbq|grill' },
      { name: 'Tools & Hardware', words: 'tool|drill|screwdriver|hammer|plier|spanner|wrench|tape measure|toolkit|glue gun' },
    ],
  },
  {
    group: 'Health & Beauty',
    categories: [
      { name: 'Skin Care', words: 'skin|face wash|serum|cream|moisturizer|sunscreen|sunblock|facial|toner|cleanser|mask|whitening' },
      { name: 'Hair Care', words: 'hair|shampoo|conditioner|hair oil|hair color|hair dye|hair serum' },
      { name: 'Makeup', words: 'makeup|make up|lipstick|foundation|mascara|eyeliner|kajal|blush|concealer|compact|nail polish|lip gloss' },
      { name: 'Hair Styling Tools', words: 'straightener|curler|hair dryer|dryer|hair brush|comb' },
      { name: 'Shavers & Trimmers', words: 'trimmer|shaver|razor|clipper|epilator|shaving' },
      { name: 'Personal Care', words: 'deodorant|toothbrush|toothpaste|body wash|soap|lotion|sanitizer|wax|personal care' },
      { name: 'Health & Medical', words: 'thermometer|bp monitor|blood pressure|oximeter|glucometer|weighing scale|massager|massage|medical|knee support|back support|posture' },
      { name: 'Supplements & Nutrition', words: 'supplement|vitamin|protein|whey|capsule|herbal|honey' },
    ],
  },
  {
    group: 'Fragrance',
    categories: [
      { name: 'Perfumes', words: 'perfume|eau de parfum|edp|edt|cologne|fragrance' },
      { name: 'Attar & Oud', words: 'attar|itar|oud|bakhoor|bakhoor' },
      { name: 'Body Sprays & Mists', words: 'body spray|body mist|mist|deo spray' },
      { name: 'Air Fresheners', words: 'air freshener|room spray|car perfume|diffuser|reed diffuser' },
    ],
  },
  {
    group: "Women's Fashion",
    categories: [
      { name: "Women's Clothing", words: 'women|ladies|girls dress|kurti|frock|lawn|suit|shalwar kameez|abaya|dupatta|saree|gown|maxi|stitched|unstitched' },
      { name: "Women's Shoes", words: 'women shoes|ladies shoes|heels|sandals|khussa|pumps|ladies slipper' },
      { name: 'Handbags & Clutches', words: 'handbag|purse|clutch|tote|shoulder bag|ladies bag' },
      { name: "Women's Watches", words: 'women watch|ladies watch' },
      { name: 'Jewelry', words: 'jewelry|jewellery|necklace|earring|ring|bracelet|bangle|pendant|anklet|nose pin|jhumka' },
      { name: "Women's Accessories", words: 'hijab|scarf|stole|shawl|hair accessories|hair clip|sunglasses' },
    ],
  },
  {
    group: "Men's Fashion",
    categories: [
      { name: "Men's Clothing", words: 'men|mens|gents|shirt|t shirt|tshirt|polo|kurta|shalwar|trouser|jeans|pant|hoodie|jacket|waistcoat' },
      { name: "Men's Shoes", words: 'men shoes|sneakers|joggers|loafers|boots|chappal|peshawari|formal shoes' },
      { name: "Men's Watches", words: 'men watch|wrist watch|watch|chronograph' },
      { name: 'Wallets & Belts', words: 'wallet|belt|card holder' },
      { name: "Men's Accessories", words: 'cap|sunglasses|tie|cufflink|men bracelet' },
    ],
  },
  {
    group: 'Kids & Baby',
    categories: [
      { name: 'Baby Care', words: 'baby|diaper|feeder|feeding bottle|baby wipes|pacifier|baby lotion' },
      { name: 'Baby Gear', words: 'stroller|pram|walker|baby carrier|car seat|baby cot|crib' },
      { name: "Kids' Clothing", words: 'kids|kid|boys|girls|baby dress|children clothing|romper' },
      { name: "Kids' Shoes", words: 'kids shoes|baby shoes|kids sandals' },
      { name: 'Toys', words: 'toy|doll|car toy|rc car|remote control car|puzzle|lego|blocks|teddy|soft toy|kids game' },
      { name: 'School Supplies', words: 'school|school bag|stationery|pencil|pen|notebook|lunch box|geometry box|crayons' },
    ],
  },
  {
    group: 'Bags & Travel',
    categories: [
      { name: 'Backpacks', words: 'backpack|laptop bag|rucksack' },
      { name: 'Luggage & Suitcases', words: 'luggage|suitcase|trolley bag|travel bag|duffel' },
      { name: 'Travel Accessories', words: 'travel|neck pillow|passport|travel organizer' },
    ],
  },
  {
    group: 'Sports & Outdoors',
    categories: [
      { name: 'Fitness & Gym', words: 'gym|fitness|dumbbell|yoga|exercise|resistance band|skipping rope|treadmill|push up' },
      { name: 'Cricket', words: 'cricket|bat|ball|wicket|pads|gloves' },
      { name: 'Football & Other Sports', words: 'football|badminton|racket|tennis|hockey|volleyball|basketball' },
      { name: 'Cycling', words: 'cycle|bicycle|bike helmet' },
      { name: 'Camping & Hiking', words: 'camping|tent|hiking|sleeping bag' },
      { name: 'Sportswear', words: 'tracksuit|sportswear|jersey|sports shoes|running shoes' },
    ],
  },
  {
    group: 'Automotive',
    categories: [
      { name: 'Car Accessories', words: 'car|car seat cover|steering|car mat|car charger|car mount|dash' },
      { name: 'Car Care', words: 'car wash|car polish|car cleaner|car shampoo|wax polish' },
      { name: 'Motorbike Accessories', words: 'bike|motorbike|motorcycle|helmet' },
      { name: 'Car Electronics', words: 'car stereo|car mp3|tyre inflator|jump starter|car camera' },
    ],
  },
  {
    group: 'Groceries & Food',
    categories: [
      { name: 'Groceries', words: 'grocery|rice|flour|atta|oil|ghee|sugar|tea|coffee|spices|masala|pulses|daal' },
      { name: 'Snacks & Sweets', words: 'snack|chips|biscuit|chocolate|candy|sweets|mithai|nimko|dry fruit|nuts|dates' },
      { name: 'Beverages', words: 'juice|drink|beverage|syrup|squash' },
    ],
  },
  {
    group: 'Books & Stationery',
    categories: [
      { name: 'Books', words: 'book|novel|quran|islamic book|textbook' },
      { name: 'Office & Stationery', words: 'office|stationery|file|register|stapler|marker|diary|calculator|printer' },
      { name: 'Art & Craft', words: 'art|craft|paint|brush set|colors|canvas|sketch' },
    ],
  },
  {
    group: 'Pets',
    categories: [{ name: 'Pet Supplies', words: 'pet|cat|dog|bird|fish|aquarium|pet food|litter|leash|collar' }],
  },
  {
    group: 'Islamic & Gifts',
    categories: [
      { name: 'Islamic Products', words: 'prayer mat|janamaz|tasbeeh|tasbih|quran stand|rehal|islamic|topi|prayer cap' },
      { name: 'Gifts & Occasions', words: 'gift|gift box|birthday|wedding|eid|anniversary|hamper|balloon|party' },
    ],
  },
  {
    group: 'Other',
    categories: [{ name: 'Other', words: '' }],
  },
];

export const ALL_PRODUCT_CATEGORIES = PRODUCT_CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => ({ ...c, group: g.group })));

/** The group a ready-made category belongs to ('' for a category the seller typed themselves) */
export const groupOfCategory = (name: string) =>
  ALL_PRODUCT_CATEGORIES.find((c) => c.name.toLowerCase() === String(name || '').trim().toLowerCase())?.group || '';

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Up to `max` categories that fit a product name, best first. A longer matching word counts more
 * ("smart watch" beats "watch"), so "Smart watch for men" suggests Smart Watches before Men's Watches.
 */
export function suggestCategories(productName: string, max = 3): string[] {
  const text = ` ${String(productName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  if (text.trim().length < 3) return [];
  const scored: { name: string; score: number }[] = [];
  for (const c of ALL_PRODUCT_CATEGORIES) {
    if (!c.words) continue;
    let score = 0;
    for (const w of c.words.split('|')) {
      const word = w.trim();
      if (!word) continue;
      // whole words only ("pen" must not match "pendant"); a trailing s is allowed ("speakers")
      if (new RegExp(`\\s${escape(word).replace(/\s+/g, '\\s+')}s?\\s`).test(text)) score = Math.max(score, word.length);
    }
    if (score > 0) scored.push({ name: c.name, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.name);
}
