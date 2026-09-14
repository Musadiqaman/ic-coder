import React, { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Pencil, Trash2, X, Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { batchesApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";

const emptyForm = { name: "", description: "" };

export default function Batches() {
  const { C } = useTheme();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const docs = await batchesApi.list();
      setBatches(Array.isArray(docs) ? docs : []);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBatches(); }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (batch) => {
    setEditTarget(batch);
    setForm({ name: batch.name || "", description: batch.description || "" });
    setFormOpen(true);
  };

  const closeForm = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormOpen(false);
  };

  const saveBatch = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setToast({ message: "Batch name is required", tone: "error" });
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const updated = await batchesApi.update(editTarget._id, {
          name,
          description: form.description,
        });
        setBatches((prev) => prev.map((b) => b._id === updated._id ? updated : b));
        setToast({ message: `Batch "${updated.name}" updated successfully.`, tone: "success" });
      } else {
        const duplicate = batches.some((b) => b.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
          setToast({ message: `Batch "${name}" already exists`, tone: "error" });
          setSaving(false);
          return;
        }
        const created = await batchesApi.create({ name, description: form.description });
        setBatches((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setToast({ message: `Batch "${created.name}" created successfully.`, tone: "success" });
      }
      closeForm();
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await batchesApi.remove(deleteTarget._id);
      setBatches((prev) => prev.filter((b) => b._id !== deleteTarget._id));
      setDeleteTarget(null);
      setToast({ message: `Batch "${deleteTarget.name}" deleted. Students assigned to it are left without a batch.`, tone: "success" });
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  useHeaderActions(
    <button
      onClick={openCreate}
      className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-95"
      style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}
    >
      <Plus size={16} />
      <span className="hidden sm:inline">Add Batch</span>
    </button>,
    [C]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return batches.filter((b) =>
      !q ||
      (b.name || "").toLowerCase().includes(q) ||
      (b.description || "").toLowerCase().includes(q)
    );
  }, [batches, query]);

  return (
    <div className="min-h-screen py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-6">
        
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 flex-1" style={{ borderColor: C.line, background: C.panel }}>
            <Search size={16} style={{ color: C.textLow }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search batches..."
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: C.textHi }}
            />
          </div>
          <div className="rounded-xl border-2 px-4 py-2.5 text-sm" style={{ borderColor: C.line, background: C.panel, color: C.textMid }}>
            <span style={{ ...fontMono, color: C.textHi, fontWeight: 700 }}>{batches.length}</span> {batches.length === 1 ? "batch" : "batches"}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: C.textMid }}>
            <Loader2 size={17} className="animate-spin" /> Loading batches…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 p-12 text-center" style={{ borderColor: C.line, background: C.panel }}>
            <Layers size={28} className="mx-auto mb-3" style={{ color: C.textLow }} />
            <div className="text-sm font-semibold" style={{ color: C.textHi }}>
              {batches.length ? "No matching batches" : "No batches created yet"}
            </div>
            <div className="text-xs mt-1" style={{ color: C.textLow }}>
              {batches.length ? "Try a different search." : "Use Add Batch to create the first one."}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((batch) => (
              <div
                key={batch._id}
                className="rounded-2xl border-2 p-4 sm:p-5 transition-all"
                style={{ borderColor: C.line, background: C.panel }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="p-3 rounded-xl shrink-0 self-start" style={{ background: C.goldSoft }}>
                    <Layers size={20} style={{ color: C.gold }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-semibold capitalize" style={{ ...fontDisplay, color: C.textHi }}>
                        {batch.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: C.tealSoft, color: C.teal }}>
                        <CheckCircle2 size={11} /> Active
                      </span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: batch.description ? C.textMid : C.textLow }}>
                      {batch.description || "No description added."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(batch)}
                      title="Edit batch"
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold border-2 transition-all hover:scale-[1.02]"
                      style={{ borderColor: C.line, background: C.panelSoft, color: C.gold }}
                    >
                      <Pencil size={14} /> <span>Edit</span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(batch)}
                      title="Delete batch"
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold border-2 transition-all hover:scale-[1.02]"
                      style={{ borderColor: C.rose + "55", background: C.roseSoft, color: C.rose }}
                    >
                      <Trash2 size={14} /> <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-md rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg" style={{ background: C.tealSoft }}>
                  <Layers size={18} style={{ color: C.teal }} />
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ ...fontDisplay, color: C.textHi }}>
                    {editTarget ? "Edit Batch" : "Create New Batch"}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: C.textLow }}>
                    {editTarget ? "Update the batch details." : "Add a new batch for students."}
                  </div>
                </div>
              </div>
              <button onClick={closeForm} className="p-1 rounded-lg" style={{ color: C.textLow }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveBatch} className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: C.textMid }}>Batch name</label>
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Batch 2026-A"
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: C.textMid }}>Description <span style={{ color: C.textLow }}>(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Optional notes about this batch"
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm resize-none"
                  style={{ borderColor: C.line, color: C.textHi }}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeForm} disabled={saving} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving || !form.name.trim()} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? "Saving…" : editTarget ? "Save Changes" : "Create Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}>
                <AlertTriangle size={18} style={{ color: C.rose }} />
              </div>
              <div className="text-lg font-bold" style={{ ...fontDisplay, color: C.textHi }}>Delete Batch?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              Delete <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.name}</span>? Students assigned to this batch will remain, but their batch will be cleared. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deleting && <Loader2 size={15} className="animate-spin" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-auto">
          <div className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm shadow-2xl" style={{ borderColor: toast.tone === "error" ? C.rose : C.teal, color: toast.tone === "error" ? C.rose : C.teal, background: C.panel }}>
            {toast.tone === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
