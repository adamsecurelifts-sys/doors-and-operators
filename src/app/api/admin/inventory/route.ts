import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const schema=z.object({productId:z.number().int().positive(),variantId:z.number().int().positive().nullable().default(null),warehouseId:z.number().int().positive(),quantityDelta:z.number().int().min(-1000000).max(1000000).refine((value)=>value!==0),reason:z.string().trim().min(3).max(120)});

export async function GET(){
  const user=await currentUser();
  if(!user||!['admin','warehouse'].includes(user.role))return NextResponse.json({error:'forbidden'},{status:403});
  try{
    const [warehouses]=await db().query<any[]>(`SELECT id,code,name FROM warehouses WHERE active=1 ORDER BY name`);
    const [rows]=await db().query<any[]>(`SELECT p.id AS productId,NULL AS variantId,b.warehouse_id AS warehouseId,w.name AS warehouse,p.sku,p.name AS product,NULL AS variation,b.quantity,b.reserved_quantity AS reserved
      FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id JOIN products p ON p.id=b.product_id
      WHERE (p.active=1 AND NOT EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active=1)) OR b.quantity>0 OR b.reserved_quantity>0
      UNION ALL
      SELECT p.id AS productId,v.id AS variantId,b.warehouse_id AS warehouseId,w.name AS warehouse,v.sku,p.name AS product,v.label AS variation,b.quantity,b.reserved_quantity AS reserved
      FROM variant_inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id JOIN product_variants v ON v.id=b.variant_id JOIN products p ON p.id=v.product_id
      WHERE (p.active=1 AND v.active=1) OR b.quantity>0 OR b.reserved_quantity>0 ORDER BY product,sku`);
    return NextResponse.json({warehouses:warehouses.map((row)=>({...row,id:Number(row.id)})),rows:rows.map((row)=>({...row,productId:Number(row.productId),variantId:row.variantId===null?null:Number(row.variantId),warehouseId:Number(row.warehouseId),quantity:Number(row.quantity),reserved:Number(row.reserved)}))});
  }catch(error){console.error('Admin inventory listing failed',error);return NextResponse.json({error:'inventory_service_unavailable'},{status:503})}
}

export async function POST(request:Request){
  const user=await currentUser();
  if(!user||!['admin','warehouse'].includes(user.role))return NextResponse.json({error:'forbidden'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'invalid_inventory_update'},{status:400});
  const data=parsed.data;const connection=await db().getConnection();
  try{
    await connection.beginTransaction();
    const [[warehouse]]=await connection.execute<any[]>(`SELECT id FROM warehouses WHERE id=? AND active=1 FOR UPDATE`,[data.warehouseId]);
    const [[product]]=await connection.execute<any[]>(`SELECT id,active FROM products WHERE id=? FOR UPDATE`,[data.productId]);
    if(!warehouse||!product)throw new Error('product_or_warehouse_unavailable');
    const reference=data.reason.trim();const movementType=data.quantityDelta>0?'receipt':'adjustment';
    if(data.variantId!==null){
      const [[variant]]=await connection.execute<any[]>(`SELECT id,active FROM product_variants WHERE id=? AND product_id=? FOR UPDATE`,[data.variantId,data.productId]);
      if(!variant)throw new Error('variant_unavailable');
      if(data.quantityDelta>0&&(!product.active||!variant.active))throw new Error('cannot_receive_archived_item');
      await connection.execute(`INSERT IGNORE INTO variant_inventory_balances(warehouse_id,variant_id,quantity,reserved_quantity) VALUES(?,?,0,0)`,[data.warehouseId,data.variantId]);
      const [result]=await connection.execute<any>(`UPDATE variant_inventory_balances SET quantity=quantity+? WHERE warehouse_id=? AND variant_id=? AND quantity+?>=reserved_quantity`,[data.quantityDelta,data.warehouseId,data.variantId,data.quantityDelta]);
      if(!result.affectedRows)throw new Error('cannot_reduce_below_reserved_stock');
      await connection.execute(`INSERT INTO variant_inventory_movements(variant_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,?,?,?,?)`,[data.variantId,data.warehouseId,data.quantityDelta,movementType,reference,user.id]);
    }else{
      const [[hasVariants]]=await connection.execute<any[]>(`SELECT COUNT(*) AS total FROM product_variants WHERE product_id=? AND active=1`,[data.productId]);
      if(Number(hasVariants.total)>0)throw new Error('select_a_product_variation');
      if(data.quantityDelta>0&&!product.active)throw new Error('cannot_receive_archived_item');
      await connection.execute(`INSERT IGNORE INTO inventory_balances(warehouse_id,product_id,quantity,reserved_quantity) VALUES(?,?,0,0)`,[data.warehouseId,data.productId]);
      const [result]=await connection.execute<any>(`UPDATE inventory_balances SET quantity=quantity+? WHERE warehouse_id=? AND product_id=? AND quantity+?>=reserved_quantity`,[data.quantityDelta,data.warehouseId,data.productId,data.quantityDelta]);
      if(!result.affectedRows)throw new Error('cannot_reduce_below_reserved_stock');
      await connection.execute(`INSERT INTO inventory_movements(product_id,warehouse_id,quantity_delta,movement_type,reference,actor_user_id) VALUES(?,?,?,?,?,?)`,[data.productId,data.warehouseId,data.quantityDelta,movementType,reference,user.id]);
    }
    await connection.commit();return NextResponse.json({updated:true});
  }catch(error){
    await connection.rollback();const message=error instanceof Error?error.message:'inventory_update_failed';
    if(['product_or_warehouse_unavailable','variant_unavailable','select_a_product_variation','cannot_reduce_below_reserved_stock','cannot_receive_archived_item'].includes(message))return NextResponse.json({error:message},{status:409});
    console.error('Admin inventory update failed',error);return NextResponse.json({error:'inventory_update_failed'},{status:500});
  }finally{connection.release()}
}
