import React, { useEffect, useState } from "react";
import { Lock, Eye, EyeOff, Loader2, Check, AlertCircle, UserPlus, ShieldCheck, Mail, KeyRound } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { settingsApi, authApi } from "../api/resources.js";
import { useAuth } from "../context/AuthContext.jsx";

const fieldStyle = (C) => ({ background: C.panelSoft, borderColor: C.line, color: C.textHi });

function PasswordInput({ C, field, label, placeholder, password, show, change, toggleShow, disabled }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.textLow }}>{label}</label>
      <div className="relative">
        <input
          type={show[field] ? "text" : "password"}
          value={password[field]}
          onChange={(e) => change(field, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={field === "current" ? "current-password" : "new-password"}
          className="w-full border-2 rounded-xl px-4 py-3 pr-11 text-sm"
          style={fieldStyle(C)}
        />
        <button type="button" onClick={() => toggleShow(field)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.textLow }}>{show[field] ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { C } = useTheme();
  const { user } = useAuth();
  const [password, setPassword] = useState({ current: "", new: "", confirm: "" });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [account, setAccount] = useState({ name: "", email: "", password: "", role: "admin" });
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountMessage, setAccountMessage] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    setAdminsLoading(true);
    settingsApi.listAdmins().then((items) => { if (active) setAdmins(Array.isArray(items) ? items : []); }).catch(() => { if (active) setAdmins([]); }).finally(() => { if (active) setAdminsLoading(false); });
    return () => { active = false; };
  }, [user?.role]);

  const change = (field, value) => { setPassword((p) => ({ ...p, [field]: value })); setMessage(null); };
  const toggleShow = (field) => setShow((s) => ({ ...s, [field]: !s[field] }));
  const submitPassword = async (e) => {
    e.preventDefault(); setMessage(null);
    if (!password.current || !password.new || !password.confirm) return setMessage({ type: "error", text: "All fields are required." });
    if (password.new !== password.confirm) return setMessage({ type: "error", text: "New password and confirmation do not match." });
    if (password.new.length < 6) return setMessage({ type: "error", text: "Password must be at least 8 characters." });
    setLoading(true);
    try { await settingsApi.changePassword({ currentPassword: password.current, newPassword: password.new, confirmPassword: password.confirm }); setMessage({ type: "success", text: "Password changed successfully." }); setPassword({ current: "", new: "", confirm: "" }); }
    catch (err) { setMessage({ type: "error", text: err.message || "Failed to change password." }); }
    finally { setLoading(false); }
  };
  const createAccount = async () => {
    setAccountMessage(null);
    if (!account.name.trim() || !account.email.trim() || !account.password || account.password.length < 6) return setAccountMessage({ type: "error", text: "Name, email and a password of at least 8 characters are required." });
    setAccountLoading(true);
    try { await authApi.register(account); setAccountMessage({ type: "success", text: `Administrator account created successfully.` }); setAccount({ name: "", email: "", password: "", role: "admin" }); const items = await settingsApi.listAdmins(); setAdmins(Array.isArray(items) ? items : []); }
    catch (err) { setAccountMessage({ type: "error", text: err.message }); }
    finally { setAccountLoading(false); }
  };

  return (
    <div className="min-h-screen pb-8" style={{ background: C.bg }}>
      <div className="settings-shell w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-7 py-5 sm:py-7">
        <section className="settings-hero rounded-2xl border-2 p-4 sm:p-6 lg:p-7" style={{ background: C.panel, borderColor: C.line }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <div className="settings-icon p-3 rounded-xl shrink-0" style={{ background: C.goldSoft, color: C.gold }}><ShieldCheck size={23}/></div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textLow }}>Account & Security</div>
                <h1 className="text-2xl sm:text-3xl font-bold mt-1" style={{...fontDisplay,color:C.textHi}}>Settings</h1>
                <p className="text-sm mt-1" style={{color:C.textLow}}>Secure your account and manage administrator access.</p>
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs" style={{background:C.panelSoft,color:C.textMid}}><Mail size={12}/><span className="truncate">{user?.email} · {user?.role}</span></div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{background:C.tealSoft,color:C.teal}}><ShieldCheck size={14}/> Protected account</div>
          </div>
        </section>

        <div className="settings-grid mt-5">
          <section className="settings-card rounded-2xl border-2 p-4 sm:p-6" style={{background:C.panel,borderColor:C.line}}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl" style={{background:C.goldSoft,color:C.gold}}><Lock size={19}/></div>
              <div><h2 className="text-lg font-bold" style={{...fontDisplay,color:C.textHi}}>Change Password</h2><p className="text-xs" style={{color:C.textLow}}>Update the password for the current account.</p></div>
            </div>
            <form onSubmit={submitPassword} className="space-y-3.5">
              <PasswordInput C={C} password={password} show={show} change={change} toggleShow={toggleShow} disabled={loading} field="current" label="Current Password" placeholder="Enter current password" />
              <PasswordInput C={C} password={password} show={show} change={change} toggleShow={toggleShow} disabled={loading} field="new" label="New Password" placeholder="Minimum 8 characters" />
              <PasswordInput C={C} password={password} show={show} change={change} toggleShow={toggleShow} disabled={loading} field="confirm" label="Confirm New Password" placeholder="Repeat new password" />
              {message && <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{background:message.type === "success" ? C.tealSoft : C.roseSoft,color:message.type === "success" ? C.teal : C.rose}}>{message.type === "success" ? <Check size={16}/> : <AlertCircle size={16}/>} {message.text}</div>}
              <button disabled={loading} className="compact-btn w-full rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60" style={{background:C.gold,color:"white"}}>{loading?<Loader2 size={17} className="animate-spin"/>:<KeyRound size={17}/>} {loading?"Changing…":"Change Password"}</button>
            </form>
          </section>

          {user?.role === "admin" && <section className="settings-card rounded-2xl border-2 p-4 sm:p-6" style={{background:C.panel,borderColor:C.line}}>
            <div className="flex items-center gap-3 mb-5"><div className="p-2.5 rounded-xl" style={{background:C.tealSoft,color:C.teal}}><UserPlus size={19}/></div><div><h2 className="text-lg font-bold" style={{...fontDisplay,color:C.textHi}}>Create Account</h2><p className="text-xs" style={{color:C.textLow}}>Create another administrator login.</p></div></div>
            <div className="space-y-3.5">
              <div><label className="form-label">Name</label><input value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} className="settings-input" style={fieldStyle(C)} /></div>
              <div><label className="form-label">Email</label><input type="email" value={account.email} onChange={e=>setAccount({...account,email:e.target.value})} className="settings-input" style={fieldStyle(C)} /></div>
              <div><label className="form-label">Password</label><input type="password" minLength="8" value={account.password} onChange={e=>setAccount({...account,password:e.target.value})} className="settings-input" style={fieldStyle(C)} /></div>
              <div className="rounded-xl px-3 py-2.5 text-xs" style={{background:C.tealSoft,color:C.teal}}>New account role: <strong>Administrator</strong></div>
              {accountMessage && <div className="rounded-xl px-3 py-2.5 text-sm" style={{background:accountMessage.type === "success" ? C.tealSoft : C.roseSoft,color:accountMessage.type === "success" ? C.teal : C.rose}}>{accountMessage.text}</div>}
              <button disabled={accountLoading} onClick={createAccount} className="compact-btn w-full rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60" style={{background:C.teal,color:"white"}}>{accountLoading?<Loader2 size={17} className="animate-spin"/>:<UserPlus size={17}/>} {accountLoading?"Creating…":"Create Account"}</button>
            </div>
          </section>}
        </div>

        {user?.role === "admin" && <section className="mt-5 rounded-2xl border-2 p-4 sm:p-5" style={{background:C.panel,borderColor:C.line}}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div><div className="text-xs font-semibold uppercase tracking-wider" style={{color:C.textLow}}>Access</div><h2 className="text-lg font-bold" style={{...fontDisplay,color:C.textHi}}>Administrator Accounts</h2></div>
            <span className="compact-chip" style={{borderColor:C.line,color:C.textMid,background:C.panelSoft}}>{admins.length} admin{admins.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-2">
            {adminsLoading ? <div className="text-sm py-3" style={{color:C.textLow}}>Loading administrators…</div> : admins.map((admin) => (
              <div key={admin.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{borderColor:C.line,background:C.panelSoft}}>
                <div className="min-w-0"><div className="text-sm font-semibold truncate" style={{color:C.textHi}}>{admin.name}</div><div className="text-xs truncate" style={{color:C.textLow}}>{admin.email}</div></div>
                <span className="compact-chip shrink-0" style={{borderColor:C.tealSoft,color:C.teal,background:C.tealSoft}}>Administrator</span>
              </div>
            ))}
          </div>
        </section>}

        <section className="mt-5 rounded-2xl border-2 p-4 sm:p-5" style={{background:C.panelSoft,borderColor:C.line}}>
          <div className="flex items-start gap-3"><div className="p-2 rounded-lg shrink-0" style={{background:C.panel,color:C.gold}}><KeyRound size={16}/></div><div><div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{color:C.textLow}}>Security</div><p className="text-sm" style={{color:C.textMid}}>Passwords are stored as hashes. Teacher accounts are linked to their teacher profile, and an email already used by another user cannot be reused.</p><div className="mt-2 text-[11px]" style={{...fontMono,color:C.textLow}}>Minimum password length: 8 characters</div></div></div>
        </section>
      </div>
    </div>
  );
}
