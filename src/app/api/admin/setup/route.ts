import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser,passwordHash } from '@/lib/auth';
import { db } from '@/lib/db';

const schema=z.object({token:z.string().min(32).max(256),email:z.string().trim().email().max(190),password:z.string().min(16).max(128),name:z.string().trim().min(1).max(120),companyName:z.string().trim().min(1).max(160)});
function matchesToken(provided:string,expected:string){const a=Buffer.from(provided);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}

export async function GET(){
  const user=await currentUser();
  if(user?.role==='admin')return NextResponse.json({enabled:false});
  if(!process.env.ADMIN_SETUP_TOKEN||process.env.ADMIN_SETUP_TOKEN.length<32)return NextResponse.json({enabled:false,reason:'setup_token_missing'});
  try{const [rows]=await db().query<any[]>(`SELECT COUNT(*) AS total FROM users WHERE role='admin'`);return NextResponse.json({enabled:Number(rows[0]?.total||0)===0})}
  catch{return NextResponse.json({enabled:false,reason:'database_unavailable'})}
}

export async function POST(request:Request){
  const expected=process.env.ADMIN_SETUP_TOKEN;
  if(!expected||expected.length<32)return NextResponse.json({error:'admin_setup_disabled'},{status:404});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'invalid_setup_details'},{status:400});
  if(!matchesToken(parsed.data.token,expected))return NextResponse.json({error:'invalid_setup_token'},{status:403});
  const connection=await db().getConnection();
  try{
    await connection.beginTransaction();
    const [[state]]=await connection.query<any[]>(`SELECT completed_at AS completedAt FROM admin_bootstrap_state WHERE id=1 FOR UPDATE`);
    const [[existing]]=await connection.query<any[]>(`SELECT id FROM users WHERE role='admin' LIMIT 1 FOR UPDATE`);
    if(!state||state.completedAt||existing)throw new Error('admin_already_created');
    const hash=await passwordHash(parsed.data.password);
    await connection.execute(`INSERT INTO users(email,password_hash,contact_name,company_name,phone,business_address,role,status)
      VALUES(?,?,?,?,'Not provided','Update this address','admin','active')`,[parsed.data.email.toLowerCase(),hash,parsed.data.name,parsed.data.companyName]);
    await connection.execute(`UPDATE admin_bootstrap_state SET completed_at=CURRENT_TIMESTAMP WHERE id=1`);
    await connection.commit();
    return NextResponse.json({created:true},{status:201});
  }catch(error){
    await connection.rollback();
    const message=error instanceof Error?error.message:'admin_setup_failed';
    if(message==='admin_already_created')return NextResponse.json({error:message},{status:409});
    if(message.includes('Duplicate entry'))return NextResponse.json({error:'email_already_in_use'},{status:409});
    console.error('Admin bootstrap failed',error);
    return NextResponse.json({error:'admin_setup_failed'},{status:500});
  }finally{connection.release()}
}
