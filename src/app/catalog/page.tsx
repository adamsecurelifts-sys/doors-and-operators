import { products, money, type Product } from '@/lib/catalog';
import AddToCart from '@/components/add-to-cart';

export const dynamic = 'force-dynamic';

export default async function Catalog({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  let rows: Product[] = [];
  try { rows = await products(); } catch {}
  const params = await searchParams;
  const query = (params.q || '').toLowerCase();
  const items = rows.filter((product) => (!params.category || product.category === params.category) && (!query || `${product.name} ${product.sku} ${product.description}`.toLowerCase().includes(query)));
  return <main className="wrap section">
    <a href="/">← Home</a>
    <div className="sectionhead" style={{ marginTop: 22 }}><div><div className="eyebrow" style={{ color: 'var(--green)' }}>Wholesale buying</div><h1>Product catalog</h1></div><form><input name="q" placeholder="Search name, SKU or description" defaultValue={params.q} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 8 }} /><button>Search</button></form></div>
    <div className="grid">{items.map((product) => <article className="card" key={product.id}>
      {product.imageUrl ? <img className="product-image" src={product.imageUrl} alt={product.imageAlt} /> : <div className="product-image-placeholder" aria-hidden="true">{product.category.toLowerCase().includes('door')?'🚪':'⚙️'}</div>}
      <div className="tag">{product.category} · SKU {product.sku}</div><h3>{product.name}</h3><p className="muted">{product.description}</p>
      <div className="row"><b>{money(product.unitPrice)}{product.variants.length ? '+' : ''}</b><span className="stock">{product.quantityOnHand} available</span></div>
      {product.manufacturerPartNumber&&<p className="small muted">Manufacturer part: {product.manufacturerPartNumber}</p>}
      <AddToCart product={product} />
    </article>)}</div>
    {!items.length && <p className="muted">No matching products were found. The catalog may still need products added by the store administrator.</p>}
  </main>;
}
