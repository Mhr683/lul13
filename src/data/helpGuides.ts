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
    what: 'Har order ko dot ba dot le jayein: Accepted → Packing → Label → Ready for pickup → Courier → Delivered.',
    steps: [
      'Orders tab kholein. Upar "Parcel count" ke dabbe se list chunein (To ship, On the way, Coming back...).',
      'Naya order dekhein. Customer se kuch poochhna ho to order card ke "💬 Chat" mein likhein, phir "✓ Accept order" dabayein.',
      'Phir har kaam ke baad agla button: Start packing → Packing complete → Label attached → Ready for pickup.',
      'Courier connected ho to "Book & ship" dabayein: tracking number khud aa jata hai. Warna courier chun kar tracking number likhein aur "Handed to courier" dabayein.',
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
    what: 'Raaste se wapis aate parcel (deliver nahi hue) sab se upar nazar aate hain. Neeche customer ki wapsi ki darkhwastein hain.',
    steps: [
      'Upar "↩ Coming back" wale parcel: courier inhein wapis la raha hai. Parcel haath mein aaye to "📦 Return received" dabayein (stock wapis jud jata hai).',
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
    title: 'Messages (customer, store aur AI coach alag alag)',
    what: 'Yahan 3 dabbe hain: 🛍️ Customers, 🏪 Store / Admin aur 🤖 AI Coach. Har message par likha hota hai ke kis ki taraf se aaya.',
    steps: [
      'Messages tab kholein. Jis dabbe mein naya message ho woh khud khulta hai, aur us par laal number hota hai.',
      '🛍️ Customers: buyers ke returns aur shikayatein. Inhein sab se pehle dekhein. Product ke sawal Questions tab mein hain (neeche button).',
      '🏪 Store / Admin: store team ke notices, store ke qawaid (late dispatch, return charge waghera) aur store se aap ki baat chit.',
      'Store ko kuch kehna ho to Store / Admin mein "New complaint / message" dabayein, "What is it about?" chunein, order number (agar ho), Subject aur message likh kar bhej dein.',
      'Jawab yahin aata hai. Band baat chit par dobara likhne se woh phir khul jati hai.',
      '🤖 AI Coach: dukaan behtar karne ke mashware. Yeh hukam nahi, salah hai. Poori report Dashboard par hai.',
    ],
    tips: [
      'Upar ki ghanti (🔔) ka number sirf customers aur store ke messages ginta hai; AI coach ke mashware us mein nahi gine jate, taake zaroori message gum na hon.',
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
    tips: [
      'Sirf CAPITAL letters, emoji ya "best/sasta" jaise alfaaz na likhein.',
      'Naam, description, variants ya kahin bhi listing mein phone number, WhatsApp, email ya "call karein" likhna mana hai: product save nahi hoga.',
    ],
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
      'Digital product, software, service aur subscription mein stock nahi likhna parta: yeh jitne chahein bik sakte hain.',
    ],
  },
  'seller.product.type': {
    title: 'Aap kya bech rahe hain? (product ki qisam)',
    what: 'Naya product daalte waqt pehle us ki qisam chunein. Har qisam ka apna form hai, aur customer ko store par wahi icon dikhta hai.',
    steps: [
      'Physical product: asli cheez jo courier se jaye (kapre, electronics). COD chalta hai.',
      'Digital product: e-book, PDF, course, template, pattern. Customer pehle payment karta hai, phir use download link milta hai. Courier nahi.',
      'Software & apps: download link + har customer ke liye alag license key. Keys ek line mein ek likhein.',
      'Service: web design, logo, tuition, repairing. Kitne din mein kaam hoga aur kitni dafa tabdeeli (revisions) likhein. Customer order par apni zaroorat likhta hai.',
      'Wholesale: dukaandaron ke liye. Kam az kam kitne piece, aur zyada lene par sasti qeemat ke steps.',
      'Rent: qeemat ek din ki. Kam se kam / zyada se zyada din, aur wapsi wali zamanat (deposit) likhein.',
      'Print on demand / custom: customer ka naam ya text chhaap kar (shirt, mug). Customer order par text likhta hai.',
      'Subscription: mahine ya saal ki fees (paid group, classes). Payment pehle hoti hai.',
      'Ghalat qisam chun li ho to form ke upar "Change" dabayein.',
    ],
    tips: ['Download, software, service aur subscription par COD nahi hota aur delivery charge bhi nahi lagta.'],
  },
  'seller.product.delivery': {
    title: 'Customer ko payment ke baad kya milega (download)',
    what: 'Digital aur software products ki file ya link. Yeh sirf un customers ko dikhta hai jin ki payment confirm ho chuki ho.',
    steps: [
      'Google Drive ya Dropbox ka link daalein (sharing "Anyone with the link" par ho), ya "Upload file" se file daalein.',
      'Neeche chahein to download / install karne ka tareeqa ya ZIP ka password likh dein.',
      'Software: license keys ek line mein ek likhein. Har order par agli key khud chali jati hai, aur bachi hui keys ki ginti neeche dikhti hai.',
      'Payment confirm hote hi customer apne order ke safhe par "Download" button aur key dekh leta hai.',
    ],
    tips: ['Keys khatam hone se pehle nayi keys daal dein, warna customer ko key nahi milegi.'],
  },
  'seller.product.video': {
    title: 'AI se product ki video banayein',
    what: 'Jis product ki video nahi, us ki tasveeron se AI ek 15 second ki ad jaisi video banata hai: chalti tasveerein, likhe hue alfaaz, qeemat aur music. Muft hai, koi paid video service nahi lagti.',
    steps: [
      'Dashboard par Shop Coach mein "✨ Self fix" dabayein, ya product form mein "Photos & video" ke neeche "✨ No video? Make one with AI".',
      'Box mein likhein kaisi video chahiye (kisi bhi zabaan mein), jaise "Eid sale, sunehra rang, naram aur aaraam deh dikhao". Neeche ke buttons se idea bhi jod sakte hain.',
      '"Make my video" dabayein aur screen khuli rakhein. Takreeban 20 second mein video ban jati hai.',
      'Video dekh lein. Pasand ho to "Add to my listing" dabayein, customers ko foran nazar aayegi. Pasand na ho to "Change and make again".',
      '"Save to phone" se video WhatsApp / Facebook par lagane ke liye bhi rakh sakte hain.',
    ],
    tips: [
      'Video product ki apni save ki hui tasveeron se banti hai: pehle achi aur zyada tasveerein daal kar product save karein.',
      'Qeemat aur discount hamesha listing se aate hain; AI apni taraf se koi feature ya offer nahi likhta.',
      'Behtareen nateeja Google Chrome mein aata hai.',
      'Apni AI key ke baghair roz 3 muft AI kaam hain. Woh khatam hon to video phir bhi banti hai, magar tayyar design se; apni key lagayein to AI har video aap ke alfaaz se design karta hai.',
      'Muft video mein product khud harkat karta hai: car sadak par chalti hai, joota ghoomte stand par, drone aasman mein. Is ke liye tasveer ka background saada (safed / ek rang) hona chahiye; bhari background wali tasveer sirf zoom hoti hai.',
      '"Pro AI video ✨" tab: Google ki video AI asli chalti hui video banati hai (jaise car highway par daurti hui). Yeh muft nahi: Google aap ke apne card se takreeban PKR 20 fi second kaatta hai (8 second = takreeban PKR 160). Store kuch nahi leta.',
      'Pro video sirf aap ki apni AI key se banti hai, aur us key ke Google project par billing ON honi chahiye (AI Studio mein "Set up billing"; card aap khud daalein). Roz 10 Pro videos ki had hai taa ke ghalti se zyada paise na katen.',
      'Awaz (voice-over): muft video mein "Woman\'s voice" ya "Man\'s voice" aur Urdu / English chunein. AI product ki khoobiyan aur qeemat bolta hai, music awaz ke neeche halka ho jata hai. Apni key ke baghair ek video mein 2 muft AI kaam lagte hain (plan + awaz).',
      'Pro video mein "Someone talking about it": AI aurat, AI mard, ya "A person from my photo". Woh insaan product pakad kar camera ki taraf dekh kar bolta hai, honth, aankhein aur haath qudrati chalte hain. Kam se kam 8 second chunein.',
      'Apni ya kisi ki tasveer sirf ijazat se lagayein (koi mashhoor shakhsiyat ya bina ijazat kisi ki tasveer bilkul nahi). Tasveer sirf usi video ke liye istemal hoti hai, save nahi hoti. Google bachon ki tasveer aur kuch chehre mana kar deta hai.',
      'AI se bani har video par product page par chhota sa "AI video" ka nishan aata hai, taake customer ko dhoka na ho.',
      'Pro video banne mein 1 se 3 minute lagte hain. Khidki band kar sakte hain; usi product ki video khidki dobara kholein to video wahin milegi.',
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
    tips: ['Description mein phone number, WhatsApp, email ya "call / inbox karein" na likhein: customer store ke zariye order aur sawal karte hain. Aisi listing save nahi hoti.'],
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
      'Chunein aap kya bech rahe hain (Physical, Digital, Software, Service, Wholesale, Rent, Print on demand, Subscription).',
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
      'Confirm: order dekhein; kuch poochhna ho to order card ke "💬 Chat" mein customer se poochhein, phir "✓ Confirm".',
      'Packed: parcel tayyar ho to "📦 Packed".',
      'Ship: courier ko dein aur tracking ke saath "Ship" (ya "Book & ship").',
      'Delivered: pahunch jaye to "✓ Delivered".',
    ],
  },
  'seller.order.count': {
    title: 'Parcel count (pura hisaab)',
    what: 'Har order sirf ek dabbe mein ginta hai, is liye sab dabbe jor kar hamesha kul orders ke barabar hote hain ("✓ all counted").',
    steps: [
      'To ship: abhi bhejne hain.',
      'On the way: courier ke paas, customer ki taraf ja rahe hain.',
      'Coming back: deliver nahi hue, aap ki taraf wapis aa rahe hain.',
      'Delivered: customer ko mil gaye.',
      'Returned: wapis aap ke paas pohanch gaye (ya customer ne baad mein wapis kiye).',
      'Cancelled: cancel hue.',
      'Har dabbe ke neeche un orders ki kul raqam hai. Dabba dabayein to wohi orders neeche khul jate hain; "All orders" se sab.',
    ],
    tips: [
      'Return rate = wapis aane wale parcel / (delivered + wapis). 15% se upar ho to laal: customer se order confirm karke bhejein.',
      'Failed delivery attempts: rider kitni dafa parcel de na saka.',
    ],
  },
  'seller.order.delivery': {
    title: 'Delivery mein masla (attempt ya wapsi)',
    what: 'Parcel courier ke paas ho aur deliver na ho sake to yahan likhein. Courier connected ho to yeh sab khud bhi likha jata hai.',
    steps: [
      '"⚠️ Delivery problem?" dabayein aur wajah chunein.',
      'Rider dobara koshish karega: "Attempt failed, rider will try again". Card par "1 failed attempt" likha aata hai.',
      'Customer ne parcel nahi liya / cancel kiya: "↩ Parcel is coming back". Order "Coming back" mein chala jata hai aur Returns tab ke upar bhi nazar aata hai.',
      'Parcel wapis haath mein aaye to "📦 Return received" dabayein. Stock wapis jud jata hai aur order "Returned" mein gina jata hai.',
      'Har qadam customer ko bhi update ki surat mein milta hai, aur card ke "Parcel history" mein har jagah aur waqt likha hota hai.',
    ],
    tips: ['Wapis aane wale parcel ki kamai payout mein nahi judti.'],
  },
  'seller.order.steps': {
    title: 'Order ka raasta (har kaam ka dot)',
    what: 'Har order par 8 dot hain. Kaam pura ho to agla dot (ya neeche wala button) dabayein: dot hara ho jata hai aur customer ko foran update milti hai.',
    steps: [
      'Order accepted: order manzoor karein.',
      'Start packing: packing shuru karein.',
      'Complete packing: packing mukammal.',
      'Attach label: parcel par label laga diya.',
      'Ready for pickup: parcel courier ke liye tayyar. Ab customer ka number nazar aata hai.',
      'Hand over to courier: courier aur tracking number likh kar "Handed to courier" dabayein.',
      'Out for delivery, phir Delivered.',
    ],
    tips: [
      'Har dot ke neeche woh waqt likha hota hai jab aap ne use dabaya.',
      'Customer ko har qadam ki khabar uske order page aur 🔔 ghanti mein milti hai.',
      'Order cancel karna ho to "More" mein "Cancel order".',
    ],
  },
  'seller.order.ship': {
    title: 'Courier ke hawale karna (tracking number ke saath)',
    steps: [
      'Courier ko parcel dein aur us ki receipt se tracking number lein.',
      'List se courier chunein (TCS, Leopards...).',
      '"Courier tracking #" mein number likhein.',
      '"Handed to courier" dabayein. Customer ko update chali jati hai.',
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
  'seller.social': {
    title: 'Shop connect to media: apni dukaan ke pages jodein aur share karein',
    what: 'Facebook, Instagram, YouTube, TikTok, X, Telegram aur WhatsApp ke links. Yeh aap ki dukaan ke page par "Follow us" ke saath nazar aate hain.',
    steps: [
      'Profile kholein aur "Shop connect to media" hissa dekhein.',
      'Jis platform par aap ka page hai us ke khane mein page ka link paste karein (jaise facebook.com/aapkipage). Link app mein "Share" → "Copy link" se milta hai.',
      'Usi khane ke saath hara "Connect" button dabayein: link foran save ho jata hai aur button ki jagah "✓ Connected" aa jata hai.',
      'List mein na ho (Pinterest, Snapchat, Threads, website...) to "Add another link" dabayein: naam aur link likh kar uske saath "Connect" dabayein.',
      'Ghalat link par laal likhai batati hai kya theek karna hai. Hatana ho to khana khali karein aur laal "Remove" dabayein (other links mein ✕).',
      '"Share my shop" se poori dukaan ka link kisi bhi app par bhejein.',
      'Product share karne ke liye Products mein "Share" dabayein: WhatsApp, Facebook, X, Telegram seedha khulte hain; Instagram, TikTok, YouTube ke liye caption aur link copy ho jata hai, app mein paste kar dein.',
    ],
    tips: [
      'WhatsApp ke khane mein apna number (jaise 03001234567), group ya channel ka link daal sakte hain.',
      'Number sirf social media mein allowed hai. Order chat aur product listing (naam, description) mein number, WhatsApp ya email likhna mana hai.',
      'Zyada se zyada 12 links.',
    ],
  },
  'seller.alerts': {
    title: 'Ghanti: naye order aur customer message par awaz',
    what: 'Naya order aaye ya customer chat mein likhe to Seller Center mein ghanti bajti hai, phone vibrate hota hai aur (ijazat ho to) phone par notification aati hai.',
    steps: [
      'Dashboard ya Orders par peeli patti mein "Turn on alerts" dabayein, phir "Allow" dabayein.',
      'Seller Center ko band na karein, sirf peeche (background) chhod dein. Har takreeban 1 minute mein naye order / message check hote hain.',
      'Naye order par "ding-dong" do dafa, naye message par halki "ding". Notification dabane se Orders khul jata hai.',
      'Awaz band / chalu karni ho to upar 🔊 / 🔇 button dabayein.',
    ],
    tips: [
      'Browser pehli dafa awaz tab chalata hai jab aap page par ek dafa kahin tap kar dein.',
      'Phone ki awaz (ringer / media volume) on rakhein. Seller Center app (Install) kar lein to behtar chalta hai.',
      'Agar Seller Center poori tarah band (swipe karke hata diya) ho to ghanti nahi bajti; dobara kholte hi naye order nazar aa jate hain.',
      'Notifications "Blocked" hon to browser mein address ke saath taale (🔒) ka nishan dabayein aur Notifications "Allow" karein.',
    ],
  },
  'seller.order.chat': {
    title: 'Customer se chat aur customer ka number',
    what: 'Har order par customer se chat hoti hai. Order khatam (delivered / cancel / return) to chat band. Customer ka number "Ready for pickup" dabane ke baad hi dikhta hai.',
    steps: [
      'Order card par hara "💬 Chat with ..." dabayein. Naye paigham par laal "new" likha hota hai.',
      'Paigham likh kar bhejein. Customer ko apne order ke page par nazar aata hai.',
      'Parcel tayyar ho to order ke raaste mein "📍 Ready for pickup" tak pohanchein: tab customer ka phone number courier ke liye nazar aa jata hai.',
      'Parcel deliver hone par number aur chat dono band ho jate hain.',
      'Aap mojood na hon to "🤖 AI" aap ki taraf se customer ko foran jawab deta hai: order accept hua ya nahi, der kyun, order kahan hai (courier aur tracking number), cancel kaise hota hai. Us ke jawab par "🤖 AI replied for you" likha hota hai.',
      'AI kabhi bank / JazzCash / Easypaisa account ya koi number nahi deta, kabhi order cancel nahi karta aur refund ya delivery ki tareekh ka waada nahi karta: sirf store ke buttons aur qaanoon batata hai.',
      'Aap khud jawab dein to AI 30 minute chup rehta hai. Band / chalu karna ho to Orders page ke sab se upar (ya kisi chat ke upar) "🤖 AI replies..." ka tick lagayein ya hatayein.',
      'Chat sirf chalte hue order par khulti hai (cancel / deliver hone ke baad band). AI ka jawab dekhne ke liye naya test order lagayein.',
    ],
    tips: [
      'Apni AI key (AI Assistant tab) ho to AI ke jawab us se bante hain aur zyada achhe hote hain; key na ho to store ka AI roz mehdood jawab deta hai, phir tayyar jawab chalte hain.',
      'Chat mein phone number, email, link, "WhatsApp karo / call karo" likhna mana hai: aisa paigham jata hi nahi aur store ko pata chal jata hai.',
      'Store se bahar deal karna Seller Rules ke khilaf hai: is mein na customer ki hifazat hai na aap ke paise ki.',
      'Doosri app (Oshi, YourMart...) wale order par number "✓ Sent to supplier" dabane ke baad dikhta hai, taake supplier ko pata de saken.',
      'Customer ka email seller ko kabhi nahi dikhta.',
    ],
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
    steps: [
      'WhatsApp number (do tarah: dikhane wala aur 92 se shuru), email, phone, waqt aur Head Office ka pata likhein.',
      'Save dabayein; website ke chat aur Contact page par yahi aata hai. Phone ya pata khali ho to woh dikhta hi nahi.',
    ],
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
