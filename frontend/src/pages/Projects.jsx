import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search, Plus, X, Briefcase, Sparkles, Loader2, Wallet, History,
  Pencil, Trash2, AlertTriangle, Eye, Receipt, Printer, CheckCircle2, XCircle, ChevronDown,
} from "lucide-react";
import PageLoader from "../components/PageLoader.jsx";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { projectsApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";

const pkr = (n) => "₨ " + Number(n || 0).toLocaleString("en-PK");

const emptyForm = { name: "", ownerName: "", totalCost: "", ownerPhone: "" };
const emptyGenerateChallanForm = { month: "", amount: "", label: "Maintenance" };

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
  ownerName: doc.ownerName,
  ownerPhone: doc.ownerPhone,
  totalCost: doc.totalCost,
  paid: doc.paid,
  paymentHistory: doc.paymentHistory || [],
  maintenanceChallans: doc.maintenanceChallans || [],
});

// Sum of all maintenance-challan amounts generated for a project (regardless of paid/pending)
const maintenanceChallanTotal = (p) =>
  (p.maintenanceChallans || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

// Date-range helper for the "Received" filter — same logic as Teachers' "Salary Paid" filter
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

const totalReceived = (p) => (p.paymentHistory || []).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

// How much of ONE specific maintenance challan is still unpaid
const remainingForChallan = (p, challan) => {
  const paid = (p.paymentHistory || [])
    .filter((x) => x.challanId && String(x.challanId) === String(challan._id))
    .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  return Math.max(0, challan.amount - paid);
};

// Pending maintenance = sum of maintenance challans that are NOT fully paid
const getPendingMaintenance = (p) =>
  (p.maintenanceChallans || []).reduce(
    (sum, c) => sum + (c.status !== "paid" ? remainingForChallan(p, c) : 0),
    0
  );

const getPendingContract = (p) => Math.max(0, (p.totalCost || 0) - (p.paid || 0));

// Total pending receivable for a project = unpaid contract balance + unpaid maintenance challans
const getTotalPending = (p) => getPendingContract(p) + getPendingMaintenance(p);

/*
 * Native <select> elements let the browser/OS control the opened option list,
 * so option hover/selected colors are not reliably styleable.
 * This custom select keeps the same form behavior but gives us full control
 * over the dropdown UI on every browser.
 */
function CustomSelect({
  value,
  onChange,
  options,
  C,
  placeholder = "Select...",
  className = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
        setHovered(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setHovered(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 text-left outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          color: C.textHi,
          background: "transparent",
        }}
      >
        <span className="truncate">
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: C.textLow }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] z-[9999] overflow-hidden rounded-2xl border-2 shadow-2xl"
          style={{
            width: "max-content",
            minWidth: "220px",
            maxWidth: "min(320px, calc(100vw - 24px))",
            background: C.panel,
            borderColor: C.line,
            boxShadow: `0 14px 35px ${C.mode === "dark" ? "rgba(0,0,0,.35)" : "rgba(15,23,42,.16)"}`,
          }}
        >
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((option) => {
              const isSelected = value === option.value;
              const isHovered = hovered === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHovered(option.value)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setHovered(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-all"
                  style={{
                    background: isSelected
                      ? C.gold
                      : isHovered
                        ? C.goldSoft
                        : "transparent",
                    color: isSelected
                      ? (C.mode === "dark" ? C.ink : "#fff")
                      : isHovered
                        ? C.gold
                        : C.textHi,
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <CheckCircle2 size={14} className="shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Projects() {
  const { C } = useTheme();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");

  // Date filter for "Received" stat
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  // Add-project modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  // View modal (Maintenance Challans + Payment History + Record Payment).
  // We only store the project's id here, and re-derive the actual object from
  // the live `projects` array below, so that once an action inside the modal
  // finishes and reloads `projects`, the modal immediately reflects fresh data.
  const [viewTargetId, setViewTargetId] = useState(null);
  const [detailTab, setDetailTab] = useState("challans");
  const viewTarget = viewTargetId ? projects.find((p) => p.id === viewTargetId) || null : null;

  // Generate Maintenance Challan Modal
  const [generateChallanTarget, setGenerateChallanTarget] = useState(null);
  const [generateChallanForm, setGenerateChallanForm] = useState(emptyGenerateChallanForm);
  const [generateChallanSaving, setGenerateChallanSaving] = useState(false);

  // Record Payment (inside view modal)
  const [selectedPayFor, setSelectedPayFor] = useState(""); // "" | "contract" | challan._id
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [paySaving, setPaySaving] = useState(false);

  // Delete confirmations
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteChallanTarget, setDeleteChallanTarget] = useState(null);
  const [deleteChallanSaving, setDeleteChallanSaving] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
  const [deletePaymentSaving, setDeletePaymentSaving] = useState(false);

  const loadProjects = () =>
    projectsApi
      .list()
      .then((docs) => setProjects(docs.map(normalize)))
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setLoading(false));

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Register this page's action button (Add Project) into the shared Layout header.
  useHeaderActions(
    <button
      onClick={() => setModalOpen(true)}
      className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold shrink-0 transition-all active:scale-95"
      style={{ background: C.gold, color: "#fff" }}
    >
      <Plus size={16} /> <span className="hidden sm:inline">Add Project</span>
    </button>,
    [C]
  );

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query]
  );

  // "Received" — ONLY this respects the date filter (mirrors Teachers' "Salary Paid")
  const received = useMemo(() => {
    const range = getDateRange(dateFilter, customFrom, customTo);
    let sum = 0;
    for (const p of projects) {
      for (const entry of p.paymentHistory || []) {
        if (!range) { sum += Number(entry.amount) || 0; continue; }
        const d = new Date(entry.date);
        if (d >= range[0] && d < range[1]) sum += Number(entry.amount) || 0;
      }
    }
    return sum;
  }, [projects, dateFilter, customFrom, customTo]);

  // Always all-time — contract value + everything generated as maintenance challans
  const totalValue = projects.reduce((s, p) => s + (p.totalCost || 0) + maintenanceChallanTotal(p), 0);
  const totalPending = projects.reduce((s, p) => s + getTotalPending(p), 0);

  // Form handlers
  const submitForm = () => {
    if (!form.name?.trim() || !form.ownerName?.trim() || !form.totalCost) {
      setToast({ message: "Please fill in all required fields", tone: "error" });
      return;
    }
    setSaving(true);
    projectsApi
      .create({
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone?.trim() || "",
        totalCost: Number(form.totalCost) || 0,
      })
      .then(() => {
        setToast({ message: "Project added successfully", tone: "success" });
        setModalOpen(false);
        setForm(emptyForm);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setSaving(false));
  };

  const startEdit = (p) => {
    setEditTarget(p);
    setEditForm({ name: p.name, ownerName: p.ownerName, totalCost: p.totalCost, ownerPhone: p.ownerPhone });
  };

  const submitEdit = () => {
    if (!editForm.name?.trim() || !editForm.ownerName?.trim() || !editForm.totalCost) {
      setToast({ message: "Please fill in all required fields", tone: "error" });
      return;
    }
    setEditSaving(true);
    projectsApi
      .update(editTarget.id, {
        name: editForm.name.trim(),
        ownerName: editForm.ownerName.trim(),
        ownerPhone: editForm.ownerPhone?.trim() || "",
        totalCost: Number(editForm.totalCost) || 0,
      })
      .then(() => {
        setToast({ message: "Project updated successfully", tone: "success" });
        setEditTarget(null);
        setEditForm(emptyForm);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setEditSaving(false));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    projectsApi
      .remove(deleteTarget.id)
      .then(() => {
        setToast({ message: "Project deleted", tone: "success" });
        setDeleteTarget(null);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeleting(false));
  };

  // Maintenance Challan Management
  const submitGenerateChallan = () => {
    if (!generateChallanForm.month || !generateChallanForm.amount) {
      setToast({ message: "Please fill in month and amount", tone: "error" });
      return;
    }
    setGenerateChallanSaving(true);
    projectsApi
      .generateChallan(generateChallanTarget.id, {
        month: generateChallanForm.month,
        amount: Number(generateChallanForm.amount),
        label: generateChallanForm.label || "Maintenance",
      })
      .then(() => {
        setToast({ message: "Maintenance challan generated", tone: "success" });
        setGenerateChallanTarget(null);
        setGenerateChallanForm(emptyGenerateChallanForm);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setGenerateChallanSaving(false));
  };

  const submitDeleteChallan = () => {
    if (!deleteChallanTarget) return;
    const { projectId, challanId } = deleteChallanTarget;
    setDeleteChallanSaving(true);
    projectsApi
      .deleteChallan(projectId, challanId)
      .then(() => {
        setToast({ message: "Maintenance challan deleted", tone: "success" });
        setDeleteChallanTarget(null);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeleteChallanSaving(false));
  };

  const submitDeletePayment = () => {
    if (!deletePaymentTarget) return;
    const { projectId, paymentId } = deletePaymentTarget;
    setDeletePaymentSaving(true);
    projectsApi
      .removePayment(projectId, paymentId)
      .then(() => {
        setToast({ message: "Payment deleted", tone: "success" });
        setDeletePaymentTarget(null);
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setDeletePaymentSaving(false));
  };

  // Payment Recording — either a general "Contract Payment" (against totalCost)
  // or a payment against a specific pending maintenance challan.
  const selectedChallan =
    selectedPayFor && selectedPayFor !== "contract"
      ? (viewTarget?.maintenanceChallans || []).find((c) => c._id === selectedPayFor)
      : null;

  // Choosing what to pay towards also auto-fills the amount with the remaining
  // balance for that option (student page does the same for challans).
  const selectPayFor = (val) => {
    setSelectedPayFor(val);
    if (!viewTarget) { setPayAmount(""); return; }
    if (val === "contract") {
      setPayAmount(String(getPendingContract(viewTarget)));
    } else {
      const c = (viewTarget.maintenanceChallans || []).find((ch) => ch._id === val);
      setPayAmount(c ? String(remainingForChallan(viewTarget, c)) : "");
    }
  };

  // Switching into the Record Payment tab auto-picks a default (contract first,
  // else the first pending challan) if nothing is selected yet — mirrors the
  // student page opening its payment form pre-filled.
  const handleTabClick = (key) => {
    setDetailTab(key);
    if (key === "payment" && viewTarget && !selectedPayFor) {
      if (getPendingContract(viewTarget) > 0) {
        selectPayFor("contract");
      } else {
        const c = (viewTarget.maintenanceChallans || []).find((ch) => ch.status !== "paid");
        if (c) selectPayFor(c._id);
      }
    }
  };

  const submitPayment = (e) => {
    e.preventDefault();
    if (!selectedPayFor || !payAmount) {
      setToast({ message: "Select what this payment is for and enter amount", tone: "error" });
      return;
    }
    setPaySaving(true);
    const body = { amount: Number(payAmount), date: payDate, note: payNote };
    if (selectedPayFor !== "contract") body.challanId = selectedPayFor;

    projectsApi
      .addPayment(viewTarget.id, body)
      .then(() => {
        setToast({ message: "Payment recorded", tone: "success" });
        setSelectedPayFor("");
        setPayAmount("");
        setPayNote("");
        setPayDate(todayStr());
        loadProjects();
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setPaySaving(false));
  };

  // Prints a single maintenance challan as a bill — same "open a blank tab, write
  // HTML, trigger print" pattern used for teachers' salary-challan bills, so both
  // modules produce the same look and use the same PAID/PARTIAL/PENDING breakdown.
  const printChallanBill = (project, challan) => {
    const w = window.open("", "_blank", "width=800,height=650");
    if (!w) {
      setToast({ message: "Please allow pop-ups to print the bill.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));

    const remaining = challan.status === "paid" ? 0 : remainingForChallan(project, challan);
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
  <title>Bill - ${safe(project.name)}</title>
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
      <tr><td class="lbl">Project</td><td>${safe(project.name)}</td></tr>
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

  // Prints a single payment as a receipt — same template as the teachers module.
  const printReceipt = (project, payment) => {
    const w = window.open("", "_blank", "width=800,height=650");
    if (!w) {
      setToast({ message: "Please allow pop-ups to print the receipt.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const dateStr = new Date(payment.date).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });
    const forLabel = payment.forMonth ? `Maintenance — ${payment.forMonth}` : "Contract Payment";

    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt - ${safe(project.name)}</title>
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
    <div class="brand">Infusible Coders — Payment Receipt</div>
    <table>
      <tr><td class="lbl">Project</td><td>${safe(project.name)}</td></tr>
      <tr><td class="lbl">For</td><td>${safe(forLabel)}</td></tr>
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
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>
              Total Contract Value <span className="normal-case font-normal tracking-normal" style={{ color: C.textLow, opacity: 0.75 }}>(includes maintenance)</span>
            </div>
            <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-2xl">{pkr(totalValue)}</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Pending Receivables</div>
            <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-2xl">{pkr(totalPending)}</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Received</div>
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
            <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-2xl">{pkr(received)}</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.textLow }} />
            <input
              type="text"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm"
              style={{ borderColor: C.line, color: C.textHi }}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 && <div className="col-span-full text-center py-12" style={{ color: C.textLow }}>No projects found.</div>}
        {filtered.map((p) => {
          const contractValue = (p.totalCost || 0) + maintenanceChallanTotal(p);
          const receivedAmt = totalReceived(p);
          const pct = contractValue ? Math.round((receivedAmt / contractValue) * 100) : 0;
          return (
            <div key={p.id} className="rounded-xl border-2 p-4 transition-all hover:shadow-md flex flex-col" style={{ borderColor: C.line, background: C.panel }}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg shrink-0" style={{ background: C.goldSoft }}>
                    <Briefcase size={16} style={{ color: C.gold }} />
                  </div>
                  <div className="min-w-0">
                    <h3 style={{ ...fontDisplay, color: C.textHi, fontWeight: 600 }} className="text-base truncate">{p.name}</h3>
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-lg" style={{ background: pct === 100 ? C.tealSoft : C.goldSoft, color: pct === 100 ? C.teal : C.gold }}>
                      {pct === 100 ? "Fully Paid" : `${pct}% paid`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-lg">{pkr(contractValue)}</span>
                <span className="text-xs" style={{ color: C.textLow }}>total</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: C.line }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? C.teal : C.gold }} />
              </div>
              <div className="flex items-center justify-between text-xs mb-3">
                <span style={{ color: C.textLow }}>{pkr(receivedAmt)} received</span>
                <span style={{ ...fontMono, color: getTotalPending(p) > 0 ? C.rose : C.teal, fontWeight: 600 }}>{pkr(getTotalPending(p))} pending</span>
              </div>

              {p.ownerName && (
                <div className="flex items-start gap-2 text-xs mb-3" style={{ color: C.textMid }}>
                  <Sparkles size={12} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{p.ownerName}{p.ownerPhone ? ` · ${p.ownerPhone}` : ""}</span>
                </div>
              )}

              <div className="flex justify-end gap-1.5 sm:gap-2 mt-auto pt-2">
                <button onClick={() => { setViewTargetId(p.id); setDetailTab("challans"); }} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Eye size={15} />
                </button>
                <button onClick={() => startEdit(p)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeleteTarget(p)} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.rose }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Project Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Add Project</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <Field label="Project name *" C={C}><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Restaurant POS System" /></Field>
              <Field label="Owner name *" C={C}><input required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Faisal Mehmood" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total cost (₨) *" C={C}><input required type="number" min="0" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="350000" /></Field>
                <Field label="Owner phone" C={C}><input value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="0300-1234567" /></Field>
              </div>
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

      {/* Edit Project Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6 max-h-[90vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Edit Project</h2>
              <button onClick={() => setEditTarget(null)} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <Field label="Project name *" C={C}><input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Restaurant POS System" /></Field>
              <Field label="Owner name *" C={C}><input required value={editForm.ownerName} onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total cost (₨) *" C={C}><input required type="number" min="0" value={editForm.totalCost} onChange={(e) => setEditForm({ ...editForm, totalCost: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
                <Field label="Owner phone" C={C}><input value={editForm.ownerPhone} onChange={(e) => setEditForm({ ...editForm, ownerPhone: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
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

      {/* View Project Modal */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-2xl rounded-2xl border-2 my-8" style={{ background: C.panel, borderColor: C.line }}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-2" style={{ borderColor: C.line }}>
              <div>
                <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">{viewTarget.name}</h2>
                <p className="text-xs" style={{ color: C.textLow }}>{pkr(viewTarget.totalCost)} contract value</p>
                {viewTarget.ownerName && (
                  <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
                    {viewTarget.ownerName}{viewTarget.ownerPhone ? ` · ${viewTarget.ownerPhone}` : ""}
                  </p>
                )}
              </div>
              <button onClick={() => { setViewTargetId(null); setSelectedPayFor(""); }} className="p-1 hover:bg-gray-200 rounded-lg"><X size={18} /></button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Total Cost</div>
                  <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-sm">{pkr(viewTarget.totalCost + maintenanceChallanTotal(viewTarget))}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Received</div>
                  <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-sm">{pkr(totalReceived(viewTarget))}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.rose, background: getTotalPending(viewTarget) > 0 ? C.roseSoft : "transparent" }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Pending</div>
                  <div style={{ ...fontMono, color: getTotalPending(viewTarget) > 0 ? C.rose : C.teal, fontWeight: 700 }} className="text-sm">{pkr(getTotalPending(viewTarget))}</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.panelSoft }}>
                {[
                  { key: "challans", label: "Maintenance", icon: Receipt },
                  { key: "history", label: "Payment History", icon: History },
                  { key: "payment", label: "Record Payment", icon: Wallet },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => handleTabClick(key)}
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

              {/* Maintenance Challans Tab */}
              {detailTab === "challans" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Receipt size={13} /> Maintenance Challans</div>
                    <button
                      onClick={() => {
                        setGenerateChallanTarget(viewTarget);
                        setGenerateChallanForm({ month: currentMonth(), amount: "", label: "Maintenance" });
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: C.gold, color: "#fff" }}
                    >
                      <Plus size={13} className="inline mr-1" /> Generate Challan
                    </button>
                  </div>
                  {(viewTarget.maintenanceChallans || []).length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No maintenance challans generated yet.</div>}
                  <div className="space-y-2">
                    {[...(viewTarget.maintenanceChallans || [])].sort((a, b) => new Date(b.generatedOn) - new Date(a.generatedOn)).map((c) => {
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
                            <button onClick={() => setDeleteChallanTarget({ projectId: viewTarget.id, challanId: c._id })} title="Delete Challan" className="p-1.5 rounded-lg" style={{ color: C.rose, background: C.roseSoft }}><Trash2 size={13} /></button>
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
                    {[...(viewTarget.paymentHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((entry) => {
                      const challan = entry.challanId
                        ? (viewTarget.maintenanceChallans || []).find((c) => String(c._id) === String(entry.challanId))
                        : null;
                      const forLabel = entry.challanId
                        ? `${challan ? challan.label : "Maintenance"} (${entry.forMonth || challan?.month || ""})`
                        : "Contract Payment";
                      return (
                        <div key={entry._id} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 gap-2" style={{ borderColor: C.line }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg shrink-0" style={{ background: C.tealSoft }}><Wallet size={14} style={{ color: C.teal }} /></div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold" style={{ ...fontMono, color: C.textHi }}>{pkr(entry.amount)}</div>
                              <div className="text-xs truncate" style={{ color: C.textLow }}>
                                {new Date(entry.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                                {" · "}{forLabel}
                                {entry.note ? ` · ${entry.note}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => printReceipt(viewTarget, entry)} title="Print Receipt" className="p-1.5 rounded-lg" style={{ color: C.gold, background: C.goldSoft }}><Printer size={13} /></button>
                            <button
                              onClick={() => setDeletePaymentTarget({ projectId: viewTarget.id, paymentId: entry._id })}
                              className="p-1.5 rounded-lg"
                              style={{ color: C.rose, background: C.roseSoft }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Record Payment Tab */}
              {detailTab === "payment" && (
                <div>
                  <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Wallet size={13} /> Record a Payment</div>

                    {getPendingContract(viewTarget) === 0 && (viewTarget.maintenanceChallans || []).filter((c) => c.status !== "paid").length === 0 ? (
                      <div className="text-sm py-6 text-center flex flex-col items-center gap-2" style={{ color: C.teal }}>
                        <CheckCircle2 size={22} /> Everything is cleared — nothing pending to receive.
                      </div>
                    ) : (
                      <form onSubmit={submitPayment} className="space-y-4">
                        <Field label="Pay towards" C={C}>
                          <div className="w-full border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line }}>
                            <CustomSelect
                              value={selectedPayFor}
                              onChange={selectPayFor}
                              C={C}
                              placeholder="Choose..."
                              options={[
                                ...(getPendingContract(viewTarget) > 0
                                  ? [{ value: "contract", label: `Contract Payment · ${pkr(getPendingContract(viewTarget))} pending` }]
                                  : []),
                                ...(viewTarget.maintenanceChallans || [])
                                  .filter((c) => c.status !== "paid")
                                  .map((c) => ({
                                    value: c._id,
                                    label: `${c.label} · ${c.month} · ${pkr(remainingForChallan(viewTarget, c))} pending`,
                                  })),
                              ]}
                            />
                          </div>
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Amount (₨)" C={C}>
                            <input
                              required
                              type="number"
                              min="1"
                              max={
                                selectedPayFor === "contract"
                                  ? getPendingContract(viewTarget)
                                  : selectedChallan
                                    ? remainingForChallan(viewTarget, selectedChallan)
                                    : undefined
                              }
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                              style={{ borderColor: C.line, color: C.textHi }}
                              placeholder="50000"
                            />
                          </Field>
                          <Field label="Date paid" C={C}><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
                        </div>
                        <Field label="Note (optional)" C={C}><input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. cash, bank transfer" /></Field>
                        <button type="submit" disabled={paySaving || !selectedPayFor} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                          {paySaving ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />} Record Payment
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generate Maintenance Challan Modal */}
      {generateChallanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ ...fontDisplay, color: C.textHi, fontWeight: 700 }} className="text-xl">Generate Maintenance Challan</h2>
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
                  placeholder="65000"
                />
              </Field>
              <Field label="Label (optional)" C={C}>
                <input
                  value={generateChallanForm.label}
                  onChange={(e) => setGenerateChallanForm({ ...generateChallanForm, label: e.target.value })}
                  className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm"
                  style={{ borderColor: C.line, color: C.textHi }}
                  placeholder="e.g. Maintenance, Hosting"
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
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Maintenance Challan?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove the maintenance challan. This can't be undone.</p>
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
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove the payment entry and recalculate pending balances. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePaymentTarget(null)} className="flex-1 rounded-xl py-3 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={submitDeletePayment} disabled={deletePaymentSaving} className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>
                {deletePaymentSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Project?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.name}</span> and its payment history. This can't be undone.</p>
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
