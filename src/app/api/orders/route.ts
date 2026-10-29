import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(10000) })).min(1).max(100),
  paymentMethod: z.enum(['card', 'bank_transfer', 'credit_terms']),
  shippingAddress: z.string().trim().min(5).max(255),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid_order' }, { status: 400 });

  const c = await db().getConnection();
  try {
    await c.beginTransaction();
    const method = body.data.paymentMethod;
    if (method === 'credit_terms' && !user.creditTermsApproved) throw new Error('credit_terms_not_approved');
    // Reject card checkout unconditionally until a real provider adapter and verified webhooks exist.
    if (method === 'card') throw new Error('card_payments_not_configured');

    const quantities = new Map<number, number>();
    for (const line of body.data.items) quantities.set(line.productId, (quantities.get(line.productId) || 0) + line.quantity);
    const lines = [...quantities.entries()].sort(([a], [b]) => a - b);
    const locked = [];
    let subtotal = 0;
    for (const [productId, quantity] of lines) {
      const [[product]] = await c.query<any[]>(`SELECT p.id,p.sku,p.name,p.base_price,p.min_order_qty,
        b.quantity,b.reserved_quantity,w.id AS warehouse_id
        FROM products p JOIN inventory_balances b ON b.product_id=p.id
        JOIN warehouses w ON w.id=b.warehouse_id
        WHERE p.id=? AND p.active=1 AND w.active=1
        ORDER BY w.id LIMIT 1 FOR UPDATE`, [productId]);
      if (!product) throw new Error('product_unavailable');
      if (quantity < product.min_order_qty) throw new Error('below_minimum_order_quantity');
      if (product.quantity - product.reserved_quantity < quantity) throw new Error('insufficient_stock');
      const price = Number(product.base_price);
      subtotal += price * quantity;
      locked.push({ product, quantity, price });
    }

    const paymentStatus = method === 'bank_transfer' ? 'awaiting_transfer' : 'terms_due';
    const orderNumber = `DAO-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const [result] = await c.execute<any>(`INSERT INTO orders
      (order_number,user_id,company_name,status,payment_method,payment_status,subtotal,total,shipping_address)
      SELECT ?,id,company_name,'pending',?,?,?, ?,? FROM users WHERE id=?`,
      [orderNumber, method, paymentStatus, subtotal, subtotal, body.data.shippingAddress, user.id]);

    for (const line of locked) {
      await c.execute(`INSERT INTO order_items
        (order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total)
        VALUES(?,?,?,?,?,?,?)`, [result.insertId, line.product.id, line.product.sku, line.product.name,
        line.quantity, line.price, line.price * line.quantity]);
      await c.execute(`UPDATE inventory_balances SET reserved_quantity=reserved_quantity+?
        WHERE warehouse_id=? AND product_id=?`, [line.quantity, line.product.warehouse_id, line.product.id]);
      await c.execute(`INSERT INTO inventory_movements
        (product_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id)
        VALUES(?,?,0,'reservation',?,?)`, [line.product.id, line.product.warehouse_id, orderNumber, user.id]);
    }
    await c.commit();
    return NextResponse.json({ orderNumber, paymentStatus, checkout: 'created' }, { status: 201 });
  } catch (e) {
    await c.rollback();
    const message = e instanceof Error ? e.message : 'order_failed';
    return NextResponse.json({ error: message }, { status: message === 'insufficient_stock' ? 409 : 400 });
  } finally {
    c.release();
  }
}
