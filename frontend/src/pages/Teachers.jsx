import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Plus, X, CheckCircle2, XCircle, Clock3, Upload, User, BookOpen,
  Loader2, Wallet, History, Pencil, Trash2, AlertTriangle, UserX, UserCheck,
  Eye, GraduationCap, CalendarRange, Printer, Receipt, Download, Camera, Fingerprint, CalendarCheck, CalendarOff,
} from "lucide-react";
import PageLoader from "../components/PageLoader.jsx";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { teachersApi, attendanceScheduleApi, batchesApi, studentsApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";
import FaceCapture from "../components/FaceCapture.jsx";

const pkr = (n) => "₨ " + Number(n || 0).toLocaleString("en-PK");
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const emptyForm = { name: "", specialization: "", salary: "", joined: "", fingerprintId: "", faceDescriptor: null, accountEmail: "", accountPassword: "", batchIds: [] };
const emptyGenerateChallanForm = { month: "", amount: "", label: "Salary" };

// Local calendar date (NOT toISOString, which is UTC and can be off by a day for PKT users between 12:00 AM–4:59 AM).
const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Current month in YYYY-MM format
const currentMonth = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const normalize = (doc) => ({
  id: doc._id,
  name: doc.name,
  specialization: doc.specialization,
  salary: doc.salary,
  joined: doc.joiningDate ? doc.joiningDate.slice(0, 10) : "",
  paymentHistory: doc.paymentHistory || [],
  challans: doc.challans || [],
  active: doc.active !== false,
  attendance: doc.attendancePercent ?? 0,
  attendanceHistory: doc.attendanceHistory || [],
  leaveHistory: doc.leaveHistory || [],
  faceDescriptor: doc.faceDescriptor || null,
  fingerprintId: doc.fingerprintId || "",
  userId: doc.userId || null,
  accountEmail: doc.userId?.email || "",
  batchIds: Array.isArray(doc.batchIds) ? doc.batchIds.map((b) => typeof b === "string" ? b : b._id) : [],
  batchObjects: Array.isArray(doc.batchIds) ? doc.batchIds : [],
});

// Date-range helper for the "Salary Paid" filter
function getDateRange(filter, customFrom, customTo) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (filter === "today") {
    const start = startOfDay(now);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return [start, end];
  }
  if (filter === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return [start, end];
  }
  if (filter === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return [start, end];
  }
  if (filter === "custom" && customFrom && customTo) {
    const start = new Date(customFrom + "T00:00:00");
    const end = new Date(customTo + "T00:00:00"); end.setDate(end.getDate() + 1);
    return [start, end];
  }
  return null; // "all"
}

const totalPaid = (t) => (t.paymentHistory || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

const BatchCheckboxes = ({ batches, value = [], onChange, C }) => {
  const selected = new Set(value || []);
  const toggleBatch = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  if (!batches.length) {
    return (
      <div className="rounded-xl border-2 px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textLow }}>
        No batches available yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 p-2 space-y-1 max-h-44 overflow-y-auto" style={{ borderColor: C.line, background: C.panelSoft }}>
      {batches.map((b) => {
        const checked = selected.has(b._id);
        return (
          <label key={b._id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors" style={{ background: checked ? C.goldSoft : "transparent" }}>
            <span
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); toggleBatch(b._id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBatch(b._id); } }}
              className="h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
              style={{ borderColor: checked ? C.gold : C.line, background: checked ? C.gold : C.panel, color: "#fff" }}
            >
              {checked && <CheckCircle2 size={13} strokeWidth={3} />}
            </span>
            <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleBatch(b._id)} />
            <span className="text-sm font-medium" style={{ color: C.textHi }}>{b.name}</span>
          </label>
        );
      })}
    </div>
  );
};

// Pending salary = sum of challans that are NOT fully paid
const getPendingSalary = (t) => {
  return (t.challans || []).reduce(
    (sum, c) => sum + (c.status !== "paid" ? remainingForChallan(t, c) : 0),
    0
  );
};

// How much of ONE specific challan is still unpaid
const remainingForChallan = (t, challan) => {
  const paid = (t.paymentHistory || [])
    .filter((p) => p.challanId && String(p.challanId) === String(challan._id))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Math.max(0, challan.amount - paid);
};

export default function Teachers() {
  const { C } = useTheme();

  const [teachers, setTeachers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");

  // Date filter for "Salary Paid" stat
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  // Add-teacher modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [credentialFace, setCredentialFace] = useState(null);
  const [credentialFingerprint, setCredentialFingerprint] = useState("");
  const [credentialEmail, setCredentialEmail] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialTarget, setCredentialTarget] = useState(null);

  // View modal (Salary Slips + Payment History)
  // We only store the teacher's id here, and re-derive the actual object from
  // the live `teachers` array below. This way, once an action inside the modal
  // (generate challan / record payment / delete challan / delete payment)
  // finishes and reloads `teachers`, the modal immediately reflects the fresh
  // data instead of showing a stale snapshot until it's closed and reopened.
  const [viewTargetId, setViewTargetId] = useState(null);
  const [detailTab, setDetailTab] = useState("slips");
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [attendanceNote, setAttendanceNote] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [leaveCalendarOpen, setLeaveCalendarOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [leaveFrom, setLeaveFrom] = useState(todayStr());
  const [leaveTo, setLeaveTo] = useState(todayStr());
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [teacherSchedule, setTeacherSchedule] = useState({ weeklyOffDays: [], holidays: [] });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleHolidayDate, setScheduleHolidayDate] = useState(todayStr());
  const [scheduleHolidayLabel, setScheduleHolidayLabel] = useState("");
  const viewTarget = viewTargetId ? teachers.find((t) => t.id === viewTargetId) || null : null;

  // Generate Challan Modal
  const [generateChallanTarget, setGenerateChallanTarget] = useState(null);
  const [generateChallanForm, setGenerateChallanForm] = useState(emptyGenerateChallanForm);
  const [generateChallanSaving, setGenerateChallanSaving] = useState(false);

  // Record Payment Modal
  const [recordPaymentTarget, setRecordPaymentTarget] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [paySaving, setPaySaving] = useState(false);

  // Delete confirmations
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteChallanTarget, setDeleteChallanTarget] = useState(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
  const [deletePaymentSaving, setDeletePaymentSaving] = useState(false);
  const [deleteChallanSaving, setDeleteChallanSaving] = useState(false);

  // Deactivate/Activate
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const openTeacherLeaveCalendar = async () => { setLeaveCalendarOpen(true); try { const sc=await attendanceScheduleApi.get("teacher"); setTeacherSchedule({weeklyOffDays:sc.weeklyOffDays||[],holidays:sc.holidays||[]}); } catch(e){ setToast({message:e.message,tone:"error"}); } };

  const loadTeachers = () =>
    teachersApi
      .list()
      .then((docs) => setTeachers(docs.map(normalize)))
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setLoading(false));

  useEffect(() => { loadTeachers(); batchesApi.list().then(setBatches).catch(() => {}); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Register this page's action button (Add Teacher) into the shared Layout
  // header. Auto-clears on unmount so leaving this page doesn't leave a
  // stale button behind in the header.
  // Compact on mobile (icon only) so it doesn't crowd out the page title;
  // expands to show the full label from `sm` breakpoint upward.
  useHeaderActions(
    <>
      <button onClick={openTeacherLeaveCalendar} className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold shrink-0" style={{ background: C.panelSoft, color: C.gold }}>
        <CalendarOff size={16} /> <span className="hidden sm:inline">Leave Calendar</span>
      </button>
      <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold shrink-0 transition-all active:scale-95" style={{ background: C.gold, color: "#fff" }}>
        <Plus size={16} /> <span className="hidden sm:inline">Add Teacher</span>
      </button>
    </>,
    [C]
  );
  const AttendanceBar = ({ value }) => {
    const v = Math.max(0, Math.min(100, Number(value ?? 0)));
    return (
      <div className="flex items-center gap-1.5 min-w-0 w-full max-w-[180px] sm:min-w-[150px] sm:max-w-none">
        <div className="h-2 min-w-0 flex-1 rounded-full overflow-hidden" style={{ background: C.panelSoft }}><div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? C.teal : v >= 60 ? C.gold : C.rose }} /></div>
        <span className="text-xs font-semibold" style={{ ...fontMono, color: C.textHi }}>{v}%</span>
      </div>
    );
  };

  const filtered = useMemo(() => teachers.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) || t.specialization.toLowerCase().includes(query.toLowerCase())
  ), [teachers, query]);

  // "Salary Paid" — ONLY this respects the date filter
  const salaryPaid = useMemo(() => {
    const range = getDateRange(dateFilter, customFrom, customTo);
    let sum = 0;
    for (const t of teachers) {
      for (const p of t.paymentHistory || []) {
        if (!range) { sum += Number(p.amount) || 0; continue; }
        const d = new Date(p.date);
        if (d >= range[0] && d < range[1]) sum += Number(p.amount) || 0;
      }
    }
    return sum;
  }, [teachers, dateFilter, customFrom, customTo]);

  // Always all-time
  const salaryLeft = teachers.reduce((sum, t) => sum + getPendingSalary(t), 0);
  const activeCount = teachers.filter((t) => t.active).length;

  // Form handlers
  const submitForm = () => {
    if (!form.name?.trim() || !form.specialization?.trim() || !form.salary) {
      setToast({ message: "Please fill in all required fields", tone: "error" });
      return;
    }
    if (!form.accountEmail?.trim() || !form.accountPassword || form.accountPassword.length < 6) {
      setToast({ message: "Teacher login email and password (minimum 6 characters) are required", tone: "error" });
      return;
    }
    setSaving(true);
    teachersApi
      .create({
        name: form.name.trim(),
        specialization: form.specialization.trim(),
        salary: Number(form.salary),
        joiningDate: form.joined || todayStr(),
        faceDescriptor: form.faceDescriptor,
        fingerprintId: form.fingerprintId?.trim() || undefined,
        accountEmail: form.accountEmail?.trim() || undefined,
        accountPassword: form.accountPassword || undefined,
        batchIds: form.batchIds || [],
      })
      .then(() => {
        setToast({ message: "Teacher added successfully", tone: "success" });
        setModalOpen(false);
        setForm(emptyForm);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setSaving(false));
  };

  const startEdit = (t) => {
    setEditTarget(t);
    setEditForm({ name: t.name, specialization: t.specialization, salary: t.salary, joined: t.joined, batchIds: t.batchIds || [], accountEmail: t.accountEmail || "", accountPassword: "", faceDescriptor: t.faceDescriptor || null, fingerprintId: t.fingerprintId || "" });
  };

  const submitEdit = () => {
    if (!editForm.name?.trim() || !editForm.specialization?.trim() || !editForm.salary) {
      setToast({ message: "Please fill in all required fields", tone: "error" });
      return;
    }
    setEditSaving(true);
    teachersApi
      .update(editTarget.id, {
        name: editForm.name.trim(),
        specialization: editForm.specialization.trim(),
        salary: Number(editForm.salary),
        joiningDate: editForm.joined,
        batchIds: editForm.batchIds || [],
        faceDescriptor: editForm.faceDescriptor,
        fingerprintId: editForm.fingerprintId || undefined,
        accountEmail: editForm.accountEmail || undefined,
        accountPassword: editForm.accountPassword || undefined,
      })
      .then(() => {
        setToast({ message: "Teacher updated successfully", tone: "success" });
        setEditTarget(null);
        setEditForm(emptyForm);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setEditSaving(false));
  };

  const openCredentials = (t) => {
    setCredentialTarget(t);
    setCredentialFace(t.faceDescriptor || null);
    setCredentialFingerprint(t.fingerprintId || "");
    setCredentialEmail(t.accountEmail || "");
    setCredentialPassword("");
  };

  const saveCredentials = async () => {
    if (!credentialTarget) return;
    setCredentialSaving(true);
    try {
      const updated = await teachersApi.update(credentialTarget.id, {
        faceDescriptor: credentialFace,
        fingerprintId: credentialFingerprint.trim() || undefined,
        accountEmail: credentialEmail.trim() || undefined,
        accountPassword: credentialPassword || undefined,
      });
      setTeachers((prev) => prev.map((x) => x.id === credentialTarget.id ? normalize(updated) : x));
      setCredentialTarget(null);
      setToast({ message: "Teacher credentials updated", tone: "success" });
    } catch (err) { setToast({ message: err.message, tone: "error" }); }
    finally { setCredentialSaving(false); }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    teachersApi
      .remove(deleteTarget.id)
      .then(() => {
        setToast({ message: "Teacher deleted", tone: "success" });
        setDeleteTarget(null);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeleting(false));
  };

  const confirmDeactivate = () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    teachersApi
      .update(deactivateTarget.id, { active: !deactivateTarget.active })
      .then(() => {
        setToast({ message: deactivateTarget.active ? "Teacher deactivated" : "Teacher activated", tone: "success" });
        setDeactivateTarget(null);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeactivating(false));
  };

  // Challan Management
  const submitGenerateChallan = () => {
    if (!generateChallanForm.month || !generateChallanForm.amount) {
      setToast({ message: "Please fill in month and amount", tone: "error" });
      return;
    }
    setGenerateChallanSaving(true);
    teachersApi
      .generateChallan(generateChallanTarget.id, {
        month: generateChallanForm.month,
        amount: Number(generateChallanForm.amount),
        label: generateChallanForm.label || "Salary",
      })
      .then(() => {
        setToast({ message: "Salary challan generated", tone: "success" });
        setGenerateChallanTarget(null);
        setGenerateChallanForm(emptyGenerateChallanForm);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setGenerateChallanSaving(false));
  };

  const submitDeleteChallan = () => {
    if (!deleteChallanTarget) return;
    const { teacherId, challanId } = deleteChallanTarget;
    setDeleteChallanSaving(true);
    teachersApi
      .deleteChallan(teacherId, challanId)
      .then(() => {
        setToast({ message: "Salary challan deleted", tone: "success" });
        setDeleteChallanTarget(null);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeleteChallanSaving(false));
  };

  const submitDeletePayment = () => {
    if (!deletePaymentTarget) return;
    const { teacherId, paymentId } = deletePaymentTarget;
    setDeletePaymentSaving(true);
    teachersApi
      .removePayment(teacherId, paymentId)
      .then(() => {
        setToast({ message: "Payment deleted", tone: "success" });
        setDeletePaymentTarget(null);
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeletePaymentSaving(false));
  };

  // Payment Recording
  const submitPayment = (e) => {
    e.preventDefault();
    if (!selectedChallan || !payAmount) {
      setToast({ message: "Select a challan and enter amount", tone: "error" });
      return;
    }
    setPaySaving(true);
    teachersApi
      .addPayment(viewTarget.id, {
        challanId: selectedChallan._id,
        amount: Number(payAmount),
        date: payDate,
        note: payNote,
      })
      .then(() => {
        setToast({ message: "Payment recorded", tone: "success" });
        setRecordPaymentTarget(null);
        setSelectedChallan(null);
        setPayAmount("");
        setPayNote("");
        setPayDate(todayStr());
        loadTeachers();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setPaySaving(false));
  };

  // Prints a single salary challan as a bill — same "open a blank tab, write
  // HTML, trigger print" pattern used for students' fee-challan bills, so
  // both modules produce the same look and use the same PAID/PARTIAL/PENDING
  // breakdown logic instead of a plain binary paid/unpaid label.
  const printChallanBill = (teacher, challan) => {
    const w = window.open("", "_blank", "width=800,height=650");
    if (!w) {
      setToast({ message: "Please allow pop-ups to print the bill.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));

    const remaining = challan.status === "paid" ? 0 : remainingForChallan(teacher, challan);
    const isPaid = challan.status === "paid";
    const isPartial = !isPaid && remaining < challan.amount;
    const paidSoFar = challan.amount - remaining;

    const statusLabel = isPaid ? "PAID" : isPartial ? "PARTIALLY PAID" : "PENDING";
    const statusBg = isPaid ? "#ccfbf1" : isPartial ? "#fef3c7" : "#fee2e2";
    const statusColor = isPaid ? "#0f766e" : isPartial ? "#92400e" : "#b91c1c";

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill - ${safe(teacher.name)}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#eef1f7;font-family:Inter,Arial,sans-serif;color:#182033;padding:28px 18px}
    .page{max-width:720px;margin:0 auto;background:#fff;padding:38px;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 18px 50px rgba(24,32,51,.10)}
    .head{display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:1px solid #e5e7eb;padding-bottom:18px;margin-bottom:24px}
    .brand{font-size:18px;font-weight:800;color:#7c3aed;letter-spacing:.2px}
    .status{display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    td{padding:12px 0;border-bottom:1px solid #edf0f5;font-size:14px}
    .lbl{color:#7b8496;width:150px;font-weight:600}
    .amt{font-size:28px;font-weight:800;margin-top:26px;text-align:right;color:#182033}
    .amt-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#8a94a6;text-align:right;margin-top:18px}
    .breakdown{font-size:12px;color:#697386;text-align:right;margin-top:6px}
    .print{position:fixed;top:16px;right:16px;border:0;background:#7c3aed;color:#fff;padding:9px 15px;border-radius:10px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.10)}
    @media (max-width:700px){body{padding:12px}.page{padding:24px;border-radius:14px}.head{align-items:flex-start}.lbl{width:38%}.amt{font-size:24px}.print{position:static;margin:0 0 12px auto;display:block}}@media print{body{background:#fff;padding:0}.page{margin:0;max-width:none;border:0;box-shadow:none;border-radius:0}.print{display:none}}
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">Print</button>
  <div class="page">
    <div class="head">
      <div class="brand">Infusible Coders</div>
      <span class="status" style="background:${statusBg};color:${statusColor}">${statusLabel}</span>
    </div>
    <table>
      <tr><td class="lbl">Teacher</td><td>${safe(teacher.name)}</td></tr>
      <tr><td class="lbl">Specialization</td><td>${safe(teacher.specialization || "—")}</td></tr>
      <tr><td class="lbl">Challan</td><td>${safe(challan.label)}</td></tr>
      <tr><td class="lbl">Month</td><td>${safe(challan.month)}</td></tr>
      <tr><td class="lbl">Total Amount</td><td>${pkr(challan.amount)}</td></tr>
    </table>
    <div class="amt-label">${isPaid ? "Amount Paid" : "Amount Due"}</div>
    <div class="amt">${isPaid ? pkr(challan.amount) : pkr(remaining)}</div>
    ${isPartial ? `<div class="breakdown">Paid ${pkr(paidSoFar)} of ${pkr(challan.amount)}</div>` : ""}
  </div>
</body>
</html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Prints a single payment as a receipt — same template as the students module.
  const printReceipt = (teacher, payment) => {
    const w = window.open("", "_blank", "width=800,height=650");
    if (!w) {
      setToast({ message: "Please allow pop-ups to print the receipt.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const dateStr = new Date(payment.date).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt - ${safe(teacher.name)}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#eef1f7;font-family:Inter,Arial,sans-serif;color:#182033;padding:28px 18px}
    .page{max-width:720px;margin:0 auto;background:#fff;padding:38px;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 18px 50px rgba(24,32,51,.10)}
    .brand{font-size:18px;font-weight:800;color:#0d9488;border-bottom:3px solid #0d9488;padding-bottom:14px;margin-bottom:24px;letter-spacing:.2px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    td{padding:12px 0;border-bottom:1px solid #edf0f5;font-size:14px}
    .lbl{color:#7b8496;width:150px;font-weight:600}
    .amt{font-size:28px;font-weight:800;margin-top:26px;text-align:right;color:#0d9488}
    .amt-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#8a94a6;text-align:right;margin-top:18px}
    .print{position:fixed;top:16px;right:16px;border:0;background:#0d9488;color:#fff;padding:9px 15px;border-radius:10px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.10)}
    @media (max-width:700px){body{padding:12px}.page{padding:24px;border-radius:14px}.head{align-items:flex-start}.lbl{width:38%}.amt{font-size:24px}.print{position:static;margin:0 0 12px auto;display:block}}@media print{body{background:#fff;padding:0}.page{margin:0;max-width:none;border:0;box-shadow:none;border-radius:0}.print{display:none}}
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">Print</button>
  <div class="page">
    <div class="brand">Infusible Coders — Salary Payment Receipt</div>
    <table>
      <tr><td class="lbl">Teacher</td><td>${safe(teacher.name)}</td></tr>
      <tr><td class="lbl">Specialization</td><td>${safe(teacher.specialization || "—")}</td></tr>
      <tr><td class="lbl">Month</td><td>${safe(payment.forMonth || "—")}</td></tr>
      <tr><td class="lbl">Date</td><td>${dateStr}</td></tr>
      ${payment.note ? `<tr><td class="lbl">Note</td><td>${safe(payment.note)}</td></tr>` : ""}
    </table>
    <div class="amt-label">Amount Paid</div>
    <div class="amt">${pkr(payment.amount)}</div>
  </div>
</body>
</html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="w-full min-h-screen pb-8" style={{ background: C.bg }}>
     

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Active Teachers</div>
            <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-2xl">{activeCount}</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Pending Salary</div>
            <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-2xl">{pkr(salaryLeft)}</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Salary Paid</div>
              <div className="flex gap-1">
                {["today", "thisMonth", "lastMonth", "all"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ background: dateFilter === f ? C.gold : C.panelSoft, color: dateFilter === f ? "#fff" : C.textLow }}
                  >
                    {f === "today" ? "Today" : f === "thisMonth" ? "This Mo" : f === "lastMonth" ? "Last Mo" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-2xl">{pkr(salaryPaid)}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.textLow }} />
            <input
              type="text"
              placeholder="Search by name or specialization…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm"
              style={{ borderColor: C.line, color: C.textHi }}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {filtered.length === 0 && <div className="text-center py-12" style={{ color: C.textLow }}>No teachers found.</div>}
        {filtered.map((t) => (
          <div key={t.id} className="rounded-xl border-2 p-4 transition-all hover:shadow-md" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                <div className="p-3 rounded-lg shrink-0" style={{ background: C.goldSoft }}>
                  <div style={{ color: C.gold, fontWeight: 700 }} className="w-8 h-8 flex items-center justify-center text-sm">
                    {initials(t.name)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 style={{ ...fontDisplay, color: C.textHi, fontWeight: 600 }} className="text-base">
                      {t.name}
                    </h3>
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: t.active ? C.tealSoft : C.goldSoft, color: t.active ? C.teal : C.gold }}>
                      {t.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: C.textLow }}>{t.specialization}</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs min-w-0">
                    <div>
                      <div style={{ color: C.textLow }}>Salary</div>
                      <div style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(t.salary)}</div>
                    </div>
                    <div>
                      <div style={{ color: C.textLow }}>Pending</div>
                      <div style={{ ...fontMono, color: getPendingSalary(t) > 0 ? C.rose : C.teal, fontWeight: 600 }}>
                        {pkr(getPendingSalary(t))}
                      </div>
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <div style={{ color: C.textLow }}>Attendance</div>
                      <AttendanceBar value={t.attendance} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap justify-end gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
                <button onClick={() => { setAttendanceTarget(t); setAttendanceDate(todayStr()); setAttendanceStatus("present"); setAttendanceNote(""); }} title="Manual Attendance" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.teal }}><CalendarCheck size={15} /></button>
                <button onClick={() => openCredentials(t)} title="View / Edit Credentials" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.teal }}><Fingerprint size={15} /></button>
                <button onClick={() => { setViewTargetId(t.id); setDetailTab("slips"); }} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Eye size={15} />
                </button>
                <button onClick={() => startEdit(t)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeactivateTarget(t)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: t.active ? C.gold : C.teal }}>
                  {t.active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
                <button onClick={() => setDeleteTarget(t)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.rose }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Teacher Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-auto" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-xl rounded-2xl border-2 p-6 my-6 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Add Teacher</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <Field label="Name *" C={C}><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Full name" /></Field>
              <Field label="Specialization *" C={C}><input required value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. Mathematics, English" /></Field>
              <Field label="Monthly Salary *" C={C}><input required type="number" min="1" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="50000" /></Field>
              <Field label="Joining Date" C={C}><input type="date" value={form.joined} onChange={(e) => setForm({ ...form, joined: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <Field label="Assign Batches" C={C}>
                <BatchCheckboxes batches={batches} value={form.batchIds || []} onChange={(batchIds) => setForm({ ...form, batchIds })} C={C} />
                <div className="text-[10px] mt-1" style={{color:C.textLow}}>Tick one or more batches to assign them to this teacher.</div>
              </Field>
              
              <div className="rounded-xl border-2 p-4 space-y-4" style={{ borderColor: C.line, background: C.panelSoft }}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Teacher Login Account</div>
                <Field label="Login Email" C={C}><input type="email" value={form.accountEmail} onChange={(e) => setForm({ ...form, accountEmail: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="teacher@example.com" /></Field>
                <Field label="Login Password" C={C}><input type="password" minLength="8" value={form.accountPassword} onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Minimum 8 characters" /></Field>
              </div>

              {/* Face Capture */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: C.textMid }}>Face Registration <span style={{color:C.textLow}}>(optional)</span></label>
                <FaceCapture 
                  onCapture={(descriptor) => setForm({ ...form, faceDescriptor: descriptor })}
                  captured={!!form.faceDescriptor}
                />
              </div>

              {/* Fingerprint ID */}
              <Field label="Fingerprint ID (optional)" C={C}>
                <div className="flex gap-2">
                  <Fingerprint size={18} style={{ color: C.textMid, marginTop: 8 }} />
                  <input 
                    type="text" 
                    value={form.fingerprintId} 
                    onChange={(e) => setForm({ ...form, fingerprintId: e.target.value })} 
                    className="flex-1 bg-transparent border-2 rounded-xl px-4 py-3 text-sm" 
                    style={{ borderColor: C.line, color: C.textHi }} 
                    placeholder="Enter fingerprint ID or device ID"
                  />
                </div>
              </Field>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setModalOpen(false)} disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button onClick={submitForm} disabled={saving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                  {saving ? <Loader2 size={15} className="animate-spin inline" /> : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-xl rounded-2xl border-2 p-6 my-6 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Edit Teacher</h2>
              <button onClick={() => setEditTarget(null)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <Field label="Name *" C={C}><input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Full name" /></Field>
              <Field label="Specialization *" C={C}><input required value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. Mathematics, English" /></Field>
              <Field label="Monthly Salary *" C={C}><input required type="number" min="1" value={editForm.salary} onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="50000" /></Field>
              <Field label="Joining Date" C={C}><input type="date" value={editForm.joined} onChange={(e) => setEditForm({ ...editForm, joined: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <Field label="Assigned Batches" C={C}>
                <BatchCheckboxes batches={batches} value={editForm.batchIds || []} onChange={(batchIds) => setEditForm({ ...editForm, batchIds })} C={C} />
                <div className="text-[10px] mt-1" style={{color:C.textLow}}>Tick one or more batches to assign them to this teacher.</div>
              </Field>
              <div className="rounded-xl border-2 p-4 space-y-3" style={{borderColor:C.line,background:C.panelSoft}}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color:C.textLow}}>Login Credentials</div>
                <Field label="Login Email" C={C}><input type="email" value={editForm.accountEmail || ""} onChange={(e)=>setEditForm({...editForm,accountEmail:e.target.value})} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} /></Field>
                <Field label="New Password (optional)" C={C}><input type="password" minLength="8" value={editForm.accountPassword || ""} onChange={(e)=>setEditForm({...editForm,accountPassword:e.target.value})} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} placeholder="Leave blank to keep current" /></Field>
              </div>
              <div className="rounded-xl border-2 p-4 space-y-3" style={{borderColor:C.line,background:C.panelSoft}}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color:C.textLow}}>Attendance Credentials</div>
                <FaceCapture onCapture={(descriptor)=>setEditForm({...editForm,faceDescriptor:descriptor})} captured={!!editForm.faceDescriptor} />
                <Field label="Fingerprint ID (optional)" C={C}><input value={editForm.fingerprintId || ""} onChange={(e)=>setEditForm({...editForm,fingerprintId:e.target.value})} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} placeholder="Fingerprint/device ID" /></Field>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditTarget(null)} disabled={editSaving} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button onClick={submitEdit} disabled={editSaving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                  {editSaving ? <Loader2 size={15} className="animate-spin inline" /> : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Teacher Modal */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-2xl rounded-2xl border-2 my-8" style={{ background: C.panel, borderColor: C.line }}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-2" style={{ borderColor: C.line }}>
              <div>
                <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">{viewTarget.name}</h2>
                <p className="text-xs" style={{ color: C.textLow }}>{viewTarget.specialization}</p>
              </div>
              <button onClick={() => setViewTargetId(null)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Salary</div>
                  <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-sm">{pkr(viewTarget.salary)}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Paid</div>
                  <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-sm">{pkr(totalPaid(viewTarget))}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.rose, background: getPendingSalary(viewTarget) > 0 ? C.roseSoft : "transparent" }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Pending</div>
                  <div style={{ ...fontMono, color: getPendingSalary(viewTarget) > 0 ? C.rose : C.teal, fontWeight: 700 }} className="text-sm">{pkr(getPendingSalary(viewTarget))}</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.panelSoft }}>
                {[
                  { key: "slips", label: "Salary Slips", icon: Receipt },
                  { key: "history", label: "Payment History", icon: History },
                  { key: "payment", label: "Record Payment", icon: Wallet },
                  { key: "attendance", label: "Attendance", icon: CalendarCheck },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setDetailTab(key)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition-all"
                    style={{
                      background: detailTab === key ? C.panel : "transparent",
                      color: detailTab === key ? C.textHi : C.textLow,
                      boxShadow: detailTab === key ? `0 1px 4px ${C.line}` : "none",
                    }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>

              {/* Salary Slips Tab */}
              {detailTab === "slips" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Receipt size={13} /> Salary Slips</div>
                    <button
                      onClick={() => {
                        setGenerateChallanTarget(viewTarget);
                        setGenerateChallanForm({ month: currentMonth(), amount: viewTarget.salary, label: "Salary" });
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: C.gold, color: "#fff" }}
                    >
                      <Plus size={13} className="inline mr-1" /> Generate Challan
                    </button>
                  </div>
                  {(viewTarget.challans || []).length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No salary slips generated yet.</div>}
                  <div className="space-y-2">
                    {[...(viewTarget.challans || [])].sort((a, b) => new Date(b.generatedOn) - new Date(a.generatedOn)).map((c) => {
                      const remaining = c.status === "paid" ? 0 : remainingForChallan(viewTarget, c);
                      const isPartial = c.status !== "paid" && remaining < c.amount;
                      return (
                        <div key={c._id} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 gap-2" style={{ borderColor: C.line }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg shrink-0" style={{ background: c.status === "paid" ? C.tealSoft : C.roseSoft }}><Receipt size={14} style={{ color: c.status === "paid" ? C.teal : C.rose }} /></div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: C.textHi }}>{c.label}</div>
                              <div className="text-[11px]" style={{ color: C.textLow }}>{c.month}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="text-right">
                              <div style={{ ...fontMono, color: C.textHi, fontWeight: 600 }} className="text-sm whitespace-nowrap">
                                {isPartial ? pkr(remaining) : pkr(c.amount)}
                              </div>
                              {isPartial && (
                                <div style={{ ...fontMono, color: C.textLow }} className="text-[10px] whitespace-nowrap">
                                  Paid {pkr(c.amount - remaining)} / {pkr(c.amount)}
                                </div>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap leading-none" style={{ background: c.status === "paid" ? C.tealSoft : C.roseSoft, color: c.status === "paid" ? C.teal : C.rose }}>
                              {c.status === "paid" ? <><CheckCircle2 size={11} /> Paid</> : isPartial ? <><XCircle size={11} /> Partial</> : <><XCircle size={11} /> Pending</>}
                            </span>
                            <button onClick={() => printChallanBill(viewTarget, c)} title="Print Bill" className="p-1.5 rounded-lg" style={{ color: C.gold, background: C.goldSoft }}><Printer size={13} /></button>
                            <button onClick={() => setDeleteChallanTarget({ teacherId: viewTarget.id, challanId: c._id })} title="Delete Challan" className="p-1.5 rounded-lg" style={{ color: C.rose, background: C.roseSoft }}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Payment History Tab */}
              {detailTab === "history" && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><History size={13} /> Payment History</div>
                  {(viewTarget.paymentHistory || []).length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No payments recorded yet.</div>}
                  <div className="space-y-2">
                    {[...(viewTarget.paymentHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => (
                      <div key={p._id} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 gap-2" style={{ borderColor: C.line }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg shrink-0" style={{ background: C.tealSoft }}><Wallet size={14} style={{ color: C.teal }} /></div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold" style={{ ...fontMono, color: C.textHi }}>{pkr(p.amount)}</div>
                            <div className="text-xs truncate" style={{ color: C.textLow }}>
                              {new Date(p.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                              {p.forMonth ? ` · ${p.forMonth}` : ""}
                              {p.note ? ` · ${p.note}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => printReceipt(viewTarget, p)} title="Print Receipt" className="p-1.5 rounded-lg" style={{ color: C.gold, background: C.goldSoft }}><Printer size={13} /></button>
                          <button
                            onClick={() => setDeletePaymentTarget({ teacherId: viewTarget.id, paymentId: p._id })}
                            className="p-1.5 rounded-lg"
                            style={{ color: C.rose, background: C.roseSoft }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "attendance" && (
                <div>
                  <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><CalendarCheck size={13} /> Attendance History</div><AttendanceBar value={viewTarget.attendance} /></div>
                  {(viewTarget.attendanceHistory || []).length === 0 ? <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No attendance records yet.</div> : (viewTarget.attendanceHistory || []).slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>{ const tone = r.status === "present" ? C.teal : r.status === "late" ? C.gold : r.status === "leave" ? C.textMid : C.rose; return <div key={i} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 mb-2" style={{ borderColor:C.line }}><div><div className="text-sm font-semibold capitalize" style={{color:tone}}>{r.status}</div><div className="text-xs" style={{color:C.textLow}}>{new Date(r.date).toLocaleDateString("en-PK",{day:"2-digit",month:"short",year:"numeric"})} · {r.type || "manual"}</div></div>{r.note && <div className="text-xs max-w-[45%] text-right" style={{color:C.textLow}}>{r.note}</div>}</div>})}
                </div>
              )}

              {/* Record Payment Tab */}
              {detailTab === "payment" && (
                <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line }}>
                  <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Wallet size={13} /> Record a Payment</div>

                  {(viewTarget.challans || []).filter((c) => c.status !== "paid").length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-8">
                      <CheckCircle2 size={28} style={{ color: C.teal }} className="mb-3" />
                      <div className="text-sm" style={{ color: C.teal }}>
                        All challans are cleared — nothing pending to pay.
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={submitPayment} className="space-y-4">
                      <Field label="Select Challan *" C={C}>
                        <select
                          required
                          value={selectedChallan ? selectedChallan._id : ""}
                          onChange={(e) => {
                            const c = viewTarget.challans.find((ch) => ch._id === e.target.value);
                            setSelectedChallan(c);
                            setPayAmount("");
                          }}
                          className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                          style={{ borderColor: C.line, color: C.textHi }}
                        >
                          <option value="">Choose a challan...</option>
                          {(viewTarget.challans || []).filter((c) => c.status !== "paid").map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.month} · {c.label} · {pkr(remainingForChallan(viewTarget, c))} pending
                            </option>
                          ))}
                        </select>
                      </Field>

                      {selectedChallan && (
                        <>
                          <div className="text-xs p-3 rounded-lg" style={{ background: C.panelSoft, color: C.textMid }}>
                            Remaining: <span style={{ fontWeight: 600, color: C.textHi }}>{pkr(remainingForChallan(viewTarget, selectedChallan))}</span>
                          </div>
                          <Field label="Amount (₨) *" C={C}>
                            <input
                              required
                              type="number"
                              min="1"
                              max={remainingForChallan(viewTarget, selectedChallan)}
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                              style={{ borderColor: C.line, color: C.textHi }}
                              placeholder="70000"
                            />
                          </Field>
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Date paid" C={C}><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
                        <Field label="Note (optional)" C={C}><input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. cash, bank transfer" /></Field>
                      </div>

                      <button type="submit" disabled={paySaving || !selectedChallan} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                        {paySaving ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />} Record Payment
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {attendanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background:C.panel, borderColor:C.line }}>
            <div className="flex items-center justify-between mb-4"><div><div className="text-xl font-bold" style={{...fontDisplay,color:C.textHi}}>Manual Attendance</div><div className="text-xs" style={{color:C.textLow}}>{attendanceTarget.name}</div></div><button onClick={()=>setAttendanceTarget(null)}><X size={18}/></button></div>
            <form onSubmit={async(e)=>{e.preventDefault();setAttendanceSaving(true);try{await teachersApi.markManualAttendance(attendanceTarget.id,{date:attendanceDate,status:attendanceStatus,note:attendanceNote});setToast({message:"Teacher attendance saved",tone:"success"});setAttendanceTarget(null);loadTeachers();}catch(err){setToast({message:err.message,tone:"error"})}finally{setAttendanceSaving(false)}}} className="space-y-4">
              <Field label="Date" C={C}><input required type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}}/></Field>
              <div className="grid grid-cols-4 gap-2">{["present","late","absent","leave"].map(st=><button key={st} type="button" onClick={()=>setAttendanceStatus(st)} className="rounded-xl py-3 text-xs font-semibold capitalize border-2" style={{borderColor:attendanceStatus===st?C.gold:C.line,background:attendanceStatus===st?C.goldSoft:"transparent",color:attendanceStatus===st?C.gold:C.textMid}}>{st}</button>)}</div>
              <Field label="Note" C={C}><input value={attendanceNote} onChange={e=>setAttendanceNote(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} placeholder="Optional note"/></Field>
              <button disabled={attendanceSaving} className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60" style={{background:C.teal,color:"#fff"}}>{attendanceSaving?"Saving…":"Save Attendance"}</button>
            </form>
          </div>
        </div>
      )}

      {leaveCalendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" style={{background:C.overlay}}>
          <div className="modal-in w-full max-w-2xl rounded-2xl border-2 my-8 p-6" style={{background:C.panel,borderColor:C.line}}>
            <div className="flex items-center justify-between mb-5"><div><div className="text-xl font-bold" style={{...fontDisplay,color:C.textHi}}>Teacher Leave Calendar</div><div className="text-xs" style={{color:C.textLow}}>Add and review teacher leave periods</div></div><button onClick={()=>setLeaveCalendarOpen(false)}><X size={18}/></button></div>
            <div className="rounded-xl border-2 p-4 mb-4" style={{borderColor:C.line}}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:C.textLow}}>Teacher Weekly Off / Holidays</div>
              <div className="flex flex-wrap gap-2 mb-4">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=><button key={d} onClick={()=>setTeacherSchedule(prev=>({...prev,weeklyOffDays:prev.weeklyOffDays.includes(i)?prev.weeklyOffDays.filter(x=>x!==i):[...prev.weeklyOffDays,i]}))} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{background:teacherSchedule.weeklyOffDays.includes(i)?C.goldSoft:C.panelSoft,color:teacherSchedule.weeklyOffDays.includes(i)?C.gold:C.textMid}}>{d}</button>)}</div>
              <div className="flex flex-col sm:flex-row gap-2"><input type="date" value={scheduleHolidayDate} onChange={e=>setScheduleHolidayDate(e.target.value)} className="bg-transparent border-2 rounded-lg px-3 py-2 text-xs" style={{borderColor:C.line,color:C.textHi}}/><input value={scheduleHolidayLabel} onChange={e=>setScheduleHolidayLabel(e.target.value)} placeholder="Holiday label" className="flex-1 bg-transparent border-2 rounded-lg px-3 py-2 text-xs" style={{borderColor:C.line,color:C.textHi}}/><button onClick={()=>{if(!scheduleHolidayDate)return;setTeacherSchedule(prev=>({...prev,holidays:[...prev.holidays,{date:scheduleHolidayDate,label:scheduleHolidayLabel||"Holiday"}]}));setScheduleHolidayLabel("")}} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{background:C.panelSoft,color:C.gold}}>Add Holiday</button></div>
              {teacherSchedule.holidays.length>0 && <div className="mt-3 space-y-1">{teacherSchedule.holidays.map((h,i)=><div key={h._id||i} className="flex justify-between text-xs rounded-lg px-3 py-2" style={{background:C.panelSoft,color:C.textMid}}><span>{h.date} · {h.label}</span><button onClick={()=>setTeacherSchedule(prev=>({...prev,holidays:prev.holidays.filter((_,idx)=>idx!==i)}))} style={{color:C.rose}}>Remove</button></div>)}</div>}
              <button disabled={scheduleSaving} onClick={async()=>{setScheduleSaving(true);try{await attendanceScheduleApi.update("teacher",teacherSchedule);setToast({message:"Teacher leave calendar saved",tone:"success"})}catch(e){setToast({message:e.message,tone:"error"})}finally{setScheduleSaving(false)}}} className="mt-3 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-60" style={{background:C.teal,color:"white"}}>{scheduleSaving?"Saving…":"Save Calendar"}</button>
              <div className="mt-4 rounded-xl border-2 p-4" style={{borderColor:C.line,background:C.panelSoft}}>
                <div className="text-sm font-semibold mb-1" style={{color:C.textHi}}>Run auto-attendance for today</div>
                <div className="text-xs mb-3" style={{color:C.textLow}}>Teachers and students who have no record today are marked leave on weekly-off/holiday dates; otherwise absent. Existing attendance is never overwritten.</div>
                <button onClick={async()=>{try{const r=await studentsApi.runAutoAttendance();setToast({message:`Auto-attendance complete: ${r.students.leaveCount+r.teachers.leaveCount} leave, ${r.students.absentCount+r.teachers.absentCount} absent`,tone:"success"});loadTeachers();}catch(e){setToast({message:e.message,tone:"error"})}}} className="w-full rounded-xl py-3 text-sm font-semibold" style={{background:C.teal,color:"white"}}>Run Now</button>
              </div>
            </div>


          </div>
        </div>
      )}

      {credentialTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" style={{background:C.overlay}}>
          <div className="modal-in w-full max-w-xl rounded-2xl border-2 p-6 my-6" style={{background:C.panel,borderColor:C.line}}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold" style={{...fontDisplay,color:C.textHi}}>View Credentials</h2>
                <p className="text-xs" style={{color:C.textLow}}>{credentialTarget.name}</p>
              </div>
              <button onClick={()=>setCredentialTarget(null)}><X size={18}/></button>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border-2 p-4 space-y-4" style={{borderColor:C.line,background:C.panelSoft}}>
                <Field label="Username" C={C}>
                  <input type="text" value={credentialEmail} onChange={e=>setCredentialEmail(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} placeholder="Teacher username / login email" />
                </Field>
                <Field label="Password" C={C}>
                  <input type="password" minLength="8" value={credentialPassword} onChange={e=>setCredentialPassword(e.target.value)} placeholder="Enter a new password to change it" className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{borderColor:C.line,color:C.textHi}} />
                </Field>
                <p className="text-[11px]" style={{color:C.textLow}}>Passwords are stored securely and cannot be displayed as plain text. Enter a new password only if you want to change it.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setCredentialTarget(null)} disabled={credentialSaving} className="flex-1 rounded-xl py-3 border-2" style={{borderColor:C.line,color:C.textMid}}>Cancel</button>
                <button onClick={saveCredentials} disabled={credentialSaving} className="flex-1 rounded-xl py-3 font-semibold" style={{background:C.gold,color:"white"}}>{credentialSaving?"Saving…":"Save Credentials"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Challan Modal */}
      {generateChallanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Generate Salary Challan</h2>
              <button onClick={() => setGenerateChallanTarget(null)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="text-sm p-3 rounded-lg" style={{ background: C.panelSoft, color: C.textMid }}>
                For: <span style={{ fontWeight: 600, color: C.textHi }}>{generateChallanTarget.name}</span>
              </div>
              <Field label="Month (YYYY-MM) *" C={C}>
                <input
                  required
                  type="month"
                  value={generateChallanForm.month}
                  onChange={(e) => setGenerateChallanForm({ ...generateChallanForm, month: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                />
              </Field>
              <Field label="Amount (₨) *" C={C}>
                <input
                  required
                  type="number"
                  min="1"
                  value={generateChallanForm.amount}
                  onChange={(e) => setGenerateChallanForm({ ...generateChallanForm, amount: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder={String(generateChallanTarget.salary)}
                />
              </Field>
              <Field label="Label (optional)" C={C}>
                <input
                  value={generateChallanForm.label}
                  onChange={(e) => setGenerateChallanForm({ ...generateChallanForm, label: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder="e.g. Salary, Advance"
                />
              </Field>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setGenerateChallanTarget(null)} disabled={generateChallanSaving} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button onClick={submitGenerateChallan} disabled={generateChallanSaving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                  {generateChallanSaving ? <Loader2 size={15} className="animate-spin inline" /> : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Challan Confirm */}
      {deleteChallanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Salary Challan?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove the salary challan. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteChallanTarget(null)} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={submitDeleteChallan} disabled={deleteChallanSaving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deleteChallanSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Payment Confirm */}
      {deletePaymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Payment?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove the payment entry and recalculate the challan status. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePaymentTarget(null)} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={submitDeletePayment} disabled={deletePaymentSaving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deletePaymentSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate/Activate confirm */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: deactivateTarget.active ? C.goldSoft : C.tealSoft }}>
                {deactivateTarget.active ? <UserX size={18} style={{ color: C.gold }} /> : <UserCheck size={18} style={{ color: C.teal }} />}
              </div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">
                {deactivateTarget.active ? "Deactivate Teacher?" : "Activate Teacher?"}
              </div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              {deactivateTarget.active
                ? <>Are you sure you want to deactivate <span style={{ color: C.textHi, fontWeight: 600 }}>{deactivateTarget.name}</span>? They will remain in the system but will be marked inactive.</>
                : <>Are you sure you want to activate <span style={{ color: C.textHi, fontWeight: 600 }}>{deactivateTarget.name}</span> again?</>}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeactivateTarget(null)} disabled={deactivating} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDeactivate} disabled={deactivating} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: deactivateTarget.active ? C.gold : C.teal, color: "#fff" }}>
                {deactivating ? (deactivateTarget.active ? "Deactivating…" : "Activating…") : (deactivateTarget.active ? "Deactivate" : "Activate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Teacher?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.name}</span> and their payment history. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-toast-in">
          <div className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm shadow-2xl" style={{ borderColor: toast.tone === "error" ? C.rose : C.teal, color: toast.tone === "error" ? C.rose : C.teal, background: C.panel }}>
            {toast.tone === "error" ? <AlertTriangle size={15} className="shrink-0" /> : <CheckCircle2 size={15} className="shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, C }) {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: C.textMid }}>{label}</label>
      {children}
    </div>
  );
}
