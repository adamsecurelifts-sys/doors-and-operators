'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Choice = { label: string; value: string; priceDelta: number };
type Variant = { id?: number; sku: string; label: string; attributes: Record<string, string | number | boolean>; priceOverride: number | null; minOrderQty: number; initialQuantity: number; active: boolean; quantityOnHand?: number };
type Customization = { name: string; inputType: 'select' | 'text' | 'number' | 'checkbox'; required: boolean; choices: Choice[]; priceDelta: number; minValue: number | null; maxValue: number | null; active: boolean };
type Product = { id: number; sku: string; manufacturerPartNumber: string | null; name: string; category: string; description: string; basePrice: number; minOrderQty: number; active: boolean; quantityOnHand: number; variants: Variant[]; customizations: Customization[]; image: { imageUrl: string; imageAlt: string } | null };
type Draft = Omit<Product, 'id' | 'quantityOnHand' | 'image'> & { imageUrl: string; imageAlt: string };

const blank: Draft = { sku: '', manufacturerPartNumber: '', name: '', category: 'Garage Doors', description: '', basePrice: 0, minOrderQty: 1, active: true, imageUrl: '', imageAlt: '', variants: [], customizations: [] };
const inputStyle = { width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 7, background: 'white' } as const;
const fieldStyle = { display: 'grid', gap: 6, marginBottom: 12 } as const;

function emptyVariant(): Variant { return { sku: '', label: '', attributes: {}, priceOverride: null, minOrderQty: 1, initialQuantity: 0, active: true }; }
function emptyCustomization(): Customization { return { name: '', inputType: 'select', required: false, choices: [{ label: '', value: '', priceDelta: 0 }], priceDelta: 0, minValue: null, maxValue: null, active: true }; }

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/products', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load products');
      setProducts(data.products);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load products'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  function startEdit(product: Product) {
    setEditing(product.id);
    setDraft({
      sku: product.sku, manufacturerPartNumber: product.manufacturerPartNumber || '', name: product.name, category: product.category,
      description: product.description, basePrice: product.basePrice, minOrderQty: product.minOrderQty, active: product.active,
      imageUrl: product.image?.imageUrl || '', imageAlt: product.image?.imageAlt || '',
      variants: product.variants.map((variant) => ({ ...variant, initialQuantity: 0 })),
      customizations: product.customizations,
    });
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function resetForm() { setEditing(null); setDraft(blank); setNotice(''); }
  function set<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const payload = { ...draft, manufacturerPartNumber: draft.manufacturerPartNumber || null, imageUrl: draft.imageUrl || null,
        variants: draft.variants.map((variant, index) => ({ ...variant, attributes: variant.attributes, sortOrder: index })),
        customizations: draft.customizations.map((option, index) => ({ ...option, sortOrder: index })) };
      const response = await fetch(editing ? `/api/admin/products/${editing}` : '/api/admin/products', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save product');
      setNotice(editing ? 'Product updated.' : 'Product added to the catalog.'); resetForm(); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save product'); }
    finally { setBusy(false); }
  }

  async function archive(product: Product) {
    if (!window.confirm(`Archive “${product.name}”? It will no longer be available to customers.`)) return;
    setNotice('');
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not archive product');
      setNotice('Product archived. Order history is preserved.'); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not archive product'); }
  }

  const visibleProducts = products.filter((product) => showArchived || product.active);
  return <>
    {notice && <p className="notice" role="status">{notice.replaceAll('_', ' ')}</p>}
    <section className="card" style={{ margin: '22px 0' }}>
      <div className="row"><h2 style={{ marginTop: 0 }}>{editing ? 'Edit product' : 'Add a product'}</h2>{editing && <button type="button" className="button secondary" onClick={resetForm}>Cancel editing</button>}</div>
      <form onSubmit={save}>
        <div className="product-form-grid">
          <label style={fieldStyle}>Product name<input required maxLength={180} style={inputStyle} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label style={fieldStyle}>Category<input required maxLength={80} style={inputStyle} value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="Garage Doors, Springs, Parts…" /></label>
          <label style={fieldStyle}>SKU<input required maxLength={80} style={inputStyle} value={draft.sku} onChange={(e) => set('sku', e.target.value)} /></label>
          <label style={fieldStyle}>Manufacturer part number<input maxLength={120} style={inputStyle} value={draft.manufacturerPartNumber || ''} onChange={(e) => set('manufacturerPartNumber', e.target.value)} /></label>
          <label style={fieldStyle}>Base price (USD)<input required min="0" step="0.01" type="number" style={inputStyle} value={draft.basePrice} onChange={(e) => set('basePrice', Number(e.target.value))} /></label>
          <label style={fieldStyle}>Minimum order quantity<input required min="1" step="1" type="number" style={inputStyle} value={draft.minOrderQty} onChange={(e) => set('minOrderQty', Number(e.target.value))} /></label>
        </div>
        <label style={fieldStyle}>Product description<textarea maxLength={10000} rows={3} style={inputStyle} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="product-form-grid">
          <label style={fieldStyle}>Product image URL<input type="url" maxLength={1000} style={inputStyle} value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" /></label>
          <label style={fieldStyle}>Image description<input maxLength={240} style={inputStyle} value={draft.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} /></label>
        </div>
        <label className="inline-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} /> Available in the storefront</label>

        <div className="admin-subsection">
          <div className="row"><div><h3>Product variations</h3><p className="small muted">Use variations for size, color, horsepower, handing, or other SKU-level choices.</p></div><button type="button" className="button secondary" onClick={() => set('variants', [...draft.variants, emptyVariant()])}>Add variation</button></div>
          {draft.variants.length === 0 && <p className="small muted">This product has one SKU and no variations.</p>}
          {draft.variants.map((variant, index) => <div className="admin-editor-row" key={variant.id || `new-${index}`}>
            <div className="product-form-grid">
              <label style={fieldStyle}>Variation label<input required maxLength={120} style={inputStyle} value={variant.label} onChange={(e) => set('variants', draft.variants.map((v,i)=>i===index?{...v,label:e.target.value}:v))} placeholder="16 × 7 ft · White" /></label>
              <label style={fieldStyle}>Variation SKU<input required maxLength={80} style={inputStyle} value={variant.sku} onChange={(e) => set('variants', draft.variants.map((v,i)=>i===index?{...v,sku:e.target.value}:v))} /></label>
              <label style={fieldStyle}>Price override<input min="0" step="0.01" type="number" style={inputStyle} value={variant.priceOverride ?? ''} placeholder={`Use $${Number(draft.basePrice).toFixed(2)}`} onChange={(e) => set('variants', draft.variants.map((v,i)=>i===index?{...v,priceOverride:e.target.value===''?null:Number(e.target.value)}:v))} /></label>
              <label style={fieldStyle}>Minimum quantity<input min="1" step="1" type="number" style={inputStyle} value={variant.minOrderQty} onChange={(e) => set('variants', draft.variants.map((v,i)=>i===index?{...v,minOrderQty:Number(e.target.value)}:v))} /></label>
              {!variant.id && <label style={fieldStyle}>Opening stock<input min="0" step="1" type="number" style={inputStyle} value={variant.initialQuantity} onChange={(e) => set('variants', draft.variants.map((v,i)=>i===index?{...v,initialQuantity:Number(e.target.value)}:v))} /></label>}
              <label style={fieldStyle}>Attributes<input style={inputStyle} value={Object.entries(variant.attributes).map(([k,v])=>`${k}=${v}`).join(', ')} onChange={(e) => { const attributes = Object.fromEntries(e.target.value.split(',').map((part)=>part.trim()).filter(Boolean).map((part)=>{const [k,...v]=part.split('=');return [k.trim(),v.join('=').trim()]}).filter(([k,v])=>k&&v));set('variants',draft.variants.map((item,i)=>i===index?{...item,attributes}:item)); }} placeholder="Size=16×7 ft, Color=White" /></label>
            </div>
            <div className="row"><label className="inline-check"><input type="checkbox" checked={variant.active} onChange={(e)=>set('variants',draft.variants.map((v,i)=>i===index?{...v,active:e.target.checked}:v))}/> Variation active</label><span className="small muted">On hand: {variant.quantityOnHand ?? variant.initialQuantity}</span><button type="button" className="button danger" onClick={()=>set('variants',draft.variants.filter((_,i)=>i!==index))}>Remove variation</button></div>
          </div>)}
        </div>

        <div className="admin-subsection">
          <div className="row"><div><h3>Customer customizations</h3><p className="small muted">Selections are validated and price adjustments are calculated on the server when an order is placed.</p></div><button type="button" className="button secondary" onClick={() => set('customizations', [...draft.customizations, emptyCustomization()])}>Add option</button></div>
          {draft.customizations.map((option,index)=><div className="admin-editor-row" key={`${index}-${option.name}`}>
            <div className="product-form-grid">
              <label style={fieldStyle}>Option name<input required maxLength={120} style={inputStyle} value={option.name} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,name:e.target.value}:o))} placeholder="Color, window style, track lift" /></label>
              <label style={fieldStyle}>Input type<select style={inputStyle} value={option.inputType} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,inputType:e.target.value as Customization['inputType']}:o))}><option value="select">Choose from list</option><option value="text">Text entry</option><option value="number">Number</option><option value="checkbox">Yes / no</option></select></label>
              <label style={fieldStyle}>Price change (USD)<input step="0.01" type="number" style={inputStyle} value={option.priceDelta} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,priceDelta:Number(e.target.value)}:o))} /></label>
              {option.inputType==='number' && <><label style={fieldStyle}>Minimum<input step="0.001" type="number" style={inputStyle} value={option.minValue ?? ''} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,minValue:e.target.value===''?null:Number(e.target.value)}:o))} /></label><label style={fieldStyle}>Maximum<input step="0.001" type="number" style={inputStyle} value={option.maxValue ?? ''} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,maxValue:e.target.value===''?null:Number(e.target.value)}:o))} /></label></>}
            </div>
            {option.inputType==='select' && <div className="choice-list"><div className="row"><b>Choices</b><button type="button" className="button secondary" onClick={()=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,choices:[...o.choices,{label:'',value:'',priceDelta:0}]}:o))}>Add choice</button></div>{option.choices.map((choice,choiceIndex)=><div className="choice-row" key={choiceIndex}><input aria-label="Choice label" style={inputStyle} value={choice.label} placeholder="White" onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,choices:o.choices.map((c,j)=>j===choiceIndex?{...c,label:e.target.value,value:e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-')}:c)}:o))}/><input aria-label="Choice price difference" type="number" step="0.01" style={inputStyle} value={choice.priceDelta} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,choices:o.choices.map((c,j)=>j===choiceIndex?{...c,priceDelta:Number(e.target.value)}:c)}:o))}/><button type="button" className="button danger" onClick={()=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,choices:o.choices.filter((_,j)=>j!==choiceIndex)}:o))}>Remove</button></div>)}</div>}
            <div className="row"><label className="inline-check"><input type="checkbox" checked={option.required} onChange={(e)=>set('customizations',draft.customizations.map((o,i)=>i===index?{...o,required:e.target.checked}:o))}/> Required</label><button type="button" className="button danger" onClick={()=>set('customizations',draft.customizations.filter((_,i)=>i!==index))}>Remove option</button></div>
          </div>)}
        </div>
        <div className="row"><button disabled={busy}>{busy ? 'Saving…' : editing ? 'Save product changes' : 'Add product'}</button><span className="small muted">Prices are USD. Existing order records are kept when products are archived.</span></div>
      </form>
    </section>
    <section>
      <div className="row"><h2>Product catalog</h2><label className="inline-check"><input type="checkbox" checked={showArchived} onChange={(e)=>setShowArchived(e.target.checked)}/> Show archived</label></div>
      {loading ? <p className="muted">Loading products…</p> : <div className="table-scroll"><table className="table"><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Variations</th><th>Price</th><th>On hand</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleProducts.map((product)=><tr key={product.id}><td>{product.sku}</td><td><b>{product.name}</b><div className="small muted">{product.manufacturerPartNumber}</div></td><td>{product.category}</td><td>{product.variants.filter((v)=>v.active).length || '—'}</td><td>${Number(product.basePrice).toFixed(2)}</td><td>{Number(product.quantityOnHand)}</td><td>{product.active?'Active':'Archived'}</td><td><div className="actions"><button type="button" className="button secondary" onClick={()=>startEdit(product)}>Edit</button>{product.active&&<button type="button" className="button danger" onClick={()=>void archive(product)}>Archive</button>}</div></td></tr>)}</tbody></table>{!visibleProducts.length&&<div className="card"><p>{products.length?'No products match this view.':'No products yet. Add your first product above.'}</p></div>}</div>}
    </section>
  </>;
}
