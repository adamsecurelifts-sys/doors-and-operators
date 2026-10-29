import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

function parseJson(value: unknown) {
  if (typeof value !== 'string') return value ?? {};
  try { return JSON.parse(value); } catch { return {}; }
}

export async function GET() {
  const user = await currentUser();
  if (!user || !['admin', 'warehouse'].includes(user.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const [orders] = await db().query<any[]>(`SELECT o.id,o.order_number,o.company_name,o.status,o.payment_method,o.payment_status,o.subtotal,o.shipping,o.tax,o.total,o.shipping_address,o.fulfillment_notes,o.created_at,o.updated_at,
      u.email AS customerEmail,u.contact_name AS contactName
      FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC,o.id DESC LIMIT 200`);
    if (!orders.length) return NextResponse.json({ orders: [] });
    const ids = orders.map((order) => Number(order.id));
    const placeholders = ids.map(() => '?').join(',');
    const [items] = await db().execute<any[]>(`SELECT oi.id,oi.order_id AS orderId,oi.product_id AS productId,oi.warehouse_id AS warehouseId,oi.sku_snapshot AS sku,oi.name_snapshot AS name,oi.quantity,oi.unit_price AS unitPrice,oi.line_total AS lineTotal,
      v.label AS variantLabel,c.variant_id AS variantId,c.customization_json AS customizations
      FROM order_items oi LEFT JOIN order_item_configurations c ON c.order_item_id=oi.id LEFT JOIN product_variants v ON v.id=c.variant_id
      WHERE oi.order_id IN (${placeholders}) ORDER BY oi.id`, ids);
    const [history] = await db().execute<any[]>(`SELECT h.order_id AS orderId,h.from_status,h.to_status,h.note,h.created_at,u.contact_name AS actor
      FROM order_status_history h JOIN users u ON u.id=h.actor_user_id WHERE h.order_id IN (${placeholders}) ORDER BY h.created_at,h.id`, ids);
    const orderItems = items.map((item) => ({ ...item, id: Number(item.id), orderId: Number(item.orderId), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal), variantId: item.variantId === null ? null : Number(item.variantId), customizations: parseJson(item.customizations) }));
    const ordersWithItems = orders.map((order) => ({ ...order, id: Number(order.id), subtotal: Number(order.subtotal), shipping: Number(order.shipping), tax: Number(order.tax), total: Number(order.total), items: orderItems.filter((item) => item.orderId === Number(order.id)), history: history.filter((event) => Number(event.orderId) === Number(order.id)) }));
    return NextResponse.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Admin orders listing failed', error);
    return NextResponse.json({ error: 'order_service_unavailable' }, { status: 503 });
  }
}
