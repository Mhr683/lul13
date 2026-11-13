import type { HelpGuide } from './helpGuides';

// More detailed guides (second round): every part of Admin → Store & AI Settings, the seller sign-up,
// and fuller step-by-step versions of guides that were too short. An id here replaces the same id in
// helpGuides.ts.

const SAVES_ITSELF = 'Is hisse ki tabdeeli likhte hi khud save ho jati hai (alag Save dabane ki zaroorat nahi). Tasalli ke liye neeche "Save All Settings" dabane mein bhi koi harj nahi.';

export const HELP_GUIDES_MORE: Record<string, HelpGuide> = {
  // =============================================================== ADMIN → SETTINGS (har hissa)
  'admin.tab.SETTINGS': {
    title: 'Store & AI Settings (poora naqsha)',
    what: 'Store ki saari bunyadi settings ek page par. Har hisse ke saath alag ? hai.',
    steps: [
      'Sidebar mein "Store & AI Settings" kholein.',
      'Sab se upar: Admins & Owner Login (kaun admin hai), phir Login security (Telegram code).',
      'Phir AI keys (backup Gemini keys), Home page texts, aur Backup & Restore.',
      '01: Store ka naam, tagline, logo, currency, mulk, support email, pata, dollar rate, tax.',
      '02: Pakistan ke andar delivery charges.',
      '03: Payment ke tareeqe: JazzCash / Easypaisa keys, Google Maps key, COD, NayaPay, Raast / bank.',
      '04: Bahar ke mulkon ki delivery (zones).',
      '05: Helpline / WhatsApp, aur Policies (Refund, Shipping, Terms, Privacy).',
      'Har hisse ke ? par click karke us ka poora tareeqa parhein.',
    ],
    tips: [
      'Zyada tar khane likhte hi khud save ho jate hain. Jin hisson ka apna Save button hai (Home page texts, JazzCash keys, Delivery zones, AI keys, Admins), wahan Save dabana zaroori hai.',
      'Kabhi bhi koi API key ya password aam khanon mein na likhein; sirf us ke apne "private" khane mein.',
    ],
  },
  'admin.settings.identity': {
    title: '01. Store ki pehchaan, currency aur tax',
    steps: [
      '"Store Legal Name": store ka sarkari / registered naam (receipt aur emails par aata hai).',
      '"Store Tagline": ek chhoti line, jaise "Quality Products & Reliable Delivery".',
      'Store logo: neeche logo wale hisse ka apna ? dekhein.',
      '"Store Base Currency": PKR rehne dein (saari qeematein PKR mein hain).',
      '"Secondary Display Currency": doosri currency jo saath dikhani ho (jaise USD); na chahiye to khali.',
      '"Merchant Operating Country": Pakistan (PK).',
      '"Support Email": customers ke liye email, jaise anokhashoppinghub@gmail.com.',
      '"Store Physical Address": dukaan / daftar ka pata (receipt aur Contact page par).',
      '"USD to PKR Rate": 1 dollar kitne rupay ka (bahar ke customers ki qeemat isi se banti hai). Mahine mein ek dafa update karein.',
      '"Domestic Sales Tax (%)": agar tax lena ho to %; warna 0.',
    ],
    tips: [SAVES_ITSELF],
  },
  'admin.settings.domesticShipping': {
    title: '02. Pakistan ke andar delivery charges',
    what: 'Customer ko checkout par delivery charge isi hisab se dikhta hai.',
    steps: [
      '"Base Shipping Fee": pehle (shamil) wazan tak ka charge, jaise 250.',
      '"Included Weight (kg)": base fee mein kitna wazan shamil hai, jaise 1 kg.',
      '"Additional Per Kg": har agle kg ka charge, jaise 120. (1.2 kg = 2 kg gina jata hai.)',
      '"Free Shipping Threshold": is raqam se bara order ho to delivery free, jaise 5000. Free na karni ho to 0.',
      'Misaal: 2.5 kg parcel = 250 + 2 × 120 = 490 rupay (agar order free wali raqam se kam ho).',
    ],
    tips: [SAVES_ITSELF, 'Jis seller ne product par apna delivery charge rakha ho, us ke product par us ka charge lagta hai.'],
  },
  'admin.settings.gateways': {
    title: '03. Payment ke tareeqe (khulasa)',
    steps: [
      'Abhi store Cash on Delivery aur bank / NayaPay / Raast transfer (TID ke saath) leta hai.',
      'Card / JazzCash / Easypaisa se online payment ke liye pehle us company ka merchant account kholein.',
      'Company jo keys de, woh sirf "JazzCash / Easypaisa merchant keys" wale private khane mein daalein.',
      'Neeche har tareeqe (Google Maps, COD, NayaPay, Raast) ka apna ? hai.',
    ],
    tips: ['Keys kabhi kisi aur khane mein na likhein: baqi settings har visitor parh sakta hai.'],
  },
  'admin.settings.paymentKeys': {
    title: 'JazzCash / Easypaisa merchant keys',
    what: 'Online payment ki khufiya keys; sirf server par mehfooz rehti hain.',
    steps: [
      'JazzCash ya Easypaisa ka merchant account kholein (un ki branch / website se).',
      'Woh aap ko Merchant ID, Password, Integrity Salt (JazzCash) ya Store ID, Hash Key (Easypaisa) dete hain.',
      'Har cheez us ke naam wale khane mein paste karein.',
      '"Save keys" dabayein. Khane ke saath "Saved" likha aa jayega.',
      'Koi key hatani ho to us ke saath "Remove".',
    ],
    tips: ['Khali chhoda khana purani saved key ko nahi mitata.', 'Saved key dobara kabhi screen par nahi dikhti.'],
  },
  'admin.settings.maps': {
    title: 'Google Maps API key',
    what: 'Checkout par naqsha, pata khud likhna aur GPS location ke liye.',
    steps: [
      'console.cloud.google.com par "Google Maps Platform" kholein.',
      '"Maps JavaScript API" aur "Places API" on karein.',
      '"Credentials" mein "Create credentials → API key" dabayein aur key copy karein.',
      'Key ko sirf apni website (anokhashopinghub.shop) ke liye mehdood (restrict) kar dein.',
      'Yahan "Google Maps API Key" mein paste karein.',
    ],
    tips: [SAVES_ITSELF, 'Google Maps ka istemal had se barh jaye to Google paise leta hai; restrict zaroor karein.'],
  },
  'admin.settings.cod': {
    title: 'Cash on Delivery (COD)',
    steps: [
      'COD ka tick on rakhein (Pakistan ke andar).',
      '"Minimum COD Order": is se kam raqam par COD nahi (jaise 0 ya 500).',
      '"Maximum COD Order": is se zyada raqam par COD nahi (fake orders se bachne ke liye, jaise 50000).',
    ],
    tips: [SAVES_ITSELF, 'Jis number par 3 se zyada orders cancel hon, us par kuch din COD khud band ho jata hai.'],
  },
  'admin.settings.nayapay': {
    title: 'NayaPay wallet',
    steps: [
      'Tick laga kar "Active" karein.',
      '"NayaPay Account Title": account par jo naam hai.',
      '"Registered Mobile / ID": NayaPay number.',
      '"Payment Instructions": customer ke liye hidayat, jaise "Poori raqam bhej kar TID likhein".',
      'Customer paise bhej kar checkout par TID likhta hai; order "payment verification" mein aata hai.',
      'Apne NayaPay mein raqam check karke order ki payment "Approve" karein.',
    ],
    tips: [SAVES_ITSELF, 'Checkout par yeh tareeqa tab hi dikhta hai jab Active ho aur title + number bhare hon.'],
  },
  'admin.settings.raast': {
    title: 'Raast / Bank transfer',
    steps: [
      'Tick laga kar "Active" karein.',
      '"Beneficiary Account Title": bank account par naam.',
      '"Bank Name": jaise Meezan Bank.',
      '"RAAST IBAN / Account Number": PK se shuru hone wala IBAN.',
      '"Transfer Instructions": customer ke liye hidayat.',
      'Customer transfer karke TID likhta hai; aap bank app mein check karke "Approve" karein.',
    ],
    tips: [SAVES_ITSELF, 'TID check kiye baghair kabhi payment approve na karein.'],
  },
  'admin.settings.saveAll': {
    title: 'Save All Settings',
    steps: ['Upar ki saari payment settings khud save ho chuki hoti hain.', 'Yeh button tasalli ke liye dobara save karta hai aur paigham dikhata hai.'],
  },
  'admin.helpline': {
    title: '05. Helpline aur WhatsApp',
    steps: [
      '"WhatsApp Display Number": jaise dikhana ho, jaise +92 300 1234567.',
      '"WhatsApp Raw Number": sirf hindsay, 92 se shuru, + ke baghair (jaise 923001234567). WhatsApp ke button isi se chalte hain.',
      '"Helpline Email": customers ke sawal kahan aayen.',
      '"Phone / Helpline Number" aur "Operating Hours" (jaise 10am–8pm).',
      'Yeh sab website ke chat, Contact page aur order ke baad "Confirm on WhatsApp" mein aata hai.',
    ],
    tips: [SAVES_ITSELF, 'Number ghalat hua to customers ke WhatsApp message ghalat jagah jayenge: ek dafa khud test karein.'],
  },
  'admin.policies': {
    title: 'Policies aur Contact page',
    steps: [
      '"Store WhatsApp Number": click-to-chat aur order confirm ke liye.',
      '"Contact Us Page Message": Contact page ke upar ki line.',
      '"Refund & Return Policy": wapsi ke qawaid (jaise 7 din).',
      '"Shipping & Delivery Policy": delivery ka waqt aur courier.',
      '"Terms & Conditions" aur "Privacy Policy".',
      'Heading ke liye line ke shuru mein ###, bullet ke liye - likhein.',
      '"Save All Policies" ya "Save Policies & Legal Content" dabayein.',
    ],
    tips: ['Yeh pages website ke neeche (footer) se khulte hain; Google aur payment companies bhi inhein dekhti hain.'],
  },
  'admin.shipping': {
    title: '04. Bahar ke mulkon ki delivery (zones)',
    steps: [
      'Zone = mulkon ka group jin ka ek hi rate ho (jaise "Middle East": UAE, Saudi, Qatar).',
      'Zone ka naam likhein, "Add a country…" se mulk jorein.',
      '"Base fee": pehle kg tak; "Included kg"; "Per extra kg"; "Free above" (is se upar free).',
      'Courier aur delivery ka waqt likhein (jaise "DHL, 5–8 din").',
      'Customs: DAP = customer apne mulk mein duty deta hai; DDP = aap dete hain (fee mein shamil karein).',
      'Rates maloom na hon to "Fill recommended rates" dabayein.',
      '"Save zones" dabayein.',
      'Jis mulk ka zone na ho, wahan ka customer "manual quote" maang sakta hai (tick on ho to).',
    ],
  },
  'admin.storeTexts': {
    title: 'Home page texts aur "Become a seller" ad',
    steps: [
      '"Store ka naam": header aur emails mein.',
      '"Top announcement bar": sab se upar ki patti, jaise "Free delivery above PKR 5,000".',
      'Banner: chhoti line, bara heading, description, aur tasveer ka link (khali = pehle product ki tasveer).',
      '"Highlights": banner ke neeche ki baatein, | se alag, jaise Cash on Delivery|Easy Returns.',
      'Seller ad: title, text aur button ka naam; dikhana band ho to "Show the Become a seller ad" ka tick hata dein.',
      '"Seller app home page: offers": Seller app ke homepage par "Running right now" mein dikhne wali offers. Har line ek offer: "Offer ka naam | tafseel", jaise "Top seller of the month | Ek hafta home page par". "0% commission" aur "Free to join" khud dikhte hain (0% wale din Marketing & Growth se).',
      '"Delivery line on the product page": sach likhein, jaise "3–6 working days".',
      'About Us ka text.',
      '"Save texts" dabayein; foran store par aa jata hai.',
    ],
  },
  'admin.logo': {
    title: 'Store ka logo badalna',
    steps: [
      '"Store logo" mein tasveer chunein (PNG, transparent background behtar).',
      'Agar logo mein naam pehle se likha hai to "My logo already shows the store name" par tick lagayein.',
      'Wapis purana logo chahiye to "Use the original logo".',
    ],
    tips: ['Phone app ka icon is se nahi badalta; woh alag se badalna hota hai (mujhe naya logo bhejein).'],
  },
  'admin.backup': {
    title: 'Backup & Restore',
    what: 'Store ka data file mein rakhna, aur naye account mein wapis lana.',
    steps: [
      '"Download backup" dabayein: products (supplier data ke saath), categories, coupons aur settings ek file mein aa jate hain.',
      'File ko mehfooz jagah (Google Drive / email) rakhein.',
      'Naye Gmail / naye store par jana ho to wahan isi jagah "Restore from backup file" se woh file chunein.',
      'Restore beech mein ruk jaye to dobara chalayein; jo pehle aa chuka woh dobara likh diya jata hai.',
    ],
    tips: ['Orders aur customers ke accounts backup mein nahi hote.', 'Har hafte ek backup lein.'],
  },
  'admin.team': {
    title: 'Admins & Owner Login',
    steps: [
      'Naye admin ka email likhein aur role chunein:',
      '• Admin (sab kuch) • Order Manager (sirf orders) • Product Manager (sirf products) • Manager • Super Admin (admin bhi bana sakta hai).',
      'Add karein. Phir "Message" se us ko invite ka paigham "Copy" ya "WhatsApp par bhejein".',
      'Woh usi email se Admin page par account bana kar login kare; role khud mil jata hai.',
      'Kisi ko hatana ho to "Remove", role badalna ho to "Replace".',
      'Owner (malik) ka email badalna ho (sirf Super Admin): "New owner email" likh kar "Owner badlein".',
    ],
    tips: ['Admin sirf tasdeeq-shuda (verified) email ko banaya ja sakta hai.', 'Kam se kam do log Super Admin hon, taa ke ek ka account band ho to store band na ho.'],
  },
  'admin.loginSecurity': {
    title: 'Login security (Telegram code)',
    what: 'Admin login par ek code Telegram par aata hai: koi aur aap ka password jaan bhi le to login nahi kar sakta.',
    steps: [
      'Phone par Telegram install karein aur login karein.',
      '"Connect Telegram" dabayein.',
      'Telegram khulega: wahan "START" dabayein.',
      'Wapis is page par aayein; khud "connected" ho jata hai.',
      'Ab har naye device par admin login ke baad code Telegram par aayega.',
      'Telegram badalna ho to "Disconnect", phir dobara connect.',
    ],
  },
  'admin.aiKeys': {
    title: 'AI keys (backup Gemini keys)',
    what: 'Har muft key ki rozana had hai; kai keys = AI kabhi nahi rukta.',
    steps: [
      'Rangeen button "Create a free key" dabayein; Google AI Studio khul jata hai. (Poora tareeqa "How to get a key" khol kar parhein.)',
      'Ek Gmail se login karein (doosri Gmail ke liye upar daayein tasveer par click karke account badlein).',
      '"Create API key" dabayein; poochhe to "Create API key in new project".',
      'Nayi key ke saath wala COPY button dabayein (list mein chhupi / chhoti key copy na karein).',
      'Yahan box mein paste karein. Kai keys ek saath: har line par ek.',
      '"Add key(s)" dabayein. Har key check hoti hai aur nateeja neeche likha aata hai.',
      'List mein har key ke saath "ready" (hara) ya "limit used — resting" (peela).',
      'System khud pehchanta hai ke nayi key kisi pehle wali key ke project ki to nahi: ho to "NOT added" likh kar nahi lagata (ek project = ek had).',
      'Pehle se lagi keys ke liye "Check projects" dabayein: jo keys ek hi project ki hon woh peele dabbe mein aati hain, aur wahin har faltu key ka laal "Remove" button hota hai (pehli key rakhi jati hai).',
      'Kisi bhi key ko hatane ke liye list mein us ke saath laal "Remove" dabayein aur tasdeeq karein.',
      'Jis key ke saath "server key" likha ho woh server ki settings file (.env) mein hai; usay yahan se nahi hataya ja sakta.',
    ],
    tips: [
      'Google ki free had har PROJECT ki alag hoti hai. Isliye har key "Create API key in new project" se banayein: ek hi Gmail mein bhi alag project = alag had.',
      'Ek Gmail mein takreeban 10 project ban sakte hain; 3–4 Gmail kaafi hain.',
      'AI Studio ki list mein har key ke saath project ka naam dikhta hai: ek hi project ki kai keys ki had ek hoti hai.',
      '"not valid" aaye to key dobara copy karein; bilkul nayi key 1–2 minute baad chalti hai.',
      'Keys kisi ko na bhejein.',
    ],
  },

  // =============================================================== ADMIN: baqi hisse
  'admin.inboxTest': {
    title: 'Test message (AI jawab check karna)',
    steps: ['"Test Customer Message & AI Reply" kholein.', 'Namoona chunein ya khud naam, email aur sawal likhein.', 'Bhejein: AI ka jawab dikh jata hai, taa ke aap dekh saken ke customer ko kya jawab milega.'],
    tips: ['Test ka paigham inbox mein ticket ban jata hai; baad mein "Mark Resolved" kar dein.'],
  },
  'admin.sellerNotice': {
    title: 'Sellers ko notice / alert bhejna',
    steps: [
      '"Send to": sab sellers ya ek seller.',
      '"Type": Information, Warning, ya Urgent alert (Seller Center mein sab se upar laal patti).',
      'Title aur notice likhein (jaise "Eid ki chhuttiyon mein courier pickup band").',
      'Bhejein. Neeche "Sent notices" mein nazar aata hai.',
    ],
  },
  'admin.sellers.commission': {
    title: 'Commission (store ka hissa)',
    steps: [
      '"Default commission": har seller ki sale ka kitna % store ka (jaise 10).',
      'Save dabayein; naye orders par lagta hai.',
      'Kisi ek seller ka alag commission: us ke card mein "Commission %" badal kar save.',
    ],
    tips: ['Naye sellers ke liye 0% wala offer Marketing & Growth mein hai.'],
  },
  'admin.sellers.approve': {
    title: 'Naya seller approve karna',
    steps: [
      '"Pending" sellers kholein.',
      'Dukaan ka naam, malik, mobile, shehar, CNIC / documents aur payout ki maloomat check karein.',
      'Sab sahi ho to "Approve": seller ko email jati hai aur Vendor ID milta hai.',
      'Kuch ghalat ho to "Reject" aur wajah likhein (seller theek karke dobara bhej sakta hai).',
      'Baad mein qawaid todne par "Suspend".',
    ],
  },
  'admin.sellers.payout': {
    title: 'Seller ko payout dena',
    steps: [
      'Seller ki "Full report" kholein; tayyar kamai (delivered orders) dekhein.',
      'Us ke bank / wallet mein raqam bhejein (payout details report mein hain).',
      'Bhejne ke baad "Payment reference / TID" likh kar payout record karein.',
      'Seller ke Earnings mein payout nazar aa jata hai.',
    ],
  },
  'admin.growth.welcome': {
    title: 'Welcome discount (pehla order)',
    steps: ['Code (jaise WELCOME10), discount % aur zyada se zyada raqam likhein.', 'Naye visitor ko popup mein code dikhta hai; ek phone number par ek dafa.', '"Save these settings".'],
  },
  'admin.growth.refer': {
    title: 'Refer & Earn',
    steps: ['On karein aur reward ki raqam (PKR) likhein.', 'Customer ko My Account mein share link milta hai.', 'Dost ka pehla order deliver ho to customer ko credit milta hai, jo agle order par katta hai.', '"Save these settings".'],
  },
  'admin.growth.flash': {
    title: 'Flash deals (Anokhi Daily Deals)',
    steps: ['Product ka naam / SKU dhoondein.', 'Deal price aur waqt likhein.', '"Start deal": home page par countdown ke saath aata hai.', 'Pehle band karni ho to "End deal".'],
  },
  'admin.growth.campaign': {
    title: 'Festival zones (Eid, Black Friday...)',
    steps: [
      'Title (jaise "Eid Gifts Festival"), badge (jaise "EID SPECIAL") aur subtitle likhein.',
      'Shuru aur khatam ki tareekh chunein.',
      'Products: alfaaz (gift, perfume) aur / ya poori categories likhein; "Only products on sale" chahein to tick.',
      'Banner ki tasveer ka link (optional).',
      '"Active" tick karke "Save campaign". Home page par banner aur alag page ban jata hai.',
    ],
  },
  'admin.traffic.ads': {
    title: 'Ads & ROAS (ishtihar ka hisaab)',
    steps: [
      'Har channel (Facebook, Google, TikTok, organic) se kitne visitor aur order aaye.',
      'Spend = ad par kharcha; Revenue = un orders ki kamai; ROAS = kamai ÷ kharcha (2 se upar achha).',
      'Ad ke link ke aakhir mein utm_source / utm_campaign lagayein, taa ke order sahi ad ko gine.',
      '"How to connect the ad accounts" mein poora tareeqa hai.',
    ],
  },
  'admin.copilot': {
    title: 'AI Store Copilot',
    steps: ['Neeche se Copilot kholein.', 'Is page ke baare mein hukm ya sawal likhein, jaise "is hafte ke orders ka khulasa".', '"Run" dabayein. Bari tabdeeli se pehle tasdeeq maangi jati hai.'],
  },

  // =============================================================== SELLER: naya dhancha aur Dashboard
  'seller.tab.DASHBOARD': {
    title: 'Dashboard aur Seller Center ka naqsha',
    what: 'Aaj ka khulasa: bhejne wale orders, raste mein, payout ke liye tayyar raqam, stock aur Shop Coach.',
    steps: [
      'Laptop par: baayein taraf menu (sidebar) hai, groups mein: Overview, Sales (Orders, Returns), Catalog (Products), Customers (Reviews, Questions, Messages), Finance (Earnings), Growth (AI Assistant), Account (Profile, Seller rules).',
      'Mobile par: neeche patti mein Dashboard, Orders, Products, Messages; baqi sab "More" dabane par.',
      'Upar ghanti (🔔) par laal number = store ke naye paigham; dabane se Messages khulta hai.',
      'Upar daayein apni dukaan ki tasveer dabayein: "View my shop", "Profile & payout", "Seller rules" aur "Logout".',
      'Dashboard ke 4 dabbe: "Orders to ship" (peela ho to bhejna baqi hai), "On the way", "Ready for payout", "Paid out so far". Kisi dabbe par click se us ka page khulta hai.',
      '"Running low": jin products ka stock 5 ya kam hai; waqt par barha dein.',
      '"Shop Coach": dukaan ki sehat aur kya behtar karna hai; "Refresh" se nayi report.',
      'Laal point "Your free AI key is not added": "🔑 Add my free AI key" dabayein aur AI Assistant ke upar "My AI keys" mein muft key lagayein. Pehli dafa Seller Center kholne par bhi yahi qadam poochha jata hai ("Later" se 3 din baad dobara).',
      'Coach "products have no video" bataye to "✨ Self fix" dabayein: likhein kaisi video chahiye, AI aap ki tasveeron se video bana kar listing mein laga deta hai. Ya "Upload my own video" se apni video daalein.',
    ],
    tips: ['Har page ke upar us ka naam, ek line ka matlab aur rangeen ? hota hai.', 'Roz ek dafa Dashboard zaroor dekhein taa ke koi order late na ho.'],
  },
  'seller.tab.RULES': {
    title: 'Seller rules',
    what: 'Dukaan chalane ke qawaid. Inhein manna zaroori hai.',
    steps: [
      'Laptop par menu mein "Account → Seller rules"; mobile par "More → Seller rules"; ya upar apni tasveer wale menu se.',
      'Poore qawaid parhein.',
      'Qawaid badlen to Seller Center dobara manzoori maangta hai: parh kar "I have read these rules" dabayein.',
    ],
    tips: ['Qawaid todne par warning, phir account rok diya ja sakta hai.'],
  },

  'seller.tab.ORDERS': {
    title: 'Orders (order se delivery tak)',
    what: 'Har order ek card mein: upar number, status, payment aur raqam; beech mein customer, items aur paise; neeche agla qadam.',
    steps: [
      'Upar ki pills se list chunein: "To ship", "On the way", "Completed", "All" (saath ginti likhi hoti hai).',
      'Card par order ka raasta: 8 dot (Order accepted → Start packing → Complete packing → Attach label → Ready for pickup → Hand over to courier → Out for delivery → Delivered). Kaala dot = baaki, hara ✓ = ho gaya, peela ghera = agla kaam.',
      'Naya order: kuch poochhna ho to card ke "💬 Chat with ..." mein customer se poochhein, phir "✓ Accept order".',
      'Har kaam pura hone par agla dot ya neeche wala button dabayein. Customer ko har dafa update milti hai.',
      'Courier ke hawale: courier connected ho to "Book & ship"; warna courier chunein, tracking number likhein aur "Handed to courier".',
      'Raste mein: "Send tracking on WhatsApp", phir "🛵 Out for delivery" aur "✓ Delivered" (courier connected ho to khud ho jata hai).',
      'Kam istemal hone wale kaam "⋯ More" mein hain: parcel ki location likhna aur order cancel karna (laal).',
      'Customer ka number "📍 Ready for pickup" ke baad nazar aata hai (courier ke liye); us ko dabane se seedha call lagti hai. Order deliver hone par number phir chhup jata hai.',
      'Chat mein number, email ya link bhejna mana hai: aisa paigham jata hi nahi.',
      'Naya order ya customer ka message aaye to ghanti bajti hai (🔊 / 🔇 upar). Phone par bhi chahiye to "Turn on alerts" dabayein.',
    ],
    tips: [
      'Order confirm hone ke 48 ghante ke andar courier ko dena zaroori hai.',
      'Doosri app (Oshi, YourMart...) wale items jamni dabbe mein aate hain: "Copy order for supplier" se wahan order dein, phir "✓ Sent to supplier".',
      '"Your profit" = customer ki raqam − commission − supplier ki qeemat.',
    ],
  },
  'seller.product.new': {
    title: 'Naya product daalna',
    steps: [
      'Products page par hara "New product" dabayein.',
      'Pehle chunein aap kya bech rahe hain: Physical, Digital download, Software, Service, Wholesale, Rent, Print on demand ya Subscription (har ek ka apna icon). Har qisam ka form us ke hisaab se badal jata hai.',
      'Physical ke ilawa har qisam ke liye "… details" ka alag hissa aata hai (download link, service ke din, wholesale qeematein, kiraye ke din waghera).',
      'Form 7 hisson mein hai: 1 Basic information, 2 Photos & video, 3 Variants & deals, 4 Description, 5 Shipping & visibility, 6 More details, 7 Where you get it.',
      '1: naam, qeemat, stock, category aur brand (* wale zaroori).',
      '2: tasveerein (pehli tasveer main hoti hai) aur video.',
      '4: khud likhein ya "✨ Write description with AI".',
      '5: wazan aur "Live" ya "Draft".',
      'Neeche hamesha nazar aane wali patti mein hara "Save product" dabayein ("Cancel" se wapis).',
    ],
    tips: ['Product list mein har card par stock ka rang: peela = 5 ya kam, laal = khatam.', 'Har khane ke saath ? mein us ki tafseel hai.'],
  },

  'seller.shopName': {
    title: 'Dukaan ka naam badalna',
    steps: [
      'Profile & payout page kholein (menu mein "Account → Profile", ya upar apni tasveer → "Profile & payout").',
      '"Shop name" ke khane mein naya naam likhein.',
      'Hara "Change name" dabayein aur tasdeeq karein.',
      'Naya naam aap ke shop page aur sab products par lag jata hai. Purane orders par wahi naam rehta hai jis par order hua tha.',
    ],
    tips: [
      'Naam 3–50 akshar ka ho, aap ka apna (Samsung, Apple jaise brand ka naam nahi).',
      'Jo naam kisi aur dukaan ka ho woh nahi milta.',
      'Naam 30 din mein ek dafa badla ja sakta hai, taa ke customers pareshan na hon.',
    ],
  },
  'seller.tab.PROFILE': {
    title: 'Profile & payout (dukaan aur payout ki maloomat)',
    what: 'Dukaan ka naam, tasveer, cover photo, mobile, shehar, pata aur payout ka bank / wallet.',
    steps: [
      'Menu mein "Account → Profile" (ya upar apni tasveer → "Profile & payout") kholein.',
      '"Shop" hisse mein naam ke neeche aap ka commission %, shehar aur followers ki ginti likhi hoti hai.',
      'Tasveer: "Add picture / Change picture".',
      'Cover photo (upar wali chauri tasveer): "Add cover / Change cover" dabayein aur tasveer chunein. Yeh khud chauri (3:1) kat kar save ho jati hai aur dukaan ke page par sab se upar dikhti hai. "Remove" se hata dein.',
      'Cover ke liye apni dukaan, products ya sale ka banner achha lagta hai; zaroori cheez tasveer ke beech mein rakhein, kinare kat sakte hain.',
      'Dukaan ka naam: "Shop name" mein naya naam aur "Change name" (us ka apna ? dekhein).',
      'Mobile, City aur Address sahi likhein: courier yahin se parcel uthata hai.',
      'Bank / wallet, Account title aur Account number / IBAN: payouts yahin aate hain.',
      'Neeche "Save changes" dabayein (naam ka apna button hai).',
    ],
  },

  'seller.tab.QUESTIONS': {
    title: 'Questions (product ke baare mein sawal)',
    what: 'Customers product page par sawal poochhte hain; aap ka jawab sab ko nazar aata hai aur poochne wale ko khabar jati hai.',
    steps: [
      'Menu mein "Customers → Questions" kholein. Laal number = jawab ka intezar.',
      'Sawal ke neeche jawab likhein aur bhejein.',
      'Jawab foran product page par lag jata hai.',
      'Poochne wale customer ko app mein notice aata hai: "The seller answered your question" (usi phone par jis se sawal poocha tha).',
      'Agar customer ne email di thi ya woh login tha, to jawab email se bhi jata hai.',
    ],
    tips: ['Jaldi aur saaf jawab se sale barhti hai.', 'Qeemat, delivery ke din ya warranty ka ghalat wada na karein.'],
  },

  // =============================================================== SELLER: apni AI key
  'seller.aiKeys': {
    title: 'Meri AI keys (apna muft AI)',
    what: 'Apni Gmail ki muft Gemini key lagayein: aap ka AI Assistant, "Write with AI" aur Shop Coach pehle aap ki key se chalenge, kabhi intezar nahi.',
    steps: [
      'Seller Center mein "AI Assistant" tab kholein; sab se upar "My AI keys" ka hissa hai.',
      'Rangeen button "Create a free key" dabayein; Google AI Studio khul jata hai. (Poora tareeqa "How to get a key" khol kar parhein.)',
      'Apni Gmail se login karein.',
      '"Create API key" dabayein; poochhe to "Create API key in new project" chunein.',
      'Nayi key ke saath wala COPY button dabayein (list mein chhupi / chhoti key copy na karein).',
      'Wapis aa kar box mein paste karein aur "Add key(s)" dabayein. Key check ho kar list mein "ready" (hara) aa jati hai.',
      'Zyada AI chahiye to doosre project / Gmail ki aur keys bhi daal sakte hain (20 tak).',
    ],
    tips: [
      'Aap ki key sirf aap ki dukaan ke kaam aati hai; kisi ko nazar nahi aati, store bhi poori key nahi dekh sakta.',
      'Ek hi project ki doosri key nahi lagti (ek project = ek had). "Check projects" se pehle wali keys check karein.',
      'Apni key na ho to store roz sirf 3 AI kaam muft deta hai (video, description, AI Assistant). Woh khatam hon to "apni key lagayein" ki khidki aati hai; apni key se roz 150 AI kaam.',
      'Jab tak key nahi lagti, Shop Coach mein laal point "Your free AI key is not added" rehta hai. Health score par is ka koi asar nahi; bechna, orders aur payout bilkul waise hi chalte hain.',
      'Key lagane par store par aap ki dukaan ke page par "AI Powered Shop ✨" ka badge aa jata hai.',
      'Aap ki had khatam ho jaye to store ka AI chalta hai, jo kabhi busy ho sakta hai.',
      'Key hatani ho to list mein laal "Remove" dabayein.',
    ],
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
      'Behtar aur tez AI ke liye isi tab mein upar "My AI keys" mein apni muft Gemini key lagayein (us ka apna ? dekhein).',
      'Apni key ke baghair roz sirf 3 AI kaam muft hain; apni key se 150.',
    ],
    tips: ['AI sirf aap ki apni dukaan par kaam karta hai.', 'Qeemat aur account settings AI kabhi khud nahi badalta.'],
  },

  // =============================================================== SELLER: registration aur baqi
  'seller.signup': {
    title: 'Seller banna (registration ke 4 qadam)',
    steps: [
      'Pehle mobile number SMS code se tasdeeq karein.',
      '1. Your shop: "selling as" (individual ya business), mulk, dukaan ka naam, poora naam (ID jaisa), mobile, shehar.',
      '2. Identity: CNIC / ID document ki tasveer, business ho to registered naam aur pata.',
      '3. Warehouse & payout: parcel kahan se jayega (mulk, shehar), aur paise kahan aayen (bank, IBAN, ya Payoneer).',
      '4. Review & send: sab check karein, Seller rules parh kar bhej dein.',
      'Store team check karke approve karti hai; email aa jati hai.',
    ],
    tips: ['Aap ka likha hua is phone par save rehta hai; beech mein chhor kar baad mein poora kar sakte hain.', 'ID aur bank ki maloomat sirf store team dekhti hai.'],
  },
  'seller.product.status': {
    title: 'Status: Live ya Draft',
    steps: ['"Live": product store mein foran nazar aata hai aur order ho sakta hai.', '"Draft": chhupa rehta hai; tayyari mukammal karke baad mein Live karein.'],
  },
  'seller.product.keyfeatures': {
    title: 'Key features (khoobiyan)',
    steps: [
      'Har khoobi ALAG line par likhein (Enter daba kar nayi line).',
      'Misaal: "Bluetooth 5.4" / "30 ghante battery" / "Pani se mehfooz (IPX5)".',
      'Product page par har line ek bullet (•) ban kar dikhti hai.',
    ],
    tips: ['Sirf sach likhein; ghalat khoobi par return aata hai.'],
  },
  'seller.returns.reply': {
    title: 'Return par apna jawab',
    steps: [
      'Customer ki wajah aur tasveer dekhein.',
      'Box mein apni baat likhein: kya dispatch se pehle check kiya, packing ki photo hai, waghera.',
      'Bhejein. Store dono taraf dekh kar faisla karta hai ("Store decision").',
      'Galti courier ya customer ki ho to aap par jurmana nahi lagta.',
    ],
  },
  'seller.reviews.reply': {
    title: 'Review ka jawab',
    steps: ['Review ke neeche "Your public reply" mein jawab likhein.', 'Bhejein; product page par sab ko nazar aata hai.'],
    tips: ['Shukriya aur hal ki baat karein; behas na karein.'],
  },
  'seller.messages.new': {
    title: 'Store ko shikayat / paigham',
    steps: [
      '"New complaint / message" dabayein.',
      '"What is it about?" chunein (order, payout, product...).',
      'Order ka masla ho to order number likhein (jaise ORD-123456).',
      'Subject aur poori baat likh kar bhejein.',
      'Jawab isi baat chit mein aata hai.',
    ],
  },
  'seller.earnings.payouts': {
    title: 'Payouts (aap ko kab aur kitna mila)',
    steps: [
      'Har payout ki tareekh, raqam aur reference (TID) yahan likha hota hai.',
      'TID se apne bank mein raqam match karein.',
      'Masla ho to Messages mein "Payout" chun kar shikayat bhejein.',
    ],
  },
};
