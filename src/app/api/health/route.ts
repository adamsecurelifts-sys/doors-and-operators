import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(){try{await db().query('SELECT 1');return NextResponse.json({status:'ok',database:'connected'})}catch{return NextResponse.json({status:'degraded',database:'unavailable'},{status:503})}}
