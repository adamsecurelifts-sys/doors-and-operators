import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InventoryManager from './inventory-manager';

export const dynamic='force-dynamic';

export default async function Inventory(){
  const user=await currentUser();
  if(!user||!['admin','warehouse'].includes(user.role))redirect('/admin/login');
  return <main className="wrap section"><a href="/admin">← Dashboard</a><div className="sectionhead" style={{marginTop:20}}><div><div className="eyebrow" style={{color:'var(--green)'}}>Warehouse operations</div><h1>Inventory</h1></div><span className="muted">Receive stock and make audited adjustments</span></div><InventoryManager/></main>;
}
