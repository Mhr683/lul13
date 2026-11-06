// Step-by-step guides shown by the colourful "?" buttons (src/components/HelpDot.tsx) in Seller
// Center and the admin panel, in simple Roman Urdu. One entry per function; the id is used where the
// button is placed (e.g. <HelpDot id="seller.product.price" />).

export interface HelpGuide {
  title: string;
  /** One line: what this function is for */
  what?: string;
  steps: string[];
  tips?: string[];
}

export const HELP_GUIDES: Record<string, HelpGuide> = {
  // =============================================================== SELLER CENTER: tabs
  'seller.tab.DASHBOARD': {
    title: 'Dashboard (aap ki dukaan ka khulasa)',
    what: 'Aaj ke naye orders, kam stock wale products, Shop Coach ki salah aur flash deals ek jagah.',
    steps: [
      'Seller Center kholte hi yahi page aata hai.',
      '"New orders today" mein aaj ke orders ki ginti dekhein. Us par click karein to Orders khul jate hain.',
      '"Running low" mein woh products hain jin ka stock 5 ya kam reh gaya. Waqt par stock barha dein.',
      '"Shop Coach" aap ki dukaan check karke batata hai kya behtar ho sakta hai. "Refresh" se nayi report lein.',
      '"Ask the AI coach" se AI se salah poochh sakte hain.',
    ],
    tips: ['Roz ek dafa Dashboard zaroor dekhein taa ke koi order late na ho.'],
  },
  'seller.tab.AI': {
    title: 'AI Assistant (aap ka madadgar)',
    what: 'Apni dukaan ke baare mein AI se baat karein: orders, sales, descriptions, stock.',
    steps: [
      'AI Assistant tab kholein.',
      'Neeche box mein apna sawal likhein, jaise "kal ke orders dikhao" ya "kam stock wale products batao".',
      'Enter ya bhejne ka button dabayein. AI jawab dega.',
      'Agar AI koi tabdeeli (jaise description) tajweez kare to woh tab tak lagu nahi hoti jab tak aap "Apply" na dabayein.',
      'Nayi baat shuru karni ho to "New chat" dabayein.',
    ],
    tips: ['AI sirf aap ki apni dukaan par kaam karta hai.', 'Qeemat aur account settings AI kabhi khud nahi badalta.'],
  },
  'seller.tab.ORDERS': {
    title: 'Orders (order se delivery tak)',
    what: 'Har order ko Confirm → Packed → Ship → Delivered tak le jayein.',
    steps: [
      'Orders tab kholein. Upar filter se "naye", "ship karne wale" waghera chunein.',
      'Naye order par customer ko "Confirm on WhatsApp" se tasdeeq karein, phir "✓ Confirm" dabayein.',
      'Parcel pack ho jaye to "📦 Packed" dabayein.',
      'Courier connected ho to "Book & ship" dabayein: tracking number khud aa jata hai. Warna courier chun kar tracking number likhein aur "Ship" dabayein.',
      'Customer ko "Send tracking on WhatsApp" se tracking bhej dein.',
      'Parcel pahunch jaye to "✓ Delivered" dabayein (courier connected ho to yeh khud ho jata hai).',
    ],
    tips: [
      'Order confirm hone ke 48 ghante ke andar courier ko dena zaroori hai, warna late shumar hota hai.',
      'Jo product doosri app (Oshi, YourMart...) se hai, us par "Order these items on the source app" likha aata hai: wahan se order kar lein.',
    ],
  },
  'seller.tab.PRODUCTS': {
    title: 'Products (listing)',
    what: 'Naye products daalein, purane badlein, ya CSV se ek saath bohat se products daalein.',
    steps: [
      'Products tab kholein.',
      'Ek product ke liye "New product" dabayein aur form bharein (har khane ke saath ? mein tafseel hai).',
      'Bohat se products ke liye "CSV / Bulk listing" dabayein.',
      'Purana product badalna ho to us par "Edit" dabayein, tabdeeli karein, phir Save.',
      'Upar search box mein naam, SKU ya category likh kar product dhoondein.',
    ],
    tips: ['"Hidden by store" ka matlab hai store ne product rok diya: wajah parh kar theek karein aur dobara save karein.'],
  },
  'seller.tab.RETURNS': {
    title: 'Returns (wapsi ki darkhwastein)',
    what: 'Customer ne product wapis karne ki darkhwast di ho to yahan apna jawab dein.',
    steps: [
      'Returns tab kholein. Har darkhwast mein customer ki wajah aur tasveer hoti hai.',
      '"Your side" mein apni baat likhein (jaise "dispatch se pehle check kiya tha, packing ki photo...").',
      'Bhej dein. Faisla store karta hai; "Store decision" mein nazar aata hai.',
    ],
    tips: ['Packing ke waqt parcel ki photo rakhein; return ke jhagre mein kaam aati hai.'],
  },
  'seller.tab.EARNINGS': {
    title: 'Earnings (aap ki kamai aur payouts)',
    what: 'Har delivered order ki kamai, commission aur aap ko bheje gaye payments.',
    steps: [
      'Earnings tab kholein.',
      'Har order ki "your earning" = order ki raqam − store ka commission.',
      'Order "Delivered" hone ke baad kamai payout ke liye tayyar hoti hai.',
      '"Payouts" mein woh raqam hai jo store ne aap ke bank / wallet mein bhej di (reference ke saath).',
      '"Return charges (unpaid)" mein wapsi ke kharche hain jo agle payout se katenge.',
    ],
    tips: ['Payout aap ke Profile mein diye gaye bank / wallet number par aata hai: usay sahi rakhein.'],
  },
  'seller.tab.REVIEWS': {
    title: 'Reviews (customer ki raaye)',
    what: 'Customers ki rating, reviews, likes aur dislikes.',
    steps: [
      'Reviews tab kholein.',
      'Upar aap ki average rating hai. Neeche har review.',
      'Review ke neeche "Your public reply" mein jawab likh kar bhejein; sab customers dekh sakte hain.',
      '"Likes & dislikes per product" se pata chalta hai kaun sa product pasand aa raha hai.',
    ],
    tips: ['Bure review par bhi tameez se jawab dein aur masla hal karne ki baat karein.'],
  },
  'seller.tab.QUESTIONS': {
    title: 'Questions (product ke baare mein sawal)',
    what: 'Customers product page par sawal poochhte hain; aap ka jawab sab ko nazar aata hai.',
    steps: ['Questions tab kholein.', 'Sawal ke neeche jawab likhein.', 'Bhejein: jawab product page par lag jata hai aur customer ko email chali jati hai.'],
    tips: ['Jaldi jawab dene se sale barhti hai.'],
  },
  'seller.tab.MESSAGES': {
    title: 'Messages (store se baat chit)',
    what: 'Store ke notices aur aap ki shikayatein / sawal.',
    steps: [
      'Messages tab kholein. "Notices from the store" mein store ke elaan hain.',
      'Store ko kuch kehna ho to "New complaint / message" dabayein.',
      '"What is it about?" chunein, order number (agar ho) likhein, Subject aur message likh kar bhej dein.',
      'Jawab yahin aata hai. Band baat chit par dobara likhne se woh phir khul jati hai.',
    ],
  },
  'seller.tab.PROFILE': {
    title: 'Profile (dukaan aur payout ki maloomat)',
    what: 'Mobile, shehar, pata, tasveer aur payout ka bank / wallet.',
    steps: [
      'Profile tab kholein.',
      'Mobile, City aur Address sahi likhein: courier yahin se parcel uthata hai.',
      'Bank / wallet, Account title aur Account number / IBAN likhein: payouts yahin aate hain.',
      'Tasveer badalni ho to upar apni tasveer par click karein.',
      'Save dabayein.',
    ],
    tips: ['Dukaan ka naam badalna ho to store se Messages mein rabta karein.'],
  },
  'seller.tab.RULES': {
    title: 'Seller rules',
    what: 'Dukaan chalane ke qawaid. Inhein manna zaroori hai.',
    steps: ['"Seller rules" kholein aur poore parhein.', 'Qawaid badlen to Seller Center dobara manzoori maangta hai: parh kar "I have read these rules" dabayein.'],
    tips: ['Qawaid todne par warning, phir account rok diya ja sakta hai.'],
  },

  // =============================================================== SELLER: product form
  'seller.product.name': {
    title: 'Product ka naam',
    steps: [
      'Saaf aur poora naam likhein: kya cheez hai + khaas baat. Jaise "Wireless Bluetooth Earbuds with Charging Case".',
      'Naam likhte hi neeche category ki tajweez aa jati hai.',
    ],
    tips: ['Sirf CAPITAL letters, emoji ya "best/sasta" jaise alfaaz na likhein.'],
  },
  'seller.product.category': {
    title: 'Category',
    steps: [
      'Search box mein likhein (jaise "shoes", "charger").',
      'List se sahi category chunein, ya naam ki base par "Suggested" mein se ek par click karein.',
      'List mein na ho to "other..." mein khud likh dein.',
    ],
    tips: ['Sahi category se customer product aasani se dhoondta hai.'],
  },
  'seller.product.price': {
    title: 'Qeemat (Price) aur purani qeemat',
    steps: [
      '"Price (PKR)" mein woh qeemat likhein jis par bechna hai.',
      'Discount dikhana ho to "Old price" mein purani (zyada) qeemat likhein; woh kati hui nazar aayegi.',
      'Discount na ho to Old price khali chhor dein.',
    ],
    tips: ['Old price sach honi chahiye; nakli discount qawaid ke khilaf hai.'],
  },
  'seller.product.stock': {
    title: 'Stock (kitne piece hain)',
    steps: [
      'Jitne piece aap foran bhej sakte hain, utne likhein.',
      'Variants (rang / size) lagaye hon to stock har variant mein alag likhein; yahan total khud ban jata hai.',
      'Stock 0 ho jaye to product "out of stock" dikhta hai aur order nahi aata.',
    ],
  },
  'seller.product.variants': {
    title: 'Variants (rang, size waghera)',
    what: 'Ek hi product ke kai options, jaise Red / Blue ya S / M / L.',
    steps: [
      '"Add variants" dabayein.',
      '"What does the customer choose?" mein likhein, jaise "Colour" ya "Size".',
      'Har option ki line mein naam (jaise "Red / Large") aur stock likhein. Qeemat alag ho to likh dein, warna khali.',
      'Aur option ke liye "Add one more" dabayein.',
      'Neeche "Total stock" khud jud jata hai.',
    ],
    tips: ['Customer product page par option chun kar order karta hai; stock usi option se kat-ta hai.'],
  },
  'seller.product.brand': {
    title: 'Brand aur invoice',
    steps: [
      'Brand ka naam likhein (jaise "Dolphin"). Brand na ho to "No brand" chunein.',
      'Branded electronics ya mash-hoor brand ke liye kharidari ki invoice ya brand ki ijazat (PDF ya tasveer) "Upload invoice" se lagayein.',
      '"No brand" par invoice ka khana nahi aata.',
    ],
    tips: ['Nakli (copy) brand bechna mana hai.'],
  },
  'seller.product.media': {
    title: 'Tasveerein aur video',
    steps: [
      'Tasveer upload karein (zyada se zyada 5 MB). Pehli tasveer "MAIN" hoti hai: wahi list mein dikhti hai.',
      'Ya tasveer ka link paste karke "Add link" dabayein.',
      'Video (optional): "Upload video" (50 MB tak) ya YouTube link paste karein.',
      'Ghalat tasveer par Remove dabayein.',
    ],
    tips: ['Saaf, roshan aur safed background wali tasveerein zyada bikti hain.'],
  },
  'seller.product.ai': {
    title: 'AI se description likhwana',
    steps: [
      'Pehle naam aur category bharein.',
      '"Let AI write..." wala button dabayein.',
      'Description aur key features khud bhar jate hain. Parh kar zaroorat ho to theek karein.',
    ],
    tips: ['AI busy ho to ek saada description khud ban jata hai; usay behtar kar lein.'],
  },
  'seller.product.description': {
    title: 'Description aur Key features',
    steps: [
      '"Description" mein 2-3 lines: kya cheez hai aur kyun achhi hai.',
      '"Key features" mein har khoobi alag line par likhein; product page par har line bullet ban jati hai.',
    ],
  },
  'seller.product.specs': {
    title: 'Specifications, istemal aur dekh bhaal (optional)',
    steps: [
      'Barcode, model, material, size, mulk, warranty jo maloom ho likhein; baqi khali chhor dein.',
      '"How to use" mein har qadam alag line par.',
      'Unboxing video aur user manual (PDF) zaroori nahi; ho to laga dein.',
    ],
  },
  'seller.product.source': {
    title: 'Product source (kahan se aata hai)',
    what: 'Sirf aap aur store team dekhte hain; customer ko kabhi nazar nahi aata.',
    steps: [
      'Apna stock ho to "Direct seller / own stock" chunein.',
      'Doosri app se mangwate hain to woh app chunein (Oshi, YourMart, HHC, Markaz...). List mein na ho to "other app..." mein likhein.',
      'Us app ka link aur unki qeemat (optional) likh dein: order aane par wahan se mangwane mein aasani hogi.',
    ],
  },
  'seller.product.weight': {
    title: 'Wazan aur Status',
    steps: [
      'Packing ke saath andazan wazan (kg) likhein; delivery charge isi se banta hai.',
      '"Live" = store mein nazar aata hai. "Draft" = chhupa hua (baad mein live kar sakte hain).',
    ],
  },
  'seller.product.new': {
    title: 'Naya product daalna',
    steps: [
      '"New product" dabayein.',
      'Naam, category, qeemat, stock, brand bharein (* wale zaroori hain).',
      'Tasveerein lagayein.',
      'Description khud likhein ya AI se likhwayein.',
      'Source chunein, wazan likhein, Status "Live" rakhein.',
      'Save dabayein. Product store mein aa jata hai (store kabhi check ke liye rok bhi sakta hai).',
    ],
  },
  'seller.bulk': {
    title: 'CSV / Bulk listing (ek saath bohat se products)',
    steps: [
      '"Download a sample (template) file" se namoona file lein.',
      'Excel ya Google Sheets mein har line mein ek product bharein (naam, qeemat, stock, category, tasveer ka link...).',
      'File ko CSV mein save karein (File → Save as / Download → CSV).',
      '"CSV / Bulk listing" mein file chunein.',
      'Jin products ki category nahi, un ke liye "Category for products that have none" chunein. Source khali ho to source bhi chunein.',
      'Check list mein galtiyan dekhein, phir upload karein.',
    ],
    tips: [
      'Wahi file dobara daalenge to system rok dega ("already uploaded").',
      'Naye file mein pehle se maujood product ho to sirf qeemat update hoti hai; duplicate nahi banta.',
      '"Save all as Draft" chunein to sab chhupe rahenge; check karke baad mein live karein.',
    ],
  },

  // =============================================================== SELLER: orders
  'seller.order.flow': {
    title: 'Order aane par kya karein',
    steps: [
      'Confirm: customer se WhatsApp par tasdeeq karein, phir "✓ Confirm".',
      'Packed: parcel tayyar ho to "📦 Packed".',
      'Ship: courier ko dein aur tracking ke saath "Ship" (ya "Book & ship").',
      'Delivered: pahunch jaye to "✓ Delivered".',
    ],
  },
  'seller.order.ship': {
    title: 'Ship karna (tracking number ke saath)',
    steps: [
      'Courier ko parcel dein aur us ki receipt se tracking number lein.',
      'List se courier chunein (TCS, Leopards...).',
      '"Courier tracking #" mein number likhein.',
      '"Ship" dabayein. Customer ko email chali jati hai.',
      '"Send tracking on WhatsApp" se customer ko bhi bhej dein.',
    ],
  },
  'seller.order.courier': {
    title: 'Book & ship (courier khud book)',
    what: 'Store ka courier account connected ho to ek button se booking.',
    steps: [
      'Courier chunein aur parcel ka wazan (kg) likhein.',
      '"Book & ship" dabayein.',
      'Courier tracking number deta hai aur order khud "Shipped" ho jata hai.',
      '"Print label" se label print karke parcel par chipkayein.',
      'Rider aap ke pickup address se parcel le jata hai. Delivery ki khabar khud aati rehti hai.',
    ],
    tips: ['COD ki raqam booking mein khud lag jati hai.'],
  },
  'seller.order.cancelRequest': {
    title: 'Customer ki cancel darkhwast',
    steps: [
      'Order par "Cancel requested" ho to customer cancel chahta hai.',
      'Abhi bheja nahi to "Accept and cancel order" dabayein (stock wapis aa jata hai).',
      'Pack ya ship ho chuka ho to "Decline" mein wajah likhein (jaise "already packed").',
    ],
  },
  'seller.order.supplier': {
    title: 'Doosri app se mangwana',
    steps: [
      'Jis item par "Order these items on the source app" ho, us ki app kholein.',
      '"Copy order for supplier" se customer ka naam, pata aur item copy karein.',
      'Us app mein order de dein, phir yahan aage ka kaam (Packed / Ship) karein.',
    ],
  },
  'seller.deals': {
    title: 'Flash deal (thori der ki sasti qeemat)',
    steps: [
      '"Deal price" mein kam qeemat likhein.',
      '"for" ke saath chunein deal kitne ghante chalegi.',
      '"Start deal" dabayein; deal "Anokhi Daily Deals" mein countdown ke saath aati hai.',
      'Waqt khatam hone par asal qeemat khud wapis aa jati hai. Pehle khatam karni ho to "End deal".',
    ],
  },

  // =============================================================== ADMIN: tabs
  'admin.tab.AI_COMMAND_CENTER': {
    title: 'AI Command Center',
    what: 'AI ko seedha hukm dein: SEO likhna, qeemat badalna, orders ka kaam.',
    steps: [
      'Box mein hukm likhein, jaise "sab earbuds ki SEO description likho".',
      '"Execute" dabayein.',
      'Bari tabdeeli se pehle AI "AI Safety Confirmation" maangta hai: dekh kar "Approve & Execute" ya "Cancel Action".',
      '"One-Click Demo AI Commands" mein tayyar misalein hain.',
    ],
    tips: ['Har tabdeeli Security Audit Log mein likhi jati hai.'],
  },
  'admin.tab.DASHBOARD': {
    title: 'Executive Analytics',
    what: 'Kul kamai, average order, stock ki maaliyat aur jo orders bhejne baqi hain.',
    steps: ['Tab kholein; sab hisaab khud banta hai.', '"View products →" se category ka stock dekhein.'],
  },
  'admin.tab.CATALOG': {
    title: 'Products (all sellers)',
    what: 'Sab sellers ke products dekhna aur zaroorat ho to store se hatana.',
    steps: [
      'Search mein naam, SKU, category ya seller likhein.',
      'Upar se seller chun kar sirf us ke products dekhein.',
      'Ghalat product par "Take off store" dabayein aur wajah likhein; seller ko nazar aati hai.',
      'Theek ho jaye to "Put back on store".',
    ],
  },
  'admin.tab.ORDERS': {
    title: 'Orders (all sellers)',
    what: 'Har order dekhna; zaroorat par roknа, return ya refund.',
    steps: [
      'Upar filter: "To be shipped", "On the way", "Delivered", "Cancelled / returned".',
      'Order par click karein: customer, items, payment aur tracking nazar aate hain.',
      'Bhejne se pehle rokna ho to "Cancel order".',
      'Wapis aaye to "Mark returned"; paise wapis kiye hon to "Record refund".',
      'Courier connected ho to "Book & ship" se booking bhi yahin se.',
    ],
    tips: ['Stock khud wapis aa jata hai.', 'Neela dabba = database full hone par aane wale orders; khud place ho jate hain.'],
  },
  'admin.tab.RETURNS': {
    title: 'Returns & Complaints',
    steps: [
      'Har darkhwast mein customer ki wajah, tasveer aur "Seller says" hota hai.',
      'Sahi ho to "Approve return", warna "Reject".',
      'Galti courier ya customer ki ho to "Not the seller\'s fault" chunein; seller par jurmana nahi lagta.',
    ],
  },
  'admin.tab.GROWTH': {
    title: 'Marketing & Growth',
    steps: [
      'Welcome discount: naye customers ka code aur % likhein.',
      'Refer & Earn: reward ki raqam (dost ka pehla order deliver hone par).',
      'Live purchase notifications: "Ayesha (Lahore) bought..." on/off.',
      'New sellers 0% commission: kitne din.',
      '"Save these settings" dabayein.',
      'Flash deals: product dhoondein, deal price likhein, "Start deal".',
      'Festival zones: title, badge, dates, products ke alfaaz likh kar "Save campaign".',
    ],
  },
  'admin.tab.TRAFFIC': {
    title: 'Traffic & Conversion',
    steps: [
      'Visitors, orders aur kahan se aaye (Google, Facebook...) dekhein.',
      '"Conversion funnel": kitne log product dekhte, cart mein daalte aur order karte hain.',
      'Sab se zyada dekhe / bike products, cancel aur return ki wajah.',
      'Gehra rang = rush ka waqt; deals aur ads usi waqt chalayein.',
      '"Excel" ya "PDF" se report download karein.',
    ],
  },
  'admin.tab.COUPONS': {
    title: 'Promotions & Coupons',
    steps: [
      '"Coupon Code" mein code likhein (jaise SUMMER20).',
      'Type chunein: % discount, fixed raqam, ya free delivery.',
      'Value aur kam se kam cart ki raqam likhein.',
      '"Save Coupon". Hatane ke liye "Delete".',
    ],
  },
  'admin.tab.REVIEWS': {
    title: 'Client Reviews',
    steps: ['Naye reviews dekhein.', 'Theek ho to "Approve", ghalat / ganda ho to "Reject".'],
  },
  'admin.tab.QUESTIONS': {
    title: 'Product Questions',
    steps: ['Customers ke sawal dekhein.', 'Jawab likh kar bhejein; product page par lag jata hai.'],
  },
  'admin.tab.AI_TASKS': {
    title: 'AI Background Tasks',
    steps: ['AI ke chalte / mukammal kaam yahan dikhte hain.', 'Rokna ho to "Cancel Task".'],
  },
  'admin.tab.AUDIT_LOGS': {
    title: 'Security Audit Log',
    steps: ['Kis ne kab kya badla (waqt, banda, kaam, cheez).', 'Kuch ajeeb lage to foran password badlein aur admin hatayein.'],
  },
  'admin.tab.NOTIFICATIONS': {
    title: 'Customer Inbox',
    what: 'Website chat aur contact form ke paigham; AI pehla jawab khud deta hai.',
    steps: [
      'Paigham par click karein; customer ka sawal aur AI ka jawab nazar aata hai.',
      '"Customer wants a person" ho to khud jawab dein: "Reply to customer" mein likh kar bhejein.',
      'WhatsApp par baat ke liye "Chat WhatsApp".',
      'Masla hal ho to "Mark Resolved".',
      '"Operational & Store Alerts" mein system ki khabrein; "Mark Read".',
    ],
  },
  'admin.tab.SELLER_INBOX': {
    title: 'Seller Messages',
    steps: [
      '"Complaint box" mein sellers ki shikayatein: kholein, "Send reply" se jawab dein.',
      '"Message a seller": seller chunein, subject aur message likh kar bhejein.',
      '"Notices to sellers": sab ya ek seller ko elaan. "Urgent alert" Seller Center mein sab se upar dikhta hai.',
    ],
  },
  'admin.tab.SELLERS': {
    title: 'Sellers & Payouts',
    steps: [
      'Nayi registration "Pending" mein aati hai: maloomat aur documents dekhein.',
      'Theek ho to "Approve" (seller ko email jati hai), warna "Reject" wajah ke saath.',
      'Qawaid todne par "Suspend".',
      '"Default commission" sab sellers ke liye; kisi ek ka alag "Commission %" bhi rakh sakte hain.',
      '"Full report →" mein seller ki sales, products, reviews aur payouts.',
      'Payout bhejne ke baad reference / TID likh kar record karein.',
    ],
  },
  'admin.tab.SETTINGS': {
    title: 'Store & AI Settings',
    steps: [
      'Admins aur owner login, login security.',
      'AI keys (backup keys).',
      'Home page ke texts aur ads, logo.',
      'Payment ke tareeqe (COD, NayaPay, Raast / bank), delivery charges, helpline aur policies.',
      'Har hisse ke apne ? mein tafseel hai. Tabdeeli ke baad Save dabayein.',
    ],
  },

  // =============================================================== ADMIN: sections
  'admin.couriers': {
    title: 'Courier accounts (PostEx, Leopards, Trax)',
    what: 'Ek dafa API key daalein: phir booking, label aur delivery ki khabar khud.',
    steps: [
      'Courier ka merchant account banwayein.',
      'Courier ki site par API key lein (har courier ke khane mein likha hai kahan milti hai).',
      'Key paste karke "Save & connect" dabayein; usi waqt check hoti hai.',
      '"Courier chosen first" mein pehla courier chunein.',
      'Sellers ko ijazat dena ho to "Sellers can book..." par tick.',
      '"Seller pickup addresses" mein har seller ka pickup address chunein (courier portal mein pehle banayein).',
      '"Check deliveries now" se foran delivery ki khabar lein (warna har 2 ghante khud).',
    ],
    tips: ['Key poori kabhi screen par nahi dikhti (sirf ••••1234).'],
  },
  'admin.aiKeys': {
    title: 'AI keys (backup)',
    what: 'Har muft key ki rozana had hai; kai keys = AI kabhi nahi rukta.',
    steps: [
      'aistudio.google.com/apikey kholein aur ek Gmail se login karein.',
      '"Create API key" (poochhe to "Create in new project"), key copy karein.',
      'Yahan paste karein. Kai keys ek saath: har line par ek.',
      '"Add key(s)" dabayein; har key check hoti hai.',
      'Har key ke saath "ready" (hara) ya "resting" (peela) nazar aata hai.',
    ],
    tips: ['Har key alag Gmail se banayein; ek Gmail ki sab keys ki had ek hoti hai.', 'Keys kisi ko na bhejein.'],
  },
  'admin.orderQueue': {
    title: 'Intezar wale orders',
    steps: [
      'Database ki rozana had khatam ho to orders laptop par mehfooz ho jate hain.',
      'Har 5 minute baad khud database mein chale jate hain (wahi order number).',
      'Foran koshish ke liye "Try now".',
      'Laal list wale (stock khatam ho gaya) customer ko call karein, phir "Done".',
    ],
  },
  'admin.team': {
    title: 'Admins & Owner Login',
    steps: [
      'Naya admin: email likhein, role chunein, add karein. Us email ko invite link bhejein (Copy / WhatsApp).',
      'Hatana ho to "Remove".',
      'Owner badalna (sirf Super Admin): "Owner badlein" mein naya email.',
    ],
    tips: ['Admin role sirf tasdeeq-shuda email ko milta hai.'],
  },
  'admin.loginSecurity': {
    title: 'Login security (Telegram code)',
    steps: ['Phone par Telegram install karein.', '"Connect Telegram" dabayein, Telegram mein START dabayein.', 'Wapis aayein; khud connect ho jata hai. Admin login par code Telegram par aata hai.'],
  },
  'admin.storeTexts': {
    title: 'Home page texts aur ads',
    steps: [
      'Home page, banner aur About Us ke alfaaz yahan badlein.',
      '"Become a seller" ad ka title, text aur button bhi yahin; dikhana band karna ho to tick hata dein.',
      'Save dabayein; foran store par aa jata hai.',
    ],
  },
  'admin.logo': {
    title: 'Store ka logo',
    steps: ['Logo ki tasveer (PNG behtar) chunein aur upload karein.', 'Logo mein naam pehle se likha ho to us ka tick lagayein, taa ke naam do dafa na aaye.'],
  },
  'admin.payments': {
    title: 'Payment ke tareeqe',
    steps: [
      'COD: on/off aur kam se kam / zyada se zyada order ki raqam.',
      'NayaPay: account title aur number; customer TID daal kar batata hai, aap tasdeeq karte hain.',
      'Raast / Bank: account title, bank, IBAN aur hidayat.',
      'JazzCash / Easypaisa: merchant keys (payment company deti hai).',
      '"Save All Settings" dabayein.',
    ],
    tips: ['Bank transfer ke orders par TID check karke hi "Approve" karein.'],
  },
  'admin.shipping': {
    title: 'Delivery charges',
    steps: [
      'Pakistan: base fee (pehle kg ki), har agle kg ki fee, aur kis raqam se upar delivery free.',
      'Bahar ke mulk: zone banayein, mulk chunein, fees aur courier likhein. Rates maloom na hon to "Fill recommended rates".',
      '"Save zones" dabayein.',
    ],
  },
  'admin.helpline': {
    title: 'Helpline aur WhatsApp',
    steps: ['WhatsApp number (do tarah: dikhane wala aur 92 se shuru), email, phone aur waqt likhein.', 'Save dabayein; website ke chat aur Contact page par yahi aata hai.'],
  },
  'admin.policies': {
    title: 'Policies (Refund, Shipping, Terms, Privacy)',
    steps: ['Har policy ke khane mein text likhein (### se heading, - se bullet).', '"Save Policies & Legal Content" dabayein; footer ke pages par lag jata hai.'],
  },
  'admin.backup': {
    title: 'Backup & Restore',
    steps: ['"Backup" se store ka data file mein download karein.', 'Mushkil waqt mein "Restore" se wapis laayein (sirf zaroorat par).'],
    tips: ['Har hafte ek backup rakhein.'],
  },
  'admin.sellerDetail': {
    title: 'Seller ki poori report',
    steps: [
      'Seller ki maloomat, documents, sales, products, orders aur payouts ek jagah.',
      'Qawaid todne par "Send warning" wajah ke saath.',
      'Payout record: reference / TID likh kar save.',
    ],
  },
};
