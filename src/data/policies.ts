// The Customer Protection Policy (shown in the store) and the Supplier Code of Conduct (shown in
// Seller Center, which every seller must accept). The numbers are enforced by the server in
// server/policyRules.ts; keep them in step. Changing the Code of Conduct? Bump CONDUCT_VERSION
// there and here so every seller accepts the new version.

export const CONDUCT_VERSION = '2026-10-21b';
export const RETURN_WINDOW_DAYS = 7;
export const REINSTATEMENT_FEE = 5000;

export type PolicySection = { title: string; points: string[] };

export const CUSTOMER_PROTECTION: { intro: string; sections: PolicySection[] } = {
  intro:
    'Your trust is our first priority. These rules apply to every order on the platform, whichever seller it comes from, so that shopping here is safe and reliable.',
  sections: [
    {
      title: '1. Original products, as described',
      points: [
        'Every product must match its description and pictures exactly.',
        'If you receive a fake, replica or wrong product, you get a 100% full refund.',
      ],
    },
    {
      title: '2. Easy returns and replacements (7 days)',
      points: [
        `You can ask for a return or a replacement within ${RETURN_WINDOW_DAYS} days of receiving your order, from the order tracking page.`,
        'Valid reasons: the product is damaged or defective; you received the wrong item, colour or size; the quality does not match the description; the product is fake or a replica.',
        'Please keep the product, its packing and tags, and add clear pictures of the problem to your request.',
      ],
    },
    {
      title: '3. Simple refunds',
      points: [
        'We review every return request within 24–48 hours.',
        'Once the returned item has been checked, your refund is usually sent within 2 working days to your bank account or mobile wallet.',
        'You pay no return shipping when the mistake was the seller’s (damaged, wrong, poor quality or fake item).',
      ],
    },
    {
      title: '4. Tracking and support',
      points: [
        'You can follow every order from dispatch to delivery on the order tracking page, with the courier’s tracking number.',
        'Our AI helpline and WhatsApp are open 24/7; our support team answers Monday to Saturday, 9 AM – 9 PM.',
      ],
    },
  ],
};

export const SUPPLIER_CODE: { intro: string; sections: PolicySection[] } = {
  intro:
    'To keep your shop on the platform and earn high ratings, you must follow these rules. Several of them are applied automatically by the system.',
  sections: [
    {
      title: '1. Honest listings',
      points: [
        'List real pictures of your own product, the correct material and accurate details. Stock photos of a different item and fake features are not allowed.',
        'Electronics and branded items need a brand approval certificate or a purchase invoice. Upload it in the product form; until then the product stays as a draft.',
      ],
    },
    {
      title: '2. Fast dispatch',
      points: [
        'Hand every order to the courier within 48 hours of it being confirmed, and add the tracking number.',
        'Late orders lower your On-time Delivery score (shown to customers) and your account health, and you receive a warning.',
      ],
    },
    {
      title: '3. Quality and customer satisfaction',
      points: [
        'Zero tolerance for fake items: when a complaint about a fake or replica product is upheld, that product is locked at once and taken off the store.',
        'Three complaints rule: when 3 different customers report quality problems or a wrong item for the same product, it is removed from the store permanently.',
        'You can give your side of every return request in Seller Center before the store decides.',
      ],
    },
    {
      title: '4. Money and returns',
      points: [
        'Return shipping for wrong, damaged, poor quality or fake products is taken off your payout.',
        'Your money for an order is released 7 days after delivery, once the customer’s return period is over (and not while a return request is open).',
      ],
    },
    {
      title: '5. Low rating: suspension and one second chance',
      points: [
        'If your customer rating falls below 3.0 stars (from at least 5 buyers), your account is suspended and all your payments are frozen.',
        `You can restore your account once by paying a reinstatement fee of PKR ${REINSTATEMENT_FEE.toLocaleString('en-PK')}. Your rating then starts fresh, your products return to the store and your payments are unfrozen.`,
        'Reinstatement is given only one time, as a chance to learn from mistakes. If your rating falls below 3.0 again, the suspension is permanent.',
      ],
    },
  ],
};
