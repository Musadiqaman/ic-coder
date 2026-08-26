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
  const filter = ["today", "thisMonth", "lastMonth", "all", "custom"].includes(req.query.filter)
    ? req.query.filter
    : "thisMonth";
  const range = resolveRange(filter, req.query.startDate, req.query.endDate);
  const nowParts = pktDateParts();

  // The dashboard used to download every payment-history entry from every
  // collection and then calculate totals in Node. That gets progressively
  // slower as the database grows and also transfers a lot of data over the
  // network. MongoDB can aggregate the same sums close to the data.
  const months = Array.from({ length: 6 }).map((_, i) => {
    const parts = shiftMonth(nowParts, 5 - i);
    const label = new Date(parts.y, parts.m, 1).toLocaleString("en-US", { month: "short" });
    const start = pktMidnightUTC(parts.y, parts.m, 1);
    const end = pktMidnightUTC(parts.y, parts.m + 1, 1);
    return { key: monthKey(parts), label, range: { start, end } };
  });

  const historyStart = months[0].range.start;
  const historyEnd = months[months.length - 1].range.end;

  const paymentFacet = (field = "paymentHistory") => {
    const selectedDate = `${field}.date`;
    return {
      selected: [
        { $unwind: `$${field}` },
        ...(range.start || range.end
          ? [{ $match: { [selectedDate]: {
              ...(range.start ? { $gte: range.start } : {}),
              ...(range.end ? { $lt: range.end } : {}),
            } } }]
          : []),
        { $group: { _id: null, total: { $sum: `$${field}.amount` } } },
      ],
      monthly: [
        { $unwind: `$${field}` },
        { $match: { [selectedDate]: { $gte: historyStart, $lt: historyEnd } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: `$${field}.date`,
                timezone: "Asia/Karachi",
              },
            },
            total: { $sum: `$${field}.amount` },
          },
        },
      ],
    };
  };

  const expenseFacet = {
    selected: [
      ...(range.start || range.end
        ? [{ $match: {
            date: {
              ...(range.start ? { $gte: range.start } : {}),
              ...(range.end ? { $lt: range.end } : {}),
            },
          } }]
        : []),
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ],
    monthly: [
      { $match: { date: { $gte: historyStart, $lt: historyEnd } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$date",
              timezone: "Asia/Karachi",
            },
          },
          total: { $sum: "$amount" },
        },
      },
    ],
  };

  const loanFacet = {
    selectedTaken: [
      { $set: { _loanTakenAt: { $ifNull: ["$takenDate", "$createdAt"] } } },
      ...(range.start || range.end
        ? [{ $match: { _loanTakenAt: {
            ...(range.start ? { $gte: range.start } : {}),
            ...(range.end ? { $lt: range.end } : {}),
          } } }]
        : []),
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ],
    monthlyTaken: [
      { $set: { _loanTakenAt: { $ifNull: ["$takenDate", "$createdAt"] } } },
      { $match: { _loanTakenAt: { $gte: historyStart, $lt: historyEnd } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$_loanTakenAt",
              timezone: "Asia/Karachi",
            },
          },
          total: { $sum: "$amount" },
        },
      },
    ],
    selectedReturns: paymentFacet("paymentHistory").selected,
    monthlyReturns: paymentFacet("paymentHistory").monthly,
  };

  const [studentAgg, employeeAgg, teacherAgg, expenseAgg, projectAgg, loanAgg] = await Promise.all([
    Student.aggregate([
      {
        $facet: {
          ...paymentFacet("paymentHistory"),
          mix: [
            { $group: { _id: "$courseType", value: { $sum: 1 } } },
          ],
          batch: [
            { $match: { active: true } },
            {
              $group: {
                _id: {
                  $cond: [
                    { $or: [{ $eq: ["$batch", null] }, { $eq: ["$batch", ""] }] },
                    "Unassigned",
                    "$batch",
                  ],
                },
                value: { $sum: 1 },
                paid: { $sum: { $cond: [{ $eq: ["$courseType", "paid"] }, 1, 0] } },
                free: { $sum: { $cond: [{ $eq: ["$courseType", "free"] }, 1, 0] } },
                workspace: { $sum: { $cond: [{ $eq: ["$courseType", "workspace"] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]),
    Employee.aggregate([{ $facet: paymentFacet("paymentHistory") }]),
    Teacher.aggregate([{ $facet: paymentFacet("paymentHistory") }]),
    Expense.aggregate([{ $facet: expenseFacet }]),
    Project.aggregate([{ $facet: paymentFacet("paymentHistory") }]),
    Loan.aggregate([{ $facet: loanFacet }]),
  ]);

  const unwrap = (result) => result?.[0] || {};
  const totalOf = (rows) => Number(rows?.[0]?.total || 0);
  const monthlyMap = (rows) => Object.fromEntries(
    (rows || []).map((row) => [row._id, Number(row.total || 0)])
  );

  const students = unwrap(studentAgg);
  const employees = unwrap(employeeAgg);
  const teachers = unwrap(teacherAgg);
  const expenses = unwrap(expenseAgg);
  const projects = unwrap(projectAgg);
  const loans = unwrap(loanAgg);

  const selected = {
    projectsPaid: totalOf(projects.selected),
    studentsPaid: totalOf(students.selected),
    loansTaken: totalOf(loans.selectedTaken),
    employeeSalaryPaid: totalOf(employees.selected),
    teacherSalaryPaid: totalOf(teachers.selected),
    expensesPaid: totalOf(expenses.selected),
    loanReturn: totalOf(loans.selectedReturns),
  };

  const totalIn = selected.projectsPaid + selected.studentsPaid + selected.loansTaken;
  const totalOut = selected.employeeSalaryPaid + selected.teacherSalaryPaid + selected.expensesPaid + selected.loanReturn;

  const studentMonthly = monthlyMap(students.monthly);
  const projectMonthly = monthlyMap(projects.monthly);
  const employeeMonthly = monthlyMap(employees.monthly);
  const teacherMonthly = monthlyMap(teachers.monthly);
  const expenseMonthly = monthlyMap(expenses.monthly);
  const loanTakenMonthly = monthlyMap(loans.monthlyTaken);
  const loanReturnMonthly = monthlyMap(loans.monthlyReturns);

  const cashFlow = months.map(({ key, label }) => ({
    m: label,
    in: (projectMonthly[key] || 0) + (studentMonthly[key] || 0) + (loanTakenMonthly[key] || 0),
    out: (employeeMonthly[key] || 0) + (teacherMonthly[key] || 0) + (expenseMonthly[key] || 0) + (loanReturnMonthly[key] || 0),
  }));

  const mixCounts = Object.fromEntries((students.mix || []).map((row) => [row._id, Number(row.value || 0)]));
  const studentMix = [
    { name: "Paid Internship", value: mixCounts.paid || 0 },
    { name: "Workspace", value: mixCounts.workspace || 0 },
    { name: "Free Internship", value: mixCounts.free || 0 },
  ];

  const batchMix = (students.batch || [])
    .map((row) => ({
      name: row._id,
      value: Number(row.value || 0),
      paid: Number(row.paid || 0),
      free: Number(row.free || 0),
      workspace: Number(row.workspace || 0),
    }))
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
    cashInHand: totalIn - totalOut,
    inOutBreakdown: {
      in: {
        projectsPaid: selected.projectsPaid,
        studentsPaid: selected.studentsPaid,
        loansTaken: selected.loansTaken,
        total: totalIn,
      },
      out: {
        employeeSalaryPaid: selected.employeeSalaryPaid,
        teacherSalaryPaid: selected.teacherSalaryPaid,
        expensesPaid: selected.expensesPaid,
        loanReturn: selected.loanReturn,
        total: totalOut,
      },
      totalIn,
      totalOut,
    },
    cashFlow,
    studentMix,
    batchMix,
  });
});
