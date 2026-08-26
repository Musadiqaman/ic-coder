import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, X, ArrowDownRight, Calendar, Trash2, Receipt, Loader2, AlertTriangle, CheckCircle2, Pencil, CalendarRange } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { expensesApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";
import PageLoader from "../components/PageLoader.jsx";

const pkr = (n) => "₨ " + Number(n).toLocaleString("en-PK");

const emptyForm = { title: "", amount: "", description: "", date: "" };
const catColor = (title, C) => {
  const map = { rent: C.rose, bill: C.gold, market: C.teal, supp: C.teal, soft: C.gold };
  const key = Object.keys(map).find((k) => title.toLowerCase().includes(k));
  return map[key] || C.textMid;
};

const normalize = (doc) => ({
  id: doc._id,
  title: doc.title,
  amount: doc.amount,
  description: doc.description,
  date: doc.date ? doc.date.slice(0, 10) : "",
});

const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Date-range helper for the "Expenses" filter
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

export default function Expenses() {
  const { C } = useTheme();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);

  // Date filter for expenses stats
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const loadExpenses = () =>
    expensesApi
      .list()
      .then((docs) => setExpenses(docs.map(normalize)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadExpenses();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Register header button
  useHeaderActions(
    <button
      onClick={() => setModalOpen(true)}
      className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold shrink-0 transition-all active:scale-95"
      style={{ background: C.gold, color: "#fff" }}
    >
      <Plus size={16} /> <span className="hidden sm:inline">Add Expense</span>
    </button>,
    [C]
  );

  const filtered = useMemo(() => expenses.filter((e) =>
    e.title.toLowerCase().includes(query.toLowerCase()) || e.description.toLowerCase().includes(query.toLowerCase())
  ), [expenses, query]);

  const highest = [...expenses].sort((a, b) => b.amount - a.amount)[0];

  // Calculate date-filtered total
  const dateRange = getDateRange(dateFilter, customFrom, customTo);
  const filteredByDate = dateRange
    ? expenses.filter((e) => {
        const expDate = new Date(e.date + "T00:00:00");
        return expDate >= dateRange[0] && expDate < dateRange[1];
      })
    : expenses;
  const totalFiltered = filteredByDate.reduce((sum, e) => sum + e.amount, 0);

  const showToast = (message, tone = "success") => {
    setToast({ message, tone });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.amount) return;
    setSaving(true);
    try {
      const doc = await expensesApi.create({
        title: form.title,
        amount: Number(form.amount) || 0,
        description: form.description,
        date: form.date || todayStr(),
      });
      setExpenses((prev) => [normalize(doc), ...prev]);
      setForm(emptyForm);
      setModalOpen(false);
      showToast("Expense added successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (e) => {
    setEditTarget(e);
    setEditForm({ title: e.title, amount: e.amount, description: e.description, date: e.date });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editForm.title || !editForm.amount) return;
    setEditSaving(true);
    try {
      const doc = await expensesApi.update(editTarget.id, {
        title: editForm.title,
        amount: Number(editForm.amount),
        description: editForm.description,
        date: editForm.date || todayStr(),
      });
      setExpenses((prev) => prev.map((ex) => (ex.id === editTarget.id ? normalize(doc) : ex)));
      setEditTarget(null);
      setEditForm(emptyForm);
      showToast("Expense updated successfully");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setDeleting(true);
    try {
      await expensesApi.remove(deleteTarget.id);
      setExpenses((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("Expense deleted successfully");
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
      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Total Expenses</div>
              <div className="flex gap-1">
                {["today", "thisMonth", "lastMonth", "all"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ background: dateFilter === f ? C.rose : C.panelSoft, color: dateFilter === f ? "#fff" : C.textLow }}
                  >
                    {f === "today" ? "Today" : f === "thisMonth" ? "This Mo" : f === "lastMonth" ? "Last Mo" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-2xl">{pkr(totalFiltered)}</div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4">
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.rose, color: C.rose, background: C.roseSoft }}>
            Couldn't reach the backend ({error}). Is the API running on :5000?
          </div>
        </div>
      )}

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.textLow }} />
          <input
            type="text"
            placeholder="Search expenses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            style={{ borderColor: C.line, color: C.textHi }}
          />
        </div>
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: C.textLow }}>
            No expenses match this search.
          </div>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="rounded-xl border-2 p-4 transition-all hover:shadow-md" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                <div className="p-3 rounded-lg shrink-0" style={{ background: C.roseSoft }}>
                  <Receipt size={18} style={{ color: catColor(e.title, C) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 style={{ ...fontDisplay, color: C.textHi, fontWeight: 600 }} className="text-base mb-1">
                    {e.title}
                  </h3>
                  <p className="text-xs mb-2" style={{ color: C.textLow }}>{e.description || "—"}</p>
                  <div className="flex items-center gap-2 text-xs" style={{ color: C.textLow }}>
                    <Calendar size={12} /> {e.date}
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-end gap-2 shrink-0 w-full sm:w-auto">
                <div className="text-right">
                  <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-lg">
                    −{pkr(e.amount)}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => startEdit(e)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(e)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.rose }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 600, color: C.textHi }} className="text-lg">Add Expense</div>
              <button onClick={() => setModalOpen(false)} style={{ color: C.textLow }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <Field label="Title *" C={C}><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-transparent border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Office Rent" /></Field>
              <Field label="Amount (₨) *" C={C}><input required type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full bg-transparent border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="45000" /></Field>
              <Field label="Description" C={C}><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-transparent border rounded-lg px-3 py-2.5 text-sm resize-none" style={{ borderColor: C.line, color: C.textHi }} placeholder="Short note…" /></Field>
              <Field label="Date" C={C}><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full bg-transparent border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg py-2.5 text-sm border" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg py-2.5 text-sm font-medium disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>{saving ? "Saving…" : "Save Expense"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-2 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-5 py-4 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Edit Expense</div>
              <button onClick={() => setEditTarget(null)} style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={submitEdit} className="p-6 space-y-4">
              <Field label="Title *" C={C}>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder="Office Rent"
                />
              </Field>
              <Field label="Amount (₨) *" C={C}>
                <input
                  required
                  type="number"
                  min="1"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder="45000"
                />
              </Field>
              <Field label="Description" C={C}>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm resize-none"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder="Short note…"
                />
              </Field>
              <Field label="Date" C={C}>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                />
              </Field>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  disabled={editSaving}
                  className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all"
                  style={{ borderColor: C.line, color: C.textMid }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60"
                  style={{ background: C.gold, color: "#fff" }}
                >
                  {editSaving ? "Updating…" : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Expense?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              This will permanently remove <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.title}</span> ({pkr(deleteTarget.amount)}). This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all"
                style={{ borderColor: C.line, color: C.textMid }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60"
                style={{ background: C.rose, color: "#fff" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
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
