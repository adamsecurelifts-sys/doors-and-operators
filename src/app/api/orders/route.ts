import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const jsonValue = z.union([z.string().max(500),z.number().finite(),z.boolean()]);
const schema = z.object({
  items: z.array(z.object({ productId: z.number().int().positive(), variantId: z.number().int().positive().nullable().optional(), quantity: z.number().int().positive().max(10000), customizations: z.record(z.string(),jsonValue).default({}) })).min(1).max(100),
  paymentMethod: z.enum(['card','bank_transfer','credit_terms']),
  shippingAddress: z.string().trim().min(5).max(255),
});

function asChoices(value: unknown): Array<{label:string;value:string;priceDelta:number}> {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; } catch { return []; } }
  return [];
}
function cents(value: number) { return Math.round(value * 100); }

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid_order' }, { status: 400 });

  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const method = body.data.paymentMethod;
    if (method === 'card') throw new Error('card_payments_not_configured');
    const orderNumber = `DAO-${Date.now()}-${Math.floor(Math.random()*9000+1000)}`;
    const [[account]] = await connection.execute<any[]>(`SELECT status,credit_terms_approved AS creditTermsApproved,credit_limit AS creditLimit FROM users WHERE id=? FOR UPDATE`, [user.id]);
    if (!account || account.status !== 'active') throw new Error('account_not_active');
    if (method === 'credit_terms' && !account.creditTermsApproved) throw new Error('credit_terms_not_approved');

    const lines = [...body.data.items].sort((a,b) => a.productId-b.productId || (a.variantId ?? 0)-(b.variantId ?? 0));
    const prepared: Array<{productId:number;variantId:number|null;warehouseId:number;sku:string;name:string;quantity:number;price:number;customizations:Record<string,{value:string|number|boolean;label:string}>}> = [];
    let subtotalCents = 0;

    for (const line of lines) {
      const [[product]] = await connection.execute<any[]>(`SELECT id,sku,name,base_price AS basePrice,min_order_qty AS minOrderQty,active FROM products WHERE id=? FOR UPDATE`, [line.productId]);
      if (!product || !product.active) throw new Error('product_unavailable');
      const [[variantCount]] = await connection.execute<any[]>(`SELECT COUNT(*) AS total FROM product_variants WHERE product_id=? AND active=1`, [line.productId]);
      if ((!line.variantId || line.variantId === null) && Number(variantCount.total)>0) throw new Error('variant_required');
      let variant: any = null;
      let warehouseId: number | undefined;
      let price = Number(product.basePrice);
      let sku = product.sku;
      let name = product.name;
      let minOrderQty = Number(product.minOrderQty);
      if (line.variantId !== undefined && line.variantId !== null) {
        const [[v]] = await connection.execute<any[]>(`SELECT id,sku,label,price_override AS priceOverride,min_order_qty AS minOrderQty,active FROM product_variants WHERE id=? AND product_id=? FOR UPDATE`, [line.variantId,line.productId]);
        if (!v || !v.active) throw new Error('variant_unavailable');
        variant = v; sku = v.sku; name = product.name; minOrderQty = Number(v.minOrderQty);
        if (v.priceOverride !== null) price = Number(v.priceOverride);
        const [balances] = await connection.execute<any[]>(`SELECT vb.warehouse_id AS warehouseId,vb.quantity,vb.reserved_quantity AS reservedQuantity
          FROM variant_inventory_balances vb JOIN warehouses w ON w.id=vb.warehouse_id WHERE vb.variant_id=? AND w.active=1 ORDER BY w.id FOR UPDATE`, [v.id]);
        const balance = balances.find((row) => Number(row.quantity)-Number(row.reservedQuantity) >= line.quantity);
        if (!balance) throw new Error('insufficient_stock');
        warehouseId = Number(balance.warehouseId);
        await connection.execute(`UPDATE variant_inventory_balances SET reserved_quantity=reserved_quantity+? WHERE variant_id=? AND warehouse_id=?`, [line.quantity,v.id,warehouseId]);
        await connection.execute(`INSERT INTO variant_inventory_movements(variant_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,0,'reservation',?,?)`, [v.id,warehouseId,orderNumber,user.id]);
      } else {
        const [balances] = await connection.execute<any[]>(`SELECT b.warehouse_id AS warehouseId,b.quantity,b.reserved_quantity AS reservedQuantity
          FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=? AND w.active=1 ORDER BY w.id FOR UPDATE`, [line.productId]);
        const balance = balances.find((row) => Number(row.quantity)-Number(row.reservedQuantity) >= line.quantity);
        if (!balance) throw new Error('insufficient_stock');
        warehouseId = Number(balance.warehouseId);
        await connection.execute(`UPDATE inventory_balances SET reserved_quantity=reserved_quantity+? WHERE product_id=? AND warehouse_id=?`, [line.quantity,line.productId,warehouseId]);
        await connection.execute(`INSERT INTO inventory_movements(product_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,0,'reservation',?,?)`, [line.productId,warehouseId,orderNumber,user.id]);
      }
      if (line.quantity < minOrderQty) throw new Error('below_minimum_order_quantity');

      const [options] = await connection.execute<any[]>(`SELECT id,name,input_type AS inputType,required,choices_json AS choices,price_delta AS priceDelta,min_value AS minValue,max_value AS maxValue
        FROM product_customization_options WHERE product_id=? AND active=1 ORDER BY sort_order,id`, [line.productId]);
      const allowed = new Set(options.map((option) => option.name));
      for (const key of Object.keys(line.customizations)) if (!allowed.has(key)) throw new Error('invalid_customization');
      const selected: Record<string,{value:string|number|boolean;label:string}> = {};
      for (const option of options) {
        const raw = line.customizations[option.name];
        if (raw === undefined || raw === '') {
          if (option.required) throw new Error('required_customization_missing');
          continue;
        }
        if (option.inputType === 'select') {
          if (typeof raw !== 'string') throw new Error('invalid_customization');
          const choice = asChoices(option.choices).find((item) => item.value === raw);
          if (!choice) throw new Error('invalid_customization');
          price += Number(choice.priceDelta ?? option.priceDelta ?? 0);
          selected[option.name] = { value: choice.value, label: choice.label };
        } else if (option.inputType === 'text') {
          if (typeof raw !== 'string' || raw.trim().length > 500) throw new Error('invalid_customization');
          if (option.required && !raw.trim()) throw new Error('required_customization_missing');
          if (raw.trim()) price += Number(option.priceDelta);
          selected[option.name] = { value: raw.trim(), label: raw.trim() };
        } else if (option.inputType === 'number') {
          const number = typeof raw === 'number' ? raw : Number.NaN;
          if (!Number.isFinite(number) || (option.minValue !== null && number < Number(option.minValue)) || (option.maxValue !== null && number > Number(option.maxValue))) throw new Error('customization_out_of_range');
          price += Number(option.priceDelta);
          selected[option.name] = { value: number, label: String(number) };
        } else {
          if (typeof raw !== 'boolean') throw new Error('invalid_customization');
          if (raw) price += Number(option.priceDelta);
          selected[option.name] = { value: raw, label: raw ? 'Yes' : 'No' };
        }
      }
      if (price < 0) throw new Error('invalid_customization_price');
      subtotalCents += cents(price) * line.quantity;
      prepared.push({ productId:line.productId,variantId:variant?Number(variant.id):null,warehouseId,sku,name,quantity:line.quantity,price:cents(price)/100,customizations:selected });
    }
    const subtotal = subtotalCents / 100;
    if (method === 'credit_terms') {
      const [[exposure]] = await connection.execute<any[]>(`SELECT COALESCE(SUM(total),0) AS outstanding FROM orders WHERE user_id=? AND payment_method='credit_terms' AND payment_status<>'paid' AND status<>'cancelled'`, [user.id]);
      if (Number(exposure.outstanding) + subtotal > Number(account.creditLimit)) throw new Error('credit_limit_exceeded');
    }

    const paymentStatus = method === 'bank_transfer' ? 'awaiting_transfer' : 'terms_due';
    const [orderResult] = await connection.execute<any>(`INSERT INTO orders(order_number,user_id,company_name,status,payment_method,payment_status,subtotal,total,shipping_address)
      SELECT ?,id,company_name,'pending',?,?,?, ?,? FROM users WHERE id=?`, [orderNumber,method,paymentStatus,subtotal,subtotal,body.data.shippingAddress,user.id]);
    for (const line of prepared) {
      const [itemResult] = await connection.execute<any>(`INSERT INTO order_items(order_id,product_id,warehouse_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total)
        VALUES(?,?,?,?,?,?,?,?)`, [orderResult.insertId,line.productId,line.warehouseId,line.sku,line.name,line.quantity,line.price,line.price*line.quantity]);
      if (line.variantId !== null || Object.keys(line.customizations).length) {
        await connection.execute(`INSERT INTO order_item_configurations(order_item_id,variant_id,customization_json) VALUES(?,?,?)`, [itemResult.insertId,line.variantId,Object.keys(line.customizations).length?JSON.stringify(line.customizations):null]);
      }
    }
    await connection.execute(`INSERT INTO order_status_history(order_id,from_status,to_status,note,actor_user_id) VALUES(?,NULL,'pending','Customer submitted order request',?)`, [orderResult.insertId,user.id]);
    await connection.commit();
    return NextResponse.json({ orderNumber,paymentStatus,checkout:'created' }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'order_failed';
    const conflict = ['insufficient_stock','product_unavailable','variant_unavailable','variant_required','credit_limit_exceeded'].includes(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  } finally {
    connection.release();
  }
}
