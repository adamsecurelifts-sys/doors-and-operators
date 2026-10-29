import { NextResponse } from 'next/server';
import { GET as listProducts,POST as createProduct } from '@/lib/admin-products';
import { currentUser } from '@/lib/auth';

export async function GET() {
  const user=await currentUser();
  if(!user||user.role!=='admin')return NextResponse.json({error:'forbidden'},{status:403});
  return listProducts();
}

export async function POST(request:Request) {
  return createProduct(request);
}
