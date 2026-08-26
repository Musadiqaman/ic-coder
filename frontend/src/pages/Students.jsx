import React, { lazy, Suspense, useState, useMemo, useEffect, useRef } from "react";
import {
  Search, Plus, X, GraduationCap, Filter, Mail, CheckCircle2, XCircle,
  Eye, Loader2, Wallet, History, Pencil, Trash2, Clock, AlertTriangle, ScanFace, Receipt,
  UserX, UserCheck, CalendarCheck, Award, Printer, Phone, CalendarRange, CalendarOff, Trash, ChevronDown,
  Fingerprint, Layers, FilePlus2, RefreshCw,
} from "lucide-react";
import PageLoader from "../components/PageLoader.jsx";
import { useTheme, fontDisplay, fontMono } from "../theme.jsx";
import { studentsApi, attendanceScheduleApi, batchesApi } from "../api/resources.js";
import { useHeaderActions } from "../context/HeaderActionsContext.jsx";

const FaceCapture = lazy(() => import("../components/FaceCapture.jsx"));

const pkr = (n) => "₨ " + Number(n || 0).toLocaleString("en-PK");
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyForm = { name: "", email: "", phone: "", type: "paid", course: "", duration: "", batch: "", joined: "", regFee: "", monthlyFee: "", timing: "9 AM – 5 PM · Mon–Fri", faceDescriptor: null, studentPic: "", fingerprintId: "" };
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

// Generates a mock device-assigned fingerprint template ID for the "Enroll
// Fingerprint" button. Real fingerprint scanners assign their own opaque
// template ID on enrollment — this stands in for that hardware step so the
// matching/attendance flow can be wired up and tested without a physical
// device attached.
const genFingerprintId = () => "FP-" + Math.random().toString(36).slice(2, 10).toUpperCase();

// Local calendar date (NOT toISOString, which is UTC and can be off by a
// day for PKT users between 12:00 AM–4:59 AM). Uses the browser's own local
// time, which for users in Pakistan is already PKT.
const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Backend doc (courseType/courseName/joiningDate/...) -> flat shape this page's JSX expects.
const normalize = (doc) => ({
  id: doc._id,
  name: doc.name,
  email: doc.email,
  phone: doc.phone || "",
  type: doc.courseType,
  course: doc.courseName,
  duration: doc.duration,
  batch: doc.batch || "",
  joined: doc.joiningDate ? String(doc.joiningDate).slice(0, 10) : "",
  regFee: doc.registrationFee,
  monthlyFee: doc.monthlyFee,
  attendance: doc.attendancePercent,
  attendanceHistory: doc.attendanceHistory || [],
  payment: doc.paymentStatus,
  timing: doc.timing,
  paymentHistory: doc.paymentHistory || [],
  challans: doc.challans || [],
  faceDescriptor: doc.faceDescriptor || null,
  faceEnrolled: Boolean(doc.faceEnrolled || doc.faceDescriptor?.length),
  studentPic: doc.studentPic || "",
  fingerprintId: doc.fingerprintId || "",
  active: doc.active !== false,
});

// Keep the main list lightweight even when a mutation endpoint returns a full
// student document containing a photo and long attendance history.
const normalizeList = (doc) => ({
  ...normalize(doc),
  attendanceHistory: [],
  studentPic: "",
});

const toFormShape = (s) => ({
  name: s.name, email: s.email, phone: s.phone || "", type: s.type, course: s.course, duration: s.duration,
  batch: s.batch || "",
  joined: s.joined, regFee: s.regFee ?? "", monthlyFee: s.monthlyFee ?? "", timing: s.timing,
  faceDescriptor: s.faceDescriptor || null, faceEnrolled: Boolean(s.faceEnrolled || s.faceDescriptor?.length), studentPic: s.studentPic || "",
  fingerprintId: s.fingerprintId || "",
});

// Total paid so far, across all challans (for the "Paid" summary figure in View modal).
const totalPaid = (s) => (s.paymentHistory || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

// Pending dues = sum of challans that are not yet fully paid. This reads
// directly off the backend's per-challan status instead of guessing from
// regFee/monthlyFee, which is what previously showed 0 incorrectly.
const getPendingDues = (s) => {
  if (s.type === "free") return 0;
  return (s.challans || []).reduce(
    (sum, c) => sum + (c.status !== "paid" ? remainingForChallan(s, c) : 0),
    0
  );
};

// How much of ONE specific challan is still unpaid (used to cap/prefill the payment form).
const remainingForChallan = (s, challan) => {
  const paid = (s.paymentHistory || [])
    .filter((p) => p.challanId && String(p.challanId) === String(challan._id))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Math.max(0, challan.amount - paid);
};

// Date-range helpers for the "Fees Received" filter.
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
  return null; // "all" — no filtering
}


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

export default function Students() {
  const { C } = useTheme();
  const COURSE_TYPES = [
    { key: "workspace", label: "Workspace", color: C.teal, soft: C.tealSoft },
    { key: "paid", label: "Paid Internship", color: C.gold, soft: C.goldSoft },
    { key: "free", label: "Free Internship", color: C.rose, soft: C.roseSoft },
  ];

  // Shared status -> color mapping for attendance badges everywhere on this
  // page. "leave" (weekly off / holiday) is neutral, not a fault.
  const attendanceColor = (status) => {
    if (status === "present") return { color: C.teal, soft: C.tealSoft };
    if (status === "late") return { color: C.gold, soft: C.goldSoft };
    if (status === "leave") return { color: C.textMid, soft: C.panelSoft };
    return { color: C.rose, soft: C.roseSoft }; // absent
  };

  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null); // { message, tone: "success" | "error" }
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");

  // Date filter — affects ONLY the "Fees Received" stat card. Pending dues
  // and total student counts always stay all-time.
  // Defaults to "This Month" (instead of "All Time") so the card lands on
  // the number owners actually check first thing.
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  // Add-student modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // View modal (challans + payment history, read-only)
  const [viewTarget, setViewTarget] = useState(null);
  const [detailTab, setDetailTab] = useState("challans");
  const [detailLoading, setDetailLoading] = useState(false);

  // Manual attendance — now backed entirely by the server (attendanceHistory),
  // no localStorage.
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [attendanceNote, setAttendanceNote] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceMethod, setAttendanceMethod] = useState("manual"); // "manual" | "fingerprint" — how this entry was captured

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  // Payment (add + history) modal — payments are now tied to a specific challan
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [selectedChallanId, setSelectedChallanId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [paySaving, setPaySaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Delete a single fee challan
  const [deleteChallanTarget, setDeleteChallanTarget] = useState(null); // { student, challan }
  const [deletingChallan, setDeletingChallan] = useState(false);

  // Manually generate ONE fee challan for a student (separate from the
  // automatic monthly generation) — "manual chalan generation".
  const [challanTarget, setChallanTarget] = useState(null);
  const [challanForm, setChallanForm] = useState({ label: "Monthly Fee", month: todayStr().slice(0, 7), amount: "" });
  const [challanSaving, setChallanSaving] = useState(false);

  // Delete a single payment history entry
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null); // { student, payment }
  const [deletingPayment, setDeletingPayment] = useState(false);

  // Create new batch modal
  const [createBatchModal, setCreateBatchModal] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Deactivate/activate confirmation modal
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  // Leave Calendar — per course-type weekly off days + specific holidays,
  // used by the backend to auto-mark "leave" vs "absent".
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveTypeTab, setLeaveTypeTab] = useState("workspace");
  const [schedules, setSchedules] = useState({}); // { workspace: {weeklyOffDays, holidays}, ... }
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState(todayStr());
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [runningAuto, setRunningAuto] = useState(false);

  const openLeaveCalendar = () => {
    setLeaveModalOpen(true);
    setLeaveTypeTab("workspace");
    setScheduleLoading(true);
    attendanceScheduleApi
      .listAll()
      .then((list) => {
        const byType = Object.fromEntries(list.map((s) => [s.courseType, s]));
        setSchedules(byType);
      })
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setScheduleLoading(false));
  };

  const toggleWeeklyOff = (day) => {
    setSchedules((prev) => {
      const cur = prev[leaveTypeTab] || { weeklyOffDays: [], holidays: [] };
      const has = cur.weeklyOffDays.includes(day);
      const weeklyOffDays = has ? cur.weeklyOffDays.filter((d) => d !== day) : [...cur.weeklyOffDays, day];
      return { ...prev, [leaveTypeTab]: { ...cur, weeklyOffDays } };
    });
  };

  // Adds a holiday immediately to the backend (POST), not just local state —
  // this is the fix for "holiday add karne par database mein save nahi hota".
  const addHoliday = async () => {
    if (!newHolidayDate) return;
    setScheduleSaving(true);
    try {
      const updated = await attendanceScheduleApi.addHoliday(leaveTypeTab, {
        date: newHolidayDate,
        label: newHolidayLabel.trim() || "Holiday",
      });
      setSchedules((prev) => ({ ...prev, [leaveTypeTab]: updated }));
      setNewHolidayLabel("");
      setToast({ message: "Holiday added.", tone: "success" });
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setScheduleSaving(false);
    }
  };

  // Deletes a holiday immediately from the backend (DELETE by _id), not just
  // local state — this is the fix for "delete se database se nahi hat raha".
  const removeHoliday = async (holidayId) => {
    setScheduleSaving(true);
    try {
      const updated = await attendanceScheduleApi.removeHoliday(leaveTypeTab, holidayId);
      setSchedules((prev) => ({ ...prev, [leaveTypeTab]: updated }));
      setToast({ message: "Holiday deleted.", tone: "success" });
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setScheduleSaving(false);
    }
  };

  // Now only responsible for saving weeklyOffDays (holidays save themselves
  // immediately via addHoliday/removeHoliday above).
  const saveSchedule = async () => {
    const cur = schedules[leaveTypeTab] || { weeklyOffDays: [], holidays: [] };
    setScheduleSaving(true);
    try {
      const updated = await attendanceScheduleApi.update(leaveTypeTab, {
        weeklyOffDays: cur.weeklyOffDays,
        holidays: cur.holidays,
      });
      setSchedules((prev) => ({ ...prev, [leaveTypeTab]: updated }));
      setToast({ message: `Leave calendar saved for ${COURSE_TYPES.find((t) => t.key === leaveTypeTab)?.label}.`, tone: "success" });
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setScheduleSaving(false);
    }
  };

  const runAutoAttendanceToday = async () => {
    setRunningAuto(true);
    try {
      const res = await studentsApi.runAutoAttendance();
      setToast({ message: res.message, tone: "success" });
      loadStudents();
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setRunningAuto(false);
    }
  };

  const loadStudents = () => {
    setLoading(true);

    // Render the students as soon as their request completes. Batch options
    // are auxiliary UI data and must not block the whole page behind them.
    studentsApi.list()
      .then((docs) => setStudents(docs.map(normalizeList)))
      .catch((err) => setToast({ message: err.message, tone: "error" }))
      .finally(() => setLoading(false));

    batchesApi.list()
      .then((batchList) => setBatches(batchList))
      .catch((err) => setToast({ message: err.message, tone: "error" }));
  };

  useEffect(() => { loadStudents(); }, []);

  const fetchStudentDetail = async (student) => {
    setDetailLoading(true);
    try {
      return normalize(await studentsApi.get(student.id));
    } finally {
      setDetailLoading(false);
    }
  };

  const openStudentView = async (student) => {
    setViewTarget(student);
    setDetailTab("challans");
    try {
      setViewTarget(await fetchStudentDetail(student));
    } catch (err) {
      setViewTarget(null);
      setToast({ message: err.message, tone: "error" });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Register this page's action buttons (Leave Calendar + Add Student) into
  // the shared Layout header. Re-registers whenever C (theme) or
  // activeStudentsCount-dependent handlers change identity; auto-clears on
  // unmount so leaving this page doesn't leave stale buttons in the header.
  // Both buttons collapse to icon-only on mobile (< sm) so two buttons don't
  // crowd the page title out; full label appears from `sm` breakpoint up.
  useHeaderActions(
    <>
      <button onClick={openLeaveCalendar} className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>
        <CalendarOff size={16} /> <span className="hidden sm:inline">Leave Calendar</span>
      </button>
      <button onClick={() => { setForm(emptyForm); setModalOpen(true); }} className="flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-95" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
        <Plus size={16} /> <span className="hidden sm:inline">Add Student</span>
      </button>
    </>,
    [C]
  );

  // Unique batch names across all students, for the batch filter dropdown.
  const batchOptions = useMemo(() => {
    const set = new Set(students.map((s) => (s.batch || "").trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => students.filter((s) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.course || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q);
    const matchesType = typeFilter === "all" || s.type === typeFilter;
    const matchesBatch = batchFilter === "all" || (s.batch || "").trim() === batchFilter;
    return matchesQuery && matchesType && matchesBatch;
  }), [students, query, typeFilter, batchFilter]);

  const counts = COURSE_TYPES.map((t) => ({ ...t, count: students.filter((s) => s.type === t.key).length }));

  // "Fees Received" — the ONLY stat that respects the date filter.
  const feesReceived = useMemo(() => {
    const range = getDateRange(dateFilter, customFrom, customTo);
    let sum = 0;
    for (const s of students) {
      for (const p of s.paymentHistory || []) {
        if (!range) { sum += Number(p.amount) || 0; continue; }
        const d = new Date(p.date);
        if (d >= range[0] && d < range[1]) sum += Number(p.amount) || 0;
      }
    }
    return sum;
  }, [students, dateFilter, customFrom, customTo]);

  // Always all-time, never affected by the date filter. Both derived
  // directly from each student's challans — the same source PendingDuesBadge
  // uses per row — instead of the backend's paymentStatus field, which can
  // go stale (e.g. a student created before this logic existed, or edited in
  // a way that never recomputed it).
  const duePaymentsCount = students.filter((s) => getPendingDues(s) > 0).length;
  const totalPendingAmount = students.reduce((sum, s) => sum + getPendingDues(s), 0);
  const totalStudentsCount = students.length;
  const activeStudentsCount = students.filter((s) => s.active).length;

  const TypeBadge = ({ type }) => {
    const t = COURSE_TYPES.find((c) => c.key === type);
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none" style={{ background: t.soft, color: t.color }}>{t.label}</span>;
  };

  const PendingDuesBadge = ({ s }) => {
    if (s.type === "free") {
      return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none" style={{ background: C.panelSoft, color: C.textLow }}><CheckCircle2 size={11} /> Free</span>;
    }
    const dues = getPendingDues(s);
    if (dues <= 0) {
      return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none" style={{ background: C.tealSoft, color: C.teal }}><CheckCircle2 size={11} /> Cleared</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none" style={{ ...fontMono, background: C.roseSoft, color: C.rose }}><XCircle size={11} /> {pkr(dues)}</span>;
  };

  const AttendanceBar = ({ value }) => {
    const v = Number(value) || 0;
    const color = v >= 85 ? C.teal : v >= 70 ? C.gold : C.rose;
    return (
      <div className="flex items-center gap-2 w-24">
        <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: C.line }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, v))}%`, background: color }} />
        </div>
        <span style={{ ...fontMono, fontSize: "11px", color: C.textMid }}>{v}%</span>
      </div>
    );
  };

  const createNewBatch = async () => {
    if (!newBatchName.trim()) {
      setToast({ message: "Batch name is required", tone: "error" });
      return;
    }

    // Real-time duplicate check BEFORE sending to backend
    const isDuplicate = batches.some((b) => b.name.toLowerCase() === newBatchName.trim().toLowerCase());
    if (isDuplicate) {
      setToast({ message: `Batch "${newBatchName.trim()}" already exists`, tone: "error" });
      return;
    }

    setCreatingBatch(true);
    try {
      const newBatch = await batchesApi.create({ name: newBatchName.trim() });
      setBatches((prev) => [...prev, newBatch].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, batch: newBatch.name }));
      setNewBatchName(""); // Clear input
      setCreateBatchModal(false); // Close modal
      setToast({ message: `Batch "${newBatch.name}" created successfully!`, tone: "success" });
    } catch (err) {
      // Handle backend errors (in case of race condition)
      if (err.message.includes("already exists")) {
        setToast({ message: `Batch name already exists`, tone: "error" });
      } else {
        setToast({ message: err.message, tone: "error" });
      }
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() ||
        !form.type || !form.course.trim() || !form.joined) {
      setToast({ message: "Please fill all required student fields.", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const doc = await studentsApi.create({
        name: form.name,
        email: form.email,
        phone: form.phone,
        courseType: form.type,
        courseName: form.course,
        duration: form.duration,
        batch: form.batch || "",
        joiningDate: form.joined || todayStr(),
        registrationFee: Number(form.regFee) || 0,
        monthlyFee: Number(form.monthlyFee) || 0,
        timing: form.timing,
        faceDescriptor: form.faceDescriptor || undefined,
        studentPic: form.studentPic || "",
        fingerprintId: form.fingerprintId || undefined,
      });
      setStudents((prev) => [normalizeList(doc), ...prev]);
      setForm(emptyForm);
      setModalOpen(false);
    } catch (err) {
      // Surfaces duplicate-email / duplicate-phone / duplicate-face messages from the backend.
      setToast({ message: err.message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (s) => {
    try {
      const full = await fetchStudentDetail(s);
      setEditTarget(full);
      setEditForm(toFormShape(full));
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    }
  };
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const doc = await studentsApi.update(editTarget.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        courseType: editForm.type,
        courseName: editForm.course,
        duration: editForm.duration,
        batch: editForm.batch || "",
        joiningDate: editForm.joined,
        registrationFee: Number(editForm.regFee) || 0,
        monthlyFee: Number(editForm.monthlyFee) || 0,
        timing: editForm.timing,
        faceDescriptor: editForm.faceDescriptor || undefined,
        studentPic: editForm.studentPic || "",
        fingerprintId: editForm.fingerprintId || undefined,
      });
      setStudents((prev) => prev.map((s) => (s.id === doc._id ? normalizeList(doc) : s)));
      setEditTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await studentsApi.remove(deleteTarget.id);
      setStudents((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  // Deletes a single fee challan. Server refuses this if a payment already
  // exists against the challan — the toast surfaces that message so the
  // user knows to remove the payment first.
  const confirmDeleteChallan = async () => {
    if (!deleteChallanTarget) return;
    setDeletingChallan(true);
    try {
      const doc = await studentsApi.removeChallan(deleteChallanTarget.student.id, deleteChallanTarget.challan._id);
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      if (viewTarget?.id === updated.id) setViewTarget(updated);
      if (paymentTarget?.id === updated.id) setPaymentTarget(updated);
      setToast({ message: "Challan deleted.", tone: "success" });
      setDeleteChallanTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setDeletingChallan(false);
    }
  };

  // Opens the "Generate Chalan" modal for one student, pre-filled with this month.
  const openChallan = (s) => {
    setChallanTarget(s);
    setChallanForm({ label: "Monthly Fee", month: todayStr().slice(0, 7), amount: s.monthlyFee ? String(s.monthlyFee) : "" });
  };

  const submitChallan = async (e) => {
    e.preventDefault();
    if (!challanTarget) return;
    const amt = Number(challanForm.amount);
    if (!amt || amt <= 0) { setToast({ message: "Enter a valid challan amount", tone: "error" }); return; }
    if (!challanForm.month) { setToast({ message: "Select the month this challan is for", tone: "error" }); return; }

    setChallanSaving(true);
    try {
      const doc = await studentsApi.addChallan(challanTarget.id, {
        month: challanForm.month,
        label: challanForm.label.trim() || "Monthly Fee",
        amount: amt,
      });
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      if (viewTarget?.id === updated.id) setViewTarget(updated);
      setToast({ message: `Chalan generated for ${updated.name} — ${pkr(amt)} · ${challanForm.month}.`, tone: "success" });
      setChallanTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setChallanSaving(false);
    }
  };

  // Deletes a single payment history entry. The backend re-reconciles
  // challans afterwards, so a challan that was "paid" because of this
  // payment will flip back to "pending" automatically.
  const confirmDeletePayment = async () => {
    if (!deletePaymentTarget) return;
    setDeletingPayment(true);
    try {
      const doc = await studentsApi.removePayment(deletePaymentTarget.student.id, deletePaymentTarget.payment._id);
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      if (viewTarget?.id === updated.id) setViewTarget(updated);
      if (paymentTarget?.id === updated.id) setPaymentTarget(updated);
      setToast({ message: "Payment removed.", tone: "success" });
      setDeletePaymentTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setDeletingPayment(false);
    }
  };

  const openPayments = async (s) => {
    try {
      const full = await fetchStudentDetail(s);
      setPaymentTarget(full);
      const pending = (full.challans || []).filter((c) => c.status !== "paid");
    const first = pending[0];
    setSelectedChallanId(first ? first._id : "");
    setPayAmount(first ? String(remainingForChallan(full, first)) : "");
      setPayNote("");
      setPayDate(todayStr());
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    }
  };

  const onSelectChallan = (challanId) => {
    setSelectedChallanId(challanId);
    const challan = (paymentTarget?.challans || []).find((c) => c._id === challanId);
    setPayAmount(challan ? String(remainingForChallan(paymentTarget, challan)) : "");
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!paymentTarget || !selectedChallanId) { setToast({ message: "Select which challan you're paying.", tone: "error" }); return; }
    const challan = (paymentTarget.challans || []).find((c) => c._id === selectedChallanId);
    const remaining = challan ? remainingForChallan(paymentTarget, challan) : 0;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { setToast({ message: "Enter a valid amount", tone: "error" }); return; }
    if (amt > remaining) { setToast({ message: `Amount can't exceed the pending due of ${pkr(remaining)} for this challan`, tone: "error" }); return; }

    setPaySaving(true);
    try {
      const doc = await studentsApi.addPayment(paymentTarget.id, {
        amount: amt,
        note: payNote,
        date: payDate,
        challanId: selectedChallanId,
      });
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      setPaymentTarget(updated);
      if (viewTarget?.id === updated.id) setViewTarget(updated);

      // Move on to the next pending challan (if any) rather than staying on a now-paid one.
      const stillPending = (updated.challans || []).filter((c) => c.status !== "paid");
      const next = stillPending[0];
      setSelectedChallanId(next ? next._id : "");
      setPayAmount(next ? String(remainingForChallan(updated, next)) : "");
      setPayNote("");
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setPaySaving(false);
    }
  };

  const setStudentActive = (student) => setDeactivateTarget(student);

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const student = deactivateTarget;
    const nextActive = !student.active;

    setDeactivating(true);
    try {
      const doc = await studentsApi.update(student.id, { active: nextActive });
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      if (viewTarget?.id === updated.id) setViewTarget(updated);
      setDeactivateTarget(null);
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setDeactivating(false);
    }
  };

  const openAttendance = async (student) => {
    try {
      const full = await fetchStudentDetail(student);
      setAttendanceTarget(full);
      setAttendanceDate(todayStr());
      setAttendanceStatus("present");
      setAttendanceNote("");
      setAttendanceMethod("manual");
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    }
  };

  // Now actually calls the backend /attendance endpoint instead of writing
  // to localStorage — this is the fix for "manual attendance mark nahi hoti".
  const saveAttendanceRecord = async (e) => {
    e.preventDefault();
    if (!attendanceTarget || !attendanceDate) return;
    setAttendanceSaving(true);
    try {
      const doc = await studentsApi.markAttendance(attendanceTarget.id, {
        date: attendanceDate,
        status: attendanceStatus,
        note: attendanceNote.trim(),
        type: attendanceMethod === "fingerprint" ? "fingerprint" : "manual",
      });
      const updated = normalize(doc);
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? normalizeList(updated) : s)));
      setAttendanceTarget(updated);
      if (viewTarget?.id === updated.id) setViewTarget(updated);
      const niceDate = new Date(attendanceDate).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
      setToast({ message: `Saved — ${updated.name}: ${niceDate} marked ${attendanceStatus}. Now at ${updated.attendance}% overall.`, tone: "success" });
      setAttendanceNote("");
      setAttendanceStatus("present");
    } catch (err) {
      setToast({ message: err.message, tone: "error" });
    } finally {
      setAttendanceSaving(false);
    }
  };

  const printCertificate = (student) => {
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) {
      setToast({ message: "Please allow pop-ups to print the certificate.", tone: "error" });
      return;
    }

    const joined = student.joined
      ? new Date(student.joined).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })
      : "—";

    const attendance = Number(student.attendance || 0);
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));

    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Certificate - ${safe(student.name)}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#eef1f7;font-family:Inter,Arial,sans-serif;color:#182033;padding:28px 18px}
    .page{width:1000px;min-height:700px;margin:30px auto;background:#fff;padding:18px}
    .certificate{min-height:660px;border:8px double #7c3aed;padding:55px 70px;text-align:center;position:relative}
    .brand{font-size:16px;letter-spacing:4px;text-transform:uppercase;color:#7c3aed;font-weight:700}
    h1{font-family:Georgia,serif;font-size:50px;margin:35px 0 8px;color:#182033}
    .subtitle{font-size:18px;color:#697386;margin-bottom:40px}
    .name{font-family:Georgia,serif;font-size:40px;font-weight:700;color:#7c3aed;margin:18px 0;border-bottom:1px solid #ddd;display:inline-block;padding:0 30px 12px}
    .body{font-size:17px;line-height:1.8;max-width:760px;margin:0 auto;color:#4b5563}
    .meta{display:flex;justify-content:center;gap:55px;margin:45px 0 35px}
    .meta div{min-width:150px}
    .label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#8a94a6}
    .value{font-size:15px;font-weight:700;margin-top:6px}
    .sign{margin-top:35px;display:flex;justify-content:space-between;align-items:end}
    .line{width:210px;border-top:1px solid #222;padding-top:8px;font-size:11px;color:#697386}
    .print{position:fixed;top:16px;right:16px;border:0;background:#7c3aed;color:white;padding:11px 18px;border-radius:9px;font-weight:700;cursor:pointer}
    @media print{body{background:#fff}.page{margin:0;width:auto}.print{display:none}}
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">Print Certificate</button>
  <div class="page">
    <div class="certificate">
      <div class="brand">Infusible Coders </div>
      <h1>Certificate of Completion</h1>
      <div class="subtitle">This certificate is proudly presented to</div>
      <div class="name">${safe(student.name)}</div>
      <p class="body">
        For successfully completing the <strong>${safe(student.course || "Training Program")}</strong>
        program at Infusible Coders. The student completed the enrolled program
        with a recorded attendance of <strong>${attendance}%</strong>.
      </p>
      <div class="meta">
        <div><div class="label">Joined</div><div class="value">${safe(joined)}</div></div>
        <div><div class="label">Duration</div><div class="value">${safe(student.duration || "—")}</div></div>
        <div><div class="label">Course</div><div class="value">${safe(student.course || "—")}</div></div>
      </div>
      <div class="sign">
        <div class="line">Authorized Signature</div>
        <div class="line">Infusible Coders </div>
      </div>
    </div>
  </div>
</body>
</html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  // Prints a single fee challan as a bill — same "open a blank tab, write
  // HTML, trigger print" pattern as printCertificate above.
  //
  // FIX: previously always printed challan.amount and a binary PAID/PENDING
  // status, so a PARTIALLY paid challan (e.g. ₨20 paid of ₨23) still printed
  // "₨23 · PENDING" — same bug the on-screen list had. Now it uses
  // remainingForChallan() so the bill shows what's actually still owed, with
  // a proper PARTIAL state and a paid/remaining breakdown.
  const printChallanBill = (student, challan) => {
    const win = window.open("", "_blank", "width=800,height=650");
    if (!win) {
      setToast({ message: "Please allow pop-ups to print the bill.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));

    const remaining = challan.status === "paid" ? 0 : remainingForChallan(student, challan);
    const isPaid = challan.status === "paid";
    const isPartial = !isPaid && remaining < challan.amount;
    const paidSoFar = challan.amount - remaining;

    const statusLabel = isPaid ? "PAID" : isPartial ? "PARTIALLY PAID" : "PENDING";
    const statusBg = isPaid ? "#ccfbf1" : isPartial ? "#fef3c7" : "#fee2e2";
    const statusColor = isPaid ? "#0f766e" : isPartial ? "#92400e" : "#b91c1c";

    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill - ${safe(student.name)}</title>
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
      <tr><td class="lbl">Student</td><td>${safe(student.name)}</td></tr>
      <tr><td class="lbl">Course</td><td>${safe(student.course || "—")}</td></tr>
      <tr><td class="lbl">Phone</td><td>${safe(student.phone || "—")}</td></tr>
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
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  // Prints a single payment as a receipt.
  const printPaymentReceipt = (student, payment) => {
    const win = window.open("", "_blank", "width=800,height=650");
    if (!win) {
      setToast({ message: "Please allow pop-ups to print the receipt.", tone: "error" });
      return;
    }
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const dateStr = new Date(payment.date).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });

    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt - ${safe(student.name)}</title>
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
      <tr><td class="lbl">Student</td><td>${safe(student.name)}</td></tr>
      <tr><td class="lbl">Date Paid</td><td>${safe(dateStr)}</td></tr>
      <tr><td class="lbl">For Month</td><td>${safe(payment.forMonth || "—")}</td></tr>
      <tr><td class="lbl">Note</td><td>${safe(payment.note || "—")}</td></tr>
    </table>
    <div class="amt-label">Amount Paid</div>
    <div class="amt">${pkr(payment.amount)}</div>
  </div>
</body>
</html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const pendingChallansFor = (s) => (s?.challans || []).filter((c) => c.status !== "paid");

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="w-full min-h-screen pb-8" style={{ background: C.bg }}>
  

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Total Students</div>
            <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-2xl">{totalStudentsCount}</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Pending Dues</div>
            <div style={{ ...fontMono, color: C.rose, fontWeight: 700 }} className="text-2xl">{pkr(totalPendingAmount)}</div>
            <div className="text-[10px] mt-1" style={{ color: C.textLow }}>{duePaymentsCount} student{duePaymentsCount !== 1 ? "s" : ""} owing</div>
          </div>
          <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panel }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}>Fees Received</div>
              <div className="flex gap-1">
                {["today", "thisMonth", "lastMonth", "all"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ background: dateFilter === f ? C.gold : C.panelSoft, color: dateFilter === f ? (C.mode === "dark" ? C.ink : "#fff") : C.textLow }}
                  >
                    {f === "today" ? "Today" : f === "thisMonth" ? "This Mo" : f === "lastMonth" ? "Last Mo" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-2xl">{pkr(feesReceived)}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: C.textLow }} />
            <input
              type="text"
              placeholder="Search by name, course, or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-2 rounded-xl pl-10 pr-4 py-2.5 text-sm"
              style={{ borderColor: C.line, color: C.textHi }}
            />
          </div>
          <div className="flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-all sm:w-56" style={{ borderColor: C.line, background: C.panel }}>
            <Filter size={16} style={{ color: C.textLow, flexShrink: 0 }} />
            <CustomSelect
              value={typeFilter}
              onChange={setTypeFilter}
              C={C}
              className="flex-1 min-w-0"
              options={[
                { value: "all", label: "All types" },
                ...COURSE_TYPES.map((t) => ({ value: t.key, label: t.label })),
              ]}
            />
          </div>
          <div className="flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-all sm:w-56" style={{ borderColor: C.line, background: C.panel }}>
            <Layers size={16} style={{ color: C.textLow, flexShrink: 0 }} />
            <CustomSelect
              value={batchFilter}
              onChange={setBatchFilter}
              C={C}
              className="flex-1 min-w-0"
              options={[
                { value: "all", label: "All batches" },
                ...batchOptions.map((b) => ({ value: b, label: b })),
              ]}
            />
          </div>
        </div>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2 mt-3">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-transparent border-2 rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: C.line, color: C.textHi }} />
            <span className="text-xs" style={{ color: C.textLow }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-transparent border-2 rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: C.line, color: C.textHi }} />
          </div>
        )}
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
        {filtered.length === 0 && <div className="text-center py-12" style={{ color: C.textLow }}>No students found.</div>}
        {filtered.map((s) => (
          <div key={s.id} className="rounded-xl border-2 p-4 transition-all hover:shadow-md" style={{ borderColor: C.line, background: C.panel, contentVisibility: "auto", containIntrinsicSize: "96px" }}>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                <div className="p-3 rounded-lg shrink-0" style={{ background: C.goldSoft }}>
                  <div style={{ color: C.gold, fontWeight: 700 }} className="w-8 h-8 flex items-center justify-center text-sm">
                    {initials(s.name)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 style={{ ...fontDisplay, color: C.textHi, fontWeight: 600 }} className="text-base">
                      {s.name}
                    </h3>
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: s.active ? C.tealSoft : C.roseSoft, color: s.active ? C.teal : C.rose }}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                    <TypeBadge type={s.type} />
                    {s.batch && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none" style={{ background: C.panelSoft, color: C.textMid }}>
                        <Layers size={10} /> {s.batch}
                      </span>
                    )}
                    {s.faceEnrolled ? (
                      <ScanFace size={13} style={{ color: C.teal }} title="Face verified" />
                    ) : (
                      <ScanFace size={13} style={{ color: C.textLow, opacity: 0.4 }} title="Face not verified" />
                    )}
                    {s.fingerprintId ? (
                      <Fingerprint size={13} style={{ color: C.teal }} title="Fingerprint enrolled" />
                    ) : (
                      <Fingerprint size={13} style={{ color: C.textLow, opacity: 0.4 }} title="Fingerprint not enrolled" />
                    )}
                  </div>
                  <p className="text-xs mb-2 flex items-center gap-1" style={{ color: C.textLow }}>
                    <Mail size={10} /> {s.email}{s.phone ? ` · ${s.phone}` : ""}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div style={{ color: C.textLow }}>Course</div>
                      <div style={{ ...fontMono, color: C.textHi, fontWeight: 600 }}>{s.course}</div>
                    </div>
                    <div>
                      <div style={{ color: C.textLow }}>Attendance</div>
                      <AttendanceBar value={s.attendance} />
                    </div>
                    <div>
                      <div style={{ color: C.textLow }}>Pending Dues</div>
                      <PendingDuesBadge s={s} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap justify-end gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
                <button onClick={() => openStudentView(s)} title="View" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Eye size={15} />
                </button>
                <button onClick={() => openEdit(s)} title="Edit" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.gold }}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => openAttendance(s)} title="Manual Attendance" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.teal }}>
                  <CalendarCheck size={15} />
                </button>
                <button onClick={() => setStudentActive(s)} title={s.active ? "Deactivate" : "Activate"} className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: s.active ? C.gold : C.teal }}>
                  {s.active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
                <button onClick={() => setDeleteTarget(s)} title="Delete" className="p-2 sm:p-2.5 rounded-lg transition-all hover:scale-110" style={{ background: C.panelSoft, color: C.rose }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-lg rounded-2xl border-2 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-xl">Add Student</div>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg transition-colors" style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <Field label="Full name" C={C}><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. Ayesha Khan" /></Field>
              <Field label="Email" C={C}><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="student@email.com" /></Field>
              <Field label="Phone" C={C}><input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="03xx-xxxxxxx" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Course type" C={C}>
                  <div className="w-full border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line }}>
                    <CustomSelect
                      value={form.type}
                      onChange={(value) => setForm({ ...form, type: value })}
                      C={C}
                      options={COURSE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
                    />
                  </div>
                </Field>
                <Field label="Course name" C={C}><input required value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="Web Dev / App Dev" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Batch" C={C}>
                  <CustomSelect
                    value={form.batch}
                    onChange={(v) => {
                      if (v === "___create___") {
                        setCreateBatchModal(true);
                        setNewBatchName(""); // Always clear on open
                      } else {
                        setForm({ ...form, batch: v });
                      }
                    }}
                    options={[
                      { value: "", label: "Select batch..." },
                      ...batches.map(b => ({ value: b.name, label: b.name })),
                      { value: "___create___", label: "+ Create new batch", className: "font-semibold border-t" }
                    ]}
                    C={C}
                    placeholder="Select or create batch"
                  />
                </Field>
                <Field label="Duration" C={C}><input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="6 months" /></Field>
              </div>
              <Field label="Joining date" C={C}><input required type="date" value={form.joined} onChange={(e) => setForm({ ...form, joined: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Registration fee (₨)" C={C}><input type="number" value={form.regFee} onChange={(e) => setForm({ ...form, regFee: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="3000" /></Field>
                <Field label="Monthly fee (₨)" C={C}><input type="number" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="8000" /></Field>
              </div>
              <Field label="Timing" C={C}><input value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="9 AM – 5 PM · Mon–Fri" /></Field>
              <Field label="Face verification" C={C}>
                <Suspense fallback={<div className="rounded-xl border-2 p-6 text-center text-xs" style={{ borderColor: C.line, color: C.textLow }}>Loading face capture…</div>}>
                  <FaceCapture
                    captured={!!form.faceDescriptor}
                    onCapture={(descriptor, photo) => setForm((f) => ({ ...f, faceDescriptor: descriptor, studentPic: photo }))}
                  />
                </Suspense>
                <div className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: form.faceDescriptor ? C.teal : C.textLow }}>
                  <ScanFace size={11} /> {form.faceDescriptor ? "Face captured — will be used for attendance scan-in" : "Optional now — can be captured later from Edit"}
                </div>
              </Field>
              <Field label="Fingerprint enrollment" C={C}>
                <div className="flex items-center gap-2">
                  <input
                    value={form.fingerprintId}
                    onChange={(e) => setForm({ ...form, fingerprintId: e.target.value })}
                    className="flex-1 bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors"
                    style={{ borderColor: C.line, color: C.textHi, ...fontMono }}
                    placeholder="Scan on device, or tap Generate"
                  />
                  <button type="button" onClick={() => setForm({ ...form, fingerprintId: genFingerprintId() })} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs font-semibold" style={{ background: C.tealSoft, color: C.teal }}>
                    <Fingerprint size={14} /> Generate
                  </button>
                </div>
                <div className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: form.fingerprintId ? C.teal : C.textLow }}>
                  <Fingerprint size={11} /> {form.fingerprintId ? "Fingerprint ID set — will be used for fingerprint attendance" : "Optional now — can be enrolled later from Edit, or typed by a USB fingerprint device"}
                </div>
              </Field>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all hover:bg-opacity-50" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all hover:shadow-lg active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>{saving ? "Saving…" : "Save Student"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-lg rounded-2xl border-2 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style={{ background: C.goldSoft, color: C.gold }}>{initials(viewTarget.name)}</div>
                <div>
                  <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">{viewTarget.name}</div>
                  <div className="text-xs flex items-center gap-2" style={{ color: C.textLow }}>
                    {viewTarget.course}
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none" style={{ background: viewTarget.active ? C.tealSoft : C.roseSoft, color: viewTarget.active ? C.teal : C.rose }}>{viewTarget.active ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setViewTarget(null)} className="p-1 rounded-lg transition-colors" style={{ color: C.textLow }}><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Total Fee</div>
                  <div style={{ ...fontMono, color: C.textHi, fontWeight: 700 }} className="text-sm">{pkr((viewTarget.challans || []).reduce((s, c) => s + c.amount, 0))}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.line }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Paid</div>
                  <div style={{ ...fontMono, color: C.teal, fontWeight: 700 }} className="text-sm">{pkr(totalPaid(viewTarget))}</div>
                </div>
                <div className="rounded-xl border-2 p-3" style={{ borderColor: C.rose, background: getPendingDues(viewTarget) > 0 ? C.roseSoft : "transparent" }}>
                  <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: C.textLow }}>Pending Dues</div>
                  <div style={{ ...fontMono, color: getPendingDues(viewTarget) > 0 ? C.rose : C.teal, fontWeight: 700 }} className="text-sm">{pkr(getPendingDues(viewTarget))}</div>
                </div>
              </div>

              <div className="flex gap-1 overflow-x-auto p-1 rounded-xl" style={{ background: C.panelSoft }}>
                {[
                  { key: "challans", label: "Fee Challans", icon: Receipt },
                  { key: "history", label: "Payment History", icon: History },
                  { key: "payment", label: "Record Payment", icon: Wallet },
                  { key: "attendance", label: "Attendance", icon: CalendarCheck },
                  { key: "certificate", label: "Certificate", icon: Award },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDetailTab(key);
                      if (key === "payment") openPayments(viewTarget);
                    }}
                    className="flex-1 min-w-max flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition-all"
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

              {detailTab === "challans" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Receipt size={13} /> Fee Challans</div>
                    {viewTarget.type !== "free" && (
                      <button onClick={() => openChallan(viewTarget)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold" style={{ background: C.goldSoft, color: C.gold }}>
                        <FilePlus2 size={12} /> Generate Chalan
                      </button>
                    )}
                  </div>
                  {(viewTarget.challans || []).length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No fee challans for this student.</div>}
                  <div className="space-y-2">
                    {[...(viewTarget.challans || [])].sort((a, b) => a.month.localeCompare(b.month)).map((c) => (
                      <div key={c._id} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 gap-2" style={{ borderColor: C.line }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg shrink-0" style={{ background: c.status === "paid" ? C.tealSoft : C.roseSoft }}><Receipt size={14} style={{ color: c.status === "paid" ? C.teal : C.rose }} /></div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: C.textHi }}>{c.label}</div>
                            <div className="text-[11px]" style={{ color: C.textLow }}>{c.month}</div>
                          </div>
                        </div>
                      <div className="flex items-center gap-1.5 shrink-0">
  {(() => {
    const remaining = c.status === "paid" ? 0 : remainingForChallan(viewTarget, c);
    const isPartial = c.status !== "paid" && remaining < c.amount;
    return (
      <>
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
      </>
    );
  })()}
  <button onClick={() => printChallanBill(viewTarget, c)} title="Print Bill" className="p-1.5 rounded-lg" style={{ color: C.gold, background: C.goldSoft }}><Printer size={13} /></button>
  <button onClick={() => setDeleteChallanTarget({ student: viewTarget, challan: c })} title="Delete Challan" className="p-1.5 rounded-lg" style={{ color: C.rose, background: C.roseSoft }}><Trash2 size={13} /></button>
</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "history" && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><History size={13} /> Payment History</div>
                  {viewTarget.paymentHistory.length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No payments recorded yet.</div>}
                  <div className="space-y-2">
                    {[...viewTarget.paymentHistory].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => (
                      <div key={p._id} className="flex items-center justify-between rounded-xl border-2 px-4 py-3 gap-2" style={{ borderColor: C.line }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg shrink-0" style={{ background: C.tealSoft }}><Wallet size={14} style={{ color: C.teal }} /></div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold" style={{ ...fontMono, color: C.textHi }}>{pkr(p.amount)}</div>
                            <div className="text-xs flex items-center gap-1 truncate" style={{ color: C.textLow }}><Clock size={10} className="shrink-0" /> {new Date(p.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}{p.forMonth ? ` · for ${p.forMonth}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => printPaymentReceipt(viewTarget, p)} title="Print Receipt" className="p-1.5 rounded-lg" style={{ color: C.gold, background: C.goldSoft }}><Printer size={13} /></button>
                          <button onClick={() => setDeletePaymentTarget({ student: viewTarget, payment: p })} title="Delete Payment" className="p-1.5 rounded-lg" style={{ color: C.rose, background: C.roseSoft }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "payment" && (
                <div>
                  <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><Wallet size={13} /> Record a Payment</div>

                    {pendingChallansFor(paymentTarget).length === 0 ? (
                      <div className="text-sm py-6 text-center flex flex-col items-center gap-2" style={{ color: C.teal }}>
                        <CheckCircle2 size={22} /> All challans are cleared — nothing pending to pay.
                      </div>
                    ) : (
                      <form onSubmit={submitPayment} className="space-y-4">
                        <Field label="Pay towards" C={C}>
                          <div className="w-full border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line }}>
                            <CustomSelect
                              value={selectedChallanId}
                              onChange={onSelectChallan}
                              C={C}
                              options={pendingChallansFor(paymentTarget).map((c) => ({
                                value: c._id,
                                label: `${c.label} · ${c.month} · remaining ${pkr(remainingForChallan(paymentTarget, c))}`,
                              }))}
                            />
                          </div>
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Amount (₨)" C={C}><input required type="number" min="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="8000" /></Field>
                          <Field label="Date paid" C={C}><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} /></Field>
                        </div>
                        <Field label="Note (optional)" C={C}><input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="e.g. cash, bank transfer" /></Field>
                        <button type="submit" disabled={paySaving} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                          {paySaving ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />} Record Payment
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "attendance" && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: C.textLow }}><CalendarCheck size={13} /> Attendance Records</div>
                  {(viewTarget.attendanceHistory || []).length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.textLow }}>No attendance recorded yet.</div>}
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {[...(viewTarget.attendanceHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r, i) => {
                      const sc = attendanceColor(r.status);
                      return (
                        <div key={i} className="flex items-center justify-between rounded-xl border-2 px-4 py-3" style={{ borderColor: C.line }}>
                          <div className="text-sm" style={{ color: C.textHi }}>{new Date(r.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}{r.note ? ` · ${r.note}` : ""}{r.type === "auto" ? " · auto" : ""}{r.type === "face-scan" ? " · face scan" : ""}{r.type === "fingerprint" ? " · fingerprint" : ""}</div>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-none" style={{ background: sc.soft, color: sc.color }}>{r.status}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailTab === "certificate" && (
                <div className="rounded-2xl border-2 p-6 text-center" style={{ borderColor: C.line, background: C.panelSoft }}>
                  <div className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.goldSoft, color: C.gold }}>
                    <Award size={30} />
                  </div>
                  <div className="text-lg font-bold" style={{ color: C.textHi }}>Certificate</div>
                  <p className="text-sm mt-1 mb-5" style={{ color: C.textMid }}>
                    Generate and print a completion certificate for {viewTarget.name}.
                  </p>
                  <button onClick={() => printCertificate(viewTarget)} className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
                    <Printer size={15} /> Generate & Print Certificate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-lg rounded-2xl border-2 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-xl">Edit Student</div>
              <button onClick={() => setEditTarget(null)} className="p-1 rounded-lg transition-colors" style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <Field label="Face verification" C={C}>
                <Suspense fallback={<div className="rounded-xl border-2 p-6 text-center text-xs" style={{ borderColor: C.line, color: C.textLow }}>Loading face capture…</div>}>
                  <FaceCapture
                    captured={!!editForm.faceDescriptor}
                    onCapture={(descriptor, photo) => setEditForm((f) => ({ ...f, faceDescriptor: descriptor, studentPic: photo }))}
                  />
                </Suspense>
                <div className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: editForm.faceDescriptor ? C.teal : C.rose }}>
                  <ScanFace size={11} /> {editForm.faceDescriptor ? "Face verified — attendance scan will recognize this student" : "Not verified yet — capture a face for scan-in attendance"}
                </div>
              </Field>
              <Field label="Fingerprint enrollment" C={C}>
                <div className="flex items-center gap-2">
                  <input
                    value={editForm.fingerprintId}
                    onChange={(e) => setEditForm({ ...editForm, fingerprintId: e.target.value })}
                    className="flex-1 bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors"
                    style={{ borderColor: C.line, color: C.textHi, ...fontMono }}
                    placeholder="Scan on device, or tap Generate"
                  />
                  <button type="button" onClick={() => setEditForm({ ...editForm, fingerprintId: genFingerprintId() })} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs font-semibold" style={{ background: C.tealSoft, color: C.teal }}>
                    <Fingerprint size={14} /> Generate
                  </button>
                </div>
                <div className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: editForm.fingerprintId ? C.teal : C.rose }}>
                  <Fingerprint size={11} /> {editForm.fingerprintId ? "Fingerprint enrolled — attendance scan will recognize this student" : "Not enrolled yet — required for fingerprint scan-in attendance"}
                </div>
              </Field>
              <Field label="Full name" C={C}><input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <Field label="Email" C={C}><input required type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <Field label="Phone" C={C}><input required type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} placeholder="03xx-xxxxxxx" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Course type" C={C}>
                  <div className="w-full border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line }}>
                    <CustomSelect
                      value={editForm.type}
                      onChange={(value) => setEditForm({ ...editForm, type: value })}
                      C={C}
                      options={COURSE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
                    />
                  </div>
                </Field>
                <Field label="Course name" C={C}><input required value={editForm.course} onChange={(e) => setEditForm({ ...editForm, course: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Batch" C={C}>
                  <CustomSelect
                    value={editForm.batch}
                    onChange={(v) => {
                      if (v === "___create___") {
                        setCreateBatchModal(true);
                        setNewBatchName(""); // Always clear on open
                      } else {
                        setEditForm({ ...editForm, batch: v });
                      }
                    }}
                    options={[
                      { value: "", label: "No batch" },
                      ...batches.map(b => ({ value: b.name, label: b.name })),
                      { value: "___create___", label: "+ Create new batch", className: "font-semibold border-t" }
                    ]}
                    C={C}
                    placeholder="Select or create batch"
                  />
                </Field>
                <Field label="Duration" C={C}><input value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              </div>
              <Field label="Joining date" C={C}><input required type="date" value={editForm.joined} onChange={(e) => setEditForm({ ...editForm, joined: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Registration fee (₨)" C={C}><input type="number" value={editForm.regFee} onChange={(e) => setEditForm({ ...editForm, regFee: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
                <Field label="Monthly fee (₨)" C={C}><input type="number" value={editForm.monthlyFee} onChange={(e) => setEditForm({ ...editForm, monthlyFee: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              </div>
              <Field label="Timing" C={C}><input value={editForm.timing} onChange={(e) => setEditForm({ ...editForm, timing: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm transition-colors" style={{ borderColor: C.line, color: C.textHi }} /></Field>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setEditTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all hover:bg-opacity-50" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={editSaving} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all hover:shadow-lg active:scale-95 disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>{editSaving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {attendanceTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-md rounded-2xl border-2" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2" style={{ borderColor: C.line }}>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-xl">Manual Attendance</div>
                <div className="text-xs mt-1" style={{ color: C.textLow }}>{attendanceTarget.name} · currently {attendanceTarget.attendance}%</div>
              </div>
              <button onClick={() => setAttendanceTarget(null)} className="p-1 rounded-lg" style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={saveAttendanceRecord} className="p-6 space-y-5">
              <Field label="Date" C={C}>
                <input required type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} />
              </Field>
              <Field label="Status" C={C}>
                <div className="grid grid-cols-4 gap-2">
                  {["present", "late", "absent", "leave"].map((status) => {
                    const sc = attendanceColor(status);
                    return (
                      <button key={status} type="button" onClick={() => setAttendanceStatus(status)} className="rounded-xl py-3 text-xs font-semibold capitalize border-2" style={{ borderColor: attendanceStatus === status ? sc.color : C.line, background: attendanceStatus === status ? sc.soft : "transparent", color: attendanceStatus === status ? sc.color : C.textMid }}>{status}</button>
                    );
                  })}
                </div>
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAttendanceTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={attendanceSaving} className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                  {attendanceSaving ? "Saving…" : "Save Attendance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full sm:max-w-lg rounded-2xl border-2 max-h-[92vh] overflow-y-auto" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2 sticky top-0" style={{ borderColor: C.line, background: C.panel }}>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-xl">Leave Calendar</div>
                <div className="text-xs mt-1" style={{ color: C.textLow }}>Weekly off days & holidays auto-mark students as "leave" instead of "absent"</div>
              </div>
              <button onClick={() => setLeaveModalOpen(false)} className="p-1 rounded-lg transition-colors" style={{ color: C.textLow }}><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.panelSoft }}>
                {COURSE_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setLeaveTypeTab(t.key)}
                    className="flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all"
                    style={{
                      background: leaveTypeTab === t.key ? C.panel : "transparent",
                      color: leaveTypeTab === t.key ? C.textHi : C.textLow,
                      boxShadow: leaveTypeTab === t.key ? `0 1px 4px ${C.line}` : "none",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {scheduleLoading ? (
                <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: C.textMid }}>
                  <Loader2 size={14} className="animate-spin" /> Loading schedule…
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Weekly off days</div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEKDAY_LABELS.map((label, day) => {
                        const active = (schedules[leaveTypeTab]?.weeklyOffDays || []).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWeeklyOff(day)}
                            className="rounded-lg py-2.5 text-[11px] font-semibold border-2 transition-colors"
                            style={{ borderColor: active ? C.teal : C.line, background: active ? C.tealSoft : "transparent", color: active ? C.teal : C.textMid }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.textLow }}>Specific holidays</div>
                    <div className="flex gap-2 mb-3">
                      <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="bg-transparent border-2 rounded-xl px-3 py-2.5 text-sm flex-1" style={{ borderColor: C.line, color: C.textHi }} />
                      <input value={newHolidayLabel} onChange={(e) => setNewHolidayLabel(e.target.value)} placeholder="e.g. Eid" className="bg-transparent border-2 rounded-xl px-3 py-2.5 text-sm flex-1" style={{ borderColor: C.line, color: C.textHi }} />
                      <button type="button" onClick={addHoliday} disabled={scheduleSaving} className="rounded-xl px-3 py-2.5 disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                        {scheduleSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {(schedules[leaveTypeTab]?.holidays || []).length === 0 && (
                        <div className="text-xs text-center py-3" style={{ color: C.textLow }}>No holidays added for this type yet.</div>
                      )}
                      {(schedules[leaveTypeTab]?.holidays || []).map((h) => (
                        <div key={h._id} className="flex items-center justify-between rounded-lg border-2 px-3 py-2" style={{ borderColor: C.line }}>
                          <div className="text-xs" style={{ color: C.textHi }}>{h.date} <span style={{ color: C.textLow }}>· {h.label}</span></div>
                          <button onClick={() => removeHoliday(h._id)} disabled={scheduleSaving} className="p-1 rounded disabled:opacity-60" style={{ color: C.rose }}><Trash size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={saveSchedule} disabled={scheduleSaving} className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
                    {scheduleSaving ? "Saving…" : `Save ${COURSE_TYPES.find((t) => t.key === leaveTypeTab)?.label} Schedule`}
                  </button>

                  <div className="rounded-xl border-2 p-4" style={{ borderColor: C.line, background: C.panelSoft }}>
                    <div className="text-xs font-semibold mb-1.5" style={{ color: C.textHi }}>Run auto-attendance for today</div>
                    <p className="text-[11px] mb-3" style={{ color: C.textLow }}>
                      Marks every active student who has no record for today: "leave" if today is a weekly-off/holiday for their type, otherwise "absent". Never touches students who are already marked. Normally this should run automatically once a day (see server cron) — use this button to run it manually or to test.
                    </p>
                    <button onClick={runAutoAttendanceToday} disabled={runningAuto} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60" style={{ background: C.teal, color: "#fff" }}>
                      {runningAuto ? <Loader2 size={14} className="animate-spin" /> : <CalendarOff size={14} />} Run Now
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {challanTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-md rounded-2xl border-2" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center justify-between px-6 py-5 border-b-2" style={{ borderColor: C.line }}>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-xl">Generate Chalan</div>
                <div className="text-xs mt-1" style={{ color: C.textLow }}>{challanTarget.name} · manual fee challan</div>
              </div>
              <button onClick={() => setChallanTarget(null)} className="p-1 rounded-lg" style={{ color: C.textLow }}><X size={20} /></button>
            </div>
            <form onSubmit={submitChallan} className="p-6 space-y-5">
              <Field label="Label" C={C}>
                <input value={challanForm.label} onChange={(e) => setChallanForm({ ...challanForm, label: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="Monthly Fee / Registration Fee / Exam Fee" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Month" C={C}>
                  <input required type="month" value={challanForm.month} onChange={(e) => setChallanForm({ ...challanForm, month: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} />
                </Field>
                <Field label="Amount (₨)" C={C}>
                  <input required type="number" min="1" value={challanForm.amount} onChange={(e) => setChallanForm({ ...challanForm, amount: e.target.value })} className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm" style={{ borderColor: C.line, color: C.textHi }} placeholder="8000" />
                </Field>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setChallanTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
                <button type="submit" disabled={challanSaving} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: C.gold, color: C.mode === "dark" ? C.ink : "#fff" }}>
                  {challanSaving ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />} {challanSaving ? "Generating…" : "Generate Chalan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: deactivateTarget.active ? C.goldSoft : C.tealSoft }}>
                {deactivateTarget.active
                  ? <UserX size={18} style={{ color: C.gold }} />
                  : <UserCheck size={18} style={{ color: C.teal }} />}
              </div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">
                {deactivateTarget.active ? "Deactivate Student?" : "Activate Student?"}
              </div>
            </div>

            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              {deactivateTarget.active
                ? <>Are you sure you want to deactivate <span style={{ color: C.textHi, fontWeight: 600 }}>{deactivateTarget.name}</span>? The student will remain in the system but will be marked inactive.</>
                : <>Are you sure you want to activate <span style={{ color: C.textHi, fontWeight: 600 }}>{deactivateTarget.name}</span> again?</>}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeactivateTarget(null)}
                disabled={deactivating}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all"
                style={{ borderColor: C.line, color: C.textMid }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivate}
                disabled={deactivating}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60"
                style={{ background: deactivateTarget.active ? C.gold : C.teal, color: "#fff" }}
              >
                {deactivating
                  ? (deactivateTarget.active ? "Deactivating…" : "Activating…")
                  : (deactivateTarget.active ? "Deactivate" : "Activate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Student?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>This will permanently remove <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteTarget.name}</span> and their payment/attendance history. This can't be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteChallanTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Challan?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              Delete <span style={{ color: C.textHi, fontWeight: 600 }}>{deleteChallanTarget.challan.label} ({deleteChallanTarget.challan.month})</span> for {deleteChallanTarget.student.name}? This can't be undone. If a payment has already been recorded against this challan, it must be removed first.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteChallanTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDeleteChallan} disabled={deletingChallan} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>{deletingChallan ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {deletePaymentTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg" style={{ background: C.roseSoft }}><AlertTriangle size={18} style={{ color: C.rose }} /></div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">Delete Payment?</div>
            </div>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              Delete this <span style={{ color: C.textHi, fontWeight: 600 }}>{pkr(deletePaymentTarget.payment.amount)}</span> payment for {deletePaymentTarget.student.name}? Its challan will go back to pending. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletePaymentTarget(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all" style={{ borderColor: C.line, color: C.textMid }}>Cancel</button>
              <button onClick={confirmDeletePayment} disabled={deletingPayment} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60" style={{ background: C.rose, color: "#fff" }}>{deletingPayment ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {createBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: C.overlay }}>
          <div className="modal-in w-full max-w-sm rounded-2xl border-2 p-6" style={{ background: C.panel, borderColor: C.line }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg" style={{ background: C.tealSoft }}>
                <Layers size={18} style={{ color: C.teal }} />
              </div>
              <div style={{ ...fontDisplay, fontWeight: 700, color: C.textHi }} className="text-lg">
                Create New Batch
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: C.textMid }}>
              Add a new batch to organize students
            </p>
            <input
              autoFocus
              type="text"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="e.g., Batch 2026-A"
              className="w-full bg-transparent border-2 rounded-xl px-4 py-3 text-sm mb-4 transition-colors"
              style={{ borderColor: C.line, color: C.textHi }}
              onKeyDown={(e) => {
                if (e.key === "Enter") createNewBatch();
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCreateBatchModal(false);
                  setNewBatchName(""); // Clear input on cancel
                }}
                disabled={creatingBatch}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium border-2 transition-all"
                style={{ borderColor: C.line, color: C.textMid }}
              >
                Cancel
              </button>
              <button
                onClick={createNewBatch}
                disabled={creatingBatch || !newBatchName.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60"
                style={{ background: C.teal, color: "#fff" }}
              >
                {creatingBatch ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {creatingBatch ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-[100] max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-toast-in">
          <div
            className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm shadow-2xl"
            style={{
              borderColor: toast.tone === "error" ? C.rose : C.teal,
              color: toast.tone === "error" ? C.rose : C.teal,
              background: C.panel,
            }}
          >
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
