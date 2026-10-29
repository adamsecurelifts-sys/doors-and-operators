import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { passwordHash } from '@/lib/auth';
const formSchema=z.object({contactName:z.string().trim().min(2).max(120),companyName:z.string().trim().min(2).max(160),email:z.string().trim().email().max(190).transform(x=>x.toLowerCase()),phone:z.string().trim().min(7).max(40),address:z.string().trim().min(5).max(255),password:z.string().min(12).max(128)});
export async function POST(req:Request){const data=formSchema.safeParse(Object.fromEntries(await req.formData()));if(!data.success)return NextResponse.redirect(new URL('/register?error=invalid',req.url),303);try{const d=data.data;await db().execute(`INSERT INTO users(email,password_hash,contact_name,company_name,phone,business_address,role,status) VALUES(?,?,?,?,?,?,'customer','pending')`,[d.email,await passwordHash(d.password),d.contactName,d.companyName,d.phone,d.address]);return NextResponse.redirect(new URL('/register?success=1',req.url),303)}catch{return NextResponse.redirect(new URL('/register?error=exists',req.url),303)}}
