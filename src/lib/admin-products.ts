import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const jsonValue = z.union([z.string().max(300), z.number().finite(), z.boolean()]);
const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  sku: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  attributes: z.record(z.string(), jsonValue).default({}),
  priceOverride: z.number().finite().nonnegative().max(10000000).nullable().default(null),
  minOrderQty: z.number().int().positive().max(100000).default(1),
  initialQuantity: z.number().int().nonnegative().max(10000000).default(0),
  active: z.boolean().default(true),
});
const customizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  inputType: z.enum(['select', 'text', 'number', 'checkbox']),
  required: z.boolean().default(false),
  choices: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(100), priceDelta: z.number().finite().min(-100000).max(100000).default(0) })).max(100).default([]),
  priceDelta: z.number().finite().min(-100000).max(100000).default(0),
  minValue: z.number().finite().nullable().default(null),
  maxValue: z.number().finite().nullable().default(null),
  active: z.boolean().default(true),
}).superRefine((option, ctx) => {
  if (option.inputType === 'select' && option.choices.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['choices'], message: 'Select options need at least one choice.' });
  }
  if (option.minValue !== null && option.maxValue !== null && option.minValue > option.maxValue) {
    ctx.addIssue({ code: 'custom', path: ['maxValue'], message: 'Maximum must be greater than minimum.' });
  }
});
const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  manufacturerPartNumber: z.string().trim().max(120).nullable().default(null),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(10000).default(''),
  basePrice: z.number().finite().nonnegative().max(10000000),
  minOrderQty: z.number().int().positive().max(100000).default(1),
  active: z.boolean().default(true),
  imageUrl: z.string().trim().url().max(1000).refine((value) => { try { return ['https:','http:'].includes(new URL(value).protocol); } catch { return false; } }).nullable().default(null),
  imageAlt: z.string().trim().max(240).default(''),
  variants: z.array(variantSchema).max(100).default([]),
  customizations: z.array(customizationSchema).max(40).default([]),
});

function parseJson(value: unknown, fallback: unknown = {}) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const [products] = await db().query<any[]>(`SELECT p.id,p.sku,p.manufacturer_part_number AS manufacturerPartNumber,p.name,p.category,p.description,p.base_price AS basePrice,p.min_order_qty AS minOrderQty,p.active,
      COALESCE((SELECT SUM(vb.quantity) FROM product_variants v JOIN variant_inventory_balances vb ON vb.variant_id=v.id WHERE v.product_id=p.id AND v.active=1),
        (SELECT SUM(b.quantity) FROM inventory_balances b WHERE b.product_id=p.id),0) AS quantityOnHand
      FROM products p ORDER BY p.category,p.name`);
    const [variants] = await db().query<any[]>(`SELECT v.id,v.product_id AS productId,v.sku,v.label,v.attributes_json AS attributes,v.price_override AS priceOverride,v.min_order_qty AS minOrderQty,v.active,COALESCE(SUM(b.quantity),0) AS quantityOnHand
      FROM product_variants v LEFT JOIN variant_inventory_balances b ON b.variant_id=v.id GROUP BY v.id ORDER BY v.product_id,v.sort_order,v.label`);
    const [options] = await db().query<any[]>(`SELECT id,product_id AS productId,name,input_type AS inputType,required,choices_json AS choices,price_delta AS priceDelta,min_value AS minValue,max_value AS maxValue,active
      FROM product_customization_options ORDER BY product_id,sort_order,id`);
    const [media] = await db().query<any[]>(`SELECT id,product_id AS productId,image_url AS imageUrl,alt_text AS imageAlt FROM product_media ORDER BY product_id,sort_order,id`);
    return NextResponse.json({ products: products.map((p) => ({
      ...p, active: Boolean(p.active), basePrice: Number(p.basePrice), minOrderQty: Number(p.minOrderQty), quantityOnHand: Number(p.quantityOnHand),
      variants: variants.filter((v) => Number(v.productId) === Number(p.id)).map((v) => ({ ...v, id: Number(v.id), active: Boolean(v.active), attributes: parseJson(v.attributes), priceOverride: v.priceOverride === null ? null : Number(v.priceOverride), minOrderQty: Number(v.minOrderQty), quantityOnHand: Number(v.quantityOnHand) })),
      customizations: options.filter((o) => Number(o.productId) === Number(p.id)).map((o) => ({ ...o, id: Number(o.id), required: Boolean(o.required), active: Boolean(o.active), priceDelta: Number(o.priceDelta), minValue: o.minValue === null ? null : Number(o.minValue), maxValue: o.maxValue === null ? null : Number(o.maxValue), choices: parseJson(o.choices, []) })),
      image: media.find((m) => Number(m.productId) === Number(p.id)) ?? null,
    })) });
  } catch (error) {
    console.error('Admin product listing failed', error);
    return NextResponse.json({ error: 'product_service_unavailable' }, { status: 503 });
  }
}

export async function saveProduct(raw: unknown, id?: number) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_product', details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const seenSkus = new Set<string>();
  for (const variant of data.variants) {
    if (seenSkus.has(variant.sku.toLowerCase())) return NextResponse.json({ error: 'duplicate_variant_sku' }, { status: 400 });
    seenSkus.add(variant.sku.toLowerCase());
  }
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`INSERT IGNORE INTO warehouses(code,name) VALUES('MAIN','Main warehouse')`);
    const [[warehouse]] = await connection.query<any[]>(`SELECT id FROM warehouses WHERE code='MAIN' LIMIT 1`);
    let productId = id;
    if (id) {
      const [[existingProduct]] = await connection.execute<any[]>(`SELECT id FROM products WHERE id=? FOR UPDATE`, [id]);
      if (!existingProduct) throw new Error('product_not_found');
      await connection.execute(`UPDATE products SET sku=?,manufacturer_part_number=?,name=?,category=?,description=?,base_price=?,min_order_qty=?,active=? WHERE id=?`,
        [data.sku,data.manufacturerPartNumber,data.name,data.category,data.description,data.basePrice,data.minOrderQty,data.active,id]);
    } else {
      const [result] = await connection.execute<any>(`INSERT INTO products(sku,manufacturer_part_number,name,category,description,base_price,min_order_qty,active) VALUES(?,?,?,?,?,?,?,?)`,
        [data.sku,data.manufacturerPartNumber,data.name,data.category,data.description,data.basePrice,data.minOrderQty,data.active]);
      productId = result.insertId;
    }
    if (!productId) throw new Error('product_save_failed');

    const [oldVariants] = await connection.execute<any[]>(`SELECT id FROM product_variants WHERE product_id=?`, [productId]);
    const retained = new Set<number>();
    for (let index=0; index<data.variants.length; index++) {
      const variant = data.variants[index];
      let variantId = variant.id;
      if (variantId && oldVariants.some((row) => Number(row.id) === variantId)) {
        await connection.execute(`UPDATE product_variants SET sku=?,label=?,attributes_json=?,price_override=?,min_order_qty=?,active=?,sort_order=? WHERE id=? AND product_id=?`,
          [variant.sku,variant.label,JSON.stringify(variant.attributes),variant.priceOverride,variant.minOrderQty,variant.active,index,variantId,productId]);
      } else {
        const [result] = await connection.execute<any>(`INSERT INTO product_variants(product_id,sku,label,attributes_json,price_override,min_order_qty,active,sort_order) VALUES(?,?,?,?,?,?,?,?)`,
          [productId,variant.sku,variant.label,JSON.stringify(variant.attributes),variant.priceOverride,variant.minOrderQty,variant.active,index]);
        variantId = Number(result.insertId);
        await connection.execute(`INSERT INTO variant_inventory_balances(warehouse_id,variant_id,quantity) VALUES(?,?,?)`, [warehouse.id,variantId,variant.initialQuantity]);
        if (variant.initialQuantity > 0) await connection.execute(`INSERT INTO variant_inventory_movements(variant_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,?,'receipt','Initial stock',?)`, [variantId,warehouse.id,variant.initialQuantity,user.id]);
      }
      retained.add(Number(variantId));
    }
    for (const old of oldVariants) {
      if (!retained.has(Number(old.id))) await connection.execute(`UPDATE product_variants SET active=0 WHERE id=?`, [old.id]);
    }

    await connection.execute(`INSERT IGNORE INTO inventory_balances(warehouse_id,product_id,quantity) VALUES(?,?,0)`, [warehouse.id,productId]);
    await connection.execute(`DELETE FROM product_customization_options WHERE product_id=?`, [productId]);
    for (let index=0; index<data.customizations.length; index++) {
      const option = data.customizations[index];
      await connection.execute(`INSERT INTO product_customization_options(product_id,name,input_type,required,choices_json,price_delta,min_value,max_value,sort_order,active) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [productId,option.name,option.inputType,option.required,option.inputType==='select'?JSON.stringify(option.choices):null,option.priceDelta,option.minValue,option.maxValue,index,option.active]);
    }
    await connection.execute(`DELETE FROM product_media WHERE product_id=?`, [productId]);
    if (data.imageUrl) await connection.execute(`INSERT INTO product_media(product_id,image_url,alt_text,sort_order) VALUES(?,?,?,0)`, [productId,data.imageUrl,data.imageAlt || data.name]);
    await connection.commit();
    return NextResponse.json({ id: productId, saved: true }, { status: id ? 200 : 201 });
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'product_save_failed';
    if (message.includes('Duplicate entry')) return NextResponse.json({ error: 'sku_already_in_use' }, { status: 409 });
    if (message === 'product_not_found') return NextResponse.json({ error: message }, { status: 404 });
    console.error('Admin product save failed', error);
    return NextResponse.json({ error: 'product_save_failed' }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function POST(request: Request) {
  return saveProduct(await request.json().catch(() => null));
}
