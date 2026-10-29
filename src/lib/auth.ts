import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db';

const cookieName = 'dao_session';
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}
export type User = { id: number; email: string; name: string; role: string; status: string; creditTermsApproved: boolean };
export async function passwordHash(password: string) { return bcrypt.hash(password, 12); }
export async function passwordMatches(password: string, hash: string) { return bcrypt.compare(password, hash); }
export async function createSession(user: User) {
  const token = await new SignJWT({ email: user.email, role: user.role, status: user.status })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(user.id)).setIssuedAt().setExpirationTime('8h').sign(key());
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 });
}
export async function currentUser(): Promise<User | null> {
  try {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const [rows] = await db().execute<any[]>('SELECT id,email,company_name AS name,role,status,credit_terms_approved AS creditTermsApproved FROM users WHERE id=? LIMIT 1', [payload.sub]);
    const row = rows[0];
    return row?.status === 'active' ? { ...row, creditTermsApproved: Boolean(row.creditTermsApproved) } : null;
  } catch { return null; }
}
export async function clearSession() { (await cookies()).delete(cookieName); }
