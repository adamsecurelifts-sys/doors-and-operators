import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string; setup?: string }> }) {
  const user = await currentUser();
  if (user && ['admin', 'warehouse'].includes(user.role)) redirect('/admin');
  const params = await searchParams;
  return <main className="wrap">
    <form className="formbox" action="/api/admin/login" method="post">
      <a href="/">← Storefront</a>
      <div className="eyebrow" style={{ color: 'var(--green)', marginTop: 22 }}>Store management</div>
      <h1>Admin sign in</h1>
      {params.setup && <p className="notice">Admin account created. Sign in with your new credentials.</p>}
      {params.error && <p className="notice" role="alert">Sign-in failed. Check your credentials and staff access.</p>}
      <label htmlFor="email">Admin email</label><input id="email" name="email" type="email" required maxLength={190} autoComplete="username" />
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" required maxLength={128} autoComplete="current-password" />
      <button style={{ width: '100%', marginTop: 20 }}>Sign in to control panel</button>
      <p className="small muted">Staff access is provided by the store administrator.</p>
    </form>
  </main>;
}
