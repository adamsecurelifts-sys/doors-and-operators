import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/lib/db';
import { passwordHash } from '../src/lib/auth';
async function main(){const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.ADMIN_PASSWORD;if(!email||!password||password.length<16)throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 16 characters for this one-time setup.');const hash=await passwordHash(password);const pool=db();try{await pool.execute(`INSERT INTO users(email,password_hash,contact_name,company_name,phone,business_address,role,status) VALUES(?,?, 'Store Administrator','Doors & Operators','Not provided','Update this address','admin','active')`,[email,hash]);console.log(`Administrator created for ${email}`)}finally{await pool.end()}}
main().catch(e=>{console.error(e);process.exitCode=1});
