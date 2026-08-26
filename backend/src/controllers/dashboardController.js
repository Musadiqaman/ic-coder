import Student from "../models/Student.js";
import Employee from "../models/Employee.js";
import Teacher from "../models/Teacher.js";
import Expense from "../models/Expense.js";
import Project from "../models/Project.js";
import Loan from "../models/Loan.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// PKT (UTC+5, no DST) helpers — see studentsController.js for the same
// reasoning. Reading .getFullYear()/.getMonth() straight off a Date reflects
// the SERVER MACHINE's own timezone (often UTC on cloud hosts), not
// Pakistan's — so both sides of any "same period" comparison must be
// normalized into PKT the same way, not just "now".
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

// Read the PKT wall-clock y/m/d for a given date (defaults to now).
function pktDateParts(dateInput = new Date()) {
  const shifted = new Date(new Date(dateInput).getTime() + PKT_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() }; // m: 0-11
}

// Build the UTC instant that corresponds to a PKT wall-clock y/m/d 00:00:00.
// JS Date.UTC happily rolls over d = 0 / d = 32 / m = -1 / m = 12 etc, so
// callers can pass "next day" / "next month" without extra math.
function pktMidnightUTC(y, m, d) {
  return new Date(Date.UTC(y, m, d) - PKT_OFFSET_MS);
}

const monthKey = ({ y, m }) => `${y}-${String(m + 1).padStart(2, "0")}`;
// Shift {y, m} back by `back` months (handles year rollover).
const shiftMonth = ({ y, m }, back) => {
  const total = y * 12 + m - back;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
};

// Parse a "YYYY-MM-DD" query param (interpreted as a PKT calendar date)
// into {y, m, d}. Returns null if missing/invalid.
function parseYMD(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split("-").map(Number);
  return { y, m: m - 1, d };
}

// Turn a `filter` query value into a { start, end } range of UTC instants
// (end is exclusive). Returns { start: null, end: null } for "all" (no
// bound, i.e. everything).
function resolveRange(filter, startDateStr, endDateStr) {
  const nowParts = pktDateParts();

  switch (filter) {
    case "today": {
      const start = pktMidnightUTC(nowParts.y, nowParts.m, nowParts.d);
      const end = pktMidnightUTC(nowParts.y, nowParts.m, nowParts.d + 1);
      return { start, end };
    }
    case "lastMonth": {
      const parts = shiftMonth(nowParts, 1);
      const start = pktMidnightUTC(parts.y, parts.m, 1);
      const end = pktMidnightUTC(parts.y, parts.m + 1, 1);
      return { start, end };
    }
    case "custom": {
      const s = parseYMD(startDateStr);
      const e = parseYMD(endDateStr);
      if (!s || !e) {
        // Incomplete custom range — fall back to "all" rather than
        // silently returning zeroed data.
        return { start: null, end: null };
      }
      const start = pktMidnightUTC(s.y, s.m, s.d);
      const end = pktMidnightUTC(e.y, e.m, e.d + 1); // inclusive of the end day
      return { start, end };
    }
    case "all":
      return { start: null, end: null };
    case "thisMonth":
    default: {
      const start = pktMidnightUTC(nowParts.y, nowParts.m, 1);
      const end = pktMidnightUTC(nowParts.y, nowParts.m + 1, 1);
      return { start, end };
    }
  }
}

const inRange = (date, range) => {
  if (!range || (!range.start && !range.end)) return true;
  const t = new Date(date).getTime();
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t >= range.end.getTime()) return false;
  return true;
};

// Sums up the in/out breakdown for the given range. Pass range = null (or
// {start:null,end:null}) for the all-time total.
function computeInOut({ students, employees, teachers, expenses, projects, loans }, range) {
  const sumPH = (arr) => (arr || []).filter((p) => inRange(p.date, range)).reduce((s, p) => s + p.amount, 0);

  const projectsPaid = projects.reduce((sum, p) => sum + sumPH(p.paymentHistory), 0);
  const studentsPaid = students.reduce((sum, s) => sum + sumPH(s.paymentHistory), 0);
  const loansTaken = loans
    .filter((l) => inRange(l.takenDate || l.createdAt, range))
    .reduce((sum, l) => sum + l.amount, 0);

  const employeeSalaryPaid = employees.reduce((sum, e) => sum + sumPH(e.paymentHistory), 0);
  const teacherSalaryPaid = teachers.reduce((sum, t) => sum + sumPH(t.paymentHistory), 0);
  const expensesPaid = expenses
    .filter((ex) => inRange(ex.date, range))
    .reduce((sum, ex) => sum + ex.amount, 0);
  const loanReturn = loans.reduce((sum, l) => sum + sumPH(l.paymentHistory), 0);

  const totalIn = projectsPaid + studentsPaid + loansTaken;
  const totalOut = employeeSalaryPaid + teacherSalaryPaid + expensesPaid + loanReturn;

  return {
    in: { projectsPaid, studentsPaid, loansTaken, total: totalIn },
    out: { employeeSalaryPaid, teacherSalaryPaid, expensesPaid, loanReturn, total: totalOut },
    totalIn,
    totalOut,
  };
}

export const summary = asyncHandler(async (req, res) => {
  // .select() + .lean(): this endpoint only ever reads a handful of fields
  // per collection and never mutates/saves these docs, so there's no need
  // to pay for full documents or Mongoose's document-wrapper overhead
  // (getters/setters/change-tracking) on every request. On collections with
  // a lot of students/employees this alone cuts response time noticeably,
  // especially since it also shrinks how much JSON has to cross the wire
  // from MongoDB before we even start crunching numbers.
  const [students, employees, teachers, expenses, projects, loans] = await Promise.all([
    Student.find().select("courseType batch active paymentHistory.amount paymentHistory.date").lean(),
    Employee.find().select("paymentHistory.amount paymentHistory.date").lean(),
    Teacher.find().select("paymentHistory.amount paymentHistory.date").lean(),
    Expense.find().select("amount date").lean(),
    Project.find().select("paymentHistory.amount paymentHistory.date").lean(),
    Loan.find().select("amount createdAt takenDate paymentHistory.amount paymentHistory.date").lean(),
  ]);

  const data = { students, employees, teachers, expenses, projects, loans };
  const nowParts = pktDateParts();

  // ---- Selected filter (defaults to "thisMonth") drives both the Cash In /
  // Cash Out breakdown AND Cash in Hand below. ----
  const filter = ["today", "thisMonth", "lastMonth", "all", "custom"].includes(req.query.filter)
    ? req.query.filter
    : "thisMonth";
  const range = resolveRange(filter, req.query.startDate, req.query.endDate);

  const filteredInOut = computeInOut(data, range);
  const cashInHand = filteredInOut.totalIn - filteredInOut.totalOut;

  // ---- Last 6 months cash flow series (unaffected by the filter) ----
  const months = Array.from({ length: 6 }).map((_, i) => {
    const parts = shiftMonth(nowParts, 5 - i);
    const label = new Date(parts.y, parts.m, 1).toLocaleString("en-US", { month: "short" });
    const start = pktMidnightUTC(parts.y, parts.m, 1);
    const end = pktMidnightUTC(parts.y, parts.m + 1, 1);
    return { key: monthKey(parts), label, range: { start, end } };
  });
  const cashFlow = months.map(({ label, range: r }) => {
    const io = computeInOut(data, r);
    return { m: label, in: io.totalIn, out: io.totalOut };
  });

  // ---- Student mix ----
  const mixOf = (key) => students.filter((s) => s.courseType === key).length;
  const studentMix = [
    { name: "Paid Internship", value: mixOf("paid") },
    { name: "Workspace", value: mixOf("workspace") },
    { name: "Free Internship", value: mixOf("free") },
  ];

  // ---- Batch mix (active students grouped by batch) ----
  // Students with no batch assigned yet are grouped under "Unassigned" so
  // the total still adds up to activeStudentsCount, but they're sorted last
  // since they're not a real batch. Sorted by size (largest first) — the
  // Dashboard bar chart reads top-to-bottom/left-to-right most-populated first.
  const batchCounts = {};
  for (const s of students) {
    if (!s.active) continue;
    const name = (s.batch || "").trim() || "Unassigned";
    if (!batchCounts[name]) batchCounts[name] = { value: 0, paid: 0, free: 0, workspace: 0 };
    batchCounts[name].value += 1;
    if (s.courseType === "paid") batchCounts[name].paid += 1;
    else if (s.courseType === "free") batchCounts[name].free += 1;
    else if (s.courseType === "workspace") batchCounts[name].workspace += 1;
  }
  const batchMix = Object.entries(batchCounts)
    .map(([name, mix]) => ({ name, ...mix }))
    .sort((a, b) => {
      if (a.name === "Unassigned") return 1;
      if (b.name === "Unassigned") return -1;
      return b.value - a.value;
    });

  res.json({
    filter: {
      type: filter,
      startDate: range.start ? range.start.toISOString() : null,
      endDate: range.end ? range.end.toISOString() : null,
    },
    cashInHand,
    inOutBreakdown: filteredInOut,
    cashFlow,
    studentMix,
    batchMix,
  });
});