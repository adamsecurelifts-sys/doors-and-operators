import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession,passwordMatches } from '@/lib/auth';

const schema=z.object({email:z.string().trim().email().max(190),password:z.string().min(1).max(128)});
function loginFailure(request:Request){return NextResponse.redirect(new URL('/admin/login?error=1',request.url),303)}

export async function POST(request:Request){
  const form=await request.formData();
  const parsed=schema.safeParse({email:form.get('email'),password:form.get('password')});
  if(!parsed.success)return loginFailure(request);
  const email=parsed.data.email.toLowerCase();
  const emailHash=createHash('sha256').update(email).digest('hex');
  const connection=await db().getConnection();
  try{
    await connection.beginTransaction();
    await connection.execute(`INSERT IGNORE INTO admin_login_throttles(email_hash,failure_count) VALUES(?,0)`,[emailHash]);
    const [[throttle]]=await connection.execute<any[]>(`SELECT failure_count AS failureCount,window_started_at AS windowStartedAt,locked_until AS lockedUntil FROM admin_login_throttles WHERE email_hash=? FOR UPDATE`,[emailHash]);
    const now=Date.now();
    if(throttle.lockedUntil&&new Date(throttle.lockedUntil).getTime()>now){await connection.rollback();return loginFailure(request)}
    let failures=Number(throttle.failureCount);
    if(now-new Date(throttle.windowStartedAt).getTime()>15*60*1000)failures=0;
    const [rows]=await connection.execute<any[]>(`SELECT id,email,password_hash,contact_name,company_name,role,status,credit_terms_approved AS creditTermsApproved FROM users WHERE email=? AND role IN ('admin','warehouse') LIMIT 1`,[email]);
    const user=rows[0];
    const passwordOkay=user?await passwordMatches(parsed.data.password,user.password_hash):false;
    if(!user||user.status!=='active'||!passwordOkay){
      failures++;
      await connection.execute(`UPDATE admin_login_throttles SET failure_count=?,window_started_at=IF(?=1,CURRENT_TIMESTAMP,window_started_at),locked_until=IF(? >= 5,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 15 MINUTE),NULL) WHERE email_hash=?`,[failures,failures,failures,emailHash]);
      await connection.commit();
      return loginFailure(request);
    }
    await connection.execute(`DELETE FROM admin_login_throttles WHERE email_hash=?`,[emailHash]);
    await connection.commit();
    await createSession({id:Number(user.id),email:user.email,name:user.company_name||user.contact_name,role:user.role,status:user.status,creditTermsApproved:Boolean(user.creditTermsApproved)});
    return NextResponse.redirect(new URL('/admin',request.url),303);
  }catch(error){
    await connection.rollback();
    console.error('Admin sign-in unavailable',error);
    return loginFailure(request);
  }finally{connection.release()}
}
