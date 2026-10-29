import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({
  status: z.enum(['pending','confirmed','picking','packed','shipped','cancelled']).optional(),
  paymentStatus: z.enum(['unconfigured','awaiting_transfer','pending','paid','terms_due','failed']).optional(),
  fulfillmentNotes: z.string().trim().max(2000).optional(),
}).refine((value) => value.status !== undefined || value.paymentStatus !== undefined || value.fulfillmentNotes !== undefined);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user || !['admin','warehouse'].includes(user.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_order_update' }, { status: 400 });
  if (parsed.data.paymentStatus !== undefined && user.role !== 'admin') return NextResponse.json({ error: 'admin_required_for_payment_updates' }, { status: 403 });

  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.execute<any[]>(`SELECT id,order_number,status,payment_status,payment_method,fulfillment_notes FROM orders WHERE id=? FOR UPDATE`, [id]);
    if (!order) {
      await connection.rollback();
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }
    const nextStatus = parsed.data.status ?? order.status;
    const allowed: Record<string, string[]> = {
      pending: ['confirmed','cancelled'], confirmed: ['picking','cancelled'],
      picking: ['packed','cancelled'], packed: ['shipped','cancelled'],
      shipped: [], cancelled: [],
    };
    if (parsed.data.status && !allowed[order.status]?.includes(nextStatus)) throw new Error('invalid_status_transition');
    if (parsed.data.paymentStatus === 'paid' && order.payment_method === 'card') throw new Error('card_payment_not_configured');

    if (nextStatus === 'cancelled' && order.status !== 'cancelled') {
      const [items] = await connection.execute<any[]>(`SELECT oi.id,oi.product_id AS productId,oi.warehouse_id AS warehouseId,oi.quantity,c.variant_id AS variantId
        FROM order_items oi LEFT JOIN order_item_configurations c ON c.order_item_id=oi.id WHERE oi.order_id=? FOR UPDATE`, [id]);
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (item.variantId !== null && item.variantId !== undefined) {
          const [result] = await connection.execute<any>(`UPDATE variant_inventory_balances SET reserved_quantity=reserved_quantity-? WHERE variant_id=? AND warehouse_id=? AND reserved_quantity>=?`, [quantity,item.variantId,item.warehouseId,quantity]);
          if (!result.affectedRows) throw new Error('reserved_stock_record_missing');
          await connection.execute(`INSERT INTO variant_inventory_movements(variant_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,0,'release',?,?)`, [item.variantId,item.warehouseId,order.order_number,user.id]);
        } else {
          let warehouseId = item.warehouseId;
          if (!warehouseId) {
            const [[balance]] = await connection.execute<any[]>(`SELECT warehouse_id AS warehouseId FROM inventory_balances WHERE product_id=? AND reserved_quantity>=? ORDER BY warehouse_id LIMIT 1 FOR UPDATE`, [item.productId,quantity]);
            warehouseId = balance?.warehouseId;
          }
          const [result] = await connection.execute<any>(`UPDATE inventory_balances SET reserved_quantity=reserved_quantity-? WHERE product_id=? AND warehouse_id=? AND reserved_quantity>=?`, [quantity,item.productId,warehouseId,quantity]);
          if (!result.affectedRows) throw new Error('reserved_stock_record_missing');
          await connection.execute(`INSERT INTO inventory_movements(product_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,0,'release',?,?)`, [item.productId,warehouseId,order.order_number,user.id]);
        }
      }
    }

    if (nextStatus === 'shipped' && order.status !== 'shipped') {
      if (order.status !== 'packed') throw new Error('order_must_be_packed_before_shipping');
      const [items] = await connection.execute<any[]>(`SELECT oi.id,oi.product_id AS productId,oi.warehouse_id AS warehouseId,oi.quantity,c.variant_id AS variantId
        FROM order_items oi LEFT JOIN order_item_configurations c ON c.order_item_id=oi.id WHERE oi.order_id=? FOR UPDATE`, [id]);
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (item.variantId !== null && item.variantId !== undefined) {
          const [result] = await connection.execute<any>(`UPDATE variant_inventory_balances SET quantity=quantity-?,reserved_quantity=reserved_quantity-? WHERE variant_id=? AND warehouse_id=? AND quantity>=? AND reserved_quantity>=?`, [quantity,quantity,item.variantId,item.warehouseId,quantity,quantity]);
          if (!result.affectedRows) throw new Error('reserved_stock_record_missing');
          await connection.execute(`INSERT INTO variant_inventory_movements(variant_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,?,'shipment',?,?)`, [item.variantId,item.warehouseId,-quantity,order.order_number,user.id]);
        } else {
          let warehouseId = item.warehouseId;
          if (!warehouseId) {
            const [[balance]] = await connection.execute<any[]>(`SELECT warehouse_id AS warehouseId FROM inventory_balances WHERE product_id=? AND reserved_quantity>=? ORDER BY warehouse_id LIMIT 1 FOR UPDATE`, [item.productId,quantity]);
            warehouseId = balance?.warehouseId;
          }
          const [result] = await connection.execute<any>(`UPDATE inventory_balances SET quantity=quantity-?,reserved_quantity=reserved_quantity-? WHERE product_id=? AND warehouse_id=? AND quantity>=? AND reserved_quantity>=?`, [quantity,quantity,item.productId,warehouseId,quantity,quantity]);
          if (!result.affectedRows) throw new Error('reserved_stock_record_missing');
          await connection.execute(`INSERT INTO inventory_movements(product_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,?,'shipment',?,?)`, [item.productId,warehouseId,-quantity,order.order_number,user.id]);
        }
      }
    }

    if (parsed.data.status && parsed.data.status !== order.status) {
      await connection.execute(`INSERT INTO order_status_history(order_id,from_status,to_status,note,actor_user_id) VALUES(?,?,?,?,?)`, [id,order.status,parsed.data.status,parsed.data.fulfillmentNotes ?? null,user.id]);
    }
    const paymentStatus = parsed.data.paymentStatus ?? order.payment_status;
    const notes = parsed.data.fulfillmentNotes ?? order.fulfillment_notes;
    await connection.execute(`UPDATE orders SET status=?,payment_status=?,fulfillment_notes=? WHERE id=?`, [nextStatus,paymentStatus,notes,id]);
    if (parsed.data.paymentStatus && parsed.data.paymentStatus !== order.payment_status) {
      await connection.execute(`INSERT INTO payment_events(order_id,provider,event_type,payload_json) VALUES(?,?,?,?)`, [id,'manual_admin','status_updated',JSON.stringify({ from: order.payment_status, to: parsed.data.paymentStatus, actorUserId: user.id })]);
    }
    await connection.commit();
    return NextResponse.json({ updated: true, status: nextStatus, paymentStatus });
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'order_update_failed';
    if (['invalid_status_transition','reserved_stock_record_missing','order_must_be_packed_before_shipping','card_payment_not_configured'].includes(message)) return NextResponse.json({ error: message }, { status: 409 });
    console.error('Admin order update failed', error);
    return NextResponse.json({ error: 'order_update_failed' }, { status: 500 });
  } finally {
    connection.release();
  }
}
