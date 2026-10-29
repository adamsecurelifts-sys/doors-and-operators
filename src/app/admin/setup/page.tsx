'use client';

import { useEffect,useState,type FormEvent } from 'react';

export default function AdminSetup(){
  const [enabled,setEnabled]=useState<boolean|null>(null);const [reason,setReason]=useState('');const [token,setToken]=useState('');const [email,setEmail]=useState('');const [name,setName]=useState('');const [companyName,setCompanyName]=useState('Doors & Operators');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{fetch('/api/admin/setup',{cache:'no-store'}).then(async(response)=>{const data=await response.json();setEnabled(Boolean(data.enabled));setReason(data.reason||'')}).catch(()=>{setEnabled(false);setReason('database_unavailable')})},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setMessage('');if(password!==confirm){setMessage('Passwords do not match.');return}setBusy(true);try{const response=await fetch('/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,email,name,companyName,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Setup failed');window.location.assign('/admin/login?setup=complete')}catch(error){setMessage(error instanceof Error?error.message.replaceAll('_',' '):'Setup failed')}finally{setBusy(false)}}
  return <main className="wrap"><form className="formbox" onSubmit={submit}><a href="/">← Storefront</a><div className="eyebrow" style={{color:'var(--green)',marginTop:22}}>One-time setup</div><h1>Create the first admin</h1>
    {enabled===null?<p className="muted">Checking database and setup status…</p>:!enabled?<p className="notice">{reason==='setup_token_missing'?'Admin setup is locked. Add a temporary ADMIN_SETUP_TOKEN in the GoDaddy app settings after the database migration is complete.':reason==='database_unavailable'?'The database is not ready yet. Configure MySQL and run the migrations first.':'An administrator has already been created. Use the admin sign-in page instead.'}</p>:<>
      <p className="muted">This one-time form creates the store’s first administrator. Use the temporary setup token from the GoDaddy app settings and choose a unique password of at least 16 characters.</p>
      <label htmlFor="token">One-time setup token</label><input id="token" type="password" autoComplete="off" minLength={32} maxLength={256} required value={token} onChange={(event)=>setToken(event.target.value)}/>
      <label htmlFor="name">Administrator name</label><input id="name" required maxLength={120} value={name} onChange={(event)=>setName(event.target.value)}/>
      <label htmlFor="company">Store name</label><input id="company" required maxLength={160} value={companyName} onChange={(event)=>setCompanyName(event.target.value)}/>
      <label htmlFor="email">Admin email</label><input id="email" type="email" required maxLength={190} autoComplete="username" value={email} onChange={(event)=>setEmail(event.target.value)}/>
      <label htmlFor="password">Password</label><input id="password" type="password" required minLength={16} maxLength={128} autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)}/>
      <label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" required minLength={16} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event)=>setConfirm(event.target.value)}/>
      <button disabled={busy||token.length<32||password.length<16} style={{width:'100%',marginTop:20}}>{busy?'Creating…':'Create admin account'}</button>
    </>}
    {message&&<p className="notice" role="alert">{message}</p>}
  </form></main>;
}
