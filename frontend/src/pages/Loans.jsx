import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Plus, X, CheckCircle2, Clock3, Trash2, AlertTriangle, Eye, Building2, User as UserIcon,
  Loader2, History, Receipt, Pencil, Printer, CalendarRange,
} from "lucide-react";
import PageLoader from "../components/PageLoader.jsx";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { loansApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";

const pkr = (n) => "₨ " + Number(n || 0).toLocaleString("en-PK");
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyForm = { from: "", kind: "person", amount: "", contact: "" };
const emptyPaymentForm = { amount: "", note: "", date: todayStr() };

function getDateRange(filter) {
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
  return null; // "all"
}

const normalize = (doc) => ({
  id: doc._id,
  from: doc.from,
  kind: doc.kind,
  amount: doc.amount,
  left: doc.left,
  contact: doc.contact || "",
  status: doc.status,
  paymentHistory: doc.paymentHistory || [],
  createdAt: doc.createdAt,
});

const formatDate = (dateString, createdAt) => {
  if (!dateString) return "";
  const datePart = new Date(dateString).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  // createdAt is the real moment the payment was recorded (server timestamp).
  // The "date" field is just the calendar day the user picked (no time
  // input exists for it), so only createdAt can supply an accurate time.
  // Older payments recorded before this field existed won't have it — those
  // just show the date, with no fabricated time.
  if (!createdAt) return datePart;
  const timePart = new Date(createdAt).toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
};

export default function Loans() {
  const { C } = useTheme();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);

  // Loans Taken date filter
  const [dateFilter, setDateFilter] = useState("thisMonth");

  // Loans Returned — alag date filter
  const [returnFilter, setReturnFilter] = useState("thisMonth");

  // Add loan modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  // View modal
  const [viewTargetId, setViewTargetId] = useState(null);
  const viewTarget = viewTargetId ? loans.find((l) => l.id === viewTargetId) || null : null;

  // Record payment modal
  const [recordPaymentTarget, setRecordPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [paySaving, setPaySaving] = useState(false);

  // Delete confirmations
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
  const [deletePaymentSaving, setDeletePaymentSaving] = useState(false);

  const loadLoans = () =>
    loansApi
      .list()
      .then((docs) => setLoans(docs.map(normalize)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { loadLoans(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useHeaderActions(
    <button
      onClick={() => setModalOpen(true)}
      className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold shrink-0 transition-all active:scale-95"
      style={{ background: C.gold, color: "#fff" }}
    >
      <Plus size={16} /> <span className="hidden sm:inline">Add Loan</span>
    </button>,
    [C]
  );

  const filtered = useMemo(() => loans.filter((l) => l.from.toLowerCase().includes(query.toLowerCase())), [loans, query]);

  // Still Outstanding — always all loans, no filter
  const totalLeft = loans.reduce((s, l) => s + l.left, 0);

  // Loans Taken — apna filter
  const dateRange = getDateRange(dateFilter);
  const filteredByDate = dateRange
    ? loans.filter((l) => {
        const d = new Date(l.createdAt);
        return d >= dateRange[0] && d < dateRange[1];
      })
    : loans;
  const loansTakenInRange = filteredByDate.reduce((s, l) => s + l.amount, 0);

  // Loans Returned — alag apna filter. This filters on each PAYMENT's own
  // date, not the loan's createdAt — a loan taken last month but paid back
  // today must still count under "Today", which comparing createdAt could
  // never do (that only ever reflects when the loan itself was created).
  const returnRange = getDateRange(returnFilter);
  const loansReturnedInRange = loans.reduce((sum, l) => {
    const payments = l.paymentHistory || [];
    const inRange = returnRange
      ? payments.filter((p) => {
          const d = new Date(p.date);
          return d >= returnRange[0] && d < returnRange[1];
        })
      : payments;
    return sum + inRange.reduce((s, p) => s + p.amount, 0);
  }, 0);

  const showToast = (message, tone = "success") => setToast({ message, tone });

  const StatusBadge = ({ status }) => {
    const map = {
      paid: { label: "Fully Paid", icon: CheckCircle2, color: C.teal, soft: C.tealSoft },
      partial: { label: "Partially Paid", icon: Clock3, color: C.gold, soft: C.goldSoft },
      unpaid: { label: "Unpaid", icon: Clock3, color: C.rose, soft: C.roseSoft },
    };
    const m = map[status];
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: m.soft, color: m.color }}>
        <m.icon size={11} /> {m.label}
      </span>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from || !form.amount) return;
    setSaving(true);
    try {
      const doc = await loansApi.create({
        from: form.from,
        kind: form.kind,
        amount: Number(form.amount) || 0,
        left: Number(form.amount) || 0,
        contact: form.contact || "",
      });
      setLoans((prev) => [normalize(doc), ...prev]);
      setForm(emptyForm);
      setModalOpen(false);
      showToast("Loan added successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (l) => {
    setEditTarget(l);
    setEditForm({ from: l.from, kind: l.kind, amount: l.amount, contact: l.contact });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editForm.from || !editForm.amount) return;
    setEditSaving(true);
    try {
      const doc = await loansApi.update(editTarget.id, {
        from: editForm.from,
        kind: editForm.kind,
        amount: Number(editForm.amount),
        left: Number(editForm.amount),
        contact: editForm.contact || "",
      });
      setLoans((prev) => prev.map((l) => (l.id === editTarget.id ? normalize(doc) : l)));
      setEditTarget(null);
      setEditForm(emptyForm);
      showToast("Loan updated successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || !recordPaymentTarget) return;
    const payAmount = Number(paymentForm.amount);
    if (payAmount > recordPaymentTarget.left) {
      showToast(`Payment cannot exceed outstanding balance of ₨${recordPaymentTarget.left}`, "error");
      return;
    }
    setPaySaving(true);
    try {
      const doc = await loansApi.addPayment(recordPaymentTarget.id, {
        amount: payAmount,
        note: paymentForm.note,
        date: paymentForm.date,
      });
      setLoans((prev) => prev.map((l) => (l.id === doc._id ? normalize(doc) : l)));
      setRecordPaymentTarget(null);
      setPaymentForm(emptyPaymentForm);
      showToast("Payment recorded successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setPaySaving(false);
    }
  };

  const printPaymentReceipt = (loan, payment) => {
    const w = window.open("", "_blank", "width=800,height=650");
    if (!w) { showToast("Please allow pop-ups to print the receipt.", "error"); return; }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    const date = new Date(payment.date).toLocaleDateString("en-PK", {day:"2-digit",month:"long",year:"numeric"});
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Loan Payment Receipt</title><style>*{box-sizing:border-box}body{margin:0;background:#eef1f7;font-family:Inter,Arial,sans-serif;color:#182033;padding:28px 18px}.page{max-width:720px;margin:0 auto;background:#fff;padding:38px;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 18px 50px rgba(24,32,51,.10)}.head{border-bottom:3px solid #7c3aed;padding-bottom:14px;margin-bottom:24px;font-size:20px;font-weight:800;color:#7c3aed}table{width:100%;border-collapse:collapse}td{padding:12px 0;border-bottom:1px solid #edf0f5;font-size:14px}.lbl{color:#697386;width:160px}.amt{font-size:28px;font-weight:800;text-align:right;color:#0d9488;margin-top:26px}.print{position:fixed;top:16px;right:16px;border:0;background:#7c3aed;color:#fff;padding:9px 15px;border-radius:10px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.10)}@media (max-width:700px){body{padding:12px}.page{padding:24px;border-radius:14px}.head{align-items:flex-start}.lbl{width:38%}.amt{font-size:24px}.print{position:static;margin:0 0 12px auto;display:block}}@media print{body{background:#fff;padding:0}.page{margin:0;max-width:none;border:0;box-shadow:none;border-radius:0}.print{display:none}}</style></head><body><button class="print" onclick="window.print()">Print</button><div class="page"><div class="head">Infusible Coders — Loan Payment Receipt</div><table><tr><td class="lbl">Loan From</td><td>${safe(loan.from)}</td></tr><tr><td class="lbl">Type</td><td>${safe(loan.kind)}</td></tr><tr><td class="lbl">Payment Date</td><td>${date}</td></tr><tr><td class="lbl">Original Loan</td><td>${pkr(loan.amount)}</td></tr><tr><td class="lbl">Remaining</td><td>${pkr(loan.left)}</td></tr>${payment.note?`<tr><td class="lbl">Note</td><td>${safe(payment.note)}</td></tr>`:""}</table><div class="amt">${pkr(payment.amount)}</div></div></body></html>`);
    w.document.close(); setTimeout(()=>w.print(),300);
  };

  const handleDeletePayment = async () => {
    if (!deletePaymentTarget || !viewTarget) return;
    setDeletePaymentSaving(true);
    try {
      const doc = await loansApi.removePayment(viewTarget.id, deletePaymentTarget);
      setLoans((prev) => prev.map((l) => (l.id === doc._id ? normalize(doc) : l)));
      setDeletePaymentTarget(null);
      showToast("Payment deleted successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeletePaymentSaving(false);
    }
  };

  const handleDeleteLoan = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await loansApi.remove(deleteTarget.id);
      setLoans((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("Loan deleted successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="w-full min-h-screen pb-8" style={{ background: C.bg }}>

      {/* ── Stats ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* Still Outstanding — always all */}
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Still Outstanding</div>
            <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-2xl">{pkr(totalLeft)}</div>
          </div>

          {/* Loans Taken — apna alag filter */}
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Loans Taken</div>
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
            <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-2xl">{pkr(loansTakenInRange)}</div>
          </div>

          {/* Loans Returned — alag apna filter */}
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Loans Returned</div>
              <div className="flex gap-1">
                {["today", "thisMonth", "lastMonth", "all"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setReturnFilter(f)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ background: returnFilter === f ? C.gold : C.panelSoft, color: returnFilter === f ? "#fff" : C.textLow }}
                  >
                    {f === "today" ? "Today" : f === "thisMonth" ? "This Mo" : f === "lastMonth" ? "Last Mo" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-2xl">{pkr(loansReturnedInRange)}</div>
          </div>

        </div>
      </div>

      {/* ── Error ── */}
      {error && !loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4">
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.rose, color: C.rose, background: C.roseSoft }}>
            Couldn't reach the backend ({error}). Is the API running on :5000?
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.textLow }} />
          <input
            type="text"
            placeholder="Search by person or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            style={{ borderColor: C.line, color: C.textHi }}
          />
        </div>
      </div>

      {/* ── Loans List ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: C.textLow }}>No loans match this search.</div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="rounded-xl border-2 p-4 transition-all hover:shadow-md" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                <div className="p-3 rounded-lg shrink-0" style={{ background: C.tealSoft }}>
                  <div style={{ color: C.teal, fontWeight: 700 }} className="w-8 h-8 flex items-center justify-center text-xs">
                    {initials(l.from)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 style={{ ...fontDisplay, color: C.textHi, fontWeight: 600 }} className="text-base mb-1">{l.from}</h3>
                  <p className="text-xs mb-3" style={{ color: C.textLow }}>
                    {l.kind === "company"
                      ? <><Building2 size={11} className="inline mr-1" />Company</>
                      : <><UserIcon size={11} className="inline mr-1" />Person</>}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div style={{ color: C.textLow }}>Amount</div>
                      <div style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{pkr(l.amount)}</div>
                    </div>
                    <div>
                      <div style={{ color: C.textLow }}>Outstanding</div>
                      <div style={{ ...fontMono, color: l.left ? C.rose : C.teal, fontWeight: 600 }}>{pkr(l.left)}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-col items-center gap-1.5 shrink-0 w-full sm:w-auto">
                <StatusBadge status={l.status} />
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setViewTargetId(l.id)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.teal }}>
                    <Eye size={15} />
                  </button>
                  <button onClick={() => startEdit(l)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(l)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.rose }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Add Loan Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-5 py-4 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Add Loan</div>
              <button onClick={() => setModalOpen(false)} style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Field label="From (person / company) *" C={C}>
                <input required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Malik Traders" />
              </Field>
              <Field label="Type *" C={C}>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }}>
                  <option value="person" style={{ background: C.panel, color: C.textHi }}>Person</option>
                  <option value="company" style={{ background: C.panel, color: C.textHi }}>Company</option>
                </select>
              </Field>
              <Field label="Amount (₨) *" C={C}>
                <input required type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="300000" />
              </Field>
              <Field label="Contact Number (optional)" C={C}>
                <input type="tel" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. 03001234567" />
              </Field>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                  {saving ? <Loader2 size={15} className="animate-spin inline" /> : "Add Loan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Loan Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-5 py-4 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Edit Loan</div>
              <button onClick={() => setEditTarget(null)} style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={submitEdit} className="p-6 space-y-4">
              <Field label="From (person / company) *" C={C}>
                <input required value={editForm.from} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Malik Traders" />
              </Field>
              <Field label="Type *" C={C}>
                <select value={editForm.kind} onChange={(e) => setEditForm({ ...editForm, kind: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }}>
                  <option value="person" style={{ background: C.panel, color: C.textHi }}>Person</option>
                  <option value="company" style={{ background: C.panel, color: C.textHi }}>Company</option>
                </select>
              </Field>
              <Field label="Amount (₨) *" C={C}>
                <input required type="number" min="1" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="300000" />
              </Field>
              <Field label="Contact Number (optional)" C={C}>
                <input type="tel" value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. 03001234567" />
              </Field>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditTarget(null)} disabled={editSaving}
                  className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                  {editSaving ? <Loader2 size={15} className="animate-spin inline" /> : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Loan Modal ── */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm overflow-y-auto" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border my-8 sm:my-0 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between p-6 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div>
                <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">{viewTarget.from}</h2>
                <p className="text-xs" style={{ color: C.textLow }}>{viewTarget.kind === "company" ? "Company" : "Person"} • {pkr(viewTarget.amount)} taken</p>
                {viewTarget.contact && <p className="text-xs mt-1" style={{ color: C.textMid }}>📞 {viewTarget.contact}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewTargetId(null)} className="p-2 rounded-lg" style={{ color: C.textLow }}><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Amount</div>
                  <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-sm">{pkr(viewTarget.amount)}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Outstanding</div>
                  <div style={{ ...fontMono, color: viewTarget.left ? C.rose : C.teal, fontWeight: 700 }} className="text-sm">{pkr(viewTarget.left)}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Repaid</div>
                  <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-sm">{pkr(viewTarget.amount - viewTarget.left)}</div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>
                    <History size={13} /> Payment History
                  </div>
                  <button
                    onClick={() => { setRecordPaymentTarget(viewTarget); setPaymentForm(emptyPaymentForm); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: C.gold, color: "#fff" }}
                  >
                    <Plus size={12} className="inline mr-1" /> Add Payment
                  </button>
                </div>
                {viewTarget.paymentHistory && viewTarget.paymentHistory.length > 0 ? (
                  <div className="space-y-2">
                    {viewTarget.paymentHistory.map((payment, idx) => (
                      <div key={payment._id || idx} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: C.panelSoft, borderColor: C.line }}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div style={{ ...fontMono, color: C.teal, fontWeight: 600 }}>{pkr(payment.amount)}</div>
                            <div style={{ color: C.textLow }} className="text-xs">{formatDate(payment.date, payment.createdAt)}</div>
                          </div>
                          {payment.note && <div style={{ color: C.textMid }} className="text-xs">{payment.note}</div>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                        <button onClick={() => printPaymentReceipt(viewTarget, payment)} title="Print Receipt" className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ background: C.goldSoft, color: C.gold }}><Printer size={12} /></button>
                        <button onClick={() => setDeletePaymentTarget(payment._id || idx)}
                          className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ background: C.roseSoft, color: C.rose }}>
                          <Trash2 size={12} />
                        </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8" style={{ color: C.textLow }}>
                    <History size={24} className="mx-auto mb-2 opacity-30" />
                    <div className="text-sm">No payments recorded yet</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {recordPaymentTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-5 py-4 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Record Payment</div>
              <button onClick={() => setRecordPaymentTarget(null)} style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line, background: C.panelSoft }}>
                <div className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: C.textLow }}>Outstanding Balance</div>
                <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-lg">{pkr(recordPaymentTarget.left)}</div>
              </div>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <Field label="Payment Amount (₨) *" C={C}>
                  <input required type="number" min="1" max={recordPaymentTarget.left} value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }}
                    placeholder={`Max: ${recordPaymentTarget.left}`} />
                </Field>
                <Field label="Date" C={C}>
                  <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} />
                </Field>
                <Field label="Note (optional)" C={C}>
                  <textarea value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                    rows={3} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm resize-none"
                    style={{ borderColor: C.line, color: C.textHi }} placeholder="Any notes about this payment…" />
                </Field>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setRecordPaymentTarget(null)} disabled={paySaving}
                    className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                  <button type="submit" disabled={paySaving}
                    className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: "#fff" }}>
                    {paySaving ? <Loader2 size={15} className="animate-spin inline" /> : "Record Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Payment Confirm ── */}
      {deletePaymentTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Payment?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove the payment entry and recalculate the outstanding balance. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePaymentTarget(null)}
                className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={handleDeletePayment} disabled={deletePaymentSaving}
                className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deletePaymentSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Loan Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Loan?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              This will permanently remove <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.from}</span> and their payment history. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={handleDeleteLoan} disabled={deleting}
                className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-toast-in">
          <div className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm shadow-2xl"
            style={{ borderColor: toast.tone === "error" ? C.rose : C.teal, color: toast.tone === "error" ? C.rose : C.teal, background: C.panel }}>
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
