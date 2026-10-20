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
  problem: string;
}

export const SELLER_CSV_TEMPLATE =
  'sku,name,price,old_price,stock,category,image_url,short_description,description,weight_kg\n' +
  'TSHIRT-01,Cotton T-Shirt Black,1499,1999,25,Men Clothing,https://example.com/tshirt.jpg,Soft cotton t-shirt,"100% cotton, sizes M L XL",0.3\n';

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
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(norm(n));
      if (i !== -1) return i;
    }
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(norm(n)));
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

    const image = cell(cells, c.image).split(/[\s,|;]+/).find((u) => /^https:\/\//i.test(u)) || '';
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
      problem,
    });
  }
  return { rows };
}
