import React, { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock3, XCircle, Loader2, Users, Wallet, CalendarOff, Receipt, History, UserCheck, BriefcaseBusiness, ChevronRight, Filter, WalletCards } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { teachersApi, studentsApi } from "../api/resources.js";
import PageLoader from "../components/PageLoader.jsx";

const todayStr = () => { const d = new Date(); const p = n => String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const pkr = n => `₨ ${Number(n || 0).toLocaleString("en-PK")}`;

export default function TeacherDashboard() {
  const { C } = useTheme();
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [selfSaving, setSelfSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("all");

  const load = async () => {
    try { const [t,s] = await Promise.all([teachersApi.me(), studentsApi.list()]); setTeacher(t); setStudents(s); }
    catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const pending = useMemo(() => (teacher?.challans || []).reduce((sum,c) => sum + (c.status !== "paid" ? Math.max(0, Number(c.amount||0)-Number(c.paidAmount||0)) : 0), 0), [teacher]);
  const paid = useMemo(() => (teacher?.paymentHistory || []).reduce((sum,p)=>sum+Number(p.amount||0),0), [teacher]);
  const today = todayStr();
  const todayRecord = (teacher?.attendanceHistory || []).find(r => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi"}).format(new Date(r.date)) === today);
  const batchNames = teacher?.batchIds?.map(b=>b.name).filter(Boolean) || [];
  const filteredStudents = useMemo(() => {
    if (selectedBatch === "all") return students;
    return students.filter((s) => String(s.batch || "") === String(selectedBatch));
  }, [students, selectedBatch]);
  const recentChallans = useMemo(() => [...(teacher?.challans||[])].sort((a,b)=>new Date(b.generatedOn)-new Date(a.generatedOn)).slice(0,5), [teacher]);
  const recentPayments = useMemo(() => [...(teacher?.paymentHistory||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5), [teacher]);

  const markStudent = async (student,status) => {
    setSaving(student._id);
    try { const updated = await studentsApi.markAttendance(student._id,{date:today,status,type:"manual"}); setStudents(prev=>prev.map(s=>s._id===updated._id?updated:s)); setToast(`${student.name} marked ${status}`); }
    catch(e){ setToast(e.message); }
    finally{ setSaving(null); }
  };
  const markSelf = async (status) => {
    setSelfSaving(true);
    try { const updated = await teachersApi.markMeAttendance({date:today,status,type:"manual"}); setTeacher(updated); setToast(`Your attendance is marked ${status}.`); }
    catch(e){ setToast(e.message); }
    finally{ setSelfSaving(false); }
  };

  if (loading) return <PageLoader label="Loading teacher dashboard…" />;

  return <div className="space-y-5 pb-8">
    {toast && <div className="rounded-xl border px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textMid,background:C.panel}}>{toast}</div>}

    <div className="grid grid-cols-2 xl:grid-cols-5 gap-2.5 sm:gap-3 min-w-0">
      <Card C={C} label="My Attendance" value={`${teacher?.attendancePercent ?? 0}%`} icon={CalendarCheck}/>
      <Card C={C} label="Monthly Salary" value={pkr(teacher?.salary)} icon={Wallet}/>
      <Card C={C} label="Balance Due" value={pkr(pending)} icon={Receipt} tone={pending ? C.rose : C.teal}/>
      <Card C={C} label="Paid To Date" value={pkr(paid)} icon={History} tone={C.teal}/>
      <Card C={C} label="My Students" value={students.length} icon={Users}/>
    </div>

    <div className="grid lg:grid-cols-3 gap-5">
      <section className="lg:col-span-2 rounded-2xl border-2 p-6" style={{background:C.panel,borderColor:C.line}}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:C.textLow}}>Teacher account</div><h1 className="text-2xl font-bold mt-1" style={{...fontDisplay,color:C.textHi}}>Welcome, {teacher?.name}</h1><p className="text-sm mt-1" style={{color:C.textLow}}>{teacher?.specialization} · {teacher?.userId?.email || "Login account linked"}</p></div>
          <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{background:C.tealSoft,color:C.teal}}>Teacher</div>
        </div>
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border p-3.5" style={{borderColor:C.line,background:C.panelSoft}}><div className="text-xs" style={{color:C.textLow}}>Assigned batches</div><div className="text-sm font-semibold mt-2" style={{color:C.textHi}}>{batchNames.length ? batchNames.join(", ") : "No batches assigned yet"}</div></div>
          <div className="rounded-xl border p-3.5" style={{borderColor:C.line,background:C.panelSoft}}><div className="text-xs" style={{color:C.textLow}}>Today's attendance</div>{todayRecord ? <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{background:todayRecord.status==="present"?C.tealSoft:todayRecord.status==="late"?C.goldSoft:C.roseSoft,color:todayRecord.status==="present"?C.teal:todayRecord.status==="late"?C.gold:C.rose}}><CheckCircle2 size={13}/>{todayRecord.status}</div> : <div className="flex flex-wrap gap-1.5 mt-2">{["present","late","absent"].map(st=><button key={st} disabled={selfSaving} onClick={()=>markSelf(st)} className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize disabled:opacity-50" style={{background:st==="present"?C.tealSoft:st==="late"?C.goldSoft:C.roseSoft,color:st==="present"?C.teal:st==="late"?C.gold:C.rose}}>{selfSaving?<Loader2 size={12} className="animate-spin"/>:st}</button>)}</div>}</div>
        </div>
      </section>

      <section className="rounded-2xl border-2 p-6" style={{background:C.panel,borderColor:C.line}}>
        <div className="flex items-center gap-2 mb-4"><BriefcaseBusiness size={17} style={{color:C.gold}}/><h2 className="font-bold" style={{...fontDisplay,color:C.textHi}}>Salary & Challans</h2></div>
        <div className="text-xs" style={{color:C.textLow}}>Pending balance</div><div className="text-2xl font-bold mt-1" style={{...fontMono,color:pending?C.rose:C.teal}}>{pkr(pending)}</div>
        <div className="mt-4 space-y-2">{recentChallans.length ? recentChallans.map(c=><div key={c._id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{background:C.panelSoft}}><div><div className="text-xs font-semibold" style={{color:C.textHi}}>{c.label}</div><div className="text-[10px]" style={{color:C.textLow}}>{c.month}</div></div><div className="text-xs font-semibold" style={{...fontMono,color:c.status==="paid"?C.teal:C.rose}}>{pkr(c.status==="paid"?c.amount:Math.max(0,c.amount-(c.paidAmount||0)))}</div></div>) : <div className="text-xs py-4 text-center" style={{color:C.textLow}}>No challans yet.</div>}</div>
      </section>
    </div>

    <section className="rounded-2xl border-2 p-4 sm:p-5" style={{background:C.panel,borderColor:C.line}}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div><div className="flex items-center gap-2"><Users size={17} style={{color:C.gold}}/><h2 className="text-lg font-bold" style={{...fontDisplay,color:C.textHi}}>My Batch Students</h2></div><p className="text-xs mt-1" style={{color:C.textLow}}>Click a batch to view only that batch's students.</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setSelectedBatch("all")} className="compact-chip" style={{background:selectedBatch==="all"?C.goldSoft:C.panelSoft,color:selectedBatch==="all"?C.gold:C.textMid,borderColor:C.line}}><Filter size={12}/> All ({students.length})</button>
          {batchNames.map(name=><button key={name} onClick={()=>setSelectedBatch(name)} className="compact-chip" style={{background:selectedBatch===name?C.tealSoft:C.panelSoft,color:selectedBatch===name?C.teal:C.textMid,borderColor:C.line}}><span className="truncate max-w-32">{name}</span></button>)}
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs" style={{color:C.textLow}}><span>{selectedBatch === "all" ? "All assigned batches" : `Batch: ${selectedBatch}`}</span><span>{filteredStudents.length} student{filteredStudents.length===1?"":"s"}</span></div>
      <div className="space-y-1.5">
        {filteredStudents.length === 0 && <div className="text-sm text-center py-8 rounded-xl" style={{color:C.textLow,background:C.panelSoft}}>No students are assigned to this batch yet.</div>}
        {filteredStudents.map(s=>{ const existing=(s.attendanceHistory||[]).find(r=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi"}).format(new Date(r.date))===today); return <div key={s._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5" style={{borderColor:C.line}}><div className="min-w-0"><div className="text-sm font-semibold truncate" style={{color:C.textHi}}>{s.name}</div><div className="text-[11px] truncate" style={{color:C.textLow}}>{s.courseName || "Student"}{s.batch?` · ${s.batch}`:""}</div></div>{existing ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold self-start sm:self-auto" style={{background:existing.status==="present"?C.tealSoft:existing.status==="late"?C.goldSoft:C.roseSoft,color:existing.status==="present"?C.teal:existing.status==="late"?C.gold:C.rose}}><CheckCircle2 size={12}/>{existing.status}</span> : <div className="flex gap-1 self-start sm:self-auto">{["present","late","absent"].map(st=><button key={st} disabled={saving===s._id} onClick={()=>markStudent(s,st)} className="compact-btn rounded-lg px-2.5 py-1.5 text-[11px] font-semibold capitalize disabled:opacity-50" style={{background:st==="present"?C.tealSoft:st==="late"?C.goldSoft:C.roseSoft,color:st==="present"?C.teal:st==="late"?C.gold:C.rose}}>{saving===s._id?<Loader2 size={11} className="animate-spin"/>:st}</button>)}</div>}</div>})}
      </div>
    </section>

    <div className="grid lg:grid-cols-2 gap-5">
      <section className="rounded-2xl border-2 p-5" style={{background:C.panel,borderColor:C.line}}><div className="flex items-center gap-2 mb-3"><CalendarCheck size={16} style={{color:C.gold}}/><h3 className="font-semibold" style={{color:C.textHi}}>My Attendance History</h3></div>{(teacher?.attendanceHistory||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,12).map((r,i)=><div key={i} className="flex justify-between py-2.5 border-b" style={{borderColor:C.line}}><span className="text-sm capitalize" style={{color:r.status==="present"?C.teal:r.status==="late"?C.gold:r.status==="leave"?C.textMid:C.rose}}>{r.status}</span><span className="text-xs" style={{...fontMono,color:C.textLow}}>{new Date(r.date).toLocaleDateString("en-PK")}</span></div>)}{!(teacher?.attendanceHistory||[]).length&&<div className="text-sm py-5 text-center" style={{color:C.textLow}}>No attendance records yet.</div>}</section>
      <section className="rounded-2xl border-2 p-5" style={{background:C.panel,borderColor:C.line}}><div className="flex items-center gap-2 mb-3"><History size={16} style={{color:C.teal}}/><h3 className="font-semibold" style={{color:C.textHi}}>Recent Salary Payments</h3></div>{recentPayments.map((p,i)=><div key={p._id||i} className="flex justify-between py-2.5 border-b" style={{borderColor:C.line}}><div><div className="text-sm font-semibold" style={{color:C.textHi}}>{pkr(p.amount)}</div><div className="text-[11px]" style={{color:C.textLow}}>{new Date(p.date).toLocaleDateString("en-PK")}{p.forMonth?` · ${p.forMonth}`:""}</div></div><span className="text-xs" style={{color:C.teal}}>Paid</span></div>)}{!recentPayments.length&&<div className="text-sm py-5 text-center" style={{color:C.textLow}}>No payments recorded yet.</div>}</section>
    </div>
  </div>;
}
function Card({C,label,value,icon:Icon,tone}){return <div className="rounded-xl border p-3.5" style={{background:C.panel,borderColor:C.line}}><div className="flex justify-between"><span className="text-xs" style={{color:C.textLow}}>{label}</span><Icon size={15} style={{color:tone||C.gold}}/></div><div className="text-lg xl:text-xl font-bold mt-2" style={{...fontMono,color:tone||C.textHi}}>{value}</div></div>}
