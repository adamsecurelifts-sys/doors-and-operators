import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProductManager from './product-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsAdmin() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect('/admin/login');
  return <main className="wrap section">
    <a href="/admin">← Dashboard</a>
    <div className="sectionhead" style={{ marginTop: 20 }}><div><div className="eyebrow" style={{ color: 'var(--green)' }}>Store catalog</div><h1>Products</h1></div><span className="muted">Add products, variations, and customer choices</span></div>
    <ProductManager />
  </main>;
}
