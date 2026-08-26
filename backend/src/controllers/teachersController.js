import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import Batch from "../models/Batch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { audit } from "../utils/audit.js";

const PKT = "Asia/Karachi";
const dayStr = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: PKT }).format(new Date(d));

function recalcAttendancePercent(history = []) {
  const counted = history.filter((h) => h.status !== "leave");
  if (!counted.length) return 0;
  const attended = counted.filter((h) => h.status === "present" || h.status === "late").length;
  return Math.round((attended / counted.length) * 100);
}

function sanitizeTeacher(teacher) {
  const doc = teacher.toObject ? teacher.toObject() : { ...teacher };
  doc.attendancePercent = recalcAttendancePercent(doc.attendanceHistory || []);
  return doc;
}

async function validateBatchIds(batchIds) {
  if (batchIds === undefined) return undefined;
  if (!Array.isArray(batchIds)) throw Object.assign(new Error("batchIds must be an array"), { status: 400 });
  const ids = [...new Set(batchIds.map(String))].filter(Boolean);
  if (!ids.length) return [];
  const found = await Batch.find({ _id: { $in: ids }, active: true }).select("_id");
  if (found.length !== ids.length) throw Object.assign(new Error("One or more selected batches are invalid"), { status: 400 });
  return ids;
}

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

async function checkDuplicateFace(descriptor, excludeId) {
  if (!Array.isArray(descriptor) || !descriptor.length) return null;
  const query = { faceDescriptor: { $exists: true, $ne: [] } };
  if (excludeId) query._id = { $ne: excludeId };
  const candidates = await Teacher.find(query).select("name faceDescriptor");
  return candidates.find((t) => euclideanDistance(descriptor, t.faceDescriptor) < 0.5) || null;
}

// ── Helper Functions ──────────────────────────────────────────────────────

// Recompute salary status: pending if ANY challan is unpaid, paid if all cleared
function recomputeSalaryStatus(teacher) {
  const hasPending = teacher.challans.some((c) => c.status !== "paid");
  teacher.paymentStatus = hasPending ? "due" : teacher.challans.length ? "paid" : "n/a";
}

// Mark each challan paid/pending based ONLY on payments tagged with that challan's _id
function reconcileChallan(teacher) {
  teacher.challans.forEach((c) => {
    const paidForChallan = teacher.paymentHistory
      .filter((p) => p.challanId && String(p.challanId) === String(c._id))
      .reduce((s, p) => s + p.amount, 0);

    if (paidForChallan >= c.amount) {
      c.status = "paid";
      if (!c.paidOn) c.paidOn = new Date();
      c.paidAmount = c.amount;
    } else {
      c.status = "pending";
      c.paidOn = undefined;
      c.paidAmount = paidForChallan;
    }
  });
}

// ── CRUD Operations ──────────────────────────────────────────────────────

// GET /api/teachers
export const list = asyncHandler(async (req, res) => {
  const filter = req.user?.role === "teacher" ? { userId: req.user.id } : {};
  const teachers = await Teacher.find(filter).populate("userId", "name email role").populate("batchIds", "name description").sort({ createdAt: -1 });
  res.json(teachers.map(sanitizeTeacher));
});

// GET /api/teachers/:id
export const getOne = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id).populate("userId", "name email role").populate("batchIds", "name description");
  if (!teacher) return res.status(404).json({ message: "Not found" });
  if (req.user?.role === "teacher" && String(teacher.userId?._id || teacher.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  res.json(sanitizeTeacher(teacher));
});

// POST /api/teachers
export const create = asyncHandler(async (req, res) => {
  const { accountEmail, accountPassword, batchIds, ...teacherData } = req.body;
  if (!teacherData.name?.trim() || !teacherData.specialization?.trim() || teacherData.salary === undefined) {
    return res.status(400).json({ message: "name, specialization and salary are required" });
  }
  teacherData.name = teacherData.name.trim();
  teacherData.specialization = teacherData.specialization.trim();
  teacherData.salary = Number(teacherData.salary);
  if (teacherData.active === undefined) teacherData.active = true;
  if (!teacherData.joiningDate) teacherData.joiningDate = new Date();
  teacherData.attendancePercent = 0;
  teacherData.batchIds = await validateBatchIds(batchIds) ?? [];

  let user = null;
  if (accountEmail || accountPassword) {
    if (!accountEmail || !accountPassword || accountPassword.length < 8) {
      return res.status(400).json({ message: "Teacher account email and password (minimum 6 characters) are required" });
    }
    const normalizedEmail = accountEmail.toLowerCase().trim();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ message: "This email is already registered and cannot be used for another admin or teacher account", field: "email" });
    user = await User.create({ name: teacherData.name, email: normalizedEmail, password: accountPassword, role: "teacher" });
    teacherData.userId = user._id;
  }

  try {
    const teacher = await Teacher.create(teacherData);
    if (user) { user.teacherId = teacher._id; await user.save(); }
    const populated = await Teacher.findById(teacher._id).populate("userId", "name email role").populate("batchIds", "name description");
    await audit(req, "teacher.created", { teacherId: String(teacher._id), linkedAccount: Boolean(user) });
    res.status(201).json(sanitizeTeacher(populated));
  } catch (err) {
    if (user) await User.findByIdAndDelete(user._id).catch(() => {});
    if (err.code === 11000) return res.status(409).json({ message: "Fingerprint ID or another unique teacher credential is already registered" });
    throw err;
  }
});

// PUT /api/teachers/:id
export const update = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Not found" });

  const { accountEmail, accountPassword, batchIds, faceDescriptor, fingerprintId, ...teacherData } = req.body;
  if (teacherData.name !== undefined) teacherData.name = String(teacherData.name).trim();
  if (teacherData.specialization !== undefined) teacherData.specialization = String(teacherData.specialization).trim();
  if (teacherData.salary !== undefined) teacherData.salary = Number(teacherData.salary);
  if (batchIds !== undefined) teacherData.batchIds = await validateBatchIds(batchIds);

  if (Array.isArray(faceDescriptor) && faceDescriptor.length) {
    const duplicate = await checkDuplicateFace(faceDescriptor, teacher._id);
    if (duplicate) return res.status(409).json({ message: `This face is already registered under ${duplicate.name}`, field: "face" });
    teacherData.faceDescriptor = faceDescriptor;
  } else if (faceDescriptor === null || faceDescriptor === "") {
    teacherData.faceDescriptor = undefined;
  }
  if (fingerprintId !== undefined) teacherData.fingerprintId = String(fingerprintId || "").trim() || undefined;

  if (teacher.userId && (accountEmail !== undefined || accountPassword)) {
    const user = await User.findById(teacher.userId).select("+password");
    if (!user) return res.status(400).json({ message: "Linked teacher login account no longer exists" });
    if (accountEmail !== undefined) {
      const normalizedEmail = String(accountEmail || "").toLowerCase().trim();
      if (!normalizedEmail) return res.status(400).json({ message: "Login email cannot be empty" });
      const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (duplicate) return res.status(409).json({ message: "This email is already registered and cannot be reused", field: "email" });
      user.email = normalizedEmail;
    }
    if (accountPassword) {
      if (accountPassword.length < 8 || accountPassword.length > 128) return res.status(400).json({ message: "Password must be 8-128 characters" });
      user.password = accountPassword;
      user.sessionVersion = (user.sessionVersion || 0) + 1;
    }
    if (teacherData.name) user.name = teacherData.name;
    await user.save();
  } else if ((accountEmail || accountPassword) && !teacher.userId) {
    if (!accountEmail || !accountPassword || accountPassword.length < 8) return res.status(400).json({ message: "Login email and password (minimum 6 characters) are required" });
    const normalizedEmail = accountEmail.toLowerCase().trim();
    const duplicate = await User.findOne({ email: normalizedEmail });
    if (duplicate) return res.status(409).json({ message: "This email is already registered and cannot be reused", field: "email" });
    const user = await User.create({ name: teacherData.name || teacher.name, email: normalizedEmail, password: accountPassword, role: "teacher", teacherId: teacher._id });
    teacherData.userId = user._id;
  }

  Object.assign(teacher, teacherData);
  teacher.attendancePercent = recalcAttendancePercent(teacher.attendanceHistory);
  await teacher.save();
  const populated = await Teacher.findById(teacher._id).populate("userId", "name email role").populate("batchIds", "name description");
  await audit(req, "teacher.updated", { teacherId: String(teacher._id), accountChanged: Boolean(accountEmail !== undefined || accountPassword) });
  res.json(sanitizeTeacher(populated));
});

// DELETE /api/teachers/:id
export const remove = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findByIdAndDelete(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Not found" });
  if (teacher.userId) await User.findByIdAndDelete(teacher.userId);
  res.json({ message: "Deleted", id: req.params.id });
});

export const getMe = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user.id }).populate("userId", "name email role").populate("batchIds", "name description");
  if (!teacher) return res.status(404).json({ message: "Teacher profile not linked to this account" });
  res.json(sanitizeTeacher(teacher));
});

export const getMeAttendance = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user.id });
  if (!teacher) return res.status(404).json({ message: "Teacher profile not linked to this account" });
  res.json({ attendanceHistory: teacher.attendanceHistory, attendancePercent: recalcAttendancePercent(teacher.attendanceHistory), leaveHistory: teacher.leaveHistory });
});

export const markMeAttendance = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user.id });
  if (!teacher) return res.status(404).json({ message: "Teacher profile not linked to this account" });
  const { date, status, note, type } = req.body;
  if (!date || !status) return res.status(400).json({ message: "date and status are required" });
  if (!["present", "late", "absent", "leave"].includes(status)) return res.status(400).json({ message: "Invalid attendance status" });
  if (teacher.attendanceHistory.some((r) => dayStr(r.date) === dayStr(date))) return res.status(409).json({ message: "Attendance already marked for this date" });
  teacher.attendanceHistory.push({ date: new Date(`${date}T00:00:00+05:00`), status, note: note || "", type: type || "manual" });
  teacher.attendancePercent = recalcAttendancePercent(teacher.attendanceHistory);
  await teacher.save();
  res.json(sanitizeTeacher(teacher));
});

// ── Salary Challan Management ────────────────────────────────────────────

// POST /api/teachers/:id/challans
// Manually generate a salary challan for a specific month
export const generateSalaryChallan = asyncHandler(async (req, res) => {
  const { month, amount, label } = req.body;

  if (!month || !amount) {
    return res.status(400).json({ message: "month and amount are required" });
  }

  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  // Check if challan already exists for this month
  const already = teacher.challans.some((c) => c.month === month && c.label === (label || "Salary"));
  if (already) {
    return res.status(409).json({ message: `Salary challan already exists for ${month}` });
  }

  teacher.challans.push({
    month,
    label: label || "Salary",
    amount: Number(amount),
    status: "pending",
  });

  recomputeSalaryStatus(teacher);
  await teacher.save();
  res.status(201).json(teacher);
});

// DELETE /api/teachers/:id/challans/:challanId
// Remove a salary challan (blocked if any payment exists against it)
export const removeChallan = asyncHandler(async (req, res) => {
  const { id, challanId } = req.params;
  const teacher = await Teacher.findById(id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  const challan = teacher.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  // Check if any payment exists for this challan
  const hasPayments = teacher.paymentHistory.some(
    (p) => p.challanId && String(p.challanId) === String(challanId)
  );

  if (hasPayments) {
    return res.status(400).json({
      message: "Cannot delete challan with payments. Remove payments first.",
    });
  }

  teacher.challans.pull(challanId);
  recomputeSalaryStatus(teacher);
  await teacher.save();
  res.json(teacher);
});

// ── Payment Management ──────────────────────────────────────────────────

// POST /api/teachers/:id/payments
// Record a salary payment against a specific challan
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, note, date, challanId } = req.body;
  const amt = Number(amount);

  if (!amt || amt <= 0) {
    return res.status(400).json({ message: "A valid payment amount is required" });
  }

  if (!challanId) {
    return res.status(400).json({ message: "Select which challan this payment is for" });
  }

  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  const challan = teacher.challans.id(challanId);
  if (!challan) return res.status(404).json({ message: "Challan not found" });

  if (challan.status === "paid") {
    return res.status(400).json({ message: "This challan is already fully paid" });
  }

  // Calculate how much is already paid for this specific challan
  const alreadyPaid = teacher.paymentHistory
    .filter((p) => p.challanId && String(p.challanId) === String(challanId))
    .reduce((s, p) => s + p.amount, 0);

  const remaining = challan.amount - alreadyPaid;

  // Cap payment to remaining balance
  if (amt > remaining) {
    return res.status(400).json({
      message: `Amount exceeds the pending balance of ₨${remaining} for this challan`,
    });
  }

  teacher.paymentHistory.push({
    amount: amt,
    date: date ? new Date(date) : new Date(),
    note: note || "",
    forMonth: challan.month,
    challanId: challan._id,
  });

  reconcileChallan(teacher);
  recomputeSalaryStatus(teacher);

  await teacher.save();
  res.status(201).json(teacher);
});

// DELETE /api/teachers/:id/payments/:paymentId
// Remove a single payment entry, then re-reconcile challans
export const removePayment = asyncHandler(async (req, res) => {
  const { id, paymentId } = req.params;
  const teacher = await Teacher.findById(id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  teacher.paymentHistory = teacher.paymentHistory.filter((p) => String(p._id) !== paymentId);

  reconcileChallan(teacher);
  recomputeSalaryStatus(teacher);

  await teacher.save();
  res.json(teacher);
});

// ── Leave Management ────────────────────────────────────────────────────────

// POST /api/teachers/:id/leave
// Add leave entry for teacher
export const addLeave = asyncHandler(async (req, res) => {
  const { fromDate, toDate, reason } = req.body;
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  if (!fromDate || !toDate) {
    return res.status(400).json({ message: "fromDate and toDate are required" });
  }

  teacher.leaveHistory.push({
    fromDate: new Date(fromDate),
    toDate: new Date(toDate),
    reason: reason || "Leave",
  });

  await teacher.save();
  res.status(201).json(teacher);
});

// DELETE /api/teachers/:id/leave/:leaveId
// Remove leave entry for teacher
export const removeLeave = asyncHandler(async (req, res) => {
  const { id, leaveId } = req.params;
  const teacher = await Teacher.findById(id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  teacher.leaveHistory = teacher.leaveHistory.filter(
    (l) => String(l._id) !== leaveId
  );

  await teacher.save();
  res.json(teacher);
});

// GET /api/teachers/:id/attendance
export const getAttendanceHistory = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });
  if (req.user?.role === "teacher" && String(teacher.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  res.json({ attendanceHistory: teacher.attendanceHistory, attendancePercent: recalcAttendancePercent(teacher.attendanceHistory) });
});

// POST /api/teachers/:id/attendance/manual
export const markManualAttendance = asyncHandler(async (req, res) => {
  const { date, status, note } = req.body;
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });
  if (!date || !status) return res.status(400).json({ message: "date and status are required" });
  if (!["present", "late", "absent", "leave"].includes(status)) return res.status(400).json({ message: "Invalid attendance status" });
  if (req.user?.role === "teacher" && String(teacher.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });

  const targetDay = dayStr(date);
  const existing = teacher.attendanceHistory.find((h) => dayStr(h.date) === targetDay);
  if (existing) return res.status(409).json({ message: `${teacher.name} is already marked for ${targetDay} as ${existing.status}.` });

  teacher.attendanceHistory.push({ date: new Date(`${date}T00:00:00+05:00`), status, note: note || "", type: "manual" });
  teacher.attendancePercent = recalcAttendancePercent(teacher.attendanceHistory);
  await teacher.save();
  res.json(sanitizeTeacher(teacher));
});

