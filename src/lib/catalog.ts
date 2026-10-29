import { db } from './db';
export type Product = { id: number; sku: string; name: string; category: string; description: string; unitPrice: number; quantityOnHand: number; minOrderQty: number };
export async function products(): Promise<Product[]> {
  const [rows] = await db().execute<any[]>(`SELECT id,sku,name,category,description,base_price AS unitPrice, min_order_qty AS minOrderQty,
    (SELECT COALESCE(SUM(quantity),0) FROM inventory_balances b WHERE b.product_id=p.id) AS quantityOnHand
    FROM products p WHERE active=1 ORDER BY category,name`);
  return rows;
}
export function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
