import { db } from './db';

export type ProductVariant = { id:number;sku:string;label:string;attributes:Record<string,string|number|boolean>;unitPrice:number;minOrderQty:number;quantityOnHand:number };
export type ProductCustomization = { id:number;name:string;inputType:'select'|'text'|'number'|'checkbox';required:boolean;choices:Array<{label:string;value:string;priceDelta:number}>;priceDelta:number;minValue:number|null;maxValue:number|null };
export type Product = { id:number;sku:string;manufacturerPartNumber:string|null;name:string;category:string;description:string;unitPrice:number;quantityOnHand:number;minOrderQty:number;imageUrl:string|null;imageAlt:string;variants:ProductVariant[];customizations:ProductCustomization[] };

function json<T>(value:unknown,fallback:T):T {
  if (typeof value !== 'string') return (value ?? fallback) as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function products(): Promise<Product[]> {
  const [rows] = await db().query<any[]>(`SELECT p.id,p.sku,p.manufacturer_part_number AS manufacturerPartNumber,p.name,p.category,p.description,p.base_price AS unitPrice,p.min_order_qty AS minOrderQty,
    COALESCE((SELECT SUM(vb.quantity) FROM product_variants v JOIN variant_inventory_balances vb ON vb.variant_id=v.id WHERE v.product_id=p.id AND v.active=1),
      (SELECT SUM(b.quantity) FROM inventory_balances b WHERE b.product_id=p.id),0) AS quantityOnHand,
    (SELECT pm.image_url FROM product_media pm WHERE pm.product_id=p.id ORDER BY pm.sort_order,pm.id LIMIT 1) AS imageUrl,
    (SELECT pm.alt_text FROM product_media pm WHERE pm.product_id=p.id ORDER BY pm.sort_order,pm.id LIMIT 1) AS imageAlt
    FROM products p WHERE p.active=1 ORDER BY p.category,p.name`);
  const result: Product[] = [];
  for (const row of rows) {
    const [variants] = await db().execute<any[]>(`SELECT v.id,v.sku,v.label,v.attributes_json AS attributes,COALESCE(v.price_override,p.base_price) AS unitPrice,v.min_order_qty AS minOrderQty,COALESCE(SUM(b.quantity),0) AS quantityOnHand
      FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN variant_inventory_balances b ON b.variant_id=v.id
      WHERE v.product_id=? AND v.active=1 GROUP BY v.id ORDER BY v.sort_order,v.label`, [row.id]);
    const [options] = await db().execute<any[]>(`SELECT id,name,input_type AS inputType,required,choices_json AS choices,price_delta AS priceDelta,min_value AS minValue,max_value AS maxValue
      FROM product_customization_options WHERE product_id=? AND active=1 ORDER BY sort_order,id`, [row.id]);
    result.push({
      ...row,id:Number(row.id),unitPrice:Number(row.unitPrice),minOrderQty:Number(row.minOrderQty),quantityOnHand:Number(row.quantityOnHand),
      imageUrl:row.imageUrl??null,imageAlt:row.imageAlt??row.name,
      variants:variants.map((variant)=>({id:Number(variant.id),sku:variant.sku,label:variant.label,attributes:json(variant.attributes,{}),unitPrice:Number(variant.unitPrice),minOrderQty:Number(variant.minOrderQty),quantityOnHand:Number(variant.quantityOnHand)})),
      customizations:options.map((option)=>({id:Number(option.id),name:option.name,inputType:option.inputType,required:Boolean(option.required),choices:json(option.choices,[]),priceDelta:Number(option.priceDelta),minValue:option.minValue===null?null:Number(option.minValue),maxValue:option.maxValue===null?null:Number(option.maxValue)})),
    });
  }
  return result;
}

export function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
