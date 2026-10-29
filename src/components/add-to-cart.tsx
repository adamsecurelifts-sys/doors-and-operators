'use client';

import { useMemo, useState } from 'react';
import type { Product, ProductCustomization, ProductVariant } from '@/lib/catalog';

type CartLine = { lineId:string;productId:number;variantId:number|null;name:string;sku:string;variantLabel:string|null;unitPrice:number;minOrderQty:number;quantity:number;customizations:Record<string,string|number|boolean> };
function lineKey(productId:number,variantId:number|null,customizations:Record<string,string|number|boolean>) {
  return `${productId}:${variantId??'base'}:${JSON.stringify(Object.keys(customizations).sort().map((key)=>[key,customizations[key]]))}`;
}

export default function AddToCart({ product }: { product: Product }) {
  const [variantId,setVariantId]=useState(product.variants.length===1?String(product.variants[0].id):'');
  const [values,setValues]=useState<Record<string,string|number|boolean>>({});
  const [message,setMessage]=useState('');
  const variant = product.variants.find((item)=>String(item.id)===variantId) as ProductVariant|undefined;
  const price = useMemo(()=>{
    let total=variant?.unitPrice??product.unitPrice;
    for(const option of product.customizations){
      const value=values[option.name];
      if(option.inputType==='select'){const choice=option.choices.find((item)=>item.value===value);if(choice)total+=choice.priceDelta;}
      else if(option.inputType==='checkbox'){if(value===true)total+=option.priceDelta;}
      else if(value!==undefined&&value!=='')total+=option.priceDelta;
    }
    return total;
  },[product,variant,values]);
  const minOrderQty=variant?.minOrderQty??product.minOrderQty;
  const available=variant?.quantityOnHand??product.quantityOnHand;
  const missing = (product.variants.length>0&&!variant) || product.customizations.some((option)=>option.required&&(values[option.name]===undefined||values[option.name]===''));
  const outOfStock=available<minOrderQty;

  function add() {
    if(missing||price<0||outOfStock){setMessage(outOfStock?'This item is currently out of stock.':'Choose all required options first.');return;}
    const customizations=Object.fromEntries(Object.entries(values).filter(([,value])=>value!==''&&value!==undefined));
    const id=lineKey(product.id,variant?.id??null,customizations);
    const line:CartLine={lineId:id,productId:product.id,variantId:variant?.id??null,name:product.name,sku:variant?.sku??product.sku,variantLabel:variant?.label??null,unitPrice:price,minOrderQty,quantity:minOrderQty,customizations};
    try {
      const stored=JSON.parse(localStorage.getItem('dao_cart')||'[]') as CartLine[];
      const existing=stored.find((item)=>item.lineId===id);
      if(existing)existing.quantity+=line.quantity;else stored.push(line);
      localStorage.setItem('dao_cart',JSON.stringify(stored));setMessage('Added to cart.');
    } catch { setMessage('Could not save this item to your cart.'); }
    window.setTimeout(()=>setMessage(''),2200);
  }

  return <div className="add-product-options">
    {product.variants.length>0&&<label className="product-option">Variation<select value={variantId} onChange={(event)=>setVariantId(event.target.value)}><option value="">Choose a variation</option>{product.variants.map((item)=><option key={item.id} value={item.id} disabled={item.quantityOnHand<item.minOrderQty}>{item.label} · {item.sku} · ${item.unitPrice.toFixed(2)}{item.quantityOnHand<item.minOrderQty?' · Out of stock':''}</option>)}</select></label>}
    {product.customizations.map((option:ProductCustomization)=>(
      <label className="product-option" key={option.id}>{option.name}{option.required?' *':''}
        {option.inputType==='select'&&<select value={String(values[option.name]??'')} onChange={(event)=>setValues((current)=>({...current,[option.name]:event.target.value}))}><option value="">Choose…</option>{option.choices.map((choice)=><option key={choice.value} value={choice.value}>{choice.label}{choice.priceDelta?` (${choice.priceDelta>0?'+':''}$${choice.priceDelta.toFixed(2)})`:''}</option>)}</select>}
        {option.inputType==='checkbox'&&<input type="checkbox" checked={values[option.name]===true} onChange={(event)=>setValues((current)=>({...current,[option.name]:event.target.checked}))}/>}
        {(option.inputType==='text'||option.inputType==='number')&&<input type={option.inputType==='number'?'number':'text'} min={option.inputType==='number'?(option.minValue??undefined):undefined} max={option.inputType==='number'?(option.maxValue??undefined):undefined} step={option.inputType==='number'?'any':undefined} maxLength={option.inputType==='text'?500:undefined} value={String(values[option.name]??'')} onChange={(event)=>setValues((current)=>({...current,[option.name]:option.inputType==='number'?(event.target.value===''?'':Number(event.target.value)):event.target.value}))}/>}
      </label>
    ))}
    <div className="row small muted"><span>Estimated unit price</span><b>${price.toFixed(2)}</b></div>
    <button type="button" disabled={Boolean(missing||outOfStock)} onClick={add} style={{width:'100%',marginTop:12}}>{outOfStock?'Out of stock':'Add to cart'}</button>
    {message&&<p className="small notice" role="status">{message}</p>}
  </div>;
}
