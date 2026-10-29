'use client';

import { useEffect,useState,type FormEvent } from 'react';

type Warehouse={id:number;code:string;name:string};
type Row={productId:number;variantId:number|null;warehouseId:number;warehouse:string;sku:string;product:string;variation:string|null;quantity:number;reserved:number};
type InventoryItem={productId:number;variantId:number|null;sku:string;product:string;variation:string|null};
const inputStyle={width:'100%',padding:11,border:'1px solid var(--line)',borderRadius:7,background:'white'} as const;

export default function InventoryManager(){
  const [rows,setRows]=useState<Row[]>([]);const [warehouses,setWarehouses]=useState<Warehouse[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [selected,setSelected]=useState('');const [warehouseId,setWarehouseId]=useState('');const [quantityDelta,setQuantityDelta]=useState('');const [reason,setReason]=useState('');
  async function refresh(){setLoading(true);try{const response=await fetch('/api/admin/inventory',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load inventory');setRows(data.rows);setWarehouses(data.warehouses);if(!warehouseId&&data.warehouses[0])setWarehouseId(String(data.warehouses[0].id));}catch(error){setNotice(error instanceof Error?error.message.replaceAll('_',' '):'Could not load inventory')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[]);
  const uniqueItems:InventoryItem[]=[];for(const row of rows){if(!uniqueItems.some((item)=>item.productId===row.productId&&item.variantId===row.variantId))uniqueItems.push({productId:row.productId,variantId:row.variantId,sku:row.sku,product:row.product,variation:row.variation})}
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setNotice('');setBusy(true);try{const item=uniqueItems.find((candidate)=>`${candidate.productId}:${candidate.variantId??'base'}`===selected);if(!item)throw new Error('Choose a product or variation');const response=await fetch('/api/admin/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:item.productId,variantId:item.variantId,warehouseId:Number(warehouseId),quantityDelta:Number(quantityDelta),reason})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Inventory update failed');setNotice('Inventory movement recorded.');setQuantityDelta('');setReason('');await refresh()}catch(error){setNotice(error instanceof Error?error.message.replaceAll('_',' '):'Inventory update failed')}finally{setBusy(false)}}
  return <>
    {notice&&<p className="notice" role="status">{notice}</p>}
    <section className="card inventory-receive"><h2>Receive or adjust stock</h2><p className="small muted">Positive quantity receives stock. Negative quantity records a correction and cannot reduce stock below reserved orders.</p><form className="product-form-grid" onSubmit={submit}>
      <label className="product-option">Product or variation<select required value={selected} onChange={(event)=>setSelected(event.target.value)}><option value="">Choose an item</option>{uniqueItems.map((item)=><option key={`${item.productId}:${item.variantId??'base'}`} value={`${item.productId}:${item.variantId??'base'}`}>{item.product}{item.variation?` · ${item.variation}`:''} · {item.sku}</option>)}</select></label>
      <label className="product-option">Warehouse<select required value={warehouseId} onChange={(event)=>setWarehouseId(event.target.value)}>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}</select></label>
      <label className="product-option">Quantity change<input required type="number" step="1" min="-1000000" max="1000000" value={quantityDelta} onChange={(event)=>setQuantityDelta(event.target.value)} placeholder="e.g. 24 or -2"/></label>
      <label className="product-option">Reason / reference<input required maxLength={120} minLength={3} value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="PO number, count correction, damage"/></label>
      <div><button disabled={busy||warehouses.length===0}>{busy?'Saving…':'Record inventory movement'}</button>{warehouses.length===0&&<p className="small muted">Run the seed or create a warehouse before receiving stock.</p>}</div>
    </form></section>
    <section style={{marginTop:26}}><div className="row"><h2>Stock by warehouse</h2><span className="muted">Available stock excludes reservations</span></div>{loading?<p className="muted">Loading inventory…</p>:<div className="table-scroll"><table className="table"><thead><tr><th>Warehouse</th><th>SKU</th><th>Product / variation</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.warehouseId}-${row.variantId??row.productId}-${index}`}><td>{row.warehouse}</td><td>{row.sku}</td><td>{row.product}{row.variation&&<div className="small muted">{row.variation}</div>}</td><td>{row.quantity}</td><td>{row.reserved}</td><td>{row.quantity-row.reserved}</td></tr>)}</tbody></table>{rows.length===0&&<div className="card"><p>No inventory records are available yet.</p></div>}</div>}</section>
  </>;
}
