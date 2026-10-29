'use client';
import { useState } from 'react';
export type CartProduct={id:number;name:string;sku:string;unitPrice:number;minOrderQty:number};
export default function AddToCart({product}:{product:CartProduct}){const [added,setAdded]=useState(false);function add(){const list=JSON.parse(localStorage.getItem('dao_cart')||'[]') as (CartProduct&{quantity:number})[];const found=list.find(x=>x.id===product.id);if(found)found.quantity+=product.minOrderQty;else list.push({...product,quantity:product.minOrderQty});localStorage.setItem('dao_cart',JSON.stringify(list));setAdded(true);setTimeout(()=>setAdded(false),1800)}return <button onClick={add} style={{width:'100%',marginTop:14}}>{added?'Added to cart':'Add to cart'}</button>}
