import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveProduct } from '@/lib/admin-products';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'invalid_product_id' }, { status: 400 });
  return saveProduct(await request.json().catch(() => null), id);
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'invalid_product_id' }, { status: 400 });
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<any>(`UPDATE products SET active=0 WHERE id=?`, [id]);
    if (!result.affectedRows) {
      await connection.rollback();
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 });
    }
    await connection.execute(`UPDATE product_variants SET active=0 WHERE product_id=?`, [id]);
    await connection.commit();
    return NextResponse.json({ archived: true });
  } catch (error) {
    await connection.rollback();
    console.error('Admin product archive failed', error);
    return NextResponse.json({ error: 'product_archive_failed' }, { status: 500 });
  } finally {
    connection.release();
  }
}
