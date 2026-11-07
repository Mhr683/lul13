import React from 'react';
import {
  BadgePercent,
  Banknote,
  Bot,
  CheckCircle2,
  Gift,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Upload,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';

// The Seller app's home page for visitors who are not signed in: why sell here, the offers running
// now (Admin → Settings → Home page texts → "Seller offers"), how it works, real numbers, FAQ, and the
// sign-up / login box. Everything stated here is true of the marketplace; nothing is invented.

export const SellerLanding: React.FC<{ authPanel: React.ReactNode }> = ({ authPanel }) => {
  const { settings, products, categories } = useStore();
  const storeName = settings.storeName || 'Anokha Shopping Hub';
  const freeDays = Number(settings.newSellerFreeDays ?? 30);
  const commission = Number((settings as any).marketplaceCommissionPercent);
  const hasCommission = Number.isFinite(commission) && commission > 0;
  const liveProducts = (products || []).filter((p: any) => p.status === 'ACTIVE').length;
  const categoryCount = (categories || []).length;

  // Offers: the automatic ones from the settings first, then the owner's own lines
  const ownOffers = String((settings as any).sellerOffers || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  const offers: Array<{ icon: React.ComponentType<{ className?: string }>; title: string; text: string }> = [
    ...(freeDays > 0
      ? [{ icon: BadgePercent, title: `0% commission for ${freeDays} days`, text: 'Every new shop pays no commission at all in its first days. Keep 100% of your sales.' }]
      : []),
    { icon: Gift, title: 'Free to join', text: 'No sign-up fee, no monthly fee, no listing fee. You pay only when you sell.' },
    ...ownOffers.map((l) => {
      const [title, ...rest] = l.split('|');
      return { icon: Sparkles, title: title.trim(), text: rest.join('|').trim() };
    }),
  ];

  const joinNow = () => document.getElementById('seller-join')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const benefits = [
    { icon: Wallet, title: hasCommission ? `Only ${commission}% per sale` : 'Only a small commission per sale', text: 'No hidden charges. Your earning is shown on every order.' },
    { icon: Banknote, title: 'Cash on Delivery handled for you', text: 'The store collects COD from customers and pays you out to your bank or wallet.' },
    { icon: Truck, title: 'Courier booking & tracking', text: 'Book the parcel, print the label and follow delivery right from your orders.' },
    { icon: Bot, title: 'Your own AI assistant', text: 'Writes product descriptions, checks your shop and tells you what to improve.' },
    { icon: Upload, title: 'List hundreds of products at once', text: 'Upload a CSV from Excel. Sourcing from Oshi, YourMart or Markaz? That works too.' },
    { icon: Store, title: 'Your own shop page', text: 'Customers follow your shop and get an email when you add new products.' },
  ];

  const steps = [
    { title: 'Create your account', text: 'With Google or email, in one minute.' },
    { title: 'Shop details & ID', text: 'Shop name, CNIC and where you want to be paid.' },
    { title: 'Add your products', text: 'One by one or many at once from a CSV.' },
    { title: 'Get orders & payouts', text: 'Ship the parcel; your earning arrives after delivery.' },
  ];

  const faq = [
    { q: 'How much does it cost?', a: `Joining is free. You pay only a commission${hasCommission ? ` of ${commission}%` : ''} on each sale${freeDays > 0 ? `, and new shops pay 0% for their first ${freeDays} days` : ''}.` },
    { q: 'When do I get my money?', a: 'After the order is delivered, your earning becomes ready for payout and is sent to the bank account or wallet you give.' },
    { q: 'Do I need my own stock?', a: 'No. You can sell your own stock or products you source from apps like Oshi, YourMart, HHC or Markaz. Customers never see where an item comes from.' },
    { q: 'What do I need to sign up?', a: 'A mobile number, your CNIC (or business documents) and a bank account or wallet for payouts.' },
    { q: 'Who delivers the parcel?', a: 'You hand the parcel to a courier (or book one from your orders). Tracking is shared with the customer automatically.' },
  ];

  return (
    <div className="bg-[#F6F5F1]">
      {/* ---------------------------------------------------------- hero + join box */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3D24] via-[#0E5E37] to-[#0E7A43] text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-[#E5C98A]/10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 items-start">
          <div className="space-y-5">
            {freeDays > 0 && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E5C98A] text-[#3B2A05] text-[12px] font-bold shadow">
                <Zap className="w-4 h-4" /> Limited offer: 0% commission for your first {freeDays} days
              </span>
            )}
            <h1 className="text-[32px] max-[380px]:text-[26px] sm:text-[44px] leading-[1.08] font-bold tracking-tight">
              Sell to customers all over Pakistan — <span className="text-[#E5C98A]">from your own shop on {storeName}</span>
            </h1>
            <p className="text-[15px] max-[380px]:text-[14px] sm:text-base text-white/85 max-w-xl leading-relaxed">
              Apna kaam online le jayein. Products list karein, orders paayein, parcel bhejein — aur har delivered order ki kamai seedha apne
              account mein.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={joinNow}
                className="px-6 py-3 rounded-xl bg-white text-[#0B5E34] text-[15px] font-bold shadow-lg hover:bg-[#F2F1EC] cursor-pointer"
              >
                Start selling — it's free
              </button>
              <button
                type="button"
                onClick={joinNow}
                className="px-6 py-3 rounded-xl border border-white/40 text-white text-[15px] font-semibold hover:bg-white/10 cursor-pointer"
              >
                I already have an account
              </button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px] text-white/90 pt-1">
              {['No sign-up or monthly fee', 'COD collected for you', 'Payouts to bank or wallet', 'Free AI assistant'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#9BE3B9] shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div id="seller-join" className="scroll-mt-20 bg-white text-[#141413] rounded-2xl shadow-2xl p-5 sm:p-6">
            {authPanel}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- offers running now */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-2 pt-10">
        <div className="flex items-end justify-between gap-2 mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0E7A43]">Offers for sellers</div>
            <h2 className="text-2xl font-bold tracking-tight">Running right now</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {offers.map((o, i) => {
            const Icon = o.icon;
            return (
              <div
                key={i}
                className={`p-5 rounded-2xl border shadow-sm ${
                  i === 0 ? 'bg-gradient-to-br from-[#FFF7E3] to-[#FDEBC2] border-[#EBCB7E]' : 'bg-white border-[#E7E5DF]'
                }`}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${i === 0 ? 'bg-[#E5C98A] text-[#3B2A05]' : 'bg-[#E8F3EC] text-[#0B5E34]'}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="mt-3 text-[15px] font-bold">{o.title}</div>
                {o.text && <p className="mt-1 text-[13px] text-[#6B6963] leading-relaxed">{o.text}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- real numbers */}
      {(liveProducts > 0 || categoryCount > 0) && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              liveProducts > 0 && { n: liveProducts.toLocaleString('en-PK'), l: 'products live on the store', icon: Package },
              categoryCount > 0 && { n: categoryCount.toLocaleString('en-PK'), l: 'categories to sell in', icon: Store },
              { n: 'All Pakistan', l: 'delivery by courier', icon: Truck },
              { n: '24/7', l: 'your shop is open', icon: ShieldCheck },
            ]
              .filter(Boolean)
              .map((s: any) => {
                const Icon = s.icon;
                return (
                  <div key={s.l} className="p-4 rounded-2xl bg-white border border-[#E7E5DF] shadow-sm">
                    <Icon className="w-5 h-5 text-[#0E7A43]" />
                    <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">{s.n}</div>
                    <div className="text-[12px] text-[#6B6963]">{s.l}</div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- why sell here */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0E7A43]">Why sell with us</div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Everything you need to sell online</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="p-5 rounded-2xl bg-white border border-[#E7E5DF] shadow-sm">
                <span className="w-10 h-10 rounded-xl bg-[#E8F3EC] text-[#0B5E34] flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="mt-3 text-[15px] font-bold">{b.title}</div>
                <p className="mt-1 text-[13px] text-[#6B6963] leading-relaxed">{b.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0E7A43]">How it works</div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Start in 4 simple steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative p-5 rounded-2xl bg-white border border-[#E7E5DF] shadow-sm">
              <span className="w-9 h-9 rounded-full bg-[#0E7A43] text-white font-bold flex items-center justify-center">{i + 1}</span>
              <div className="mt-3 text-[15px] font-bold">{s.title}</div>
              <p className="mt-1 text-[13px] text-[#6B6963]">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12">
        <h2 className="text-2xl font-bold tracking-tight mb-4 text-center">Questions sellers ask</h2>
        <div className="space-y-2">
          {faq.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white border border-[#E7E5DF] shadow-sm">
              <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3 text-[14px] font-semibold">
                {f.q}
                <span className="text-[#0E7A43] text-lg leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="px-5 pb-4 text-[13px] text-[#6B6963] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- final call */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-3xl bg-gradient-to-r from-[#0B3D24] to-[#0E7A43] text-white p-6 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <div className="flex items-center gap-2 text-[#E5C98A] text-[12px] font-bold uppercase tracking-wider">
              <Users className="w-4 h-4" /> Join the marketplace
            </div>
            <div className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">Your shop can be live today.</div>
            <p className="text-white/80 text-[14px] mt-1">Aaj hi apni dukaan kholein — free.</p>
          </div>
          <button
            type="button"
            onClick={joinNow}
            className="px-7 py-3.5 rounded-xl bg-white text-[#0B5E34] text-[15px] font-bold shadow-lg hover:bg-[#F2F1EC] cursor-pointer"
          >
            Open my shop
          </button>
        </div>
      </section>
    </div>
  );
};
