import {
  detectPriceCurrency,
  parseCsvRFC4180,
  parseNumericPrice,
  parseNumericStock,
} from '../validation/validators';

// Reads a seller's product sheet (CSV / TSV from Excel, Google Sheets, Daraz, Shopify or WooCommerce
// exports) into rows for POST /api/seller/products/bulk. Column names are matched loosely.

export interface SellerCsvRow {
  row: number;
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number;
  stock: number;
  category: string;
  primaryImage: string;
  shortDescription: string;
  description: string;
  weightKg: number;
  brand: string;
  status: 'ACTIVE' | 'DRAFT';
  supplierName: string;
  supplierCostPrice: number;
  supplierProductUrl: string;
  supplierSku: string;
  imageName: string;
  problem: string;
}

export const SELLER_CSV_TEMPLATE =
  'sku,name,price,old_price,stock,category,image_url,short_description,description,weight_kg,source,source_price,source_link,source_sku\n' +
  'TSHIRT-01,Cotton T-Shirt Black,1499,1999,25,Men\'s Clothing,https://example.com/tshirt.jpg,Soft cotton t-shirt,"100% cotton, sizes M L XL",0.3,Oshi,900,https://example.com/oshi/tshirt,OS-TS-01\n';

// Ready-made instructions a seller pastes into ChatGPT / Gemini / Claude (with their product details or
// WhatsApp catalogue) so the AI makes a file in exactly this store's format
export function sellerCsvAiPrompt(categoryNames: string[]): string {
  return [
    'Make a CSV file of my products for my online shop on Anokha Shopping Hub (Pakistan). My product details, catalogue text and/or photos are below.',
    '',
    'Rules:',
    '1. The first line must be exactly: sku,name,price,old_price,stock,category,image_url,short_description,description,weight_kg,brand',
    '2. One product per line. Every colour / variety that is sold separately gets its own line.',
    '3. sku: a short unique code for each product, e.g. SHOP-01, SHOP-02 (only letters, numbers and dashes).',
    '4. name: clear product name with type, colour and material, e.g. "Digital Printed 2 Pc Suit - Royal Blue Floral (Cotton)". At most 150 characters.',
    '5. price: my selling price in PKR, digits only (999, not "Rs 999/-").',
    '6. old_price: the earlier price only if there is a real discount; otherwise leave it empty.',
    '7. stock: how many pieces I have, digits only. If I did not say, write 10.',
    `8. category: exactly one of these store categories: ${categoryNames.join(', ')}.`,
    '9. image_url: leave empty (I upload the photos together with the file, each photo named like its sku, e.g. SHOP-01.jpg). Only if I gave a picture link starting with https:// put that link here.',
    '10. short_description: one line, at most 200 characters.',
    '11. description: full details (fabric/material, size, what is included, how to use or care), at most 1500 characters.',
    '12. weight_kg: packed weight in kg, e.g. 0.5.',
    '13. brand: the brand name, or my shop name if there is no brand.',
    '14. Never write phone numbers, WhatsApp, e-mail, website links or other shops\' names anywhere. Do not invent features that are not in my details.',
    '15. Put any text that contains a comma inside double quotes "like, this".',
    '',
    'Give the result as a downloadable .csv file (or as CSV text in one code block I can copy). After it, list which of my photos goes with which sku, so I can rename each photo to its sku.',
    '',
    'My products:',
    '',
  ].join('\n');
}

// Share links that open a page instead of the picture become direct picture links:
// Google Drive (anyone with the link), Dropbox; http:// becomes https://
export function directImageLink(u: string): string {
  let url = u.trim().replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(url)) return '';
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/i.exec(url);
  if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}`;
  if (/^https:\/\/(www\.)?dropbox\.com\//i.test(url)) {
    url = url.replace(/([?&])dl=0/, '$1raw=1');
    if (!/[?&](raw|dl)=1/.test(url)) url += (url.includes('?') ? '&' : '?') + 'raw=1';
  }
  return url;
}

const norm = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

const cleanText = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parseSellerCsv(raw: string, usdToPkrRate: number): { rows: SellerCsvRow[]; error?: string } {
  const { rows: all } = parseCsvRFC4180(raw);
  if (all.length < 2) return { rows: [], error: 'The file needs column names on the first line and at least one product below it.' };

  const headers = all[0].map(norm);
  // Supplier columns (supplier_cost, supplier_sku, ...) never count as the product's own price / SKU / name
  // (source_price / source_link: where the product is sourced from, e.g. Oshi)
  const isSupplierHeader = (h: string) => h.startsWith('supplier') || h.startsWith('source') || h.includes('cost') || h.includes('wholesale');
  const col = (...names: string[]) => {
    const wantSupplier = names.some((n) => isSupplierHeader(norm(n)));
    const usable = (h: string) => wantSupplier || !isSupplierHeader(h);
    for (const n of names) {
      const i = headers.findIndex((h) => h === norm(n) && usable(h));
      if (i !== -1) return i;
    }
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(norm(n)) && usable(h));
      if (i !== -1) return i;
    }
    return -1;
  };

  const c = {
    sku: col('sku', 'sellersku', 'variantsku', 'productcode', 'itemcode', 'code'),
    name: col('name', 'title', 'productname', 'producttitle', 'itemname'),
    sale: col('saleprice', 'specialprice', 'discountprice', 'offerprice'),
    price: col('price', 'regularprice', 'variantprice', 'sellingprice', 'retailprice', 'pricepkr', 'rate'),
    old: col('oldprice', 'compareatprice', 'variantcompareatprice', 'originalprice', 'listprice', 'mrp'),
    stock: col('stock', 'quantity', 'qty', 'variantinventoryqty', 'inventory', 'available'),
    category: col('category', 'categories', 'productcategory', 'type', 'producttype', 'collection'),
    image: col('imageurl', 'image', 'images', 'imagesrc', 'primaryimage', 'mainimage', 'photo', 'picture'),
    short: col('shortdescription', 'summary', 'highlights'),
    desc: col('description', 'bodyhtml', 'body', 'details', 'longdescription'),
    weight: col('weightkg', 'weight', 'packageweight'),
    brand: col('brand', 'vendor', 'manufacturer'),
    status: col('status', 'published'),
    supplier: headers.findIndex((h) => ['supplier', 'suppliername', 'suppliercompany', 'source', 'platform', 'sourceplatform', 'productsource'].includes(h)),
    supplierCost: col('suppliercost', 'supplierprice', 'sourceprice', 'sourcecost', 'costprice', 'cost', 'wholesaleprice'),
    supplierLink: col('supplierlink', 'supplierurl', 'supplierproducturl', 'sourcelink', 'sourceurl'),
    supplierSku: col('suppliersku', 'suppliercode', 'sourcesku'),
  };
  if (c.name === -1) return { rows: [], error: 'No product name column found (name / title).' };
  if (c.price === -1 && c.sale === -1) return { rows: [], error: 'No price column found (price).' };

  const usd = detectPriceCurrency(raw.slice(0, 5000), all[0]) === 'USD';
  const toPkr = (n: number) => (usd && n > 0 ? Math.round(n * (usdToPkrRate || 278.5)) : n);
  const cell = (cells: string[], i: number) => (i === -1 ? '' : (cells[i] || '').trim());

  const rows: SellerCsvRow[] = [];
  for (let r = 1; r < all.length; r++) {
    const cells = all[r];
    const name = cleanText(cell(cells, c.name)).slice(0, 190);
    // Shopify exports put extra images of the same product on rows without a title
    if (!name && rows.length && cell(cells, c.image)) continue;

    const regular = parseNumericPrice(cell(cells, c.price));
    const sale = parseNumericPrice(cell(cells, c.sale));
    const hasSale = !isNaN(sale) && sale > 0;
    const price = toPkr(hasSale ? sale : isNaN(regular) ? 0 : regular);
    let old = parseNumericPrice(cell(cells, c.old));
    if (hasSale && !isNaN(regular) && regular > sale) old = regular;
    const compareAtPrice = toPkr(isNaN(old) ? 0 : old);

    let category = cleanText(cell(cells, c.category));
    const parts = category.split(/[,>/]/).map((s) => s.trim()).filter(Boolean);
    category = (parts[parts.length - 1] || '').slice(0, 75);

    const image = directImageLink(cell(cells, c.image).split(/[\s,|;]+/).find((u) => /^https?:\/\//i.test(u)) || '');
    const description = cleanText(cell(cells, c.desc)).slice(0, 4800);
    const shortDescription = (cleanText(cell(cells, c.short)) || description).slice(0, 480);
    const weight = parseFloat(cell(cells, c.weight).replace(/[^\d.]/g, ''));
    const statusText = cell(cells, c.status).toLowerCase();

    const problem =
      name.length < 3
        ? 'No name'
        : !(price > 0)
        ? 'No price'
        : category.length < 2
        ? 'No category'
        : '';

    rows.push({
      row: r + 1,
      sku: cell(cells, c.sku).replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60),
      name,
      price,
      compareAtPrice,
      stock: parseNumericStock(cell(cells, c.stock), 10).stock,
      category,
      primaryImage: image,
      shortDescription,
      description,
      weightKg: weight > 0 ? (weight > 50 ? weight / 1000 : weight) : 0.5,
      brand: cleanText(cell(cells, c.brand)).slice(0, 75),
      status: ['draft', 'false', 'no', '0', 'hidden'].includes(statusText) ? 'DRAFT' : 'ACTIVE',
      supplierName: cleanText(cell(cells, c.supplier)).slice(0, 80),
      supplierCostPrice: (() => {
        const v = parseNumericPrice(cell(cells, c.supplierCost));
        return isNaN(v) ? 0 : toPkr(v);
      })(),
      supplierProductUrl: (cell(cells, c.supplierLink).match(/https?:\/\/\S+/) || [''])[0].slice(0, 980),
      supplierSku: cell(cells, c.supplierSku).slice(0, 80),
      // A photo's file name in the image column (e.g. "suit-01.jpg"), matched to photos chosen with the file
      imageName: (cell(cells, c.image).split(/[,|;]+/).map((s) => s.trim()).find((u) => u && !/^https?:\/\//i.test(u)) || '')
        .split(/[\\/]/)
        .pop()!
        .slice(0, 120),
      problem,
    });
  }
  return { rows };
}

// ---------------------------------------------------------------- photos chosen with the file
// Each photo goes to the product whose SKU, image-column file name or product name equals the photo's
// file name, or (a plain number) to that product in the file: "1.jpg" = first product. A trailing
// "-2", "_2" or " (2)" makes it that product's 2nd, 3rd... picture: "BKH-01.jpg", "BKH-01-2.jpg".
const photoKey = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]/g, '');

export function matchPhotos<T extends { name: string }>(rows: SellerCsvRow[], photos: T[]): { byRow: Map<number, T[]>; unmatched: T[] } {
  const keyToRow = new Map<string, number>();
  const add = (key: string, row: number) => key && !keyToRow.has(key) && keyToRow.set(key, row);
  rows.forEach((r) => add(photoKey(r.sku), r.row));
  rows.forEach((r) => add(photoKey(r.imageName), r.row));
  rows.forEach((r) => add(photoKey(r.name), r.row));
  const found: { row: number; order: number; photo: T }[] = [];
  const unmatched: T[] = [];
  for (const photo of photos) {
    const base = photo.name.replace(/\.[a-z0-9]{2,5}$/i, '');
    let row = keyToRow.get(photoKey(base));
    let order = 1;
    if (row === undefined) {
      const m = /^(.*?)[\s_-]*\(?(\d{1,2})\)?$/.exec(base);
      if (m && m[1]) {
        row = keyToRow.get(photoKey(m[1]));
        order = Number(m[2]);
        if (row === undefined && /^\d+$/.test(m[1].trim())) row = rows[Number(m[1].trim()) - 1]?.row;
      }
    }
    if (row === undefined && /^\d+$/.test(base.trim())) row = rows[Number(base.trim()) - 1]?.row;
    if (row === undefined) unmatched.push(photo);
    else found.push({ row, order, photo });
  }
  const byRow = new Map<number, T[]>();
  found
    .sort((a, b) => a.order - b.order || a.photo.name.localeCompare(b.photo.name))
    .forEach(({ row, photo }) => byRow.set(row, [...(byRow.get(row) || []), photo]));
  return { byRow, unmatched };
}
