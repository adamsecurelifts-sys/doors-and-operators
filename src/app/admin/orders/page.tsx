import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OrderManager from './order-manager';

export const dynamic = 'force-dynamic';

export default async function Orders() {
  const user = await currentUser();
  if (!user || !['admin','warehouse'].includes(user.role)) redirect('/admin/login');
  return <main className="wrap section">
    <a href="/admin">← Dashboard</a>
    <div className="sectionhead" style={{ marginTop: 20 }}><div><div className="eyebrow" style={{ color: 'var(--green)' }}>Store operations</div><h1>Orders & fulfillment</h1></div><span className="muted">Review requests, pick, pack, ship, and record verified payments</span></div>
    <OrderManager canManagePayments={user.role === 'admin'} />
  </main>;
}
