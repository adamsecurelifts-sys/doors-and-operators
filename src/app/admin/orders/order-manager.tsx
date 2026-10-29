'use client';

import { useEffect,useState } from 'react';

type OrderItem={id:number;sku:string;name:string;variantLabel:string|null;quantity:number;unitPrice:number;lineTotal:number;customizations:Record<string,{value:string|number|boolean;label:string}>};
type History={from_status:string|null;to_status:string;note:string|null;created_at:string;actor:string};
type Order={id:number;order_number:string;company_name:string;customerEmail:string;contactName:string;status:string;payment_method:string;payment_status:string;subtotal:number;shipping:number;tax:number;total:number;shipping_address:string;fulfillment_notes:string|null;created_at:string;items:OrderItem[];history:History[]};
const next:Record<string,{status:string;label:string}>={pending:{status:'confirmed',label:'Confirm order'},confirmed:{status:'picking',label:'Start picking'},picking:{status:'packed',label:'Mark packed'},packed:{status:'shipped',label:'Mark shipped'}};
const statuses=['pending','confirmed','picking','packed','shipped','cancelled'];
const paymentStatuses=['awaiting_transfer','pending','paid','terms_due','failed','unconfigured'];

export default function OrderManager({canManagePayments}:{canManagePayments:boolean}) {
  const [orders,setOrders]=useState<Order[]>([]);const [loading,setLoading]=useState(true);const [notice,setNotice]=useState('');const [busyId,setBusyId]=useState<number|null>(null);const [filter,setFilter]=useState('all');const [open,setOpen]=useState<number|null>(null);const [notes,setNotes]=useState<Record<number,string>>({});
  async function refresh(){setLoading(true);try{const response=await fetch('/api/admin/orders',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load orders');setOrders(data.orders);setNotes(Object.fromEntries(data.orders.map((order:Order)=>[order.id,order.fulfillment_notes||''])))}catch(error){setNotice(error instanceof Error?error.message.replaceAll('_',' '):'Could not load orders')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[]);
  async function update(order:Order,change:Record<string,string>){setBusyId(order.id);setNotice('');try{const response=await fetch(`/api/admin/orders/${order.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(change)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update order');setNotice(`Order ${order.order_number} updated.`);await refresh()}catch(error){setNotice(error instanceof Error?error.message.replaceAll('_',' '):'Could not update order')}finally{setBusyId(null)}}
  const shown=orders.filter((order)=>filter==='all'||order.status===filter);
  return <>
    {notice&&<p className="notice" role="status">{notice}</p>}
    <div className="row order-toolbar"><label className="product-option">Filter orders<select value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label><span className="muted">Newest first · {orders.length} orders loaded</span></div>
    {loading?<p className="muted">Loading orders…</p>:shown.length===0?<div className="card"><p>No orders in this view yet.</p></div>:<div className="order-list">{shown.map((order)=><article className="card order-card" key={order.id}>
      <div className="row order-heading"><div><div className="tag">{order.order_number} · {new Date(order.created_at).toLocaleString()}</div><h2>{order.company_name}</h2><p className="muted">{order.contactName} · {order.customerEmail}</p></div><div className="order-total"><span className={`status-pill status-${order.status}`}>{order.status}</span><b>${order.total.toFixed(2)}</b></div></div>
      <div className="order-summary"><span><b>Payment</b> {order.payment_method.replaceAll('_',' ')}</span><span><b>Payment state</b> {order.payment_status.replaceAll('_',' ')}</span><span><b>Ship to</b> {order.shipping_address}</span></div>
      <div className="row order-actions">
        <div className="actions">{next[order.status]&&<button disabled={busyId===order.id} onClick={()=>void update(order,{status:next[order.status].status})}>{next[order.status].label}</button>}{!['cancelled','shipped'].includes(order.status)&&<button disabled={busyId===order.id} className="button danger" onClick={()=>{if(window.confirm(`Cancel ${order.order_number} and return its reserved stock?`))void update(order,{status:'cancelled'})}}>Cancel order</button>}</div>
        <button className="button secondary" onClick={()=>setOpen(open===order.id?null:order.id)}>{open===order.id?'Hide details':'Order details'}</button>
      </div>
      {canManagePayments&&<div className="payment-admin"><label className="product-option">Payment status<select value={order.payment_status} disabled={busyId===order.id} onChange={(event)=>{const value=event.target.value;if(value==='paid'&&!window.confirm('Only mark this order paid after you have verified receipt of funds. Continue?'))return;void update(order,{paymentStatus:value})}}>{paymentStatuses.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label></div>}
      {open===order.id&&<div className="order-details"><h3>Items in this order</h3><div className="table-scroll"><table className="table"><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{order.items.map((item)=><tr key={item.id}><td><b>{item.name}</b><div className="small muted">SKU {item.sku}{item.variantLabel?` · ${item.variantLabel}`:''}</div>{Object.entries(item.customizations||{}).length>0&&<div className="small">{Object.entries(item.customizations).map(([key,value])=>`${key}: ${value.label}`).join(' · ')}</div>}</td><td>{item.quantity}</td><td>${item.unitPrice.toFixed(2)}</td><td>${item.lineTotal.toFixed(2)}</td></tr>)}</tbody></table></div>
        <div className="product-form-grid"><label className="product-option">Fulfillment notes<textarea rows={3} maxLength={2000} value={notes[order.id]??''} onChange={(event)=>setNotes((old)=>({...old,[order.id]:event.target.value}))}/></label><div><div className="order-amounts"><div>Subtotal <b>${order.subtotal.toFixed(2)}</b></div><div>Shipping <b>${order.shipping.toFixed(2)}</b></div><div>Tax <b>${order.tax.toFixed(2)}</b></div><div className="total-line">Total <b>${order.total.toFixed(2)}</b></div></div><button className="button secondary" disabled={busyId===order.id} onClick={()=>void update(order,{fulfillmentNotes:notes[order.id]??''})}>Save notes</button></div></div>
        {order.history?.length>0&&<div><h3>Status history</h3><ul className="history-list">{order.history.map((event,index)=><li key={index}><b>{event.to_status}</b> · {new Date(event.created_at).toLocaleString()} {event.note&&<span>· {event.note}</span>}</li>)}</ul></div>}
      </div>}
    </article>)}</div>}
  </>;
}
