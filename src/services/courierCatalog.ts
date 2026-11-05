// Couriers that can be connected with an API key (server/couriers.ts). Shared by the server and the
// admin "Couriers" screen, so both list the same fields.

export type CourierId = 'POSTEX' | 'LEOPARDS' | 'TRAX';

export interface CourierField {
  key: string;
  label: string;
  /** Keys and passwords: never sent back to the browser, only "saved ••••1234" */
  secret?: boolean;
  required?: boolean;
  hint?: string;
}

export interface CourierInfo {
  id: CourierId;
  /** Name saved on the order (courierName) and used for its tracking link */
  name: string;
  label: string;
  fields: CourierField[];
  /** Where the store owner finds the key */
  howTo: string;
  /** Each seller can have its own pickup address in this courier's portal */
  pickupField?: string;
}

export const COURIER_CATALOG: CourierInfo[] = [
  {
    id: 'POSTEX',
    name: 'PostEx',
    label: 'PostEx',
    fields: [
      { key: 'token', label: 'API token', secret: true, required: true },
      {
        key: 'pickupAddressCode',
        label: 'Default pickup address code',
        hint: 'Optional. Press "Test connection" to see your pickup addresses.',
      },
    ],
    howTo: 'PostEx merchant portal → Settings / Integration → API token (or ask your PostEx account manager).',
    pickupField: 'pickupAddressCode',
  },
  {
    id: 'LEOPARDS',
    name: 'Leopards',
    label: 'Leopards Courier',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, required: true },
      { key: 'apiPassword', label: 'API password', secret: true, required: true },
    ],
    howTo: 'Leopards COD portal → API Settings → API Management: copy the API key and set an API password.',
  },
  {
    id: 'TRAX',
    name: 'Trax',
    label: 'Trax (Sonic)',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, required: true },
      {
        key: 'pickupAddressId',
        label: 'Default pickup address ID',
        required: true,
        hint: 'Press "Test connection" to see your pickup addresses.',
      },
      { key: 'serviceTypeId', label: 'Service type ID', hint: 'Leave empty for 1 (Overnight / standard).' },
    ],
    howTo: 'Trax / Sonic portal → Profile: copy the API key.',
    pickupField: 'pickupAddressId',
  },
];

export const courierInfo = (id: string) => COURIER_CATALOG.find((c) => c.id === id);

/** Couriers that only work by typing the tracking number (no API connected) */
export const MANUAL_COURIERS = ['TCS', 'M&P', 'Call Courier', 'BlueEx', 'Swyft', 'Daewoo', 'Pakistan Post', 'Other'];
