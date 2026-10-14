// Splits admin-only supplier/cost data away from public product and order documents.
// Public documents (products, orders) are readable by customers; the private halves
// live in product_private/{productId} and order_private/{orderId}, readable only by admins.
import type { Product, ProductPrivate, Order, OrderItem, OrderPrivate, OrderPrivateItem } from '../types/store';

export const PRODUCT_PRIVATE_FIELDS = [
  'costPrice',
  'supplierName',
  'supplierProductUrl',
  'supplierSku',
  'supplierCostPrice',
] as const;

const ORDER_ITEM_PRIVATE_FIELDS = [
  'supplierName',
  'supplierSku',
  'supplierProductUrl',
  'supplierCostPrice',
] as const;

export function hasProductPrivateFields(data: Record<string, any> | null | undefined): boolean {
  if (!data) return false;
  return PRODUCT_PRIVATE_FIELDS.some((k) => data[k] !== undefined);
}

export function splitProductPrivate<T extends Record<string, any>>(
  product: T
): { publicData: Omit<T, (typeof PRODUCT_PRIVATE_FIELDS)[number]>; privateData: ProductPrivate | null } {
  const publicData: Record<string, any> = { ...product };
  const privateData: Record<string, any> = {};
  for (const key of PRODUCT_PRIVATE_FIELDS) {
    if (publicData[key] !== undefined) {
      privateData[key] = publicData[key];
    }
    delete publicData[key];
  }
  if (Object.keys(privateData).length === 0) {
    return { publicData: publicData as any, privateData: null };
  }
  return {
    publicData: publicData as any,
    privateData: { productId: String(product.id || ''), ...privateData },
  };
}

export function mergeProductPrivate(product: Product, priv?: ProductPrivate | null): Product {
  if (!priv) return product;
  const { productId: _ignored, updatedAt: _ts, ...fields } = priv;
  return { ...product, ...fields };
}

export function orderItemsHavePrivateFields(items: any[] | null | undefined): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((it) => it && ORDER_ITEM_PRIVATE_FIELDS.some((k) => it[k] !== undefined));
}

export function splitOrderItemsPrivate(items: OrderItem[]): {
  publicItems: OrderItem[];
  privateItems: OrderPrivateItem[];
} {
  const publicItems: OrderItem[] = [];
  const privateItems: OrderPrivateItem[] = [];
  for (const item of items || []) {
    const pub: Record<string, any> = { ...item };
    const priv: OrderPrivateItem = { productId: item.productId };
    for (const key of ORDER_ITEM_PRIVATE_FIELDS) {
      if (pub[key] !== undefined) {
        (priv as any)[key] = pub[key];
      }
      delete pub[key];
    }
    publicItems.push(pub as OrderItem);
    privateItems.push(priv);
  }
  return { publicItems, privateItems };
}

export function mergeOrderPrivate(order: Order, priv?: OrderPrivate | null): Order {
  if (!priv || !Array.isArray(priv.items) || !Array.isArray(order.items)) return order;
  const used = new Set<number>();
  const items = order.items.map((item, idx) => {
    // Items are written in the same order; fall back to productId matching.
    let match = priv.items[idx];
    if (!match || match.productId !== item.productId) {
      const foundIdx = priv.items.findIndex((p, i) => !used.has(i) && p.productId === item.productId);
      match = foundIdx >= 0 ? priv.items[foundIdx] : undefined as any;
      if (foundIdx >= 0) used.add(foundIdx);
    } else {
      used.add(idx);
    }
    if (!match) return item;
    const { productId: _ignored, ...fields } = match;
    return { ...item, ...fields };
  });
  return { ...order, items };
}
