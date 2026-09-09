import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, KeyRound, Mail, Lock, User } from "lucide-react";
import { useTheme, fontDisplay } from "../theme.jsx";
import { api } from "../api/client.js";

export default function InitialAdminSetup() {
  const { C } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", key: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setError("");
    if (form.key.length < 32) return setError("Setup key must be at least 32 characters.");
    setBusy(true);
    try {
      await api.post("/auth/register-admin", { name: form.name, email: form.email, password: form.password, key: form.key });
      setDone(true);
    } catch (err) { setError(err.message || "Unable to create administrator."); }
    finally { setBusy(false); }
  };
  if (done) return <div className="min-h-screen flex items-center justify-center p-5"><div className="w-full max-w-md rounded-2xl border p-7 text-center" style={{background:C.panel,borderColor:C.line}}><ShieldCheck className="mx-auto mb-3" size={38} style={{color:C.teal}}/><h1 className="text-xl font-bold" style={{...fontDisplay,color:C.textHi}}>Administrator created</h1><p className="text-sm mt-2" style={{color:C.textLow}}>The one-time setup endpoint is now locked because an administrator exists.</p><button onClick={()=>navigate('/login')} className="mt-5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{background:C.gold}}>Go to login</button></div></div>;
  return <div className="min-h-screen flex items-center justify-center p-5"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border p-6 sm:p-7" style={{background:C.panel,borderColor:C.line}}><div className="flex items-center gap-3 mb-6"><div className="p-3 rounded-xl" style={{background:C.goldSoft,color:C.gold}}><ShieldCheck size={22}/></div><div><h1 className="text-xl font-bold" style={{...fontDisplay,color:C.textHi}}>Initial Administrator Setup</h1><p className="text-xs" style={{color:C.textLow}}>One-time setup for an empty database</p></div></div>{error&&<div className="mb-4 rounded-xl px-3 py-2 text-sm" style={{background:C.roseSoft,color:C.rose}}>{error}</div>}
    <label className="block text-xs font-semibold mb-1.5" style={{color:C.textMid}}>Name</label><div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-4" style={{borderColor:C.line,background:C.panelSoft}}><User size={15} style={{color:C.textLow}}/><input name="name" value={form.name} onChange={update} required className="bg-transparent outline-none flex-1 text-sm" style={{color:C.textHi}}/></div>
    <label className="block text-xs font-semibold mb-1.5" style={{color:C.textMid}}>Email</label><div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-4" style={{borderColor:C.line,background:C.panelSoft}}><Mail size={15} style={{color:C.textLow}}/><input type="email" name="email" value={form.email} onChange={update} required className="bg-transparent outline-none flex-1 text-sm" style={{color:C.textHi}}/></div>
    <label className="block text-xs font-semibold mb-1.5" style={{color:C.textMid}}>Password</label><div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-4" style={{borderColor:C.line,background:C.panelSoft}}><Lock size={15} style={{color:C.textLow}}/><input type="password" name="password" value={form.password} onChange={update} minLength={8} required className="bg-transparent outline-none flex-1 text-sm" style={{color:C.textHi}}/></div>
    <label className="block text-xs font-semibold mb-1.5" style={{color:C.textMid}}>One-time setup key</label><div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-5" style={{borderColor:C.line,background:C.panelSoft}}><KeyRound size={15} style={{color:C.textLow}}/><input type="password" name="key" value={form.key} onChange={update} minLength={32} required autoComplete="off" className="bg-transparent outline-none flex-1 text-sm" style={{color:C.textHi}}/></div>
    <button disabled={busy} className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{background:C.gold}}>{busy?"Creating…":"Create Administrator"}</button><p className="text-[11px] mt-3 text-center" style={{color:C.textLow}}>The setup key must remain on the backend environment; never put it in a VITE_ variable.</p></form></div>;
}
