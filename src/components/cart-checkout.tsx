'use client';

import { useEffect,useState } from 'react';
import Link from 'next/link';

type Item={lineId:string;productId:number;variantId:number|null;name:string;sku:string;variantLabel:string|null;unitPrice:number;minOrderQty:number;quantity:number;customizations:Record<string,string|number|boolean>};
export default function CartCheckout({signedIn,creditApproved}:{signedIn:boolean;creditApproved:boolean}) {
  const [items,setItems]=useState<Item[]>([]);const [method,setMethod]=useState('bank_transfer');const [address,setAddress]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem('dao_cart')||'[]') as any[];setItems(stored.map((item)=>({lineId:item.lineId||`${item.id}:base:{}`,productId:item.productId??item.id,variantId:item.variantId??null,name:item.name,sku:item.sku,variantLabel:item.variantLabel??null,unitPrice:Number(item.unitPrice),minOrderQty:Number(item.minOrderQty??1),quantity:Number(item.quantity),customizations:item.customizations??{}})))}catch{setItems([])}},[]);
  function save(next:Item[]){setItems(next);localStorage.setItem('dao_cart',JSON.stringify(next));}
  async function checkout(){setMessage('');setBusy(true);try{const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map((item)=>({productId:item.productId,variantId:item.variantId,quantity:item.quantity,customizations:item.customizations})),paymentMethod:method,shippingAddress:address})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Order could not be placed');localStorage.removeItem('dao_cart');setItems([]);setMessage(`Order ${data.orderNumber} created. Payment status: ${data.paymentStatus}.`)}catch(error){setMessage(error instanceof Error?error.message.replaceAll('_',' '):'Order could not be placed')}finally{setBusy(false)}}
  const total=items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
  return <>
    <div className="card">{items.length===0?<p>Your cart is empty. <Link href="/catalog">Browse the catalog.</Link></p>:items.map((item)=><div className="cart-line" key={item.lineId}>
      <div><b>{item.name}</b><div className="small muted">SKU {item.sku}{item.variantLabel?` · ${item.variantLabel}`:''} · ${item.unitPrice.toFixed(2)} each</div>{Object.entries(item.customizations).length>0&&<div className="small muted">{Object.entries(item.customizations).map(([key,value])=>`${key}: ${String(value)}`).join(' · ')}</div>}</div>
      <div className="actions"><input aria-label={`Quantity for ${item.name}`} type="number" min={item.minOrderQty} step="1" value={item.quantity} onChange={(event)=>save(items.map((line)=>line.lineId===item.lineId?{...line,quantity:Math.max(line.minOrderQty,Number(event.target.value))}:line))} style={{width:90,padding:8}}/><button className="button secondary" onClick={()=>save(items.filter((line)=>line.lineId!==item.lineId))}>Remove</button></div>
    </div>)}{items.length>0&&<div className="row" style={{paddingTop:18}}><b>Estimated subtotal</b><b>${total.toFixed(2)}</b></div>}</div>
    {items.length>0&&<section className="card" style={{marginTop:18}}><h2>Checkout</h2>{!signedIn?<p className="notice">Please <Link href="/login">sign in</Link> with an approved wholesale account to place this order.</p>:<>
      <label className="product-option">Shipping address<input value={address} onChange={(event)=>setAddress(event.target.value)} required maxLength={255}/></label>
      <label className="product-option">Payment method<select value={method} onChange={(event)=>setMethod(event.target.value)}><option value="bank_transfer">Bank transfer (instructions pending)</option><option value="credit_terms" disabled={!creditApproved}>Approved credit terms{creditApproved?'':' (not approved)'}</option><option value="card">Online card (not configured)</option></select></label>
      <p className="small muted">Prices and availability are confirmed by the server when the order is submitted. Card payments are not configured and no card details are collected.</p>
      <button disabled={busy||!address.trim()||!items.length} onClick={checkout}>{busy?'Submitting…':'Place order request'}</button>
    </>}</section>}
    {message&&<p className="notice" role="status" style={{marginTop:16}}>{message}</p>}
  </>;
}
